from fastapi import FastAPI

from app.database import get_db

app = FastAPI(title="Tribal Knowledge")


@app.get("/health")
def health():
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select 1")
    return {"status": "ok"}
