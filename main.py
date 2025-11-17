# main.py

import json
import traceback
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Request, Body
from fastapi import Query
from pydantic import BaseModel, Field
from fastapi.responses import StreamingResponse

from rag import RAGService
from memory import refresh_user_memory, refresh_all_users_memories
from utils import AppConfig, get_config, get_logger
from auth import AuthUser, get_current_user, get_optional_user, ensure_user_owns_resource, require_admin

import os
import io
import asyncio
import time
from datetime import datetime, timezone
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
from sqlalchemy import text as sql_text
from uuid import uuid4

logger = get_logger("main")
app = FastAPI(title="Production RAG API", version="1.0.0")
rag_service = RAGService()
_scheduler: Optional[BackgroundScheduler] = None
limiter = Limiter(key_func=get_remote_address)


# -------------------------------
# Middleware: Body size limit
# -------------------------------
MAX_BODY_BYTES = int(os.getenv("MAX_BODY_BYTES", "10485760"))  # 10MB default


# -------------------------------
# Helper: Sanitize Error Messages
# -------------------------------
def sanitize_error_message(error: Exception, default_message: str = "An error occurred processing your request") -> str:
    """Sanitize error messages to prevent PII exposure in production."""
    if os.getenv("ENVIRONMENT", "development") in ("production", "prod"):
        return default_message
    return str(error)


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


# -------------------------------
# Middleware: Request Timing & Logging
# -------------------------------
class RequestTimingMiddleware(BaseHTTPMiddleware):
    """Log request duration and add timing context to Sentry."""
    
    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        correlation_id = request.headers.get("X-Request-ID", "unknown")
        method = request.method
        path = request.url.path
        
        # Skip timing for health/readiness/metrics endpoints (too noisy)
        skip_paths = ["/health", "/readiness", "/metrics", "/docs", "/redoc", "/openapi.json"]
        should_log = path not in skip_paths
        
        # Extract user ID from request if available (for Sentry context)
        user_id = None
        try:
            # Try to get user from request state (set by auth dependency)
            if hasattr(request.state, "user"):
                user_id = getattr(request.state.user, "user_id", None)
        except Exception:
            pass
        
        # Set Sentry context
        if os.getenv("SENTRY_DSN"):
            with sentry_sdk.push_scope() as scope:
                scope.set_tag("correlation_id", correlation_id)
                scope.set_tag("method", method)
                scope.set_tag("path", path)
                if user_id:
                    scope.set_user({"id": user_id})
                
                try:
                    response = await call_next(request)
                except Exception as e:
                    # Log error with context
                    duration_ms = (time.time() - start_time) * 1000
                    logger.error(
                        "Request failed: %s %s (duration=%.2fms, correlation_id=%s, user_id=%s)",
                        method, path, duration_ms, correlation_id, user_id or "anonymous",
                        exc_info=True
                    )
                    raise
                else:
                    duration_ms = (time.time() - start_time) * 1000
                    status_code = response.status_code
                    
                    # Log slow requests (>1s) or errors
                    if duration_ms > 1000 or status_code >= 400:
                        log_level = "error" if status_code >= 500 else "warning" if status_code >= 400 else "info"
                        getattr(logger, log_level)(
                            "Request: %s %s -> %d (duration=%.2fms, correlation_id=%s, user_id=%s)",
                            method, path, status_code, duration_ms, correlation_id, user_id or "anonymous"
                        )
                    elif should_log:
                        logger.info(
                            "Request: %s %s -> %d (duration=%.2fms, correlation_id=%s)",
                            method, path, status_code, duration_ms, correlation_id
                        )
                    
                    # Add timing to response headers
                    response.headers["X-Response-Time-Ms"] = f"{duration_ms:.2f}"
                    return response
        else:
            # No Sentry, just timing logs
            try:
                response = await call_next(request)
            except Exception as e:
                duration_ms = (time.time() - start_time) * 1000
                logger.error(
                    "Request failed: %s %s (duration=%.2fms, correlation_id=%s, user_id=%s)",
                    method, path, duration_ms, correlation_id, user_id or "anonymous",
                    exc_info=True
                )
                raise
            else:
                duration_ms = (time.time() - start_time) * 1000
                status_code = response.status_code
                
                if duration_ms > 1000 or status_code >= 400:
                    log_level = "error" if status_code >= 500 else "warning" if status_code >= 400 else "info"
                    getattr(logger, log_level)(
                        "Request: %s %s -> %d (duration=%.2fms, correlation_id=%s, user_id=%s)",
                        method, path, status_code, duration_ms, correlation_id, user_id or "anonymous"
                    )
                elif should_log:
                    logger.info(
                        "Request: %s %s -> %d (duration=%.2fms, correlation_id=%s)",
                        method, path, status_code, duration_ms, correlation_id
                    )
                
                response.headers["X-Response-Time-Ms"] = f"{duration_ms:.2f}"
                return response


app.add_middleware(RequestTimingMiddleware)


# -------------------------------
# Middleware: TLS Enforcement
# -------------------------------
class TLSEnforcementMiddleware(BaseHTTPMiddleware):
    """Enforce HTTPS in production environments."""
    async def dispatch(self, request: Request, call_next):
        # Only enforce in production
        if os.getenv("ENVIRONMENT", "development") in ("production", "prod"):
            # Check X-Forwarded-Proto header (set by reverse proxy/load balancer)
            forwarded_proto = request.headers.get("X-Forwarded-Proto", "")
            # Also check if request is HTTP directly (shouldn't happen behind proxy)
            if forwarded_proto == "http" or (not forwarded_proto and request.url.scheme == "http"):
                from fastapi.responses import RedirectResponse
                # Redirect to HTTPS
                https_url = str(request.url).replace("http://", "https://", 1)
                return RedirectResponse(url=https_url, status_code=301)
        return await call_next(request)


# -------------------------------
# Middleware: Security Headers
# -------------------------------
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Skip security headers for docs endpoints (Swagger UI needs CDN resources)
        # Docs are only for development/internal use, so this is safe
        if request.url.path in ("/docs", "/redoc", "/openapi.json"):
            return response
        
        # Security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # HSTS (HTTP Strict Transport Security) - only in production with HTTPS
        if os.getenv("ENVIRONMENT", "development") in ("production", "prod"):
            forwarded_proto = request.headers.get("X-Forwarded-Proto", "")
            if forwarded_proto == "https" or request.url.scheme == "https":
                hsts_max_age = int(os.getenv("HSTS_MAX_AGE", "31536000"))  # 1 year default
                response.headers["Strict-Transport-Security"] = f"max-age={hsts_max_age}; includeSubDomains"
        
        # Content Security Policy (CSP) - restrictive by default
        csp = os.getenv("CSP_HEADER", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';")
        if csp != "none":  # Allow disabling CSP if needed
            response.headers["Content-Security-Policy"] = csp
        
        return response


app.add_middleware(TLSEnforcementMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

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
    claims: List[Dict[str, Any]] | None = None


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


class DiscoveredDataRequest(BaseModel):
    field: str
    value: Any
    context: Optional[str] = None


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


class ReportBugRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=4000)
    title: Optional[str] = Field(None, max_length=200, description="Short summary of the bug")
    severity: Optional[str] = Field(None, description="Optional severity label (e.g. low, medium, high)")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional client-provided context")


class ReportBugResponse(BaseModel):
    bug_id: str
    status: str
    message: str


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
            sentry_sdk.init(
                dsn=os.getenv("SENTRY_DSN"),
                traces_sample_rate=float(os.getenv("SENTRY_TRACES", "0.1")),
                environment=os.getenv("ENVIRONMENT", "development"),
                release=os.getenv("SENTRY_RELEASE"),  # Optional: git commit hash
                before_send=lambda event, hint: event,  # Can add filtering here if needed
            )
            app.add_middleware(SentryAsgiMiddleware)
            logger.info("Sentry initialized for error tracking")

        try:
            FastAPIInstrumentor.instrument_app(app)
        except Exception:
            pass

        try:
            Instrumentator().instrument(app).expose(app, endpoint="/metrics")
        except Exception:
            pass

        try:
            rag_service.startup()
            logger.info("RAG service initialized")
        except Exception as e:
            logger.error("RAG service startup failed: %s", e, exc_info=True)
            # Don't raise - allow app to start even if models fail to load
            # Health check will show readiness status
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
            conn.execute(sql_text("SELECT 1"))
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


@app.post("/bugs", response_model=ReportBugResponse, status_code=201)
@limiter.limit(os.getenv("RATE_LIMIT_BUGS", "30/minute"))
async def report_bug(
    request: Request,
    payload: ReportBugRequest = Body(...),
    user: Optional[AuthUser] = Depends(get_optional_user),
) -> ReportBugResponse:
    try:
        bug_id = str(uuid4())
        enriched_metadata: Dict[str, Any] = dict(payload.metadata or {})
        if payload.severity:
            enriched_metadata["severity"] = payload.severity
        enriched_metadata.setdefault("user_agent", request.headers.get("user-agent"))
        enriched_metadata.setdefault("referer", request.headers.get("referer"))
        if request.client and request.client.host:
            enriched_metadata.setdefault("client_ip", request.client.host)
        enriched_metadata.setdefault("path", str(request.url))
        metadata_json = json.dumps({k: v for k, v in enriched_metadata.items() if v is not None}) or "{}"

        with rag_service.engine.begin() as conn:
            conn.execute(
                sql_text(
                    """
                    INSERT INTO bug_reports (id, user_id, title, description, status, metadata, created_at)
                    VALUES (:id, :user_id, :title, :description, :status, :metadata::jsonb, CURRENT_TIMESTAMP)
                    """
                ),
                {
                    "id": bug_id,
                    "user_id": user.user_id if user else None,
                    "title": payload.title or None,
                    "description": payload.description.strip(),
                    "status": "open",
                    "metadata": metadata_json,
                },
            )

        logger.info("Bug report %s recorded (user_id=%s)", bug_id, user.user_id if user else "anonymous")
        return ReportBugResponse(bug_id=bug_id, status="open", message="Bug report submitted")
    except Exception as exc:
        logger.error("Failed to record bug report: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=sanitize_error_message(exc, "Unable to submit bug report"),
        )


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
        import time
        start_time = time.time()
        
        # Simple profanity/guardrail filter (mask or block)
        q = body.query or ""
        if rag_service.config.profanity_filter_enabled:
            import re
            bad = re.compile(r"\b(fuck|shit|bitch|asshole|bastard|pussy)\b", re.IGNORECASE)
            if bad.search(q):
                if rag_service.config.profanity_block_mode == "block":
                    raise HTTPException(status_code=400, detail="Inappropriate language detected")
                q = bad.sub("[CENSORED]", q)
        
        result = rag_service.chat(
            query=q,
            user_id=user.user_id,
            session_id=body.session_id,
        )
        
        # Log RAGAS metrics
        if os.getenv("RAGAS_LOGGING_ENABLED", "1") in ("1", "true", "True"):
            try:
                import asyncio
                loop = asyncio.get_running_loop()
                
                async def log_metrics():
                    # Run in executor to avoid blocking
                    def _log():
                        try:
                            retrieved = result.get("references", [])
                            # Convert references back to RetrievedChunk objects for logging
                            from rag import RetrievedChunk
                            chunks = [
                                RetrievedChunk(
                                    doc_id=r.get("doc_id", ""),
                                    chunk_id=r.get("chunk_id", ""),
                                    text=r.get("snippet", ""),
                                    score=r.get("score", 0.0),
                                    metadata=r.get("metadata", {}),
                                )
                                for r in retrieved
                            ]
                            
                            rag_service.log_ragas_metrics(
                                user_id=user.user_id,
                                session_id=body.session_id,
                                query=q,
                                answer=result.get("answer", ""),
                                retrieved_chunks=chunks,
                                dynamic_refs=result.get("dynamic_refs", []),
                                memories=[],
                                citations=result.get("citations", []),
                                total_time_ms=(time.time() - start_time) * 1000,
                            )
                        except Exception as e:
                            logger.warning("RAGAS logging failed: %s", e)
                    
                    await loop.run_in_executor(None, _log)
                
                # Fire and forget - don't wait for logging
                asyncio.create_task(log_metrics())
            except Exception as e:
                logger.warning("RAGAS logging setup failed: %s", e)
        
        refs = [Reference(**r) for r in result.get("references", [])]
        return ChatResponse(answer=result.get("answer", ""), references=refs, citations=result.get("citations") or [])
    except Exception as e:
        logger.error("/chat error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


# -------------------------------------------------
# Search Endpoint
# -------------------------------------------------
@app.get("/search", response_model=SearchResponse)
@limiter.limit(os.getenv("RATE_LIMIT_SEARCH", "120/minute"))
async def search(
    request: Request,
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
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


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
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


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
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


@app.post("/reembed_all", response_model=RebuildResponse)
@limiter.limit(os.getenv("RATE_LIMIT_ADMIN", "10/minute"))
async def reembed_all(request: Request, user_id: Optional[str] = None, _: AuthUser = Depends(require_admin)) -> RebuildResponse:
    try:
        result = rag_service.reembed_all(user_id=user_id)
        return RebuildResponse(**result)
    except Exception as e:
        logger.error("/reembed_all error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


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
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


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
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


@app.post("/users/{user_id}/preload-context")
async def preload_user_context(
    user_id: str,
    user: AuthUser = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Pre-load user context for faster chat responses.
    Call this after login to warm up FitAI's memory.
    
    This runs in the background and caches:
    - User profile/goals summary
    - Long-term memory patterns
    - Fitness overview stats
    - User workout patterns
    - Recent workout logs
    
    By the time the user starts chatting, FitAI already knows them!
    """
    try:
        ensure_user_owns_resource(user_id, user)
        
        # Pre-load context asynchronously (non-blocking)
        import threading
        def preload():
            try:
                rag_service.preload_user_context(user_id)
            except Exception as e:
                logger.warning("Background context pre-load failed: %s", e)
        
        # Start in background thread
        thread = threading.Thread(target=preload, daemon=True)
        thread.start()
        
        return {
            "user_id": user_id,
            "status": "preloading",
            "message": "FitAI is booting up and remembering you... Context will be ready shortly."
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("/users/%s/preload-context error: %s", user_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


@app.put("/users/{user_id}/discover", response_model=UserResponse)
async def discover_user_data(
    user_id: str,
    body: DiscoveredDataRequest,
    user: AuthUser = Depends(get_current_user),
) -> UserResponse:
    """
    Store data discovered through chat conversations.
    This keeps track of what the user revealed naturally during interactions,
    separate from explicit onboarding data.
    
    Example: User mentions weight in chat → stored as discovered.weight
    """
    try:
        ensure_user_owns_resource(user_id, user)
        
        # Get current user data
        user_data = rag_service.get_user(user_id)
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
        
        # Initialize metadata and discovered dict if needed
        metadata = user_data.get("metadata") or {}
        discovered = metadata.get("discovered") or {}
        
        # Store the discovered field with timestamp and context
        discovered[body.field] = {
            "value": body.value,
            "discovered_at": datetime.now(timezone.utc).isoformat(),
            "context": body.context or "Chat conversation",
        }
        
        metadata["discovered"] = discovered
        
        # Update user
        updated_user = rag_service.upsert_user(
            user_id=user_id,
            name=user_data.get("name"),
            email=user_data.get("email"),
            profile=user_data.get("profile"),
            goals=user_data.get("goals"),
            metadata=metadata,
        )
        
        logger.info(
            "Discovered data for user %s: %s = %s (context: %s)",
            user_id,
            body.field,
            body.value,
            body.context or "Chat",
        )
        
        return UserResponse(**updated_user)
    except HTTPException:
        raise
    except Exception as e:
        logger.error("/users/%s/discover error: %s", user_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


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
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


@app.get("/history", response_model=HistoryResponse)
async def history(user_id: str, limit: int = 100, since: Optional[str] = None, user: AuthUser = Depends(get_current_user)) -> HistoryResponse:
    try:
        ensure_user_owns_resource(user_id, user)
        since_dt = since if since else None
        rows = rag_service.get_training_history(user_id=user_id, limit=limit, since=since_dt)
        return HistoryResponse(items=[HistoryItem(**r) for r in rows])
    except Exception as e:
        logger.error("/history error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


# -------- Memories --------
@app.get("/memories/me", response_model=MemoriesResponse)
@limiter.limit(os.getenv("RATE_LIMIT_MEMORIES", "60/minute"))
async def memories_me(request: Request, user: AuthUser = Depends(get_current_user)) -> MemoriesResponse:
    try:
        items = rag_service.list_memories(user_id=user.user_id)
        return MemoriesResponse(items=[MemoryItem(**m) for m in items])
    except Exception as e:
        logger.error("/memories/me error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


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
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


@app.get("/memories/{user_id}", response_model=MemoriesResponse)
async def memories_for_user(user_id: str, _: AuthUser = Depends(require_admin)) -> MemoriesResponse:
    try:
        items = rag_service.list_memories(user_id=user_id)
        return MemoriesResponse(items=[MemoryItem(**m) for m in items])
    except Exception as e:
        logger.error("/memories/{user_id} error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


class OnboardingStepRequest(BaseModel):
    user_id: str
    step: str
    data: Dict[str, Any]


class OnboardingStepResponse(BaseModel):
    user: UserResponse


@app.post("/onboarding_step", response_model=OnboardingStepResponse)
async def onboarding_step(body: OnboardingStepRequest) -> OnboardingStepResponse:
    """
    Capture onboarding step data. Supports new step names:
    - "why" → stores in goals.primary_goal
    - "experience" → stores in profile.experience_level
    - "training_style" → stores in profile.workout_preference
    - "notes" → stores in profile.constraints
    Also supports legacy names: "basic", "profile", "goals", "preferences"
    """
    try:
        user = rag_service.get_user(body.user_id) or {"id": body.user_id, "profile": {}, "goals": {}, "metadata": {}}
        profile = user.get("profile", {})
        goals = user.get("goals", {})
        metadata = user.get("metadata", {}) or {}
        
        # Map new step names to proper storage locations
        if body.step == "why":
            # Store in goals
            goals.update({"primary_goal": body.data.get("primary_goal") or list(body.data.values())[0] if body.data else None})
        elif body.step == "experience":
            # Store in profile
            profile.update({"experience_level": body.data.get("experience_level") or list(body.data.values())[0] if body.data else None})
        elif body.step == "training_style":
            # Store in profile
            profile.update({"workout_preference": body.data.get("workout_preference") or list(body.data.values())[0] if body.data else None})
        elif body.step == "notes":
            # Store constraints/notes in profile
            constraints = body.data.get("constraints") or body.data.get("notes") or list(body.data.values())[0] if body.data else None
            if constraints:
                profile.update({"constraints": constraints})
        elif body.step in {"basic", "profile", "experience", "training_style", "notes"}:
            # Legacy: allow direct profile updates
            profile.update(body.data)
        elif body.step in {"goals", "preferences", "why"}:
            # Legacy: allow direct goals updates
            goals.update(body.data)
        else:
            # Default: update profile
            profile.update(body.data)

        updated = rag_service.upsert_user(
            user_id=body.user_id,
            name=user.get("name"),
            email=user.get("email"),
            profile=profile,
            goals=goals,
            metadata=metadata,
        )

        summary_text = f"Onboarding step '{body.step}': {body.data}"
        rag_service.add_training_log(user_id=body.user_id, notes=summary_text, kind="onboarding", topic=body.step)

        return OnboardingStepResponse(user=UserResponse(**updated))
    except Exception as e:
        logger.error("/onboarding_step error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


@app.get("/onboarding/completion_message/{user_id}")
async def get_onboarding_completion_message(
    user_id: str,
    user: AuthUser = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Generate personalized welcome message after onboarding completion using AI model.
    Frontend can use this for the chat handoff after onboarding.
    The message is warm, welcoming, and includes a follow-up question to start the conversation.
    """
    try:
        ensure_user_owns_resource(user_id, user)
        
        user_data = rag_service.get_user(user_id)
        if not user_data:
            raise HTTPException(status_code=404, detail="User not found")
        
        profile = user_data.get("profile", {}) or {}
        goals = user_data.get("goals", {}) or {}
        
        goal = goals.get("primary_goal") or goals.get("goal") or "your goals"
        experience = profile.get("experience_level") or "your level"
        preference = profile.get("workout_preference") or "your style"
        constraints = profile.get("constraints") or profile.get("restrictions")
        name = user_data.get("name")
        
        # Build context for AI generation
        user_context = f"""ABOUT THIS USER (just completed onboarding):
- Goal: {goal}
- Experience level: {experience}
- Training preference: {preference}"""
        
        if constraints:
            user_context += f"\n- Important note: {constraints}"
        
        if name:
            user_context += f"\n- Name: {name}"
        
        # Create prompt for AI to generate welcome message
        system_prompt = (
            "You are FitAI, a warm and friendly AI fitness coach. You're welcoming a new user who just completed onboarding. "
            "Generate a warm, personalized welcome message (2-3 sentences) that:\n"
            "1. Acknowledges what they shared during onboarding (goal, experience, preference)\n"
            "2. Shows you remember and care about their goals\n"
            "3. Ends with a helpful follow-up question to get the conversation started\n\n"
            "Be warm, encouraging, and authentic. Use their name if provided. Keep it conversational and friendly.\n"
            "Example style: 'Hey [name]! 👋 I remember you're here to [goal] and you've got [experience] experience with [preference]. "
            "That's a solid foundation to build on. [Follow-up question to start conversation]'\n\n"
            "IMPORTANT: Only generate the welcome message, nothing else. No explanations or meta-commentary."
        )
        
        user_prompt = f"{user_context}\n\nGenerate the welcome message:"
        
        # Use the same generation method as chat
        try:
            # Prepare prompt for generation
            if hasattr(rag_service.generator_tokenizer, "apply_chat_template") and getattr(rag_service.generator_tokenizer, "chat_template", None):
                messages = [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ]
                prompt = rag_service.generator_tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            else:
                prompt = system_prompt + "\n\n" + user_prompt + "\nAssistant: "
            
            # Generate using remote backend if configured
            if rag_service.config.gen_backend == "remote" and rag_service._remote_session and rag_service.config.remote_gen_url:
                payload = {
                    "model": rag_service.config.hf_model_id,
                    "prompt": prompt,
                    "max_tokens": 150,  # Short welcome message
                    "temperature": 0.7,  # Slightly warmer for welcome message
                }
                resp = rag_service._remote_session.post(rag_service.config.remote_gen_url, json=payload, timeout=rag_service.config.gen_timeout_ms / 1000.0)
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, dict) and "choices" in data and data["choices"]:
                    choice = data["choices"][0]
                    if "text" in choice:
                        message = str(choice["text"]).strip()
                    elif "message" in choice and "content" in choice["message"]:
                        message = str(choice["message"]["content"]).strip()
                    else:
                        message = None
                else:
                    message = None
            else:
                # Fallback to local generation or template
                if rag_service.generator_model and rag_service.generator_tokenizer:
                    import torch
                    inputs = rag_service.generator_tokenizer(prompt, return_tensors="pt")
                    device_str = rag_service._resolve_torch_device()
                    if device_str == "cuda" and torch.cuda.is_available():
                        inputs = {k: v.to(0) if hasattr(v, "to") else v for k, v in inputs.items()}
                    elif device_str == "mps" and torch.backends.mps.is_available():
                        inputs = {k: v.to("mps") if hasattr(v, "to") else v for k, v in inputs.items()}
                    
                    with torch.no_grad():
                        outputs = rag_service.generator_model.generate(
                            **inputs,
                            max_new_tokens=150,
                            temperature=0.7,
                            do_sample=True,
                            top_p=0.9,
                            eos_token_id=rag_service.generator_tokenizer.eos_token_id,
                            pad_token_id=rag_service.generator_tokenizer.pad_token_id or rag_service.generator_tokenizer.eos_token_id,
                        )
                    generated_text = rag_service.generator_tokenizer.decode(outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True)
                    message = generated_text.strip()
                else:
                    message = None
            
            # Fallback to template if generation failed
            if not message or len(message) < 20:
                message_parts = [f"Hey there! 👋 I remember what you told me — your goal is **{goal}**, you've got **{experience}** experience, and you enjoy **{preference}**."]
                if constraints:
                    message_parts.append(f"I'll keep your note about **{constraints}** in mind so we train safely.")
                message_parts.append("Want me to help plan your next session or log your last one?")
                message = " ".join(message_parts)
            
            # Clean up message (remove any extra formatting or repetition)
            message = message.strip()
            # Remove common generation artifacts
            if message.startswith("Assistant:"):
                message = message.replace("Assistant:", "").strip()
            if message.startswith("Welcome message:"):
                message = message.replace("Welcome message:", "").strip()
            
        except Exception as gen_error:
            logger.warning("AI generation failed for onboarding message, using template: %s", gen_error)
            # Fallback to template
            message_parts = [f"Hey there! 👋 I remember what you told me — your goal is **{goal}**, you've got **{experience}** experience, and you enjoy **{preference}**."]
            if constraints:
                message_parts.append(f"I'll keep your note about **{constraints}** in mind so we train safely.")
            message_parts.append("Want me to help plan your next session or log your last one?")
            message = " ".join(message_parts)
        
        # Save as first memory summary (in background, non-blocking)
        try:
            from memory import create_onboarding_summary
            import threading
            
            def save_summary():
                try:
                    create_onboarding_summary(rag_service, user_id, intro_message=message)
                    logger.info("Onboarding summary created for user %s", user_id)
                except Exception as e:
                    logger.warning("Failed to create onboarding summary for user %s: %s", user_id, e)
            
            # Run in background thread (don't block response)
            thread = threading.Thread(target=save_summary, daemon=True)
            thread.start()
        except Exception as e:
            # Non-critical - log but don't fail the request
            logger.warning("Failed to save onboarding summary: %s", e)
        
        return {
            "message": message,
            "user_id": user_id,
            "profile": profile,
            "goals": goals
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error("/onboarding/completion_message error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


# -------------------------------------------------
# Workout Logging Endpoints (V2 - Structured)
# -------------------------------------------------
class ExerciseLogItem(BaseModel):
    exercise_name: str
    exercise_category: Optional[str] = None
    sets: Optional[int] = None
    reps: Optional[List[int]] = None
    weights: Optional[List[str]] = None  # e.g., ["45kg", "50kg", "50kg"]
    duration_seconds: Optional[int] = None
    distance_meters: Optional[float] = None
    notes: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class LogWorkoutRequest(BaseModel):
    session_name: Optional[str] = None  # e.g., "Push Day", "Morning Run"
    session_type: Optional[str] = None  # e.g., "strength", "cardio"
    occurred_at: Optional[str] = None  # ISO timestamp
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    exercises: List[ExerciseLogItem]
    metadata: Optional[Dict[str, Any]] = None


class LogWorkoutResponse(BaseModel):
    session_id: str
    exercise_count: int
    inserted: bool


@app.post("/log/workout", response_model=LogWorkoutResponse)
@limiter.limit(os.getenv("RATE_LIMIT_LOGS", "120/minute"))
async def log_workout(
    request: Request,
    body: LogWorkoutRequest,
    user: AuthUser = Depends(get_current_user),
) -> LogWorkoutResponse:
    """
    Log a complete structured workout session with exercises.
    This replaces the old /add_training_log for workout data.
    
    Example:
    {
      "session_name": "Push Day",
      "session_type": "strength",
      "occurred_at": "2025-10-28T10:00:00Z",
      "duration_minutes": 75,
      "notes": "Felt strong today",
      "exercises": [
        {
          "exercise_name": "Bench Press",
          "exercise_category": "chest",
          "sets": 3,
          "reps": [8, 8, 6],
          "weights": ["80kg", "80kg", "85kg"]
        }
      ]
    }
    """
    try:
        from datetime import datetime
        occurred = None
        if body.occurred_at:
            try:
                occurred = datetime.fromisoformat(body.occurred_at.replace("Z", "+00:00"))
            except Exception:
                occurred = None
        
        exercises = [ex.model_dump() for ex in body.exercises]
        
        result = rag_service.log_workout_session(
            user_id=user.user_id,
            session_name=body.session_name,
            session_type=body.session_type,
            exercises=exercises,
            occurred_at=occurred,
            duration_minutes=body.duration_minutes,
            notes=body.notes,
            metadata=body.metadata,
        )
        
        return LogWorkoutResponse(**result)
    except Exception as e:
        logger.error("/log/workout error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


class WorkoutCalendarItem(BaseModel):
    session_id: str
    session_name: Optional[str] = None
    session_type: Optional[str] = None
    occurred_at: Optional[str] = None
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    metadata: Dict[str, Any]


class WorkoutCalendarResponse(BaseModel):
    items: List[WorkoutCalendarItem]


@app.get("/workouts/calendar", response_model=WorkoutCalendarResponse)
async def get_workout_calendar(
    user: AuthUser = Depends(get_current_user),
    start_date: Optional[str] = Query(None, description="ISO timestamp for start date"),
    end_date: Optional[str] = Query(None, description="ISO timestamp for end date"),
    limit: int = Query(100, ge=1, le=500),
) -> WorkoutCalendarResponse:
    """
    Retrieve workout sessions for calendar display.
    Returns simplified session data without full exercise details.
    """
    try:
        from datetime import datetime
        start_dt = None
        end_dt = None
        if start_date:
            try:
                start_dt = datetime.fromisoformat(start_date.replace("Z", "+00:00"))
            except Exception:
                pass
        if end_date:
            try:
                end_dt = datetime.fromisoformat(end_date.replace("Z", "+00:00"))
            except Exception:
                pass
        
        items = rag_service.get_workout_calendar(
            user_id=user.user_id,
            start_date=start_dt,
            end_date=end_dt,
            limit=limit,
        )
        return WorkoutCalendarResponse(items=[WorkoutCalendarItem(**it) for it in items])
    except Exception as e:
        logger.error("/workouts/calendar error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


@app.get("/workouts/{session_id}/volume")
async def get_session_volume(
    session_id: str,
    user: AuthUser = Depends(get_current_user),
) -> Dict[str, Any]:
    """
    Get total volume (kg) for a specific workout session.
    Useful for calculating intensity levels for calendar color coding.
    """
    try:
        volume = rag_service.get_session_volume(session_id, user_id=user.user_id)
        return {"session_id": session_id, "volume_kg": round(volume, 1)}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error("/workouts/{session_id}/volume error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


class WorkoutInsightItem(BaseModel):
    exercise: str
    status: str  # new | progress | regression | maintained | pr
    message: str
    delta_pct: Optional[float] = None
    weight_increase: Optional[float] = None


class SessionInsightItem(BaseModel):
    """Session-level insights that create connection moments."""
    type: str  # consistency | recovery | pr_context
    message: str
    priority: int = 0  # Higher priority shown first


class WorkoutStatsResponse(BaseModel):
    session_id: str
    stats: Dict[str, Any]  # Contains consistency, volume, exercises, recovery, progress


@app.get("/stats/{session_id}", response_model=WorkoutStatsResponse)
@limiter.limit(os.getenv("RATE_LIMIT_STATS", "120/minute"))
async def get_workout_stats(
    request: Request,
    session_id: str,
    user: AuthUser = Depends(get_current_user),
) -> WorkoutStatsResponse:
    """
    Get comprehensive workout stats for a session (Phase 1: Core Stats).
    Returns data-driven metrics: consistency, volume, exercise frequency, recovery, progress.
    
    Stats include:
    - Consistency: sessions this week/month, streaks, frequency
    - Volume: total volume, trends, by muscle group
    - Exercises: top 5 exercises, variety, most/least trained groups
    - Recovery: average recovery days, trends, rest days
    - Progress: PRs, strength progression, plateaus
    """
    try:
        result = rag_service.get_workout_stats(user_id=user.user_id, session_id=session_id)
        
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        
        return WorkoutStatsResponse(
            session_id=result["session_id"],
            stats=result["stats"],
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("/stats error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


# Keep old insights endpoint for backward compatibility (deprecated)
class WorkoutInsightsResponse(BaseModel):
    session_id: str
    insights: List[WorkoutInsightItem]  # Exercise-level insights
    session_insights: List[SessionInsightItem] = []  # NEW: Connection layer insights
    overall_message: str
    avg_volume_change_pct: float
    exercise_count: int
    conversation_hooks: List[str] = []  # NEW: Hooks for chatbot to reference


@app.get("/insights/{session_id}", response_model=WorkoutInsightsResponse)
async def get_workout_insights(
    session_id: str,
    user: AuthUser = Depends(get_current_user),
) -> WorkoutInsightsResponse:
    """
    Get instant insights for a workout session.
    Compares current session against historical performance.
    
    Returns WOW moments like:
    - "💪 Squat: +5 lbs vs last session"
    - "📈 Volume is up 10%"
    - "✅ Progressing perfectly — try +2.5 kg next time"
    """
    try:
        result = rag_service.get_workout_insights(user_id=user.user_id, session_id=session_id)
        
        if "error" in result:
            raise HTTPException(status_code=404, detail=result["error"])
        
        insights_items = [WorkoutInsightItem(**ins) for ins in result.get("insights", [])]
        session_insights_items = [
            SessionInsightItem(**ins) for ins in result.get("session_insights", [])
        ]
        # Sort by priority (higher first)
        session_insights_items.sort(key=lambda x: x.priority, reverse=True)
        
        return WorkoutInsightsResponse(
            session_id=result["session_id"],
            insights=insights_items,
            session_insights=session_insights_items,
            overall_message=result.get("overall_message", ""),
            avg_volume_change_pct=result.get("avg_volume_change_pct", 0.0),
            exercise_count=result.get("exercise_count", 0),
            conversation_hooks=result.get("conversation_hooks", []),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("/insights error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


# -------------------------------------------------
# Streaming Chat Endpoint (SSE)
# -------------------------------------------------
@app.post("/chat_stream")
@limiter.limit(os.getenv("RATE_LIMIT_CHAT", "60/minute"))
async def chat_stream(
    request: Request,
    body: ChatRequest = Body(...),
    user: AuthUser = Depends(get_current_user),
):
    """
    Streaming chat endpoint using Server-Sent Events (SSE).
    
    Returns a stream of events:
    - metadata: references and citations
    - token: individual generated tokens
    - done: final answer and timing info
    """
    try:
        from sse_starlette.sse import EventSourceResponse
        import json
        
        q = body.query or ""
        if rag_service.config.profanity_filter_enabled:
            import re
            bad = re.compile(r"\b(fuck|shit|bitch|asshole|bastard)\b", re.IGNORECASE)
            if bad.search(q):
                if rag_service.config.profanity_block_mode == "block":
                    raise HTTPException(status_code=400, detail="Inappropriate language detected")
                q = bad.sub("[CENSORED]", q)
        
        async def event_generator():
            for chunk in rag_service.chat_stream(
                query=q,
                user_id=user.user_id,
                session_id=body.session_id,
            ):
                yield {
                    "event": chunk["type"],
                    "data": json.dumps(chunk["content"]),
                }
        
        return EventSourceResponse(event_generator())
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error("/chat_stream error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=sanitize_error_message(e))


# -------------------------------------------------
# Entrypoint for local run
# -------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)