# Modal embedding service for FitAI
# Production-grade embedding service running on Modal with GPU acceleration

import os
import modal
from typing import List, Dict, Any
from fastapi import FastAPI
from pydantic import BaseModel

# Modal image with sentence-transformers
image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "sentence-transformers>=2.7.0",
        "torch>=2.1.0",
        "transformers>=4.44.2",
        "numpy>=1.24.0",
        "hf_transfer",
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        "PYTHONUNBUFFERED": "1",
    })
)

app = modal.App("fitai-embed")

# Global model cache (loaded once per container)
_model = None
_model_name = os.getenv("EMBEDDING_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2")


def get_model():
    """Load model once per container (Modal caches this)."""
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        # Modal provides GPU, use cuda
        _model = SentenceTransformer(_model_name, device="cuda")
    return _model


@app.function(
    image=image,
    gpu="T4",  # Use T4 GPU for faster embeddings (cheaper than A10G)
    timeout=300,  # 5 minute timeout
    scaledown_window=60,  # Scale to zero after 60s (Modal 1.0+ syntax)
)
@modal.asgi_app()
def serve():
    """FastAPI app for embedding service.
    
    Modal automatically caches the model in the container,
    so get_model() will only load it once per container lifecycle.
    """
    fastapi_app = FastAPI(title="FitAI Embed Service", version="1.0.0")

    class EmbedRequest(BaseModel):
        texts: List[str]

    class EmbedResponse(BaseModel):
        embeddings: List[List[float]]

    @fastapi_app.get("/health")
    async def health() -> Dict[str, Any]:
        """Health check endpoint - doesn't load model, just checks service is ready."""
        # Don't load model on health check (lazy load on first /embed request)
        # This prevents timeout errors and makes health checks fast
        return {"ok": True, "model": _model_name, "status": "ready"}

    @fastapi_app.post("/embed", response_model=EmbedResponse)
    async def embed(req: EmbedRequest) -> EmbedResponse:
        """Generate embeddings for input texts."""
        if not req.texts:
            return EmbedResponse(embeddings=[])
        
        # Get model (cached in container by Modal)
        model = get_model()
        # Batch encode with normalization (matching DB schema)
        vecs = model.encode(
            req.texts,
            batch_size=64,
            show_progress_bar=False,
            normalize_embeddings=True,
            convert_to_numpy=True,
        )
        return EmbedResponse(embeddings=[v.tolist() for v in vecs])

    return fastapi_app
