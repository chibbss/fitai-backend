# modal_reranker.py - Cross-encoder reranking service on Modal
from __future__ import annotations

import modal
from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

# Minimal image with sentence-transformers
image = (
    modal.Image.debian_slim()
    .pip_install(
        "fastapi==0.117.1",
        "uvicorn==0.36.0",
        "sentence-transformers==2.7.0",
        "pydantic==2.11.9",
    )
)

app = modal.App("fitai-reranker")


class RerankRequest(BaseModel):
    query: str
    passages: List[str]
    top_k: Optional[int] = 5


def _load_model():
    from sentence_transformers.cross_encoder import CrossEncoder
    model_name = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    return CrossEncoder(model_name)


@app.function(image=image, timeout=600)
@modal.asgi_app()
def serve():
    ce = _load_model()
    app = FastAPI()

    @app.get("/health")
    def health():
        return {"status": "ok"}

    class RerankResponse(BaseModel):
        scores: List[float]

    @app.post("/rerank", response_model=RerankResponse)
    def rerank(body: RerankRequest) -> RerankResponse:
        pairs = [(body.query, p) for p in body.passages]
        scores = ce.predict(pairs, batch_size=64, show_progress_bar=False)
        # If top_k provided, still return scores aligned with inputs; client can slice
        return RerankResponse(scores=[float(s) for s in scores])

    return app
