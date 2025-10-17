import os
import time
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# Optional metrics
from collections import defaultdict

# Transformers
try:
    from transformers import pipeline
except ImportError:
    pipeline = None

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)

app = FastAPI(title="FitAI Backend", version="0.1")

# Config via environment
USE_MOCK = os.getenv("USE_MOCK", "1")  # "1" => mock mode, "0" => real model
MODEL_NAME = os.getenv("MODEL_NAME", "microsoft/Phi-3.5-mini-instruct")
MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "150"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0.7"))

# Global model handle
generator = None

# Metrics
metrics = defaultdict(int)
latency_records = []

class ChatRequest(BaseModel):
    message: str
    max_tokens: Optional[int] = None


@app.on_event("startup")
def load_model_on_startup():
    global generator
    logging.info(f"Startup: USE_MOCK={USE_MOCK}, MODEL_NAME={MODEL_NAME}")
    if USE_MOCK == "1":
        logging.info("Running in MOCK mode — no model loaded.")
        return

    if pipeline is None:
        logging.warning("Transformers not installed. Install 'transformers' and 'torch'.")
        return

    try:
        logging.info(f"Loading model '{MODEL_NAME}'...")
        generator = pipeline("text-generation", model=MODEL_NAME, device_map="auto")
        logging.info("Model loaded successfully.")
    except Exception as e:
        logging.error(f"Failed to load model: {e}")
        generator = None


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": generator is not None and USE_MOCK == "0",
        "metrics": dict(metrics),
        "avg_latency_seconds": round(sum(latency_records)/len(latency_records), 3) if latency_records else 0
    }


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logging.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error. Please try again later."}
    )


@app.post("/chat")
def chat(req: ChatRequest):
    metrics["total_requests"] += 1

    # Validate input
    if not req.message or not req.message.strip():
        metrics["bad_requests"] += 1
        raise HTTPException(status_code=400, detail="`message` must be a non-empty string.")

    # Mock path
    if USE_MOCK == "1" or generator is None:
        logging.info(f"Mock response for message: {req.message}")
        mock_reply = (
            f"FitAI (mock): I hear you — '{req.message}'. Start with one small step today: "
            "set a 20-min plan, hit one focused session, and note how you feel after. Consistency > perfection."
        )
        return {"reply": mock_reply, "mock": True}

    # Real model path
    try:
        max_tokens = req.max_tokens if req.max_tokens is not None else MAX_NEW_TOKENS
        start = time.time()
        output = generator(
            req.message,
            max_new_tokens=max_tokens,
            do_sample=True,
            temperature=TEMPERATURE,
            top_p=0.9,
            top_k=50,
            repetition_penalty=1.1
        )
        latency = time.time() - start
        latency_records.append(latency)
        logging.info(f"Model response generated in {round(latency, 3)}s")

        generated = output[0].get("generated_text") if isinstance(output, list) else str(output)
        if generated is None:
            generated = str(output)

        return {
            "reply": generated,
            "model": MODEL_NAME,
            "latency_seconds": round(latency, 3),
            "mock": False
        }
    except Exception as e:
        metrics["model_errors"] += 1
        logging.error(f"Model inference failed: {e}")
        raise HTTPException(status_code=500, detail=f"Model inference failed: {e}")