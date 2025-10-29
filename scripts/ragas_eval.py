#!/usr/bin/env python3
from __future__ import annotations

import os
from typing import List, Dict

"""
Minimal RAGAS evaluation stub.

Usage:
  pip install ragas datasets
  python scripts/ragas_eval.py

This stub builds a tiny QA set and prints it. Extend by calling your
running API (e.g., http://localhost:8000/chat) and computing RAGAS metrics.
"""

def build_eval_set() -> List[Dict[str, str]]:
    return [
        {
            "question": "What are the benefits of HIIT?",
            "answer": "HIIT improves cardiovascular fitness and VO2 max.",
            "context": "HIIT benefits include improved cardiac output and VO2 max per ACSM guidelines.",
        },
        {
            "question": "Basics of progressive overload?",
            "answer": "Increase volume, intensity, or frequency over time.",
            "context": "Progressive overload involves gradually increasing volume, intensity, or frequency.",
        },
    ]


def main() -> None:
    eval_set = build_eval_set()
    print(f"Eval items: {len(eval_set)}")
    for i, ex in enumerate(eval_set, 1):
        print(f"[{i}] Q: {ex['question']}")
        print(f"    A: {ex['answer']}")
        print(f"    C: {ex['context']}")
    # TODO: integrate ragas once endpoints are reachable.


if __name__ == "__main__":
    main()
