from fastapi import FastAPI

from app import database
from app.routers import seasons

app = FastAPI(title="Tribal Knowledge")
app.include_router(seasons.router)


@app.get("/health")
def health():
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select 1")
    return {"status": "ok"}
