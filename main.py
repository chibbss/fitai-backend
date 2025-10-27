# main.py

import traceback
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Request, Body
from fastapi import Query
from pydantic import BaseModel, Field

from rag import RAGService
from memory import refresh_user_memory, refresh_all_users_memories
from utils import AppConfig, get_config, get_logger
from auth import AuthUser, get_current_user, get_optional_user, ensure_user_owns_resource, require_admin

import os
import io
import asyncio
from apscheduler.schedulers.background import BackgroundScheduler
from starlette.middleware.base import BaseHTTPMiddleware
from asgi_correlation_id import CorrelationIdMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from prometheus_fastapi_instrumentator import Instrumentator
import sentry_sdk
from sentry_sdk.integrations.asgi import SentryAsgiMiddleware
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

logger = get_logger("main")
app = FastAPI(title="Production RAG API", version="1.0.0")
rag_service = RAGService()
_scheduler: Optional[BackgroundScheduler] = None
limiter = Limiter(key_func=get_remote_address)


# -------------------------------
# Middleware: Body size limit
# -------------------------------
MAX_BODY_BYTES = int(os.getenv("MAX_BODY_BYTES", "10485760"))  # 10MB default


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl:
            try:
                if int(cl) > MAX_BODY_BYTES:
                    raise HTTPException(status_code=413, detail="Request too large")
            except Exception:
                pass
        return await call_next(request)


app.add_middleware(BodySizeLimitMiddleware)
app.add_middleware(CorrelationIdMiddleware, header_name="X-Request-ID")
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.state.limiter = limiter

# -------------------------------------------------
# Response Models
# -------------------------------------------------
class HealthResponse(BaseModel):
    status: str
class SearchResponseItem(BaseModel):
    doc_id: str
    chunk_id: str
    score: float
    text: str
    metadata: Dict[str, Any]
    snippet: str
    source: Optional[str] = None


class SearchResponse(BaseModel):
    results: List[SearchResponseItem]
    citations: List[Dict[str, Any]]
    count: int


class ChatRequest(BaseModel):
    session_id: Optional[str] = Field(None, description="Session identifier for short-term memory")
    query: str = Field(..., description="User query/question (safety filtered)")

# Resolve forward refs for Pydantic v2 when using future annotations
try:
    ChatRequest.model_rebuild()
except Exception:
    pass


class Reference(BaseModel):
    doc_id: str
    chunk_id: str
    score: float
    metadata: Dict[str, Any]
    snippet: str


class ChatResponse(BaseModel):
    answer: str
    references: List[Reference]
    citations: List[Dict[str, Any]] | None = None


# NOTE: Transcribe endpoint now only returns the transcribed text.
class TranscribeResponse(BaseModel):
    transcribed_text: str


class AddDocItem(BaseModel):
    id: Optional[str] = Field(None, description="Optional document ID")
    text: str = Field(..., min_length=1, description="Raw document text")
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


class MemoryItem(BaseModel):
    id: str
    summary: str
    source: Optional[str] = None
    metadata: Dict[str, Any]
    updated_at: Optional[str] = None


class MemoriesResponse(BaseModel):
    items: List[MemoryItem]


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
        # Observability (env-gated)
        if os.getenv("SENTRY_DSN"):
            sentry_sdk.init(dsn=os.getenv("SENTRY_DSN"), traces_sample_rate=float(os.getenv("SENTRY_TRACES", "0.1")))
            app.add_middleware(SentryAsgiMiddleware)

        try:
            FastAPIInstrumentor.instrument_app(app)
        except Exception:
            pass

        try:
            Instrumentator().instrument(app).expose(app, endpoint="/metrics")
        except Exception:
            pass

        rag_service.startup()
        logger.info("RAG service initialized")
        # Dev scheduler: refresh memories on a cron schedule inside API process
        if os.getenv("ENABLE_SCHEDULER", "1") in ("1", "true", "True"):
            global _scheduler
            _scheduler = BackgroundScheduler()
            cron_hour = os.getenv("MEMORY_CRON_HOUR", "3")
            _scheduler.add_job(lambda: refresh_all_users_memories(rag_service), "cron", hour=cron_hour)
            _scheduler.start()
    except Exception as e:
        err = f"Startup failed: {e}\n{traceback.format_exc()}"
        logger.error(err)
        raise


@app.on_event("shutdown")
async def on_shutdown() -> None:
    global _scheduler
    try:
        if _scheduler:
            _scheduler.shutdown(wait=False)
            _scheduler = None
    except Exception:
        pass


# -------------------------------------------------
# Health Endpoint
# -------------------------------------------------
@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


class ReadinessResponse(BaseModel):
    ok: bool
    db_ok: bool
    gen_ok: bool


@app.get("/readiness", response_model=ReadinessResponse)
async def readiness() -> ReadinessResponse:
    db_ok = False
    gen_ok = False
    try:
        # lightweight DB check
        with rag_service.engine.connect() as conn:
            conn.execute("SELECT 1")
        db_ok = True
    except Exception:
        db_ok = False
    try:
        if rag_service.config.gen_backend == "remote" and rag_service._remote_session and rag_service.config.remote_gen_url:
            gen_ok = True
        else:
            # If local backend, ensure tokenizer/model loaded
            gen_ok = rag_service.generator_tokenizer is not None or (rag_service._remote_session is not None)
    except Exception:
        gen_ok = False
    return ReadinessResponse(ok=db_ok and gen_ok, db_ok=db_ok, gen_ok=gen_ok)


# -------------------------------------------------
# Chat Endpoint
# -------------------------------------------------
@app.post("/chat", response_model=ChatResponse)
@limiter.limit(os.getenv("RATE_LIMIT_CHAT", "60/minute"))
async def chat(
    request: Request,
    body: ChatRequest = Body(...),
    user: AuthUser = Depends(get_current_user),
) -> ChatResponse:
    try:
        # Simple profanity/guardrail filter (mask or block)
        q = body.query or ""
        if rag_service.config.profanity_filter_enabled:
            import re
            bad = re.compile(r"\b(fuck|shit|bitch|asshole|bastard)\b", re.IGNORECASE)
            if bad.search(q):
                if rag_service.config.profanity_block_mode == "block":
                    raise HTTPException(status_code=400, detail="Inappropriate language detected")
                q = bad.sub("[CENSORED]", q)
        result = rag_service.chat(
            query=q,
            user_id=user.user_id,
            session_id=body.session_id,
        )
        refs = [Reference(**r) for r in result.get("references", [])]
        return ChatResponse(answer=result.get("answer", ""), references=refs, citations=result.get("citations") or [])
    except Exception as e:
        logger.error("/chat error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -------------------------------------------------
# Search Endpoint
# -------------------------------------------------
@app.get("/search", response_model=SearchResponse)
@limiter.limit(os.getenv("RATE_LIMIT_SEARCH", "120/minute"))
async def search(
    q: str = Query(..., description="Query string"),
    k: int = Query(5, ge=1, le=50, description="Top-k results to return"),
    user: AuthUser = Depends(get_current_user),
) -> SearchResponse:
    try:
        # clamp query
        query = q[: rag_service.config.max_query_chars]
        res = rag_service.search(query=query, user_id=user.user_id, top_k=k)
        items = [SearchResponseItem(**it) for it in res.get("results", [])]
        return SearchResponse(results=items, citations=res.get("citations", []), count=res.get("count", len(items)))
    except HTTPException:
        raise
    except Exception as e:
        logger.error("/search error: %s", e, exc_info=True)
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
@limiter.limit(os.getenv("RATE_LIMIT_ADD_DOCS", "30/minute"))
async def add_docs(request: Request, body: AddDocsRequest, user: Optional[AuthUser] = Depends(get_optional_user)) -> AddDocsResponse:
    try:
        # If authenticated, default to storing under the authenticated user when user_id not provided
        target_user_id = body.user_id if body.user_id is not None else (user.user_id if user else None)
        payload = {"documents": [d.model_dump() for d in body.documents]}
        result = rag_service.add_documents(payload["documents"], user_id=target_user_id)
        return AddDocsResponse(**result)
    except Exception as e:
        logger.error("/add_docs error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/add_docs_files", response_model=AddDocsResponse)
async def add_docs_files(
    files: List[UploadFile] = File(..., description="Upload PDFs/TXT/MD files"),
    user: Optional[AuthUser] = Depends(get_optional_user),
    category: Optional[str] = Form(None),
) -> AddDocsResponse:
    try:
        try:
            from pypdf import PdfReader  # type: ignore
        except Exception:
            PdfReader = None  # type: ignore
        def _extract_pdf_bytes(data: bytes) -> str:
            if PdfReader is None:
                raise HTTPException(status_code=500, detail="PDF support requires pypdf installed")
            import io
            reader = PdfReader(io.BytesIO(data))
            parts: List[str] = []
            for page in reader.pages:
                try:
                    t = page.extract_text() or ""
                    if t.strip():
                        parts.append(t)
                except Exception:
                    continue
            return "\n".join(parts)

        docs: List[AddDocItem] = []  # type: ignore
        for f in files:
            name = f.filename or "doc"
            ct = f.content_type or ""
            data = await f.read()
            text = ""
            if name.lower().endswith(".pdf") or ct == "application/pdf":
                text = _extract_pdf_bytes(data)
            elif name.lower().endswith(".txt") or name.lower().endswith(".md") or ct.startswith("text/"):
                text = data.decode("utf-8", errors="ignore")
            else:
                continue
            text = (text or "").strip()
            if not text:
                continue
            meta: Dict[str, Any] = {"source": "upload", "title": name}
            if category:
                meta["category"] = category
            docs.append(AddDocItem(id=None, text=text, metadata=meta))
        if not docs:
            return AddDocsResponse(added_docs=0, added_vectors=0)
        result = rag_service.add_documents([d.model_dump() for d in docs], user_id=user.user_id if user else None)
        return AddDocsResponse(**result)
    except Exception as e:
        logger.error("/add_docs_files error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/reembed_all", response_model=RebuildResponse)
@limiter.limit(os.getenv("RATE_LIMIT_ADMIN", "10/minute"))
async def reembed_all(request: Request, user_id: Optional[str] = None, _: AuthUser = Depends(require_admin)) -> RebuildResponse:
    try:
        result = rag_service.reembed_all(user_id=user_id)
        return RebuildResponse(**result)
    except Exception as e:
        logger.error("/reembed_all error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -------- User management --------
@app.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, user: AuthUser = Depends(get_current_user)) -> UserResponse:
    try:
        ensure_user_owns_resource(user_id, user)
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
async def upsert_user(user_id: str, body: UserUpsertRequest, user: AuthUser = Depends(get_current_user)) -> UserResponse:
    try:
        ensure_user_owns_resource(user_id, user)
        user = rag_service.upsert_user(
            user_id=user_id,
            name=body.name,
            email=body.email,
            profile=body.profile,
            goals=body.goals,
            metadata=body.metadata,
        )
        # Optionally refresh long-term memory immediately on profile/goal updates
        if os.getenv("REFRESH_MEMORY_ON_UPSERT", "1") in ("1", "true", "True"):
            try:
                from memory import refresh_user_memory as _refresh
                _ = _refresh(rag_service, user_id=user_id, n=10)
            except Exception:
                logger.warning("Memory refresh on upsert failed; will rely on scheduler")
        return UserResponse(**user)
    except Exception as e:
        logger.error("/users PUT error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/add_training_log", response_model=TrainingLogResponse)
@limiter.limit(os.getenv("RATE_LIMIT_LOGS", "120/minute"))
async def add_training_log(request: Request, body: TrainingLogRequest, user: AuthUser = Depends(get_current_user)) -> TrainingLogResponse:
    try:
        ensure_user_owns_resource(body.user_id, user)
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
async def history(user_id: str, limit: int = 100, since: Optional[str] = None, user: AuthUser = Depends(get_current_user)) -> HistoryResponse:
    try:
        ensure_user_owns_resource(user_id, user)
        since_dt = since if since else None
        rows = rag_service.get_training_history(user_id=user_id, limit=limit, since=since_dt)
        return HistoryResponse(items=[HistoryItem(**r) for r in rows])
    except Exception as e:
        logger.error("/history error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# -------- Memories --------
@app.get("/memories/me", response_model=MemoriesResponse)
@limiter.limit(os.getenv("RATE_LIMIT_MEMORIES", "60/minute"))
async def memories_me(request: Request, user: AuthUser = Depends(get_current_user)) -> MemoriesResponse:
    try:
        items = rag_service.list_memories(user_id=user.user_id)
        return MemoriesResponse(items=[MemoryItem(**m) for m in items])
    except Exception as e:
        logger.error("/memories/me error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


class MemoryRefreshRequest(BaseModel):
    user_id: str
    n: Optional[int] = 10


class MemoryRefreshResponse(BaseModel):
    user_id: str
    updated: bool
    memory_id: Optional[str] = None
    reason: Optional[str] = None
    summary: Optional[str] = None


@app.post("/memories/refresh", response_model=MemoryRefreshResponse)
async def memories_refresh(body: MemoryRefreshRequest, user: AuthUser = Depends(get_current_user)) -> MemoryRefreshResponse:
    try:
        ensure_user_owns_resource(body.user_id, user)
        res = refresh_user_memory(rag_service, user_id=body.user_id, n=body.n or 10)
        return MemoryRefreshResponse(
            user_id=res.get("user_id", body.user_id),
            updated=bool(res.get("updated")),
            memory_id=res.get("memory_id"),
            reason=res.get("reason"),
            summary=res.get("summary"),
        )
    except Exception as e:
        logger.error("/memories/refresh error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/memories/{user_id}", response_model=MemoriesResponse)
async def memories_for_user(user_id: str, _: AuthUser = Depends(require_admin)) -> MemoriesResponse:
    try:
        items = rag_service.list_memories(user_id=user_id)
        return MemoriesResponse(items=[MemoryItem(**m) for m in items])
    except Exception as e:
        logger.error("/memories/{user_id} error: %s", e, exc_info=True)
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