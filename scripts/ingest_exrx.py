#!/usr/bin/env python3
from __future__ import annotations

import os
import time
from typing import List, Dict, Any, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup

BASE_URL = os.getenv("EXRX_BASE_URL", "https://exrx.net")
START_PATHS_ENV = os.getenv("EXRX_START_PATHS")  # comma-separated paths
START_PATHS = (
    [p.strip() for p in START_PATHS_ENV.split(",") if p.strip()]
    if START_PATHS_ENV
    else [
        "/Psychology",
        "/Lists/Directory",
        "/WeightTraining",
    ]
)
MAX_PAGES = int(os.getenv("EXRX_MAX_PAGES", "200"))
USER_AGENT = os.getenv(
    "EXRX_UA",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
)
DEBUG = os.getenv("EXRX_DEBUG", "0") in ("1", "true", "True")

SEEN = set()


def _session() -> requests.Session:
    s = requests.Session()
    retry = Retry(total=3, backoff_factor=0.3, status_forcelist=[429, 500, 502, 503, 504])
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.8",
            "Cache-Control": "no-cache",
        }
    )
    return s


def fetch(sess: requests.Session, url: str) -> Optional[str]:
    try:
        resp = sess.get(url, timeout=20)
        ctype = resp.headers.get("content-type", "")
        ok_html = resp.status_code == 200 and ("text/html" in ctype or "<html" in resp.text.lower())
        if DEBUG:
            print(f"FETCH {resp.status_code} {ctype} {url}")
        if ok_html:
            return resp.text
        return None
    except Exception as e:
        if DEBUG:
            print(f"FETCH ERROR {url}: {e}")
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
    queue = [BASE_URL.rstrip("/") + p for p in START_PATHS]
    sess = _session()
    while queue and len(docs) < limit:
        url = queue.pop(0)
        if url in SEEN:
            continue
        SEEN.add(url)
        html = fetch(sess, url)
        if not html:
            continue
        txt = extract_text(html)
        if len(txt) > 100:
            docs.append({"id": url, "text": txt, "metadata": {"source": "exrx", "url": url}})
        for p in extract_links(html):
            full = BASE_URL.rstrip("/") + p
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
