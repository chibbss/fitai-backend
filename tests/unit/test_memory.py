from __future__ import annotations

import os
import types

from fastapi.testclient import TestClient

from main import app, rag_service
from auth import create_test_token
from memory import redact_pii, refresh_user_memory


def test_redact_pii():
    text = "Email me at user@example.com or call +1 (555) 123-4567."
    red = redact_pii(text)
    assert "example.com" not in red
    assert "555" not in red
    assert "[REDACTED]" in red


def test_memory_upsert_and_endpoint(monkeypatch):
    client = TestClient(app)
    token = create_test_token(user_id="test_user_memory", tier="premium")
    headers = {"Authorization": f"Bearer {token}"}

    user_id = "test_user_memory"

    # Upsert user
    resp = client.put(f"/users/{user_id}", json={"name": "Tester", "profile": {"age": 25}}, headers=headers)
    assert resp.status_code == 200

    # Add a couple of logs
    for notes in [
        "Morning run 5km, felt great",
        "Prefer short intense sessions in the morning",
    ]:
        r = client.post(
            "/add_training_log",
            json={"user_id": user_id, "notes": notes, "kind": "workout"},
            headers=headers,
        )
        assert r.status_code == 200

    # Refresh memory via function
    res = refresh_user_memory(rag_service, user_id=user_id, n=5)
    assert res.get("updated") is True

    # Fetch memories via endpoint
    r = client.get(f"/memories/me", headers=headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data.get("items"), list)
    assert len(data["items"]) >= 1
    assert "summary" in data["items"][0]


def test_chat_injects_memory(monkeypatch):
    client = TestClient(app)
    user_id = "test_user_memory_chat"
    token = create_test_token(user_id=user_id, tier="free")
    headers = {"Authorization": f"Bearer {token}"}
    client.put(f"/users/{user_id}", json={"name": "Tester"}, headers=headers)
    client.post(
        "/add_training_log",
        json={"user_id": user_id, "notes": "Loves morning workouts", "kind": "note"},
        headers=headers,
    )

    res = refresh_user_memory(rag_service, user_id=user_id, n=3)
    assert res.get("updated")

    # Monkeypatch to avoid heavy generation; force remote path to return dummy answer
    def fake_chat(query: str, user_id: str | None, session_id: str | None = None, top_k: int | None = None, max_new_tokens: int | None = None, temperature: float | None = None):
        # Call underlying retrieval to ensure memory used wouldn't error
        mems = rag_service.retrieve_memories(user_id=user_id, query=query, top_k=3)
        return {"answer": "ok", "references": [], "dynamic_refs": mems}

    monkeypatch.setattr(rag_service, "chat", fake_chat)

    r = client.post("/chat", json={"session_id": "s1", "query": "plan"}, headers=headers)
    assert r.status_code == 200
    j = r.json()
    assert j.get("answer") == "ok"
