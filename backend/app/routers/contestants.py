from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from psycopg2.extras import Json

from app import database
from app.auth import get_current_admin, get_current_user
from app.locking import advantages_locked, episode_locked_sql
from app.schemas import (
    CastMember,
    Contestant,
    ContestantPerformance,
    ContestantsCreateRequest,
    ContestantUpdateRequest,
)
from app.scoring import EVENT_POINTS_SQL

router = APIRouter(tags=["contestants"])


def _cast_sort_key(row: dict) -> tuple:
    """Order the cast (#7): still-in players first by score high→low, then the
    voted-out below them in reverse boot order so the first person out sits at
    the very bottom. Boot order is per-episode only; same-episode boots tie on
    name (no within-episode order is recorded)."""
    out = row["eliminated_in_episode"]
    return (
        out is not None,
        -row["total_points"] if out is None else 0,
        -(out or 0),
        row["name"],
    )


@router.get("/seasons/{season_id}/cast", response_model=list[CastMember])
def get_cast(season_id: UUID, _: UUID = Depends(get_current_user)):
    """Every contestant with their base gameplay score — raw scoring events,
    no per-user advantage doubling and no swap penalties (full cast list).
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            cur.execute(
                f"""
                select c.id, coalesce(c.nickname, c.name) as name,
                       c.image_url, c.placement,
                       -- Boot and points stay hidden until the episode locks:
                       -- scoring applied before picks_lock_at must not leak to
                       -- players who can still change their picks (#559).
                       (select min(ep2.episode_number)
                        from eliminations el
                        join episodes ep2 on ep2.id = el.episode_id
                        where el.contestant_id = c.id
                          and {episode_locked_sql("ep2")}) as eliminated_in_episode,
                       (select t.name from contestant_tribes ct
                        join tribes t on t.id = ct.tribe_id
                        where ct.contestant_id = c.id
                        order by ct.from_episode desc limit 1) as tribe_name,
                       (select t.color from contestant_tribes ct
                        join tribes t on t.id = ct.tribe_id
                        where ct.contestant_id = c.id
                        order by ct.from_episode desc limit 1) as tribe_color,
                       coalesce(sum(
                         case when ep.id is null then 0 else
                           {EVENT_POINTS_SQL}
                         end
                       ), 0) as total_points,
                       coalesce(sum(
                         case when ep.id is null then 0 else
                           et.token_value
                           * (case when et.is_per_unit then se.quantity else 1 end)
                         end
                       ), 0) as total_tokens
                from contestants c
                join seasons s on s.id = c.season_id
                left join scoring_events se on se.contestant_id = c.id
                -- Gate in the join, not the WHERE: unlocked-episode events must
                -- score 0 (via the ep.id-null guard above) without dropping a
                -- contestant whose only events are still unlocked (#559).
                left join episodes ep on ep.id = se.episode_id
                  and {episode_locked_sql("ep")}
                left join season_scoring_event_types et
                  on et.event_type = se.event_type and et.season_id = s.id
                where c.season_id = %s
                group by c.id, c.name, c.image_url, c.placement
                order by total_points desc, c.name
                """,
                [str(season_id)],
            )
            rows = cur.fetchall()

            # A finalist has a placement but no elimination — survivoR maps
            # sole survivor and runner-up to no elimination row at all
            # (survivor_import.map_elimination_type) — so their run ends at the
            # finale, and reading it off `eliminated_in_episode` finds nothing.
            cur.execute(
                "select episode_number from episodes"
                " where season_id = %s and is_finale",
                [str(season_id)],
            )
            finale = cur.fetchone()
            finale_episode = finale["episode_number"] if finale else None
            for row in rows:
                if row["eliminated_in_episode"] is not None:
                    row["final_episode"] = row["eliminated_in_episode"]
                elif row["placement"] is not None:
                    row["final_episode"] = finale_episode
                else:
                    row["final_episode"] = None

            rows.sort(key=_cast_sort_key)
            return rows


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
                "select id, name, image_url, placement, season_id,"
                " age, occupation, hometown, bio, bio_qa,"
                " (select t.name from contestant_tribes ct"
                "  join tribes t on t.id = ct.tribe_id"
                "  where ct.contestant_id = contestants.id"
                "  order by ct.from_episode desc limit 1) as tribe_name,"
                " (select t.color from contestant_tribes ct"
                "  join tribes t on t.id = ct.tribe_id"
                "  where ct.contestant_id = contestants.id"
                "  order by ct.from_episode desc limit 1) as tribe_color"
                " from contestants where id = %s",
                [str(contestant_id)],
            )
            c = cur.fetchone()
            if not c:
                raise HTTPException(status_code=404, detail="Contestant not found")

            # Per-episode scoring events with their point value (pre/post-merge)
            cur.execute(
                f"""
                select ep.episode_number, ep.is_finale, et.label,
                       {EVENT_POINTS_SQL}
                         as points,
                       et.token_value
                        * (case when et.is_per_unit then se.quantity else 1 end)
                         as token_value,
                       (case when et.is_per_unit then se.quantity else 1 end)
                         as quantity
                from scoring_events se
                join episodes ep on ep.id = se.episode_id
                join seasons s on s.id = ep.season_id
                join season_scoring_event_types et
                  on et.event_type = se.event_type and et.season_id = s.id
                -- Hidden until the episode locks (#559).
                where se.contestant_id = %s and {episode_locked_sql("ep")}
                order by ep.episode_number
                """,
                [str(contestant_id)],
            )
            events = cur.fetchall()

            cur.execute(
                f"""
                select ep.episode_number, ep.is_finale, el.elimination_type
                from eliminations el
                join episodes ep on ep.id = el.episode_id
                where el.contestant_id = %s and {episode_locked_sql("ep")}
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
                        "is_finale": row["is_finale"],
                    },
                )
                stat["points"] += row["points"]
                stat["events"].append(
                    {
                        "label": row["label"],
                        "points": row["points"],
                        "token_value": row["token_value"],
                        "quantity": row["quantity"],
                    }
                )
            if elim_ep is not None:
                by_ep.setdefault(
                    elim_ep,
                    {
                        "episode_number": elim_ep,
                        "points": 0,
                        "events": [],
                        "is_finale": elim["is_finale"],
                    },
                )["eliminated_type"] = elim["elimination_type"]

            # Token earning stops at the advantage cutoff (#102). Without this
            # the page renders an event's token_value as though it were paid
            # (#295) — on a locked episode nobody received anything. The lock
            # is a league-season knob now (#595); tokens only ever existed in
            # the single-league era, so the season's first league-season is
            # exactly the one that paid them.
            cur.execute(
                "select advantage_lock_episode from league_seasons"
                " where season_id = %s order by created_at limit 1",
                [str(c["season_id"])],
            )
            row = cur.fetchone()
            adv_lock = row["advantage_lock_episode"] if row else None
            for stat in by_ep.values():
                stat["tokens_locked"] = advantages_locked(
                    stat["episode_number"], stat["is_finale"], adv_lock
                )

            episodes = [by_ep[k] for k in sorted(by_ep)]
            return {
                "name": c["name"],
                "image_url": c["image_url"],
                "placement": c["placement"],
                "eliminated_in_episode": elim_ep,
                "tribe_name": c["tribe_name"],
                "tribe_color": c["tribe_color"],
                "age": c["age"],
                "occupation": c["occupation"],
                "hometown": c["hometown"],
                "bio": c["bio"],
                "bio_qa": c["bio_qa"],
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
    # Blank nickname clears it — else coalesce(nickname, name) would render "".
    if fields.get("nickname") == "":
        fields["nickname"] = None
    if "bio_qa" in fields:
        fields["bio_qa"] = Json(fields["bio_qa"])
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
            if fields.get("placement") is not None:
                cur.execute(
                    "select name from contestants"
                    " where season_id = %s and placement = %s and id <> %s",
                    [existing["season_id"], fields["placement"], str(contestant_id)],
                )
                other = cur.fetchone()
                if other:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"Placement {fields['placement']} is already"
                            f" assigned to {other['name']}"
                        ),
                    )
            set_clause = ", ".join(f"{k} = %({k})s" for k in fields)
            params = {**fields, "id": str(contestant_id)}
            cur.execute(
                f"update contestants set {set_clause} where id = %(id)s returning *",
                params,
            )
            # Placement events are maintained by a DB trigger, so every writer
            # stays consistent — not just this endpoint.
            return cur.fetchone()
