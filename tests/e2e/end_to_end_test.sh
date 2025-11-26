#!/bin/bash

# FitAI End-to-End Test Script
# Tests full user flow with authentication

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
BACKEND_URL="https://fitai-api.onrender.com"
AUTH_TOKEN="${AUTH_TOKEN:-}"

PASSED=0
FAILED=0
SKIPPED=0

test_endpoint() {
    local name=$1
    local method=$2
    local url=$3
    local data=$4
    local expected_status=${5:-200}
    local requires_auth=${6:-false}
    
    if [ "$requires_auth" = "true" ] && [ -z "$AUTH_TOKEN" ]; then
        echo -e "${YELLOW}⊘ SKIP${NC} $name (no auth token provided)"
        ((SKIPPED++))
        return 2
    fi
    
    echo -n "Testing $name... "
    
    headers=(-H "Content-Type: application/json")
    if [ -n "$AUTH_TOKEN" ]; then
        headers+=(-H "Authorization: Bearer $AUTH_TOKEN")
    fi
    
    if [ -z "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X $method "$url" \
            "${headers[@]}" \
            --max-time 60 2>&1)
    else
        response=$(curl -s -w "\n%{http_code}" -X $method "$url" \
            "${headers[@]}" \
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
        echo "  Response: $body" | head -c 300
        echo ""
        ((FAILED++))
        return 1
    fi
}

echo "=========================================="
echo "FitAI End-to-End Test"
echo "=========================================="
echo "Backend: $BACKEND_URL"
if [ -z "$AUTH_TOKEN" ]; then
    echo -e "${YELLOW}⚠ No AUTH_TOKEN provided - auth-required tests will be skipped${NC}"
    echo "  Set AUTH_TOKEN env var to run full tests"
    echo "  Example: AUTH_TOKEN=your_token ./end_to_end_test.sh"
fi
echo ""

# 1. Health Checks
echo -e "${BLUE}1. Pre-flight Checks${NC}"
echo "-------------------"
test_endpoint "Backend Health" "GET" "$BACKEND_URL/health"
test_endpoint "Backend Readiness" "GET" "$BACKEND_URL/readiness"
echo ""

# 2. User Management
echo -e "${BLUE}2. User Management${NC}"
echo "-------------------"
if [ -n "$AUTH_TOKEN" ]; then
    # Try to get user (will fail if user doesn't exist, but tests auth)
    echo -n "Testing authenticated user endpoint... "
    user_response=$(curl -s -w "\n%{http_code}" -X GET "$BACKEND_URL/users/test-user-id" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -H "Content-Type: application/json" \
        --max-time 10 2>&1)
    user_code=$(echo "$user_response" | tail -n1)
    if [ "$user_code" -eq 404 ] || [ "$user_code" -eq 200 ]; then
        echo -e "${GREEN}✓ PASS${NC} (HTTP $user_code - auth working)"
        ((PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC} (HTTP $user_code)"
        ((FAILED++))
    fi
else
    echo -e "${YELLOW}⊘ SKIP${NC} User management tests (no auth token)"
    ((SKIPPED++))
fi
echo ""

# 3. Onboarding
echo -e "${BLUE}3. Onboarding Flow${NC}"
echo "-------------------"
if [ -n "$AUTH_TOKEN" ]; then
    # Test onboarding step (will create/update user)
    test_endpoint "Onboarding Step" "POST" "$BACKEND_URL/onboarding_step" \
        '{
            "user_id": "test-user-'$(date +%s)'",
            "step": "goal",
            "data": {"primary_goal": "build_muscle"}
        }' 200 true
else
    echo -e "${YELLOW}⊘ SKIP${NC} Onboarding tests (no auth token)"
    ((SKIPPED++))
fi
echo ""

# 4. Workout Logging
echo -e "${BLUE}4. Workout Logging${NC}"
echo "-------------------"
if [ -n "$AUTH_TOKEN" ]; then
    test_endpoint "Log Workout" "POST" "$BACKEND_URL/log/workout" \
        '{
            "user_id": "test-user",
            "exercises": [
                {
                    "name": "Bench Press",
                    "sets": [
                        {"reps": 10, "weight_kg": 60},
                        {"reps": 8, "weight_kg": 65}
                    ],
                    "muscle_groups": ["chest", "triceps"]
                }
            ],
            "notes": "Test workout"
        }' 200 true
else
    echo -e "${YELLOW}⊘ SKIP${NC} Workout logging tests (no auth token)"
    ((SKIPPED++))
fi
echo ""

# 5. Calendar & Stats
echo -e "${BLUE}5. Calendar & Stats${NC}"
echo "-------------------"
if [ -n "$AUTH_TOKEN" ]; then
    test_endpoint "Get Calendar" "GET" "$BACKEND_URL/workouts/calendar?user_id=test-user" "" 200 true
    test_endpoint "Get Weekly Summary" "GET" "$BACKEND_URL/workouts/weekly-summary?user_id=test-user" "" 200 true
else
    echo -e "${YELLOW}⊘ SKIP${NC} Calendar/Stats tests (no auth token)"
    ((SKIPPED++))
fi
echo ""

# 6. Chat (AI Coach)
echo -e "${BLUE}6. AI Chat${NC}"
echo "-------------------"
if [ -n "$AUTH_TOKEN" ]; then
    echo -n "Testing chat stream (may take 10-30s for cold start)... "
    chat_response=$(curl -s -X POST "$BACKEND_URL/chat_stream" \
        -H "Authorization: Bearer $AUTH_TOKEN" \
        -H "Content-Type: application/json" \
        -d '{
            "user_id": "test-user",
            "message": "Hello, what should I do today?",
            "stream": true
        }' \
        --max-time 90 2>&1)
    
    if echo "$chat_response" | grep -q "data:" || echo "$chat_response" | grep -q "message\|response"; then
        echo -e "${GREEN}✓ PASS${NC}"
        ((PASSED++))
    else
        echo -e "${YELLOW}⚠ WARN${NC} (may be cold start or error)"
        echo "  Response: $chat_response" | head -c 200
        echo ""
        ((FAILED++))
    fi
else
    echo -e "${YELLOW}⊘ SKIP${NC} Chat tests (no auth token)"
    ((SKIPPED++))
fi
echo ""

# Summary
echo "=========================================="
echo -e "${BLUE}Test Summary${NC}"
echo "=========================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $SKIPPED -gt 0 ]; then
    echo -e "${YELLOW}Skipped: $SKIPPED${NC}"
fi
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
fi
echo ""

if [ $FAILED -eq 0 ] && [ $SKIPPED -eq 0 ]; then
    echo -e "${GREEN}✓ All end-to-end tests passed!${NC}"
    exit 0
elif [ $FAILED -eq 0 ]; then
    echo -e "${YELLOW}⚠ Tests passed (some skipped due to missing auth)${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed. Review output above.${NC}"
    exit 1
fi

