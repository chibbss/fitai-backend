#!/bin/bash
# Build script for Render deployment
# Uses lightweight requirements-render.txt (excludes PyTorch)

set -e

echo "Using lightweight requirements for Render (Modal handles AI inference)..."

# Install from lightweight requirements
pip install --upgrade pip
pip install -r requirements-render.txt

echo "Build complete!"

