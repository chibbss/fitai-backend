#!/bin/bash

# FitAI Smoke Test Script
# Tests all critical endpoints and services

set -e  # Exit on error

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_URL="https://fitai-api.onrender.com"
VLLM_URL="https://chibbss--fitai-vllm-serve.modal.run"
EMBED_URL="https://chibbss--fitai-embed-serve.modal.run"

# Test counter
PASSED=0
FAILED=0
WARNINGS=0

# Helper function
test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    local expected_status=${5:-200}
    
    echo -n "Testing $name... "
    
    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method "$url" \
            -H "Content-Type: application/json" \
            --max-time 30 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$url" \
            -H "Content-Type: application/json" \
            -d "$data" \
            --max-time 60 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -eq "$expected_status" ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $http_code)"
        ((PASSED++))
        return 0
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $http_code, expected $expected_status)"
        echo "  Response: $body" | head -c 200
        echo ""
        ((FAILED++))
        return 1
    fi
}

echo "=========================================="
echo "FitAI Smoke Test"
echo "=========================================="
echo "Backend: $BACKEND_URL"
echo "vLLM: $VLLM_URL"
echo "Embed: $EMBED_URL"
echo ""

# 1. Backend Health Checks
echo -e "${BLUE}1. Backend Health Checks${NC}"
echo "-----------------------"
test_endpoint "Backend Health" "GET" "$BACKEND_URL/health"
test_endpoint "Backend Readiness" "GET" "$BACKEND_URL/readiness"
echo ""

# 2. Modal Services Health
echo -e "${BLUE}2. Modal Services Health${NC}"
echo "------------------------"
test_endpoint "vLLM Health" "GET" "$VLLM_URL/health"
test_endpoint "Embedding Health" "GET" "$EMBED_URL/health"
echo ""

# 3. Test Modal Services Directly
echo -e "${BLUE}3. Modal Services Direct Tests${NC}"
echo "------------------------------"

# Test Embedding Service
echo -n "Testing Embedding Service... "
embed_response=$(curl -s -X POST "$EMBED_URL/embed" \
    -H "Content-Type: application/json" \
    -d '{"texts": ["test workout"]}' \
    --max-time 30 2>&1)
if echo "$embed_response" | grep -q "embedding"; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "  Response: $embed_response" | head -c 200
    echo ""
    ((FAILED++))
fi

# Test vLLM Service (may have cold start)
echo -n "Testing vLLM Service (may take 10-30s for cold start)... "
vllm_response=$(curl -s -X POST "$VLLM_URL/v1/chat/completions" \
    -H "Content-Type: application/json" \
    -d '{
        "model": "meta-llama/Llama-3.1-8B-Instruct",
        "messages": [{"role": "user", "content": "Say hello"}],
        "max_tokens": 20
    }' \
    --max-time 60 2>&1)
if echo "$vllm_response" | grep -q "choices"; then
    echo -e "${GREEN}✓ PASS${NC}"
    ((PASSED++))
elif echo "$vllm_response" | grep -qi "timeout\|cold\|starting"; then
    echo -e "${YELLOW}⚠ WARN${NC} (cold start - service may be starting)"
    echo "  Response: $vllm_response" | head -c 200
    echo ""
    ((WARNINGS++))
else
    echo -e "${RED}✗ FAIL${NC}"
    echo "  Response: $vllm_response" | head -c 200
    echo ""
    ((FAILED++))
fi
echo ""

# 4. Backend Endpoints (No Auth Required)
echo -e "${BLUE}4. Backend Public Endpoints${NC}"
echo "---------------------------"
test_endpoint "API Docs" "GET" "$BACKEND_URL/docs" "" 200
echo ""

# 5. Backend Endpoints (Auth Required - should return 401/403, not 500)
echo -e "${BLUE}5. Backend Protected Endpoints (Auth Check)${NC}"
echo "--------------------------------------------"
test_endpoint "Get User (no auth)" "GET" "$BACKEND_URL/users/test-user" "" 401
test_endpoint "Log Workout (no auth)" "POST" "$BACKEND_URL/log/workout" \
    '{"user_id":"test","exercises":[]}' 401
test_endpoint "Chat Stream (no auth)" "POST" "$BACKEND_URL/chat_stream" \
    '{"user_id":"test","message":"hello"}' 401
echo ""

# 6. Test Backend -> Modal Integration (if we have a way to test)
echo -e "${BLUE}6. Backend Configuration Check${NC}"
echo "--------------------------------"
echo -n "Checking if backend can reach Modal services... "
# This is a basic check - we can't fully test without auth
backend_health=$(curl -s "$BACKEND_URL/readiness" 2>&1)
if echo "$backend_health" | grep -q "ready\|ok"; then
    echo -e "${GREEN}✓ Backend is ready${NC}"
    ((PASSED++))
else
    echo -e "${YELLOW}⚠ Backend readiness unclear${NC}"
    echo "  Response: $backend_health"
    ((WARNINGS++))
fi
echo ""

# Summary
echo "=========================================="
echo -e "${BLUE}Test Summary${NC}"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
fi
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
fi
echo ""

if [ $FAILED -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All smoke tests passed!${NC}"
    exit 0
elif [ $FAILED -eq 0 ]; then
    echo -e "${YELLOW}⚠ Tests passed with warnings (likely cold starts)${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Review output above.${NC}"
    exit 1
fi

