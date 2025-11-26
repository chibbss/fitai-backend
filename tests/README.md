# FitAI Test Suite

Production-grade test organization for FitAI backend.

## Structure

```
tests/
├── unit/              # Fast, isolated unit tests
│   └── test_memory.py
├── integration/       # API endpoint and component integration tests
│   └── (future tests)
├── e2e/              # End-to-end production tests
│   ├── production_e2e_test.py  # Full user journey (John Doe simulation)
│   ├── test_chat_retry.py      # AI chatbot retry logic & streaming tests
│   ├── smoke_test.sh            # Quick health checks
│   └── end_to_end_test.sh      # Comprehensive E2E test
├── fixtures/         # Test data and fixtures
└── utils/            # Test utilities and helpers
```

## Running Tests

### All Tests
```bash
./scripts/run_all_tests.sh
```

### Individual Suites
```bash
# Unit tests
pytest tests/unit/ -v

# Integration tests
pytest tests/integration/ -v

# E2E tests
python3 tests/e2e/production_e2e_test.py

# Chat/Retry tests (dedicated AI chatbot testing)
python3 tests/e2e/test_chat_retry.py

# Smoke tests
bash tests/e2e/smoke_test.sh
```

## Test Results

Results are saved to `tests/results/`:
- `smoke_test_results.md` - Smoke test report
- `e2e_test_results.json` - Detailed E2E test results
- `chat_test_results.json` - AI chatbot retry & streaming test results
- `e2e_test_final.log` - E2E test execution log
- `e2e_test_output.log` - E2E test output log
- `coverage/` - Code coverage reports (future)

## Notes

- E2E tests require `SUPABASE_JWT_SECRET` env var
- Smoke tests require backend to be deployed
- Unit tests are fast and can run locally

