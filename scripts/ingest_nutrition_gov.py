#!/usr/bin/env python3
from __future__ import annotations

import os
from ingest_common import ingest_from_seeds

DEFAULTS = [
    "https://www.nutrition.gov/",
]

if __name__ == "__main__":
    os.environ.setdefault("NUTRITION_GOV_MAX_PAGES", "50")
    ingest_from_seeds("NUTRITION_GOV", "nutrition_gov", DEFAULTS)
}