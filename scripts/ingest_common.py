#!/usr/bin/env python3
from __future__ import annotations

import os
import time
from typing import List, Dict, Any, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from bs4 import BeautifulSoup


def build_session(user_agent: Optional[str] = None) -> requests.Session:
    s = requests.Session()
    retry = Retry(total=3, backoff_factor=0.3, status_forcelist=[429, 500, 502, 503, 504])
    s.mount("https://", HTTPAdapter(max_retries=retry))
    s.mount("http://", HTTPAdapter(max_retries=retry))
    ua = user_agent or os.getenv(
        "INGEST_UA",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129 Safari/537.36",
    )
    s.headers.update(
        {
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.8",
            "Cache-Control": "no-cache",
        }
    )
    return s


def fetch_html(session: requests.Session, url: str, debug: bool = False) -> Optional[str]:
    try:
        r = session.get(url, timeout=25)
        ctype = r.headers.get("content-type", "")
        ok_html = r.status_code == 200 and ("text/html" in ctype or "<html" in r.text.lower())
        if debug:
            print(f"FETCH {r.status_code} {ctype} {url}")
        return r.text if ok_html else None
    except Exception as e:
        if debug:
            print(f"FETCH ERROR {url}: {e}")
        return None


def extract_text(html: str) -> str:
    soup = BeautifulSoup(html, "html.parser")
    # Drop common chrome
    for sel in ["nav", "header", "footer", ".footer", ".nav", ".header", "#nav", "#footer"]:
        for el in soup.select(sel):
            el.decompose()
    text = soup.get_text("\n")
    lines = [ln.strip() for ln in text.splitlines()]
    return "\n".join([ln for ln in lines if ln])


def load_seed_urls(prefix: str, defaults: List[str]) -> List[str]:
    # Prefer seed file
    seed_file = os.getenv(f"{prefix}_SEED_FILE")
    if seed_file and os.path.exists(seed_file):
        urls: List[str] = []
        with open(seed_file, "r", encoding="utf-8") as f:
            for ln in f:
                ln = ln.strip()
                if not ln or ln.startswith("#"):
                    continue
                urls.append(ln)
        return urls
    # Else parse comma-separated start URLs
    env_urls = os.getenv(f"{prefix}_START_URLS")
    if env_urls:
        return [u.strip() for u in env_urls.split(",") if u.strip()]
    return defaults


def post_docs(api_url: str, user_id: Optional[str], docs: List[Dict[str, Any]], token: Optional[str] = None, batch_size: int = 5) -> None:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    import json

    for i in range(0, len(docs), batch_size):
        payload = {"user_id": user_id, "documents": docs[i : i + batch_size]}
        r = requests.post(f"{api_url}/add_docs", headers=headers, data=json.dumps(payload), timeout=60)
        print(f"POST {i}-{i+batch_size}: {r.status_code}")


def ingest_from_seeds(prefix: str, source: str, defaults: List[str]) -> int:
    debug = os.getenv(f"{prefix}_DEBUG", os.getenv("INGEST_DEBUG", "0")) in ("1", "true", "True")
    min_chars = int(os.getenv(f"{prefix}_MIN_CHARS", "300"))
    delay = float(os.getenv(f"{prefix}_DELAY_SEC", "0.3"))
    max_pages = int(os.getenv(f"{prefix}_MAX_PAGES", "100"))
    api_url = os.getenv("API_URL")
    user_id = os.getenv("USER_ID") or None  # omit for global
    api_token = os.getenv("API_TOKEN") or None

    session = build_session()
    urls = load_seed_urls(prefix, defaults)

    docs: List[Dict[str, Any]] = []
    for url in urls[:max_pages]:
        html = fetch_html(session, url, debug=debug)
        if not html:
            continue
        txt = extract_text(html)
        if len(txt) < min_chars:
            continue
        docs.append({"id": url, "text": txt, "metadata": {"source": source, "url": url}})
        time.sleep(delay)

    print(f"Collected {len(docs)} pages for {source}")
    if api_url and docs:
        post_docs(api_url, user_id, docs, token=api_token)
    return len(docs)
