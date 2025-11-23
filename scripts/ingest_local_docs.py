#!/usr/bin/env python3
from __future__ import annotations
import argparse
import glob
import os
import hashlib
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
import requests
import re

try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None  # type: ignore


def compute_file_hash(path: str) -> str:
    """Compute SHA256 hash for deduplication"""
    sha256 = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b""):
            sha256.update(chunk)
    return f"sha256:{sha256.hexdigest()}"


def extract_pdf_metadata(path: str, reader: Any) -> Dict[str, Any]:
    """Extract rich metadata from PDF"""
    metadata = {}
    
    # Page count
    metadata['page_count'] = len(reader.pages)
    
    # Try to get PDF metadata
    pdf_info = reader.metadata or {}
    if pdf_info:
        metadata['pdf_title'] = pdf_info.get('/Title', '')
        metadata['pdf_author'] = pdf_info.get('/Author', '')
        metadata['pdf_subject'] = pdf_info.get('/Subject', '')
        metadata['pdf_creator'] = pdf_info.get('/Creator', '')
        
        # Publication date from PDF
        if '/CreationDate' in pdf_info:
            creation_date = str(pdf_info['/CreationDate'])
            # Parse D:YYYYMMDD format
            if creation_date.startswith('D:') and len(creation_date) >= 12:
                try:
                    year = int(creation_date[2:6])
                    if 1900 <= year <= 2030:
                        metadata['pdf_creation_year'] = year
                except:
                    pass
    
    return metadata


def detect_content_features(text: str) -> Dict[str, Any]:
    """Analyze document content for features"""
    features = {}
    
    # Word count
    features['word_count'] = len(text.split())
    
    # Check for references section
    text_lower = text.lower()
    features['has_references'] = any(
        marker in text_lower 
        for marker in ['references\n', 'bibliography\n', 'works cited']
    )
    
    # Check for tables (rough heuristic)
    features['has_tables'] = text.count('|') > 50 or text.count('\t') > 100
    
    # Detect language (simple heuristic - can use langdetect library for better accuracy)
    english_words = ['the', 'and', 'for', 'with', 'training', 'exercise']
    english_count = sum(1 for word in english_words if word in text_lower)
    features['language'] = 'en' if english_count >= 3 else 'unknown'
    
    return features


def infer_credibility_score(filename: str, metadata: Dict[str, Any]) -> int:
    """
    Assign credibility score (1-10) based on source indicators
    10 = peer-reviewed journal, government guideline
    7-9 = established organizations
    4-6 = blogs, commercial sites
    1-3 = unknown sources
    """
    filename_lower = filename.lower()
    
    # High credibility indicators
    high_cred = ['acsm', 'nsca', 'nih', 'who', 'cdc', 'jama', 'nejm', 
                 'journal', 'pubmed', 'government', 'guidelines']
    
    # Medium credibility indicators
    med_cred = ['university', 'college', 'research', 'study']
    
    for term in high_cred:
        if term in filename_lower:
            return 10
    
    for term in med_cred:
        if term in filename_lower:
            return 7
    
    # Check metadata
    if metadata.get('pdf_author') and any(
        org in str(metadata.get('pdf_author', '')).lower() 
        for org in ['acsm', 'nsca', 'university']
    ):
        return 9
    
    return 5  # default


def clean_title(filename: str, pdf_metadata: Dict[str, Any]) -> str:
    """
    Extract clean title from filename or PDF metadata
    """
    # Try PDF metadata first
    pdf_title = pdf_metadata.get('pdf_title', '').strip()
    if pdf_title and len(pdf_title) > 5:
        return pdf_title
    
    # Clean filename
    title = os.path.splitext(filename)[0]
    # Replace common separators
    title = title.replace('_', ' ').replace('-', ' ')
    # Remove extra spaces
    title = ' '.join(title.split())
    return title


def detect_subcategory(text: str, title: str) -> str:
    """
    Auto-detect subcategory from content
    """
    text_lower = (text + ' ' + title).lower()
    
    keywords = {
        'strength_training': ['resistance training', 'strength', 'powerlifting', 'weightlifting'],
        'hypertrophy': ['hypertrophy', 'muscle growth', 'bodybuilding', 'muscle mass'],
        'endurance': ['endurance', 'cardio', 'aerobic', 'running', 'cycling'],
        'nutrition': ['nutrition', 'diet', 'protein', 'calories', 'macros'],
        'injury_prevention': ['injury', 'rehabilitation', 'prevention', 'recovery'],
        'mobility': ['mobility', 'flexibility', 'stretching', 'range of motion'],
        'programming': ['program', 'periodization', 'mesocycle', 'microcycle'],
    }
    
    # Count matches for each subcategory
    scores = {}
    for subcat, terms in keywords.items():
        scores[subcat] = sum(1 for term in terms if term in text_lower)
    
    # Return subcategory with highest score
    best_subcat = max(scores.items(), key=lambda x: x[1])
    return best_subcat[0] if best_subcat[1] > 0 else 'general'


def extract_pdf(path: str) -> tuple[str, Dict[str, Any]]:
    """Extract text and metadata from PDF"""
    if PdfReader is None:
        raise RuntimeError("pypdf not installed. pip install pypdf")
    
    reader = PdfReader(path)
    
    # Extract PDF-specific metadata
    pdf_meta = extract_pdf_metadata(path, reader)
    
    # Extract text
    parts: List[str] = []
    failed_pages = 0
    for page in reader.pages:
        try:
            txt = page.extract_text() or ""
            if txt.strip():
                parts.append(txt)
        except Exception:
            failed_pages += 1
            continue
    
    text = "\n".join(parts)
    # --- Text normalization to improve chunk boundaries ---
    # Fix hyphenation across line breaks: "car-\nbohydrate" -> "carbohydrate"
    text = re.sub(r'-\s*\n\s*', '', text)
    # Merge single newlines inside paragraphs into spaces; keep paragraph breaks
    text = re.sub(r'(?<!\n)\n(?!\n)', ' ', text)
    # Collapse multiple spaces/tabs
    text = re.sub(r'[ \t]{2,}', ' ', text)
    # Trim
    text = text.strip()
    
    # Assess extraction quality
    if failed_pages == 0:
        pdf_meta['extraction_quality'] = 'high'
    elif failed_pages < len(reader.pages) * 0.1:
        pdf_meta['extraction_quality'] = 'medium'
    else:
        pdf_meta['extraction_quality'] = 'low'
    
    pdf_meta['failed_pages'] = failed_pages
    
    return text, pdf_meta


def extract_text_file(path: str) -> tuple[str, Dict[str, Any]]:
    """Extract text from .txt or .md file"""
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        text = f.read()
    
    metadata = {
        'extraction_quality': 'high',
        'page_count': 1  # text files treated as single page
    }
    
    return text, metadata


def build_enriched_doc(
    path: str, 
    text: str, 
    category: str, 
    source_url: Optional[str],
    extraction_meta: Dict[str, Any]
) -> Dict[str, Any]:
    """Build document with rich metadata"""
    
    filename = os.path.basename(path)
    file_stats = os.stat(path)
    
    # Clean title
    title = clean_title(filename, extraction_meta)
    
    # Detect subcategory
    subcategory = detect_subcategory(text, title)
    
    # Content analysis
    content_features = detect_content_features(text)
    
    # Credibility score
    credibility = infer_credibility_score(filename, extraction_meta)
    
    # Build metadata
    metadata = {
        # Basic info
        "source": "local",
        "file_path": path,
        "title": title,
        "filename": filename,
        "category": category,
        "subcategory": subcategory,
        
        # File properties
        "file_size_mb": round(file_stats.st_size / (1024 * 1024), 2),
        "file_hash": compute_file_hash(path),
        "last_modified": datetime.fromtimestamp(file_stats.st_mtime).isoformat(),
        
        # Content metadata
        **content_features,
        **extraction_meta,
        
        # Quality indicators
        "credibility_score": credibility,
        
        # Processing metadata
        "ingested_at": datetime.now(timezone.utc).isoformat(),
        "extraction_method": "pypdf" if path.endswith('.pdf') else "text",
    }
    
    # Add optional fields
    if source_url:
        metadata["url"] = source_url
    
    # Extract author from PDF metadata if available
    if extraction_meta.get('pdf_author'):
        metadata['author'] = extraction_meta['pdf_author']
    
    # Extract publication year from PDF metadata
    if extraction_meta.get('pdf_creation_year'):
        metadata['publication_year'] = extraction_meta['pdf_creation_year']
    
    return {
        "id": None,
        "text": text,
        "metadata": metadata,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description="Ingest local documents into FitAI RAG")
    ap.add_argument("patterns", nargs="+", help="Glob patterns for files (e.g., data/pdfs/*.pdf)")
    ap.add_argument("--category", default="fitness", help="Category metadata")
    ap.add_argument("--api", default=os.getenv("API_URL", "http://localhost:8000"))
    ap.add_argument("--batch", type=int, default=5)
    ap.add_argument("--timeout", type=int, default=120, help="HTTP timeout in seconds for /add_docs requests")
    ap.add_argument("--url", default=None, help="Optional source URL to attach to all docs")
    args = ap.parse_args()

    # Collect files
    files: List[str] = []
    for p in args.patterns:
        files.extend(glob.glob(p))
    files = sorted(set(files))
    
    print(f"Found {len(files)} files to process")

    docs: List[Dict[str, Any]] = []
    
    for fp in files:
        print(f"\nProcessing: {fp}")
        ext = os.path.splitext(fp)[1].lower()
        
        try:
            if ext == ".pdf":
                txt, extraction_meta = extract_pdf(fp)
            elif ext in (".txt", ".md"):
                txt, extraction_meta = extract_text_file(fp)
            else:
                print(f"  ⚠️  Skipping unsupported file type: {ext}")
                continue
            
            txt = (txt or "").strip()
            if not txt:
                print(f"  ⚠️  No text extracted, skipping")
                continue
            
            doc = build_enriched_doc(fp, txt, args.category, args.url, extraction_meta)
            docs.append(doc)
            
            # Print metadata summary
            meta = doc['metadata']
            print(f"  ✓ Title: {meta['title']}")
            print(f"  ✓ Subcategory: {meta['subcategory']}")
            print(f"  ✓ Pages: {meta.get('page_count', 'N/A')}")
            print(f"  ✓ Words: {meta['word_count']:,}")
            print(f"  ✓ Credibility: {meta['credibility_score']}/10")
            print(f"  ✓ Quality: {meta['extraction_quality']}")
            
        except Exception as e:
            print(f"  ❌ Error processing {fp}: {e}")
            continue

    print(f"\n{'='*60}")
    print(f"Prepared {len(docs)} docs from {len(files)} files")
    print(f"{'='*60}\n")
    
    if not docs:
        print("No documents to upload")
        return

    # Upload in batches
    headers = {"Content-Type": "application/json"}
    import json
    
    success_count = 0
    for i in range(0, len(docs), args.batch):
        batch = docs[i : i + args.batch]
        payload = {"user_id": None, "documents": batch}
        
        try:
            r = requests.post(
                f"{args.api}/add_docs", 
                headers=headers, 
                data=json.dumps(payload), 
                timeout=args.timeout
            )
            
            if r.status_code < 400:
                success_count += len(batch)
                print(f"✓ Batch {i//args.batch + 1}: Uploaded {len(batch)} docs ({r.status_code})")
            else:
                print(f"✗ Batch {i//args.batch + 1}: Failed ({r.status_code})")
                print(f"  Error: {r.text[:500]}")
                
        except Exception as e:
            print(f"✗ Batch {i//args.batch + 1}: Request failed - {e}")
    
    print(f"\n{'='*60}")
    print(f"Upload complete: {success_count}/{len(docs)} docs succeeded")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

