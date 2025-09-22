from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI()

# request schema
class ChatRequest(BaseModel):
    message: str

# health check
@app.get("/health")
def health_check():
    return {"status": "ok"}

# chat endpoint
@app.post("/chat")
def chat_endpoint(req: ChatRequest):
    return {"reply": f"Echo: {req.message}"}