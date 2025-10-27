from __future__ import annotations

import numpy as np
import threading
import time
import uuid
from dataclasses import dataclass
import re
from typing import Any, Dict, List, Optional
from datetime import datetime
from collections import deque

import torch
from sentence_transformers import SentenceTransformer
from transformers import AutoModelForCausalLM, AutoTokenizer, pipeline, StoppingCriteria, StoppingCriteriaList
from sentence_transformers.cross_encoder import CrossEncoder

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
        self.reranker: Optional[CrossEncoder] = None
        self._reranker_session = None  # for remote reranker

        # Database (SQLAlchemy)
        self.engine = create_engine(self.config.database_url, future=True, pool_pre_ping=True)
        self.SessionLocal = sessionmaker(bind=self.engine, expire_on_commit=False, future=True)

        # Concurrency
        self._lock = threading.RLock()

    # ------------------------
    # Utils
    # ------------------------
    def _highlight_snippet(self, query: str, text: str, max_len: int = 300) -> str:
        if not text:
            return ""
        tokens = [t for t in re.split(r"\W+", query.lower()) if len(t) >= 3]
        lower_text = text.lower()
        first_pos = -1
        for t in tokens:
            p = lower_text.find(t)
            if p != -1 and (first_pos == -1 or p < first_pos):
                first_pos = p
        if first_pos == -1:
            snippet = text[:max_len]
            return snippet
        start = max(0, first_pos - max_len // 3)
        end = min(len(text), start + max_len)
        snippet = text[start:end]
        # Highlight tokens
        def repl(m: re.Match) -> str:
            return f"<em>{m.group(0)}</em>"
        for t in sorted(set(tokens), key=len, reverse=True):
            snippet = re.sub(rf"(?i)\b{re.escape(t)}\b", repl, snippet)
        if start > 0:
            snippet = "…" + snippet
        if end < len(text):
            snippet = snippet + "…"
        return snippet

    def _normalize_metadata(self, raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        meta: Dict[str, Any] = {}
        if isinstance(raw, dict):
            meta.update(raw)
        # Normalize keys
        if "meta_data" in meta and not isinstance(meta.get("meta_data"), dict):
            meta.pop("meta_data", None)
        # Standard fields
        if "category" not in meta:
            # map possible synonyms
            for k in ["cat", "Category", "CATEGORY"]:
                if k in meta and isinstance(meta[k], str):
                    meta["category"] = meta[k]
                    break
        if "subcategory" not in meta:
            for k in ["sub_category", "subCat", "Subcategory", "SUBCATEGORY"]:
                if k in meta and isinstance(meta[k], str):
                    meta["subcategory"] = meta[k]
                    break
        # Defaults
        meta.setdefault("category", "unknown")
        if "subcategory" not in meta:
            meta["subcategory"] = None
        # Ensure source preserved if present
        if "source" in raw if isinstance(raw, dict) else False:
            meta["source"] = raw.get("source")  # type: ignore
        return meta

    # ------------------------
    # Initialization
    # ------------------------
    def startup(self) -> None:
        with self._lock:
            self.logger.info("Starting up RAG service")
            self._init_db()
            self._init_models()
            self.logger.info("Startup complete: database and models initialized")

    def _init_models(self) -> None:
        # Embeddings model
        device_str = self._resolve_torch_device()
        self.logger.info("Loading embedding model %s on %s", self.config.embedding_model_name, device_str)
        self.embedding_model = SentenceTransformer(self.config.embedding_model_name, device=device_str)
        # Tokenizer for chunking
        try:
            from transformers import AutoTokenizer as HFTokenizer

            self.embedding_tokenizer = HFTokenizer.from_pretrained(self.config.embedding_model_name, use_fast=True)
        except Exception:  # pragma: no cover - fallback
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
            use_half = (device_str == "cuda" and torch.cuda.is_available()) or (device_str == "mps" and torch.backends.mps.is_available())
            dtype = torch.float16 if use_half else torch.float32
            model_kwargs = {"dtype": dtype, "trust_remote_code": True, "low_cpu_mem_usage": True}
            token = self.config.hf_token
            self.generator_tokenizer = AutoTokenizer.from_pretrained(self.config.hf_model_id, token=token, trust_remote_code=True)
            self.generator_model = AutoModelForCausalLM.from_pretrained(
                self.config.hf_model_id,
                token=token,
                device_map=None,
                **model_kwargs,
            )
            # Move model to target device explicitly for small models (prototype)
            device_str = self._resolve_torch_device()
            if device_str == "cuda" and torch.cuda.is_available():
                self.generator_model.to(0)
            elif device_str == "mps" and torch.backends.mps.is_available():
                self.generator_model.to("mps")
            else:
                self.generator_model.to("cpu")
            # Prefer eager attention on non-CUDA backends to avoid unsupported kernels
            try:
                if device_str != "cuda":
                    self.generator_model.config.attn_implementation = "eager"
            except Exception:
                pass
            self.generator_pipe = None

        # Reranker backend
        backend = (self.config.reranker_backend or "none").lower()
        if backend == "local":
            try:
                device_str = self._resolve_torch_device()
                device_arg = 0 if device_str == "cuda" and torch.cuda.is_available() else ("mps" if device_str == "mps" and torch.backends.mps.is_available() else "cpu")
                self.logger.info("Loading reranker model %s on %s", self.config.reranker_model_name, device_arg)
                self.reranker = CrossEncoder(self.config.reranker_model_name, device=device_arg)
            except Exception as e:
                self.logger.error("Failed to init local reranker: %s", e)
                self.reranker = None
        elif backend == "remote":
            try:
                import requests
                self._reranker_session = requests.Session()
            except Exception as e:
                self.logger.error("Failed to init remote reranker session: %s", e)
                self._reranker_session = None

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
        # Prefer migrations; only do runtime setup if configured
        if self.config.db_schema_management == "runtime":
            with self.engine.begin() as conn:
                conn.execute(sql_text("CREATE EXTENSION IF NOT EXISTS vector"))
            Base.metadata.create_all(self.engine)
            try:
                with self.engine.begin() as conn:
                    # Safe column renames to align with meta_data convention
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
                    # User memory indexes (if table exists in runtime mode)
                    try:
                        conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_user_memory_embedding_hnsw ON user_memory USING hnsw (embedding vector_cosine_ops);"))
                        conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_user_memory_user ON user_memory(user_id)"))
                        conn.execute(sql_text("CREATE INDEX IF NOT EXISTS idx_user_memory_meta_gin ON user_memory USING gin (meta_data)"))
                    except Exception:
                        pass
            except Exception as e:
                self.logger.warning("Runtime schema setup warning: %s", e)
        else:
            # No runtime DDL in migrations mode. Optional DEV-only safeguard can be enabled explicitly.
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
        size = self.config.chunk_size_tokens
        overlap = self.config.chunk_overlap_tokens
        if size <= 0:
            return [text]
        if self.embedding_tokenizer is None:
            # Fallback rough split by characters if tokenizer unavailable
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

    # ------------------------
    # Embedding helpers
    # ------------------------
    def _embed(self, texts: List[str]) -> np.ndarray:
        assert self.embedding_model is not None
        vectors = self.embedding_model.encode(
            texts,
            batch_size=64,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=True,
        )
        return vectors.astype("float32")

    # ------------------------
    # Public operations
    # ------------------------
    def add_documents(self, docs: List[Dict[str, Any]], user_id: Optional[str]) -> Dict[str, Any]:
        """Add documents for a user (or global if user_id is None)."""
        with self._lock:
            if not docs:
                return {"added_docs": 0, "added_vectors": 0}

            # Prepare chunks
            chunk_texts: List[str] = []
            chunk_records: List[Dict[str, Any]] = []
            document_records: List[DocumentModel] = []

            for d in docs:
                text = (d.get("text") or "").strip()
                if not text:
                    continue
                doc_id = d.get("id") or str(uuid.uuid4())
                normalized_meta = self._normalize_metadata(d.get("meta_data") or d.get("metadata") or {})
                source = normalized_meta.get("source")
                document_records.append(DocumentModel(id=doc_id, user_id=user_id, source=source))
                chunks = self._chunk_text(text)
                for i, ch in enumerate(chunks):
                    chunk_texts.append(ch)
                    chunk_records.append({
                        "id": str(uuid.uuid4()),
                        "document_id": doc_id,
                        "chunk_index": i,
                        "text": ch,
                        "meta_data": normalized_meta,
                    })

            if not chunk_records:
                return {"added_docs": 0, "added_vectors": 0}

            # Embed all chunks
            embeddings = self._embed(chunk_texts)

            # Persist
            with self.SessionLocal() as session:
                with session.begin():
                    # Upsert-like naive insert (ignore conflicts) — rely on id uniqueness
                    for doc in document_records:
                        # Try to add; ignore if exists
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
        parts: List[str] = []
        if name:
            parts.append(f"Name: {name}")
        for key in ["age", "height", "weight", "gender", "injuries", "restrictions", "motivation_notes"]:
            if key in profile:
                parts.append(f"{key}: {profile[key]}")
        for key in ["goal", "split", "nutrition", "target_weight", "timeline"]:
            if key in goals:
                parts.append(f"{key}: {goals[key]}")
        return "; ".join(parts) if parts else "(empty profile/goals)"

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
        dq = self._ensure_session(key)
        dq.append({"role": role, "content": content, "ts": time.time()})

    def get_session_messages(self, user_id: str, session_id: Optional[str], max_messages: int = 8) -> List[Dict[str, Any]]:
        key = self._get_session_key(user_id, session_id)
        dq = self._ensure_session(key)
        return list(dq)[-max_messages:]

    def clear_session(self, user_id: str, session_id: Optional[str]) -> None:
        key = self._get_session_key(user_id, session_id)
        if hasattr(self, "_session_memory") and key in self._session_memory:
            del self._session_memory[key]

    def retrieve(self, query: str, user_id: Optional[str], top_k: Optional[int] = None) -> List[RetrievedChunk]:
        if not query.strip():
            return []
        # retrieve more candidates for reranking
        k_final = max(1, top_k or self.config.top_k)
        k_candidates = max(k_final, getattr(self.config, "retriever_candidates", k_final))
        query_vec = self._embed([query])[0].tolist()

        with self.SessionLocal() as session:
            # Order by cosine distance ascending
            dist = ChunkModel.embedding.cosine_distance(query_vec)
            stmt = (
                select(ChunkModel, DocumentModel)
                .join(DocumentModel, ChunkModel.document_id == DocumentModel.id)
                .where(or_(DocumentModel.user_id == user_id, DocumentModel.user_id.is_(None)))
                .order_by(dist)
                .limit(k_candidates)
            )
            results = session.execute(stmt).all()

        out: List[RetrievedChunk] = []
        for ch, doc in results:
            out.append(
                RetrievedChunk(
                    doc_id=ch.document_id,
                    chunk_id=ch.id,
                    text=ch.text,
                    score=0.0,
                    metadata=ch.meta_data or {},
                )
            )

        # Rerank if configured
        def _apply_rerank(chunks: List[RetrievedChunk], top_k: int) -> List[RetrievedChunk]:
            if not chunks:
                return []
            backend = (self.config.reranker_backend or "none").lower()
            if backend == "local" and self.reranker is not None:
                pairs = [(query, c.text) for c in chunks]
                try:
                    scores = self.reranker.predict(pairs, batch_size=64, show_progress_bar=False)
                except Exception as e:
                    self.logger.warning("Local reranker failed: %s", e)
                    scores = [0.0] * len(chunks)
                for c, s in zip(chunks, scores):
                    c.score = float(s)
                chunks.sort(key=lambda x: x.score, reverse=True)
                return chunks[:top_k]
            if backend == "remote" and self._reranker_session and self.config.reranker_remote_url:
                try:
                    payload = {"query": query, "passages": [c.text for c in chunks], "top_k": top_k}
                    resp = self._reranker_session.post(self.config.reranker_remote_url, json=payload, timeout=self.config.reranker_timeout_ms / 1000.0)
                    resp.raise_for_status()
                    data = resp.json()
                    # Expect [{index:int, score:float}] ordering or {scores:[...]} same length
                    if isinstance(data, dict) and "scores" in data:
                        scores = data["scores"]
                        for c, s in zip(chunks, scores):
                            c.score = float(s)
                        chunks.sort(key=lambda x: x.score, reverse=True)
                        return chunks[:top_k]
                    if isinstance(data, list) and data and isinstance(data[0], dict) and "index" in data[0]:
                        ranked = []
                        for item in data[:top_k]:
                            idx = int(item.get("index", 0))
                            s = float(item.get("score", 0.0))
                            if 0 <= idx < len(chunks):
                                ch = chunks[idx]
                                ch.score = s
                                ranked.append(ch)
                        return ranked
                except Exception as e:
                    self.logger.warning("Remote reranker failed: %s", e)
            # Fallback: keep retrieval order
            for i, c in enumerate(chunks):
                c.score = float(max(0.0, 1.0 - 0.05 * i))
            return chunks[:top_k]

        return _apply_rerank(out, k_final)

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

    def chat(
        self,
        query: str,
        user_id: Optional[str],
        session_id: Optional[str] = None,
        top_k: Optional[int] = None,
        max_new_tokens: Optional[int] = None,
        temperature: Optional[float] = None,
    ) -> Dict[str, Any]:
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

        # Build prompt using chat template when available; fallback to instruction prompt
        system_text = (
            "You are FitAI, a tough-love personalized fitness coach.\n"
            "CRITICAL RULES:\n"
            "1. ONLY answer using info from KB, DYNAMIC, or STATIC sections below.\n"
            "2. If info is missing, say 'I don't have enough data to answer that.'\n"
            "3. ALWAYS cite sources like [KB 1], [Log 2] after each claim.\n"
            "4. Do NOT make up numbers, dates, or exercise protocols.\n"
            "5. Keep answers under 4 sentences.\n"
        )
        context_text = (
            f"MEMORY:\n{memory_text}\n\n"
            f"STATIC:\n{static_summary}\n\n"
            f"SESSION:\n{session_context}\n\n"
            f"DYNAMIC:\n{dyn_text}\n\n"
            f"KB:\n{kb_text}\n\n"
        )
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
            if user_id and ans:
                self.append_session_message(user_id, session_id, role="assistant", content=ans)
            return {"answer": ans, "references": references, "dynamic_refs": dyn[:5]}
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
                "snippet": self._highlight_snippet(query, r.text, max_len=300),
            }
            for r in retrieved
        ]
        # Generate simple per-claim citations mapping top references to numbered KB items in prompt
        citations: List[Dict[str, Any]] = []
        for i, r in enumerate(retrieved[: min(5, len(retrieved))]):
            citations.append({
                "claim": f"See KB {i+1}",
                "source": r.metadata.get("source") if isinstance(r.metadata, dict) else None,
                "chunk_id": r.chunk_id,
            })

        # Append assistant reply to session buffer
        if user_id and ans:
            self.append_session_message(user_id, session_id, role="assistant", content=ans)

        return {
            "answer": ans,
            "references": references,
            "dynamic_refs": dyn[:5],
            "citations": citations,
        }


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