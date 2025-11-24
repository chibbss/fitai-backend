# Render Deployment Fix - Lightweight Requirements

## Problem
Render build was failing with `ConnectionResetError` while downloading PyTorch packages (torch, torchvision, torchaudio) which are ~500MB+ each. These packages aren't needed on Render since Modal handles all AI inference.

## Solution
Created `requirements-render.txt` that excludes PyTorch and heavy ML packages, reducing build time and avoiding connection timeouts.

## How to Configure Render

### Option 1: Use Build Command (Recommended)
In Render dashboard → Your Service → Settings → Build Command:
```bash
pip install --upgrade pip && pip install -r requirements-render.txt
```

### Option 2: Use Build Script
In Render dashboard → Your Service → Settings → Build Command:
```bash
bash render-build.sh
```

## What's Excluded from requirements-render.txt
- `torch`, `torchaudio`, `torchvision` (~500MB each) - Modal handles AI
- `transformers` - Modal handles AI
- `sentence-transformers` - Modal handles embeddings (fallback uses lazy import)
- `accelerate` - Only for local ML
- `huggingface-hub` - Only for local model loading
- `safetensors`, `tokenizers` - Only for local models

## What's Included
- FastAPI and web server
- Database drivers (PostgreSQL, pgvector)
- Redis client
- Monitoring (Sentry, Prometheus)
- All core utilities

## Fallback Behavior
The code already handles missing PyTorch gracefully:
- Lazy imports with try/except blocks
- Falls back to Modal services if local models unavailable
- No errors if PyTorch is missing (only used for local fallback)

## Local Development
For local development, continue using `requirements.txt` (includes PyTorch for local fallback).

