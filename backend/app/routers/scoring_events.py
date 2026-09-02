from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin, get_current_user
from app.schemas import ScoringEvent, ScoringEventEntry, ScoringEventType

router = APIRouter(tags=["scoring_events"])


@router.get(
    "/seasons/{season_id}/scoring-event-types",
    response_model=list[ScoringEventType],
)
def list_scoring_event_types(season_id: UUID, _: UUID = Depends(get_current_user)):
    """The season's event types and display labels (#170: season snapshot).

    Retired types (#307) are hidden so they can't be entered on new episodes.
    Scoring never filters on `enabled` — events already recorded, and whole
    seasons snapshotted before a retirement, must keep scoring as they did.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            cur.execute(
                "select event_type, label from season_scoring_event_types"
                " where season_id = %s and enabled order by label",
                [str(season_id)],
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
                # `and enabled` (#307): a retired type can't be entered on a
                # new episode. Seasons snapshotted before a retirement still
                # carry enabled = true, so their history stays re-enterable.
                cur.execute(
                    "select event_type"
                    " from season_scoring_event_types"
                    " where season_id = %s and event_type = any(%s) and enabled",
                    [str(episode["season_id"]), event_types],
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
                rows.append(cur.fetchone())
            # The per-owner token grant that used to follow each insert went
            # with the token economy (#307): every current event type carries
            # token_value 0, and the ledger is read-only history now.
            return rows


@router.delete("/scoring-events/{event_id}", status_code=204)
def delete_scoring_event(event_id: UUID, _: UUID = Depends(get_current_admin)):
    """Remove one scoring event and reverse its token grants (issue #71)."""
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from scoring_events where id = %s", [str(event_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Scoring event not found")
            # Reversing a grant whose tokens were already spent would strand
            # the player below zero — surface it instead (#120).
            cur.execute(
                """
                select 1 from token_transactions tt
                where tt.scoring_event_id = %s
                group by tt.user_id, tt.league_season_id
                having (select coalesce(sum(amount), 0) from token_transactions t
                        where t.user_id = tt.user_id
                          and t.league_season_id = tt.league_season_id)
                       < sum(tt.amount)
                limit 1
                """,
                [str(event_id)],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Cannot delete: a player already spent the tokens this"
                        " event granted, so reversing it would make their"
                        " balance negative"
                    ),
                )
            # token_transactions.scoring_event_id has no cascade — clear first
            cur.execute(
                "delete from token_transactions where scoring_event_id = %s",
                [str(event_id)],
            )
            cur.execute("delete from scoring_events where id = %s", [str(event_id)])
