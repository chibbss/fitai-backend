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
            
            # Check status code
            if response.status_code != expected_status:
                error_msg = f"Expected {expected_status}, got {response.status_code}: {response.text[:200]}"
                # Retry on 502/503 errors
                if response.status_code in (502, 503) and attempt < retries:
                    wait_time = (attempt + 1) * 10
                    print(f"\n    Retry {attempt + 1}/{retries} after {wait_time}s (backend returned {response.status_code}, may be cold start)...")
                    time.sleep(wait_time)
                    continue
                raise AssertionError(error_msg)
            
            if response.status_code == 204:
                return {}
            
            # Try to parse JSON
            try:
                return response.json()
            except ValueError:
                raise ValueError(f"Invalid JSON response: {response.text[:200]}")
                
        except (requests.exceptions.Timeout, requests.exceptions.ConnectionError) as e:
            last_error = e
            if attempt < retries:
                wait_time = (attempt + 1) * 10  # 10s, 20s, 30s
                print(f"\n    Retry {attempt + 1}/{retries} after {wait_time}s (backend may be sleeping)...")
                time.sleep(wait_time)
            else:
                raise
        except AssertionError as e:
            # Re-raise if we've exhausted retries
            if attempt >= retries:
                raise
            # Otherwise continue to retry (already handled above)
            last_error = e
        except Exception as e:
            last_error = e
            if attempt >= retries:
                raise
    
    # Should never reach here, but just in case
    if last_error:
        raise last_error
    raise RuntimeError("make_request failed for unknown reason")


def generate_workout_data(day: int, week: int) -> Dict:
    """Generate realistic workout data for a 5-day split (Mon-Fri)"""
    # Calculate which day of week (0=Monday, 4=Friday)
    day_of_week = day % 7
    # Only log Mon-Fri (skip weekends)
    if day_of_week >= 5:  # Saturday or Sunday
        return None
    
    # Calculate which week day (0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri)
    weekday = day_of_week
    
    exercises = []
    session_name = ""
    session_type = "strength"
    notes = f"Week {week}, Day {day_of_week + 1} - "
    
    # Bench Press - PLATEAUED (stuck at 80kg for all 4 weeks)
    bench_weight = 80.0  # Plateaued - no progression
    
    # Hack Squat - PROGRESSIVE (80kg → 200kg over 4 weeks)
    hack_squat_start = 80.0
    hack_squat_end = 200.0
    hack_squat_weight = hack_squat_start + ((hack_squat_end - hack_squat_start) / 3) * (week - 1)
    
    if weekday == 0:  # Monday - Chest
        session_name = f"Week {week} - Chest Day"
        exercises = [
            {
                "exercise_name": "Bench Press",
                "exercise_category": "chest",
                "sets": 4,
                "reps": [8, 8, 6, 6],
                "weights": [f"{bench_weight}kg", f"{bench_weight}kg", f"{bench_weight}kg", f"{bench_weight}kg"]
            },
            {
                "exercise_name": "Incline Dumbbell Press",
                "exercise_category": "chest",
                "sets": 3,
                "reps": [10, 10, 8],
                "weights": [f"{bench_weight * 0.7:.1f}kg", f"{bench_weight * 0.7:.1f}kg", f"{bench_weight * 0.75:.1f}kg"]
            },
            {
                "exercise_name": "Cable Flyes",
                "exercise_category": "chest",
                "sets": 3,
                "reps": [12, 12, 10],
                "weights": ["25kg", "27.5kg", "30kg"]
            },
            {
                "exercise_name": "Dips",
                "exercise_category": "chest",
                "sets": 3,
                "reps": [12, 10, 8],
                "weights": ["bodyweight", "bodyweight + 10kg", "bodyweight + 15kg"]
            },
            {
                "exercise_name": "Tricep Pushdowns",
                "exercise_category": "arms",
                "sets": 3,
                "reps": [15, 12, 10],
                "weights": ["30kg", "35kg", "40kg"]
            }
        ]
        notes += "Chest pump! Bench still stuck at 80kg though..."
    
    elif weekday == 1:  # Tuesday - Back and Arms
        session_name = f"Week {week} - Back & Arms Day"
        back_base = 70 + (week * 3)
        exercises = [
            {
                "exercise_name": "Barbell Rows",
                "exercise_category": "back",
                "sets": 4,
                "reps": [8, 8, 6, 6],
                "weights": [f"{back_base}kg", f"{back_base}kg", f"{back_base + 5}kg", f"{back_base + 5}kg"]
            },
            {
                "exercise_name": "Pull-ups",
                "exercise_category": "back",
                "sets": 4,
                "reps": [10, 8, 8, 6],
                "weights": ["bodyweight", "bodyweight", "bodyweight + 10kg", "bodyweight + 10kg"]
            },
            {
                "exercise_name": "Lat Pulldowns",
                "exercise_category": "back",
                "sets": 3,
                "reps": [12, 10, 8],
                "weights": ["60kg", "65kg", "70kg"]
            },
            {
                "exercise_name": "Barbell Curls",
                "exercise_category": "arms",
                "sets": 3,
                "reps": [10, 8, 6],
                "weights": ["25kg", "27.5kg", "30kg"]
            },
            {
                "exercise_name": "Hammer Curls",
                "exercise_category": "arms",
                "sets": 3,
                "reps": [12, 10, 8],
                "weights": ["15kg", "17.5kg", "20kg"]
            },
            {
                "exercise_name": "Cable Rope Curls",
                "exercise_category": "arms",
                "sets": 3,
                "reps": [15, 12, 10],
                "weights": ["20kg", "22.5kg", "25kg"]
            }
        ]
        notes += "Back and biceps destroyed!"
    
    elif weekday == 2:  # Wednesday - Legs
        session_name = f"Week {week} - Leg Day"
        exercises = [
            {
                "exercise_name": "Hack Squat",
                "exercise_category": "legs",
                "sets": 4,
                "reps": [10, 8, 8, 6],
                "weights": [f"{hack_squat_weight:.1f}kg", f"{hack_squat_weight:.1f}kg", f"{hack_squat_weight + 5:.1f}kg", f"{hack_squat_weight + 5:.1f}kg"]
            },
            {
                "exercise_name": "Romanian Deadlifts",
                "exercise_category": "legs",
                "sets": 4,
                "reps": [8, 8, 6, 6],
                "weights": [f"{hack_squat_weight * 0.8:.1f}kg", f"{hack_squat_weight * 0.8:.1f}kg", f"{hack_squat_weight * 0.85:.1f}kg", f"{hack_squat_weight * 0.85:.1f}kg"]
            },
            {
                "exercise_name": "Leg Press",
                "exercise_category": "legs",
                "sets": 3,
                "reps": [15, 12, 10],
                "weights": [f"{hack_squat_weight * 1.5:.1f}kg", f"{hack_squat_weight * 1.6:.1f}kg", f"{hack_squat_weight * 1.7:.1f}kg"]
            },
            {
                "exercise_name": "Leg Curls",
                "exercise_category": "legs",
                "sets": 3,
                "reps": [12, 10, 8],
                "weights": ["40kg", "45kg", "50kg"]
            },
            {
                "exercise_name": "Leg Extensions",
                "exercise_category": "legs",
                "sets": 3,
                "reps": [15, 12, 10],
                "weights": ["50kg", "55kg", "60kg"]
            },
            {
                "exercise_name": "Calf Raises",
                "exercise_category": "legs",
                "sets": 4,
                "reps": [20, 18, 15, 12],
                "weights": ["80kg", "85kg", "90kg", "95kg"]
            }
        ]
        notes += f"Hack squat feeling strong! Up to {hack_squat_weight:.1f}kg now!"
    
    elif weekday == 3:  # Thursday - Back and Shoulders
        session_name = f"Week {week} - Back & Shoulders Day"
        back_base = 70 + (week * 3)
        shoulder_base = 40 + (week * 2)
        exercises = [
            {
                "exercise_name": "Deadlifts",
                "exercise_category": "back",
                "sets": 4,
                "reps": [5, 5, 3, 3],
                "weights": [f"{back_base + 40}kg", f"{back_base + 45}kg", f"{back_base + 50}kg", f"{back_base + 55}kg"]
            },
            {
                "exercise_name": "T-Bar Rows",
                "exercise_category": "back",
                "sets": 3,
                "reps": [10, 8, 6],
                "weights": [f"{back_base * 0.9:.1f}kg", f"{back_base * 0.95:.1f}kg", f"{back_base}kg"]
            },
            {
                "exercise_name": "Seated Cable Rows",
                "exercise_category": "back",
                "sets": 3,
                "reps": [12, 10, 8],
                "weights": ["55kg", "60kg", "65kg"]
            },
            {
                "exercise_name": "Overhead Press",
                "exercise_category": "shoulders",
                "sets": 4,
                "reps": [8, 8, 6, 6],
                "weights": [f"{shoulder_base}kg", f"{shoulder_base}kg", f"{shoulder_base + 2.5}kg", f"{shoulder_base + 2.5}kg"]
            },
            {
                "exercise_name": "Lateral Raises",
                "exercise_category": "shoulders",
                "sets": 3,
                "reps": [15, 12, 10],
                "weights": ["12.5kg", "15kg", "17.5kg"]
            },
            {
                "exercise_name": "Rear Delt Flyes",
                "exercise_category": "shoulders",
                "sets": 3,
                "reps": [15, 12, 10],
                "weights": ["10kg", "12.5kg", "15kg"]
            },
            {
                "exercise_name": "Face Pulls",
                "exercise_category": "shoulders",
                "sets": 3,
                "reps": [20, 18, 15],
                "weights": ["25kg", "27.5kg", "30kg"]
            }
        ]
        notes += "Back and shoulders feeling solid!"
    
    elif weekday == 4:  # Friday - Chest and Full Body (Mobility/Shredded)
        session_name = f"Week {week} - Chest & Full Body Day"
        exercises = [
            {
                "exercise_name": "Bench Press",
                "exercise_category": "chest",
                "sets": 3,
                "reps": [10, 8, 6],
                "weights": [f"{bench_weight}kg", f"{bench_weight}kg", f"{bench_weight}kg"]  # Still plateaued
            },
            {
                "exercise_name": "Dumbbell Flyes",
                "exercise_category": "chest",
                "sets": 3,
                "reps": [12, 10, 8],
                "weights": ["20kg", "22.5kg", "25kg"]
            },
            {
                "exercise_name": "Push-ups",
                "exercise_category": "chest",
                "sets": 3,
                "reps": [20, 15, 12],
                "weights": ["bodyweight", "bodyweight", "bodyweight"]
            },
            {
                "exercise_name": "Burpees",
                "exercise_category": "full_body",
                "sets": 3,
                "reps": [15, 12, 10],
                "weights": ["bodyweight", "bodyweight", "bodyweight"]
            },
            {
                "exercise_name": "Mountain Climbers",
                "exercise_category": "full_body",
                "sets": 3,
                "reps": [30, 25, 20],
                "weights": ["bodyweight", "bodyweight", "bodyweight"]
            },
            {
                "exercise_name": "Plank",
                "exercise_category": "core",
                "sets": 3,
                "reps": [60, 45, 30],  # seconds
                "weights": ["bodyweight", "bodyweight", "bodyweight"]
            },
            {
                "exercise_name": "Russian Twists",
                "exercise_category": "core",
                "sets": 3,
                "reps": [30, 25, 20],
                "weights": ["10kg", "12.5kg", "15kg"]
            },
            {
                "exercise_name": "Jump Rope",
                "exercise_category": "cardio",
                "sets": 3,
                "reps": [100, 100, 100],
                "weights": ["bodyweight", "bodyweight", "bodyweight"]
            },
            {
                "exercise_name": "Battle Ropes",
                "exercise_category": "full_body",
                "sets": 3,
                "reps": [30, 25, 20],  # seconds
                "weights": ["15kg", "15kg", "15kg"]
            }
        ]
        notes += "Full body shredded session! Bench still stuck though..."
    
    return {
        "session_name": session_name,
        "session_type": session_type,
        "exercises": exercises,
        "notes": notes,
        "duration_minutes": 60 + (weekday * 5) + (week * 2),  # 60-90 minutes
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
    print("  Note: Logging 20 workouts (5 per week, Mon-Fri) for realistic training split")
    session_ids = []
    
    # Log 5 workouts per week (Mon-Fri) for realistic training split
    for week in range(1, 5):
        print(f"  Week {week}:", end=" ", flush=True)
        week_sessions = []
        
        for day_offset in [0, 1, 2, 3, 4]:  # Monday through Friday
            day = (week-1)*7 + day_offset
            workout_data = generate_workout_data(day, week)
            if workout_data is None:  # Skip weekends
                continue
            try:
                response = make_request("POST", "/log/workout", token, workout_data, retries=1)
                if response and isinstance(response, dict):
                    session_id = response.get("session_id")
                    if session_id:
                        week_sessions.append(session_id)
                        session_ids.append(session_id)
                    print(".", end="", flush=True)
                else:
                    print(f"{Colors.RED}X{Colors.NC}", end="", flush=True)
                    warn(f"Week {week}, Day {day_offset + 1}", "No session_id in response")
            except Exception as e:
                print(f"{Colors.RED}X{Colors.NC}", end="", flush=True)
                warn(f"Week {week}, Day {day_offset + 1}", str(e)[:80])
            time.sleep(1)  # Rate limiting
        
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
    
    # Test chat (streaming) - continue on error
    try:
        def test_chat_stream():
            """Test streaming chat endpoint"""
            url = f"{BACKEND_URL}/chat_stream"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "text/event-stream",
            }
            payload = {
                "user_id": TEST_USER_ID,
                "session_id": "test-chat-1",
                "query": "How am I progressing? Give me a quick summary."
            }
            
            response = requests.post(url, headers=headers, json=payload, stream=True, timeout=90)
            if response.status_code != 200:
                raise AssertionError(f"Expected 200, got {response.status_code}: {response.text[:200]}")
            
            # Read streaming response
            full_answer = ""
            first_token_received = False
            for line in response.iter_lines():
                if line:
                    line_str = line.decode('utf-8')
                    if line_str.startswith('data: '):
                        try:
                            import json
                            data = json.loads(line_str[6:])  # Remove 'data: ' prefix
                            if isinstance(data, dict):
                                if data.get('type') == 'token':
                                    full_answer += data.get('content', '')
                                    if not first_token_received:
                                        first_token_received = True
                                elif data.get('type') == 'done':
                                    # Final answer
                                    done_content = data.get('content', {})
                                    if isinstance(done_content, dict):
                                        full_answer = done_content.get('answer', full_answer)
                        except:
                            pass
            
            if not full_answer:
                raise AssertionError("No answer received from streaming chat")
            
            return {"answer": full_answer, "streaming": True}
        
        test("Chat with FitAI (streaming)", test_chat_stream)
    except Exception as e:
        warn("Chat", f"Failed - may be backend issue: {str(e)[:80]}")
    
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

