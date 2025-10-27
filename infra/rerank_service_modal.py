from __future__ import annotations

import os
from typing import List, Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

try:
    from sentence_transformers import CrossEncoder  # type: ignore
except Exception:  # pragma: no cover
    CrossEncoder = None  # type: ignore


app = FastAPI(title="Rerank Service", version="1.0.0")

_model: Optional[object] = None
_model_name_default = os.getenv("RERANKER_MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L-6-v2")


def _ensure_model(model_name: Optional[str]) -> object:
    global _model
    name = model_name or _model_name_default
    if _model is None or getattr(_model, "model_name", None) != name:
        if CrossEncoder is None:
            raise RuntimeError("sentence-transformers CrossEncoder is not available")
        # On GPU-enabled envs, set device to cuda:0 implicitly if available; otherwise CPU
        device = 0 if os.getenv("DEVICE", "auto").lower() == "cuda" else "cpu"
        _model = CrossEncoder(name, device=device)  # type: ignore
        setattr(_model, "model_name", name)
    return _model


class RerankRequest(BaseModel):
    query: str
    texts: List[str]
    model: Optional[str] = None


class RerankResponse(BaseModel):
    scores: List[float]
    model: str


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/rerank", response_model=RerankResponse)
def rerank(req: RerankRequest) -> RerankResponse:
    if not req.texts:
        return RerankResponse(scores=[], model=req.model or _model_name_default)
    try:
        model = _ensure_model(req.model)
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Failed to initialize reranker: {e}")
    pairs = [(req.query, t) for t in req.texts]
    try:
        scores = model.predict(pairs)  # type: ignore[attr-defined]
        scores_list = [float(s) for s in scores]
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Rerank failed: {e}")
    return RerankResponse(scores=scores_list, model=getattr(model, "model_name", req.model or _model_name_default))
