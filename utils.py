import json
import logging
import os
import re
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from pydantic import BaseModel


# --------------------
# Configuration
# --------------------
class AppConfig(BaseModel):
    hf_model_id: str
    hf_token: Optional[str] = None

    embedding_model_name: str

    # Database URL for Postgres + pgvector
    database_url: str

    # Generation backend: 'local' (transformers) or 'remote' (e.g., vLLM/OpenAI-compatible)
    gen_backend: str = "local"
    remote_gen_url: Optional[str] = None
    remote_gen_api_key: Optional[str] = None

    device: str = "auto"  # auto | cpu | cuda
    log_level: str = "INFO"

    top_k: int = 5
    chunk_size_tokens: int = 300
    chunk_overlap_tokens: int = 50

    max_new_tokens: int = 128  # Reduced for faster responses (can be overridden via env)
    temperature: float = 0.2

    # Remote generation tuning
    gen_timeout_ms: int = 60000
    remote_fallback_local: bool = True

    # Schema management: 'migrations' (preferred) or 'runtime'
    db_schema_management: str = "migrations"

    # Output quality and safety
    max_query_chars: int = 2000
    max_context_chars: int = 16000
    profanity_filter_enabled: bool = True
    profanity_block_mode: str = "mask"  # mask | block

    # Embedding provider
    embedding_provider: str = "local"  # local | modal | openai
    remote_embed_url: Optional[str] = None
    remote_embed_api_key: Optional[str] = None
    openai_api_key: Optional[str] = None
    openai_embed_model: str = "text-embedding-3-large"

    # Reranker configuration
    reranker_backend: str = "local"  # local | remote | none (required)
    reranker_model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    reranker_remote_url: Optional[str] = None
    retriever_candidates: int = 10

    # Redis (optional) for caching and session persistence
    redis_url: Optional[str] = None
    redis_prefix: str = "fitai"
    redis_ttl_embeddings_sec: int = 3600
    redis_ttl_session_sec: int = 3600

    # Retrieval filters (optional)
    filter_min_credibility: Optional[int] = None
    filter_category: Optional[str] = None
    filter_min_year: Optional[int] = None

    # Chunking strategy
    chunking_mode: str = "token"  # token | token_paragraph


def load_env() -> None:
    # Load .env if present
    load_dotenv(override=False)


def get_config() -> AppConfig:
    load_env()
    return AppConfig(
        hf_model_id=os.getenv("HF_MODEL_ID", "microsoft/phi-3-mini-4k-instruct"),
        hf_token=os.getenv("HF_TOKEN") or None,
        embedding_model_name=os.getenv(
            "EMBEDDING_MODEL_NAME", "sentence-transformers/all-MiniLM-L6-v2"
        ),
        database_url=os.getenv("DATABASE_URL", "postgresql+psycopg2://postgres:postgres@localhost:5432/fitai"),
        gen_backend=os.getenv("GEN_BACKEND", "local"),
        remote_gen_url=os.getenv("REMOTE_GEN_URL") or None,
        remote_gen_api_key=os.getenv("REMOTE_GEN_API_KEY") or None,
        device=os.getenv("DEVICE", "auto"),
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        top_k=int(os.getenv("TOP_K", "5")),
        chunk_size_tokens=int(os.getenv("CHUNK_SIZE_TOKENS", "300")),
        chunk_overlap_tokens=int(os.getenv("CHUNK_OVERLAP_TOKENS", "50")),
        max_new_tokens=int(os.getenv("MAX_NEW_TOKENS", "256")),
        temperature=float(os.getenv("TEMPERATURE", "0.2")),
        gen_timeout_ms=int(os.getenv("GEN_TIMEOUT_MS", "60000")),
        remote_fallback_local=os.getenv("REMOTE_FALLBACK_LOCAL", "1") in ("1", "true", "True", "yes"),
        db_schema_management=os.getenv("DB_SCHEMA_MANAGEMENT", "migrations"),
        max_query_chars=int(os.getenv("MAX_QUERY_CHARS", "2000")),
        max_context_chars=int(os.getenv("MAX_CONTEXT_CHARS", "16000")),
        profanity_filter_enabled=os.getenv("PROFANITY_FILTER_ENABLED", "1") in ("1", "true", "True", "yes"),
        profanity_block_mode=os.getenv("PROFANITY_BLOCK_MODE", "mask"),
        embedding_provider=os.getenv("EMBEDDING_PROVIDER", "local"),
        remote_embed_url=os.getenv("REMOTE_EMBED_URL") or None,
        remote_embed_api_key=os.getenv("REMOTE_EMBED_API_KEY") or None,
        openai_api_key=os.getenv("OPENAI_API_KEY") or None,
        openai_embed_model=os.getenv("OPENAI_EMBED_MODEL", "text-embedding-3-large"),
        reranker_backend=os.getenv("RERANKER_BACKEND", "local"),
        reranker_model_name=os.getenv("RERANKER_MODEL_NAME", "cross-encoder/ms-marco-MiniLM-L-6-v2"),
        reranker_remote_url=os.getenv("RERANKER_REMOTE_URL") or None,
        retriever_candidates=int(os.getenv("RETRIEVER_CANDIDATES", "10")),
        redis_url=os.getenv("REDIS_URL") or None,
        redis_prefix=os.getenv("REDIS_PREFIX", "fitai"),
        redis_ttl_embeddings_sec=int(os.getenv("REDIS_TTL_EMBEDDINGS_SEC", "3600")),
        redis_ttl_session_sec=int(os.getenv("REDIS_TTL_SESSION_SEC", "3600")),
        filter_min_credibility=int(os.getenv("FILTER_MIN_CREDIBILITY", "0")) if os.getenv("FILTER_MIN_CREDIBILITY") else None,
        filter_category=os.getenv("FILTER_CATEGORY") or None,
        filter_min_year=int(os.getenv("FILTER_MIN_YEAR", "0")) if os.getenv("FILTER_MIN_YEAR") else None,
        chunking_mode=os.getenv("CHUNKING_MODE", "token"),
    )


# --------------------
# Logging
# --------------------
_logger_init_lock = threading.Lock()

# PII patterns for log redaction (expanded from memory.py for broader use)
PII_PATTERNS = [
    re.compile(r"[\w\.-]+@[\w\.-]+\.[A-Za-z]{2,}", re.IGNORECASE),  # emails
    re.compile(r"\+?\d[\d\s\-()]{7,}\d"),  # phone-like numbers
    re.compile(r"\b\d{3}-?\d{2}-?\d{4}\b"),  # SSN-like
    re.compile(r"\buser[-_]?id['\"]?\s*[:=]\s*['\"]?([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|[a-zA-Z0-9_-]{20,})", re.IGNORECASE),  # user_id patterns
]


def redact_pii_from_log(text: str) -> str:
    """Redact PII from log messages to prevent data leakage."""
    if not text:
        return text
    redacted = str(text)
    for pat in PII_PATTERNS:
        redacted = pat.sub("[REDACTED]", redacted)
    return redacted


class PIIAwareFormatter(logging.Formatter):
    """Logging formatter that redacts PII before writing logs."""
    
    def format(self, record: logging.LogRecord) -> str:
        # Redact PII from the message
        if hasattr(record, "msg") and record.msg:
            record.msg = redact_pii_from_log(str(record.msg))
        # Also redact any args that might contain PII (only strings)
        if hasattr(record, "args") and record.args:
            # Only redact string args, preserve numeric types for formatting
            redacted_args = []
            for arg in record.args:
                if isinstance(arg, str):
                    redacted_args.append(redact_pii_from_log(arg))
                else:
                    # Preserve non-string args (ints, floats, etc.) for proper formatting
                    redacted_args.append(arg)
            record.args = tuple(redacted_args)
        return super().format(record)


def get_logger(name: str, level: Optional[str] = None) -> logging.Logger:
    """Return a configured logger with PII redaction.

    Uses a global init lock to avoid duplicate handler registration under uvicorn reload.
    All logs are automatically redacted for PII (emails, phone numbers, user_ids).
    """
    logger = logging.getLogger(name)
    if level is None:
        level = os.getenv("LOG_LEVEL", "INFO")
    logger.setLevel(level)

    with _logger_init_lock:
        if not logger.handlers:
            handler = logging.StreamHandler()
            # Use PII-aware formatter
            pii_redaction_enabled = os.getenv("LOG_PII_REDACTION_ENABLED", "1") in ("1", "true", "True")
            if pii_redaction_enabled:
                formatter = PIIAwareFormatter(
                    fmt="%(asctime)s %(levelname)s %(name)s - %(message)s",
                    datefmt="%Y-%m-%dT%H:%M:%S%z",
                )
            else:
                formatter = logging.Formatter(
                fmt="%(asctime)s %(levelname)s %(name)s - %(message)s",
                datefmt="%Y-%m-%dT%H:%M:%S%z",
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
            logger.propagate = False
    return logger


# --------------------
# Filesystem helpers (retained for any local file use)
# --------------------

def ensure_parent_dir(path: str | Path) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)


def read_json(path: str | Path, default: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    p = Path(path)
    if not p.exists():
        return default or {}
    with p.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path: str | Path, data: Dict[str, Any]) -> None:
    p = Path(path)
    ensure_parent_dir(p)
    tmp = p.with_suffix(p.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(p)


# --------------------
# Device helpers
# --------------------

def resolve_device_map(device: str) -> str | Dict[str, Any]:
    """Return device map for HF accelerate.

    - "auto": let accelerate shard across available devices
    - "cuda": place on GPU 0
    - "mps": place on Apple GPU (single device)
    - "cpu": CPU only
    """
    d = device.lower()
    if d == "auto":
        return "auto"
    if d == "cuda":
        return {"": 0}
    if d == "mps":
        return {"": "mps"}
    return {"": "cpu"}