## Production-Ready RAG API (FastAPI + Postgres/pgvector + HF)

This project provides a clean, production-ready Retrieval-Augmented Generation (RAG) API using FastAPI, SentenceTransformers for embeddings, Postgres with pgvector for retrieval, and a Hugging Face text generation model.

### Features
- Clean modular structure: `main.py`, `rag.py`, `utils.py`
- SentenceTransformers embeddings (default: `all-MiniLM-L6-v2`)
- Postgres + pgvector for vector search with cosine distance
- Hugging Face generator (default: `microsoft/phi-3-mini-4k-instruct`)
- dotenv configuration, logging, structured JSON responses
- Endpoints: `/chat`, `/add_docs`, `/reembed_all`, `/health`
- Persistent storage in Postgres (documents/chunks tables)
- Runs on CPU or GPU (configurable with `DEVICE`)

### Folder Structure
```
.
├── main.py
├── rag.py
├── utils.py
├── requirements.txt
└── .env.example
```

### Setup
1. Python 3.10+ recommended.
2. Create and activate a virtualenv.
```bash
python -m venv .venv
source .venv/bin/activate
```
3. Install dependencies.
```bash
pip install -r requirements.txt
```
4. Copy environment file and adjust as needed.
```bash
cp .env.example .env
# Edit .env to set HF_MODEL_ID, DEVICE, and DATABASE_URL
```
5. Provision Postgres with pgvector
   - Locally via Docker:
```bash
docker run --name fitai-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fitai -p 5432:5432 -d pgvector/pgvector:pg16
```
   - Or use a managed Postgres (Supabase/Neon/RDS) and enable the `vector` extension.

6. For GPU: install a CUDA-enabled torch matching your CUDA version per PyTorch site.
```bash
# Example for CUDA 12.1 (check pytorch.org for your environment)
pip install --index-url https://download.pytorch.org/whl/cu121 torch torchvision torchaudio
```
6. No FAISS required; retrieval runs in Postgres with pgvector.

### Running Locally
```bash
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```
Open docs at `http://localhost:8000/docs`.

### Endpoints
- `GET /health` – simple health check
- `POST /add_docs` – add new documents (per-user or global)
- `POST /reembed_all` – recompute embeddings for all (or for one user)
- `POST /chat` – Personalized RAG chat (STATIC + SESSION + DYNAMIC + KB)
- `GET /users/{user_id}` – fetch user profile/goals
- `PUT /users/{user_id}` – upsert user profile/goals
- `POST /add_training_log` – add a personal log (embeds `notes`)
- `GET /history?user_id=...` – retrieve recent logs
- `POST /onboarding_step` – incremental onboarding updates to profile/goals

### Example cURL Requests
Add documents (for a user; set user_id to null for global docs):
```bash
curl -X POST http://localhost:8000/add_docs \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "user_123",
    "documents": [
      {"id": "doc1", "text": "FastAPI is a modern, fast web framework for building APIs.", "metadata": {"source": "wiki"}},
      {"text": "FAISS enables efficient similarity search and clustering of dense vectors.", "metadata": {"source": "notes"}}
    ]
  }'
```
Re-embed all vectors (optionally filtered by user_id):
```bash
curl -X POST 'http://localhost:8000/reembed_all?user_id=user_123'
```
Chat (minimal payload for end-users):
```bash
curl -X POST http://localhost:8000/chat \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "user_123",
    "session_id": "sess_abc",
    "query": "What is FastAPI?"
  }'
```
User profile upsert:
```bash
curl -X PUT http://localhost:8000/users/user_123 \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "Chibs",
    "profile": {"age": 28, "height": 178, "weight": 78, "gender": "male"},
    "goals": {"goal": "cut", "split": "push/pull/legs", "nutrition": "high protein"}
  }'
```

Add training log:
```bash
curl -X POST http://localhost:8000/add_training_log \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "user_123",
    "kind": "workout",
    "topic": "legs",
    "tags": ["legs", "strength"],
    "notes": "Back squats 5x5 at 100kg, felt strong but knees a bit tight"
  }'
```

Get history:
```bash
curl -X GET 'http://localhost:8000/history?user_id=user_123&limit=20'
```

Onboarding step:
```bash
curl -X POST http://localhost:8000/onboarding_step \
  -H 'Content-Type: application/json' \
  -d '{
    "user_id": "user_123",
    "step": "basic",
    "data": {"name": "Chibs", "age": 28, "height": 178, "weight": 78, "gender": "male"}
  }'
```


### Configuration (`.env`)
See `.env.example` for all options:
- `HF_MODEL_ID`: Hugging Face model id (e.g., `microsoft/phi-3-mini-4k-instruct`)
- `HF_TOKEN`: optional token for gated/private models
- `EMBEDDING_MODEL_NAME`: SentenceTransformers model id
- `FAISS_INDEX_PATH`, `DOCSTORE_PATH`: persistence locations under `data/`
- `DEVICE`: `auto` | `cuda` | `cpu`
- `TOP_K`, `CHUNK_SIZE_TOKENS`, `CHUNK_OVERLAP_TOKENS`
- `MAX_NEW_TOKENS`, `TEMPERATURE`

### Run on GPU Pods (e.g., RunPod)
- Set `DEVICE=cuda` in `.env`.
- Ensure the container has NVIDIA drivers and CUDA runtime.
- Install a CUDA-enabled `torch` matching your CUDA version.
- Optionally enable `faiss-gpu` if you want GPU indexing (CPU FAISS is fine for many cases).

### Notes on Tokenization and Chunking
- The system uses the embedding model tokenizer, when available, to chunk by tokens (`CHUNK_SIZE_TOKENS` and `CHUNK_OVERLAP_TOKENS`).
- If the tokenizer cannot be loaded, a character-based fallback is used.

### Persistence
- Documents and per-chunk metadata are stored in Postgres tables `documents` and `chunks`.
- The API creates the `vector` extension and indexes on startup.
- Static profiles/goals live in `users`. Dynamic logs (embedded) live in `training_logs` with HNSW indexes.

### Extending for Fine-Tuned Models
- Swap `HF_MODEL_ID` to your fine-tuned model on Hugging Face or local path.
- If the fine-tuned model uses LoRA adapters, you can load with PEFT:
```python
from peft import PeftModel
base = AutoModelForCausalLM.from_pretrained(BASE_ID, device_map="auto")
model = PeftModel.from_pretrained(base, LORA_ID)
```
- Ensure the tokenizer matches the base model or the fine-tuned variant.
- Adjust generation defaults via `.env`.

### Production Considerations
- Put uvicorn behind a process manager (e.g., gunicorn with uvicorn workers).
- Add request limits and auth as needed.
- Consider model warmup at startup.
- Back up Postgres regularly; use point-in-time recovery if available.
- Add observability (Prometheus metrics, tracing) as needed.