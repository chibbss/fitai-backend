#rag.py
from __future__ import annotations

import numpy as np
import threading
import time
import uuid
from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from datetime import datetime
from collections import deque

import torch
from sentence_transformers import SentenceTransformer
try:
    from sentence_transformers import CrossEncoder  # type: ignore
except Exception:  # pragma: no cover
    CrossEncoder = None  # type: ignore
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline, StoppingCriteria, StoppingCriteriaList

from sqlalchemy import (
    create_engine,
    String,
    Integer,
    Text,
    ForeignKey,
    select,
    or_,
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
        self._remote_session = None  # for remote generation
        self._reranker_model = None  # Cross-encoder model when using local reranker

        # Database (SQLAlchemy)
        self.engine = create_engine(self.config.database_url, future=True, pool_pre_ping=True)
        self.SessionLocal = sessionmaker(bind=self.engine, expire_on_commit=False, future=True)

        # Concurrency
        self._lock = threading.RLock()

        # Redis (optional)
        self._redis = None
        self._metrics: Dict[str, int] = {"rerank_total": 0, "rerank_changed": 0}

    # ------------------------
    # Initialization
    # ------------------------
    def startup(self) -> None:
        with self._lock:
            self.logger.info("Starting up RAG service")
            self._init_db()
            self._init_models()
            self._init_redis()
            self.logger.info("Startup complete: database and models initialized")

    def _init_models(self) -> None:
        # Embeddings model
        device_str = self._resolve_torch_device()
        self.logger.info("Loading embedding model %s on %s", self.config.embedding_model_name, device_str)
        self.embedding_model = SentenceTransformer(self.config.embedding_model_name, device=device_str)

        # Tokenizer for chunking
        try:
            from transformers import AutoTokenizer as HFTokenizer
            self.embedding_tokenizer = HFTokenizer.from_pretrained(
                self.config.embedding_model_name, use_fast=True
            )
        except Exception:
            self.embedding_tokenizer = None

        # Generation backend
        if self.config.gen_backend == "remote":
            self.logger.info("Using REMOTE generation backend at %s", self.config.remote_gen_url)
            try:
                import requests
                self._remote_session = requests.Session()
                if self.config.remote_gen_api_key:
                    self._remote_session.headers.update({"Authorization": f"Bearer {self.config.remote_gen_api_key}"})
            except Exception as e:
                self.logger.error("Failed to init remote session: %s", e)
                self._remote_session = None
        else:
            # Local transformers
            self.logger.info("Loading generation model %s", self.config.hf_model_id)
            use_half = (
                (device_str == "cuda" and torch.cuda.is_available())
                or (device_str == "mps" and torch.backends.mps.is_available())
            )
            dtype = torch.float16 if use_half else torch.float32
            model_kwargs = {"dtype": dtype, "trust_remote_code": True, "low_cpu_mem_usage": True}
            token = self.config.hf_token

            self.generator_tokenizer = AutoTokenizer.from_pretrained(
                self.config.hf_model_id, token=token, trust_remote_code=True
            )
            self.generator_model = AutoModelForCausalLM.from_pretrained(
                self.config.hf_model_id, token=token, device_map=None, **model_kwargs
            )

            # Move model to target device explicitly for small models (prototype)
            device_str = self._resolve_torch_device()
            if device_str == "cuda" and torch.cuda.is_available():
                self.generator_model.to(0)
            elif device_str == "mps" and torch.backends.mps.is_available():
                self.generator_model.to("mps")
            else:
                self.generator_model.to("cpu")

            # Prefer eager attention on non-CUDA backends
            try:
                if device_str != "cuda":
                    self.generator_model.config.attn_implementation = "eager"
            except Exception:
                pass

            self.generator_pipe = None

        # Optional reranker initialization
        try:
            if self.config.reranker_backend == "local":
                if CrossEncoder is None:
                    self.logger.warning(
                        "Reranker backend is 'local' but CrossEncoder not available; skipping reranker"
                    )
                    self._reranker_model = None
                else:
                    device_str = self._resolve_torch_device()
                    self.logger.info(
                        "Loading reranker model %s on %s",
                        self.config.reranker_model_name,
                        device_str,
                    )
                    # sentence-transformers CrossEncoder accepts device identifier; map 'cuda' to 0
                    device_arg = 0 if (device_str == "cuda" and torch.cuda.is_available()) else device_str
                    self._reranker_model = CrossEncoder(self.config.reranker_model_name, device=device_arg)  # type: ignore
            else:
                self._reranker_model = None
        except Exception as e:
            self.logger.error("Failed to initialize reranker: %s", e)
            self._reranker_model = None

    def _init_redis(self) -> None:
        if not self.config.redis_url:
            self._redis = None
            return
        try:
            import redis  # type: ignore
            self._redis = redis.Redis.from_url(self.config.redis_url, socket_timeout=1.0)
            # ping to validate
            self._redis.ping()
            self.logger.info("Connected to Redis at %s", self.config.redis_url)
        except Exception as e:
            self.logger.warning("Redis unavailable: %s", e)
            self._redis = None

    def _resolve_torch_device(self) -> str:
        d = self.config.device.lower()
        if d == "cuda" and torch.cuda.is_available():
            return "cuda"
        if d == "auto" and torch.cuda.is_available():
            return "cuda"
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
            vectors = self.embedding_model.encode(
                texts,
                batch_size=64,
                show_progress_bar=False,
                convert_to_numpy=True,
                normalize_embeddings=True,
            )
            out = vectors.astype("float32")
            if self._redis is not None:
                try:
                    self._redis.setex(
                        f"{self.config.redis_prefix}:embed:{hashlib.md5(('||'.join([t.strip() for t in texts])).encode('utf-8')).hexdigest()}",
                        self.config.redis_ttl_embeddings_sec,
                        out.tobytes(),
                    )
                except Exception:
                    pass
            return out
        if self.config.embedding_provider == "modal":
            import requests
            if not self._remote_session:
                self._remote_session = requests.Session()
                if self.config.remote_embed_api_key:
                    self._remote_session.headers.update({"Authorization": f"Bearer {self.config.remote_embed_api_key}"})
            if not self.config.remote_embed_url:
                raise RuntimeError("REMOTE_EMBED_URL not configured for remote embeddings")
            resp = self._remote_session.post(self.config.remote_embed_url, json={"texts": texts}, timeout=60)
            resp.raise_for_status()
            data = resp.json()
            vecs = data.get("embeddings") or data.get("data")
            if not vecs:
                raise RuntimeError("Remote embed response missing 'embeddings'")
            return np.array(vecs, dtype="float32")
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
                "created_at": u.created_at,
                "updated_at": u.updated_at,
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
        
        restrictions = profile.get("restrictions")
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
        embedding = self._embed([text])[0].tolist()
        with self.SessionLocal() as session:
            with session.begin():
                log = TrainingLogModel(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    kind=kind or "event",
                    topic=topic,
                    tags=tags or [],
                    occurred_at=occurred_at or datetime.utcnow(),
                    notes=text,
                    meta_data=metadata or {},
                    embedding=embedding,
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
        occurred = occurred_at or datetime.utcnow()
        
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
                
                # Create training log for semantic retrieval
                embedding = self._embed([summary_text])[0].tolist()
                log = TrainingLogModel(
                    id=str(uuid.uuid4()),
                    user_id=user_id,
                    kind="workout",
                    topic=session_name or session_type,
                    tags=ex_names[:10],  # tag with exercise names for easy filtering
                    occurred_at=occurred,
                    notes=summary_text,
                    meta_data={"session_id": session_id, "exercise_count": len(exercises)},
                    embedding=embedding,
                )
                session.add(log)
        
        return {
            "session_id": session_id,
            "exercise_count": len(exercises),
            "inserted": True,
        }

    def get_workout_calendar(
        self,
        user_id: str,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Get workout sessions for calendar display."""
        with self.SessionLocal() as session:
            stmt = select(WorkoutSessionModel).where(WorkoutSessionModel.user_id == user_id)
            if start_date:
                stmt = stmt.where(WorkoutSessionModel.occurred_at >= start_date)
            if end_date:
                stmt = stmt.where(WorkoutSessionModel.occurred_at <= end_date)
            stmt = stmt.order_by(WorkoutSessionModel.occurred_at.desc()).limit(limit)
            rows = session.execute(stmt).scalars().all()
        
        result = []
        for r in rows:
            result.append({
                "session_id": r.id,
                "session_name": r.session_name,
                "session_type": r.session_type,
                "occurred_at": r.occurred_at.isoformat() if r.occurred_at else None,
                "duration_minutes": r.duration_minutes,
                "notes": r.notes,
                "metadata": r.meta_data or {},
            })
        return result

    def get_workout_insights(self, user_id: str, session_id: str) -> Dict[str, Any]:
        """Compare current workout session against historical data for instant insights."""
        with self.SessionLocal() as session:
            # Get current session
            current = session.get(WorkoutSessionModel, session_id)
            if not current or current.user_id != user_id:
                return {"error": "Session not found"}
            
            # Get exercises from current session
            current_exercises = session.execute(
                select(ExerciseLogModel).where(ExerciseLogModel.session_id == session_id)
            ).scalars().all()
            
            insights = []
            total_volume_delta = 0.0
            
            for ex in current_exercises:
                exercise_name = ex.exercise_name
                
                # Find last time this exercise was performed
                stmt = (
                    select(ExerciseLogModel)
                    .join(WorkoutSessionModel, ExerciseLogModel.session_id == WorkoutSessionModel.id)
                    .where(
                        ExerciseLogModel.user_id == user_id,
                        ExerciseLogModel.exercise_name == exercise_name,
                        ExerciseLogModel.session_id != session_id,
                    )
                    .order_by(WorkoutSessionModel.occurred_at.desc())
                    .limit(1)
                )
                prev_ex = session.execute(stmt).scalars().first()
                
                if not prev_ex:
                    insights.append({
                        "exercise": exercise_name,
                        "status": "new",
                        "message": f"🎉 First time logging {exercise_name}!",
                    })
                    continue
                
                # Calculate volume: sets × reps × weight (approximate)
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
                
                current_vol = calc_volume(ex)
                prev_vol = calc_volume(prev_ex)
                
                if current_vol > 0 and prev_vol > 0:
                    delta = ((current_vol - prev_vol) / prev_vol) * 100
                    total_volume_delta += delta
                    
                    if delta > 5:
                        insights.append({
                            "exercise": exercise_name,
                            "status": "progress",
                            "message": f"💪 {exercise_name}: Volume up {delta:.1f}% vs last session",
                            "delta_pct": delta,
                        })
                    elif delta < -5:
                        insights.append({
                            "exercise": exercise_name,
                            "status": "regression",
                            "message": f"📉 {exercise_name}: Volume down {abs(delta):.1f}% - consider recovery",
                            "delta_pct": delta,
                        })
                    else:
                        insights.append({
                            "exercise": exercise_name,
                            "status": "maintained",
                            "message": f"✅ {exercise_name}: Consistent performance",
                            "delta_pct": delta,
                        })
                
                # Weight progression check
                if ex.weights and prev_ex.weights:
                    try:
                        curr_max = max([float(re.search(r"[\d.]+", str(w)).group()) for w in ex.weights if re.search(r"[\d.]+", str(w))])
                        prev_max = max([float(re.search(r"[\d.]+", str(w)).group()) for w in prev_ex.weights if re.search(r"[\d.]+", str(w))])
                        if curr_max > prev_max:
                            insights.append({
                                "exercise": exercise_name,
                                "status": "pr",
                                "message": f"🏆 {exercise_name}: New weight PR! +{curr_max - prev_max:.1f}",
                                "weight_increase": curr_max - prev_max,
                            })
                    except Exception:
                        pass
            
            # Overall session insight
            avg_delta = total_volume_delta / len(current_exercises) if current_exercises else 0
            overall_message = "Great session! Keep it up! 💪"
            if avg_delta > 10:
                overall_message = "🔥 Outstanding progress! Volume significantly increased!"
            elif avg_delta > 0:
                overall_message = "📈 Solid progression - you're moving forward!"
            elif avg_delta < -10:
                overall_message = "💤 Lower volume today - prioritize recovery and nutrition"
            
            return {
                "session_id": session_id,
                "insights": insights,
                "overall_message": overall_message,
                "avg_volume_change_pct": avg_delta,
                "exercise_count": len(current_exercises),
            }

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
        key = self._get_session_key(user_id, session_id)
        if self._redis is not None:
            try:
                import json
                rkey = f"{self.config.redis_prefix}:session:{key}"
                self._redis.rpush(rkey, json.dumps({"role": role, "content": content, "ts": time.time()}))
                self._redis.expire(rkey, self.config.redis_ttl_session_sec)
                return
            except Exception:
                pass
        dq = self._ensure_session(key)
        dq.append({"role": role, "content": content, "ts": time.time()})

    def get_session_messages(self, user_id: str, session_id: Optional[str], max_messages: int = 8) -> List[Dict[str, Any]]:
        key = self._get_session_key(user_id, session_id)
        if self._redis is not None:
            try:
                import json
                rkey = f"{self.config.redis_prefix}:session:{key}"
                # lrange end is inclusive; -1 means all, slice in Python
                data = self._redis.lrange(rkey, 0, -1)
                msgs = [json.loads(x) for x in data[-max_messages:]]
                return msgs
            except Exception:
                pass
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
    # Prompt preparation for streaming/structured modes
    # ------------------------
    def _prepare_prompt(self, query: str, user_id: Optional[str], session_id: Optional[str]) -> Dict[str, Any]:
        if len(query) > self.config.max_query_chars:
            query = query[: self.config.max_query_chars]
        retrieved = self.retrieve(query, user_id=user_id, top_k=None)
        dyn = []
        if user_id:
            dyn = self.retrieve_training_logs(user_id=user_id, query=query, top_k=min(5, self.config.top_k))
        static_summary = self._summarize_user(self.get_user(user_id) if user_id else None)
        session_msgs = self.get_session_messages(user_id or "anonymous", session_id) if user_id else []
        session_text_lines = [f"{m['role']}: {m['content']}" for m in session_msgs]
        session_context = "\n".join(session_text_lines) if session_text_lines else "(no recent messages)"
        kb_blocks = [f"[KB {i+1}] {rc.text}" for i, rc in enumerate(retrieved)]
        kb_text = "\n\n".join(kb_blocks) if kb_blocks else "(no KB context)"
        dyn_blocks = [f"[Log {i+1}] ({d.get('topic') or d.get('kind')}) {d['notes']}" for i, d in enumerate(dyn)]
        dyn_text = "\n\n".join(dyn_blocks) if dyn_blocks else "(no personal history found)"
        memories = self.retrieve_memories(user_id=user_id, query=query, top_k=3) if user_id else []
        mem_lines = [f"- {m['summary']}" for m in memories]
        memory_text = "\n".join(mem_lines) if mem_lines else "(no long-term memory yet)"
        system_text = (
            "You are FitAI, a warm and encouraging AI fitness coach.\n\n"
            "PERSONALITY:\n"
            "- Friendly & conversational (like a knowledgeable gym buddy, not a drill sergeant)\n"
            "- Encouraging progress over perfection - celebrate wins, normalize setbacks\n"
            "- Use emojis sparingly but meaningfully (💪, 🔥, 🎯 for achievements; 🤝, 💬 for support)\n"
            "- Intelligent but humble: 'Based on your history...' not 'You must...'\n"
            "- When users struggle or skip workouts, be understanding: 'Life gets busy, I get it.'\n\n"
            "CRITICAL RULES:\n"
            "1. Only answer using retrieved context (MEMORY, STATIC, SESSION, DYNAMIC, KB) below\n"
            "2. If missing info, ASK warmly: 'I'd love to help! Can you tell me your...?'\n"
            "3. ALWAYS cite sources like [KB 1], [Log 2] that correspond to context items\n"
            "4. Never invent numbers, protocols, or exercises not in context\n"
            "5. Keep answers conversational and concise (2-4 sentences)\n"
            "6. SAFETY FIRST: If user profile shows injuries/restrictions, acknowledge them in advice\n"
            "7. When you learn new info about the user (weight, schedule, constraints), acknowledge naturally\n"
        )
        context_text = (
            f"MEMORY:\n{memory_text}\n\n"
            f"STATIC:\n{static_summary}\n\n"
            f"SESSION:\n{session_context}\n\n"
            f"DYNAMIC:\n{dyn_text}\n\n"
            f"KB:\n{kb_text}\n\n"
        )
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
        # Clamp input length
        if len(query) > self.config.max_query_chars:
            query = query[: self.config.max_query_chars]
        # Append user message to session buffer
        if user_id:
            self.append_session_message(user_id, session_id, role="user", content=query)

        # Retrieve KB and dynamic memory
        retrieved = self.retrieve(query, user_id=user_id, top_k=top_k)
        dyn = []
        if user_id:
            dyn = self.retrieve_training_logs(user_id=user_id, query=query, top_k=min(5, (top_k or self.config.top_k)))

        # Static summary
        static_summary = self._summarize_user(self.get_user(user_id) if user_id else None)

        # Session recap
        session_msgs = self.get_session_messages(user_id or "anonymous", session_id) if user_id else []
        session_text_lines = [f"{m['role']}: {m['content']}" for m in session_msgs]
        session_context = "\n".join(session_text_lines) if session_text_lines else "(no recent messages)"

        kb_blocks = [f"[KB {i+1}] {rc.text}" for i, rc in enumerate(retrieved)]
        kb_text = "\n\n".join(kb_blocks) if kb_blocks else "(no KB context)"

        dyn_blocks = [
            f"[Log {i+1}] ({d.get('topic') or d.get('kind')}) {d['notes']}" for i, d in enumerate(dyn)
        ]
        dyn_text = "\n\n".join(dyn_blocks) if dyn_blocks else "(no personal history found)"

        # Long-term memory context
        memories = self.retrieve_memories(user_id=user_id, query=query, top_k=3) if user_id else []
        mem_lines = [f"- {m['summary']}" for m in memories]
        memory_text = "\n".join(mem_lines) if mem_lines else "(no long-term memory yet)"

        # Build prompt with optional structured mode
        system_text = (
            "You are FitAI. CRITICAL RULES:\n"
            "1. Only answer using retrieved or user-provided sources.\n"
            "2. If missing info: 'I don't have enough data to answer that.'\n"
            "3. ALWAYS cite sources like [1], [2] that correspond to KB items below.\n"
            "4. Never invent numbers or protocols.\n"
            "5. Keep answers under 4 sentences."
        )
        if mode == "structured":
            system_text += (
                "\nRespond STRICTLY in JSON with keys: 'answer' (string) and 'claims' (array of {text, source_index}). "
                "source_index must map to the [KB i] items below (1-indexed)."
            )
        context_text = (
            f"MEMORY:\n{memory_text}\n\n"
            f"STATIC:\n{static_summary}\n\n"
            f"SESSION:\n{session_context}\n\n"
            f"DYNAMIC:\n{dyn_text}\n\n"
            f"KB:\n{kb_text}\n\n"
        )
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

        # Generate via remote backend if configured
        if self.config.gen_backend == "remote" and self._remote_session and self.config.remote_gen_url:
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
        gen_kwargs = {
            "max_new_tokens": max_new_tokens or self.config.max_new_tokens,
            "temperature": temperature if temperature is not None else self.config.temperature,
            "do_sample": True,
            "use_cache": False,
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
        class StopOnSubstrings(StoppingCriteria):
            def __init__(self, tokenizer, stop_strings: List[str], start_len: int):
                self.tokenizer = tokenizer
                self.stop_strings = stop_strings
                self.start_len = start_len
            def __call__(self, input_ids, scores, **kwargs):
                # Only examine newly generated suffix to avoid triggering on prompt text
                if input_ids.shape[1] <= self.start_len:
                    return False
                new_tokens = input_ids[0][self.start_len:]
                text = self.tokenizer.decode(new_tokens, skip_special_tokens=True)
                return any(s in text for s in self.stop_strings)

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
        full_text = self.generator_tokenizer.decode(output_ids[0], skip_special_tokens=True)
        # Extract only new completion beyond prompt/chat template
        if full_text.startswith(prompt):
            ans = full_text[len(prompt):].strip()
        else:
            ans = full_text.strip()
        # Heuristic cleanup: drop any context headers or user echo
        lines = [ln for ln in ans.splitlines() if not ln.strip().startswith(("STATIC:", "SESSION:", "DYNAMIC:", "KB:", "User message:"))]
        ans = "\n".join([ln for ln in lines if ln.strip()])
        # Limit to ~4 sentences
        try:
            import re
            sentences = re.split(r"(?<=[.!?])\s+", ans)
            ans = " ".join(sentences[:4]).strip()
        except Exception:
            ans = ans[:600].strip()

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
        
        # Retrieval phase
        retrieval_start = time.time()
        retrieved = self.retrieve(query, user_id=user_id, top_k=top_k)
        dyn = []
        if user_id:
            dyn = self.retrieve_training_logs(user_id=user_id, query=query, top_k=min(5, (top_k or self.config.top_k)))
        
        static_summary = self._summarize_user(self.get_user(user_id) if user_id else None)
        session_msgs = self.get_session_messages(user_id or "anonymous", session_id) if user_id else []
        session_text_lines = [f"{m['role']}: {m['content']}" for m in session_msgs]
        session_context = "\n".join(session_text_lines) if session_text_lines else "(no recent messages)"
        
        kb_blocks = [f"[KB {i+1}] {rc.text}" for i, rc in enumerate(retrieved)]
        kb_text = "\n\n".join(kb_blocks) if kb_blocks else "(no KB context)"
        
        dyn_blocks = [f"[Log {i+1}] ({d.get('topic') or d.get('kind')}) {d['notes']}" for i, d in enumerate(dyn)]
        dyn_text = "\n\n".join(dyn_blocks) if dyn_blocks else "(no personal history found)"
        
        memories = self.retrieve_memories(user_id=user_id, query=query, top_k=3) if user_id else []
        mem_lines = [f"- {m['summary']}" for m in memories]
        memory_text = "\n".join(mem_lines) if mem_lines else "(no long-term memory yet)"
        
        retrieval_time_ms = (time.time() - retrieval_start) * 1000
        
        # Build prompt
        system_text = (
            "You are FitAI. CRITICAL RULES:\n"
            "1. Only answer using retrieved or user-provided sources.\n"
            "2. If missing info: 'I don't have enough data to answer that.'\n"
            "3. ALWAYS cite sources like [1], [2] that correspond to KB items below.\n"
            "4. Never invent numbers or protocols.\n"
            "5. Keep answers under 4 sentences."
        )
        context_text = (
            f"MEMORY:\n{memory_text}\n\n"
            f"STATIC:\n{static_summary}\n\n"
            f"SESSION:\n{session_context}\n\n"
            f"DYNAMIC:\n{dyn_text}\n\n"
            f"KB:\n{kb_text}\n\n"
        )
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
        
        if self.config.gen_backend == "remote" and self._remote_session and self.config.remote_gen_url:
            # Remote streaming (if supported by backend)
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
        
        gen_kwargs = {
            "max_new_tokens": max_new_tokens or self.config.max_new_tokens,
            "temperature": temperature if temperature is not None else self.config.temperature,
            "do_sample": True,
            "use_cache": False,
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
    # Embedding dimension set for MiniLM-L6-v2 (384). Adjust if you change the embedding model.
    embedding: Mapped[Any] = mapped_column(Vector(384), nullable=False)
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
    embedding: Mapped[Any] = mapped_column(Vector(384), nullable=False)
    created_at: Mapped[Optional[str]] = mapped_column(server_default=sql_text("now()"))


class UserMemoryModel(Base):
    __tablename__ = "user_memory"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    meta_data: Mapped[Optional[Dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    embedding: Mapped[Any] = mapped_column(Vector(384), nullable=False)
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