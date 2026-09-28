from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin, get_current_user
from app.locking import next_open_episode
from app.schemas import (
    LeagueSeason,
    LeagueSeasonCreateRequest,
    LeagueSeasonUpdateRequest,
    WhosIn,
)

router = APIRouter(tags=["league_seasons"])


@router.get("/league-seasons", response_model=list[LeagueSeason])
def list_my_league_seasons(user_id: UUID = Depends(get_current_user)):
    """Every league-season the caller can play or browse (#595): those of the
    leagues they belong to, or all of them for an admin. Ordered by season
    number then league, so the frontend's default-season rule can stay simple.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"""
                {database.LEAGUE_SEASON_SQL}
                where exists (select 1 from league_members m
                              where m.league_id = ls.league_id and m.user_id = %s)
                   or exists (select 1 from profiles p where p.id = %s and p.is_admin)
                order by s.season_number, l.created_at
                """,
                [str(user_id), str(user_id)],
            )
            return cur.fetchall()


@router.get("/league-seasons/{league_season_id}", response_model=LeagueSeason)
def get_league_season(
    league_season_id: UUID, user_id: UUID = Depends(get_current_user)
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], user_id)
            return ls


@router.get("/league-seasons/{league_season_id}/whos-in", response_model=WhosIn)
def whos_in(league_season_id: UUID, _: UUID = Depends(get_current_admin)):
    """For each player, whether the open episode's picks are in: tribe slots
    still empty (no roster yet, or a castaway already out), a ballot, an
    advantage played. Nothing open (airing, or the season is over) → no rows.
    """
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            ep = next_open_episode(cur, ls)
            if ep is None:
                return {"episode_number": None, "picks_lock_at": None, "members": []}
            cur.execute(
                """
                select p.id as user_id, p.display_name, p.is_bot,
                  %(size)s - (
                    select count(*) from roster_picks r
                    where r.league_season_id = %(ls)s and r.user_id = p.id
                      and r.active_from_episode <= %(n)s
                      and (r.active_until_episode is null
                           or r.active_until_episode >= %(n)s)
                      and not exists (
                        select 1 from eliminations x
                        join episodes xe on xe.id = x.episode_id
                        where x.contestant_id = r.contestant_id and x.is_final
                          and xe.episode_number < %(n)s)
                  ) as tribe_missing,
                  exists (select 1 from elimination_picks b
                          where b.league_season_id = %(ls)s and b.user_id = p.id
                            and b.episode_id = %(ep)s) as has_ballot,
                  exists (select 1 from advantage_plays a
                          where a.league_season_id = %(ls)s and a.user_id = p.id
                            and a.episode_id = %(ep)s) as played_advantage
                from league_members m
                join profiles p on p.id = m.user_id and p.is_player
                where m.league_id = %(league)s
                order by p.is_bot, p.display_name
                """,
                {
                    "size": ls["roster_size"],
                    "ls": str(ls["id"]),
                    "n": ep["episode_number"],
                    "ep": str(ep["id"]),
                    "league": str(ls["league_id"]),
                },
            )
            return {
                "episode_number": ep["episode_number"],
                "picks_lock_at": ep["picks_lock_at"],
                "members": cur.fetchall(),
            }


@router.post(
    "/leagues/{league_id}/seasons", response_model=LeagueSeason, status_code=201
)
def add_season_to_league(
    league_id: UUID,
    body: LeagueSeasonCreateRequest,
    _: UUID = Depends(get_current_admin),
):
    """Sign a league up to play a season, with its rule knobs."""
    fields = body.model_dump()
    cols = ", ".join(fields)
    vals = ", ".join(f"%({k})s" for k in fields)
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select 1 from leagues where id = %s", [str(league_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="League not found")
            database.require_season(cur, body.season_id)
            # Checked explicitly rather than caught as a unique violation: a
            # failed insert aborts the transaction, which the test client shares.
            cur.execute(
                "select 1 from league_seasons where league_id = %s and season_id = %s",
                [str(league_id), str(body.season_id)],
            )
            if cur.fetchone():
                raise HTTPException(
                    status_code=409, detail="League already plays this season"
                )
            cur.execute(
                f"insert into league_seasons (league_id, {cols})"
                f" values (%(league_id)s, {vals}) returning id",
                {
                    **{k: str(v) if k == "season_id" else v for k, v in fields.items()},
                    "league_id": str(league_id),
                },
            )
            return database.require_league_season(cur, cur.fetchone()["id"])


@router.patch("/league-seasons/{league_season_id}", response_model=LeagueSeason)
def update_league_season(
    league_season_id: UUID,
    body: LeagueSeasonUpdateRequest,
    _: UUID = Depends(get_current_admin),
):
    fields = body.model_dump(exclude_unset=True)
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")
    set_clause = ", ".join(f"{k} = %({k})s" for k in fields)
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_league_season(cur, league_season_id)
            cur.execute(
                f"update league_seasons set {set_clause} where id = %(id)s",
                {**fields, "id": str(league_season_id)},
            )
            return database.require_league_season(cur, league_season_id)
