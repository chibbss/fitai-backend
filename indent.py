def add_documents(self, docs: List[Dict[str, Any]], user_id: Optional[str]) -> Dict[str, Any]:
    """Add documents for a user (or global if user_id is None)."""
    with self._lock:
        if not docs:
            return {"added_docs": 0, "added_vectors": 0}
        
        # Prepare chunks
        chunk_texts: List[str] = []
        chunk_records: List[Dict[str, Any]] = []
        document_records: List[DocumentModel] = []
        document_ids_seen = set()
        
        for d in docs:
            text = (d.get("text") or "").strip()
            if not text:
                continue
            
            # Get metadata (support both keys)
            metadata = d.get("meta_data") or d.get("metadata") or {}
            doc_id = d.get("id") or str(uuid.uuid4())
            source = metadata.get("source")
            
            # Check if document is already chunked
            is_chunked = metadata.get("is_chunked", False)
            
            # Only add document record once per unique doc_id
            if doc_id not in document_ids_seen:
                document_records.append(DocumentModel(id=doc_id, user_id=user_id, source=source))
                document_ids_seen.add(doc_id)
            
            if is_chunked:
                # Pre-chunked document - store as-is without re-chunking
                chunk_texts.append(text)
                chunk_records.append({
                    "id": str(uuid.uuid4()),
                    "document_id": doc_id,
                    "chunk_index": metadata.get("chunk_index", 0),
                    "text": text,
                    "meta_data": metadata,
                })
            else:
                # Full document - chunk server-side
                chunks = self._chunk_text(text)
                for i, ch in enumerate(chunks):
                    chunk_texts.append(ch)
                    chunk_metadata = metadata.copy()
                    chunk_metadata.update({
                        "chunk_index": i,
                        "total_chunks": len(chunks),
                        "is_chunked": True,
                        "chunked_server_side": True
                    })
                    chunk_records.append({
                        "id": str(uuid.uuid4()),
                        "document_id": doc_id,
                        "chunk_index": i,
                        "text": ch,
                        "meta_data": chunk_metadata,
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