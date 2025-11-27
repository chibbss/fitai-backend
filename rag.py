#rag.py
from __future__ import annotations

import numpy as np
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime, timezone, timedelta
from collections import deque

# Lazy imports for memory optimization - only import when using local backends
# These are heavy libraries that consume significant memory even when just imported
# We'll import them only when needed (local backends), not at module level

from sqlalchemy import (
    create_engine,
    String,
    Integer,
    Text,
    ForeignKey,
    select,
    or_,
    delete,
    text as sql_text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker, Session
from sqlalchemy.dialects.postgresql import JSONB, ARRAY
from pgvector.sqlalchemy import Vector

import os
from utils import AppConfig, get_config, get_logger, resolve_device_map


@dataclass
class RetrievedChunk:
    doc_id: str
    chunk_id: str
    text: str
    score: float
    metadata: Dict[str, Any]


class RAGService:
    def __init__(self, config: Optional[AppConfig] = None) -> None:
        self.config = config or get_config()
        self.logger = get_logger(self.__class__.__name__, self.config.log_level)

        # Models / generation
        self.embedding_model: Optional[SentenceTransformer] = None
        self.embedding_tokenizer = None
        self.generator_model = None
        self.generator_tokenizer = None
        self.generator_pipe = None
        self._remote_session = None  # for remote generation (Modal - deprecated)
        self._openai_client = None  # OpenAI client for generation and embeddings
        self._reranker_model = None  # Cross-encoder model when using local reranker

        # Database (SQLAlchemy) with production-grade connection pooling
        # Pool settings optimized for production workloads (hundreds/thousands of concurrent users)
        # Reduced for Render free tier (512MB): 5 base + 10 overflow = 15 total connections per process
        # Can be increased via DB_POOL_SIZE and DB_MAX_OVERFLOW env vars for higher-tier deployments
        pool_size = int(os.getenv("DB_POOL_SIZE", "5"))  # Connections per process (reduced from 20 for memory-constrained environments)
        max_overflow = int(os.getenv("DB_MAX_OVERFLOW", "10"))  # Additional connections beyond pool_size (reduced from 40)
        pool_timeout = int(os.getenv("DB_POOL_TIMEOUT", "30"))  # Seconds to wait for connection
        pool_recycle = int(os.getenv("DB_POOL_RECYCLE", "3600"))  # Recycle connections after 1 hour
        
        self.engine = create_engine(
            self.config.database_url,
            future=True,
            pool_pre_ping=True,  # Verify connections before using
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_timeout=pool_timeout,
            pool_recycle=pool_recycle,
            echo=False,  # Set to True for SQL query logging (disable in production)
        )
        self.SessionLocal = sessionmaker(bind=self.engine, expire_on_commit=False, future=True)

        # Concurrency
        self._lock = threading.RLock()

        # Redis (optional)
        self._redis = None
        self._metrics: Dict[str, int] = {
            "rerank_total": 0,
            "rerank_changed": 0,
            "modal_cold_starts": 0,  # Count of cold starts detected (>10s response)
            "modal_warm_requests": 0,  # Count of warm requests (<10s response)
            "modal_warm_ups_triggered": 0,  # Count of warm-up calls
            "modal_warm_ups_succeeded": 0,  # Count of successful warm-ups
        }
        # In-memory cache for workout hooks (fallback when Redis unavailable)
        self._workout_hooks_cache: Dict[str, Tuple[List[str], float]] = {}  # {user_id: (hooks, timestamp)}
        # Cache for fitness overview and patterns (5 minute TTL)
        self._fitness_overview_cache: Dict[str, Tuple[str, float]] = {}  # {user_id: (overview, timestamp)}
        self._patterns_cache: Dict[str, Tuple[List[str], float]] = {}  # {user_id: (patterns, timestamp)}
        # Cache for pre-loaded user context (10 minute TTL)
        self._user_context_cache: Dict[str, Tuple[Dict[str, Any], float]] = {}  # {user_id: (context_dict, timestamp)}
        
        # Circuit breaker state for Modal services
        # Format: {service_name: {"failures": int, "last_failure": float, "state": "closed"|"open"|"half_open"}}
        self._circuit_breaker: Dict[str, Dict[str, Any]] = {}
        self._circuit_breaker_config = {
            "failure_threshold": int(os.getenv("CIRCUIT_BREAKER_FAILURE_THRESHOLD", "5")),  # Open after 5 failures
            "timeout_seconds": int(os.getenv("CIRCUIT_BREAKER_TIMEOUT", "60")),  # Stay open for 60s
            "half_open_max_attempts": int(os.getenv("CIRCUIT_BREAKER_HALF_OPEN_ATTEMPTS", "2")),  # Try 2 requests in half-open
        }
    
    def _call_modal_with_timing(self, service_name: str, url: str, payload: Dict[str, Any], timeout: float, fallback_callback=None, max_retries: int = 3):
        """
        Wrapper for Modal API calls with timing, logging, retry/backoff, circuit breaker, and fallback handling.
        
        Args:
            service_name: Name of the service (e.g., "embed", "generation", "reranker")
            url: Modal endpoint URL
            payload: Request payload
            timeout: Request timeout in seconds
            fallback_callback: Optional callback function if Modal call fails
            max_retries: Maximum number of retry attempts (default: 3)
        
        Returns:
            Response JSON data
        
        Raises:
            Exception if call fails and no fallback available
        """
        import time as time_module
        import random
        
        # Check circuit breaker state
        cb_state = self._circuit_breaker.get(service_name, {"failures": 0, "last_failure": 0, "state": "closed", "half_open_attempts": 0})
        current_time = time_module.time()
        
        # Circuit breaker logic
        if cb_state["state"] == "open":
            # Check if timeout has passed, transition to half-open
            if current_time - cb_state["last_failure"] >= self._circuit_breaker_config["timeout_seconds"]:
                cb_state["state"] = "half_open"
                cb_state["half_open_attempts"] = 0
                self.logger.info("Circuit breaker for %s: transitioning to half-open", service_name)
            else:
                # Circuit is open, fail fast
                self.logger.warning("Circuit breaker for %s is OPEN, failing fast", service_name)
                if fallback_callback:
                    self.logger.warning("Using fallback for %s due to open circuit breaker", service_name)
                    try:
                        return fallback_callback()
                    except Exception as fallback_error:
                        self.logger.error("Fallback %s also failed: %s", service_name, fallback_error, exc_info=True)
                        raise RuntimeError(f"Modal {service_name} circuit breaker open and fallback failed: {fallback_error}")
                raise RuntimeError(f"Modal {service_name} circuit breaker is open")
        
        # Initialize session if needed
        if not self._remote_session:
            import requests
            self._remote_session = requests.Session()
        
        # Retry loop with exponential backoff
        last_exception = None
        overall_start_time = time_module.time()
        for attempt in range(max_retries):
            start_time = time_module.time()
            try:
                self.logger.debug("Calling Modal %s service at %s (attempt %d/%d)", service_name, url, attempt + 1, max_retries)
                resp = self._remote_session.post(url, json=payload, timeout=timeout)
                resp.raise_for_status()
                data = resp.json()
                
                duration_ms = (time_module.time() - start_time) * 1000
                duration_seconds = duration_ms / 1000.0
                
                # Detect cold start: response time >10 seconds indicates Modal was cold
                is_cold_start = duration_seconds > 10.0
                if is_cold_start:
                    self._metrics["modal_cold_starts"] = self._metrics.get("modal_cold_starts", 0) + 1
                    self.logger.warning(
                        "Modal %s COLD START detected (duration=%.2fs, url=%s, attempt=%d) - consider keeping instance warm if frequent",
                        service_name, duration_seconds, url, attempt + 1
                    )
                else:
                    self._metrics["modal_warm_requests"] = self._metrics.get("modal_warm_requests", 0) + 1
                
                self.logger.info(
                    "Modal %s call succeeded (duration=%.2fs, cold_start=%s, url=%s, attempt=%d)",
                    service_name, duration_seconds, is_cold_start, url, attempt + 1
                )
                
                # Success - reset circuit breaker
                if cb_state["state"] == "half_open":
                    cb_state["state"] = "closed"
                    cb_state["half_open_attempts"] = 0
                    self.logger.info("Circuit breaker for %s: transitioning to closed (recovered)", service_name)
                cb_state["failures"] = 0
                self._circuit_breaker[service_name] = cb_state
                
                return data
                
            except Exception as e:
                duration_ms = (time_module.time() - start_time) * 1000
                last_exception = e
                
                # Update circuit breaker state
                cb_state["failures"] += 1
                cb_state["last_failure"] = time_module.time()
                
                # Check if we should open the circuit
                if cb_state["failures"] >= self._circuit_breaker_config["failure_threshold"]:
                    cb_state["state"] = "open"
                    self.logger.warning(
                        "Circuit breaker for %s: OPENING after %d failures",
                        service_name, cb_state["failures"]
                    )
                
                # Handle half-open state
                if cb_state["state"] == "half_open":
                    cb_state["half_open_attempts"] += 1
                    if cb_state["half_open_attempts"] >= self._circuit_breaker_config["half_open_max_attempts"]:
                        cb_state["state"] = "open"
                        self.logger.warning("Circuit breaker for %s: re-opening after half-open attempts failed", service_name)
                
                self._circuit_breaker[service_name] = cb_state
                
                # If this is the last attempt, don't retry
                if attempt == max_retries - 1:
                    break
                
                # Exponential backoff with jitter
                backoff_seconds = (2 ** attempt) + random.uniform(0, 1)
                self.logger.warning(
                    "Modal %s call failed (attempt %d/%d, duration=%.2fms, error=%s), retrying in %.2fs",
                    service_name, attempt + 1, max_retries, duration_ms, str(e), backoff_seconds
                )
                time_module.sleep(backoff_seconds)
        
        # All retries exhausted
        total_duration_ms = (time_module.time() - overall_start_time) * 1000
        self.logger.error(
            "Modal %s call failed after %d attempts (total_duration=%.2fms, url=%s, error=%s)",
            service_name, max_retries, total_duration_ms, url, str(last_exception),
            exc_info=True
        )
        
        # Try fallback if available
        if fallback_callback:
            self.logger.warning("Falling back to local %s after Modal failure (all retries exhausted)", service_name)
            try:
                return fallback_callback()
            except Exception as fallback_error:
                self.logger.error("Fallback %s also failed: %s", service_name, fallback_error, exc_info=True)
                raise RuntimeError(f"Modal {service_name} failed after {max_retries} retries and fallback failed: {fallback_error}") from last_exception
        
        raise RuntimeError(f"Modal {service_name} call failed after {max_retries} retries: {last_exception}") from last_exception

    # ------------------------
    # Initialization
    # ------------------------
    def startup(self) -> None:
        with self._lock:
            self.logger.info("Starting up RAG service")
            try:
                # Run database migrations automatically if enabled
                if os.getenv("AUTO_RUN_MIGRATIONS", "1") in ("1", "true", "True"):
                    self._run_migrations()
                self._init_db()
            except Exception as e:
                self.logger.error("Failed to initialize database: %s", e)
                raise  # Database is critical, fail if it doesn't work
            
            try:
                self._init_models()
            except Exception as e:
                self.logger.error("Failed to initialize models: %s", e)
                # Models are not critical for health check, but log the error
                # The app can still start and health check will work
            
            try:
                self._init_redis()
            except Exception as e:
                self.logger.warning("Failed to initialize Redis: %s", e)
                # Redis is optional, continue without it
            
            self.logger.info("Startup complete: database and models initialized")
    
    def _run_migrations(self) -> None:
        """Run Alembic migrations automatically on startup."""
        try:
            from alembic import command
            from alembic.config import Config
            from alembic.script import ScriptDirectory
            from alembic.runtime.migration import MigrationContext
            
            # Get migrations directory path - handle both local and deployed paths
            script_dir = os.path.dirname(os.path.abspath(__file__))
            project_root = os.path.dirname(script_dir)
            
            # Try multiple possible paths for migrations directory
            possible_migrations_dirs = [
                os.path.join(project_root, "migrations"),  # Standard: project_root/migrations
                os.path.join(script_dir, "migrations"),    # Alternative: src/migrations
                os.path.join(project_root, "src", "migrations"),  # Render: project/src/migrations
                "migrations",  # Current working directory
            ]
            
            # Try multiple possible paths for alembic.ini
            possible_alembic_ini_paths = [
                os.path.join(project_root, "alembic.ini"),  # Root level
                os.path.join(script_dir, "alembic.ini"),    # src/ level
                "alembic.ini",  # Current working directory
            ]
            
            migrations_dir = None
            alembic_ini_path = None
            
            # Find migrations directory
            for path in possible_migrations_dirs:
                if os.path.exists(path) and os.path.isdir(path):
                    migrations_dir = path
                    self.logger.info("Found migrations directory at: %s", migrations_dir)
                    break
            
            # Find alembic.ini
            for path in possible_alembic_ini_paths:
                if os.path.exists(path) and os.path.isfile(path):
                    alembic_ini_path = path
                    self.logger.info("Found alembic.ini at: %s", alembic_ini_path)
                    break
            
            if not migrations_dir:
                self.logger.warning("Migrations directory not found in any of: %s - skipping automatic migrations", possible_migrations_dirs)
                return
            
            if not alembic_ini_path:
                # If alembic.ini not found, try in migrations directory
                alembic_ini_path = os.path.join(migrations_dir, "alembic.ini")
                if not os.path.exists(alembic_ini_path):
                    self.logger.warning("alembic.ini not found - skipping automatic migrations")
                    return
            
            # Create Alembic config
            alembic_cfg = Config(alembic_ini_path)
            alembic_cfg.set_main_option("script_location", migrations_dir)
            
            # Set database URL from config
            alembic_cfg.set_main_option("sqlalchemy.url", self.config.database_url)
            
            # Check current database revision
            with self.engine.connect() as conn:
                context = MigrationContext.configure(conn)
                current_rev = context.get_current_revision()
                self.logger.info("Current database revision: %s", current_rev)
            
            # Get target revision
            script = ScriptDirectory.from_config(alembic_cfg)
            head_rev = script.get_current_head()
            self.logger.info("Target migration revision: %s", head_rev)
            
            if current_rev == head_rev:
                self.logger.info("Database is already at latest revision - no migrations needed")
                return
            
            self.logger.info("Running database migrations from %s (current: %s -> target: %s)...", 
                           migrations_dir, current_rev, head_rev)
            command.upgrade(alembic_cfg, "head")
            self.logger.info("Database migrations completed successfully")
        except ImportError:
            self.logger.warning("Alembic not available - skipping automatic migrations")
        except Exception as e:
            self.logger.error("Failed to run migrations: %s", e, exc_info=True)
            # Don't raise - allow app to start even if migrations fail
            # This is important for production where migrations might be run manually

    def _init_models(self) -> None:
        """Initialize models based on configuration. Skips local loading for remote backends."""
        import requests
        from requests.adapters import HTTPAdapter
        from urllib3.util.retry import Retry
        
        # Initialize remote session for API calls (shared for generation and embeddings)
        # Configure with connection pooling and retries for production reliability
        if not self._remote_session:
            self._remote_session = requests.Session()
            
            # Configure retry strategy for resilience
            retry_strategy = Retry(
                total=3,  # Total number of retries
                backoff_factor=0.3,  # Wait 0.3, 0.6, 1.2 seconds between retries
                status_forcelist=[429, 500, 502, 503, 504],  # Retry on these HTTP status codes
                allowed_methods=["POST", "GET"],  # Only retry on safe methods
            )
            
            # Configure HTTP adapter with connection pooling
            adapter = HTTPAdapter(
                max_retries=retry_strategy,
                pool_connections=10,  # Number of connection pools to cache
                pool_maxsize=20,  # Maximum number of connections to save in the pool
            )
            
            # Mount adapter for both HTTP and HTTPS
            self._remote_session.mount("http://", adapter)
            self._remote_session.mount("https://", adapter)
            
            # Set default timeout (can be overridden per request)
            self._remote_session.timeout = 60
        
        # Initialize OpenAI client if API key is provided
        if self.config.openai_api_key:
            try:
                from openai import OpenAI
                self._openai_client = OpenAI(api_key=self.config.openai_api_key)
                self.logger.info("OpenAI client initialized")
            except ImportError:
                self.logger.warning("OpenAI package not installed. pip install openai")
            except Exception as e:
                self.logger.error("Failed to initialize OpenAI client: %s", e)
        
        # Embeddings: Only load locally if using local provider
        if self.config.embedding_provider == "local":
            # Lazy import to save memory when using remote backends
            from sentence_transformers import SentenceTransformer
            import torch
            device_str = self._resolve_torch_device()
            self.logger.info("Loading embedding model %s on %s", self.config.embedding_model_name, device_str)
            try:
                self.embedding_model = SentenceTransformer(self.config.embedding_model_name, device=device_str)
            except Exception as e:
                self.logger.warning("Failed to load embedding model: %s", e)
                self.embedding_model = None

            # Tokenizer for chunking
            try:
                from transformers import AutoTokenizer as HFTokenizer
                self.embedding_tokenizer = HFTokenizer.from_pretrained(
                    self.config.embedding_model_name, use_fast=True
                )
            except Exception:
                self.embedding_tokenizer = None
        elif self.config.embedding_provider == "modal":
            self.logger.info("Using REMOTE embedding provider (Modal) at %s", self.config.remote_embed_url)
            if not self.config.remote_embed_url:
                self.logger.warning("REMOTE_EMBED_URL not set - will use local fallback")
            if self.config.remote_embed_api_key:
                self._remote_session.headers.update({"Authorization": f"Bearer {self.config.remote_embed_api_key}"})
            # Load local model as fallback for "never forgets" - ensures workouts always searchable
            # Skip on memory-constrained environments (e.g., Render free tier) by setting LOAD_LOCAL_EMBEDDING_FALLBACK=false
            self.logger.info("LOAD_LOCAL_EMBEDDING_FALLBACK=%s (env: %s)", 
                           self.config.load_local_embedding_fallback,
                           os.getenv("LOAD_LOCAL_EMBEDDING_FALLBACK", "not set"))
            if self.config.load_local_embedding_fallback:
                try:
                    from sentence_transformers import SentenceTransformer
                    import torch
                    device_str = self._resolve_torch_device()
                    self.logger.info("Loading local embedding model as fallback: %s on %s", self.config.embedding_model_name, device_str)
                    self.embedding_model = SentenceTransformer(self.config.embedding_model_name, device=device_str)
                    # Load tokenizer for chunking
                    try:
                        from transformers import AutoTokenizer as HFTokenizer
                        self.embedding_tokenizer = HFTokenizer.from_pretrained(
                            self.config.embedding_model_name, use_fast=True
                        )
                    except Exception:
                        self.embedding_tokenizer = None
                    self.logger.info("Local embedding model loaded as fallback - workouts will always be searchable (never forgets)")
                except Exception as e:
                    self.logger.error("CRITICAL: Failed to load local embedding fallback: %s - Modal must work for embeddings", e)
                    self.embedding_model = None
                    self.embedding_tokenizer = None
            else:
                self.logger.info("Skipping local embedding fallback (LOAD_LOCAL_EMBEDDING_FALLBACK=false) - using Modal only. Ensure Modal service is reliable.")
                self.embedding_model = None
                self.embedding_tokenizer = None
        elif self.config.embedding_provider == "openai":
            self.logger.info("Using OpenAI embedding provider")
            if not self.config.openai_api_key:
                self.logger.warning("OPENAI_API_KEY not set - embeddings will fail at runtime")
            # No local model loading needed
            self.embedding_model = None
            self.embedding_tokenizer = None
        else:
            self.logger.warning("Unknown embedding provider: %s", self.config.embedding_provider)
            self.embedding_model = None
            self.embedding_tokenizer = None

        # Generation backend: Only load locally if using local backend
        if self.config.gen_backend == "remote":
            self.logger.info("Using REMOTE generation backend at %s", self.config.remote_gen_url)
            if not self.config.remote_gen_url:
                self.logger.warning("REMOTE_GEN_URL not set - generation will fail at runtime")
                if self.config.remote_gen_api_key:
                    self._remote_session.headers.update({"Authorization": f"Bearer {self.config.remote_gen_api_key}"})
            # No local model loading needed
            self.generator_model = None
            self.generator_tokenizer = None
            self.generator_pipe = None
        else:
            # Local transformers - only load if gen_backend is "local"
            # Lazy import torch only when needed
            import torch
            from transformers import AutoModelForCausalLM, AutoTokenizer
            device_str = self._resolve_torch_device()
            self.logger.info("Loading LOCAL generation model %s on %s", self.config.hf_model_id, device_str)
            use_half = (
                (device_str == "cuda" and torch.cuda.is_available())
                or (device_str == "mps" and torch.backends.mps.is_available())
            )
            dtype = torch.float16 if use_half else torch.float32
            model_kwargs = {"dtype": dtype, "trust_remote_code": True, "low_cpu_mem_usage": True}
            # Use token from .env, or fall back to HuggingFace cache
            token = self.config.hf_token
            if not token:
                try:
                    from huggingface_hub import HfFolder
                    token = HfFolder.get_token()
                except Exception:
                    token = None

            # Phi-3 models may require authentication
            try:
                self.generator_tokenizer = AutoTokenizer.from_pretrained(
                    self.config.hf_model_id, token=token, trust_remote_code=True
                )
                self.generator_model = AutoModelForCausalLM.from_pretrained(
                    self.config.hf_model_id, token=token, device_map=None, **model_kwargs
                )
            except OSError as e:
                if "401" in str(e) or "Unauthorized" in str(e):
                    self.logger.error(
                        "Phi-3 model requires Hugging Face authentication.\n"
                        "To fix: 1) Get token from https://huggingface.co/settings/tokens\n"
                        "2) Accept model terms at https://huggingface.co/microsoft/phi-3-mini-4k-instruct\n"
                        "3) Add HF_TOKEN=your_token_here to .env"
                    )
                raise

            # Move model to target device explicitly for small models (prototype)
            device_str = self._resolve_torch_device()
            self.logger.info("Resolved device: %s (CUDA available: %s, MPS available: %s)", 
                           device_str, 
                           torch.cuda.is_available() if hasattr(torch, 'cuda') else False,
                           torch.backends.mps.is_available() if hasattr(torch.backends, 'mps') else False)
            if device_str == "cuda" and torch.cuda.is_available():
                self.generator_model.to(0)
                self.logger.info("Model moved to CUDA device 0")
            elif device_str == "mps" and torch.backends.mps.is_available():
                self.generator_model.to("mps")
                self.logger.info("Model moved to MPS (Apple Silicon GPU)")
            else:
                self.generator_model.to("cpu")
                self.logger.warning("Model running on CPU - this will be SLOW! Consider using MPS on Mac or remote generation.")

            # Prefer eager attention on non-CUDA backends
            try:
                if device_str != "cuda":
                    self.generator_model.config.attn_implementation = "eager"
            except Exception:
                pass

            self.generator_pipe = None

        # Reranker: Only load locally if using local backend
        if self.config.reranker_backend == "local":
            try:
                # Lazy import only when using local reranker
                try:
                    from sentence_transformers import CrossEncoder
                except Exception:
                    self.logger.warning(
                        "Reranker backend is 'local' but CrossEncoder not available; skipping reranker"
                    )
                    self._reranker_model = None
                else:
                    import torch
                    device_str = self._resolve_torch_device()
                    self.logger.info(
                        "Loading reranker model %s on %s",
                        self.config.reranker_model_name,
                        device_str,
                    )
                    # sentence-transformers CrossEncoder accepts device identifier; map 'cuda' to 0
                    device_arg = 0 if (device_str == "cuda" and torch.cuda.is_available()) else device_str
                    self._reranker_model = CrossEncoder(self.config.reranker_model_name, device=device_arg)  # type: ignore
            except Exception as e:
                self.logger.error("Failed to initialize reranker: %s", e)
                self._reranker_model = None
        elif self.config.reranker_backend == "remote":
            self.logger.info("Using REMOTE reranker backend at %s", self.config.reranker_remote_url)
            if not self.config.reranker_remote_url:
                self.logger.warning("RERANKER_REMOTE_URL not set - reranking will be skipped")
            # No local model loading needed
            self._reranker_model = None
        else:
            # "none" or unknown - no reranker
            self.logger.info("Reranker disabled (backend: %s)", self.config.reranker_backend)
            self._reranker_model = None

    def _init_redis(self) -> None:
        """Initialize Redis client (lazy connection - connects on first use)."""
        if not self.config.redis_url:
            self._redis = None
            return
        
        try:
            import redis  # type: ignore
            
            # Create Redis client with strict timeouts but don't connect yet
            # Connection will happen on first use (lazy connection)
            # This prevents startup hangs if Redis is unreachable
            self._redis = redis.Redis.from_url(
                self.config.redis_url,
                socket_timeout=2.0,  # Timeout for socket operations
                socket_connect_timeout=2.0,  # Timeout for initial connection
                socket_keepalive=True,  # Keep connection alive
                socket_keepalive_options={},  # TCP keepalive options
                health_check_interval=30,  # Check connection health every 30s
                retry_on_timeout=True,  # Retry on timeout
                decode_responses=False,  # Return bytes (for embedding cache)
            )
            
            # Don't ping during startup - let it connect lazily on first use
            # This prevents startup hangs if Redis is unreachable
            self.logger.info("Redis client initialized (lazy connection) at %s", self.config.redis_url)
            
        except Exception as e:
            self.logger.warning("Failed to initialize Redis client: %s", e)
            self._redis = None
    
    def _ensure_redis_connection(self) -> bool:
        """Ensure Redis connection is alive. Returns True if connected, False otherwise."""
        if not self._redis:
            return False
        
        try:
            # Quick ping with timeout (respects socket_timeout)
            self._redis.ping()
            return True
        except Exception as e:
            self.logger.debug("Redis connection check failed: %s", e)
            # Try to reconnect
            try:
                self._redis.connection_pool.disconnect()
                self._redis.connection_pool.reset()
            except Exception:
                pass
            return False

    def _resolve_torch_device(self) -> str:
        # Lazy import torch only when needed (local backends)
        import torch
        d = self.config.device.lower()
        if d == "cuda" and torch.cuda.is_available():
            return "cuda"
        if d == "auto" and torch.cuda.is_available():
            return "cuda"
        # Enable MPS (Apple Silicon) for much faster inference on Mac
        if d in ("auto", "mps") and hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        return "cpu"

    # ------------------------
    # Database models & setup
    # ------------------------
    def _init_db(self) -> None:
        if self.config.db_schema_management == "runtime":
            with self.engine.begin() as conn:
                conn.execute(sql_text("CREATE EXTENSION IF NOT EXISTS vector"))
            Base.metadata.create_all(self.engine)
            try:
                with self.engine.begin() as conn:
                    for tbl, col in [("chunks", "metadata"), ("users", "metadata"), ("training_logs", "metadata")]:
                        try:
                            conn.execute(sql_text(f"ALTER TABLE {tbl} RENAME COLUMN {col} TO meta_data"))
                        except Exception:
                            pass
                    conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_chunks_embedding_hnsw ON chunks USING hnsw (embedding vector_cosine_ops);"))
                    conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_chunks_metadata_gin ON chunks USING gin (meta_data)"))
                    conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_training_logs_embedding_hnsw ON training_logs USING hnsw (embedding vector_cosine_ops);"))
                    conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_training_logs_user ON training_logs(user_id)"))
                    conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_training_logs_time ON training_logs(occurred_at DESC)"))
                    conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_training_logs_tags_gin ON training_logs USING gin (tags)"))
                    conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_training_logs_metadata_gin ON training_logs USING gin (meta_data)"))
                    try:
                        conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_user_memory_embedding_hnsw ON user_memory USING hnsw (embedding vector_cosine_ops);"))
                        conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory(user_id)"))
                        conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_user_memory_meta_gin ON user_memory USING gin (meta_data)"))
                    except Exception:
                        pass
                    # Chat messages table for persistent conversation history
                    try:
                        conn.execute(sql_text("""
                            CREATE TABLE IF NOT EXISTS chat_messages (
                                id VARCHAR PRIMARY KEY,
                                user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                                session_id VARCHAR NOT NULL,
                                role VARCHAR NOT NULL,
                                content TEXT NOT NULL,
                                created_at TIMESTAMP NOT NULL,
                                meta_data JSONB,
                                CONSTRAINT fk_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                            );
                        """))
                        conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_chat_messages_user ON chat_messages(user_id);"))
                        conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);"))
                        conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);"))
                        conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_chat_messages_user_session ON chat_messages(user_id, session_id);"))
                    except Exception:
                        pass
            except Exception as e:
                self.logger.warning("Runtime schema setup warning: %s", e)
        else:

            if os.getenv("ALLOW_SCHEMA_FALLBACK_DEV") in ("1", "true", "True"):
                try:
                    with self.engine.begin() as conn:
                        check = conn.execute(sql_text("SELECT to_regclass('public.users')")).scalar()
                        if check is None:
                            self.logger.warning("DEV safeguard: creating base schema at runtime (ALLOW_SCHEMA_FALLBACK_DEV=1)")
                            conn.execute(sql_text("CREATE EXTENSION IF NOT EXISTS vector"))
                            Base.metadata.create_all(self.engine)
                except Exception as e:
                    self.logger.warning("Schema fallback setup warning: %s", e)

    # ------------------------
    # Chunking
    # ------------------------
    def _chunk_text(self, text: str) -> List[str]:
        if self.config.chunking_mode == "token_paragraph":
            return self._chunk_text_recursive(text)
        size = self.config.chunk_size_tokens
        overlap = self.config.chunk_overlap_tokens
        if size <= 0:
            return [text]
        if self.embedding_tokenizer is None:
            char_size = max(200, size * 4)
            chunks: List[str] = []
            start = 0
            while start < len(text):
                end = min(len(text), start + char_size)
                chunks.append(text[start:end])
                start = end - min(overlap * 4, end - start)
            return chunks

        tokens = self.embedding_tokenizer.encode(text, add_special_tokens=False)
        chunks = []
        start = 0
        while start < len(tokens):
            end = min(len(tokens), start + size)
            chunk_tokens = tokens[start:end]
            chunk_text = self.embedding_tokenizer.decode(chunk_tokens, skip_special_tokens=True)
            if chunk_text.strip():
                chunks.append(chunk_text)
            if end == len(tokens):
                break
            start = end - overlap
            if start < 0:
                start = 0
        return chunks

    def _chunk_text_recursive(self, text: str) -> List[str]:
        size = self.config.chunk_size_tokens
        overlap = self.config.chunk_overlap_tokens
        if size <= 0 or not text.strip():
            return [text]
        seps = ["\n\n", "\n", ". ", " "]
        def length_in_tokens(s: str) -> int:
            if self.embedding_tokenizer is None:
                return max(1, len(s) // 4)
            return len(self.embedding_tokenizer.encode(s, add_special_tokens=False))
        def split_recursive(s: str, sep_index: int) -> List[str]:
            if length_in_tokens(s) <= size or sep_index >= len(seps):
                return [s]
            parts = s.split(seps[sep_index])
            out: List[str] = []
            buf = ""
            for i, part in enumerate(parts):
                piece = (buf + (seps[sep_index] if buf else "") + part).strip()
                if length_in_tokens(piece) > size and buf:
                    out.extend(split_recursive(buf.strip(), sep_index + 1))
                    buf = part
                else:
                    buf = piece
            if buf:
                out.extend(split_recursive(buf.strip(), sep_index + 1))
            # add overlap by merging borders
            if overlap > 0 and len(out) > 1:
                with_overlap: List[str] = []
                prev_tail = ""
                for idx, ch in enumerate(out):
                    if idx > 0 and prev_tail:
                        merged = (prev_tail + " " + ch).strip()
                        # trim to size
                        while length_in_tokens(merged) > size and " " in merged:
                            merged = merged.split(" ", 1)[1]
                        with_overlap.append(merged)
                    else:
                        with_overlap.append(ch)
                    # compute tail for next overlap approx by last N tokens
                    if self.embedding_tokenizer is None:
                        prev_tail = ch[-overlap*4:]
                    else:
                        toks = self.embedding_tokenizer.encode(ch, add_special_tokens=False)
                        tail = toks[-overlap:]
                        prev_tail = self.embedding_tokenizer.decode(tail, skip_special_tokens=True)
                out = with_overlap
            return out
        return [c for c in split_recursive(text, 0) if c.strip()]

    # ------------------------
    # Embedding helpers
    # ------------------------
    def _embed(self, texts: List[str]) -> np.ndarray:
        # Redis caching for identical batch requests (simple key)
        if self._redis is not None:
            try:
                import hashlib
                key_src = ("||").join([t.strip() for t in texts])
                cache_key = f"{self.config.redis_prefix}:embed:{hashlib.md5(key_src.encode('utf-8')).hexdigest()}"
                cached = self._redis.get(cache_key)
                if cached:
                    arr = np.frombuffer(cached, dtype="float32")
                    # reshape if single vector vs multiple unknown; fall back to compute if mismatch
                    if arr.size % 384 == 0:  # default MiniLM dim
                        arr2 = arr.reshape((-1, 384))
                        return arr2
            except Exception:
                pass
        if self.config.embedding_provider == "local":
            assert self.embedding_model is not None
            return self._embed_local(texts)
        
        if self.config.embedding_provider == "modal":
            import requests
            if not self._remote_session:
                self._remote_session = requests.Session()
                if self.config.remote_embed_api_key:
                    self._remote_session.headers.update({"Authorization": f"Bearer {self.config.remote_embed_api_key}"})
            
            # Try Modal first (preferred - faster, GPU)
            if self.config.remote_embed_url:
                try:
                    resp = self._remote_session.post(self.config.remote_embed_url, json={"texts": texts}, timeout=60)
                    resp.raise_for_status()
                    data = resp.json()
                    vecs = data.get("embeddings") or data.get("data")
                    if not vecs:
                        raise RuntimeError("Remote embed response missing 'embeddings'")
                    return np.array(vecs, dtype="float32")
                except Exception as e:
                    # Fallback to local embeddings if Modal fails - ensures "never forgets"
                    if self.embedding_model is not None:
                        self.logger.warning("Modal embedding failed (%s), falling back to local embeddings to ensure workout is searchable", e)
                        return self._embed_local(texts)
                    raise RuntimeError(f"Modal embedding failed and no local fallback available: {e}")
            else:
                # No Modal URL configured - use local fallback
                if self.embedding_model is not None:
                    self.logger.warning("Modal embed URL not configured, using local embeddings")
                    return self._embed_local(texts)
                raise RuntimeError("REMOTE_EMBED_URL not configured and no local fallback available")
        elif self.config.embedding_provider == "openai":
            try:
                from openai import OpenAI  # type: ignore
            except Exception as e:
                raise RuntimeError("OpenAI client not installed. pip install openai") from e
            if not self.config.openai_api_key:
                raise RuntimeError("OPENAI_API_KEY not set for OpenAI embeddings")
            client = OpenAI(api_key=self.config.openai_api_key)
            model = self.config.openai_embed_model
            out: List[List[float]] = []
            for t in texts:
                resp = client.embeddings.create(model=model, input=t)
                emb = resp.data[0].embedding  # type: ignore
                out.append(emb)
            return np.array(out, dtype="float32")
        
        raise RuntimeError(f"Unknown embedding provider: {self.config.embedding_provider}")
    
    def _embed_local(self, texts: List[str]) -> np.ndarray:
        """Generate embeddings using local model (fallback for Modal failures)."""
        assert self.embedding_model is not None, "Local embedding model not loaded"
        vectors = self.embedding_model.encode(
            texts,
            batch_size=64,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        out = vectors.astype("float32")
        # Cache in Redis if available
        if self._redis is not None:
            try:
                import hashlib
                self._redis.setex(
                    f"{self.config.redis_prefix}:embed:{hashlib.md5(('||'.join([t.strip() for t in texts])).encode('utf-8')).hexdigest()}",
                    self.config.redis_ttl_embeddings_sec,
                    out.tobytes(),
                )
            except Exception:
                pass
        return out

    # ------------------------
    # Public operations
    # ------------------------
    def add_documents(self, docs: List[Dict[str, Any]], user_id: Optional[str]) -> Dict[str, Any]:
        with self._lock:
            if not docs:
                return {"added_docs": 0, "added_vectors": 0}

            chunk_texts: List[str] = []
            chunk_records: List[Dict[str, Any]] = []
            document_records: List[DocumentModel] = []

            for d in docs:
                text = (d.get("text") or "").strip()
                if not text:
                    continue
                doc_id = d.get("id") or str(uuid.uuid4())
                source = (d.get("metadata") or {}).get("source")
                document_records.append(DocumentModel(id=doc_id, user_id=user_id, source=source))
                chunks = self._chunk_text(text)
                for i, ch in enumerate(chunks):
                    chunk_texts.append(ch)
                    chunk_records.append({
                        "id": str(uuid.uuid4()),
                        "document_id": doc_id,
                        "chunk_index": i,
                        "text": ch,
                        "meta_data": d.get("meta_data") or d.get("metadata") or {},
                    })

            if not chunk_records:
                return {"added_docs": 0, "added_vectors": 0}


            embeddings = self._embed(chunk_texts)


            with self.SessionLocal() as session:
                with session.begin():
                    for doc in document_records:
                        existing = session.get(DocumentModel, doc.id)
                        if existing is None:
                            session.add(doc)
                    for rec, emb in zip(chunk_records, embeddings):
                        ch = ChunkModel(
                            id=rec["id"],
                            document_id=rec["document_id"],
                            chunk_index=rec["chunk_index"],
                            text=rec["text"],
                            meta_data=rec["meta_data"],
                            embedding=emb.tolist(),
                        )
                        session.add(ch)

            return {"added_docs": len(document_records), "added_vectors": len(chunk_records)}

    def reembed_all(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Recompute embeddings for all chunks (optionally filtered by user)."""
        with self.SessionLocal() as session:
            # Select chunks to re-embed
            stmt = select(ChunkModel.id, ChunkModel.text).join(DocumentModel, ChunkModel.document_id == DocumentModel.id)
            if user_id is not None:
                stmt = stmt.where(or_(DocumentModel.user_id == user_id, DocumentModel.user_id.is_(None)))
            rows = session.execute(stmt).all()
            if not rows:
                return {"total_vectors": 0}
            # Batch update
            batch_size = 512
            total = 0
            for i in range(0, len(rows), batch_size):
                batch = rows[i : i + batch_size]
                texts = [r[1] for r in batch]
                embs = self._embed(texts)
                id_to_emb = {batch[j][0]: embs[j].tolist() for j in range(len(batch))}
                with session.begin():
                    for cid, _ in batch:
                        session.query(ChunkModel).filter(ChunkModel.id == cid).update({ChunkModel.embedding: id_to_emb[cid]})
                total += len(batch)
            return {"total_vectors": total}

    # ------------------------
    # Static memory (users)
    # ------------------------
    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        with self.SessionLocal() as session:
            u = session.get(UserModel, user_id)
            if not u:
                return None
            return {
                "id": u.id,
                "name": u.name,
                "email": u.email,
                "profile": u.profile or {},
                "goals": u.goals or {},
                "metadata": u.meta_data or {},
                "created_at": u.created_at.isoformat() if u.created_at else None,
                "updated_at": u.updated_at.isoformat() if u.updated_at else None,
            }

    def upsert_user(
        self,
        user_id: str,
        name: Optional[str] = None,
        email: Optional[str] = None,
        profile: Optional[Dict[str, Any]] = None,
        goals: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        with self.SessionLocal() as session:
            with session.begin():
                u = session.get(UserModel, user_id)
                if u is None:
                    u = UserModel(
                        id=user_id,
                        name=name,
                        email=email,
                        profile=profile or {},
                        goals=goals or {},
                        meta_data=metadata or {},
                    )
                    session.add(u)
                else:
                    if name is not None:
                        u.name = name
                    if email is not None:
                        u.email = email
                    if profile is not None:
                        u.profile = profile
                    if goals is not None:
                        u.goals = goals
                    if metadata is not None:
                        u.meta_data = metadata
            res = self.get_user(user_id) or {"id": user_id}
        return res

    def _summarize_user(self, user: Optional[Dict[str, Any]]) -> str:
        if not user:
            return "(no user profile/goals available)"
        name = user.get("name") or ""
        profile = user.get("profile", {}) or {}
        goals = user.get("goals", {}) or {}
        metadata = user.get("meta_data", {}) or {}
        discovered = metadata.get("discovered", {}) or {}
        
        parts: List[str] = []
        
        # Basic info
        if name:
            parts.append(f"Name: {name}")
        
        # Profile fields (explicit onboarding data)
        for key in ["age", "height", "weight", "gender", "experience_level", "workout_preference", "schedule_preference"]:
            if key in profile and profile[key]:
                parts.append(f"{key}: {profile[key]}")
        
        # Goals
        for key in ["primary_goal", "goal", "split", "nutrition", "target_weight", "timeline"]:
            if key in goals and goals[key]:
                parts.append(f"{key}: {goals[key]}")
        
        # Discovered data (from chat conversations)
        for field, data in discovered.items():
            if isinstance(data, dict) and "value" in data:
                parts.append(f"{field}: {data['value']} (discovered)")
            elif data:  # Simple value
                parts.append(f"{field}: {data} (discovered)")
        
        # Injury safety flag (CRITICAL - always surface prominently)
        injuries = profile.get("injuries") or discovered.get("injuries", {}).get("value")
        injury_prefix = ""
        if injuries:
            injury_prefix = f"⚠️  INJURY/SAFETY ALERT: {injuries}\n\n"
        
        # Handle both "restrictions" and "constraints" fields (from onboarding step "notes")
        restrictions = profile.get("restrictions") or profile.get("constraints")
        if restrictions:
            injury_prefix += f"⚠️  RESTRICTIONS: {restrictions}\n\n"
        
        user_summary = "; ".join(parts) if parts else "(empty profile/goals)"
        return injury_prefix + user_summary

    # ------------------------
    # Dynamic memory (training logs)
    # ------------------------
    def add_training_log(
        self,
        user_id: str,
        notes: str,
        kind: Optional[str] = None,
        topic: Optional[str] = None,
        tags: Optional[List[str]] = None,
        occurred_at: Optional[datetime] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        text = (notes or "").strip()
        if not text:
            return {"inserted": 0}
        # Coerce occurred_at if given as string-like
        if isinstance(occurred_at, str):
            try:
                occurred_at = datetime.fromisoformat(occurred_at)
            except Exception:
                occurred_at = None
        
        # Embedding is required for "never forgets" - always generated (Modal with local fallback)
        embedding = None
        try:
            embedding = self._embed([text])[0].tolist()
        except Exception as e:
            # This should never happen with fallback
            self.logger.error("CRITICAL: Failed to generate embedding for training log even with fallback: %s", e, exc_info=True)
            self.logger.error("Training log created without embedding - breaks 'never forgets' feature")
            # Still create log, but investigate why fallback failed
        
        with self.SessionLocal() as session:
            with session.begin():
                log = TrainingLogModel(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    kind=kind or "event",
                    topic=topic,
                    tags=tags or [],
                    occurred_at=occurred_at or datetime.now(timezone.utc),
                    notes=text,
                    meta_data=metadata or {},
                    embedding=embedding,  # Can be None if embedding failed
                )
                session.add(log)
        return {"inserted": 1}

    def retrieve_training_logs(
        self,
        user_id: str,
        query: str,
        top_k: int = 5,
        topic: Optional[str] = None,
        tags_all: Optional[List[str]] = None,
        since: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        if not query.strip():
            return []
        k = max(1, top_k)
        qvec = self._embed([query])[0].tolist()
        with self.SessionLocal() as session:
            dist = TrainingLogModel.embedding.cosine_distance(qvec)
            stmt = select(TrainingLogModel).where(TrainingLogModel.user_id == user_id)
            if topic:
                stmt = stmt.where(TrainingLogModel.topic == topic)
            if since:
                stmt = stmt.where(TrainingLogModel.occurred_at >= since)
            if tags_all:
                # array contains-all
                stmt = stmt.where(TrainingLogModel.tags.contains(tags_all))
            stmt = stmt.order_by(dist).limit(k)
            rows = session.execute(stmt).scalars().all()
        out: List[Dict[str, Any]] = []
        for r in rows:
            out.append({
                "id": r.id,
                "kind": r.kind,
                "topic": r.topic,
                "tags": r.tags,
                "notes": r.notes,
                "metadata": r.meta_data or {},
                "occurred_at": r.occurred_at.isoformat() if r.occurred_at else None,
            })
        return out

    def get_training_history(self, user_id: str, limit: int = 100, since: Optional[datetime] = None) -> List[Dict[str, Any]]:
        with self.SessionLocal() as session:
            stmt = select(TrainingLogModel).where(TrainingLogModel.user_id == user_id)
            if since:
                stmt = stmt.where(TrainingLogModel.occurred_at >= since)
            stmt = stmt.order_by(TrainingLogModel.occurred_at.desc()).limit(limit)
            rows = session.execute(stmt).scalars().all()
        return [
            {
                "id": r.id,
                "kind": r.kind,
                "topic": r.topic,
                "tags": r.tags,
                "notes": r.notes,
                "metadata": r.meta_data or {},
                "occurred_at": r.occurred_at.isoformat() if r.occurred_at else None,
            }
            for r in rows
        ]

    # ------------------------
    # Workout session logging
    # ------------------------
    def log_workout_session(
        self,
        user_id: str,
        session_name: Optional[str],
        session_type: Optional[str],
        exercises: List[Dict[str, Any]],
        occurred_at: Optional[datetime] = None,
        duration_minutes: Optional[int] = None,
        notes: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Log a complete workout session with exercises."""
        session_id = str(uuid.uuid4())
        occurred = occurred_at or datetime.now(timezone.utc)
        
        with self.SessionLocal() as session:
            with session.begin():
                # Create workout session
                workout = WorkoutSessionModel(
                    id=session_id,
                    user_id=user_id,
                    session_name=session_name,
                    session_type=session_type,
                    occurred_at=occurred,
                    duration_minutes=duration_minutes,
                    notes=notes,
                    meta_data=metadata or {},
                )
                session.add(workout)
                
                # Create exercise logs
                exercise_ids = []
                for ex in exercises:
                    ex_id = str(uuid.uuid4())
                    exercise = ExerciseLogModel(
                        id=ex_id,
                        session_id=session_id,
                        user_id=user_id,
                        exercise_name=ex.get("exercise_name", "Unknown"),
                        exercise_category=ex.get("exercise_category"),
                        sets=ex.get("sets"),
                        reps=ex.get("reps"),
                        weights=ex.get("weights"),
                        duration_seconds=ex.get("duration_seconds"),
                        distance_meters=ex.get("distance_meters"),
                        notes=ex.get("notes"),
                        meta_data=ex.get("metadata") or {},
                    )
                    session.add(exercise)
                    exercise_ids.append(ex_id)
                
                # Also create a training log entry for RAG retrieval
                summary_parts = []
                if session_name:
                    summary_parts.append(f"Workout: {session_name}")
                if session_type:
                    summary_parts.append(f"Type: {session_type}")
                
                ex_names = [e.get("exercise_name", "") for e in exercises if e.get("exercise_name")]
                if ex_names:
                    summary_parts.append(f"Exercises: {', '.join(ex_names[:5])}")
                
                if notes:
                    summary_parts.append(f"Notes: {notes}")
                
                summary_text = "; ".join(summary_parts) if summary_parts else "Workout session completed"
                
                # Create training log for semantic retrieval - REQUIRED for "never forgets"
                # Embedding is always generated (Modal with local fallback ensures this)
                try:
                    embedding = self._embed([summary_text])[0].tolist()
                except Exception as e:
                    # This should never happen with fallback, but log if it does
                    self.logger.error("CRITICAL: Failed to generate embedding even with fallback: %s", e, exc_info=True)
                    # Still log workout, but this breaks "never forgets" - investigate immediately
                    self.logger.error("Workout logged without embedding - this breaks 'never forgets' feature! Investigation required.")
                    embedding = None  # Last resort - but this should never happen
                
                log = TrainingLogModel(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    kind="workout",
                    topic=session_name or session_type,
                    tags=ex_names[:10],  # tag with exercise names for easy filtering
                    occurred_at=occurred,
                    notes=summary_text,
                    meta_data={"session_id": session_id, "exercise_count": len(exercises)},
                    embedding=embedding,  # Can be None if embedding failed
                )
                session.add(log)
        
        # Auto-trigger workout summary if needed (monthly or milestone)
        try:
            from memory import should_generate_workout_summary, refresh_user_workout_memory
            should_gen, milestone = should_generate_workout_summary(self, user_id, check_milestone=True)
            if should_gen:
                # Generate summary asynchronously (fire and forget)
                import threading
                def generate_summary():
                    try:
                        result = refresh_user_workout_memory(self, user_id, n=15, milestone=milestone)
                        self.logger.info("Auto-generated workout summary for user %s (milestone: %s)", user_id, milestone)
                    except Exception as e:
                        self.logger.warning("Failed to auto-generate workout summary: %s", e)
                threading.Thread(target=generate_summary, daemon=True).start()
        except Exception as e:
            self.logger.debug("Workout summary check failed: %s", e)
        
        # Invalidate caches when new workout is logged
        try:
            cache_key = f"workout_hooks:{user_id}"
            if self._redis:
                try:
                    self._redis.delete(cache_key)
                    self.logger.debug("Invalidated workout hooks cache for user %s", user_id)
                except Exception as e:
                    self.logger.debug("Cache invalidation failed: %s", e)
            
            # Also invalidate in-memory caches
            if user_id in self._workout_hooks_cache:
                del self._workout_hooks_cache[user_id]
                self.logger.debug("Invalidated in-memory workout hooks cache for user %s", user_id)
            
            # Invalidate fitness overview and patterns cache (they depend on workout data)
            if user_id in self._fitness_overview_cache:
                del self._fitness_overview_cache[user_id]
                self.logger.debug("Invalidated fitness overview cache for user %s", user_id)
            
            if user_id in self._patterns_cache:
                del self._patterns_cache[user_id]
                self.logger.debug("Invalidated patterns cache for user %s", user_id)
            
            # Invalidate pre-loaded context cache (workout data changed)
            if user_id in self._user_context_cache:
                del self._user_context_cache[user_id]
                self.logger.debug("Invalidated pre-loaded context cache for user %s", user_id)
            
            # Invalidate calendar and weekly summary caches (workout data changed)
            if self._redis:
                try:
                    # Delete all calendar caches for this user (pattern: fitai:calendar:*)
                    # Use SCAN to find matching keys
                    pattern = f"{self.config.redis_prefix}:calendar:*"
                    cursor = 0
                    while True:
                        cursor, keys = self._redis.scan(cursor, match=pattern, count=100)
                        if keys:
                            self._redis.delete(*keys)
                        if cursor == 0:
                            break
                    self.logger.debug("Invalidated calendar caches for user %s", user_id)
                    
                    # Delete all weekly summary caches for this user
                    pattern = f"{self.config.redis_prefix}:weekly_summary:*"
                    cursor = 0
                    while True:
                        cursor, keys = self._redis.scan(cursor, match=pattern, count=100)
                        if keys:
                            self._redis.delete(*keys)
                        if cursor == 0:
                            break
                    self.logger.debug("Invalidated weekly summary caches for user %s", user_id)
                except Exception as e:
                    self.logger.debug("Calendar/weekly summary cache invalidation failed: %s", e)
        except Exception as e:
            self.logger.debug("Cache invalidation check failed: %s", e)
        
        return {
            "session_id": session_id,
            "exercise_count": len(exercises),
            "inserted": True,
        }

    def get_workout_session(
        self,
        user_id: str,
        session_id: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get full workout session details including all exercises.
        Returns None if session not found or user doesn't own it.
        """
        with self.SessionLocal() as session:
            workout = session.get(WorkoutSessionModel, session_id)
            if not workout or workout.user_id != user_id:
                return None
            
            # Get all exercises for this session
            exercises = session.execute(
                select(ExerciseLogModel)
                .where(ExerciseLogModel.session_id == session_id)
                .order_by(ExerciseLogModel.created_at.asc())
            ).scalars().all()
            
            exercise_list = []
            for ex in exercises:
                exercise_list.append({
                    "exercise_name": ex.exercise_name,
                    "exercise_category": ex.exercise_category,
                    "sets": ex.sets,
                    "reps": ex.reps,
                    "weights": ex.weights,
                    "duration_seconds": ex.duration_seconds,
                    "distance_meters": ex.distance_meters,
                    "notes": ex.notes,
                    "metadata": ex.meta_data or {},
                })
            
            return {
                "session_id": workout.id,
                "session_name": workout.session_name,
                "session_type": workout.session_type,
                "occurred_at": workout.occurred_at.isoformat() if workout.occurred_at else None,
                "duration_minutes": workout.duration_minutes,
                "notes": workout.notes,
                "metadata": workout.meta_data or {},
                "exercises": exercise_list,
            }

    def update_workout_session(
        self,
        user_id: str,
        session_id: str,
        session_name: Optional[str],
        session_type: Optional[str],
        exercises: List[Dict[str, Any]],
        occurred_at: Optional[datetime] = None,
        duration_minutes: Optional[int] = None,
        notes: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Update an existing workout session.
        - Verifies user owns the session
        - Deletes old exercises and inserts new ones
        - Updates session metadata
        - Updates training log embedding for RAG
        """
        with self.SessionLocal() as session:
            with session.begin():
                # Verify session exists and user owns it
                workout = session.get(WorkoutSessionModel, session_id)
                if not workout:
                    raise ValueError("Workout session not found")
                if workout.user_id != user_id:
                    raise ValueError("Access denied: You don't own this workout")
                
                # Update workout session fields
                if session_name is not None:
                    workout.session_name = session_name
                if session_type is not None:
                    workout.session_type = session_type
                if occurred_at is not None:
                    workout.occurred_at = occurred_at
                if duration_minutes is not None:
                    workout.duration_minutes = duration_minutes
                if notes is not None:
                    workout.notes = notes
                if metadata is not None:
                    workout.meta_data = metadata
                
                # Delete old exercises (cascade will handle this, but explicit is clearer)
                session.execute(
                    delete(ExerciseLogModel).where(ExerciseLogModel.session_id == session_id)
                )
                
                # Insert new exercises
                exercise_ids = []
                for ex in exercises:
                    ex_id = str(uuid.uuid4())
                    exercise = ExerciseLogModel(
                        id=ex_id,
                        session_id=session_id,
                        user_id=user_id,
                        exercise_name=ex.get("exercise_name", "Unknown"),
                        exercise_category=ex.get("exercise_category"),
                        sets=ex.get("sets"),
                        reps=ex.get("reps"),
                        weights=ex.get("weights"),
                        duration_seconds=ex.get("duration_seconds"),
                        distance_meters=ex.get("distance_meters"),
                        notes=ex.get("notes"),
                        meta_data=ex.get("metadata") or {},
                    )
                    session.add(exercise)
                    exercise_ids.append(ex_id)
                
                # Update training log entry for RAG retrieval
                # Find the training log associated with this session
                training_log = session.execute(
                    select(TrainingLogModel)
                    .where(
                        TrainingLogModel.user_id == user_id,
                        TrainingLogModel.meta_data["session_id"].astext == session_id
                    )
                ).scalar_one_or_none()
                
                if training_log:
                    # Update training log summary
                    summary_parts = []
                    if session_name:
                        summary_parts.append(f"Workout: {session_name}")
                    if session_type:
                        summary_parts.append(f"Type: {session_type}")
                    
                    ex_names = [e.get("exercise_name", "") for e in exercises if e.get("exercise_name")]
                    if ex_names:
                        summary_parts.append(f"Exercises: {', '.join(ex_names[:5])}")
                    
                    if notes:
                        summary_parts.append(f"Notes: {notes}")
                    
                    summary_text = "; ".join(summary_parts) if summary_parts else "Workout session completed"
                    
                    # Update embedding - REQUIRED for "never forgets"
                    try:
                        embedding = self._embed([summary_text])[0].tolist()
                        training_log.notes = summary_text
                        training_log.embedding = embedding
                        training_log.tags = ex_names[:10]
                        if occurred_at:
                            training_log.occurred_at = occurred_at
                    except Exception as e:
                        # This should never happen with fallback
                        self.logger.error("CRITICAL: Failed to update training log embedding even with fallback: %s", e, exc_info=True)
                        # Continue without embedding - update other fields
                        training_log.notes = summary_text
                        training_log.tags = ex_names[:10]
                        if occurred_at:
                            training_log.occurred_at = occurred_at
                        # Log warning but don't fail - workout update still succeeds
                        self.logger.warning("Workout updated but embedding failed - may break 'never forgets' for this workout")
                
                session.flush()
        
        # Invalidate caches (same as log_workout_session)
        try:
            cache_key = f"workout_hooks:{user_id}"
            if self._redis:
                try:
                    self._redis.delete(cache_key)
                    self.logger.debug("Invalidated workout hooks cache for user %s", user_id)
                except Exception as e:
                    self.logger.debug("Cache invalidation failed: %s", e)
            
            if user_id in self._workout_hooks_cache:
                del self._workout_hooks_cache[user_id]
                self.logger.debug("Invalidated in-memory workout hooks cache for user %s", user_id)
            
            if user_id in self._fitness_overview_cache:
                del self._fitness_overview_cache[user_id]
                self.logger.debug("Invalidated fitness overview cache for user %s", user_id)
            
            if user_id in self._patterns_cache:
                del self._patterns_cache[user_id]
                self.logger.debug("Invalidated patterns cache for user %s", user_id)
            
            if user_id in self._user_context_cache:
                del self._user_context_cache[user_id]
                self.logger.debug("Invalidated pre-loaded context cache for user %s", user_id)
            
            # Invalidate calendar and weekly summary caches (workout data changed)
            if self._redis:
                try:
                    # Delete all calendar caches for this user (pattern: fitai:calendar:*)
                    pattern = f"{self.config.redis_prefix}:calendar:*"
                    cursor = 0
                    while True:
                        cursor, keys = self._redis.scan(cursor, match=pattern, count=100)
                        if keys:
                            self._redis.delete(*keys)
                        if cursor == 0:
                            break
                    self.logger.debug("Invalidated calendar caches for user %s", user_id)
                    
                    # Delete all weekly summary caches for this user
                    pattern = f"{self.config.redis_prefix}:weekly_summary:*"
                    cursor = 0
                    while True:
                        cursor, keys = self._redis.scan(cursor, match=pattern, count=100)
                        if keys:
                            self._redis.delete(*keys)
                        if cursor == 0:
                            break
                    self.logger.debug("Invalidated weekly summary caches for user %s", user_id)
                except Exception as e:
                    self.logger.debug("Calendar/weekly summary cache invalidation failed: %s", e)
        except Exception as e:
            self.logger.debug("Cache invalidation check failed: %s", e)
        
        return {
            "session_id": session_id,
            "exercise_count": len(exercises),
            "updated": True,
        }

    def get_workout_calendar(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Get workout sessions for calendar display with enhanced fields.
        
        Cached for 5 minutes (300 seconds) to reduce database load for high-traffic endpoint.
        Cache is invalidated when workouts are logged or updated.
        """
        import json
        import hashlib
        
        # Build cache key based on parameters
        cache_params = {
            "user_id": user_id,
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
            "limit": limit,
        }
        cache_key_str = json.dumps(cache_params, sort_keys=True)
        cache_key_hash = hashlib.md5(cache_key_str.encode('utf-8')).hexdigest()
        cache_key = f"{self.config.redis_prefix}:calendar:{cache_key_hash}"
        
        # Try to get from cache (Redis or in-memory)
        cached_result = None
        
        # Check Redis first
        if self._redis:
            try:
                cached = self._redis.get(cache_key)
                if cached:
                    cached_result = json.loads(cached)
                    self.logger.debug("Retrieved workout calendar from Redis cache for user %s", user_id)
            except Exception as e:
                self.logger.debug("Redis cache lookup failed: %s", e)
        
        # If cached, return it
        if cached_result is not None:
            return cached_result
        def calc_volume(e: ExerciseLogModel) -> float:
            """Calculate volume (sets × reps × weight) for an exercise."""
            if not e.sets or not e.reps or not e.weights:
                return 0.0
            vol = 0.0
            for i in range(min(len(e.reps), len(e.weights))):
                try:
                    weight_str = str(e.weights[i]).strip().upper()
                    if weight_str == "BW" or weight_str == "BODYWEIGHT":
                        continue
                    if "KG" in weight_str:
                        weight_val = float(weight_str.replace("KG", "").strip())
                    elif "LBS" in weight_str or "LB" in weight_str:
                        weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                    else:
                        weight_val = float(weight_str)
                    vol += int(e.reps[i]) * weight_val
                except (ValueError, IndexError):
                    continue
            return vol
        
        def extract_muscle_groups(exercise_name: str) -> List[str]:
            """Extract muscle groups from exercise name."""
            ex_lower = exercise_name.lower()
            groups = []
            if any(kw in ex_lower for kw in ["bench", "press", "chest", "push", "pec"]):
                groups.append("chest")
            if any(kw in ex_lower for kw in ["shoulder", "deltoid", "lateral", "front raise", "overhead"]):
                groups.append("shoulders")
            if any(kw in ex_lower for kw in ["tricep", "dip", "extension"]):
                groups.append("triceps")
            if any(kw in ex_lower for kw in ["pull", "row", "back", "lat", "pull-up", "chin-up"]):
                groups.append("back")
            if any(kw in ex_lower for kw in ["bicep", "curl"]):
                groups.append("biceps")
            if any(kw in ex_lower for kw in ["squat", "leg", "lunge", "calf", "quad", "hamstring", "leg press"]):
                groups.append("legs")
            if any(kw in ex_lower for kw in ["deadlift"]):
                groups.append("back")
                groups.append("legs")
            return list(set(groups))  # Remove duplicates
        
        def check_has_pr(session_id: str, user_id: str, exercises: List[ExerciseLogModel]) -> bool:
            """Check if session has any PRs."""
            with self.SessionLocal() as session:
                for ex in exercises:
                    exercise_name = ex.exercise_name
                    if not exercise_name:
                        continue
                    
                    # Get max weight from current session
                    curr_max = 0.0
                    if ex.weights:
                        for w_str in ex.weights:
                            try:
                                weight_str = str(w_str).strip().upper()
                                if weight_str == "BW" or weight_str == "BODYWEIGHT":
                                    continue
                                if "KG" in weight_str:
                                    weight_val = float(weight_str.replace("KG", "").strip())
                                elif "LBS" in weight_str or "LB" in weight_str:
                                    weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                                else:
                                    weight_val = float(weight_str)
                                curr_max = max(curr_max, weight_val)
                            except (ValueError, AttributeError):
                                continue
                    
                    if curr_max == 0:
                        continue
                    
                    # Find previous max for this exercise
                    prev_exercises = session.execute(
                        select(ExerciseLogModel, WorkoutSessionModel)
                        .join(WorkoutSessionModel, ExerciseLogModel.session_id == WorkoutSessionModel.id)
                        .where(
                            ExerciseLogModel.user_id == user_id,
                            ExerciseLogModel.exercise_name == exercise_name,
                            ExerciseLogModel.session_id != session_id,
                        )
                        .order_by(WorkoutSessionModel.occurred_at.desc())
                    ).all()
                    
                    prev_max = 0.0
                    for prev_ex, prev_sess in prev_exercises:
                        if prev_ex.weights:
                            for w_str in prev_ex.weights:
                                try:
                                    weight_str = str(w_str).strip().upper()
                                    if weight_str == "BW" or weight_str == "BODYWEIGHT":
                                        continue
                                    if "KG" in weight_str:
                                        weight_val = float(weight_str.replace("KG", "").strip())
                                    elif "LBS" in weight_str or "LB" in weight_str:
                                        weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                                    else:
                                        weight_val = float(weight_str)
                                    prev_max = max(prev_max, weight_val)
                                except (ValueError, AttributeError):
                                    continue
                        if prev_max > 0:
                            break
                    
                    # If current max > previous max, it's a PR
                    if curr_max > prev_max:
                        return True
            return False
        
        def calculate_intensity_level(volume_kg: float, avg_session_volume: Optional[float] = None) -> str:
            """Calculate intensity level based on volume."""
            if volume_kg == 0:
                return "light"
            
            # If we have average, use relative comparison
            if avg_session_volume and avg_session_volume > 0:
                ratio = volume_kg / avg_session_volume
                if ratio >= 1.5:
                    return "very_heavy"
                elif ratio >= 1.2:
                    return "heavy"
                elif ratio >= 0.8:
                    return "medium"
                else:
                    return "light"
            
            # Fallback: absolute thresholds (kg)
            if volume_kg >= 3000:
                return "very_heavy"
            elif volume_kg >= 2000:
                return "heavy"
            elif volume_kg >= 1000:
                return "medium"
            else:
                return "light"
        
        with self.SessionLocal() as session:
            stmt = select(WorkoutSessionModel).where(WorkoutSessionModel.user_id == user_id)
            if start_date:
                stmt = stmt.where(WorkoutSessionModel.occurred_at >= start_date)
            if end_date:
                stmt = stmt.where(WorkoutSessionModel.occurred_at <= end_date)
            stmt = stmt.order_by(WorkoutSessionModel.occurred_at.desc()).limit(limit)
            rows = session.execute(stmt).scalars().all()
            
            # Get average session volume for intensity calculation
            all_workouts = session.execute(
                select(WorkoutSessionModel).where(WorkoutSessionModel.user_id == user_id)
            ).scalars().all()
            
            avg_volume = None
            if all_workouts:
                total_vol = 0.0
                count = 0
                for w in all_workouts[:30]:  # Last 30 sessions for average
                    exercises = session.execute(
                        select(ExerciseLogModel).where(ExerciseLogModel.session_id == w.id)
                    ).scalars().all()
                    vol = sum(calc_volume(e) for e in exercises)
                    if vol > 0:
                        total_vol += vol
                        count += 1
                if count > 0:
                    avg_volume = total_vol / count
        
        result = []
        for r in rows:
            # Get exercises for this session
            with self.SessionLocal() as session:
                exercises = session.execute(
                    select(ExerciseLogModel).where(ExerciseLogModel.session_id == r.id)
                ).scalars().all()
            
            # Calculate volume
            volume_kg = round(sum(calc_volume(e) for e in exercises), 1)
            
            # Count exercises
            exercise_count = len(exercises)
            
            # Extract muscle groups
            all_muscle_groups = []
            for ex in exercises:
                if ex.exercise_name:
                    groups = extract_muscle_groups(ex.exercise_name)
                    all_muscle_groups.extend(groups)
            muscle_groups = list(set(all_muscle_groups))  # Remove duplicates
            
            # Check for PRs
            has_pr = check_has_pr(r.id, user_id, exercises)
            
            # Calculate intensity
            intensity_level = calculate_intensity_level(volume_kg, avg_volume)
            
            result.append({
                "session_id": r.id,
                "session_name": r.session_name,
                "session_type": r.session_type,
                "occurred_at": r.occurred_at.isoformat() if r.occurred_at else None,
                "duration_minutes": r.duration_minutes,
                "notes": r.notes,
                "metadata": r.meta_data or {},
                # Enhanced fields
                "volume_kg": volume_kg,
                "exercise_count": exercise_count,
                "has_pr": has_pr,
                "muscle_groups": muscle_groups,
                "intensity_level": intensity_level,
            })
        
        # Cache the result for 5 minutes (300 seconds)
        if self._redis:
            try:
                self._redis.setex(cache_key, 300, json.dumps(result))
                self.logger.debug("Cached workout calendar for user %s (expires in 5 min)", user_id)
            except Exception as e:
                self.logger.debug("Redis cache store failed: %s", e)
        
        return result

    def get_weekly_summary(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        Get 7 individual days (Mon-Sun) for horizontal scrolling strip.
        Returns one week of days. Frontend swipes to get next/previous week.
        
        Cached for 5 minutes (300 seconds) to reduce database load for high-traffic endpoint.
        Cache is invalidated when workouts are logged or updated.
        """
        import json
        import hashlib
        from datetime import timedelta
        
        # Build cache key based on parameters
        cache_params = {
            "user_id": user_id,
            "start_date": start_date.isoformat() if start_date else None,
        }
        cache_key_str = json.dumps(cache_params, sort_keys=True)
        cache_key_hash = hashlib.md5(cache_key_str.encode('utf-8')).hexdigest()
        cache_key = f"{self.config.redis_prefix}:weekly_summary:{cache_key_hash}"
        
        # Try to get from cache (Redis)
        cached_result = None
        
        # Check Redis first
        if self._redis:
            try:
                cached = self._redis.get(cache_key)
                if cached:
                    cached_result = json.loads(cached)
                    self.logger.debug("Retrieved weekly summary from Redis cache for user %s", user_id)
            except Exception as e:
                self.logger.debug("Redis cache lookup failed: %s", e)
        
        # If cached, return it
        if cached_result is not None:
            return cached_result
        
        def calc_volume(e: ExerciseLogModel) -> float:
            """Calculate volume (sets × reps × weight) for an exercise."""
            if not e.sets or not e.reps or not e.weights:
                return 0.0
            vol = 0.0
            for i in range(min(len(e.reps), len(e.weights))):
                try:
                    weight_str = str(e.weights[i]).strip().upper()
                    if weight_str == "BW" or weight_str == "BODYWEIGHT":
                        continue
                    if "KG" in weight_str:
                        weight_val = float(weight_str.replace("KG", "").strip())
                    elif "LBS" in weight_str or "LB" in weight_str:
                        weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                    else:
                        weight_val = float(weight_str)
                    vol += int(e.reps[i]) * weight_val
                except (ValueError, IndexError):
                    continue
            return vol
        
        def check_has_pr(session_id: str, user_id: str, exercises: List[ExerciseLogModel]) -> bool:
            """Check if session has any PRs."""
            with self.SessionLocal() as session:
                for ex in exercises:
                    exercise_name = ex.exercise_name
                    if not exercise_name:
                        continue
                    
                    curr_max = 0.0
                    if ex.weights:
                        for w_str in ex.weights:
                            try:
                                weight_str = str(w_str).strip().upper()
                                if weight_str == "BW" or weight_str == "BODYWEIGHT":
                                    continue
                                if "KG" in weight_str:
                                    weight_val = float(weight_str.replace("KG", "").strip())
                                elif "LBS" in weight_str or "LB" in weight_str:
                                    weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                                else:
                                    weight_val = float(weight_str)
                                curr_max = max(curr_max, weight_val)
                            except (ValueError, AttributeError):
                                continue
                    
                    if curr_max == 0:
                        continue
                    
                    # Find previous max for this exercise
                    prev_ex = session.execute(
                        select(ExerciseLogModel, WorkoutSessionModel)
                        .join(WorkoutSessionModel, ExerciseLogModel.session_id == WorkoutSessionModel.id)
                        .where(
                            ExerciseLogModel.user_id == user_id,
                            ExerciseLogModel.exercise_name == exercise_name,
                            ExerciseLogModel.session_id != session_id,
                        )
                        .order_by(WorkoutSessionModel.occurred_at.desc())
                        .limit(1)
                    ).first()
                    
                    if prev_ex:
                        prev_ex_model, _ = prev_ex
                        prev_max = 0.0
                        if prev_ex_model.weights:
                            for w_str in prev_ex_model.weights:
                                try:
                                    weight_str = str(w_str).strip().upper()
                                    if weight_str == "BW" or weight_str == "BODYWEIGHT":
                                        continue
                                    if "KG" in weight_str:
                                        weight_val = float(weight_str.replace("KG", "").strip())
                                    elif "LBS" in weight_str or "LB" in weight_str:
                                        weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                                    else:
                                        weight_val = float(weight_str)
                                    prev_max = max(prev_max, weight_val)
                                except (ValueError, AttributeError):
                                    continue
                        if curr_max > prev_max:
                            return True
            return False
        
        def calculate_intensity_level(volume_kg: float, avg_session_volume: Optional[float] = None) -> str:
            """Calculate intensity level based on volume."""
            if volume_kg == 0:
                return "light"
            
            if avg_session_volume and avg_session_volume > 0:
                ratio = volume_kg / avg_session_volume
                if ratio >= 1.5:
                    return "very_heavy"
                elif ratio >= 1.2:
                    return "heavy"
                elif ratio >= 0.8:
                    return "medium"
                else:
                    return "light"
            
            # Fallback: absolute thresholds
            if volume_kg >= 3000:
                return "very_heavy"
            elif volume_kg >= 2000:
                return "heavy"
            elif volume_kg >= 1000:
                return "medium"
            else:
                return "light"
        
        # Calculate week start (Monday)
        now = datetime.now(timezone.utc)
        if start_date is None:
            # Get Monday of current week
            days_since_monday = now.weekday()
            week_start = (now - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        else:
            # Ensure start_date is Monday
            days_since_monday = start_date.weekday()
            week_start = (start_date - timedelta(days=days_since_monday)).replace(hour=0, minute=0, second=0, microsecond=0)
        
        week_end = week_start + timedelta(days=6, hours=23, minutes=59, seconds=59)
        is_current_week = (week_start <= now <= week_end)
        
        # Get all workouts for this week
        with self.SessionLocal() as session:
            workouts = session.execute(
                select(WorkoutSessionModel)
                .where(WorkoutSessionModel.user_id == user_id)
                .where(WorkoutSessionModel.occurred_at >= week_start)
                .where(WorkoutSessionModel.occurred_at <= week_end)
                .order_by(WorkoutSessionModel.occurred_at.asc())
            ).scalars().all()
            
            # Get average session volume for intensity calculation
            all_workouts = session.execute(
                select(WorkoutSessionModel).where(WorkoutSessionModel.user_id == user_id)
            ).scalars().all()
            
            avg_volume = None
            if all_workouts:
                total_vol = 0.0
                count = 0
                for w in all_workouts[:30]:  # Last 30 sessions for average
                    exercises = session.execute(
                        select(ExerciseLogModel).where(ExerciseLogModel.session_id == w.id)
                    ).scalars().all()
                    vol = sum(calc_volume(e) for e in exercises)
                    if vol > 0:
                        total_vol += vol
                        count += 1
                if count > 0:
                    avg_volume = total_vol / count
        
        # Create a map of workouts by date (day of week)
        workouts_by_date = {}
        for workout in workouts:
            if workout.occurred_at:
                day_key = workout.occurred_at.date()
                workouts_by_date[day_key] = workout
        
        # Generate 7 days (Mon-Sun)
        days = []
        day_names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        
        for i in range(7):
            current_date = week_start + timedelta(days=i)
            day_date = current_date.date()
            
            # Check if there's a workout on this day
            workout = workouts_by_date.get(day_date)
            
            if workout:
                # Get exercises for this workout
                with self.SessionLocal() as day_session:
                    exercises = day_session.execute(
                        select(ExerciseLogModel).where(ExerciseLogModel.session_id == workout.id)
                    ).scalars().all()
                
                volume_kg = round(sum(calc_volume(e) for e in exercises), 1)
                exercise_count = len(exercises)
                has_pr = check_has_pr(workout.id, user_id, exercises)
                intensity_level = calculate_intensity_level(volume_kg, avg_volume)
                
                days.append({
                    "date": current_date.isoformat(),
                    "day_name": day_names[i],
                    "day_number": current_date.day,
                    "has_workout": True,
                    "session_id": workout.id,
                    "volume_kg": volume_kg,
                    "intensity_level": intensity_level,
                    "has_pr": has_pr,
                    "exercise_count": exercise_count,
                })
            else:
                # No workout on this day
                days.append({
                    "date": current_date.isoformat(),
                    "day_name": day_names[i],
                    "day_number": current_date.day,
                    "has_workout": False,
                    "session_id": None,
                    "volume_kg": 0.0,
                    "intensity_level": "light",
                    "has_pr": False,
                    "exercise_count": 0,
                })
        
        result = {
            "days": days,
            "week_start": week_start.isoformat(),
            "week_end": week_end.isoformat(),
            "is_current_week": is_current_week,
        }
        
        # Cache the result for 5 minutes (300 seconds)
        if self._redis:
            try:
                self._redis.setex(cache_key, 300, json.dumps(result))
                self.logger.debug("Cached weekly summary for user %s (expires in 5 min)", user_id)
            except Exception as e:
                self.logger.debug("Redis cache store failed: %s", e)
        
        return result

    def get_recent_workout_insights_hooks(self, user_id: str, limit: int = 2) -> List[str]:
        """Get conversation hooks from recent workout insights for chatbot context.
        
        Uses caching to avoid regenerating insights on every chat request.
        Cache expires after 1 hour or when new workouts are logged.
        """
        try:
            import json
            
            # Check cache first (Redis or in-memory)
            cache_key = f"workout_hooks:{user_id}"
            cached_hooks = None
            
            # Try Redis first
            if self._redis:
                try:
                    cached = self._redis.get(cache_key)
                    if cached:
                        cached_hooks = json.loads(cached)
                        self.logger.debug("Retrieved workout hooks from Redis cache for user %s", user_id)
                except Exception as e:
                    self.logger.debug("Redis cache lookup failed: %s", e)
            
            # Fallback to in-memory cache if Redis unavailable
            if cached_hooks is None:
                if user_id in self._workout_hooks_cache:
                    hooks, timestamp = self._workout_hooks_cache[user_id]
                    # Check if cache is still valid (1 hour)
                    if time.time() - timestamp < 3600:
                        cached_hooks = hooks
                        self.logger.debug("Retrieved workout hooks from in-memory cache for user %s", user_id)
                    else:
                        # Cache expired, remove it
                        del self._workout_hooks_cache[user_id]
            
            # If cached, return it
            if cached_hooks is not None:
                return cached_hooks
            
            # Cache miss - generate hooks
            recent_sessions = self.get_workout_calendar(user_id=user_id, limit=limit)
            hooks = []
            
            for session in recent_sessions:
                session_id = session.get("session_id")
                if session_id:
                    # Get insights for this session
                    insights_result = self.get_workout_insights(user_id=user_id, session_id=session_id)
                    if "error" not in insights_result:
                        hooks.extend(insights_result.get("conversation_hooks", []))
            
            # Remove duplicates and return top 5
            result = list(dict.fromkeys(hooks))[:5]
            
            # Cache for 1 hour (Redis and in-memory)
            if self._redis:
                try:
                    self._redis.setex(cache_key, 3600, json.dumps(result))
                    self.logger.debug("Cached workout hooks for user %s (expires in 1 hour)", user_id)
                except Exception as e:
                    self.logger.debug("Redis cache store failed: %s", e)
            
            # Also cache in memory
            self._workout_hooks_cache[user_id] = (result, time.time())
            
            return result
        except Exception as e:
            self.logger.warning("Failed to get recent workout insights hooks: %s", e)
            return []

    def _generate_insight_message(self, insight_type: str, context: Dict[str, Any]) -> str:
        """
        Generate an AI-powered analytical insight message using the LLM.
        Focuses on hard stats, patterns, and actionable data rather than just encouragement.
        """
        try:
            # Build analytical context prompt based on insight type
            if insight_type == "consistency":
                workout_count_7d = context.get('workout_count_7d', 0)
                workout_count_30d = context.get('workout_count_30d', 0)
                total_count = context.get('total_count', 0)
                consecutive_days = context.get('consecutive_days', 0)
                milestone = context.get('milestone', 'none')
                
                frequency_rate = (workout_count_7d / 7) * 100 if workout_count_7d > 0 else 0
                
                prompt_context = f"""Analyze workout consistency patterns:
- Sessions this week: {workout_count_7d} sessions in last 7 days ({frequency_rate:.1f}% frequency)
- Sessions this month: {workout_count_30d} sessions in last 30 days
- Total logged sessions: {total_count}
- Current streak: {consecutive_days} consecutive days
- Milestone: {milestone}

Generate an analytical insight that highlights the actual consistency metrics. Include specific numbers and patterns. Be direct and data-focused. Example format: "{workout_count_7d} sessions logged in the last 7 days ({frequency_rate:.0f}% frequency), with a {consecutive_days}-day streak. This indicates [analysis of pattern]." Keep it concise (2-3 sentences max)."""
            
            elif insight_type == "recovery":
                days_since_last = context.get('days_since_last', 0)
                workout_count_7d = context.get('workout_count_7d', 0)
                situation = context.get('situation', 'normal')
                avg_recovery_days = context.get('avg_recovery_days', None)
                
                if situation == "overtraining":
                    recovery_rate = (workout_count_7d / 7) * 100
                    prompt_context = f"""Analyze recovery pattern:
- Workouts this week: {workout_count_7d} sessions
- Weekly frequency: {recovery_rate:.1f}%
- Days since last workout: {days_since_last}
- Average recovery window: {avg_recovery_days if avg_recovery_days else 'N/A'} days

Generate an analytical insight about recovery patterns. Point out the frequency and potential overtraining risk. Include specific stats. Example: "You've trained {workout_count_7d} times this week ({recovery_rate:.0f}% frequency). Your average recovery window is {avg_recovery_days if avg_recovery_days else 'X'} days. [Analysis of recovery adequacy]." Keep it direct and data-focused (2 sentences max)."""
                elif situation == "back_next_day":
                    prompt_context = f"""Analyze recovery pattern:
- Days since last workout: {days_since_last} (same day)
- Workouts this week: {workout_count_7d}
- Average recovery window: {avg_recovery_days if avg_recovery_days else 'N/A'} days

Generate an analytical insight about same-day training. Include the recovery window and frequency stats. Be direct about the pattern. Keep it concise (1-2 sentences)."""
                else:
                    prompt_context = f"""Analyze recovery pattern:
- Days since last workout: {days_since_last} days
- Workouts this week: {workout_count_7d}
- Average recovery window: {avg_recovery_days if avg_recovery_days else 'N/A'} days

Generate an analytical insight comparing the current break duration to typical recovery windows. Include specific days and frequency. Keep it concise (1-2 sentences)."""
            
            elif insight_type == "pr_context":
                exercise_name = context.get('exercise_name', 'unknown')
                weight_increase = context.get('weight_increase', 0)
                days_since_last_pr = context.get('days_since_last_pr', 0)
                prs_this_month = context.get('prs_this_month', 0)
                is_all_time = context.get('is_all_time', False)
                situation = context.get('situation', 'regular_pr')
                
                pr_type = "all-time PR" if is_all_time else "PR"
                weight_pct = (weight_increase / (context.get('prev_weight', weight_increase) or 1)) * 100 if context.get('prev_weight') else 0
                
                prompt_context = f"""Analyze personal record achievement:
- Exercise: {exercise_name}
- Weight increase: +{weight_increase:.1f}kg ({weight_pct:.1f}% increase)
- Type: {pr_type}
- Days since last PR: {days_since_last_pr if days_since_last_pr > 0 else 'N/A'}
- PRs this month: {prs_this_month}
- Situation: {situation}

Generate an analytical insight about the PR. Include the exact weight increase, percentage gain, and context (streak, comeback, etc.). Be data-focused. Example: "New {pr_type} for {exercise_name}: +{weight_increase:.1f}kg ({weight_pct:.1f}% increase). This is your {prs_this_month} PR this month. [Analysis of progression pattern]." Keep it concise (2 sentences max)."""
            
            elif insight_type == "exercise":
                exercise_name = context.get('exercise_name', 'unknown')
                status = context.get('status', 'unknown')
                delta_pct = context.get('delta_pct', 0)
                weight_increase = context.get('weight_increase', None)
                volume_trend = context.get('volume_trend', None)
                frequency_days = context.get('frequency_days', None)
                
                trend_note = ""
                if volume_trend:
                    trend_note = f" Volume trend: {volume_trend}."
                if frequency_days:
                    trend_note += f" Last performed {frequency_days} days ago."
                
                prompt_context = f"""Analyze exercise performance:
- Exercise: {exercise_name}
- Status: {status}
- Volume change: {delta_pct:+.1f}%
- Weight increase: {weight_increase if weight_increase else 'N/A'}
{trend_note}

Generate an analytical insight about this exercise's performance. Include the exact percentage change, what it means statistically, and any patterns. Be direct and data-focused. Example: "{exercise_name} volume changed by {delta_pct:+.1f}% vs last session. This indicates [analysis]. [Pattern observation if applicable]." Keep it concise (2 sentences max)."""
            
            else:
                prompt_context = f"""Analyze workout data:
{context}

Generate an analytical insight based on the data above. Include specific numbers and patterns. Be direct and data-focused. Keep it concise (2 sentences max)."""
            
            # Create system message focused on analytical insights
            system_msg = "You are FitAI, an analytical AI fitness coach. Your role is to provide data-driven insights, statistical patterns, and actionable observations from workout logs. Be direct, factual, and focus on numbers and patterns. Avoid generic encouragement - provide actual analysis."
            
            # Generate the message
            messages = [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": prompt_context}
            ]
            
            # Use local generation if available
            if self.config.gen_backend == "local" and self.generator_model and self.generator_tokenizer:
                self.logger.info("Attempting AI generation for insight_type=%s", insight_type)
                # Apply chat template if available
                if hasattr(self.generator_tokenizer, "apply_chat_template") and getattr(self.generator_tokenizer, "chat_template", None):
                    try:
                        prompt = self.generator_tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                        self.logger.debug("Using chat template for prompt")
                    except Exception as e:
                        self.logger.warning("Chat template failed, using fallback: %s", e)
                        prompt = f"{system_msg}\n\n{prompt_context}\n\nAssistant:"
                else:
                    prompt = f"{system_msg}\n\n{prompt_context}\n\nAssistant:"
                
                self.logger.debug("Prompt length: %d chars, preview: %s", len(prompt), prompt[:100])
                
                inputs = self.generator_tokenizer(prompt, return_tensors="pt", padding=True, truncation=False)
                device_str = self._resolve_torch_device()
                
                # Get model device first
                model_device = next(self.generator_model.parameters()).device
                
                # Move inputs to match model device (critical fix)
                if hasattr(inputs, "get"):
                    inputs = {k: v.to(model_device) if hasattr(v, "to") else v for k, v in inputs.items()}
                else:
                    # If inputs is a dict-like object, convert items
                    inputs = {k: v.to(model_device) if hasattr(v, "to") else v for k, v in inputs.items()}
                
                input_length = inputs["input_ids"].shape[1]
                self.logger.debug("Model device: %s, Input device: %s, Input length: %d tokens", 
                                 model_device, inputs["input_ids"].device if "input_ids" in inputs else "unknown", input_length)
                
                # Ensure pad_token_id is set
                pad_token_id = self.generator_tokenizer.pad_token_id
                if pad_token_id is None:
                    pad_token_id = self.generator_tokenizer.eos_token_id
                    self.logger.debug("Using eos_token_id as pad_token_id: %s", pad_token_id)
                
                eos_token_id = self.generator_tokenizer.eos_token_id
                self.logger.debug("Generation params: max_new_tokens=120, temperature=0.5, pad_token_id=%s, eos_token_id=%s", 
                                 pad_token_id, eos_token_id)
                
                import torch
                with torch.no_grad():
                    try:
                        outputs = self.generator_model.generate(
                            **inputs,
                            max_new_tokens=120,  # Increased for analytical insights
                            temperature=0.5,  # Lower temp for more analytical output
                            do_sample=True,
                            pad_token_id=pad_token_id,
                            eos_token_id=eos_token_id,
                            top_p=0.9,
                            repetition_penalty=1.1,
                            use_cache=False,  # Fixes DynamicCache compatibility issue with Phi-3
                        )
                        self.logger.debug("Generation complete, output shape: %s", outputs.shape)
                    except Exception as gen_error:
                        self.logger.error("Model generate() call failed: %s", gen_error, exc_info=True)
                        raise
                
                # Decode only the new tokens
                output_length = outputs.shape[1]
                self.logger.debug("Output length: %d tokens, Input length: %d tokens", output_length, input_length)
                
                if output_length <= input_length:
                    self.logger.warning("Output length (%d) <= input length (%d), no new tokens generated", output_length, input_length)
                    raise ValueError("No new tokens generated")
                
                generated_ids = outputs[0][input_length:]
                self.logger.debug("Generated token IDs: %s (length: %d)", str(generated_ids[:10].tolist()) if len(generated_ids) > 0 else "empty", len(generated_ids))
                
                # Try decoding with skip_special_tokens first
                generated_text = self.generator_tokenizer.decode(generated_ids, skip_special_tokens=True).strip()
                self.logger.debug("Decoded text (with skip_special_tokens=True): %s", repr(generated_text[:100]))
                
                # If empty, try without skip_special_tokens to see what we're getting
                if not generated_text:
                    generated_text_raw = self.generator_tokenizer.decode(generated_ids, skip_special_tokens=False).strip()
                    self.logger.debug("Decoded text (raw, no skip): %s", repr(generated_text_raw[:100]))
                    # Try to extract meaningful text from special tokens
                    # Remove common special tokens manually
                    import re
                    generated_text = re.sub(r'<\|.*?\|>', '', generated_text_raw).strip()
                    self.logger.debug("After removing special tokens: %s", repr(generated_text[:100]))
                
                # Clean up and return first line
                if generated_text:
                    # Remove any extra whitespace or newlines
                    cleaned = generated_text.split("\n")[0].strip()
                    # Remove common prefixes that models sometimes add
                    for prefix in ["Message:", "Response:", "Insight:", "FitAI:", "Assistant:"]:
                        if cleaned.lower().startswith(prefix.lower()):
                            cleaned = cleaned[len(prefix):].strip()
                    if cleaned:
                        self.logger.info("✓ AI-generated insight (%d chars): %s", len(cleaned), cleaned[:80])
                        return cleaned
                    else:
                        self.logger.warning("Generated text became empty after cleaning")
                
                # If we get here, generation was empty
                self.logger.warning("Generated text is empty for insight_type=%s, prompt_length=%d, generated_ids_length=%d", 
                                   insight_type, len(prompt), len(generated_ids))
                raise ValueError("Empty generation")
            
            # OpenAI generation (preferred)
            elif self.config.gen_backend == "openai" and self._openai_client:
                messages = [
                    {"role": "system", "content": system_msg},
                    {"role": "user", "content": prompt_context}
                ]
                try:
                    response = self._openai_client.chat.completions.create(
                        model="gpt-4o-mini",
                        messages=messages,
                        max_tokens=60,
                        temperature=0.7,
                    )
                    return response.choices[0].message.content.strip().split("\n")[0]
                except Exception as e:
                    self.logger.warning("OpenAI insight generation failed: %s", e)
                    # Fall through to template fallback
            
            # Modal/Remote generation (backward compatibility)
            elif self.config.gen_backend == "remote" and self._remote_session and self.config.remote_gen_url:
                prompt = f"{system_msg}\n\n{prompt_context}\n\nMessage:"
                payload = {
                    "model": self.config.hf_model_id,
                    "prompt": prompt,
                    "max_tokens": 60,
                    "temperature": 0.7,
                }
                resp = self._remote_session.post(self.config.remote_gen_url, json=payload, timeout=10)
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, dict) and data.get("choices"):
                    choice = data["choices"][0]
                    if "text" in choice:
                        return str(choice["text"]).strip().split("\n")[0]
                    if "message" in choice and "content" in choice["message"]:
                        return str(choice["message"]["content"]).strip().split("\n")[0]
            
            # Fallback to analytical template
            return f"Analytical insight for {insight_type}: {context}"
        
        except Exception as e:
            self.logger.error("Failed to generate AI insight message (type=%s): %s", insight_type, e, exc_info=True)
            # Log the full error for debugging
            import traceback
            self.logger.debug("Full traceback: %s", traceback.format_exc())
            # Fallback to analytical templates based on type
            if insight_type == "consistency":
                workout_count_7d = context.get('workout_count_7d', 0)
                workout_count_30d = context.get('workout_count_30d', 0)
                frequency_rate = (workout_count_7d / 7) * 100 if workout_count_7d > 0 else 0
                # Clarify messaging: sessions vs days
                return f"{workout_count_7d} sessions in the last 7 days ({frequency_rate:.0f}% frequency), {workout_count_30d} sessions in the last 30 days."
            elif insight_type == "recovery":
                days_since_last = context.get('days_since_last', 0)
                workout_count_7d = context.get('workout_count_7d', 0)
                avg_recovery = context.get('avg_recovery_days', None)
                if days_since_last == 0:
                    recovery_rate = (workout_count_7d / 7) * 100
                    return f"Same-day training: {workout_count_7d} sessions this week ({recovery_rate:.0f}% frequency)."
                elif workout_count_7d >= 6:
                    return f"Training frequency: {workout_count_7d} sessions this week. Average recovery window: {avg_recovery if avg_recovery else 'N/A'} days."
                else:
                    return f"Return after {days_since_last} days. Average recovery window: {avg_recovery if avg_recovery else 'N/A'} days."
            elif insight_type == "pr_context":
                exercise_name = context.get('exercise_name', 'unknown')
                weight_increase = context.get('weight_increase', 0)
                prev_weight = context.get('prev_weight', weight_increase) or 1
                weight_pct = (weight_increase / prev_weight) * 100 if prev_weight > 0 else 0
                pr_type = "All-time PR" if context.get('is_all_time', False) else "PR"
                return f"{pr_type} for {exercise_name}: +{weight_increase:.1f}kg ({weight_pct:.1f}% increase)."
            elif insight_type == "exercise":
                exercise_name = context.get('exercise_name', 'unknown')
                delta_pct = context.get('delta_pct', 0)
                status = context.get('status', 'unknown')
                return f"{exercise_name}: {delta_pct:+.1f}% volume change ({status})."
            else:
                return f"Insight: {context}"

    def get_workout_insights(self, user_id: str, session_id: str) -> Dict[str, Any]:
        """
        Compare current workout session against historical data for instant insights.
        Enhanced with connection-focused insights: consistency patterns, enhanced PRs, and recovery intelligence.
        Uses AI to generate dynamic, personalized insight messages.
        """
        with self.SessionLocal() as session:
            # Get current session
            current = session.get(WorkoutSessionModel, session_id)
            if not current or current.user_id != user_id:
                return {"error": "Session not found"}
            
            current_date = current.occurred_at if current.occurred_at else datetime.now(timezone.utc)
            
            # Get exercises from current session
            current_exercises = session.execute(
                select(ExerciseLogModel).where(ExerciseLogModel.session_id == session_id)
            ).scalars().all()
            
            insights = []
            session_insights = []
            conversation_hooks = []
            total_volume_delta = 0.0
            
            # ============================================
            # PHASE 1: Consistency Patterns (Connection Layer)
            # ============================================
            try:
                # Count workouts in last 7 days (excluding current session)
                seven_days_ago = current_date - timedelta(days=7)
                workouts_last_7 = session.execute(
                    select(WorkoutSessionModel)
                    .where(WorkoutSessionModel.user_id == user_id)
                    .where(WorkoutSessionModel.id != session_id)  # Exclude current session
                    .where(WorkoutSessionModel.occurred_at >= seven_days_ago)
                    .where(WorkoutSessionModel.occurred_at <= current_date)
                ).scalars().all()
                workout_count_7d = len(workouts_last_7)
                
                # Count workouts in last 30 days (excluding current session)
                thirty_days_ago = current_date - timedelta(days=30)
                workouts_last_30 = session.execute(
                    select(WorkoutSessionModel)
                    .where(WorkoutSessionModel.user_id == user_id)
                    .where(WorkoutSessionModel.id != session_id)  # Exclude current session
                    .where(WorkoutSessionModel.occurred_at >= thirty_days_ago)
                    .where(WorkoutSessionModel.occurred_at <= current_date)
                ).scalars().all()
                workout_count_30d = len(workouts_last_30)
                
                # Total workout count (all-time)
                total_workouts = session.execute(
                    select(WorkoutSessionModel)
                    .where(WorkoutSessionModel.user_id == user_id)
                ).scalars().all()
                total_count = len(total_workouts)
                
                # Calculate average recovery window (days between workouts)
                # Include current session for recovery calculation
                all_workouts_for_recovery = list(workouts_last_30)
                if current and current.occurred_at:
                    all_workouts_for_recovery.append(current)
                
                avg_recovery_days = None
                if len(all_workouts_for_recovery) >= 2:
                    workout_dates = sorted([w.occurred_at for w in all_workouts_for_recovery if w.occurred_at], reverse=True)
                    recovery_intervals = []
                    for i in range(len(workout_dates) - 1):
                        days_diff = (workout_dates[i] - workout_dates[i + 1]).days
                        if days_diff > 0:
                            recovery_intervals.append(days_diff)
                    if recovery_intervals:
                        avg_recovery_days = sum(recovery_intervals) / len(recovery_intervals)
                
                # Consistency frequency insights with analytical data
                if workout_count_7d >= 4:
                    message = self._generate_insight_message("consistency", {
                        "workout_count_7d": workout_count_7d,
                        "workout_count_30d": workout_count_30d,
                        "total_count": total_count,
                        "consecutive_days": 0,
                        "milestone": "none",
                        "avg_recovery_days": round(avg_recovery_days, 1) if avg_recovery_days else None
                    })
                    session_insights.append({
                        "type": "consistency",
                        "message": message,
                        "priority": 3,
                    })
                    conversation_hooks.append(f"consistent this week - {workout_count_7d} workouts")
                elif workout_count_7d >= 3:
                    message = self._generate_insight_message("consistency", {
                        "workout_count_7d": workout_count_7d,
                        "workout_count_30d": workout_count_30d,
                        "total_count": total_count,
                        "consecutive_days": 0,
                        "milestone": "none",
                        "avg_recovery_days": round(avg_recovery_days, 1) if avg_recovery_days else None
                    })
                    session_insights.append({
                        "type": "consistency",
                        "message": message,
                        "priority": 2,
                    })
                
                # Calculate average recovery window for milestone context
                avg_recovery_days_milestone = None
                if len(workouts_last_30) >= 2:
                    workout_dates = sorted([w.occurred_at for w in workouts_last_30 if w.occurred_at], reverse=True)
                    recovery_intervals = []
                    for i in range(len(workout_dates) - 1):
                        days_diff = (workout_dates[i] - workout_dates[i + 1]).days
                        if days_diff > 0:
                            recovery_intervals.append(days_diff)
                    if recovery_intervals:
                        avg_recovery_days_milestone = sum(recovery_intervals) / len(recovery_intervals)
                
                # Milestone celebrations with analytical data
                if total_count == 10:
                    message = self._generate_insight_message("consistency", {
                        "workout_count_7d": workout_count_7d,
                        "workout_count_30d": workout_count_30d,
                        "total_count": total_count,
                        "consecutive_days": 0,
                        "milestone": "10",
                        "avg_recovery_days": round(avg_recovery_days_milestone, 1) if avg_recovery_days_milestone else None
                    })
                    session_insights.append({
                        "type": "consistency",
                        "message": message,
                        "priority": 5,
                    })
                    conversation_hooks.append("10-workout milestone")
                elif total_count == 25:
                    message = self._generate_insight_message("consistency", {
                        "workout_count_7d": workout_count_7d,
                        "workout_count_30d": workout_count_30d,
                        "total_count": total_count,
                        "consecutive_days": 0,
                        "milestone": "25",
                        "avg_recovery_days": round(avg_recovery_days_milestone, 1) if avg_recovery_days_milestone else None
                    })
                    session_insights.append({
                        "type": "consistency",
                        "message": message,
                        "priority": 5,
                    })
                    conversation_hooks.append("25-workout milestone")
                elif total_count == 50:
                    message = self._generate_insight_message("consistency", {
                        "workout_count_7d": workout_count_7d,
                        "workout_count_30d": workout_count_30d,
                        "total_count": total_count,
                        "consecutive_days": 0,
                        "milestone": "50",
                        "avg_recovery_days": round(avg_recovery_days_milestone, 1) if avg_recovery_days_milestone else None
                    })
                    session_insights.append({
                        "type": "consistency",
                        "message": message,
                        "priority": 5,
                    })
                    conversation_hooks.append("50-workout milestone")
                
                # Streak detection (consecutive days)
                if len(workouts_last_7) >= 2:
                    workout_dates = sorted([w.occurred_at.date() for w in workouts_last_7 if w.occurred_at], reverse=True)
                    consecutive_days = 1
                    for i in range(len(workout_dates) - 1):
                        days_diff = (workout_dates[i] - workout_dates[i + 1]).days
                        if days_diff == 1:
                            consecutive_days += 1
                        else:
                            break
                    
                    if consecutive_days >= 3:
                        message = self._generate_insight_message("consistency", {
                            "workout_count_7d": workout_count_7d,
                            "workout_count_30d": workout_count_30d,
                            "total_count": total_count,
                            "consecutive_days": consecutive_days,
                            "milestone": "streak",
                            "avg_recovery_days": round(avg_recovery_days, 1) if avg_recovery_days else None
                        })
                        session_insights.append({
                            "type": "consistency",
                            "message": message,
                            "priority": 4,
                        })
                        conversation_hooks.append(f"{consecutive_days}-day streak")
            except Exception as e:
                self.logger.warning("Consistency pattern detection failed: %s", e)
            
            # ============================================
            # PHASE 2: Recovery Intelligence (Analytical Layer)
            # ============================================
            try:
                # Days since last workout
                last_workout = session.execute(
                    select(WorkoutSessionModel)
                    .where(WorkoutSessionModel.user_id == user_id)
                    .where(WorkoutSessionModel.id != session_id)
                    .order_by(WorkoutSessionModel.occurred_at.desc())
                    .limit(1)
                ).scalars().first()
                
                # Calculate average recovery window from last 30 days (include current session)
                all_workouts_for_recovery = list(workouts_last_30)
                if current and current.occurred_at:
                    all_workouts_for_recovery.append(current)
                
                avg_recovery_days = None
                if len(all_workouts_for_recovery) >= 2:
                    workout_dates = sorted([w.occurred_at for w in all_workouts_for_recovery if w.occurred_at], reverse=True)
                    recovery_intervals = []
                    for i in range(len(workout_dates) - 1):
                        days_diff = (workout_dates[i] - workout_dates[i + 1]).days
                        if days_diff > 0:
                            recovery_intervals.append(days_diff)
                    if recovery_intervals:
                        avg_recovery_days = sum(recovery_intervals) / len(recovery_intervals)
                
                if last_workout and last_workout.occurred_at:
                    days_since_last = (current_date - last_workout.occurred_at).days
                    
                    if days_since_last == 0:
                        # Only show "back next day" if not overtraining (avoid duplicate)
                        if workout_count_7d < 6:
                            message = self._generate_insight_message("recovery", {
                                "days_since_last": days_since_last,
                                "workout_count_7d": workout_count_7d,
                                "situation": "back_next_day",
                                "avg_recovery_days": round(avg_recovery_days, 1) if avg_recovery_days else None
                            })
                            session_insights.append({
                                "type": "recovery",
                                "message": message,
                                "priority": 1,
                            })
                    elif days_since_last >= 3:
                        message = self._generate_insight_message("recovery", {
                            "days_since_last": days_since_last,
                            "workout_count_7d": workout_count_7d,
                            "situation": "welcome_back",
                            "avg_recovery_days": round(avg_recovery_days, 1) if avg_recovery_days else None
                        })
                        session_insights.append({
                            "type": "recovery",
                            "message": message,
                            "priority": 3,
                        })
                        conversation_hooks.append(f"welcome back after {days_since_last} days")
                
                # Overtraining signal (only add if not already added "back next day")
                if workout_count_7d >= 6:
                    # Check if we already added a recovery message for this session
                    has_recovery_msg = any(ins.get("type") == "recovery" for ins in session_insights)
                    if not has_recovery_msg or (last_workout and last_workout.occurred_at and (current_date - last_workout.occurred_at).days != 0):
                        days_since_last = (current_date - last_workout.occurred_at).days if last_workout and last_workout.occurred_at else 0
                        message = self._generate_insight_message("recovery", {
                            "days_since_last": days_since_last,
                            "workout_count_7d": workout_count_7d,
                            "situation": "overtraining",
                            "avg_recovery_days": round(avg_recovery_days, 1) if avg_recovery_days else None
                        })
                        session_insights.append({
                            "type": "recovery",
                            "message": message,
                            "priority": 2,
                        })
            except Exception as e:
                self.logger.warning("Recovery intelligence detection failed: %s", e)
            
            # ============================================
            # Exercise-level insights (existing logic)
            # ============================================
            for ex in current_exercises:
                exercise_name = ex.exercise_name
                
                # Find last time this exercise was performed and calculate frequency
                stmt = (
                    select(ExerciseLogModel, WorkoutSessionModel)
                    .join(WorkoutSessionModel, ExerciseLogModel.session_id == WorkoutSessionModel.id)
                    .where(
                        ExerciseLogModel.user_id == user_id,
                        ExerciseLogModel.exercise_name == exercise_name,
                        ExerciseLogModel.session_id != session_id,
                    )
                    .order_by(WorkoutSessionModel.occurred_at.desc())
                    .limit(1)
                )
                prev_result = session.execute(stmt).first()
                prev_ex = prev_result[0] if prev_result else None
                prev_session = prev_result[1] if prev_result else None
                
                # Calculate days since last performed
                frequency_days = None
                if prev_session and prev_session.occurred_at:
                    frequency_days = (current_date - prev_session.occurred_at).days
                
                # Define volume calculation function (used for trend analysis)
                def calc_volume(e: ExerciseLogModel) -> float:
                    if not e.sets or not e.reps or not e.weights:
                        return 0.0
                    vol = 0.0
                    for i in range(min(len(e.reps), len(e.weights))):
                        try:
                            # Parse weight string (e.g., "45kg", "135lbs", "BW")
                            weight_str = str(e.weights[i])
                            if weight_str.lower() in ("bw", "bodyweight"):
                                weight_val = 75.0  # assume 75kg bodyweight
                            else:
                                # Extract numeric part
                                import re
                                match = re.search(r"[\d.]+", weight_str)
                                weight_val = float(match.group()) if match else 0.0
                            vol += e.reps[i] * weight_val
                        except Exception:
                            continue
                    return vol
                
                # Get volume trend (last 3 occurrences)
                volume_trend = None
                if prev_ex:
                    recent_exercises = session.execute(
                        select(ExerciseLogModel, WorkoutSessionModel)
                        .join(WorkoutSessionModel, ExerciseLogModel.session_id == WorkoutSessionModel.id)
                        .where(
                            ExerciseLogModel.user_id == user_id,
                            ExerciseLogModel.exercise_name == exercise_name,
                            ExerciseLogModel.session_id != session_id,
                        )
                        .order_by(WorkoutSessionModel.occurred_at.desc())
                        .limit(3)
                    ).all()
                    
                    if len(recent_exercises) >= 2:
                        volumes = []
                        for hist_ex, _ in recent_exercises[:3]:
                            vol = calc_volume(hist_ex)
                            if vol > 0:
                                volumes.append(vol)
                        
                        if len(volumes) >= 2:
                            # Simple trend: increasing, decreasing, or stable
                            if volumes[0] > volumes[-1] * 1.05:
                                volume_trend = "increasing"
                            elif volumes[0] < volumes[-1] * 0.95:
                                volume_trend = "decreasing"
                            else:
                                volume_trend = "stable"
                
                if not prev_ex:
                    message = self._generate_insight_message("exercise", {
                        "exercise_name": exercise_name,
                        "status": "new",
                        "delta_pct": 0,
                        "weight_increase": None,
                        "volume_trend": None,
                        "frequency_days": None
                    })
                    insights.append({
                        "exercise": exercise_name,
                        "status": "new",
                        "message": message,
                    })
                    continue
                
                # Calculate volume: sets × reps × weight (approximate)
                # Note: calc_volume is defined above in the volume_trend section
                current_vol = calc_volume(ex)
                prev_vol = calc_volume(prev_ex)
                
                if current_vol > 0 and prev_vol > 0:
                    delta = ((current_vol - prev_vol) / prev_vol) * 100
                    total_volume_delta += delta
                    
                    if delta > 5:
                        message = self._generate_insight_message("exercise", {
                            "exercise_name": exercise_name,
                            "status": "progress",
                            "delta_pct": delta,
                            "weight_increase": None,
                            "volume_trend": volume_trend,
                            "frequency_days": frequency_days
                        })
                        insights.append({
                            "exercise": exercise_name,
                            "status": "progress",
                            "message": message,
                            "delta_pct": delta,
                        })
                    elif delta < -5:
                        message = self._generate_insight_message("exercise", {
                            "exercise_name": exercise_name,
                            "status": "regression",
                            "delta_pct": delta,
                            "weight_increase": None,
                            "volume_trend": volume_trend,
                            "frequency_days": frequency_days
                        })
                        insights.append({
                            "exercise": exercise_name,
                            "status": "regression",
                            "message": message,
                            "delta_pct": delta,
                        })
                    else:
                        message = self._generate_insight_message("exercise", {
                            "exercise_name": exercise_name,
                            "status": "maintained",
                            "delta_pct": delta,
                            "weight_increase": None,
                            "volume_trend": volume_trend,
                            "frequency_days": frequency_days
                        })
                        insights.append({
                            "exercise": exercise_name,
                            "status": "maintained",
                            "message": message,
                            "delta_pct": delta,
                        })
                
                # ============================================
                # Enhanced PR Detection with Historical Context
                # ============================================
                if ex.weights and prev_ex.weights:
                    try:
                        import re
                        curr_max = max([float(re.search(r"[\d.]+", str(w)).group()) for w in ex.weights if re.search(r"[\d.]+", str(w))])
                        prev_max = max([float(re.search(r"[\d.]+", str(w)).group()) for w in prev_ex.weights if re.search(r"[\d.]+", str(w))])
                        
                        if curr_max > prev_max:
                            # Find all-time max for this exercise (optimized query)
                            all_time_exercises = session.execute(
                                select(ExerciseLogModel, WorkoutSessionModel)
                                .join(WorkoutSessionModel, ExerciseLogModel.session_id == WorkoutSessionModel.id)
                                .where(
                                    ExerciseLogModel.user_id == user_id,
                                    ExerciseLogModel.exercise_name == exercise_name,
                                    ExerciseLogModel.session_id != session_id,
                                )
                                .order_by(WorkoutSessionModel.occurred_at.desc())
                                .limit(100)  # Limit to recent 100 for performance
                            ).all()
                            
                            all_time_max = prev_max  # Start with previous max
                            last_pr_date = None
                            prs_this_month = 0
                            month_start = current_date - timedelta(days=30)
                            
                            for hist_ex, hist_session in all_time_exercises:
                                if hist_ex.weights:
                                    try:
                                        hist_max = max([float(re.search(r"[\d.]+", str(w)).group()) for w in hist_ex.weights if re.search(r"[\d.]+", str(w))])
                                        if hist_max > all_time_max:
                                            all_time_max = hist_max
                                            if hist_session and hist_session.occurred_at:
                                                last_pr_date = hist_session.occurred_at
                                        
                                        # Count PRs this month (any weight >= previous max)
                                        if hist_session and hist_session.occurred_at and hist_session.occurred_at >= month_start:
                                            if hist_max >= prev_max:
                                                prs_this_month += 1
                                    except Exception:
                                        continue
                            
                            # Check if this is an all-time PR
                            if curr_max > all_time_max:
                                # Days since last PR
                                days_since_last_pr = None
                                if last_pr_date:
                                    days_since_last_pr = (current_date - last_pr_date).days
                                
                                # Enhanced PR message with context - use AI generation
                                weight_increase = curr_max - prev_max
                                pr_context = {
                                    "exercise_name": exercise_name,
                                    "weight_increase": weight_increase,
                                    "prev_weight": prev_max,
                                    "days_since_last_pr": days_since_last_pr if days_since_last_pr else 0,
                                    "prs_this_month": prs_this_month + 1,
                                    "is_all_time": True,
                                    "felt_strong": current.notes and any(word in current.notes.lower() for word in ["felt strong", "felt good", "easy", "smooth"])
                                }
                                
                                if days_since_last_pr and days_since_last_pr > 30:
                                    pr_context["situation"] = "long_break_pr"
                                    conversation_hooks.append(f"all-time PR for {exercise_name} after {days_since_last_pr} days")
                                elif prs_this_month >= 2:
                                    pr_context["situation"] = "hot_streak"
                                    conversation_hooks.append(f"{prs_this_month + 1} PRs this month")
                                else:
                                    pr_context["situation"] = "regular_pr"
                                    conversation_hooks.append(f"PR for {exercise_name}")
                                
                                pr_message = self._generate_insight_message("pr_context", pr_context)
                                
                                insights.append({
                                    "exercise": exercise_name,
                                    "status": "pr",
                                    "message": pr_message,
                                    "weight_increase": weight_increase,
                                })
                            else:
                                # Regular PR (not all-time) - use AI generation
                                weight_increase = curr_max - prev_max
                                pr_message = self._generate_insight_message("pr_context", {
                                    "exercise_name": exercise_name,
                                    "weight_increase": weight_increase,
                                    "prev_weight": prev_max,
                                    "days_since_last_pr": 0,
                                    "prs_this_month": 0,
                                    "is_all_time": False,
                                    "situation": "regular_pr"
                                })
                                insights.append({
                                    "exercise": exercise_name,
                                    "status": "pr",
                                    "message": pr_message,
                                    "weight_increase": weight_increase,
                                })
                                conversation_hooks.append(f"PR for {exercise_name}")
                    except Exception as e:
                        self.logger.warning("Enhanced PR detection failed for %s: %s", exercise_name, e)
            
            # Overall session insight - use AI generation with analytical data
            avg_delta = total_volume_delta / len(current_exercises) if current_exercises else 0
            overall_message = self._generate_insight_message("exercise", {
                "exercise_name": "Overall session",
                "status": "maintained" if -5 <= avg_delta <= 5 else ("progress" if avg_delta > 5 else "regression"),
                "delta_pct": avg_delta,
                "weight_increase": None,
                "volume_trend": None,
                "frequency_days": None
            })
            
            # Fallback if generation fails - analytical fallbacks
            if not overall_message or overall_message == "Great work on exercise!":
                if avg_delta > 10:
                    overall_message = f"Session volume increased by {avg_delta:+.1f}% vs previous session. Strong progression pattern."
                elif avg_delta > 0:
                    overall_message = f"Volume up {avg_delta:+.1f}% from last session. Maintaining positive trajectory."
                elif avg_delta < -10:
                    overall_message = f"Volume decreased {abs(avg_delta):.1f}% vs previous session. Lower intensity may indicate recovery need."
                else:
                    overall_message = f"Session volume maintained (±{abs(avg_delta):.1f}% change). Consistent performance."
            
            # Remove duplicate conversation hooks
            conversation_hooks = list(dict.fromkeys(conversation_hooks))  # Preserves order
            
            return {
                "session_id": session_id,
                "insights": insights,
                "session_insights": session_insights,
                "overall_message": overall_message,
                "avg_volume_change_pct": avg_delta,
                "exercise_count": len(current_exercises),
                "conversation_hooks": conversation_hooks,
            }

    def get_workout_stats(self, user_id: str, session_id: str) -> Dict[str, Any]:
        """
        Get comprehensive workout stats for a session (Phase 1: Core Stats).
        Returns data-driven metrics: consistency, volume, exercise frequency, recovery, progress.
        """
        def calc_volume(e: ExerciseLogModel) -> float:
            """Calculate volume (sets × reps × weight) for an exercise."""
            if not e.sets or not e.reps or not e.weights:
                return 0.0
            vol = 0.0
            for i in range(min(len(e.reps), len(e.weights))):
                try:
                    weight_str = str(e.weights[i]).strip().upper()
                    if weight_str == "BW" or weight_str == "BODYWEIGHT":
                        continue  # Skip bodyweight for volume calculation
                    # Parse weight (e.g., "45kg", "135lbs", "100")
                    weight_val = 0.0
                    if "KG" in weight_str:
                        weight_val = float(weight_str.replace("KG", "").strip())
                    elif "LBS" in weight_str or "LB" in weight_str:
                        weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592  # Convert to kg
                    else:
                        weight_val = float(weight_str)
                    vol += int(e.reps[i]) * weight_val
                except (ValueError, IndexError):
                    continue
            return vol
        
        with self.SessionLocal() as session:
            # Get current session
            current = session.get(WorkoutSessionModel, session_id)
            if not current or current.user_id != user_id:
                return {"error": "Session not found"}
            
            current_date = current.occurred_at if current.occurred_at else datetime.now(timezone.utc)
            now = datetime.now(timezone.utc)
            seven_days_ago = now - timedelta(days=7)
            thirty_days_ago = now - timedelta(days=30)
            
            # Get all workouts for calculations
            all_workouts = session.execute(
                select(WorkoutSessionModel)
                .where(WorkoutSessionModel.user_id == user_id)
                .order_by(WorkoutSessionModel.occurred_at.desc())
            ).scalars().all()
            
            workouts_7d = [w for w in all_workouts if w.occurred_at and w.occurred_at >= seven_days_ago and w.id != session_id]
            workouts_30d = [w for w in all_workouts if w.occurred_at and w.occurred_at >= thirty_days_ago and w.id != session_id]
            
            # Include current session in counts
            if current.occurred_at and current.occurred_at >= seven_days_ago:
                workouts_7d.append(current)
            if current.occurred_at and current.occurred_at >= thirty_days_ago:
                workouts_30d.append(current)
            
            # ============================================
            # 1. CONSISTENCY METRICS
            # ============================================
            sessions_this_week = len(workouts_7d)
            sessions_this_month = len(workouts_30d)
            total_sessions = len(all_workouts)
            
            # Calculate weekly frequency
            weekly_frequency = round(sessions_this_month / 4.3, 1) if sessions_this_month > 0 else 0.0
            
            # Calculate current streak (consecutive days)
            workout_dates = sorted([w.occurred_at.date() for w in all_workouts if w.occurred_at], reverse=True)
            current_streak = 1
            best_streak = 1
            temp_streak = 1
            
            for i in range(len(workout_dates) - 1):
                days_diff = (workout_dates[i] - workout_dates[i + 1]).days
                if days_diff == 1:
                    temp_streak += 1
                    if i == 0:  # Current streak
                        current_streak = temp_streak
                else:
                    best_streak = max(best_streak, temp_streak)
                    temp_streak = 1
            best_streak = max(best_streak, temp_streak)
            
            consistency = {
                "sessions_this_week": sessions_this_week,
                "sessions_this_month": sessions_this_month,
                "total_sessions": total_sessions,
                "current_streak": current_streak,
                "weekly_frequency": weekly_frequency,
                "best_streak": best_streak,
            }
            
            # ============================================
            # 2. VOLUME METRICS
            # ============================================
            def get_session_volume(session_id: str) -> float:
                exercises = session.execute(
                    select(ExerciseLogModel).where(ExerciseLogModel.session_id == session_id)
                ).scalars().all()
                return sum(calc_volume(e) for e in exercises)
            
            total_volume_week = sum(get_session_volume(w.id) for w in workouts_7d)
            total_volume_month = sum(get_session_volume(w.id) for w in workouts_30d)
            avg_session_volume = round(total_volume_month / len(workouts_30d), 1) if workouts_30d else 0.0
            
            # Volume trend (compare last 7 days to previous 7 days)
            if len(workouts_7d) >= 2:
                previous_7d_start = seven_days_ago - timedelta(days=7)
                previous_7d_workouts = [w for w in all_workouts if w.occurred_at and previous_7d_start <= w.occurred_at < seven_days_ago]
                previous_volume = sum(get_session_volume(w.id) for w in previous_7d_workouts)
                if previous_volume > 0:
                    volume_trend_pct = round(((total_volume_week - previous_volume) / previous_volume) * 100, 1)
                    volume_trend = f"{volume_trend_pct:+.1f}%"
                else:
                    volume_trend = "N/A"
            else:
                volume_trend = "N/A"
            
            # Volume by muscle group
            push_keywords = ["bench", "press", "chest", "shoulder", "tricep", "push"]
            pull_keywords = ["pull", "row", "deadlift", "back", "bicep", "lat", "pull-up"]
            leg_keywords = ["squat", "leg", "lunge", "calf", "quad", "hamstring", "leg press"]
            
            volume_push = 0.0
            volume_pull = 0.0
            volume_legs = 0.0
            
            for w in workouts_30d:
                exercises = session.execute(
                    select(ExerciseLogModel).where(ExerciseLogModel.session_id == w.id)
                ).scalars().all()
                for ex in exercises:
                    ex_name = (ex.exercise_name or "").lower()
                    vol = calc_volume(ex)
                    if any(kw in ex_name for kw in push_keywords):
                        volume_push += vol
                    elif any(kw in ex_name for kw in pull_keywords):
                        volume_pull += vol
                    elif any(kw in ex_name for kw in leg_keywords):
                        volume_legs += vol
            
            volume = {
                "total_volume_week": round(total_volume_week, 1),
                "total_volume_month": round(total_volume_month, 1),
                "volume_trend": volume_trend,
                "avg_session_volume": avg_session_volume,
                "volume_by_group": {
                    "push": round(volume_push, 1),
                    "pull": round(volume_pull, 1),
                    "legs": round(volume_legs, 1),
                }
            }
            
            # ============================================
            # 3. EXERCISE FREQUENCY
            # ============================================
            exercise_counts = {}
            exercise_names_set = set()
            
            for w in workouts_30d:
                exercises = session.execute(
                    select(ExerciseLogModel).where(ExerciseLogModel.session_id == w.id)
                ).scalars().all()
                for ex in exercises:
                    name = ex.exercise_name or "Unknown"
                    exercise_counts[name] = exercise_counts.get(name, 0) + 1
                    exercise_names_set.add(name)
            
            top_5_exercises = sorted(exercise_counts.items(), key=lambda x: x[1], reverse=True)[:5]
            top_5 = [{"name": name, "frequency": count} for name, count in top_5_exercises]
            
            # Most/least trained muscle groups
            push_count = sum(count for name, count in exercise_counts.items() if any(kw in name.lower() for kw in push_keywords))
            pull_count = sum(count for name, count in exercise_counts.items() if any(kw in name.lower() for kw in pull_keywords))
            leg_count = sum(count for name, count in exercise_counts.items() if any(kw in name.lower() for kw in leg_keywords))
            
            most_trained = "push" if push_count >= max(pull_count, leg_count) else ("pull" if pull_count >= leg_count else "legs")
            least_trained = "legs" if leg_count <= min(push_count, pull_count) else ("pull" if pull_count <= push_count else "push")
            
            exercises = {
                "top_5": top_5,
                "variety": len(exercise_names_set),
                "most_trained_group": most_trained,
                "least_trained_group": least_trained,
            }
            
            # ============================================
            # 4. RECOVERY METRICS
            # ============================================
            # Average recovery window
            all_workouts_for_recovery = workouts_30d.copy()
            if current.occurred_at:
                all_workouts_for_recovery.append(current)
            
            avg_recovery_days = None
            recovery_trend = "N/A"
            if len(all_workouts_for_recovery) >= 2:
                workout_dates = sorted([w.occurred_at for w in all_workouts_for_recovery if w.occurred_at], reverse=True)
                recovery_intervals = []
                for i in range(len(workout_dates) - 1):
                    days_diff = (workout_dates[i] - workout_dates[i + 1]).days
                    if days_diff > 0:
                        recovery_intervals.append(days_diff)
                if recovery_intervals:
                    avg_recovery_days = round(sum(recovery_intervals) / len(recovery_intervals), 1)
                    
                    # Recovery trend (compare recent vs older intervals)
                    if len(recovery_intervals) >= 4:
                        recent_avg = sum(recovery_intervals[:len(recovery_intervals)//2]) / (len(recovery_intervals)//2)
                        older_avg = sum(recovery_intervals[len(recovery_intervals)//2:]) / (len(recovery_intervals) - len(recovery_intervals)//2)
                        if recent_avg < older_avg * 0.9:
                            recovery_trend = "decreasing"
                        elif recent_avg > older_avg * 1.1:
                            recovery_trend = "increasing"
                        else:
                            recovery_trend = "stable"
            
            # Days since last workout
            days_since_last = None
            if len(all_workouts) > 1:
                last_workout = all_workouts[1] if all_workouts[0].id == session_id else all_workouts[0]
                if last_workout.occurred_at:
                    days_since_last = (current_date - last_workout.occurred_at).days
            
            # Rest days per week
            rest_days_per_week = round(7 - weekly_frequency, 1) if weekly_frequency > 0 else 7.0
            
            recovery = {
                "avg_recovery_days": avg_recovery_days,
                "recovery_trend": recovery_trend,
                "days_since_last": days_since_last,
                "rest_days_per_week": rest_days_per_week,
            }
            
            # ============================================
            # 5. PROGRESS METRICS (PRs)
            # ============================================
            # Count PRs this week/month
            prs_this_week = 0
            prs_this_month = 0
            
            # Get current session exercises
            current_exercises = session.execute(
                select(ExerciseLogModel).where(ExerciseLogModel.session_id == session_id)
            ).scalars().all()
            
            for ex in current_exercises:
                exercise_name = ex.exercise_name
                if not exercise_name:
                    continue
                
                # Get max weight from current session
                curr_max = 0.0
                if ex.weights:
                    for w_str in ex.weights:
                        try:
                            weight_str = str(w_str).strip().upper()
                            if weight_str == "BW" or weight_str == "BODYWEIGHT":
                                continue
                            if "KG" in weight_str:
                                weight_val = float(weight_str.replace("KG", "").strip())
                            elif "LBS" in weight_str or "LB" in weight_str:
                                weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                            else:
                                weight_val = float(weight_str)
                            curr_max = max(curr_max, weight_val)
                        except (ValueError, AttributeError):
                            continue
                
                if curr_max == 0:
                    continue
                
                # Find previous max for this exercise
                prev_exercises = session.execute(
                    select(ExerciseLogModel, WorkoutSessionModel)
                    .join(WorkoutSessionModel, ExerciseLogModel.session_id == WorkoutSessionModel.id)
                    .where(
                        ExerciseLogModel.user_id == user_id,
                        ExerciseLogModel.exercise_name == exercise_name,
                        ExerciseLogModel.session_id != session_id,
                    )
                    .order_by(WorkoutSessionModel.occurred_at.desc())
                ).all()
                
                prev_max = 0.0
                for prev_ex, prev_sess in prev_exercises:
                    if prev_ex.weights:
                        for w_str in prev_ex.weights:
                            try:
                                weight_str = str(w_str).strip().upper()
                                if weight_str == "BW" or weight_str == "BODYWEIGHT":
                                    continue
                                if "KG" in weight_str:
                                    weight_val = float(weight_str.replace("KG", "").strip())
                                elif "LBS" in weight_str or "LB" in weight_str:
                                    weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                                else:
                                    weight_val = float(weight_str)
                                prev_max = max(prev_max, weight_val)
                            except (ValueError, AttributeError):
                                continue
                    if prev_max > 0:
                        break
                
                # Check if PR
                if curr_max > prev_max:
                    # Check if PR is this week/month
                    if current.occurred_at and current.occurred_at >= seven_days_ago:
                        prs_this_week += 1
                    if current.occurred_at and current.occurred_at >= thirty_days_ago:
                        prs_this_month += 1
            
            # Strength progression (average % increase on top exercises)
            strength_progression = None
            if top_5_exercises:
                progressions = []
                for ex_name, _ in top_5_exercises[:3]:  # Top 3 exercises
                    # Get current max
                    current_max = 0.0
                    for ex in current_exercises:
                        if ex.exercise_name == ex_name and ex.weights:
                            for w_str in ex.weights:
                                try:
                                    weight_str = str(w_str).strip().upper()
                                    if "KG" in weight_str:
                                        weight_val = float(weight_str.replace("KG", "").strip())
                                    elif "LBS" in weight_str or "LB" in weight_str:
                                        weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                                    else:
                                        weight_val = float(weight_str)
                                    current_max = max(current_max, weight_val)
                                except (ValueError, AttributeError):
                                    continue
                    
                    if current_max == 0:
                        continue
                    
                    # Get previous max (30 days ago)
                    month_start = thirty_days_ago
                    prev_exercises = session.execute(
                        select(ExerciseLogModel, WorkoutSessionModel)
                        .join(WorkoutSessionModel, ExerciseLogModel.session_id == WorkoutSessionModel.id)
                        .where(
                            ExerciseLogModel.user_id == user_id,
                            ExerciseLogModel.exercise_name == ex_name,
                            WorkoutSessionModel.occurred_at < month_start,
                        )
                        .order_by(WorkoutSessionModel.occurred_at.desc())
                        .limit(5)
                    ).all()
                    
                    prev_max = 0.0
                    for prev_ex, _ in prev_exercises:
                        if prev_ex.weights:
                            for w_str in prev_ex.weights:
                                try:
                                    weight_str = str(w_str).strip().upper()
                                    if "KG" in weight_str:
                                        weight_val = float(weight_str.replace("KG", "").strip())
                                    elif "LBS" in weight_str or "LB" in weight_str:
                                        weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                                    else:
                                        weight_val = float(weight_str)
                                    prev_max = max(prev_max, weight_val)
                                except (ValueError, AttributeError):
                                    continue
                        if prev_max > 0:
                            break
                    
                    if prev_max > 0:
                        pct = ((current_max - prev_max) / prev_max) * 100
                        progressions.append(pct)
                
                if progressions:
                    avg_progression = sum(progressions) / len(progressions)
                    strength_progression = f"{avg_progression:+.1f}%"
            
            # Plateau detection (exercises with no progress for 3+ weeks)
            plateaus = []
            three_weeks_ago = now - timedelta(days=21)
            for ex_name, _ in top_5_exercises[:5]:
                # Get max weight 3 weeks ago
                old_max = 0.0
                old_exercises = session.execute(
                    select(ExerciseLogModel, WorkoutSessionModel)
                    .join(WorkoutSessionModel, ExerciseLogModel.session_id == WorkoutSessionModel.id)
                    .where(
                        ExerciseLogModel.user_id == user_id,
                        ExerciseLogModel.exercise_name == ex_name,
                        WorkoutSessionModel.occurred_at < three_weeks_ago,
                    )
                    .order_by(WorkoutSessionModel.occurred_at.desc())
                    .limit(3)
                ).all()
                
                for old_ex, _ in old_exercises:
                    if old_ex.weights:
                        for w_str in old_ex.weights:
                            try:
                                weight_str = str(w_str).strip().upper()
                                if "KG" in weight_str:
                                    weight_val = float(weight_str.replace("KG", "").strip())
                                elif "LBS" in weight_str or "LB" in weight_str:
                                    weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                                else:
                                    weight_val = float(weight_str)
                                old_max = max(old_max, weight_val)
                            except (ValueError, AttributeError):
                                continue
                    if old_max > 0:
                        break
                
                # Get recent max (last 3 weeks)
                recent_max = 0.0
                recent_exercises = session.execute(
                    select(ExerciseLogModel, WorkoutSessionModel)
                    .join(WorkoutSessionModel, ExerciseLogModel.session_id == WorkoutSessionModel.id)
                    .where(
                        ExerciseLogModel.user_id == user_id,
                        ExerciseLogModel.exercise_name == ex_name,
                        WorkoutSessionModel.occurred_at >= three_weeks_ago,
                        WorkoutSessionModel.id != session_id,
                    )
                    .order_by(WorkoutSessionModel.occurred_at.desc())
                    .limit(5)
                ).all()
                
                for recent_ex, _ in recent_exercises:
                    if recent_ex.weights:
                        for w_str in recent_ex.weights:
                            try:
                                weight_str = str(w_str).strip().upper()
                                if "KG" in weight_str:
                                    weight_val = float(weight_str.replace("KG", "").strip())
                                elif "LBS" in weight_str or "LB" in weight_str:
                                    weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                                else:
                                    weight_val = float(weight_str)
                                recent_max = max(recent_max, weight_val)
                            except (ValueError, AttributeError):
                                continue
                    if recent_max > 0:
                        break
                
                # Check if plateau (no improvement)
                if old_max > 0 and recent_max <= old_max:
                    plateaus.append({"exercise": ex_name, "weeks": 3})
            
            progress = {
                "prs_this_week": prs_this_week,
                "prs_this_month": prs_this_month,
                "strength_progression": strength_progression,
                "plateaus": plateaus,
            }
            
            return {
                "session_id": session_id,
                "stats": {
                    "consistency": consistency,
                    "volume": volume,
                    "exercises": exercises,
                    "recovery": recovery,
                    "progress": progress,
                }
            }

    def get_session_volume(self, session_id: str, user_id: Optional[str] = None) -> float:
        """Get total volume (kg) for a specific workout session."""
        def calc_volume(e: ExerciseLogModel) -> float:
            """Calculate volume (sets × reps × weight) for an exercise."""
            if not e.sets or not e.reps or not e.weights:
                return 0.0
            vol = 0.0
            for i in range(min(len(e.reps), len(e.weights))):
                try:
                    weight_str = str(e.weights[i]).strip().upper()
                    if weight_str == "BW" or weight_str == "BODYWEIGHT":
                        continue
                    if "KG" in weight_str:
                        weight_val = float(weight_str.replace("KG", "").strip())
                    elif "LBS" in weight_str or "LB" in weight_str:
                        weight_val = float(weight_str.replace("LBS", "").replace("LB", "").strip()) * 0.453592
                    else:
                        weight_val = float(weight_str)
                    vol += int(e.reps[i]) * weight_val
                except (ValueError, IndexError):
                    continue
            return vol
        
        with self.SessionLocal() as session:
            # Verify session belongs to user if user_id provided
            if user_id:
                workout = session.get(WorkoutSessionModel, session_id)
                if not workout or workout.user_id != user_id:
                    raise ValueError("Session not found or access denied")
            
            exercises = session.execute(
                select(ExerciseLogModel).where(ExerciseLogModel.session_id == session_id)
            ).scalars().all()
            return sum(calc_volume(e) for e in exercises)

    # ------------------------
    # Session memory (ephemeral)
    # ------------------------
    def _get_session_key(self, user_id: str, session_id: Optional[str]) -> str:
        return session_id or f"user:{user_id}"

    def _ensure_session(self, key: str) -> deque:
        if not hasattr(self, "_session_memory"):
            self._session_memory: Dict[str, deque] = {}
        if key not in self._session_memory:
            self._session_memory[key] = deque(maxlen=10)
        return self._session_memory[key]

    def append_session_message(self, user_id: str, session_id: Optional[str], role: str, content: str) -> None:
        """Persist conversation messages to database for deep memory."""
        key = self._get_session_key(user_id, session_id)
        session_id_str = session_id or f"default_{user_id}"
        created_at = datetime.now(timezone.utc)
        
        # Always persist to database first (deep memory requirement)
        try:
            with self.SessionLocal() as session:
                with session.begin():
                    msg = ChatMessageModel(
                        id=str(uuid.uuid4()),
                        user_id=user_id,
                        session_id=session_id_str,
                        role=role,
                        content=content,
                        created_at=created_at,
                        meta_data={}
                    )
                    session.add(msg)
        except Exception as e:
            self.logger.warning("Failed to persist chat message to database: %s", e)
        
        # Also cache in Redis for fast retrieval (optional optimization)
        if self._redis is not None:
            try:
                import json
                rkey = f"{self.config.redis_prefix}:session:{key}"
                self._redis.rpush(rkey, json.dumps({"role": role, "content": content, "ts": time.time()}))
                self._redis.expire(rkey, self.config.redis_ttl_session_sec)
            except Exception:
                pass
        
        # Keep in-memory as fallback (but database is source of truth)
        dq = self._ensure_session(key)
        dq.append({"role": role, "content": content, "ts": time.time()})

    def get_session_messages(self, user_id: str, session_id: Optional[str], max_messages: int = 100) -> List[Dict[str, Any]]:
        """Retrieve full conversation history from database for deep memory context."""
        key = self._get_session_key(user_id, session_id)
        session_id_str = session_id or f"default_{user_id}"
        
        # Always retrieve from database first (deep memory - full history)
        try:
            with self.SessionLocal() as session:
                stmt = (
                    select(ChatMessageModel)
                    .where(ChatMessageModel.user_id == user_id)
                    .where(ChatMessageModel.session_id == session_id_str)
                    .order_by(ChatMessageModel.created_at.asc())
                    .limit(max_messages)
                )
                rows = session.execute(stmt).scalars().all()
                if rows:
                    messages = [
                        {
                            "role": row.role,
                            "content": row.content,
                            "ts": row.created_at.timestamp() if isinstance(row.created_at, datetime) else None
                        }
                        for row in rows
                    ]
                    return messages[-max_messages:]  # Return most recent N if we have more
        except Exception as e:
            self.logger.warning("Failed to retrieve chat messages from database: %s", e)
        
        # Fallback to Redis cache (if available)
        if self._redis is not None:
            try:
                import json
                rkey = f"{self.config.redis_prefix}:session:{key}"
                data = self._redis.lrange(rkey, 0, -1)
                msgs = [json.loads(x) for x in data[-max_messages:]]
                return msgs
            except Exception:
                pass
        
        # Final fallback to in-memory (limited)
        dq = self._ensure_session(key)
        return list(dq)[-max_messages:]

    def clear_session(self, user_id: str, session_id: Optional[str]) -> None:
        key = self._get_session_key(user_id, session_id)
        if self._redis is not None:
            try:
                rkey = f"{self.config.redis_prefix}:session:{key}"
                self._redis.delete(rkey)
                return
            except Exception:
                pass
        if hasattr(self, "_session_memory") and key in self._session_memory:
            del self._session_memory[key]

    def retrieve(self, query: str, user_id: Optional[str], top_k: Optional[int] = None) -> List[RetrievedChunk]:
        if not query.strip():
            return []
        k = max(1, top_k or self.config.top_k)
        query_vec = self._embed([query])[0].tolist()

        with self.SessionLocal() as session:
            # Order by cosine distance ascending
            dist = ChunkModel.embedding.cosine_distance(query_vec)
            stmt = (
                select(ChunkModel, DocumentModel, dist.label("distance"))
                .join(DocumentModel, ChunkModel.document_id == DocumentModel.id)
                .where(or_(DocumentModel.user_id == user_id, DocumentModel.user_id.is_(None)))
            )
            # Optional KB filters
            try:
                from sqlalchemy import and_  # type: ignore
                if self.config.filter_min_credibility is not None:
                    stmt = stmt.where((ChunkModel.meta_data["credibility_score"].as_integer() >= self.config.filter_min_credibility))
                if self.config.filter_category:
                    stmt = stmt.where((ChunkModel.meta_data["category"].as_string() == self.config.filter_category))
                if self.config.filter_min_year is not None:
                    stmt = stmt.where((ChunkModel.meta_data["publication_year"].as_integer() >= self.config.filter_min_year))
            except Exception:
                pass
            stmt = stmt.order_by(dist).limit(k)
            results = session.execute(stmt).all()

        out: List[RetrievedChunk] = []
        for ch, doc, distance in results:
            sim = 1.0 - 0.5 * float(distance if distance is not None else 0.0)
            md = ch.meta_data or {}
            if (not md.get("source")) and getattr(doc, "source", None):
                md = {**md, "source": doc.source}
            out.append(
                RetrievedChunk(
                    doc_id=ch.document_id,
                    chunk_id=ch.id,
                    text=ch.text,
                    score=float(max(0.0, sim)),
                    metadata=md,
                )
            )
        return out

    # ------------------------
    # Long-term memory retrieval
    # ------------------------
    def retrieve_memories(self, user_id: Optional[str], query: Optional[str], top_k: int = 3) -> List[Dict[str, Any]]:
        if not user_id:
            return []
        k = max(1, top_k)
        with self.SessionLocal() as session:
            if query and query.strip():
                qvec = self._embed([query])[0].tolist()
                dist = UserMemoryModel.embedding.cosine_distance(qvec)
                stmt = (
                    select(UserMemoryModel)
                    .where(UserMemoryModel.user_id == user_id)
                    .order_by(dist)
                    .limit(k)
                )
                rows = session.execute(stmt).scalars().all()
            else:
                stmt = (
                    select(UserMemoryModel)
                    .where(UserMemoryModel.user_id == user_id)
                    .order_by(UserMemoryModel.updated_at.desc())
                    .limit(k)
                )
                rows = session.execute(stmt).scalars().all()
        out: List[Dict[str, Any]] = []
        for r in rows:
            out.append(
                {
                    "id": r.id,
                    "summary": r.summary,
                    "source": r.source,
                    "metadata": r.meta_data or {},
                    "updated_at": str(r.updated_at) if r.updated_at is not None else None,
                }
            )
        return out

    def list_memories(self, user_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        with self.SessionLocal() as session:
            stmt = (
                select(UserMemoryModel)
                .where(UserMemoryModel.user_id == user_id)
                .order_by(UserMemoryModel.updated_at.desc())
                .limit(limit)
            )
            rows = session.execute(stmt).scalars().all()
        return [
            {
                "id": r.id,
                "summary": r.summary,
                "source": r.source,
                "metadata": r.meta_data or {},
                "updated_at": str(r.updated_at) if r.updated_at is not None else None,
            }
            for r in rows
        ]

    # ------------------------
    # Reranking helpers
    # ------------------------
    def _rerank(self, query: str, items: List[RetrievedChunk], top_k: int) -> List[RetrievedChunk]:
        if not items:
            return []
        # Enforce reranking as a required step; if misconfigured, fall back to distance order
        pre_ids = [it.chunk_id for it in items[:top_k]]
        if self.config.reranker_backend in ("remote", "auto"):
            if not self.config.reranker_remote_url:
                self.logger.warning("RERANKER_REMOTE_URL not set; skipping rerank")
                res = items[:top_k]
                post_ids = [it.chunk_id for it in res]
                self._metrics["rerank_total"] += 1
                if post_ids != pre_ids:
                    self._metrics["rerank_changed"] += 1
                    self.logger.info("rerank(remote) changed order: pre=%s post=%s", pre_ids, post_ids)
                return res
            try:
                import requests
                sess = self._remote_session or requests.Session()
                payload = {"query": query, "texts": [it.text for it in items], "model": self.config.reranker_model_name}
                resp = sess.post(self.config.reranker_remote_url, json=payload, timeout=30)
                resp.raise_for_status()
                data = resp.json()
                scores = data.get("scores") or data.get("data")
                if not isinstance(scores, list) or len(scores) != len(items):
                    raise RuntimeError("Invalid reranker response")
                ranked = sorted(zip(items, scores), key=lambda t: float(t[1]), reverse=True)
                return [RetrievedChunk(doc_id=it.doc_id, chunk_id=it.chunk_id, text=it.text, score=float(sc), metadata=it.metadata) for it, sc in ranked[:top_k]]
            except Exception as e:
                self.logger.error("Remote rerank failed: %s", e)
                return items[:top_k]
        if self.config.reranker_backend in ("local", "auto") and self._reranker_model is not None:
            try:
                pairs = [(query, it.text) for it in items]
                scores = self._reranker_model.predict(pairs)  # type: ignore[attr-defined]
                ranked = sorted(zip(items, scores), key=lambda t: float(t[1]), reverse=True)
                return [RetrievedChunk(doc_id=it.doc_id, chunk_id=it.chunk_id, text=it.text, score=float(sc), metadata=it.metadata) for it, sc in ranked[:top_k]]
            except Exception as e:
                self.logger.error("Local rerank failed: %s", e)
                res = items[:top_k]
                post_ids = [it.chunk_id for it in res]
                self._metrics["rerank_total"] += 1
                if post_ids != pre_ids:
                    self._metrics["rerank_changed"] += 1
                    self.logger.info("rerank(local) changed order: pre=%s post=%s", pre_ids, post_ids)
                return res
        res = items[:top_k]
        post_ids = [it.chunk_id for it in res]
        self._metrics["rerank_total"] += 1
        if post_ids != pre_ids:
            self._metrics["rerank_changed"] += 1
            self.logger.info("rerank(none) changed order: pre=%s post=%s", pre_ids, post_ids)
        return res

    def get_metrics(self) -> Dict[str, int]:
        return dict(self._metrics)

    # ------------------------
    # RAGAS metrics logging
    # ------------------------
    def log_ragas_metrics(
        self,
        user_id: Optional[str],
        session_id: Optional[str],
        query: str,
        answer: str,
        retrieved_chunks: List[RetrievedChunk],
        dynamic_refs: List[Dict[str, Any]],
        memories: List[Dict[str, Any]],
        citations: List[Dict[str, Any]],
        pre_rerank_scores: Optional[List[float]] = None,
        post_rerank_scores: Optional[List[float]] = None,
        retrieval_time_ms: Optional[float] = None,
        generation_time_ms: Optional[float] = None,
        total_time_ms: Optional[float] = None,
    ) -> str:
        """Log RAGAS evaluation metrics for RAG pipeline quality monitoring."""
        metric_id = str(uuid.uuid4())
        
        kb_chunk_ids = [rc.chunk_id for rc in retrieved_chunks]
        log_ids = [d.get("id", "") for d in dynamic_refs if d.get("id")]
        memory_ids = [m.get("id", "") for m in memories if m.get("id")]
        
        # Check citation quality
        has_citations = bool(citations)
        citation_count = len(citations) if citations else 0
        
        # Detect rerank order change
        rerank_changed = False
        if pre_rerank_scores and post_rerank_scores and len(pre_rerank_scores) == len(post_rerank_scores):
            rerank_changed = pre_rerank_scores != post_rerank_scores
        
        with self.SessionLocal() as session:
            with session.begin():
                metric = RagasMetricsModel(
                    id=metric_id,
                    user_id=user_id,
                    session_id=session_id,
                    query=query,
                    answer=answer,
                    kb_chunks_retrieved=kb_chunk_ids,
                    logs_retrieved=log_ids,
                    memories_retrieved=memory_ids,
                    retrieval_count=len(kb_chunk_ids),
                    pre_rerank_scores=[str(s) for s in pre_rerank_scores] if pre_rerank_scores else None,
                    post_rerank_scores=[str(s) for s in post_rerank_scores] if post_rerank_scores else None,
                    rerank_changed_order=rerank_changed,
                    answer_length=len(answer),
                    has_citations=has_citations,
                    citation_count=citation_count,
                    retrieval_time_ms=retrieval_time_ms,
                    generation_time_ms=generation_time_ms,
                    total_time_ms=total_time_ms,
                    meta_data={},
                )
                session.add(metric)
        
        return metric_id

    # ------------------------
    # Workout stats and pattern detection for enhanced context
    # ------------------------
    def _get_user_fitness_overview(self, user_id: str) -> str:
        """Get comprehensive fitness overview stats for chat context."""
        try:
            with self.SessionLocal() as session:
                now = datetime.now(timezone.utc)
                seven_days_ago = now - timedelta(days=7)
                thirty_days_ago = now - timedelta(days=30)
                
                # Sessions this week/month
                workouts_7d = session.execute(
                    select(WorkoutSessionModel)
                    .where(WorkoutSessionModel.user_id == user_id)
                    .where(WorkoutSessionModel.occurred_at >= seven_days_ago)
                ).scalars().all()
                workouts_30d = session.execute(
                    select(WorkoutSessionModel)
                    .where(WorkoutSessionModel.user_id == user_id)
                    .where(WorkoutSessionModel.occurred_at >= thirty_days_ago)
                ).scalars().all()
                
                session_count_7d = len(workouts_7d)
                session_count_30d = len(workouts_30d)
                
                # Calculate total hours
                total_minutes_7d = sum(w.duration_minutes or 0 for w in workouts_7d)
                total_hours_7d = round(total_minutes_7d / 60, 1)
                
                # Top exercises (frequency)
                exercise_counts = {}
                for workout in workouts_30d:
                    exercises = session.execute(
                        select(ExerciseLogModel)
                        .where(ExerciseLogModel.session_id == workout.id)
                    ).scalars().all()
                    for ex in exercises:
                        name = ex.exercise_name or "Unknown"
                        exercise_counts[name] = exercise_counts.get(name, 0) + 1
                
                top_exercises = sorted(exercise_counts.items(), key=lambda x: x[1], reverse=True)[:3]
                top_exercises_str = ", ".join([f"{name} ({count}x)" for name, count in top_exercises]) if top_exercises else "None"
                
                # Pattern detection: push vs pull vs legs
                push_exercises = ["bench", "press", "chest", "shoulder", "tricep"]
                pull_exercises = ["pull", "row", "deadlift", "back", "bicep", "lat"]
                leg_exercises = ["squat", "leg", "lunge", "calf"]
                
                push_count = sum(count for name, count in exercise_counts.items() if any(p in name.lower() for p in push_exercises))
                pull_count = sum(count for name, count in exercise_counts.items() if any(p in name.lower() for p in pull_exercises))
                leg_count = sum(count for name, count in exercise_counts.items() if any(l in name.lower() for l in leg_exercises))
                
                pattern = []
                if push_count > pull_count + leg_count:
                    pattern.append("heavy on push")
                if pull_count > push_count + leg_count:
                    pattern.append("heavy on pull")
                if leg_count < max(push_count, pull_count) / 2:
                    pattern.append("light on legs")
                pattern_str = ", ".join(pattern) if pattern else "balanced"
                
                # Recovery: average days between workouts
                if len(workouts_30d) > 1:
                    dates = sorted([w.occurred_at for w in workouts_30d if w.occurred_at], reverse=True)
                    gaps = [(dates[i] - dates[i+1]).days for i in range(len(dates)-1)]
                    avg_recovery = round(sum(gaps) / len(gaps), 1) if gaps else None
                else:
                    avg_recovery = None
                
                # Goal progress (if available)
                user = self.get_user(user_id)
                goal_info = ""
                if user:
                    meta_data = user.get("meta_data", {})
                    goals = meta_data.get("goals", {})
                    if goals.get("target_weight"):
                        goal_info = f"\n- Goal progress: {goals.get('current_weight', 'N/A')}kg → {goals.get('target_weight')}kg target"
                
                overview = f"""USER FITNESS OVERVIEW:
- This week: {session_count_7d} sessions, {total_hours_7d}h total
- This month: {session_count_30d} sessions
- Top exercises: {top_exercises_str}
- Pattern: {pattern_str}
- Recovery: {avg_recovery if avg_recovery else 'N/A'} day avg between sessions{goal_info}"""
                
                return overview
        except Exception as e:
            self.logger.warning("Failed to generate fitness overview: %s", e)
            return ""
    
    def preload_user_context(self, user_id: str) -> Dict[str, Any]:
        """
        Pre-load user context for faster chat responses.
        Called on login to pre-load user's fitness data, memories, and patterns.
        
        Returns cached context that can be reused for chat requests.
        Note: OpenAI doesn't require warm-up (always ready), so this only pre-loads context data.
        """
        import time
        cache_ttl = 600  # 10 minutes
        current_time = time.time()
        
        # Check if context is already cached and valid
        if user_id in self._user_context_cache:
            context_dict, timestamp = self._user_context_cache[user_id]
            if current_time - timestamp < cache_ttl:
                self.logger.debug("Using cached pre-loaded context for user %s", user_id)
                return context_dict
        
        # Pre-load context in background (non-blocking)
        self.logger.info("Pre-loading context for user %s (FitAI booting up...)", user_id)
        
        try:
            # Load static user data
            user = self.get_user(user_id)
            static_summary = self._summarize_user(user)
            
            # Load long-term memories (generic query to get top memories)
            memories = self.retrieve_memories(user_id=user_id, query="user fitness goals patterns", top_k=5)
            mem_lines = [f"- {m['summary']}" for m in memories]
            memory_text = "\n".join(mem_lines) if mem_lines else "(no long-term memory yet)"
            
            # Load fitness overview and patterns (already cached, but ensure they're loaded)
            fitness_overview = self._get_user_fitness_overview(user_id)
            user_patterns = self._detect_user_patterns(user_id)
            
            # Load recent workouts (generic query to get recent logs)
            dyn = self.retrieve_training_logs(user_id=user_id, query="recent workouts training", top_k=5)
            dyn_blocks = [
                f"[Log {i+1}] ({d.get('topic') or d.get('kind')}) {d['notes']}" for i, d in enumerate(dyn)
            ]
            dyn_text = "\n\n".join(dyn_blocks) if dyn_blocks else "(no personal history found)"
            
            # Cache the pre-loaded context
            context_dict = {
                "static_summary": static_summary,
                "memory_text": memory_text,
                "fitness_overview": fitness_overview,
                "user_patterns": user_patterns,
                "dyn_text": dyn_text,
            }
            
            self._user_context_cache[user_id] = (context_dict, current_time)
            self.logger.info("Pre-loaded context for user %s (FitAI ready!)", user_id)
            
            return context_dict
        except Exception as e:
            self.logger.warning("Failed to pre-load context for user %s: %s", user_id, e)
            return {}
    
    def _detect_user_patterns(self, user_id: str) -> List[str]:
        """Detect simple patterns from workout history for chat context."""
        patterns = []
        try:
            with self.SessionLocal() as session:
                now = datetime.now(timezone.utc)
                thirty_days_ago = now - timedelta(days=30)
                
                # Get recent workouts
                workouts = session.execute(
                    select(WorkoutSessionModel)
                    .where(WorkoutSessionModel.user_id == user_id)
                    .where(WorkoutSessionModel.occurred_at >= thirty_days_ago)
                    .order_by(WorkoutSessionModel.occurred_at.desc())
                ).scalars().all()
                
                if not workouts:
                    return patterns
                
                # Day of week pattern
                day_counts = {}
                for w in workouts:
                    if w.occurred_at:
                        day = w.occurred_at.strftime("%A")
                        day_counts[day] = day_counts.get(day, 0) + 1
                
                if day_counts:
                    top_day = max(day_counts.items(), key=lambda x: x[1])
                    if top_day[1] >= 3:
                        patterns.append(f"You train most on {top_day[0]}s ({top_day[1]}x this month)")
                
                # Consistency streak
                dates = sorted([w.occurred_at for w in workouts if w.occurred_at], reverse=True)
                if len(dates) >= 7:
                    # Check for consecutive days
                    streak = 1
                    for i in range(len(dates)-1):
                        if (dates[i] - dates[i+1]).days == 1:
                            streak += 1
                        else:
                            break
                    if streak >= 7:
                        patterns.append(f"You've been consistent for {streak} consecutive days")
                
                # Exercise frequency patterns
                exercise_names = set()
                for workout in workouts:
                    exercises = session.execute(
                        select(ExerciseLogModel)
                        .where(ExerciseLogModel.session_id == workout.id)
                    ).scalars().all()
                    for ex in exercises:
                        if ex.exercise_name:
                            exercise_names.add(ex.exercise_name.lower())
                
                # Check for leg day skipping
                leg_keywords = ["squat", "leg", "lunge", "calf", "quad", "hamstring"]
                has_legs = any(any(keyword in name for keyword in leg_keywords) for name in exercise_names)
                if not has_legs and len(workouts) >= 5:
                    patterns.append("You've been skipping leg day (no leg exercises in recent workouts)")
                
                # Frequency pattern
                if len(workouts) >= 10:
                    weekly_avg = len(workouts) / 4.3  # Approximate weeks
                    if weekly_avg >= 5:
                        patterns.append(f"You train {weekly_avg:.1f}x per week on average (high frequency)")
                    elif weekly_avg <= 2:
                        patterns.append(f"You train {weekly_avg:.1f}x per week on average (low frequency)")
                
        except Exception as e:
            self.logger.warning("Failed to detect patterns: %s", e)
        
        return patterns

    # ------------------------
    # Prompt preparation for streaming/structured modes
    # ------------------------
    def _prepare_prompt(self, query: str, user_id: Optional[str], session_id: Optional[str]) -> Dict[str, Any]:
        if len(query) > self.config.max_query_chars:
            query = query[: self.config.max_query_chars]
        
        # Sequential retrieval (parallelization removed due to connection pool conflicts)
        retrieved = self.retrieve(query, user_id=user_id, top_k=None)
        dyn = []
        memories = []
        if user_id:
            dyn = self.retrieve_training_logs(user_id=user_id, query=query, top_k=min(5, self.config.top_k))
            memories = self.retrieve_memories(user_id=user_id, query=query, top_k=5)
        
        static_summary = self._summarize_user(self.get_user(user_id) if user_id else None)
        session_msgs = self.get_session_messages(user_id or "anonymous", session_id, max_messages=20) if user_id else []
        session_text_lines = [f"{m['role']}: {m['content']}" for m in session_msgs]
        session_context = "\n".join(session_text_lines) if session_text_lines else "(no recent messages)"
        # Limit KB chunks to top 5
        kb_blocks = [f"[KB {i+1}] {rc.text}" for i, rc in enumerate(retrieved[:5])]
        kb_text = "\n\n".join(kb_blocks) if kb_blocks else "(no KB context)"
        dyn_blocks = [f"[Log {i+1}] ({d.get('topic') or d.get('kind')}) {d['notes']}" for i, d in enumerate(dyn)]
        dyn_text = "\n\n".join(dyn_blocks) if dyn_blocks else "(no personal history found)"
        mem_lines = [f"- {m['summary']}" for m in memories]
        memory_text = "\n".join(mem_lines) if mem_lines else "(no long-term memory yet)"
        system_text = (
            "You are FitAI, a quirky and warm AI fitness coach with personality. You're like that gym buddy who's knowledgeable, a bit cheeky, remembers everything, and isn't afraid to call you out (gently) or celebrate your wins enthusiastically.\n\n"
            "YOUR PERSONALITY:\n"
            "- You have opinions and share them - 'Honestly? That's a solid plan' or 'Nah, skip that, here's why...'\n"
            "- You talk back sometimes - if someone says 'I skipped leg day again', you might respond 'Leg day skippers, name a more iconic duo 😏' but then help them get back on track\n"
            "- You're observant and sometimes call things out - 'I see you've been consistent this week... but where's leg day?'\n"
            "- You celebrate wins like a hype friend - '10 workouts in 7 days?! That's not consistency, that's dedication 🔥'\n"
            "- You're warm but not a pushover - you care about their progress, not just being nice\n"
            "- You use emojis when they add personality (💪 🔥 🎯 😏 🤔), not just for decoration\n"
            "- You ask follow-ups when curious - 'Wait, tell me more about...'\n\n"
            "YOUR STYLE:\n"
            "- Talk like you're texting a friend who also happens to be a fitness expert\n"
            "- Reference their workout history naturally - it makes you feel observant and caring\n"
            "- Be encouraging but authentic - celebrate progress, normalize setbacks, but don't sugarcoat\n"
            "- Have a bit of edge - you're not a robot, you're a coach with personality\n\n"
            "HOW TO USE CONTEXT:\n"
            "- Use the context below to inform your answers, but respond with personality\n"
            "- If you see workout logs (RECENT WORKOUTS), reference them - it shows you're paying attention\n"
            "- Cite sources [KB 1], [Log 2] when making specific claims, but don't overdo it\n"
            "- If context is missing, ask with personality: 'I'd love to help! What's your current...?' or 'Tell me about...'\n\n"
            "IMPORTANT:\n"
            "- Ground your advice in the context provided, but let your personality shine through\n"
            "- Don't say 'Based on the provided knowledge base' - that's too formal and robotic\n"
            "- Don't force references - use them when they make the conversation better\n"
            "- Keep answers conversational (2-4 sentences, but let it flow)\n"
            "- Safety: Always acknowledge injuries/restrictions if mentioned in ABOUT THIS USER\n"
            "- Be quirky but not annoying - personality is good, being over-the-top is not\n"
        )
        
        # Build context (optimized: cached fitness overview/patterns, no hooks)
        import time
        context_text = f"ABOUT THIS USER:\n{static_summary}\n\n"
        
        if memory_text and memory_text != "(no long-term memory yet)":
            context_text += f"LONG-TERM PATTERNS:\n{memory_text}\n\n"
        
        # Get fitness overview and patterns (cached, 5 min TTL)
        fitness_overview = ""
        user_patterns = []
        if user_id:
            cache_ttl = 300  # 5 minutes
            current_time = time.time()
            
            # Check fitness overview cache
            if user_id in self._fitness_overview_cache:
                overview, timestamp = self._fitness_overview_cache[user_id]
                if current_time - timestamp < cache_ttl:
                    fitness_overview = overview
                else:
                    del self._fitness_overview_cache[user_id]
            
            if not fitness_overview:
                fitness_overview = self._get_user_fitness_overview(user_id)
                self._fitness_overview_cache[user_id] = (fitness_overview, current_time)
            
            # Check patterns cache
            if user_id in self._patterns_cache:
                patterns, timestamp = self._patterns_cache[user_id]
                if current_time - timestamp < cache_ttl:
                    user_patterns = patterns
                else:
                    del self._patterns_cache[user_id]
            
            if not user_patterns:
                user_patterns = self._detect_user_patterns(user_id)
                self._patterns_cache[user_id] = (user_patterns, current_time)
        
        if fitness_overview:
            context_text += f"{fitness_overview}\n\n"
        
        if user_patterns:
            patterns_text = "\n".join([f"- {p}" for p in user_patterns])
            context_text += f"USER PATTERNS:\n{patterns_text}\n\n"
        
        if dyn_text and dyn_text != "(no personal history found)":
            context_text += f"RECENT WORKOUTS:\n{dyn_text}\n\n"
        
        if session_context and session_context != "(no recent messages)":
            context_text += f"RECENT CONVERSATION:\n{session_context}\n\n"
        
        if kb_text and kb_text != "(no KB context)":
            context_text += f"FITNESS KNOWLEDGE:\n{kb_text}\n\n"
        
        if len(context_text) > self.config.max_context_chars:
            context_text = context_text[: self.config.max_context_chars]
        prompt = None
        try:
            if hasattr(self.generator_tokenizer, "apply_chat_template") and getattr(self.generator_tokenizer, "chat_template", None):
                messages = [
                    {"role": "system", "content": system_text},
                    {"role": "user", "content": context_text + f"User message: {query}"},
                ]
                prompt = self.generator_tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        except Exception:
            prompt = None
        if not prompt:
            prompt = system_text + "\n\n" + context_text + f"User message: {query}\nAssistant: "
        citations = [{"chunk_id": r.chunk_id, "source": (r.metadata.get("source") if isinstance(r.metadata, dict) else None)} for r in retrieved]
        references = [
            {"doc_id": r.doc_id, "chunk_id": r.chunk_id, "score": r.score, "metadata": r.metadata, "snippet": r.text[:300]}
            for r in retrieved
        ]
        return {"prompt": prompt, "retrieved": retrieved, "references": references, "citations": citations}

    def _highlight_snippet(self, text: str, query: str, max_len: int = 240) -> str:
        q = (query or "").strip()
        if not q:
            return (text or "")[:max_len]
        import re
        terms = [t for t in re.findall(r"\w+", q.lower()) if len(t) >= 3]
        seen = set()
        uniq = []
        for t in terms:
            if t not in seen:
                uniq.append(re.escape(t))
                seen.add(t)
            if len(uniq) >= 5:
                break
        if not uniq:
            return (text or "")[:max_len]
        pattern = re.compile("(" + "|".join(uniq) + ")", re.IGNORECASE)
        m = pattern.search(text)
        if not m:
            s = (text or "")[:max_len]
        else:
            start = max(0, m.start() - max_len // 3)
            end = min(len(text), m.end() + (max_len * 2) // 3)
            s = text[start:end]
        s = pattern.sub(lambda m: f"<em>{m.group(0)}</em>", s)
        if len(s) > max_len:
            s = s[:max_len]
        return s

    def search(self, query: str, user_id: Optional[str], top_k: int) -> Dict[str, Any]:
        candidates_k = max(top_k, self.config.retriever_candidates)
        base = self.retrieve(query, user_id=user_id, top_k=candidates_k)
        reranked = self._rerank(query, base, top_k=top_k)
        results: List[Dict[str, Any]] = []
        for r in reranked:
            source = r.metadata.get("source") if isinstance(r.metadata, dict) else None
            results.append({
                "doc_id": r.doc_id,
                "chunk_id": r.chunk_id,
                "score": float(r.score),
                "text": r.text,
                "metadata": r.metadata,
                "snippet": self._highlight_snippet(r.text, query),
                "source": source,
            })
        citations = [{"chunk_id": it["chunk_id"], "source": it.get("source")} for it in results]
        return {"results": results, "citations": citations, "count": len(results)}

    def chat(
        self,
        query: str,
        user_id: Optional[str],
        session_id: Optional[str] = None,
        top_k: Optional[int] = None,
        max_new_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
        mode: Optional[str] = None,
    ) -> Dict[str, Any]:
        # Timing for performance monitoring
        import time
        start_time = time.time()
        
        # Clamp input length
        if len(query) > self.config.max_query_chars:
            query = query[: self.config.max_query_chars]
        # Append user message to session buffer
        if user_id:
            self.append_session_message(user_id, session_id, role="user", content=query)

            # Auto-trigger conversation summary if needed (weekly)
            try:
                from memory import should_generate_conversation_summary, refresh_user_conversation_memory
                if should_generate_conversation_summary(self, user_id, days=7):
                    # Generate summary asynchronously (fire and forget)
                    import threading
                    def generate_summary():
                        try:
                            refresh_user_conversation_memory(self, user_id, days=7)
                            self.logger.info("Auto-generated conversation summary for user %s", user_id)
                        except Exception as e:
                            self.logger.warning("Failed to auto-generate conversation summary: %s", e)
                    threading.Thread(target=generate_summary, daemon=True).start()
            except Exception as e:
                self.logger.debug("Conversation summary check failed: %s", e)

        # Use pre-loaded context if available (much faster!)
        retrieval_start = time.time()
        preloaded_context = None
        if user_id and user_id in self._user_context_cache:
            context_dict, timestamp = self._user_context_cache[user_id]
            cache_ttl = 600  # 10 minutes
            if time.time() - timestamp < cache_ttl:
                preloaded_context = context_dict
                self.logger.debug("Using pre-loaded context for user %s", user_id)
        
        # Only retrieve KB context (query-specific) and session context (session-specific)
        # Everything else comes from pre-loaded context
        retrieved = self.retrieve(query, user_id=user_id, top_k=top_k)
        retrieval_time = (time.time() - retrieval_start) * 1000
        self.logger.debug("KB retrieval took %.1fms", retrieval_time)

        # Use pre-loaded context or load on-demand
        if preloaded_context:
            static_summary = preloaded_context.get("static_summary", "")
            memory_text = preloaded_context.get("memory_text", "(no long-term memory yet)")
            fitness_overview = preloaded_context.get("fitness_overview", "")
            user_patterns = preloaded_context.get("user_patterns", [])
            dyn_text = preloaded_context.get("dyn_text", "(no personal history found)")
        else:
            # Fallback: load context on-demand (slower, but works if preload wasn't called)
            static_summary = self._summarize_user(self.get_user(user_id) if user_id else None)
            memories = self.retrieve_memories(user_id=user_id, query=query, top_k=5) if user_id else []
            mem_lines = [f"- {m['summary']}" for m in memories]
            memory_text = "\n".join(mem_lines) if mem_lines else "(no long-term memory yet)"
            
            # Get fitness overview and patterns (cached, 5 min TTL)
            fitness_overview = ""
            user_patterns = []
            if user_id:
                cache_ttl = 300  # 5 minutes
                current_time = time.time()
                
                if user_id in self._fitness_overview_cache:
                    overview, timestamp = self._fitness_overview_cache[user_id]
                    if current_time - timestamp < cache_ttl:
                        fitness_overview = overview
                    else:
                        del self._fitness_overview_cache[user_id]
                
                if not fitness_overview:
                    fitness_overview = self._get_user_fitness_overview(user_id)
                    self._fitness_overview_cache[user_id] = (fitness_overview, current_time)
                
                if user_id in self._patterns_cache:
                    patterns, timestamp = self._patterns_cache[user_id]
                    if current_time - timestamp < cache_ttl:
                        user_patterns = patterns
                    else:
                        del self._patterns_cache[user_id]
                
                if not user_patterns:
                    user_patterns = self._detect_user_patterns(user_id)
                    self._patterns_cache[user_id] = (user_patterns, current_time)
            
            # Get recent workouts
            dyn = self.retrieve_training_logs(user_id=user_id, query=query, top_k=min(5, (top_k or self.config.top_k))) if user_id else []
        dyn_blocks = [
            f"[Log {i+1}] ({d.get('topic') or d.get('kind')}) {d['notes']}" for i, d in enumerate(dyn)
        ]
        dyn_text = "\n\n".join(dyn_blocks) if dyn_blocks else "(no personal history found)"

        # Session recap - retrieve conversation history (optimized: limit to 20 messages)
        # This is session-specific, so always load fresh
        session_msgs = self.get_session_messages(user_id or "anonymous", session_id, max_messages=20) if user_id else []
        session_text_lines = [f"{m['role']}: {m['content']}" for m in session_msgs]
        session_context = "\n".join(session_text_lines) if session_text_lines else "(no recent messages)"

        # Limit KB chunks to top 5 for faster processing
        kb_blocks = [f"[KB {i+1}] {rc.text}" for i, rc in enumerate(retrieved[:5])]
        kb_text = "\n\n".join(kb_blocks) if kb_blocks else "(no KB context)"

        # Build prompt with optional structured mode
        system_text = (
            "You are FitAI, a quirky and warm AI fitness coach with personality. You're like that gym buddy who's knowledgeable, a bit cheeky, remembers everything, and isn't afraid to call you out (gently) or celebrate your wins enthusiastically.\n\n"
            "YOUR PERSONALITY:\n"
            "- You have opinions and share them - 'Honestly? That's a solid plan' or 'Nah, skip that, here's why...'\n"
            "- You talk back sometimes - if someone says 'I skipped leg day again', you might respond 'Leg day skippers, name a more iconic duo 😏' but then help them get back on track\n"
            "- You're observant and sometimes call things out - 'I see you've been consistent this week... but where's leg day?'\n"
            "- You celebrate wins like a hype friend - '10 workouts in 7 days?! That's not consistency, that's dedication 🔥'\n"
            "- You're warm but not a pushover - you care about their progress, not just being nice\n"
            "- You use emojis when they add personality (💪 🔥 🎯 😏 🤔), not just for decoration\n"
            "- You ask follow-ups when curious - 'Wait, tell me more about...'\n\n"
            "YOUR STYLE:\n"
            "- Talk like you're texting a friend who also happens to be a fitness expert\n"
            "- Reference their workout history naturally - it makes you feel observant and caring\n"
            "- Be encouraging but authentic - celebrate progress, normalize setbacks, but don't sugarcoat\n"
            "- Have a bit of edge - you're not a robot, you're a coach with personality\n\n"
            "HOW TO USE CONTEXT:\n"
            "- Use the context below to inform your answers, but respond with personality\n"
            "- If you see workout logs (RECENT WORKOUTS), reference them - it shows you're paying attention\n"
            "- Cite sources [KB 1], [Log 2] when making specific claims, but don't overdo it\n"
            "- If context is missing, ask with personality: 'I'd love to help! What's your current...?' or 'Tell me about...'\n\n"
            "IMPORTANT:\n"
            "- Ground your advice in the context provided, but let your personality shine through\n"
            "- Don't say 'Based on the provided knowledge base' - that's too formal and robotic\n"
            "- Don't force references - use them when they make the conversation better\n"
            "- Keep answers conversational (2-4 sentences, but let it flow)\n"
            "- Safety: Always acknowledge injuries/restrictions if mentioned in ABOUT THIS USER\n"
            "- Be quirky but not annoying - personality is good, being over-the-top is not\n"
        )
        if mode == "structured":
            system_text += (
                "\nRespond STRICTLY in JSON with keys: 'answer' (string) and 'claims' (array of {text, source_index}). "
                "source_index must map to the [KB i] items below (1-indexed)."
            )
        
        # Build context (using pre-loaded context if available)
        context_start = time.time()
        context_text = f"ABOUT THIS USER:\n{static_summary}\n\n"
        
        if memory_text and memory_text != "(no long-term memory yet)":
            context_text += f"LONG-TERM PATTERNS:\n{memory_text}\n\n"
        
        if fitness_overview:
            context_text += f"{fitness_overview}\n\n"
        
        if user_patterns:
            patterns_text = "\n".join([f"- {p}" for p in user_patterns])
            context_text += f"USER PATTERNS:\n{patterns_text}\n\n"
        
        if dyn_text and dyn_text != "(no personal history found)":
            context_text += f"RECENT WORKOUTS:\n{dyn_text}\n\n"
        
        if session_context and session_context != "(no recent messages)":
            context_text += f"RECENT CONVERSATION:\n{session_context}\n\n"
        
        if kb_text and kb_text != "(no KB context)":
            context_text += f"FITNESS KNOWLEDGE:\n{kb_text}\n\n"
        
        context_time = (time.time() - context_start) * 1000
        self.logger.debug("Context building took %.1fms (pre-loaded: %s)", context_time, "yes" if preloaded_context else "no")
        
        # Clamp context size
        if len(context_text) > self.config.max_context_chars:
            context_text = context_text[: self.config.max_context_chars]
        use_chat_template = False
        prompt = None
        try:
            if hasattr(self.generator_tokenizer, "apply_chat_template") and getattr(self.generator_tokenizer, "chat_template", None):
                messages = [
                    {"role": "system", "content": system_text},
                    {"role": "user", "content": context_text + f"User message: {query}"},
                ]
                prompt = self.generator_tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
                use_chat_template = True
        except Exception:
            use_chat_template = False
        if not prompt:
            prompt = (
                system_text + "\n\n" + context_text + f"User message: {query}\nAssistant: "
            )

        # Generate via OpenAI or remote backend if configured
        generation_start = time.time()
        
        # OpenAI generation (preferred)
        if self.config.gen_backend == "openai" and self._openai_client:
            try:
                messages = [
                    {"role": "system", "content": system_text},
                    {"role": "user", "content": context_text + f"User message: {query}"}
                ]
                response = self._openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    max_tokens=max_new_tokens or self.config.max_new_tokens,
                    temperature=temperature if temperature is not None else self.config.temperature,
                )
                ans = response.choices[0].message.content.strip()
            except Exception as e:
                self.logger.error("OpenAI generation failed: %s", e)
                if self.config.remote_fallback_local:
                    self.logger.info("Falling back to local generation backend")
                else:
                    return {"answer": "", "references": [], "dynamic_refs": [], "error": str(e)}
        
        # Modal/Remote generation (backward compatibility)
        elif self.config.gen_backend == "remote" and self._remote_session and self.config.remote_gen_url:
            try:
                payload = {
                    "model": self.config.hf_model_id,
                    "prompt": prompt,
                    "max_tokens": max_new_tokens or self.config.max_new_tokens,
                    "temperature": temperature if temperature is not None else self.config.temperature,
                }
                resp = self._remote_session.post(self.config.remote_gen_url, json=payload, timeout=self.config.gen_timeout_ms / 1000.0)
                resp.raise_for_status()
                data = resp.json()
                # Expect OpenAI/vLLM style {choices: [{text|message: {content}}]}
                if isinstance(data, dict) and "choices" in data and data["choices"]:
                    choice = data["choices"][0]
                    if "text" in choice:
                        ans = str(choice["text"]).strip()
                    elif "message" in choice and "content" in choice["message"]:
                        ans = str(choice["message"]["content"]).strip()
                    else:
                        ans = str(data)
                else:
                    ans = str(data)
            except Exception as e:
                self.logger.error("Remote generation failed: %s", e)
                if self.config.remote_fallback_local:
                    self.logger.info("Falling back to local generation backend")
                else:
                    return {"answer": "", "references": [], "dynamic_refs": [], "error": str(e)}
        if self.config.gen_backend == "remote" and not self.config.remote_fallback_local:
            # If remote only and we didn't return earlier, ans should be ready
            references = [
                {
                    "doc_id": r.doc_id,
                    "chunk_id": r.chunk_id,
                    "score": r.score,
                    "metadata": r.metadata,
                    "snippet": r.text[:300],
                }
                for r in retrieved
            ]
            citations = [
                {"chunk_id": r.chunk_id, "source": (r.metadata.get("source") if isinstance(r.metadata, dict) else None)}
                for r in retrieved
            ]
            claims: List[Dict[str, Any]] = []
            if mode == "structured":
                try:
                    import json as _json
                    parsed = _json.loads(ans)
                    if isinstance(parsed, dict) and "answer" in parsed:
                        claims = parsed.get("claims") or []
                        ans = str(parsed.get("answer") or "").strip()
                except Exception:
                    pass
            if user_id and ans:
                self.append_session_message(user_id, session_id, role="assistant", content=ans)
            return {"answer": ans, "references": references, "citations": citations, "claims": claims, "dynamic_refs": dyn[:5]}
        else:
            if self.generator_tokenizer is None or self.generator_model is None:
                raise RuntimeError("Generation model is not initialized")

        # Manual generation avoids pipeline cache issues
        # Try to enable caching for better performance (fallback to False if model doesn't support it)
        use_cache = True
        if "phi-3" in self.config.hf_model_id.lower():
            # Phi-3 has known caching issues, disable for compatibility
            use_cache = False
        
        gen_kwargs = {
            "max_new_tokens": max_new_tokens or self.config.max_new_tokens,
            "temperature": temperature if temperature is not None else self.config.temperature,
            "do_sample": True,
            "use_cache": use_cache,  # Enable caching for better performance (disabled for Phi-3)
            "top_p": 0.9,
            "repetition_penalty": 1.1,
            "no_repeat_ngram_size": 3,
        }
        if self.generator_tokenizer is not None:
            eos_id = self.generator_tokenizer.eos_token_id
            pad_id = self.generator_tokenizer.pad_token_id or eos_id
            if eos_id is not None:
                gen_kwargs["eos_token_id"] = eos_id
            if pad_id is not None:
                gen_kwargs["pad_token_id"] = pad_id

        inputs = self.generator_tokenizer(prompt, return_tensors="pt")
        device_str = self._resolve_torch_device()
        if device_str == "cuda" and torch.cuda.is_available():
            inputs = {k: v.to(0) if hasattr(v, "to") else v for k, v in inputs.items()}
        elif device_str == "mps" and torch.backends.mps.is_available():
            inputs = {k: v.to("mps") if hasattr(v, "to") else v for k, v in inputs.items()}

        # Stop when the model tries to continue a dialogue with role/Q&A markers
        # OPTIMIZED: Only decode recent tokens (last 50) instead of entire sequence
        class StopOnSubstrings(StoppingCriteria):
            def __init__(self, tokenizer, stop_strings: List[str], start_len: int):
                self.tokenizer = tokenizer
                self.stop_strings = stop_strings
                self.start_len = start_len
                # Pre-encode stop strings as token sequences for faster matching
                self.stop_token_sequences = []
                for stop_str in stop_strings:
                    try:
                        tokens = tokenizer.encode(stop_str, add_special_tokens=False)
                        if tokens:
                            self.stop_token_sequences.append(tokens)
                    except Exception:
                        pass  # Fallback to text matching if encoding fails
            
            def __call__(self, input_ids, scores, **kwargs):
                # Only examine newly generated suffix to avoid triggering on prompt text
                if input_ids.shape[1] <= self.start_len:
                    return False
                
                # OPTIMIZATION: Check token sequences first (much faster)
                new_tokens = input_ids[0][self.start_len:].tolist()
                # Check if any stop token sequence matches recent tokens
                for stop_tokens in self.stop_token_sequences:
                    if len(new_tokens) >= len(stop_tokens):
                        # Check last N tokens where N = length of stop sequence
                        if new_tokens[-len(stop_tokens):] == stop_tokens:
                            return True
                
                # FALLBACK: Only decode last 50 tokens (not entire sequence) for text matching
                # This is much faster than decoding the entire sequence
                recent_tokens = new_tokens[-50:] if len(new_tokens) > 50 else new_tokens
                try:
                    text = self.tokenizer.decode(recent_tokens, skip_special_tokens=True)
                    # Only check stop strings that might appear in recent text
                    return any(s in text for s in self.stop_strings)
                except Exception:
                    return False

        stop_strings = [
            "\nUSER:", "USER:", "\nUser:", "User:",
            "\nASSISTANT:", "ASSISTANT:", "\nAssistant:", "Assistant:",
            "\nQ:", "Q:", "\nQuestion:", "Question:",
            "\nSystem:", "System:", "\nFitAI:", "FitAI:",
            # Stop if model starts echoing context headers again
            "STATIC:", "SESSION:", "DYNAMIC:", "KB:", "User message:",
        ]
        start_len = inputs["input_ids"].shape[1]
        stopping = StoppingCriteriaList([StopOnSubstrings(self.generator_tokenizer, stop_strings, start_len)])

        output_ids = self.generator_model.generate(
            input_ids=inputs["input_ids"],
            attention_mask=inputs.get("attention_mask"),
            stopping_criteria=stopping,
            **gen_kwargs,
        )
        
        # Extract only newly generated tokens (not the input prompt)
        input_length = inputs["input_ids"].shape[1]
        generated_ids = output_ids[0][input_length:]
        ans = self.generator_tokenizer.decode(generated_ids, skip_special_tokens=True).strip()
        
        # Cleanup: remove system prompt if it appears in response
        if ans.lower().startswith("system") or "you are fitai" in ans.lower()[:100]:
            # Find where the actual response starts (after system prompt)
            lines = ans.split("\n")
            response_lines = []
            skip_system = True
            for line in lines:
                line_lower = line.lower()
                if skip_system and (
                    line_lower.startswith("system") or 
                    "you are fitai" in line_lower or
                    "your personality" in line_lower or
                    "your style" in line_lower or
                    "how to use context" in line_lower or
                    line.strip().startswith("YOUR") or
                    line.strip().startswith("IMPORTANT:")
                ):
                    continue
                # Stop skipping once we find actual content
                if skip_system and line.strip() and not any(x in line_lower for x in ["personality", "style", "context", "important", "you are"]):
                    skip_system = False
                if not skip_system:
                    response_lines.append(line)
            ans = "\n".join(response_lines).strip()
        
        # Heuristic cleanup: drop any context headers or user echo
        lines = [ln for ln in ans.splitlines() if not ln.strip().startswith(("STATIC:", "SESSION:", "DYNAMIC:", "KB:", "User message:"))]
        ans = "\n".join([ln for ln in lines if ln.strip()])
        # Note: Response length is controlled by max_new_tokens (default: 128), not hardcoded limits

        references = [
            {
                "doc_id": r.doc_id,
                "chunk_id": r.chunk_id,
                "score": r.score,
                "metadata": r.metadata,
                "snippet": r.text[:300],
            }
            for r in retrieved
        ]
        citations = [
            {"chunk_id": r.chunk_id, "source": (r.metadata.get("source") if isinstance(r.metadata, dict) else None)}
            for r in retrieved
        ]
        claims: List[Dict[str, Any]] = []
        if mode == "structured":
            try:
                import json as _json
                parsed = _json.loads(ans)
                if isinstance(parsed, dict) and "answer" in parsed:
                    claims = parsed.get("claims") or []
                    ans = str(parsed.get("answer") or "").strip()
            except Exception:
                pass

        # Append assistant reply to session buffer
        if user_id and ans:
            self.append_session_message(user_id, session_id, role="assistant", content=ans)

        generation_time = (time.time() - generation_start) * 1000
        total_time = (time.time() - start_time) * 1000
        self.logger.debug("Chat timing - Retrieval: %.1fms, Context: %.1fms, Generation: %.1fms, Total: %.1fms", 
                          retrieval_time, context_time, generation_time, total_time)

        return {
            "answer": ans,
            "references": references,
            "citations": citations,
            "claims": claims,
            "dynamic_refs": dyn[:5],
        }

    def chat_stream(
        self,
        query: str,
        user_id: Optional[str],
        session_id: Optional[str] = None,
        top_k: Optional[int] = None,
        max_new_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ):
        """
        Generator that yields tokens for streaming responses.
        Yields dict with {"type": "token"|"metadata"|"done", "content": ...}
        """
        import time
        start_time = time.time()
        
        # Clamp input
        if len(query) > self.config.max_query_chars:
            query = query[: self.config.max_query_chars]
        
        # Append user message
        if user_id:
            self.append_session_message(user_id, session_id, role="user", content=query)
        
        # Use pre-loaded context if available (much faster!)
        retrieval_start = time.time()
        preloaded_context = None
        if user_id and user_id in self._user_context_cache:
            context_dict, timestamp = self._user_context_cache[user_id]
            cache_ttl = 600  # 10 minutes
            if time.time() - timestamp < cache_ttl:
                preloaded_context = context_dict
                self.logger.debug("Using pre-loaded context for user %s (stream)", user_id)
        
        # Only retrieve KB context (query-specific)
        retrieved = self.retrieve(query, user_id=user_id, top_k=top_k)
        retrieval_time_ms = (time.time() - retrieval_start) * 1000
        
        # Use pre-loaded context or load on-demand
        if preloaded_context:
            static_summary = preloaded_context.get("static_summary", "")
            memory_text = preloaded_context.get("memory_text", "(no long-term memory yet)")
            fitness_overview = preloaded_context.get("fitness_overview", "")
            user_patterns = preloaded_context.get("user_patterns", [])
            dyn_text = preloaded_context.get("dyn_text", "(no personal history found)")
        else:
            # Fallback: load context on-demand
            static_summary = self._summarize_user(self.get_user(user_id) if user_id else None)
            memories = self.retrieve_memories(user_id=user_id, query=query, top_k=5) if user_id else []
            mem_lines = [f"- {m['summary']}" for m in memories]
            memory_text = "\n".join(mem_lines) if mem_lines else "(no long-term memory yet)"
            
            # Get fitness overview and patterns (cached, 5 min TTL)
            fitness_overview = ""
            user_patterns = []
            if user_id:
                cache_ttl = 300  # 5 minutes
                current_time = time.time()
                
                if user_id in self._fitness_overview_cache:
                    overview, timestamp = self._fitness_overview_cache[user_id]
                    if current_time - timestamp < cache_ttl:
                        fitness_overview = overview
                    else:
                        del self._fitness_overview_cache[user_id]
                
                if not fitness_overview:
                    fitness_overview = self._get_user_fitness_overview(user_id)
                    self._fitness_overview_cache[user_id] = (fitness_overview, current_time)
                
                if user_id in self._patterns_cache:
                    patterns, timestamp = self._patterns_cache[user_id]
                    if current_time - timestamp < cache_ttl:
                        user_patterns = patterns
                    else:
                        del self._patterns_cache[user_id]
                
                if not user_patterns:
                    user_patterns = self._detect_user_patterns(user_id)
                    self._patterns_cache[user_id] = (user_patterns, current_time)
            
            # Get recent workouts
            dyn = self.retrieve_training_logs(user_id=user_id, query=query, top_k=min(5, (top_k or self.config.top_k))) if user_id else []
        dyn_blocks = [f"[Log {i+1}] ({d.get('topic') or d.get('kind')}) {d['notes']}" for i, d in enumerate(dyn)]
        dyn_text = "\n\n".join(dyn_blocks) if dyn_blocks else "(no personal history found)"
        
        # Session recap - always load fresh (session-specific)
        session_msgs = self.get_session_messages(user_id or "anonymous", session_id, max_messages=20) if user_id else []
        session_text_lines = [f"{m['role']}: {m['content']}" for m in session_msgs]
        session_context = "\n".join(session_text_lines) if session_text_lines else "(no recent messages)"
        
        # Limit KB chunks to top 5
        kb_blocks = [f"[KB {i+1}] {rc.text}" for i, rc in enumerate(retrieved[:5])]
        kb_text = "\n\n".join(kb_blocks) if kb_blocks else "(no KB context)"
        
        # Build prompt
        system_text = (
            "You are FitAI, a quirky and warm AI fitness coach with personality. You're like that gym buddy who's knowledgeable, a bit cheeky, remembers everything, and isn't afraid to call you out (gently) or celebrate your wins enthusiastically.\n\n"
            "YOUR PERSONALITY:\n"
            "- You have opinions and share them - 'Honestly? That's a solid plan' or 'Nah, skip that, here's why...'\n"
            "- You talk back sometimes - if someone says 'I skipped leg day again', you might respond 'Leg day skippers, name a more iconic duo 😏' but then help them get back on track\n"
            "- You're observant and sometimes call things out - 'I see you've been consistent this week... but where's leg day?'\n"
            "- You celebrate wins like a hype friend - '10 workouts in 7 days?! That's not consistency, that's dedication 🔥'\n"
            "- You're warm but not a pushover - you care about their progress, not just being nice\n"
            "- You use emojis when they add personality (💪 🔥 🎯 😏 🤔), not just for decoration\n"
            "- You ask follow-ups when curious - 'Wait, tell me more about...'\n\n"
            "YOUR STYLE:\n"
            "- Talk like you're texting a friend who also happens to be a fitness expert\n"
            "- Reference their workout history naturally - it makes you feel observant and caring\n"
            "- Be encouraging but authentic - celebrate progress, normalize setbacks, but don't sugarcoat\n"
            "- Have a bit of edge - you're not a robot, you're a coach with personality\n\n"
            "HOW TO USE CONTEXT:\n"
            "- Use the context below to inform your answers, but respond with personality\n"
            "- If you see workout logs (RECENT WORKOUTS), reference them - it shows you're paying attention\n"
            "- Cite sources [KB 1], [Log 2] when making specific claims, but don't overdo it\n"
            "- If context is missing, ask with personality: 'I'd love to help! What's your current...?' or 'Tell me about...'\n\n"
            "IMPORTANT:\n"
            "- Ground your advice in the context provided, but let your personality shine through\n"
            "- Don't say 'Based on the provided knowledge base' - that's too formal and robotic\n"
            "- Don't force references - use them when they make the conversation better\n"
            "- Keep answers conversational (2-4 sentences, but let it flow)\n"
            "- Safety: Always acknowledge injuries/restrictions if mentioned in ABOUT THIS USER\n"
            "- Be quirky but not annoying - personality is good, being over-the-top is not\n"
        )
        
        # Build context (using pre-loaded context if available)
        context_start = time.time()
        context_text = f"ABOUT THIS USER:\n{static_summary}\n\n"
        
        if memory_text and memory_text != "(no long-term memory yet)":
            context_text += f"LONG-TERM PATTERNS:\n{memory_text}\n\n"
        
        if fitness_overview:
            context_text += f"{fitness_overview}\n\n"
        
        if user_patterns:
            patterns_text = "\n".join([f"- {p}" for p in user_patterns])
            context_text += f"USER PATTERNS:\n{patterns_text}\n\n"
        
        if dyn_text and dyn_text != "(no personal history found)":
            context_text += f"RECENT WORKOUTS:\n{dyn_text}\n\n"
        
        if session_context and session_context != "(no recent messages)":
            context_text += f"RECENT CONVERSATION:\n{session_context}\n\n"
        
        if kb_text and kb_text != "(no KB context)":
            context_text += f"FITNESS KNOWLEDGE:\n{kb_text}\n\n"
        
        if len(context_text) > self.config.max_context_chars:
            context_text = context_text[: self.config.max_context_chars]
        
        prompt = None
        try:
            if hasattr(self.generator_tokenizer, "apply_chat_template") and getattr(self.generator_tokenizer, "chat_template", None):
                messages = [
                    {"role": "system", "content": system_text},
                    {"role": "user", "content": context_text + f"User message: {query}"},
                ]
                prompt = self.generator_tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        except Exception:
            prompt = None
        if not prompt:
            prompt = system_text + "\n\n" + context_text + f"User message: {query}\nAssistant: "
        
        references = [
            {"doc_id": r.doc_id, "chunk_id": r.chunk_id, "score": r.score, "metadata": r.metadata, "snippet": r.text[:300]}
            for r in retrieved
        ]
        citations = [
            {"chunk_id": r.chunk_id, "source": (r.metadata.get("source") if isinstance(r.metadata, dict) else None)}
            for r in retrieved
        ]
        
        # Yield metadata first
        yield {
            "type": "metadata",
            "content": {
                "references": references,
                "citations": citations,
                "dynamic_refs": dyn[:5],
            }
        }
        
        # Generation phase
        generation_start = time.time()
        
        # OpenAI streaming (preferred)
        if self.config.gen_backend == "openai" and self._openai_client:
            try:
                messages = [
                    {"role": "system", "content": system_text},
                    {"role": "user", "content": context_text + f"User message: {query}"}
                ]
                stream = self._openai_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=messages,
                    max_tokens=max_new_tokens or self.config.max_new_tokens,
                    temperature=temperature if temperature is not None else self.config.temperature,
                    stream=True,
                )
                
                full_answer = ""
                for chunk in stream:
                    if chunk.choices[0].delta.content:
                        token = chunk.choices[0].delta.content
                        full_answer += token
                        yield {"type": "token", "content": token}
                
                generation_time_ms = (time.time() - generation_start) * 1000
                total_time_ms = (time.time() - start_time) * 1000
                
                # Append to session
                if user_id and full_answer:
                    self.append_session_message(user_id, session_id, role="assistant", content=full_answer)
                
                # Log RAGAS metrics
                if os.getenv("RAGAS_LOGGING_ENABLED", "1") in ("1", "true", "True"):
                    try:
                        self.log_ragas_metrics(
                            user_id=user_id,
                            session_id=session_id,
                            query=query,
                            answer=full_answer,
                            retrieved_chunks=retrieved,
                            dynamic_refs=dyn,
                            memories=memories,
                            citations=citations,
                            retrieval_time_ms=retrieval_time_ms,
                            generation_time_ms=generation_time_ms,
                            total_time_ms=total_time_ms,
                        )
                    except Exception as e:
                        self.logger.warning("RAGAS logging failed: %s", e)
                
                yield {"type": "done", "content": {"answer": full_answer, "total_time_ms": total_time_ms}}
                return
            
            except Exception as e:
                self.logger.error("OpenAI streaming failed: %s", e)
                if not self.config.remote_fallback_local:
                    yield {"type": "error", "content": str(e)}
                    return
        
        # Modal/Remote streaming (backward compatibility)
        elif self.config.gen_backend == "remote" and self._remote_session and self.config.remote_gen_url:
            try:
                payload = {
                    "model": self.config.hf_model_id,
                    "prompt": prompt,
                    "max_tokens": max_new_tokens or self.config.max_new_tokens,
                    "temperature": temperature if temperature is not None else self.config.temperature,
                    "stream": True,
                }
                resp = self._remote_session.post(
                    self.config.remote_gen_url,
                    json=payload,
                    timeout=self.config.gen_timeout_ms / 1000.0,
                    stream=True,
                )
                resp.raise_for_status()
                
                full_answer = ""
                for line in resp.iter_lines():
                    if not line:
                        continue
                    line_str = line.decode("utf-8")
                    if line_str.startswith("data: "):
                        data_str = line_str[6:]
                        if data_str.strip() == "[DONE]":
                            break
                        try:
                            import json
                            data = json.loads(data_str)
                            if "choices" in data and data["choices"]:
                                choice = data["choices"][0]
                                if "delta" in choice and "content" in choice["delta"]:
                                    token = choice["delta"]["content"]
                                    full_answer += token
                                    yield {"type": "token", "content": token}
                                elif "text" in choice:
                                    token = choice["text"]
                                    full_answer += token
                                    yield {"type": "token", "content": token}
                        except Exception:
                            continue
                
                generation_time_ms = (time.time() - generation_start) * 1000
                total_time_ms = (time.time() - start_time) * 1000
                
                # Append to session
                if user_id and full_answer:
                    self.append_session_message(user_id, session_id, role="assistant", content=full_answer)
                
                # Log RAGAS metrics
                if os.getenv("RAGAS_LOGGING_ENABLED", "1") in ("1", "true", "True"):
                    try:
                        self.log_ragas_metrics(
                            user_id=user_id,
                            session_id=session_id,
                            query=query,
                            answer=full_answer,
                            retrieved_chunks=retrieved,
                            dynamic_refs=dyn,
                            memories=memories,
                            citations=citations,
                            retrieval_time_ms=retrieval_time_ms,
                            generation_time_ms=generation_time_ms,
                            total_time_ms=total_time_ms,
                        )
                    except Exception as e:
                        self.logger.warning("RAGAS logging failed: %s", e)
                
                yield {"type": "done", "content": {"answer": full_answer, "total_time_ms": total_time_ms}}
                return
            
            except Exception as e:
                self.logger.error("Remote streaming failed: %s", e)
                if not self.config.remote_fallback_local:
                    yield {"type": "error", "content": str(e)}
                    return
        
        # Local streaming generation
        if self.generator_tokenizer is None or self.generator_model is None:
            yield {"type": "error", "content": "Generation model not initialized"}
            return
        
        # Try to enable caching for better performance (fallback to False if model doesn't support it)
        use_cache_stream = True
        if "phi-3" in self.config.hf_model_id.lower():
            # Phi-3 has known caching issues, disable for compatibility
            use_cache_stream = False
        
        gen_kwargs = {
            "max_new_tokens": max_new_tokens or self.config.max_new_tokens,
            "temperature": temperature if temperature is not None else self.config.temperature,
            "do_sample": True,
            "use_cache": use_cache_stream,  # Enable caching for better performance (disabled for Phi-3)
            "top_p": 0.9,
            "repetition_penalty": 1.1,
            "no_repeat_ngram_size": 3,
        }
        if self.generator_tokenizer is not None:
            eos_id = self.generator_tokenizer.eos_token_id
            pad_id = self.generator_tokenizer.pad_token_id or eos_id
            if eos_id is not None:
                gen_kwargs["eos_token_id"] = eos_id
            if pad_id is not None:
                gen_kwargs["pad_token_id"] = pad_id
        
        inputs = self.generator_tokenizer(prompt, return_tensors="pt")
        device_str = self._resolve_torch_device()
        if device_str == "cuda" and torch.cuda.is_available():
            inputs = {k: v.to(0) if hasattr(v, "to") else v for k, v in inputs.items()}
        elif device_str == "mps" and torch.backends.mps.is_available():
            inputs = {k: v.to("mps") if hasattr(v, "to") else v for k, v in inputs.items()}
        
        # Streaming generation
        from transformers import TextIteratorStreamer
        import threading
        
        streamer = TextIteratorStreamer(self.generator_tokenizer, skip_special_tokens=True, skip_prompt=True)
        gen_kwargs_with_streamer = {**gen_kwargs, "streamer": streamer, **inputs}
        
        thread = threading.Thread(target=self.generator_model.generate, kwargs=gen_kwargs_with_streamer)
        thread.start()
        
        full_answer = ""
        for text in streamer:
            full_answer += text
            yield {"type": "token", "content": text}
        
        thread.join()
        
        generation_time_ms = (time.time() - generation_start) * 1000
        total_time_ms = (time.time() - start_time) * 1000
        
        # Cleanup answer
        ans = full_answer.strip()
        lines = [ln for ln in ans.splitlines() if not ln.strip().startswith(("STATIC:", "SESSION:", "DYNAMIC:", "KB:", "User message:"))]
        ans = "\n".join([ln for ln in lines if ln.strip()])
        
        # Append to session
        if user_id and ans:
            self.append_session_message(user_id, session_id, role="assistant", content=ans)
        
        # Log RAGAS metrics
        if os.getenv("RAGAS_LOGGING_ENABLED", "1") in ("1", "true", "True"):
            try:
                self.log_ragas_metrics(
                    user_id=user_id,
                    session_id=session_id,
                    query=query,
                    answer=ans,
                    retrieved_chunks=retrieved,
                    dynamic_refs=dyn,
                    memories=memories,
                    citations=citations,
                    retrieval_time_ms=retrieval_time_ms,
                    generation_time_ms=generation_time_ms,
                    total_time_ms=total_time_ms,
                )
            except Exception as e:
                self.logger.warning("RAGAS logging failed: %s", e)
        
        yield {"type": "done", "content": {"answer": ans, "total_time_ms": total_time_ms}}


# ------------------------
# SQLAlchemy models
# ------------------------

class Base(DeclarativeBase):
    pass


class DocumentModel(Base):
    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[Optional[str]] = mapped_column(server_default=sql_text("now()"))

    chunks: Mapped[List["ChunkModel"]] = relationship(back_populates="document")


class ChunkModel(Base):
    __tablename__ = "chunks"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    document_id: Mapped[str] = mapped_column(String, ForeignKey("documents.id", ondelete="CASCADE"), index=True)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    meta_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    # Embedding dimension set for OpenAI text-embedding-3-small (1536). Adjust if you change the embedding model.
    # Note: Using 'small' instead of 'large' (3072) because HNSW index limit is 2000 dimensions.
    embedding: Mapped[Any] = mapped_column(Vector(1536), nullable=False)
    created_at: Mapped[Optional[str]] = mapped_column(server_default=sql_text("now()"))

    document: Mapped[DocumentModel] = relationship(back_populates="chunks")


class UserModel(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    profile: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    goals: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    meta_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[Optional[str]] = mapped_column(server_default=sql_text("now()"))
    updated_at: Mapped[Optional[str]] = mapped_column(server_default=sql_text("now()"))


class TrainingLogModel(Base):
    __tablename__ = "training_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String, nullable=False, default="event")
    topic: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    tags: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)
    occurred_at: Mapped[Optional[datetime]] = mapped_column()
    notes: Mapped[str] = mapped_column(Text, nullable=False)
    meta_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    embedding: Mapped[Any] = mapped_column(Vector(1536), nullable=False)
    created_at: Mapped[Optional[str]] = mapped_column(server_default=sql_text("now()"))


class UserMemoryModel(Base):
    __tablename__ = "user_memory"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    meta_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    embedding: Mapped[Any] = mapped_column(Vector(1536), nullable=False)
    source: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    created_at: Mapped[Optional[str]] = mapped_column(server_default=sql_text("now()"))
    updated_at: Mapped[Optional[str]] = mapped_column(server_default=sql_text("now()"))


class WorkoutSessionModel(Base):
    __tablename__ = "workout_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    session_name: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # e.g., "Push Day", "Leg Day"
    session_type: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # e.g., "strength", "cardio", "flexibility"
    occurred_at: Mapped[datetime] = mapped_column(nullable=False)
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    meta_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[Optional[str]] = mapped_column(server_default=sql_text("now()"))

    exercises: Mapped[List["ExerciseLogModel"]] = relationship(back_populates="session", cascade="all, delete-orphan")


class ExerciseLogModel(Base):
    __tablename__ = "exercise_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    session_id: Mapped[str] = mapped_column(String, ForeignKey("workout_sessions.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)  # denormalized for fast queries
    exercise_name: Mapped[str] = mapped_column(String, nullable=False, index=True)  # e.g., "Squat", "Bench Press"
    exercise_category: Mapped[Optional[str]] = mapped_column(String, nullable=True)  # e.g., "legs", "chest", "back"
    sets: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reps: Mapped[Optional[List[int]]] = mapped_column(ARRAY(Integer), nullable=True)  # per-set reps
    weights: Mapped[Optional[List[float]]] = mapped_column(ARRAY(String), nullable=True)  # per-set weights (stored as strings to handle "BW", "45kg", etc.)
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # for cardio/timed exercises
    distance_meters: Mapped[Optional[float]] = mapped_column(nullable=True)  # for running, cycling, etc.
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    meta_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[Optional[str]] = mapped_column(server_default=sql_text("now()"))

    session: Mapped[WorkoutSessionModel] = relationship(back_populates="exercises")


class ChatMessageModel(Base):
    """Store persistent conversation messages for deep memory context."""
    __tablename__ = "chat_messages"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False)
    session_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String, nullable=False)  # "user" or "assistant"
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(nullable=False, index=True)
    meta_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)


class RagasMetricsModel(Base):
    """Store RAGAS evaluation metrics for RAG pipeline quality monitoring."""
    __tablename__ = "ragas_metrics"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[Optional[str]] = mapped_column(String, nullable=True, index=True)
    session_id: Mapped[Optional[str]] = mapped_column(String, nullable=True)
    query: Mapped[str] = mapped_column(Text, nullable=False)
    answer: Mapped[str] = mapped_column(Text, nullable=False)
    
    # Retrieved chunks metadata
    kb_chunks_retrieved: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)  # chunk IDs
    logs_retrieved: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)  # log IDs
    memories_retrieved: Mapped[Optional[List[str]]] = mapped_column(ARRAY(String), nullable=True)  # memory IDs
    
    # Retrieval quality
    retrieval_count: Mapped[int] = mapped_column(Integer, default=0)
    pre_rerank_scores: Mapped[Optional[List[float]]] = mapped_column(ARRAY(String), nullable=True)  # stored as strings
    post_rerank_scores: Mapped[Optional[List[float]]] = mapped_column(ARRAY(String), nullable=True)
    rerank_changed_order: Mapped[bool] = mapped_column(default=False)
    
    # Answer quality indicators
    answer_length: Mapped[int] = mapped_column(Integer, default=0)
    has_citations: Mapped[bool] = mapped_column(default=False)
    citation_count: Mapped[int] = mapped_column(Integer, default=0)
    
    # Timing metrics
    retrieval_time_ms: Mapped[Optional[float]] = mapped_column(nullable=True)
    generation_time_ms: Mapped[Optional[float]] = mapped_column(nullable=True)
    total_time_ms: Mapped[Optional[float]] = mapped_column(nullable=True)
    
    # Additional metadata
    meta_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[Optional[str]] = mapped_column(server_default=sql_text("now()"))