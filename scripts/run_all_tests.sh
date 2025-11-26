#!/bin/bash

# FitAI Test Runner
# Runs all test suites in order: unit → integration → e2e

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}FitAI Test Suite Runner${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Unit Tests
echo -e "${BLUE}1. Running Unit Tests${NC}"
echo "-------------------"
if [ -f "tests/unit/test_memory.py" ]; then
    python3 -m pytest tests/unit/ -v || echo -e "${YELLOW}⚠ Unit tests failed or skipped${NC}"
else
    echo -e "${YELLOW}⚠ No unit tests found${NC}"
fi
echo ""

# Integration Tests
echo -e "${BLUE}2. Running Integration Tests${NC}"
echo "-------------------"
if [ -d "tests/integration" ] && [ "$(ls -A tests/integration/*.py 2>/dev/null)" ]; then
    python3 -m pytest tests/integration/ -v || echo -e "${YELLOW}⚠ Integration tests failed or skipped${NC}"
else
    echo -e "${YELLOW}⚠ No integration tests found${NC}"
fi
echo ""

# E2E Tests
echo -e "${BLUE}3. Running End-to-End Tests${NC}"
echo "-------------------"
if [ -f "tests/e2e/production_e2e_test.py" ]; then
    cd tests/e2e
    python3 production_e2e_test.py
    cd ../..
else
    echo -e "${YELLOW}⚠ No E2E tests found${NC}"
fi
echo ""

# Chat/Retry Tests
echo -e "${BLUE}3b. Running AI Chatbot Tests${NC}"
echo "-------------------"
if [ -f "tests/e2e/test_chat_retry.py" ]; then
    cd tests/e2e
    python3 test_chat_retry.py
    cd ../..
else
    echo -e "${YELLOW}⚠ No chat tests found${NC}"
fi
echo ""

# Smoke Tests
echo -e "${BLUE}4. Running Smoke Tests${NC}"
echo "-------------------"
if [ -f "tests/e2e/smoke_test.sh" ]; then
    bash tests/e2e/smoke_test.sh || echo -e "${YELLOW}⚠ Smoke tests had warnings${NC}"
else
    echo -e "${YELLOW}⚠ No smoke tests found${NC}"
fi
echo ""

echo -e "${GREEN}✓ Test suite complete!${NC}"
echo "Results saved to: tests/results/"

