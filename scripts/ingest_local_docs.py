#!/usr/bin/env python3
from __future__ import annotations

import argparse
import glob
import os
from typing import List, Dict, Any

import requests

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None  # type: ignore


def extract_pdf(path: str) -> str:
    if PdfReader is None:
        raise RuntimeError("pypdf not installed. pip install pypdf")
    reader = PdfReader(path)
    parts: List[str] = []
    for page in reader.pages:
        try:
            txt = page.extract_text() or ""
            if txt.strip():
                parts.append(txt)
        except Exception:
            continue
    return "\n".join(parts)


def extract_text_file(path: str) -> str:
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()


def build_doc(path: str, text: str, category: str, source_url: str | None) -> Dict[str, Any]:
    title = os.path.basename(path)
    return {
        "id": None,
        "text": text,
        "metadata": {
            "source": "local",
            "file_path": path,
            "title": title,
            "category": category,
            **({"url": source_url} if source_url else {}),
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest local documents into FitAI RAG")
    ap.add_argument("patterns", nargs="+", help="Glob patterns for files (e.g., data/pdfs/*.pdf)")
    ap.add_argument("--category", default="fitness", help="Category metadata")
    ap.add_argument("--api", default=os.getenv("API_URL", "http://localhost:8000"))
    ap.add_argument("--batch", type=int, default=5)
    ap.add_argument("--url", default=None, help="Optional source URL to attach to all docs")
    args = ap.parse_args()

    files: List[str] = []
    for p in args.patterns:
        files.extend(glob.glob(p))
    files = sorted(set(files))

    docs: List[Dict[str, Any]] = []
    for fp in files:
        ext = os.path.splitext(fp)[1].lower()
        if ext == ".pdf":
            txt = extract_pdf(fp)
        elif ext in (".txt", ".md"):
            txt = extract_text_file(fp)
        else:
            print(f"Skipping unsupported file type: {fp}")
            continue
        txt = (txt or "").strip()
        if not txt:
            continue
        docs.append(build_doc(fp, txt, args.category, args.url))

    print(f"Prepared {len(docs)} docs from {len(files)} files")
    if not docs:
        return

    headers = {"Content-Type": "application/json"}
    import json
    for i in range(0, len(docs), args.batch):
        payload = {"user_id": None, "documents": docs[i : i + args.batch]}
        r = requests.post(f"{args.api}/add_docs", headers=headers, data=json.dumps(payload), timeout=120)
        print(f"POST {i}-{i+args.batch}: {r.status_code}")
        if r.status_code >= 400:
            print(r.text[:500])


if __name__ == "__main__":
    main()
