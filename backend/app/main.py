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
    league_settings,
    me,
    picks,
    roster,
    rules,
    scoring_events,
    seasons,
    standings,
    survivor_import,
    tokens,
    tribes,
    tvmaze,
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
    # Vercel preview deployments get per-branch subdomains; a regex lets them
    # hit the API so UI changes are testable pre-merge (set in fly.toml).
    allow_origin_regex=os.environ.get("CORS_ORIGIN_REGEX"),
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
app.include_router(league_settings.router)
app.include_router(rules.router)
app.include_router(survivor_import.router)
app.include_router(tvmaze.router)
app.include_router(tribes.router)


@app.get("/health")
def health():
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select 1")
    return {"status": "ok"}
