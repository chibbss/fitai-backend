# modal_vllm.py - Production-grade vLLM deployment with FastAPI proxy
# Supports automatic max_model_len detection per model

import os
import modal
import subprocess
import time
import socket
from fastapi import FastAPI, Request, Response
import httpx
from pathlib import Path
import json
import requests

# -------------------------------------------------
# Modal image with CUDA + Python + vLLM
# -------------------------------------------------
image = (
    modal.Image.from_registry("nvidia/cuda:12.8.0-devel-ubuntu22.04", add_python="3.12")
    .uv_pip_install(
        "vllm==0.10.2",
        "transformers>=4.44.2",
        "accelerate>=0.34.2",
        "outlines==0.0.46",
        "httpx>=0.28.1",
        "hf_transfer",
    )
    .env({
        "HF_HUB_ENABLE_HF_TRANSFER": "1",
        "PYTHONUNBUFFERED": "1",
    })
)

app = modal.App("fitai-vllm")


def get_model_max_length(model_name: str, hf_token: str | None) -> int:
    """
    Detect max model length from HF config.json, but cap at safe limit for A10G GPU.
    A10G has ~24GB VRAM, but KV cache is limited. Safe max is 8192 tokens.
    Model's native max (131072) requires 16GB KV cache, but A10G only has 3.66GB available.
    """
    try:
        # Attempt to read remote config.json from HuggingFace Hub
        headers = {"Authorization": f"Bearer {hf_token}"} if hf_token else {}
        url = f"https://huggingface.co/{model_name}/resolve/main/config.json"
        r = requests.get(url, headers=headers, timeout=10)
        r.raise_for_status()
        config = r.json()
        max_len = config.get("max_position_embeddings") or config.get("model_max_length") or 2048
        # Cap at 8192 for A10G GPU (safe limit, prevents KV cache OOM)
        # Error message suggested max 29952, but 8192 is safer and sufficient for chat
        capped_len = min(int(max_len), 8192)
        if capped_len < int(max_len):
            print(f"[vllm] Capping max_model_len from {max_len} to {capped_len} for A10G GPU compatibility")
        return capped_len
    except Exception as e:
        print(f"[vllm] Warning: Could not fetch model max length: {e}, using 8192")
        return 8192


@app.function(
    image=image,
    gpu="A10G",
    timeout=60 * 60 * 24,
    scaledown_window=300,  # Scale to zero after 5 minutes (Modal 1.0+ syntax)
    secrets=[modal.Secret.from_name("hf-token")],
)
@modal.asgi_app()
def serve():
    MODEL = os.environ.get("MODEL", "meta-llama/Llama-3.1-8B-Instruct")
    HF_TOKEN = os.environ.get("HF_TOKEN")
    VLLM_HOST = "127.0.0.1"
    VLLM_PORT = 8001
    STARTUP_TIMEOUT_SECONDS = int(os.environ.get("STARTUP_TIMEOUT_SECONDS", "600"))

    max_model_len = get_model_max_length(MODEL, HF_TOKEN)
    print(f"[vllm] Using max_model_len={max_model_len} for model {MODEL}")

    app = FastAPI()

    # -------------------------------------------------
    # Start vLLM synchronously and wait until ready
    # -------------------------------------------------
    cmd = [
        "python", "-m", "vllm.entrypoints.openai.api_server",
        "--host", "0.0.0.0",
        "--port", str(VLLM_PORT),
        "--model", MODEL,
        "--dtype", "float16",
        "--gpu-memory-utilization", "0.9",
        "--max-model-len", str(max_model_len),
        "--trust-remote-code",
    ]

    env = os.environ.copy()
    if HF_TOKEN:
        env["HF_TOKEN"] = HF_TOKEN
    env["VLLM_USE_OUTLINES"] = "0"
    env["VLLM_WORKER_DISABLE_GUIDED_DECODING"] = "1"
    env["OUTLINES_DISABLE_TYPES"] = "1"

    print(f"[vllm] Starting vLLM server for model {MODEL} on port {VLLM_PORT}...")
    proc = subprocess.Popen(
        cmd,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    # Stream vLLM logs to Modal console
    import threading
    def stream_logs():
        if proc.stdout is None:
            return
        for line in proc.stdout:
            print(f"[vllm] {line}", end="")
    threading.Thread(target=stream_logs, daemon=True).start()

    # Wait for vLLM to be ready
    deadline = time.time() + STARTUP_TIMEOUT_SECONDS
    vllm_ready = False
    while time.time() < deadline:
        try:
            with socket.create_connection((VLLM_HOST, VLLM_PORT), timeout=0.5):
                vllm_ready = True
                print("[vllm] vLLM server is ready!")
                break
        except Exception:
            time.sleep(0.5)

    if not vllm_ready:
        raise RuntimeError(f"vLLM server did not start within {STARTUP_TIMEOUT_SECONDS}s")

    # -------------------------------------------------
    # FastAPI endpoints
    # -------------------------------------------------
    @app.get("/")
    async def root():
        return {"status": "ok", "model": MODEL, "vllm_ready": True}

    @app.get("/health")
    async def health():
        return {"status": "ok", "model": MODEL}

    # Optional reranker hosted alongside vLLM (simple CrossEncoder API)
    try:
        from sentence_transformers import CrossEncoder  # type: ignore
        _reranker = None

        def _ensure_reranker(name: str):
            nonlocal _reranker
            if _reranker is None or getattr(_reranker, "model_name", None) != name:
                _reranker = CrossEncoder(name)  # type: ignore
                setattr(_reranker, "model_name", name)
            return _reranker

        @app.post("/rerank")
        async def rerank(req: dict):
            query = req.get("query") or ""
            texts = req.get("texts") or []
            model = req.get("model") or "cross-encoder/ms-marco-MiniLM-L-6-v2"
            if not texts:
                return {"scores": [], "model": model}
            m = _ensure_reranker(model)
            pairs = [(query, t) for t in texts]
            scores = m.predict(pairs)  # type: ignore
            return {"scores": [float(s) for s in scores], "model": getattr(m, "model_name", model)}
    except Exception:
        pass

    async def proxy(request: Request) -> Response:
        target_url = f"http://{VLLM_HOST}:{VLLM_PORT}{request.url.path}"
        if request.url.query:
            target_url += f"?{request.url.query}"
        headers = {k: v for k, v in request.headers.items() if k.lower() not in ["host", "content-length", "connection"]}
        body = await request.body()
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.request(request.method.upper(), target_url, headers=headers, content=body)
        response_headers = {}
        if "content-type" in resp.headers:
            response_headers["content-type"] = resp.headers["content-type"]
        return Response(content=resp.content, status_code=resp.status_code, headers=response_headers)

    # Proxy OpenAI endpoints
    app.add_api_route("/v1/completions", proxy, methods=["GET", "POST"])
    app.add_api_route("/v1/chat/completions", proxy, methods=["GET", "POST"])
    app.add_api_route("/v1/models", proxy, methods=["GET"])

    return app