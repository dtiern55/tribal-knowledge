from fastapi import FastAPI

from app import database

app = FastAPI(title="Tribal Knowledge")


@app.get("/health")
def health():
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select 1")
    return {"status": "ok"}
