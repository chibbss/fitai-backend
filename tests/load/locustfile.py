#!/usr/bin/env python3
"""
Locust Load Testing Script for FitAI Backend
Tests critical endpoints under concurrent load:
- /chat_stream (streaming chat)
- /users/{id}/preload-context
- /log/workout
- /workouts/stats
- /workouts/weekly-summary

Usage:
    # Install Locust: pip install locust
    # Run with web UI: locust -f tests/load/locustfile.py
    # Run headless: locust -f tests/load/locustfile.py --headless -u 50 -r 10 -t 5m
"""

import os
import sys
import json
import time
import random
import string
from typing import Optional
from datetime import datetime, timedelta
from dotenv import load_dotenv

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../..'))

load_dotenv()

try:
    from locust import HttpUser, task, between, events
    from locust.exception import StopUser
except ImportError:
    print("ERROR: Locust not installed. Install with: pip install locust")
    sys.exit(1)

# Import auth utilities
try:
    from auth import create_test_token
except ImportError:
    print("ERROR: Cannot import auth module. Ensure you're running from project root.")
    sys.exit(1)

# Configuration
BACKEND_URL = os.getenv("BACKEND_URL", "https://fitai-api.onrender.com")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

if not SUPABASE_JWT_SECRET:
    print("WARNING: SUPABASE_JWT_SECRET not set. Load tests may fail authentication.")


class FitAIUser(HttpUser):
    """
    Simulates a FitAI user performing typical actions:
    - Preloading context
    - Chatting with FitAI (streaming)
    - Logging workouts
    - Viewing stats and summaries
    """
    
    wait_time = between(2, 5)  # Wait 2-5 seconds between tasks
    
    def on_start(self):
        """Called when a simulated user starts. Sets up authentication."""
        # Create unique user ID for this simulated user
        self.user_id = f"load-test-user-{''.join(random.choices(string.ascii_lowercase + string.digits, k=8))}"
        self.email = f"{self.user_id}@loadtest.fitai.com"
        
        # Create JWT token
        try:
            self.token = create_test_token(self.user_id, "free")
            self.headers = {
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/json",
            }
        except Exception as e:
            print(f"ERROR: Failed to create token for {self.user_id}: {e}")
            raise StopUser()
        
        # Create user profile (one-time setup)
        self._create_user_profile()
        
        # Preload context (simulates app startup)
        self._preload_context()
    
    def _create_user_profile(self):
        """Create user profile if it doesn't exist"""
        profile_data = {
            "name": f"Load Test User {self.user_id}",
            "email": self.email,
            "profile": {
                "age": random.randint(20, 45),
                "gender": random.choice(["male", "female", "other"]),
                "height": random.randint(160, 200),
                "weight": random.randint(50, 120),
                "experience_level": random.choice(["beginner", "intermediate", "advanced"])
            },
            "goals": {
                "primary_goal": random.choice(["build_muscle", "lose_weight", "maintain", "improve_endurance"]),
                "timeline": random.choice(["4 weeks", "8 weeks", "12 weeks"]),
                "target_weight": random.randint(60, 100)
            }
        }
        
        with self.client.put(
            f"/users/{self.user_id}",
            headers=self.headers,
            json=profile_data,
            catch_response=True,
            name="Create User Profile"
        ) as response:
            if response.status_code in [200, 201]:
                response.success()
            else:
                response.failure(f"Failed to create profile: {response.status_code} - {response.text[:200]}")
    
    def _preload_context(self):
        """Preload user context (simulates app startup)"""
        with self.client.post(
            f"/users/{self.user_id}/preload-context",
            headers=self.headers,
            json={"user_id": self.user_id},
            catch_response=True,
            name="Preload Context"
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Preload failed: {response.status_code}")
    
    @task(5)
    def chat_with_fitai(self):
        """
        Test streaming chat endpoint - HIGHEST PRIORITY
        This is the core feature of FitAI
        """
        # Add small delay to avoid overwhelming backend
        time.sleep(random.uniform(0.5, 1.5))
        
        queries = [
            "How am I progressing?",
            "What should I focus on this week?",
            "Tell me about my workout history",
            "Give me some fitness tips",
            "What's my current fitness level?",
        ]
        
        query = random.choice(queries)
        payload = {
            "user_id": self.user_id,
            "session_id": f"chat-{int(time.time())}",
            "query": query
        }
        
        # Retry logic for 503 errors
        max_retries = 2
        last_exception = None
        
        for attempt in range(max_retries + 1):
            start_time = time.time()
            first_token_time = None
            token_count = 0
            full_answer = ""
            current_event = None
            
            try:
                # Use httpx for better streaming support
                import httpx
                timeout = httpx.Timeout(60.0, connect=30.0, read=60.0)
                
                url = f"{BACKEND_URL}/chat_stream"
                with httpx.Client(timeout=timeout) as client:
                    with client.stream(
                        "POST",
                        url,
                        headers={
                            **self.headers,
                            "Accept": "text/event-stream"
                        },
                        json=payload
                    ) as response:
                        if response.status_code != 200:
                            if response.status_code == 503 and attempt < max_retries:
                                # Backend sleeping, retry with backoff
                                time.sleep(2 ** attempt)
                                continue
                            raise Exception(f"Chat failed: {response.status_code}")
                        
                        # Read streaming response line by line
                        try:
                            for line_bytes in response.iter_lines():
                                if not line_bytes:
                                    continue
                                
                                line = line_bytes.decode('utf-8', errors='ignore').strip()
                                
                                # Skip empty lines and ping comments
                                if not line or line.startswith(': '):
                                    continue
                                
                                # Parse SSE format
                                if line.startswith('event: '):
                                    current_event = line[7:].strip()
                                    continue
                                
                                if line.startswith('data: '):
                                    data_str = line[6:].strip()
                                    
                                    if current_event == 'done':
                                        try:
                                            data = json.loads(data_str)
                                            if isinstance(data, dict) and 'answer' in data:
                                                # Use the full answer from done event
                                                full_answer = data.get('answer', full_answer)
                                                break
                                        except (json.JSONDecodeError, ValueError) as e:
                                            # Try to extract answer even if JSON parsing fails
                                            pass
                                    
                                    elif current_event == 'token':
                                        try:
                                            # Token data is a JSON-encoded string (e.g., "Whoa")
                                            token = json.loads(data_str)
                                            if isinstance(token, str):
                                                full_answer += token
                                                token_count += 1
                                                if first_token_time is None:
                                                    first_token_time = time.time() - start_time
                                        except (json.JSONDecodeError, ValueError):
                                            # If JSON parsing fails, skip this token
                                            pass
                                    
                                    elif current_event == 'metadata':
                                        # Skip metadata events
                                        continue
                        
                        except httpx.ReadTimeout:
                            # Stream timed out, but we might have partial answer
                            pass
                        except Exception as stream_error:
                            # Log but continue - we might have partial answer
                            pass
                
                total_time = time.time() - start_time
                
                # Record custom metrics
                if first_token_time:
                    events.request.fire(
                        request_type="chat_stream",
                        name="Chat Stream - Time to First Token",
                        response_time=first_token_time * 1000,
                        response_length=0,
                        exception=None
                    )
                
                events.request.fire(
                    request_type="chat_stream",
                    name="Chat Stream - Total Time",
                    response_time=total_time * 1000,
                    response_length=len(full_answer),
                    exception=None
                )
                
                # Accept answer if we have tokens, even without 'done' event
                if not full_answer and token_count == 0:
                    raise Exception("No answer received from chat")
                elif not full_answer and token_count > 0:
                    # We got tokens but no done event - this is acceptable
                    print(f"Warning: Got {token_count} tokens but no 'done' event. Answer length: {len(full_answer)}")
                
                # Success - break out of retry loop
                return
                
            except Exception as e:
                last_exception = e
                if "503" in str(e) and attempt < max_retries:
                    # Retry with exponential backoff
                    time.sleep(2 ** attempt)
                    continue
                # Final attempt failed or non-retryable error
                break
        
        # All retries exhausted or non-retryable error
        events.request.fire(
            request_type="chat_stream",
            name="Chat Stream",
            response_time=(time.time() - start_time) * 1000 if 'start_time' in locals() else 0,
            response_length=0,
            exception=last_exception
        )
        raise last_exception if last_exception else Exception("Chat failed after retries")
    
    @task(3)
    def log_workout(self):
        """Test workout logging endpoint"""
        exercises = [
            {
                "exercise_name": "Bench Press",
                "exercise_category": "chest",
                "sets": 3,
                "reps": [8, 8, 6],
                "weights": ["80kg", "85kg", "90kg"]
            },
            {
                "exercise_name": "Squat",
                "exercise_category": "legs",
                "sets": 4,
                "reps": [10, 10, 8, 8],
                "weights": ["100kg", "105kg", "110kg", "110kg"]
            },
            {
                "exercise_name": "Deadlift",
                "exercise_category": "legs",
                "sets": 3,
                "reps": [5, 5, 5],
                "weights": ["120kg", "125kg", "130kg"]
            },
            {
                "exercise_name": "Pull-ups",
                "exercise_category": "back",
                "sets": 3,
                "reps": [10, 8, 6],
                "weights": ["0kg", "0kg", "0kg"]
            },
            {
                "exercise_name": "Overhead Press",
                "exercise_category": "shoulders",
                "sets": 3,
                "reps": [8, 8, 6],
                "weights": ["50kg", "55kg", "60kg"]
            },
        ]
        
        workout_data = {
            "session_name": f"Load Test Workout {random.choice(['Push', 'Pull', 'Legs'])}",
            "session_type": "strength",
            "occurred_at": (datetime.now() - timedelta(days=random.randint(0, 7))).isoformat(),
            "duration_minutes": random.randint(45, 90),
            "notes": f"Load test workout - {random.choice(['Great session', 'Felt strong', 'Need more rest'])}",
            "exercises": random.sample(exercises, k=random.randint(3, 5))
        }
        
        with self.client.post(
            "/log/workout",
            headers=self.headers,
            json=workout_data,
            catch_response=True,
            name="Log Workout"
        ) as response:
            if response.status_code == 200:
                data = response.json()
                # Store session_id for stats endpoint
                if "session_id" in data:
                    if not hasattr(self, "session_ids"):
                        self.session_ids = []
                    self.session_ids.append(data["session_id"])
                response.success()
            else:
                response.failure(f"Failed to log workout: {response.status_code} - {response.text[:200]}")
    
    @task(1)  # Reduced weight since it requires logged workouts
    def get_workout_stats(self):
        """Test workout stats endpoint - requires session_id"""
        # Only test if we have logged workouts
        if not hasattr(self, "session_ids") or not self.session_ids:
            return  # Skip if no workouts logged
        
        session_id = random.choice(self.session_ids)
        with self.client.get(
            f"/stats/{session_id}",
            headers=self.headers,
            catch_response=True,
            name="Get Workout Stats"
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Failed to get stats: {response.status_code} - {response.text[:200]}")
    
    @task(2)
    def get_weekly_summary(self):
        """Test weekly summary endpoint"""
        with self.client.get(
            "/workouts/weekly-summary",
            headers=self.headers,
            catch_response=True,
            name="Get Weekly Summary"
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Failed to get weekly summary: {response.status_code} - {response.text[:200]}")
    
    @task(1)
    def get_workout_calendar(self):
        """Test workout calendar endpoint"""
        with self.client.get(
            "/workouts/calendar",
            headers=self.headers,
            catch_response=True,
            name="Get Workout Calendar"
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Failed to get calendar: {response.status_code} - {response.text[:200]}")


# Custom event handlers for better reporting
@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Called when load test starts"""
    print("\n" + "="*60)
    print("FitAI Load Test Starting")
    print("="*60)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Target: {environment.host}")
    print("="*60 + "\n")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when load test stops"""
    print("\n" + "="*60)
    print("FitAI Load Test Complete")
    print("="*60)
    
    stats = environment.stats
    print(f"\nTotal Requests: {stats.total.num_requests}")
    print(f"Total Failures: {stats.total.num_failures}")
    print(f"Failure Rate: {(stats.total.num_failures / stats.total.num_requests * 100):.2f}%")
    print(f"\nAverage Response Time: {stats.total.avg_response_time:.2f}ms")
    print(f"Min Response Time: {stats.total.min_response_time:.2f}ms")
    print(f"Max Response Time: {stats.total.max_response_time:.2f}ms")
    print("="*60 + "\n")

