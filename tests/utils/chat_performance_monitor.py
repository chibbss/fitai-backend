#!/usr/bin/env python3
"""
Chat Performance Monitoring Script
Tracks actual chat endpoint response times to help diagnose timeout issues.
"""

import os
import sys
import json
import time
import requests
from datetime import datetime
from typing import Dict, Any, List
from dotenv import load_dotenv

load_dotenv()

# Configuration
BACKEND_URL = os.getenv("BACKEND_URL", "https://fitai-api.onrender.com")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET")

try:
    import jwt
    if not hasattr(jwt, 'encode'):
        try:
            from jwt.api_jwt import encode
            jwt.encode = encode
        except ImportError:
            jwt = None
except ImportError:
    jwt = None


def create_test_token(user_id: str = "monitor-test", email: str = "monitor@fitai.test") -> str:
    """Create a test JWT token for authentication"""
    if not SUPABASE_JWT_SECRET:
        raise ValueError("SUPABASE_JWT_SECRET not set")
    if not jwt:
        raise ValueError("PyJWT not available - pip install PyJWT")
    
    payload = {
        "sub": user_id,
        "email": email,
        "aud": "authenticated",
        "role": "authenticated",
        "user_metadata": {"tier": "free"},
        "exp": int(time.time()) + 3600,
        "iat": int(time.time()),
    }
    return jwt.encode(payload, SUPABASE_JWT_SECRET, algorithm="HS256")


def test_chat_performance(query: str, token: str, use_stream: bool = False) -> Dict[str, Any]:
    """Test chat endpoint and measure performance"""
    endpoint = "/chat_stream" if use_stream else "/chat"
    url = f"{BACKEND_URL}{endpoint}"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    payload = {
        "query": query,
        "session_id": f"monitor-{int(time.time())}",
    }
    
    start_time = time.time()
    result = {
        "endpoint": endpoint,
        "query": query[:50] + "..." if len(query) > 50 else query,
        "use_stream": use_stream,
        "start_time": datetime.utcnow().isoformat(),
        "success": False,
        "status_code": None,
        "total_time": None,
        "error": None,
    }
    
    try:
        if use_stream:
            # For streaming, measure time to first token and total time
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                stream=True,
                timeout=90,
            )
            response.raise_for_status()
            
            first_token_time = None
            last_token_time = None
            token_count = 0
            
            for line in response.iter_lines():
                if line:
                    if first_token_time is None:
                        first_token_time = time.time() - start_time
                    last_token_time = time.time() - start_time
                    token_count += 1
            
            result.update({
                "success": True,
                "status_code": response.status_code,
                "total_time": time.time() - start_time,
                "time_to_first_token": first_token_time,
                "time_to_last_token": last_token_time,
                "token_count": token_count,
            })
        else:
            # For non-streaming, measure total response time
            response = requests.post(
                url,
                headers=headers,
                json=payload,
                timeout=90,
            )
            response.raise_for_status()
            data = response.json()
            
            result.update({
                "success": True,
                "status_code": response.status_code,
                "total_time": time.time() - start_time,
                "response_length": len(data.get("answer", "")),
            })
    
    except requests.exceptions.Timeout as e:
        result.update({
            "success": False,
            "error": "Request timeout",
            "total_time": time.time() - start_time,
        })
    except requests.exceptions.HTTPError as e:
        result.update({
            "success": False,
            "status_code": e.response.status_code if hasattr(e, 'response') else None,
            "error": str(e),
            "total_time": time.time() - start_time,
        })
    except Exception as e:
        result.update({
            "success": False,
            "error": str(e),
            "total_time": time.time() - start_time,
        })
    
    return result


def run_performance_test(iterations: int = 5) -> List[Dict[str, Any]]:
    """Run multiple chat performance tests"""
    print(f"🚀 Chat Performance Monitor")
    print(f"Backend: {BACKEND_URL}")
    print(f"Iterations: {iterations}")
    print("-" * 60)
    
    if not SUPABASE_JWT_SECRET:
        print("❌ ERROR: SUPABASE_JWT_SECRET not set")
        return []
    
    if not jwt:
        print("❌ ERROR: PyJWT not installed. Install with: pip install PyJWT")
        return []
    
    token = create_test_token()
    
    test_queries = [
        "How am I doing?",
        "What should I focus on this week?",
        "Tell me about my progress",
        "What's my workout history?",
        "Give me some fitness tips",
    ]
    
    results = []
    
    for i in range(iterations):
        query = test_queries[i % len(test_queries)]
        print(f"\n📊 Test {i+1}/{iterations}: {query}")
        
        # Test non-streaming
        print("  Testing /chat (non-streaming)...", end=" ", flush=True)
        result = test_chat_performance(query, token, use_stream=False)
        results.append(result)
        
        if result["success"]:
            print(f"✓ {result['total_time']:.2f}s")
        else:
            print(f"✗ {result.get('error', 'Unknown error')}")
        
        time.sleep(2)  # Brief pause between requests
        
        # Test streaming
        print("  Testing /chat_stream (streaming)...", end=" ", flush=True)
        result = test_chat_performance(query, token, use_stream=True)
        results.append(result)
        
        if result["success"]:
            print(f"✓ {result['total_time']:.2f}s (first token: {result.get('time_to_first_token', 0):.2f}s)")
        else:
            print(f"✗ {result.get('error', 'Unknown error')}")
        
        time.sleep(2)
    
    return results


def analyze_results(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Analyze performance test results"""
    streaming_results = [r for r in results if r.get("use_stream")]
    non_streaming_results = [r for r in results if not r.get("use_stream")]
    
    def get_stats(result_list: List[Dict[str, Any]]) -> Dict[str, Any]:
        if not result_list:
            return {}
        
        successful = [r for r in result_list if r.get("success")]
        if not successful:
            return {"success_rate": 0.0, "count": len(result_list)}
        
        times = [r["total_time"] for r in successful]
        
        return {
            "count": len(result_list),
            "successful": len(successful),
            "success_rate": len(successful) / len(result_list) * 100,
            "avg_time": sum(times) / len(times) if times else 0,
            "min_time": min(times) if times else 0,
            "max_time": max(times) if times else 0,
            "median_time": sorted(times)[len(times) // 2] if times else 0,
        }
    
    streaming_stats = get_stats(streaming_results)
    non_streaming_stats = get_stats(non_streaming_results)
    
    # For streaming, also analyze time to first token
    streaming_successful = [r for r in streaming_results if r.get("success")]
    if streaming_successful:
        first_token_times = [r.get("time_to_first_token", 0) for r in streaming_successful if r.get("time_to_first_token")]
        if first_token_times:
            streaming_stats["avg_time_to_first_token"] = sum(first_token_times) / len(first_token_times)
            streaming_stats["min_time_to_first_token"] = min(first_token_times)
            streaming_stats["max_time_to_first_token"] = max(first_token_times)
    
    return {
        "streaming": streaming_stats,
        "non_streaming": non_streaming_stats,
        "timestamp": datetime.utcnow().isoformat(),
    }


def main():
    """Main entry point"""
    iterations = int(os.getenv("ITERATIONS", "5"))
    
    results = run_performance_test(iterations)
    
    if not results:
        print("\n❌ No results collected")
        return
    
    analysis = analyze_results(results)
    
    print("\n" + "=" * 60)
    print("📈 PERFORMANCE ANALYSIS")
    print("=" * 60)
    
    print("\n📡 Non-Streaming (/chat):")
    ns = analysis["non_streaming"]
    if ns:
        print(f"  Success Rate: {ns.get('success_rate', 0):.1f}%")
        print(f"  Avg Time: {ns.get('avg_time', 0):.2f}s")
        print(f"  Min Time: {ns.get('min_time', 0):.2f}s")
        print(f"  Max Time: {ns.get('max_time', 0):.2f}s")
        print(f"  Median Time: {ns.get('median_time', 0):.2f}s")
    else:
        print("  No data")
    
    print("\n🌊 Streaming (/chat_stream):")
    s = analysis["streaming"]
    if s:
        print(f"  Success Rate: {s.get('success_rate', 0):.1f}%")
        print(f"  Avg Total Time: {s.get('avg_time', 0):.2f}s")
        print(f"  Avg Time to First Token: {s.get('avg_time_to_first_token', 0):.2f}s")
        print(f"  Min Time: {s.get('min_time', 0):.2f}s")
        print(f"  Max Time: {s.get('max_time', 0):.2f}s")
    else:
        print("  No data")
    
    # Save results
    output_file = "tests/results/chat_performance.json"
    os.makedirs(os.path.dirname(output_file), exist_ok=True)
    
    with open(output_file, "w") as f:
        json.dump({
            "results": results,
            "analysis": analysis,
        }, f, indent=2)
    
    print(f"\n💾 Results saved to: {output_file}")
    
    # Recommendations
    print("\n💡 RECOMMENDATIONS:")
    if ns and ns.get("max_time", 0) > 30:
        print("  ⚠️  Non-streaming max time exceeds 30s (Render free tier limit)")
        print("     → Upgrade to Starter plan (60s timeout) or Standard (120s)")
    if s and s.get("max_time", 0) > 30:
        print("  ⚠️  Streaming max time exceeds 30s (Render free tier limit)")
        print("     → Upgrade to Starter plan (60s timeout) or Standard (120s)")
    if s and s.get("avg_time_to_first_token", 0) < 5:
        print("  ✓ Streaming provides good perceived performance (fast first token)")
    if ns and s and ns.get("avg_time", 0) > s.get("avg_time", 0):
        print("  → Consider using streaming as default for better UX")


if __name__ == "__main__":
    main()

