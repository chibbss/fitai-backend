# main.py
import os
import time
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Try to import transformers only if needed (avoid hard crash in pure-mock dev)
try:
    from transformers import pipeline
except Exception:
    pipeline = None  # we'll handle missing transformers if user stays in mock mode

app = FastAPI(title="FitAI Backend", version="0.1")

# Config via environment
USE_MOCK = os.getenv("USE_MOCK", "1")  # "1" => mock mode, "0" => try to load model
MODEL_NAME = os.getenv("MODEL_NAME", "distilgpt2")  # hub name or local path
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "150"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.7"))

# Global model handle (None if in mock or failed to load)
generator = None


class ChatRequest(BaseModel):
    message: str
    max_tokens: Optional[int] = None  # optional override per-request


@app.on_event("startup")
def load_model_on_startup():
    global generator, USE_MOCK, MODEL_NAME, pipeline
    print(f"Startup: USE_MOCK={USE_MOCK}, MODEL_NAME={MODEL_NAME}")
    if USE_MOCK == "1":
        print("Running in MOCK mode — no model will be loaded.")
        return

    # If user wants real model but transformers is missing, raise clear error
    if pipeline is None:
        print("transformers not available in environment. Install 'transformers' and 'torch'.")
        return

    try:
        # Attempt to load the requested model. device_map="auto" will try to place on available device (cpu/mps/gpu)
        print(f"Loading model '{MODEL_NAME}' (this may take a while)...")
        generator = pipeline(
            "text-generation",
            model=MODEL_NAME,
            device_map="auto",
        )
        print("Model loaded successfully.")
    except Exception as e:
        print("Failed to load model:", e)
        generator = None


@app.get("/health")
def health():
    return {"status": "ok", "model_loaded": generator is not None and USE_MOCK == "0"}


@app.post("/chat")
def chat(req: ChatRequest):
    """Chat endpoint.
    - In mock mode: returns a helpful canned response.
    - In real mode: runs the model and returns generated text + latency.
    """
    global generator

    # Basic input validation
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=400, detail="`message` must be a non-empty string.")

    # MOCK path
    if USE_MOCK == "1" or generator is None:
        # A FitAI-flavored mock reply (short, useful)
        mock_reply = (
            f"FitAI (mock): I hear you — '{req.message}'. Start with one small step today: "
            "set a 20-min plan, hit one focused session, and note how you feel after. Consistency > perfection."
        )
        return {"reply": mock_reply, "mock": True}

    # REAL model path
    try:
        max_tokens = req.max_tokens if req.max_tokens is not None else MAX_NEW_TOKENS
        start = time.time()
        output = generator(req.message, max_new_tokens=max_tokens, do_sample=True, temperature=TEMPERATURE)
        latency = time.time() - start

        # pipeline returns a list of results; 'generated_text' is standard
        generated = output[0].get("generated_text") if isinstance(output, list) else str(output)
        # safe fallback
        if generated is None:
            generated = str(output)

        return {
            "reply": generated,
            "model": MODEL_NAME,
            "latency_seconds": round(latency, 3),
            "mock": False,
        }
    except Exception as e:
        # If model fails, return helpful error and fallback suggestion
        print("Model inference error:", e)
        raise HTTPException(status_code=500, detail=f"Model inference failed: {e}")