#!/usr/bin/env python3
from __future__ import annotations

import os
from ingest_common import ingest_from_seeds

DEFAULTS = [
    "https://www.apa.org/topics/exercise",
]

if __name__ == "__main__":
    os.environ.setdefault("APA_MAX_PAGES", "50")
    ingest_from_seeds("APA", "apa", DEFAULTS)
}