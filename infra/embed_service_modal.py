# Minimal Modal-compatible embed service stub (OpenAI-style response)
from __future__ import annotations

from typing import List, Dict, Any
from fastapi import FastAPI
from pydantic import BaseModel

# In Modal, load model once globally
try:
    from sentence_transformers import SentenceTransformer
    _model = SentenceTransformer("sentence-transformers/all-mpnet-base-v2")
except Exception:
    _model = None

app = FastAPI(title="Embed Service", version="1.0.0")


class EmbedRequest(BaseModel):
    texts: List[str]


class EmbedResponse(BaseModel):
    embeddings: List[List[float]]


@app.get("/embed_health")
async def embed_health() -> Dict[str, Any]:
    return {"ok": _model is not None, "model": "all-mpnet-base-v2"}


@app.post("/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest) -> EmbedResponse:
    if _model is None:
        raise RuntimeError("Embedding model not initialized")
    vecs = _model.encode(req.texts, batch_size=64, show_progress_bar=False, normalize_embeddings=True)
    return EmbedResponse(embeddings=[v.tolist() for v in vecs])
