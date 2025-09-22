# FitAI Backend

Backend for the **FitAI fitness assistant app**. Built with [FastAPI](https://fastapi.tiangolo.com/) and served via [uvicorn](https://www.uvicorn.org/).

---

## 🚀 Features (Week 1 MVP)
- `/health` endpoint → check server status.
- `/chat` endpoint → echoes back user message.
- JSON-based API contract (ready for frontend integration).

---

## ⚡️ Setup & Run

```bash
# 1. Clone repo
git clone https://github.com/chibbss/fitai-backend.git
cd fitai-backend

# 2. Create virtual environment
python3 -m venv venv
source venv/bin/activate   # Mac/Linux
venv\Scripts\activate      # Windows

# 3. Install dependencies
pip install fastapi uvicorn

# 4. Run server
uvicorn main:app --reload
```
### API Contract

POST /chat
Request:
{
  "message": "string"
}
Response:
{
  "reply": "string"
}
