from uuid import UUID

from fastapi import APIRouter, HTTPException

from app import database
from app.schemas import ScoringEvent, ScoringEventEntry

router = APIRouter(tags=["scoring_events"])


@router.get("/episodes/{episode_id}/scoring-events", response_model=list[ScoringEvent])
def list_scoring_events(episode_id: UUID):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from episodes where id = %s", [str(episode_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Episode not found")
            cur.execute(
                "select * from scoring_events"
                " where episode_id = %s order by created_at",
                [str(episode_id)],
            )
            return cur.fetchall()


@router.post("/episodes/{episode_id}/scoring-events", response_model=list[ScoringEvent])
def set_scoring_events(episode_id: UUID, body: list[ScoringEventEntry]):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select season_id from episodes where id = %s", [str(episode_id)]
            )
            episode = cur.fetchone()
            if not episode:
                raise HTTPException(status_code=404, detail="Episode not found")

            if body:
                contestant_ids = list({str(e.contestant_id) for e in body})
                cur.execute(
                    "select id::text from contestants"
                    " where season_id = %s and id = any(%s)",
                    [str(episode["season_id"]), contestant_ids],
                )
                valid_ids = {row["id"] for row in cur.fetchall()}
                invalid = [c for c in contestant_ids if c not in valid_ids]
                if invalid:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Contestants not in this season: {invalid}",
                    )

                event_types = list({e.event_type for e in body})
                cur.execute(
                    "select event_type from scoring_event_types"
                    " where event_type = any(%s)",
                    [event_types],
                )
                valid_types = {row["event_type"] for row in cur.fetchall()}
                invalid_types = [t for t in event_types if t not in valid_types]
                if invalid_types:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unknown event types: {invalid_types}",
                    )

            cur.execute(
                "delete from scoring_events where episode_id = %s", [str(episode_id)]
            )

            rows = []
            for entry in body:
                cur.execute(
                    """
                    insert into scoring_events
                        (episode_id, contestant_id, event_type, quantity, notes)
                    values (%s, %s, %s, %s, %s) returning *
                    """,
                    [
                        str(episode_id),
                        str(entry.contestant_id),
                        entry.event_type,
                        entry.quantity,
                        entry.notes,
                    ],
                )
                rows.append(cur.fetchone())
            return rows
