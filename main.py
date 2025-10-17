# main.py
from __future__ import annotations

import traceback
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field

from rag import RAGService
from utils import AppConfig, get_config, get_logger

import os
import io
import asyncio

logger = get_logger("main")
app = FastAPI(title="Production RAG API", version="1.0.0")
rag_service = RAGService()

# -------------------------------------------------
# Response Models
# -------------------------------------------------
class HealthResponse(BaseModel):
    status: str


class ChatRequest(BaseModel):
    user_id: Optional[str] = Field(None, description="User identifier; null => global context only")
    session_id: Optional[str] = Field(None, description="Session identifier for short-term memory")
    query: str = Field(..., description="User query/question")


class Reference(BaseModel):
    doc_id: str
    chunk_id: str
    score: float
    metadata: Dict[str, Any]
    snippet: str


class ChatResponse(BaseModel):
    answer: str
    references: List[Reference]


# NOTE: Transcribe endpoint now only returns the transcribed text.
class TranscribeResponse(BaseModel):
    transcribed_text: str


class AddDocItem(BaseModel):
    id: Optional[str] = Field(None, description="Optional document ID")
    text: str = Field(..., description="Raw document text")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)


class AddDocsRequest(BaseModel):
    user_id: Optional[str] = Field(None, description="User identifier; null => global documents shared by all")
    documents: List[AddDocItem]


class UserUpsertRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    profile: Optional[Dict[str, Any]] = None
    goals: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None


class UserResponse(BaseModel):
    id: str
    name: Optional[str] = None
    email: Optional[str] = None
    profile: Dict[str, Any]
    goals: Dict[str, Any]
    metadata: Dict[str, Any]
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class TrainingLogRequest(BaseModel):
    user_id: str
    notes: str
    kind: Optional[str] = None
    topic: Optional[str] = None
    tags: Optional[List[str]] = None
    occurred_at: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class TrainingLogResponse(BaseModel):
    inserted: int


class HistoryItem(BaseModel):
    id: str
    kind: Optional[str] = None
    topic: Optional[str] = None
    tags: Optional[List[str]] = None
    notes: str
    metadata: Dict[str, Any]
    occurred_at: Optional[str] = None


class HistoryResponse(BaseModel):
    items: List[HistoryItem]


class AddDocsResponse(BaseModel):
    added_docs: int
    added_vectors: int


class RebuildResponse(BaseModel):
    total_docs: int
    total_vectors: int


# -------------------------------------------------
# Startup
# -------------------------------------------------
@app.on_event("startup")
async def on_startup() -> None:
    try:
        rag_service.startup()
        logger.info("RAG service initialized")
    except Exception as e:
        err = f"Startup failed: {e}\n{traceback.format_exc()}"
        logger.error(err)
        raise


# -------------------------------------------------
# Health Endpoint
# -------------------------------------------------
@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


# -------------------------------------------------
# Chat Endpoint
# -------------------------------------------------
@app.post("/chat", response_model=ChatResponse)
async def chat(body: ChatRequest) -> ChatResponse:
    try:
        result = rag_service.chat(
            query=body.query,
            user_id=body.user_id,
            session_id=body.session_id,
        )
        refs = [Reference(**r) for r in result.get("references", [])]
        return ChatResponse(answer=result.get("answer", ""), references=refs)
    except Exception as e:
        logger.error("/chat error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# Helper: Transcribe Audio with Whisper
# -------------------------------------------------
async def _transcribe_with_whisper(file: UploadFile) -> str:
    """
    Transcribe an uploaded audio file using OpenAI Whisper.
    Prefers 'gpt-4o-mini-transcribe'; falls back to 'whisper-1' on older SDKs.

    Returns:
        transcribed text (str)

    Raises:
        ValueError on validation errors (400)
        RuntimeError on upstream failures (502)
    """
    if not file:
        raise ValueError("Missing audio file")

    if not file.content_type or not file.content_type.startswith("audio/"):
        raise ValueError(f"Unsupported content type: {file.content_type or 'unknown'}")

    content = await file.read()
    if not content:
        raise ValueError("Empty audio file")

    whisper_model_pref = os.getenv("OPENAI_WHISPER_MODEL", "gpt-4o-mini-transcribe")

    def _call_openai_sync() -> str:
        # Prefer new OpenAI SDK (openai>=1.x)
        try:
            from openai import OpenAI  # type: ignore
            client = OpenAI()
            bio = io.BytesIO(content)
            # name attribute is expected by some SDK calls
            bio.name = file.filename or "audio.m4a"
            resp = client.audio.transcriptions.create(model=whisper_model_pref, file=bio)
            text = getattr(resp, "text", None)
            if not text:
                raise RuntimeError("No text returned from Whisper (OpenAI v1 client)")
            return text
        except Exception:
            # Fallback to legacy openai library (openai<1.0)
            try:
                import openai  # type: ignore
                openai.api_key = os.getenv("OPENAI_API_KEY")
                bio = io.BytesIO(content)
                bio.name = file.filename or "audio.m4a"
                legacy_model = "whisper-1"
                resp = openai.Audio.transcriptions.create(model=legacy_model, file=bio)
                text = resp.get("text") if isinstance(resp, dict) else None
                if not text:
                    raise RuntimeError("No text returned from Whisper (legacy client)")
                return text
            except Exception as e:
                raise RuntimeError(f"Whisper transcription failed: {e}") from e

    loop = asyncio.get_running_loop()
    try:
        text = await loop.run_in_executor(None, _call_openai_sync)
    except Exception as e:
        # bubbled up as RuntimeError; let caller convert to 502
        raise RuntimeError(f"Transcription backend error: {e}") from e

    text = (text or "").strip()
    if not text:
        raise ValueError("Transcription produced empty text")
    return text


# -------------------------------------------------
# New Endpoint: Transcribe only (production behavior)
# -------------------------------------------------
@app.post("/transcribe_chat", response_model=TranscribeResponse)
async def transcribe_chat(
    file: UploadFile = File(..., description="Audio file: .wav, .mp3, .m4a, etc."),
    user_id: Optional[str] = Form(None),
    session_id: Optional[str] = Form(None),
) -> TranscribeResponse:
    """
    Transcribe an uploaded audio file using OpenAI Whisper and return only the transcription result.

    Frontend flow (recommended):
      1) User records → POST /transcribe_chat (multipart/form-data with 'file')
      2) Backend returns: { "transcribed_text": "..." }
      3) Frontend auto-fills the chat input with this text
      4) User presses 'Send' → frontend calls POST /chat with the text

    Note: This route purposely does NOT call rag_service.chat() — that keeps responsibilities separated
    and simplifies retries/replay on the frontend.
    """
    try:
        transcribed_text = await _transcribe_with_whisper(file)
    except ValueError as ve:
        logger.warning("/transcribe_chat validation error: %s", ve, exc_info=True)
        raise HTTPException(status_code=400, detail=str(ve))
    except RuntimeError as re:
        logger.error("/transcribe_chat transcription runtime error: %s", re, exc_info=True)
        raise HTTPException(status_code=502, detail="Transcription failed")
    except Exception as e:
        logger.error("/transcribe_chat unexpected error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Internal error during transcription")

    return TranscribeResponse(transcribed_text=transcribed_text)


# -------------------------------------------------
# Other Routes
# -------------------------------------------------
@app.post("/add_docs", response_model=AddDocsResponse)
async def add_docs(body: AddDocsRequest) -> AddDocsResponse:
    try:
        payload = {"documents": [d.model_dump() for d in body.documents]}
        result = rag_service.add_documents(payload["documents"], user_id=body.user_id)
        return AddDocsResponse(**result)
    except Exception as e:
        logger.error("/add_docs error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reembed_all", response_model=RebuildResponse)
async def reembed_all(user_id: Optional[str] = None) -> RebuildResponse:
    try:
        result = rag_service.reembed_all(user_id=user_id)
        return RebuildResponse(**result)
    except Exception as e:
        logger.error("/reembed_all error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -------- User management --------
@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str) -> UserResponse:
    try:
        user = rag_service.get_user(user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return UserResponse(**user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("/users GET error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/users/{user_id}", response_model=UserResponse)
async def upsert_user(user_id: str, body: UserUpsertRequest) -> UserResponse:
    try:
        user = rag_service.upsert_user(
            user_id=user_id,
            name=body.name,
            email=body.email,
            profile=body.profile,
            goals=body.goals,
            metadata=body.metadata,
        )
        return UserResponse(**user)
    except Exception as e:
        logger.error("/users PUT error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/add_training_log", response_model=TrainingLogResponse)
async def add_training_log(body: TrainingLogRequest) -> TrainingLogResponse:
    try:
        occurred_at = body.occurred_at if body.occurred_at else None
        res = rag_service.add_training_log(
            user_id=body.user_id,
            notes=body.notes,
            kind=body.kind,
            topic=body.topic,
            tags=body.tags,
            occurred_at=occurred_at,
            metadata=body.metadata,
        )
        return TrainingLogResponse(**res)
    except Exception as e:
        logger.error("/add_training_log error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/history", response_model=HistoryResponse)
async def history(user_id: str, limit: int = 100, since: Optional[str] = None) -> HistoryResponse:
    try:
        since_dt = since if since else None
        rows = rag_service.get_training_history(user_id=user_id, limit=limit, since=since_dt)
        return HistoryResponse(items=[HistoryItem(**r) for r in rows])
    except Exception as e:
        logger.error("/history error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class OnboardingStepRequest(BaseModel):
    user_id: str
    step: str
    data: Dict[str, Any]


class OnboardingStepResponse(BaseModel):
    user: UserResponse


@app.post("/onboarding_step", response_model=OnboardingStepResponse)
async def onboarding_step(body: OnboardingStepRequest) -> OnboardingStepResponse:
    try:
        user = rag_service.get_user(body.user_id) or {"id": body.user_id, "profile": {}, "goals": {}, "metadata": {}}
        profile = user.get("profile", {})
        goals = user.get("goals", {})
        if body.step in {"basic", "profile"}:
            profile.update(body.data)
        elif body.step in {"goals", "preferences"}:
            goals.update(body.data)
        else:
            profile.update(body.data)

        updated = rag_service.upsert_user(
            user_id=body.user_id,
            name=user.get("name"),
            email=user.get("email"),
            profile=profile,
            goals=goals,
            metadata=user.get("metadata"),
        )

        summary_text = f"Onboarding step '{body.step}': {body.data}"
        rag_service.add_training_log(user_id=body.user_id, notes=summary_text, kind="onboarding", topic=body.step)

        return OnboardingStepResponse(user=UserResponse(**updated))
    except Exception as e:
        logger.error("/onboarding_step error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# Entrypoint for local run
# -------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)