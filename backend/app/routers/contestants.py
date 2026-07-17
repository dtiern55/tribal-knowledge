from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin, get_current_user
from app.schemas import (
    Contestant,
    ContestantPerformance,
    ContestantsCreateRequest,
    ContestantUpdateRequest,
)

router = APIRouter(tags=["contestants"])


@router.get(
    "/contestants/{contestant_id}/performance", response_model=ContestantPerformance
)
def get_contestant_performance(
    contestant_id: UUID, _: UUID = Depends(get_current_user)
):
    """Per-episode performance for one contestant: points, events, exit (#7)."""
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select id, name, image_url, placement, season_id"
                " from contestants where id = %s",
                [str(contestant_id)],
            )
            c = cur.fetchone()
            if not c:
                raise HTTPException(status_code=404, detail="Contestant not found")

            # Per-episode scoring events with their point value (pre/post-merge)
            cur.execute(
                """
                select ep.episode_number, et.label,
                       (case
                          when s.merge_episode is not null
                           and ep.episode_number >= s.merge_episode
                           and et.postmerge_point_value is not null
                          then et.postmerge_point_value else et.point_value
                        end)
                        * (case when et.is_per_unit then se.quantity else 1 end)
                         as points
                from scoring_events se
                join episodes ep on ep.id = se.episode_id
                join seasons s on s.id = ep.season_id
                join scoring_event_types et on et.event_type = se.event_type
                where se.contestant_id = %s
                order by ep.episode_number
                """,
                [str(contestant_id)],
            )
            events = cur.fetchall()

            cur.execute(
                """
                select ep.episode_number, el.elimination_type
                from eliminations el
                join episodes ep on ep.id = el.episode_id
                where el.contestant_id = %s
                """,
                [str(contestant_id)],
            )
            elim = cur.fetchone()
            elim_ep = elim["episode_number"] if elim else None

            # Group events by episode
            by_ep: dict[int, dict] = {}
            for row in events:
                stat = by_ep.setdefault(
                    row["episode_number"],
                    {
                        "episode_number": row["episode_number"],
                        "points": 0,
                        "events": [],
                    },
                )
                stat["points"] += row["points"]
                sign = "+" if row["points"] >= 0 else ""
                stat["events"].append(f"{row['label']} ({sign}{row['points']})")
            if elim_ep is not None:
                by_ep.setdefault(
                    elim_ep,
                    {"episode_number": elim_ep, "points": 0, "events": []},
                )["eliminated_type"] = elim["elimination_type"]

            episodes = [by_ep[k] for k in sorted(by_ep)]
            return {
                "name": c["name"],
                "image_url": c["image_url"],
                "placement": c["placement"],
                "eliminated_in_episode": elim_ep,
                "total_points": sum(e["points"] for e in episodes),
                "episodes": episodes,
            }


@router.post(
    "/seasons/{season_id}/contestants",
    response_model=list[Contestant],
    status_code=201,
)
def create_contestants(
    season_id: UUID,
    body: ContestantsCreateRequest,
    _: UUID = Depends(get_current_admin),
):
    if len(body.names) != len(set(body.names)):
        raise HTTPException(status_code=400, detail="Duplicate names in request")
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            cur.execute(
                "select name from contestants where season_id = %s and name = any(%s)",
                [str(season_id), body.names],
            )
            existing = [row["name"] for row in cur.fetchall()]
            if existing:
                raise HTTPException(
                    status_code=409, detail=f"Contestants already exist: {existing}"
                )
            rows = []
            for name in body.names:
                cur.execute(
                    "insert into contestants (season_id, name)"
                    " values (%s, %s) returning *",
                    [str(season_id), name],
                )
                rows.append(cur.fetchone())
            return rows


@router.patch("/contestants/{contestant_id}", response_model=Contestant)
def update_contestant(
    contestant_id: UUID,
    body: ContestantUpdateRequest,
    _: UUID = Depends(get_current_admin),
):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select season_id from contestants where id = %s",
                [str(contestant_id)],
            )
            existing = cur.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Contestant not found")
            if "name" in fields:
                cur.execute(
                    "select 1 from contestants"
                    " where season_id = %s and name = %s and id <> %s",
                    [existing["season_id"], fields["name"], str(contestant_id)],
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409,
                        detail="Contestant name already exists in this season",
                    )
            set_clause = ", ".join(f"{k} = %({k})s" for k in fields)
            params = {**fields, "id": str(contestant_id)}
            cur.execute(
                f"update contestants set {set_clause} where id = %(id)s returning *",
                params,
            )
            return cur.fetchone()
