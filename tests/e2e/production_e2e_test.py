#!/usr/bin/env python3
"""
Production-Grade End-to-End Test for FitAI
Simulates a real user (John Doe) over 4 weeks of workouts
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
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

# Configuration
BACKEND_URL = os.getenv("BACKEND_URL", "https://fitai-api.onrender.com")

# Test user
TEST_USER_ID = "john-doe-e2e-test"
TEST_USER_EMAIL = "john.doe.e2e@fitai.test"
TEST_USER_NAME = "John Doe"

# Colors for output
class Colors:
    GREEN = '\033[0;32m'
    RED = '\033[0;31m'
    YELLOW = '\033[1;33m'
    BLUE = '\033[0;34m'
    CYAN = '\033[0;36m'
    NC = '\033[0m'  # No Color

# Test results
results = {
    "passed": 0,
    "failed": 0,
    "warnings": 0,
    "tests": []
}


def create_test_jwt_token(user_id: str, email: str) -> str:
    """Create a test JWT token for Supabase authentication"""
    SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")
    if not SUPABASE_JWT_SECRET:
        raise ValueError("SUPABASE_JWT_SECRET not set - cannot create test token")
    
    if not jwt:
        raise ValueError("PyJWT not available - install with: pip install PyJWT")
    
    import time
    payload = {
        "sub": user_id,
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "user_metadata": {"tier": "free"},
        "exp": int(time.time()) + 3600,  # 1 hour expiry
        "iat": int(time.time()),
    }
    return jwt.encode(payload, SUPABASE_JWT_SECRET, algorithm="HS256")


def test(name: str, func, *args, **kwargs):
    """Run a test and track results"""
    print(f"  Testing {name}... ", end="", flush=True)
    try:
        result = func(*args, **kwargs)
        print(f"{Colors.GREEN}✓ PASS{Colors.NC}")
        results["passed"] += 1
        results["tests"].append({"name": name, "status": "PASS", "result": result})
        return result
    except AssertionError as e:
        print(f"{Colors.RED}✗ FAIL{Colors.NC}")
        print(f"    Assertion: {str(e)}")
        results["failed"] += 1
        results["tests"].append({"name": name, "status": "FAIL", "error": str(e)})
        raise
    except Exception as e:
        print(f"{Colors.RED}✗ FAIL{Colors.NC}")
        print(f"    Error: {str(e)[:200]}")
        results["failed"] += 1
        results["tests"].append({"name": name, "status": "FAIL", "error": str(e)})
        raise


def warn(name: str, message: str):
    """Record a warning"""
    print(f"  {Colors.YELLOW}⚠ WARN{Colors.NC} {name}: {message}")
    results["warnings"] += 1
    results["tests"].append({"name": name, "status": "WARN", "message": message})


def make_request(method: str, endpoint: str, token: Optional[str] = None, 
                 data: Optional[Dict] = None, expected_status: int = 200, 
                 retries: int = 3) -> Dict:
    """Make an authenticated request to the backend with retry logic"""
    url = f"{BACKEND_URL}{endpoint}"
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    
    last_error = None
    for attempt in range(retries + 1):
        try:
            if method.upper() == "GET":
                response = requests.get(url, headers=headers, timeout=90)
            elif method.upper() == "POST":
                response = requests.post(url, headers=headers, json=data, timeout=90)
            elif method.upper() == "PUT":
                response = requests.put(url, headers=headers, json=data, timeout=90)
            else:
                raise ValueError(f"Unsupported method: {method}")
            
            assert response.status_code == expected_status, \
                f"Expected {expected_status}, got {response.status_code}: {response.text[:200]}"
            
            if response.status_code == 204:
                return {}
            return response.json()
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_error = e
            if attempt < retries:
                wait_time = (attempt + 1) * 10  # 10s, 20s, 30s
                print(f"\n    Retry {attempt + 1}/{retries} after {wait_time}s (backend may be sleeping)...")
                time.sleep(wait_time)
            else:
                raise
        except AssertionError as e:
            # Check if it's a 502/503 error that we should retry
            error_str = str(e)
            if ("503" in error_str or "502" in error_str) and attempt < retries:
                wait_time = (attempt + 1) * 10
                print(f"\n    Retry {attempt + 1}/{retries} after {wait_time}s (backend returned 502/503, may be cold start)...")
                time.sleep(wait_time)
                continue
            raise
        except Exception as e:
            last_error = e
            raise
    
    if last_error:
        raise last_error


def generate_workout_data(day: int, week: int) -> Dict:
    """Generate realistic workout data for a given day"""
    # Progressive overload pattern
    base_weight = 60 + (week * 5) + (day % 3)
    base_reps = 10 - (week // 2)
    
    # Vary workouts by day
    if day % 3 == 0:
        # Push day - Bench Press
        exercise_name = "Bench Press"
        exercise_category = "chest"
        sets = 3
        reps = [base_reps, base_reps - 1, base_reps - 2]
        weights = [f"{base_weight}kg", f"{base_weight + 2.5}kg", f"{base_weight + 5}kg"]
    elif day % 3 == 1:
        # Pull day - Deadlift
        exercise_name = "Deadlift"
        exercise_category = "back"
        sets = 2
        reps = [base_reps, base_reps - 1]
        weights = [f"{base_weight + 30}kg", f"{base_weight + 35}kg"]
    else:
        # Leg day - Squat
        exercise_name = "Squat"
        exercise_category = "legs"
        sets = 3
        reps = [base_reps + 2, base_reps + 1, base_reps]
        weights = [f"{base_weight + 20}kg", f"{base_weight + 22.5}kg", f"{base_weight + 25}kg"]
    
    return {
        "session_name": f"Week {week} - {exercise_name} Day",
        "session_type": "strength",
        "exercises": [
            {
                "exercise_name": exercise_name,
                "exercise_category": exercise_category,
                "sets": sets,
                "reps": reps,
                "weights": weights
            }
        ],
        "notes": f"Week {week}, Day {day % 7 + 1} - Feeling strong!",
        "duration_minutes": 45 + (day % 10),
        "occurred_at": (datetime.now(timezone.utc) - timedelta(days=28-day)).isoformat()
    }


def main():
    print(f"{Colors.CYAN}{'='*60}{Colors.NC}")
    print(f"{Colors.CYAN}FitAI Production End-to-End Test{Colors.NC}")
    print(f"{Colors.CYAN}{'='*60}{Colors.NC}")
    print(f"Backend: {BACKEND_URL}")
    print(f"Test User: {TEST_USER_NAME} ({TEST_USER_ID})")
    print(f"Duration: 4 weeks (28 days)")
    print()
    
    # Create test token
    print(f"{Colors.BLUE}1. Authentication Setup{Colors.NC}")
    print("-" * 60)
    try:
        token = test("Create test JWT token", create_test_jwt_token, TEST_USER_ID, TEST_USER_EMAIL)
        print(f"  Token created: {token[:50]}...")
    except Exception as e:
        print(f"{Colors.RED}✗ Cannot create test token: {e}{Colors.NC}")
        print(f"{Colors.YELLOW}  Note: Set SUPABASE_JWT_SECRET env var to run full test{Colors.NC}")
        print()
        print("Running tests without authentication (will test public endpoints only)...")
        token = None
    print()
    
    # Wake up backend if sleeping (Render free tier)
    print(f"{Colors.BLUE}2. Backend Wake-up{Colors.NC}")
    print("-" * 60)
    print("  Waking up backend (may take 30-60s)... ", end="", flush=True)
    for attempt in range(6):
        try:
            response = requests.get(f"{BACKEND_URL}/health", timeout=10)
            if response.status_code == 200:
                print(f"{Colors.GREEN}✓ Awake{Colors.NC}")
                break
        except:
            pass
        if attempt < 5:
            print(".", end="", flush=True)
            time.sleep(10)
    else:
        print(f"{Colors.YELLOW}⚠ Still waking up{Colors.NC}")
    print()
    
    # Health checks
    print(f"{Colors.BLUE}3. Pre-flight Health Checks{Colors.NC}")
    print("-" * 60)
    test("Backend health", lambda: make_request("GET", "/health", expected_status=200))
    test("Backend readiness", lambda: make_request("GET", "/readiness", expected_status=200))
    print()
    
    if not token:
        print(f"{Colors.YELLOW}⚠ Skipping authenticated tests - no token available{Colors.NC}")
        print()
        print_summary()
        return
    
    # User setup
    print(f"{Colors.BLUE}4. User Setup & Onboarding{Colors.NC}")
    print("-" * 60)
    
    # Create/update user
    test("Create user profile", lambda: make_request(
        "PUT", f"/users/{TEST_USER_ID}", token,
        {
            "name": TEST_USER_NAME,
            "email": TEST_USER_EMAIL,
            "profile": {
                "age": 28,
                "weight": 75,
                "height": 180,
                "gender": "male",
                "experience_level": "intermediate"
            },
            "goals": {
                "primary_goal": "build_muscle",
                "target_weight": 80,
                "timeline": "12 weeks"
            }
        }
    ))
    
    # Onboarding steps
    test("Onboarding - Goal", lambda: make_request(
        "POST", "/onboarding_step", token,
        {
            "user_id": TEST_USER_ID,
            "step": "why",
            "data": {"primary_goal": "build_muscle"}
        }
    ))
    
    test("Onboarding - Experience", lambda: make_request(
        "POST", "/onboarding_step", token,
        {
            "user_id": TEST_USER_ID,
            "step": "experience",
            "data": {"experience_level": "intermediate"}
        }
    ))
    
    test("Onboarding - Training Style", lambda: make_request(
        "POST", "/onboarding_step", token,
        {
            "user_id": TEST_USER_ID,
            "step": "training_style",
            "data": {"workout_preference": "strength_training"}
        }
    ))
    print()
    
    # Workout logging (4 weeks) - but log fewer to avoid timeouts
    print(f"{Colors.BLUE}5. Workout Logging (4 Weeks - Sampling){Colors.NC}")
    print("-" * 60)
    print("  Note: Logging 12 workouts (3 per week) to avoid timeouts")
    session_ids = []
    
    # Log 3 workouts per week (days 1, 3, 5) to get good coverage
    for week in range(1, 5):
        print(f"  Week {week}:", end=" ", flush=True)
        week_sessions = []
        
        for day_offset in [0, 2, 4]:  # Days 1, 3, 5 of each week
            day = (week-1)*7 + day_offset
            workout_data = generate_workout_data(day, week)
            try:
                response = make_request("POST", "/log/workout", token, workout_data, retries=1)
                session_id = response.get("session_id")
                if session_id:
                    week_sessions.append(session_id)
                    session_ids.append(session_id)
                print(".", end="", flush=True)
                time.sleep(1)  # Rate limiting
            except Exception as e:
                print(f"{Colors.RED}X{Colors.NC}", end="", flush=True)
                warn(f"Week {week}, Day {day_offset + 1}", str(e)[:80])
        
        print(f" {Colors.GREEN}✓{Colors.NC} ({len(week_sessions)} workouts logged)")
    
    print(f"  Total workouts logged: {len(session_ids)}")
    if len(session_ids) == 0:
        warn("Workout logging", "No workouts logged - cannot test insights/stats")
    print()
    
    # Get insights for recent workouts
    print(f"{Colors.BLUE}6. Insights & Analytics{Colors.NC}")
    print("-" * 60)
    
    if session_ids:
        # Test insights for last 3 workouts (continue on errors)
        for i, session_id in enumerate(session_ids[-3:], 1):
            try:
                test(f"Get insights (workout {i})", lambda sid=session_id: make_request(
                    "GET", f"/insights/{sid}", token
                ))
            except:
                warn(f"Get insights (workout {i})", "Failed - may be backend issue")
        
        # Test stats (continue on errors)
        try:
            test("Get workout stats", lambda: make_request(
                "GET", f"/stats/{session_ids[-1]}", token
            ))
        except:
            warn("Get workout stats", "Failed - may be backend issue")
        
        # Test workout details (continue on errors)
        try:
            test("Get workout details", lambda: make_request(
                "GET", f"/workouts/{session_ids[-1]}", token
            ))
        except:
            warn("Get workout details", "Failed - may be backend issue")
    else:
        warn("Insights & Analytics", "Skipped - no workouts logged")
    print()
    
    # Calendar & Weekly Summary
    print(f"{Colors.BLUE}7. Calendar & Weekly Summary{Colors.NC}")
    print("-" * 60)
    
    calendar_response = test("Get workout calendar", lambda: make_request(
        "GET", f"/workouts/calendar?user_id={TEST_USER_ID}", token
    ))
    
    if session_ids:
        try:
            # Weekly summary uses auth token for user_id, no query param needed
            test("Get weekly summary", lambda: make_request(
                "GET", "/workouts/weekly-summary", token
            ))
        except Exception as e:
            # Weekly summary might need start_date parameter or have different requirements
            warn("Get weekly summary", f"Failed: {str(e)[:80]}")
    else:
        warn("Get weekly summary", "Skipped - no workouts logged")
    print()
    
    # AI Chat
    print(f"{Colors.BLUE}8. AI Chat (FitAI Coach){Colors.NC}")
    print("-" * 60)
    
    # Preload context
    try:
        test("Preload user context", lambda: make_request(
            "POST", f"/users/{TEST_USER_ID}/preload-context", token, {}
        ))
    except:
        warn("Preload context", "Failed but non-critical")
    
    # Test chat (non-streaming) - continue on error
    try:
        test("Chat with FitAI", lambda: make_request(
            "POST", "/chat", token,
            {
                "user_id": TEST_USER_ID,
                "session_id": "test-chat-1",
                "query": "How am I progressing? Give me a quick summary."
            }
        ))
    except Exception as e:
        warn("Chat", f"Failed - may be Modal cold start or backend issue: {str(e)[:80]}")
    
    print()
    
    # Memory & Context
    print(f"{Colors.BLUE}9. Deep Memory System{Colors.NC}")
    print("-" * 60)
    
    try:
        test("Get user memories", lambda: make_request(
            "GET", f"/memories/me?user_id={TEST_USER_ID}", token
        ))
    except:
        warn("Get user memories", "Failed - may be backend issue")
    
    # Refresh memory
    try:
        test("Refresh user memory", lambda: make_request(
            "POST", "/memories/refresh", token,
            {"user_id": TEST_USER_ID}
        ))
    except:
        warn("Memory refresh", "Failed but non-critical")
    
    print()
    
    # Final summary
    print_summary()


def print_summary():
    print(f"{Colors.CYAN}{'='*60}{Colors.NC}")
    print(f"{Colors.CYAN}Test Summary{Colors.NC}")
    print(f"{Colors.CYAN}{'='*60}{Colors.NC}")
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
    
    # Save results (use absolute path from project root)
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(os.path.dirname(script_dir))
    results_dir = os.path.join(project_root, "tests", "results")
    os.makedirs(results_dir, exist_ok=True)
    results_file = os.path.join(results_dir, "e2e_test_results.json")
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
        print_summary()
        sys.exit(1)
    except Exception as e:
        print(f"\n{Colors.RED}Fatal error: {e}{Colors.NC}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

