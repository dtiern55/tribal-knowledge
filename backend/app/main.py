import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# app.database calls load_dotenv() at import, before CORS_ORIGINS is read below
from app import database
from app.routers import (
    advantage_plays,
    contestants,
    eliminations,
    episodes,
    finale_predictions,
    me,
    picks,
    roster,
    scoring_events,
    seasons,
    standings,
    tokens,
    winner_picks,
)

app = FastAPI(title="Tribal Knowledge")

_origins = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(me.router)
app.include_router(advantage_plays.router)
app.include_router(seasons.router)
app.include_router(episodes.router)
app.include_router(contestants.router)
app.include_router(eliminations.router)
app.include_router(scoring_events.router)
app.include_router(roster.router)
app.include_router(picks.router)
app.include_router(finale_predictions.router)
app.include_router(tokens.router)
app.include_router(winner_picks.router)
app.include_router(standings.router)


@app.get("/health")
def health():
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select 1")
    return {"status": "ok"}
