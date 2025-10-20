#!/usr/bin/env python3
from __future__ import annotations

import os
from typing import List, Dict

# Minimal placeholder harness; integrate ragas when desired
# pip install ragas datasets

def build_eval_set() -> List[Dict[str, str]]:
    return [
        {"question": "What are benefits of HIIT?", "answer": "HIIT improves cardiovascular fitness.", "context": "HIIT benefits include cardiac output, VO2 max."},
        {"question": "Basics of progressive overload?", "answer": "Increase volume or intensity over time.", "context": "Progressive overload: volume, intensity, frequency."},
    ]


def main() -> None:
    eval_set = build_eval_set()
    print(f"Eval items: {len(eval_set)}")
    # TODO: call your /chat and compute ragas metrics once added


if __name__ == "__main__":
    main()
