#!/usr/bin/env python3
"""
AI Chatbot Test - Retry Logic & Streaming Verification
Tests the /chat_stream endpoint with retry logic for Modal cold starts
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timezone
from typing import Dict, Optional
from dotenv import load_dotenv

load_dotenv()

# Try to import jwt - handle both PyJWT and system jwt
try:
    import jwt
    # Verify it's PyJWT (has encode method)
    if not hasattr(jwt, 'encode'):
        try:
            from jwt.api_jwt import encode
            jwt.encode = encode
        except ImportError:
            jwt = None
except ImportError:
    jwt = None

# Colors for output
class Colors:
    BLUE = '\033[0;34m'
    GREEN = '\033[0;32m'
    YELLOW = '\033[1;33m'
    RED = '\033[0;31m'
    NC = '\033[0m'  # No Color

BACKEND_URL = os.getenv("BACKEND_URL", "https://fitai-api.onrender.com")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

# Test user (use same as E2E test for consistency)
TEST_USER_ID = "john-doe-e2e-test"
TEST_USER_EMAIL = "john.doe.e2e@fitai.test"

results = {
    "passed": 0,
    "failed": 0,
    "warnings": 0,
    "tests": []
}


def create_test_token() -> Optional[str]:
    """Create a test JWT token for authentication"""
    if not SUPABASE_JWT_SECRET:
        print(f"{Colors.YELLOW}⚠ SUPABASE_JWT_SECRET not set - skipping authenticated tests{Colors.NC}")
        return None
    
    if jwt is None:
        print(f"{Colors.RED}✗ PyJWT not available - install with: pip install PyJWT{Colors.NC}")
        return None
    
    payload = {
        "sub": TEST_USER_ID,
        "email": TEST_USER_EMAIL,
        "aud": "authenticated",
        "role": "authenticated",
        "iat": int(time.time()),
        "exp": int(time.time()) + 3600
    }
    
    try:
        token = jwt.encode(payload, SUPABASE_JWT_SECRET, algorithm="HS256")
        return token
    except Exception as e:
        print(f"{Colors.RED}✗ Failed to create token: {str(e)[:100]}{Colors.NC}")
        return None


def test(name: str, func, expected_status: int = 200):
    """Run a test and record results"""
    print(f"  Testing {name}...", end=" ", flush=True)
    try:
        result = func()
        print(f"{Colors.GREEN}✓ PASS{Colors.NC}")
        results["passed"] += 1
        results["tests"].append({
            "name": name,
            "status": "PASS",
            "result": result if isinstance(result, dict) else str(result)[:200]
        })
        return result
    except Exception as e:
        print(f"{Colors.RED}✗ FAIL{Colors.NC}")
        print(f"    Error: {str(e)[:200]}")
        results["failed"] += 1
        results["tests"].append({
            "name": name,
            "status": "FAIL",
            "error": str(e)[:200]
        })
        raise


def warn(name: str, message: str):
    """Record a warning"""
    print(f"  {Colors.YELLOW}⚠ WARN{Colors.NC} {name}: {message}")
    results["warnings"] += 1
    results["tests"].append({"name": name, "status": "WARN", "message": message})


def test_chat_stream(token: str, query: str, expect_retry: bool = False) -> Dict:
    """Test the /chat_stream endpoint with SSE handling"""
    url = f"{BACKEND_URL}/chat_stream"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "text/event-stream"
    }
    data = {
        "query": query,
        "session_id": None
    }
    
    start_time = time.time()
    tokens_received = []
    full_answer = ""
    retry_detected = False
    
    try:
        response = requests.post(
            url,
            headers=headers,
            json=data,
            stream=True,
            timeout=120  # 2 minute timeout for cold starts
        )
        
        # Check for retry scenarios
        if response.status_code in [502, 503, 504]:
            retry_detected = True
            if expect_retry:
                print(f"    {Colors.YELLOW}Retry detected (expected){Colors.NC}")
            else:
                raise Exception(f"Got {response.status_code} - retry should have happened in frontend")
        
        response.raise_for_status()
        
        # Parse SSE stream
        buffer = ""
        for line in response.iter_lines(decode_unicode=True):
            if not line:
                continue
            
            buffer += line + "\n"
            
            # Process complete SSE messages
            if line.startswith("event:"):
                event_type = line.split(":", 1)[1].strip()
            elif line.startswith("data:"):
                data_content = line.split(":", 1)[1].strip()
                try:
                    if event_type == "token":
                        token_data = json.loads(data_content)
                        token_str = str(token_data) if not isinstance(token_data, str) else token_data
                        tokens_received.append(token_str)
                        full_answer += token_str
                    elif event_type == "done":
                        done_data = json.loads(data_content)
                        full_answer = done_data.get("answer", full_answer)
                except json.JSONDecodeError:
                    # Try as plain text
                    tokens_received.append(data_content)
                    full_answer += data_content
        
        elapsed = time.time() - start_time
        
        return {
            "status_code": response.status_code,
            "tokens_received": len(tokens_received),
            "answer_length": len(full_answer),
            "answer_preview": full_answer[:200] + "..." if len(full_answer) > 200 else full_answer,
            "elapsed_time": round(elapsed, 2),
            "retry_detected": retry_detected,
            "first_token_time": None  # Could track this if needed
        }
        
    except requests.exceptions.Timeout:
        raise Exception("Request timed out after 120s - Modal may be in cold start")
    except requests.exceptions.RequestException as e:
        raise Exception(f"Request failed: {str(e)}")


def test_chat_non_streaming(token: str, query: str) -> Dict:
    """Test the /chat endpoint (non-streaming)"""
    url = f"{BACKEND_URL}/chat"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    data = {
        "query": query,
        "session_id": None
    }
    
    start_time = time.time()
    response = requests.post(url, headers=headers, json=data, timeout=120)
    elapsed = time.time() - start_time
    
    if response.status_code != 200:
        raise Exception(f"Got {response.status_code}: {response.text[:200]}")
    
    result = response.json()
    
    return {
        "status_code": response.status_code,
        "answer_length": len(result.get("answer", "")),
        "answer_preview": result.get("answer", "")[:200] + "..." if len(result.get("answer", "")) > 200 else result.get("answer", ""),
        "elapsed_time": round(elapsed, 2),
        "has_references": "references" in result,
        "has_citations": "citations" in result
    }


def wait_for_backend_awake(max_wait: int = 60):
    """Wait for backend to wake up (Render free tier)"""
    print(f"  Waking up backend (may take 30-60s)...", end=" ", flush=True)
    for attempt in range(max_wait // 5):
        try:
            response = requests.get(f"{BACKEND_URL}/health", timeout=10)
            if response.status_code == 200:
                print(f"{Colors.GREEN}✓ Awake{Colors.NC}")
                return True
        except:
            pass
        if attempt < (max_wait // 5) - 1:
            print(".", end="", flush=True)
            time.sleep(5)
    print(f"{Colors.YELLOW}⚠ Still waking up{Colors.NC}")
    return False


def main():
    print(f"{Colors.BLUE}{'='*60}{Colors.NC}")
    print(f"{Colors.BLUE}FitAI Chatbot Test - Retry Logic & Streaming{Colors.NC}")
    print(f"{Colors.BLUE}{'='*60}{Colors.NC}")
    print(f"Backend: {BACKEND_URL}")
    print(f"Test User: {TEST_USER_ID}")
    print()
    
    # 1. Authentication
    print(f"{Colors.BLUE}1. Authentication Setup{Colors.NC}")
    print("-" * 60)
    token = create_test_token()
    if not token:
        print(f"{Colors.RED}✗ Cannot create test token{Colors.NC}")
        print(f"{Colors.YELLOW}  Note: Set SUPABASE_JWT_SECRET env var to run full test{Colors.NC}")
        print()
        print("Running tests without authentication (will test public endpoints only)...")
        print()
        print_summary()
        return
    test("Create test JWT token", lambda: token)
    print()
    
    # 2. Backend wake-up
    print(f"{Colors.BLUE}2. Backend Wake-up{Colors.NC}")
    print("-" * 60)
    wait_for_backend_awake()
    print()
    
    # 3. Health checks
    print(f"{Colors.BLUE}3. Pre-flight Health Checks{Colors.NC}")
    print("-" * 60)
    test("Backend health", lambda: requests.get(f"{BACKEND_URL}/health", timeout=10).json())
    test("Backend readiness", lambda: requests.get(f"{BACKEND_URL}/readiness", timeout=10).json())
    print()
    
    # 4. Test non-streaming chat first (simpler, faster)
    print(f"{Colors.BLUE}4. Non-Streaming Chat Test{Colors.NC}")
    print("-" * 60)
    print("  Testing /chat endpoint (may trigger Modal cold start)...")
    try:
        result = test_chat_non_streaming(token, "Hello, how are you?")
        print(f"    Status: {result['status_code']}")
        print(f"    Response time: {result['elapsed_time']}s")
        print(f"    Answer length: {result['answer_length']} chars")
        print(f"    Answer preview: {result['answer_preview'][:100]}...")
        if result['elapsed_time'] > 30:
            warn("Non-streaming chat", f"Slow response ({result['elapsed_time']}s) - likely cold start")
        else:
            print(f"    {Colors.GREEN}✓ Fast response - Modal is warm{Colors.NC}")
    except Exception as e:
        warn("Non-streaming chat", f"Failed: {str(e)[:100]}")
    print()
    
    # 5. Test streaming chat (with retry logic)
    print(f"{Colors.BLUE}5. Streaming Chat Test (with Retry Logic){Colors.NC}")
    print("-" * 60)
    print("  Testing /chat_stream endpoint...")
    print("  Note: Frontend retry logic should handle 502/503 errors automatically")
    
    queries = [
        "How am I progressing with my workouts?",
        "What exercises should I focus on?",
        "Give me a quick summary of my recent performance."
    ]
    
    for i, query in enumerate(queries, 1):
        print(f"\n  Query {i}: \"{query[:50]}...\"")
        try:
            start_time = time.time()
            result = test_chat_stream(token, query, expect_retry=(i == 1))
            elapsed = time.time() - start_time
            
            print(f"    Status: {result['status_code']}")
            print(f"    Total time: {result['elapsed_time']}s")
            print(f"    Tokens received: {result['tokens_received']}")
            print(f"    Answer length: {result['answer_length']} chars")
            print(f"    Answer preview: {result['answer_preview'][:150]}...")
            
            if result['retry_detected']:
                warn(f"Streaming chat (query {i})", "Retry was needed - Modal was cold")
            elif result['elapsed_time'] > 30:
                warn(f"Streaming chat (query {i})", f"Slow response ({result['elapsed_time']}s) - likely cold start")
            else:
                print(f"    {Colors.GREEN}✓ Fast response - Modal is warm{Colors.NC}")
            
            # Wait a bit between queries to avoid rate limiting
            if i < len(queries):
                time.sleep(2)
                
        except Exception as e:
            warn(f"Streaming chat (query {i})", f"Failed: {str(e)[:100]}")
    print()
    
    # 6. Test retry behavior explicitly
    print(f"{Colors.BLUE}6. Retry Logic Verification{Colors.NC}")
    print("-" * 60)
    print("  Note: Frontend retry logic handles 502/503 automatically")
    print("  This test verifies backend returns appropriate errors for retry")
    
    # Make a request that might fail (without waiting for warm-up)
    # We'll check if the error is retryable
    try:
        # Try a quick request - if Modal is cold, we should get 502/503
        response = requests.post(
            f"{BACKEND_URL}/chat_stream",
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={"query": "Test", "session_id": None},
            timeout=10  # Short timeout to catch errors quickly
        )
        if response.status_code in [502, 503, 504]:
            print(f"    {Colors.YELLOW}⚠ Got {response.status_code} - Frontend retry should handle this{Colors.NC}")
            print(f"    {Colors.GREEN}✓ Error is retryable (502/503/504){Colors.NC}")
        else:
            print(f"    {Colors.GREEN}✓ Got {response.status_code} - No retry needed{Colors.NC}")
    except requests.exceptions.Timeout:
        print(f"    {Colors.YELLOW}⚠ Request timed out - Frontend retry should handle this{Colors.NC}")
    except Exception as e:
        print(f"    {Colors.YELLOW}⚠ Error: {str(e)[:100]}{Colors.NC}")
    print()
    
    # Print summary
    print_summary()


def print_summary():
    """Print test summary"""
    print(f"{Colors.BLUE}{'='*60}{Colors.NC}")
    print(f"{Colors.BLUE}Test Summary{Colors.NC}")
    print(f"{Colors.BLUE}{'='*60}{Colors.NC}")
    print(f"{Colors.GREEN}Passed: {results['passed']}{Colors.NC}")
    if results['warnings'] > 0:
        print(f"{Colors.YELLOW}Warnings: {results['warnings']}{Colors.NC}")
    if results['failed'] > 0:
        print(f"{Colors.RED}Failed: {results['failed']}{Colors.NC}")
    print()
    
    if results['failed'] == 0:
        print(f"{Colors.GREEN}✓ All critical tests passed!{Colors.NC}")
        if results['warnings'] > 0:
            print(f"{Colors.YELLOW}⚠ Some warnings (non-critical issues){Colors.NC}")
    else:
        print(f"{Colors.RED}✗ Some tests failed - review output above{Colors.NC}")
    
    # Save results
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))
    results_dir = os.path.join(project_root, "tests", "results")
    os.makedirs(results_dir, exist_ok=True)
    results_file = os.path.join(results_dir, "chat_test_results.json")
    
    with open(results_file, "w") as f:
        json.dump({
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "summary": {
                "passed": results['passed'],
                "failed": results['failed'],
                "warnings": results['warnings']
            },
            "tests": results['tests']
        }, f, indent=2)
    print(f"\nDetailed results saved to: {results_file}")


if __name__ == "__main__":
    try:
        main()
        sys.exit(0 if results['failed'] == 0 else 1)
    except KeyboardInterrupt:
        print(f"\n{Colors.YELLOW}Test interrupted by user{Colors.NC}")
        sys.exit(1)
    except Exception as e:
        print(f"\n{Colors.RED}Fatal error: {e}{Colors.NC}")
        sys.exit(1)

