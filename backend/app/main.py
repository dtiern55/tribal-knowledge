from fastapi import FastAPI

from app import database
from app.routers import (
    contestants,
    episodes,
    picks,
    roster,
    seasons,
    standings,
)

app = FastAPI(title="Tribal Knowledge")
app.include_router(seasons.router)
app.include_router(episodes.router)
app.include_router(contestants.router)
app.include_router(roster.router)
app.include_router(picks.router)
app.include_router(standings.router)


@app.get("/health")
def health():
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select 1")
    return {"status": "ok"}
