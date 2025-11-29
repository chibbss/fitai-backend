#!/bin/bash
# Quick load test runner for FitAI
# Usage: ./run_load_test.sh [users] [spawn_rate] [duration]

set -e

# Default values
USERS=${1:-10}
SPAWN_RATE=${2:-2}
DURATION=${3:-5m}

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}FitAI Load Test${NC}"
echo -e "${BLUE}========================================${NC}"
echo -e "Users: ${GREEN}${USERS}${NC}"
echo -e "Spawn Rate: ${GREEN}${SPAWN_RATE}/s${NC}"
echo -e "Duration: ${GREEN}${DURATION}${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if locust is installed
if ! command -v locust &> /dev/null; then
    echo "ERROR: Locust not installed. Install with: pip install locust"
    exit 1
fi

# Check if SUPABASE_JWT_SECRET is set
if [ -z "$SUPABASE_JWT_SECRET" ]; then
    echo "WARNING: SUPABASE_JWT_SECRET not set. Load tests may fail."
    echo "Set it with: export SUPABASE_JWT_SECRET=your_secret"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Run the test
locust -f tests/load/locustfile.py \
  --headless \
  --host=https://fitai-api.onrender.com \
  -u ${USERS} \
  -r ${SPAWN_RATE} \
  -t ${DURATION} \
  --csv=load_test_results \
  --html=load_test_report.html

echo ""
echo -e "${GREEN}✓ Load test complete!${NC}"
echo -e "Results saved to:"
echo -e "  - load_test_results_stats.csv"
echo -e "  - load_test_results_failures.csv"
echo -e "  - load_test_results_exceptions.csv"
echo -e "  - load_test_report.html"

