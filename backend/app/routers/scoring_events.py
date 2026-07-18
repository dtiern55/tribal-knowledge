from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin, get_current_user
from app.locking import advantages_locked
from app.schemas import ScoringEvent, ScoringEventEntry, ScoringEventType

router = APIRouter(tags=["scoring_events"])


@router.get("/scoring-event-types", response_model=list[ScoringEventType])
def list_scoring_event_types(_: UUID = Depends(get_current_user)):
    """Event types and their display labels — the DB is the source of truth."""
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select event_type, label from scoring_event_types order by label"
            )
            return cur.fetchall()


@router.get("/episodes/{episode_id}/scoring-events", response_model=list[ScoringEvent])
def list_scoring_events(episode_id: UUID, _: UUID = Depends(get_current_user)):
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
def set_scoring_events(
    episode_id: UUID,
    body: list[ScoringEventEntry],
    _: UUID = Depends(get_current_admin),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select season_id, episode_number, is_finale"
                " from episodes where id = %s",
                [str(episode_id)],
            )
            episode = cur.fetchone()
            if not episode:
                raise HTTPException(status_code=404, detail="Episode not found")

            # Token earning stops at the advantage cutoff (issue #102): events
            # are still recorded for context, but grant no tokens past it.
            cur.execute(
                "select advantage_lock_episode from seasons where id = %s",
                [str(episode["season_id"])],
            )
            tokens_locked = advantages_locked(
                episode["episode_number"],
                episode["is_finale"],
                cur.fetchone()["advantage_lock_episode"],
            )

            event_type_info: dict[str, dict] = {}
            if body:
                contestant_ids = list({str(e.contestant_id) for e in body})
                cur.execute(
                    "select id::text from contestants"
                    " where season_id = %s and id::text = any(%s)",
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
                    "select event_type, token_value, is_per_unit"
                    " from scoring_event_types where event_type = any(%s)",
                    [event_types],
                )
                for row in cur.fetchall():
                    event_type_info[row["event_type"]] = row
                invalid_types = [t for t in event_types if t not in event_type_info]
                if invalid_types:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unknown event types: {invalid_types}",
                    )

            # Additive: append the submitted events, never wipe existing ones
            # (issue #71). Remove individual events via DELETE /scoring-events/{id}.
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
                se = cur.fetchone()
                rows.append(se)

                info = event_type_info.get(entry.event_type, {})
                token_value = info.get("token_value", 0)
                if token_value and token_value > 0 and not tokens_locked:
                    amount = (
                        token_value * entry.quantity
                        if info.get("is_per_unit")
                        else token_value
                    )
                    cur.execute(
                        """
                        select user_id::text from roster_picks
                        where season_id = %s and contestant_id = %s
                          and active_from_episode <= %s
                          and (active_until_episode is null
                               or active_until_episode >= %s)
                        """,
                        [
                            str(episode["season_id"]),
                            str(entry.contestant_id),
                            episode["episode_number"],
                            episode["episode_number"],
                        ],
                    )
                    for owner in cur.fetchall():
                        cur.execute(
                            """
                            insert into token_transactions
                                (user_id, season_id, episode_id, transaction_type,
                                 amount, scoring_event_id)
                            values (%s, %s, %s, 'gameplay_event', %s, %s)
                            """,
                            [
                                owner["user_id"],
                                str(episode["season_id"]),
                                str(episode_id),
                                amount,
                                str(se["id"]),
                            ],
                        )
            return rows


@router.delete("/scoring-events/{event_id}", status_code=204)
def delete_scoring_event(event_id: UUID, _: UUID = Depends(get_current_admin)):
    """Remove one scoring event and reverse its token grants (issue #71)."""
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from scoring_events where id = %s", [str(event_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Scoring event not found")
            # token_transactions.scoring_event_id has no cascade — clear first
            cur.execute(
                "delete from token_transactions where scoring_event_id = %s",
                [str(event_id)],
            )
            cur.execute("delete from scoring_events where id = %s", [str(event_id)])
