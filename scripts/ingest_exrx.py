#!/usr/bin/env python3
from __future__ import annotations

import os
import time
from typing import List, Dict, Any, Optional

import requests
from bs4 import BeautifulSoup

BASE_URL = os.getenv("EXRX_BASE_URL", "https://exrx.net")
START_PATHS = [
    "/Psychology",
    "/Lists/Directory",
    "/WeightTraining/FullBody",
]
MAX_PAGES = int(os.getenv("EXRX_MAX_PAGES", "200"))
USER_AGENT = os.getenv("EXRX_UA", "FitAI-Ingest/1.0")

SEEN = set()


def fetch(url: str) -> Optional[str]:
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=15)
        if resp.status_code == 200 and "text/html" in resp.headers.get("content-type", ""):
            return resp.text
        return None
    except Exception:
        return None


def extract_links(html: str) -> List[str]:
    soup = BeautifulSoup(html, "html.parser")
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.startswith("/") and not href.startswith("//"):
            links.append(href)
    return links


def extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    # Remove nav/footers likely by id/class heuristics
    for sel in ["nav", "footer", ".footer", ".nav", "#nav", "#footer"]:
        for el in soup.select(sel):
            el.decompose()
    text = soup.get_text("\n")
    text = "\n".join([ln.strip() for ln in text.splitlines() if ln.strip()])
    return text


def crawl(limit: int = MAX_PAGES) -> List[Dict[str, Any]]:
    docs: List[Dict[str, Any]] = []
    queue = [BASE_URL + p for p in START_PATHS]
    while queue and len(docs) < limit:
        url = queue.pop(0)
        if url in SEEN:
            continue
        SEEN.add(url)
        html = fetch(url)
        if not html:
            continue
        txt = extract_text(html)
        if len(txt) > 200:
            docs.append({"id": url, "text": txt, "metadata": {"source": "exrx", "url": url}})
        for p in extract_links(html):
            full = BASE_URL + p
            if full not in SEEN and BASE_URL in full:
                queue.append(full)
        time.sleep(0.5)
    return docs


if __name__ == "__main__":
    ds = crawl()
    print(f"Collected {len(ds)} pages")
    # Optionally POST to API in batches
    api = os.getenv("API_URL")
    user_id = os.getenv("USER_ID")
    if api and ds:
        import math, json
        B = 5
        for i in range(0, len(ds), B):
            payload = {"user_id": user_id, "documents": ds[i : i + B]}
            r = requests.post(f"{api}/add_docs", json=payload, timeout=60)
            print(i, r.status_code, r.text[:200])
