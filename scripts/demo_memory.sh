#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8000}"
USER_ID="${USER_ID:-demo_user}"

echo "Upserting user ${USER_ID}..."
curl -sS -X PUT "${BASE_URL}/users/${USER_ID}" \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Demo",
    "profile": {"age": 30, "gender": "female"},
    "goals": {"goal": "lose 5kg", "timeline": "12 weeks"}
  }'

echo "Adding training logs..."
curl -sS -X POST "${BASE_URL}/add_training_log" -H 'Content-Type: application/json' -d "{\"user_id\": \"${USER_ID}\", \"notes\": \"Morning HIIT 20min, felt energized\", \"kind\": \"workout\"}"
curl -sS -X POST "${BASE_URL}/add_training_log" -H 'Content-Type: application/json' -d "{\"user_id\": \"${USER_ID}\", \"notes\": \"Meal prep: high protein, low carb\", \"kind\": \"nutrition\"}"

echo "Refreshing memory..."
curl -sS -X POST "${BASE_URL}/memories/refresh" -H 'Content-Type: application/json' -d "{\"user_id\": \"${USER_ID}\"}"

echo "Fetching memories..."
curl -sS -X GET "${BASE_URL}/memories/me?user_id=${USER_ID}"

echo "Chatting to verify memory injection..."
curl -sS -X POST "${BASE_URL}/chat" -H 'Content-Type: application/json' -d "{\"user_id\": \"${USER_ID}\", \"session_id\": \"sess1\", \"query\": \"Suggest a workout today\"}"
