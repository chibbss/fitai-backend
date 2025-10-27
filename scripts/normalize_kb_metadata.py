#!/usr/bin/env python3
from __future__ import annotations

import argparse
from typing import Dict, Optional, Tuple

from rag import RAGService, ChunkModel, DocumentModel


def infer_org_url_and_subcategory(title: str) -> Tuple[Optional[str], Optional[str], str]:
    """Infer source org, canonical URL, and a sensible subcategory from a document title."""
    t = (title or "").lower()
    # Defaults
    org: Optional[str] = None
    url: Optional[str] = None
    subcat: str = "general"

    # Nutrition / USDA
    if "dietary guidelines for americans" in t:
        org = "USDA"
        url = "https://www.dietaryguidelines.gov/"
        subcat = "nutrition"
        return org, url, subcat

    # HHS Physical Activity Guidelines
    if "physical activity guidelines for americans" in t:
        org = "HHS"
        url = "https://health.gov/our-work/physical-activity/current-guidelines"
        subcat = "guidelines"
        return org, url, subcat

    # WHO PA guidelines
    if "who global recommendations on physical activity" in t or (
        "world health organization" in t and "physical activity" in t
    ):
        org = "WHO"
        url = "https://www.who.int/publications/"  # umbrella page
        subcat = "guidelines"
        return org, url, subcat

    # ACSM resistance training
    if "acsm" in t and "resistance" in t:
        org = "ACSM"
        url = "https://www.acsm.org/education-resources/trending-topics-resources/position-stands"
        subcat = "strength_training"
        return org, url, subcat

    # Self-Determination Theory
    if "self-determination theory" in t or "ryan" in t and "deci" in t:
        org = "SDT"
        url = "https://selfdeterminationtheory.org/"
        subcat = "motivation"
        return org, url, subcat

    # Fallback heuristics
    if any(k in t for k in ["nutrition", "diet", "protein", "calorie", "usda"]):
        org = org or "USDA"
        subcat = "nutrition"
    elif any(k in t for k in ["resistance", "strength", "hypertrophy", "acsm", "nsca"]):
        org = org or "ACSM"
        subcat = "strength_training"
    elif any(k in t for k in ["cardio", "endurance", "aerobic", "running", "cycling", "physical activity"]):
        org = org or "HHS"
        subcat = "endurance"
    elif any(k in t for k in ["injury", "rehabilitation", "prevention"]):
        subcat = "injury_prevention"
    return org, url, subcat


def normalize_kb_metadata(dry_run: bool = False) -> None:
    rag = RAGService()
    rag.startup()
    updated_docs = 0
    updated_chunks = 0

    with rag.SessionLocal() as session:
        # Fetch a representative chunk (chunk_index=0) for each document to get title metadata if present
        reps = (
            session.query(ChunkModel, DocumentModel)
            .join(DocumentModel, ChunkModel.document_id == DocumentModel.id)
            .filter(ChunkModel.chunk_index == 0)
            .all()
        )
        for ch0, doc in reps:
            meta0 = ch0.meta_data or {}
            title = meta0.get("title") or meta0.get("filename") or ""
            org, url, subcat = infer_org_url_and_subcategory(title)

            # Update document.source when possible
            if org and doc.source != org:
                if not dry_run:
                    doc.source = org
                updated_docs += 1

            # Update all chunks' metadata for this document
            chunks = (
                session.query(ChunkModel)
                .filter(ChunkModel.document_id == doc.id)
                .all()
            )
            for ch in chunks:
                md = dict(ch.meta_data or {})
                # Normalize category to kb
                md["category"] = "kb"
                # Attach/override subcategory only if missing or generic
                if not md.get("subcategory") or md.get("subcategory") in ("general", "fitness", "nutrition", "motivation"):
                    md["subcategory"] = subcat
                # Set source and url when known
                if org:
                    md["source"] = org
                if url:
                    md["url"] = url
                if not dry_run:
                    ch.meta_data = md
                updated_chunks += 1
        if not dry_run:
            session.commit()

    print(f"Documents updated: {updated_docs}")
    print(f"Chunks updated: {updated_chunks}")


def main() -> None:
    ap = argparse.ArgumentParser(description="Normalize KB categories and attach canonical URLs")
    ap.add_argument("--dry-run", action="store_true", help="Print counts only; do not write")
    args = ap.parse_args()
    normalize_kb_metadata(dry_run=args.dry_run)


if __name__ == "__main__":
    main()
