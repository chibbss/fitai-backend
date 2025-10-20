#!/usr/bin/env python3
from __future__ import annotations

import os
from ingest_common import ingest_from_seeds

DEFAULTS = [
    "https://www.nhs.uk/live-well/exercise/",
]

if __name__ == "__main__":
    os.environ.setdefault("NHS_MAX_PAGES", "50")
    ingest_from_seeds("NHS", "nhs", DEFAULTS)
}