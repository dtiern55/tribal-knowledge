from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database, scoring
from app.auth import get_current_admin, get_current_user
from app.locking import advantages_locked, episode_locked
from app.schemas import (
    Episode,
    EpisodeCreateRequest,
    EpisodeUpdateRequest,
    HubEntry,
)

router = APIRouter(tags=["episodes"])

# Most-recent tribe for a contestant, for the avatar chip. Same lateral join
# the standings glance uses (#83).
_TRIBE_LATERAL = """
    left join lateral (
      select t.name, t.color
      from contestant_tribes ct
      join tribes t on t.id = ct.tribe_id
      where ct.contestant_id = c.id
      order by ct.from_episode desc
      limit 1
    ) tribe on true
"""

# Used when a season has no schedule and the caller omits the value — the
# pre-#269 hand-set default.
DEFAULT_ELIMINATION_PICKS = 3


def resolve_max_elimination_picks(schedule: list[dict], episode_number: int) -> int:
    """How many elimination picks an episode gets under the season's tier
    schedule (#269): the highest tier whose from_episode has been reached."""
    reached = [t for t in schedule if t["from_episode"] <= episode_number]
    if not reached:
        return DEFAULT_ELIMINATION_PICKS
    return max(reached, key=lambda t: t["from_episode"])["picks"]


@router.get("/seasons/{season_id}/episodes", response_model=list[Episode])
def list_episodes(season_id: UUID, _: UUID = Depends(get_current_user)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            cur.execute(
                "select * from episodes where season_id = %s order by episode_number",
                [str(season_id)],
            )
            return cur.fetchall()


@router.post("/seasons/{season_id}/episodes", response_model=Episode, status_code=201)
def create_episode(
    season_id: UUID, body: EpisodeCreateRequest, _: UUID = Depends(get_current_admin)
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            cur.execute(
                "select 1 from episodes where season_id = %s and episode_number = %s",
                [str(season_id), body.episode_number],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409, detail="episode_number already exists"
                )
            if body.is_finale:
                cur.execute(
                    "select 1 from episodes where season_id = %s and is_finale",
                    [str(season_id)],
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409,
                        detail="Season already has a finale episode",
                    )
            params = {**body.model_dump(), "season_id": str(season_id)}
            if params["max_elimination_picks"] is None:
                params["max_elimination_picks"] = resolve_max_elimination_picks(
                    season["elimination_pick_schedule"], body.episode_number
                )
            cur.execute(
                """
                insert into episodes
                    (season_id, episode_number, air_date, max_elimination_picks,
                     is_finale, picks_lock_at, title)
                values
                    (%(season_id)s, %(episode_number)s, %(air_date)s,
                     %(max_elimination_picks)s, %(is_finale)s, %(picks_lock_at)s,
                     %(title)s)
                returning *
                """,
                params,
            )
            episode = cur.fetchone()

            # INERT since #307: tokens buy nothing now (one free advantage
            # play per week replaced them) and weekly_token_allocation
            # defaults to 0, so this no-ops for every new season. Kept, not
            # deleted, so the economy can be switched back on for a season if
            # the weekly-play experiment doesn't hold up.
            #
            # Fund the episode the moment its row exists (#217): one weekly
            # allocation per player per episode, granted here rather than when
            # the prior episode is scored — so a grant can never be silently
            # lost by scoring before the next episode has been created, and no
            # manual season-start bootstrap is required. Skipped past the
            # advantage lock (nothing left to spend on) or when allocation is 0.
            amount = season["weekly_token_allocation"]
            if amount > 0 and not advantages_locked(
                episode["episode_number"],
                episode["is_finale"],
                season["advantage_lock_episode"],
            ):
                cur.execute(
                    """
                    insert into token_transactions
                        (user_id, season_id, episode_id, transaction_type, amount)
                    select p.id, %(season)s, %(episode)s, 'weekly_allocation',
                           %(amount)s
                    from profiles p
                    where p.is_player
                    on conflict do nothing
                    """,
                    {
                        "season": str(season_id),
                        "episode": str(episode["id"]),
                        "amount": amount,
                    },
                )
            return episode


@router.patch("/episodes/{episode_id}", response_model=Episode)
def update_episode(
    episode_id: UUID, body: EpisodeUpdateRequest, _: UUID = Depends(get_current_admin)
):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select season_id from episodes where id = %s", [str(episode_id)]
            )
            existing = cur.fetchone()
            if not existing:
                raise HTTPException(status_code=404, detail="Episode not found")
            if "episode_number" in fields:
                cur.execute(
                    "select 1 from episodes"
                    " where season_id = %s and episode_number = %s and id <> %s",
                    [existing["season_id"], fields["episode_number"], str(episode_id)],
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409, detail="episode_number already exists"
                    )
            if fields.get("is_finale"):
                cur.execute(
                    "select 1 from episodes"
                    " where season_id = %s and is_finale and id <> %s",
                    [existing["season_id"], str(episode_id)],
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409,
                        detail="Season already has a finale episode",
                    )
            set_clause = ", ".join(f"{k} = %({k})s" for k in fields)
            params = {**fields, "id": str(episode_id)}
            cur.execute(
                f"update episodes set {set_clause} where id = %(id)s returning *",
                params,
            )
            return cur.fetchone()


@router.post("/episodes/{episode_id}/score", response_model=Episode)
def score_episode(episode_id: UUID, _: UUID = Depends(get_current_admin)):
    """Mark the episode scored — one admin action ends the Friday ritual
    (issue #49). Weekly token allocations are granted at episode-create time,
    not here (#217).
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select * from episodes where id = %s", [str(episode_id)])
            episode = cur.fetchone()
            if not episode:
                raise HTTPException(status_code=404, detail="Episode not found")
            if episode["status"] == "scored":
                raise HTTPException(status_code=409, detail="Episode already scored")
            if datetime.now(timezone.utc) < episode["picks_lock_at"]:
                raise HTTPException(
                    status_code=400,
                    detail="Cannot score episode before picks are locked",
                )
            # Auto-unplay unused extra votes (#157): played-but-unused vote
            # capacity is an artifact of the play-then-pick two-step, not a
            # strategic choice — revert the surplus plays (newest first) to
            # inventory so they can be replayed later. Nothing is refunded;
            # inventory left at season end stays dead per #85.
            cur.execute(
                """
                with played as (
                    select ap.id, ap.user_id,
                           row_number() over (partition by ap.user_id
                                              order by ap.created_at desc) as rn,
                           count(*) over (partition by ap.user_id) as extras
                    from advantage_plays ap
                    where ap.episode_id = %(ep)s
                      and ap.advantage_type = 'extra_vote'
                ), picked as (
                    select user_id, count(*) as n from elimination_picks
                    where episode_id = %(ep)s group by user_id
                )
                update advantage_plays set episode_id = null
                where id in (
                    select p.id from played p
                    left join picked k on k.user_id = p.user_id
                    -- unused capacity = (base max + extras) - picks made
                    where p.rn <= least(
                        p.extras,
                        %(base)s + p.extras - coalesce(k.n, 0)
                    )
                )
                """,
                {"ep": str(episode_id), "base": episode["max_elimination_picks"]},
            )

            # Weekly token allocations are granted when an episode is created,
            # not here (#217). Scoring only closes the episode out.
            cur.execute(
                "update episodes set status = 'scored' where id = %s returning *",
                [str(episode_id)],
            )
            return cur.fetchone()


@router.get("/episodes/{episode_id}/hub", response_model=list[HubEntry])
def get_episode_hub(episode_id: UUID, _: UUID = Depends(get_current_user)):
    """The locked-state league Hub (#490): every player's frozen choices for
    the airing episode — roster, this-episode ballot, and any played advantage.

    Only served once the episode locks. Before then each player's picks are
    403 to everyone else; after lock they're all public, so the Hub is just an
    aggregate view over data the per-player endpoints already expose. Stats
    (top boots, advantage tally) are derived on the client from this table.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select season_id, picks_lock_at, status from episodes where id = %s",
                [str(episode_id)],
            )
            episode = cur.fetchone()
            if not episode:
                raise HTTPException(status_code=404, detail="Episode not found")
            if not episode_locked(episode):
                raise HTTPException(
                    status_code=403,
                    detail="The Hub opens when the episode locks",
                )
            season_id = str(episode["season_id"])

            # Active rosters for the whole league (still-in-inventory picks).
            cur.execute(
                f"""
                select rp.user_id::text as user_id, c.id::text as contestant_id,
                       c.name, c.image_url,
                       tribe.name as tribe_name, tribe.color as tribe_color
                from roster_picks rp
                join contestants c on c.id = rp.contestant_id
                {_TRIBE_LATERAL}
                where rp.season_id = %s and rp.active_until_episode is null
                order by c.name
                """,
                [season_id],
            )
            rosters: dict[str, list[dict]] = {}
            for row in cur.fetchall():
                rosters.setdefault(row.pop("user_id"), []).append(row)

            # This episode's ballots.
            cur.execute(
                f"""
                select ep.user_id::text as user_id, c.id::text as contestant_id,
                       c.name, c.image_url,
                       tribe.name as tribe_name, tribe.color as tribe_color
                from elimination_picks ep
                join contestants c on c.id = ep.contestant_id
                {_TRIBE_LATERAL}
                where ep.episode_id = %s
                order by ep.created_at
                """,
                [str(episode_id)],
            )
            ballots: dict[str, list[dict]] = {}
            for row in cur.fetchall():
                ballots.setdefault(row.pop("user_id"), []).append(row)

            # Advantages played this episode, with target (if the type has one).
            cur.execute(
                f"""
                select ap.user_id::text as user_id, ap.advantage_type,
                       c.id::text as contestant_id, c.name, c.image_url,
                       tribe.name as tribe_name, tribe.color as tribe_color
                from advantage_plays ap
                left join contestants c on c.id = ap.target_contestant_id
                {_TRIBE_LATERAL}
                where ap.episode_id = %s
                """,
                [str(episode_id)],
            )
            advantages: dict[str, dict] = {}
            for row in cur.fetchall():
                uid = row.pop("user_id")
                adv_type = row.pop("advantage_type")
                advantages[uid] = {
                    "advantage_type": adv_type,
                    # Doubles target a castaway; a vote double has none.
                    "advantage_target": row if row["contestant_id"] else None,
                }

            # One row per participating player — anyone with a roster, a ballot,
            # or a play this episode. Drops service accounts and no-shows.
            cur.execute(
                "select id::text as id, display_name from profiles where is_player"
            )
            entries = []
            for player in cur.fetchall():
                uid = player["id"]
                roster = rosters.get(uid, [])
                ballot = ballots.get(uid, [])
                adv = advantages.get(uid)
                if not roster and not ballot and adv is None:
                    continue
                entries.append(
                    {
                        "user_id": uid,
                        "display_name": player["display_name"],
                        "roster": roster,
                        "ballot": ballot,
                        "advantage_type": adv["advantage_type"] if adv else None,
                        "advantage_target": adv["advantage_target"] if adv else None,
                    }
                )
            # Standings order, not alphabetical (#490 follow-up): the lock
            # screen reads like the leaderboard. Same live sum + tiebreak the
            # standings endpoint uses (total desc, then display name).
            roster_pts = scoring.roster_points(conn, season_id)
            elim_pts = scoring.elimination_points(conn, season_id)
            finale_pts = scoring.finale_points(conn, season_id)
            for e in entries:
                uid = e["user_id"]
                e["_total"] = (
                    roster_pts.get(uid, 0)
                    + elim_pts.get(uid, 0)
                    + finale_pts.get(uid, 0)
                )
            entries.sort(key=lambda e: (-e["_total"], e["display_name"].lower()))
            for e in entries:
                del e["_total"]
            return entries
