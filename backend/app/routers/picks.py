from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_user
from app.locking import (
    EPISODE_LOCKED_SQL,
    advantages_locked,
    episode_locked,
    next_open_episode,
)
from app.schemas import (
    EliminationPick,
    EliminationPickSubmitRequest,
    EliminationPickSubmitResponse,
)

router = APIRouter(tags=["picks"])


@router.get(
    "/league-seasons/{league_season_id}/picks/{user_id}",
    response_model=dict[str, list[EliminationPick]],
)
def get_season_picks(
    league_season_id: UUID,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    """Every episode's picks for one player, keyed by episode id.

    Batches what History used to fetch one episode at a time (#558). Same
    visibility rule as the per-episode endpoint: another player's picks for an
    episode stay hidden until that episode locks, so for someone else we only
    return locked episodes — no unlocked picks leak through the batch.
    """
    own = str(user_id) == str(current_user)
    lock_filter = "" if own else f" and {EPISODE_LOCKED_SQL}"
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], current_user)
            cur.execute(
                f"""
                select p.* from elimination_picks p
                join episodes e on e.id = p.episode_id
                where p.league_season_id = %s and p.user_id = %s{lock_filter}
                order by p.episode_id, p.created_at
                """,
                [str(league_season_id), str(user_id)],
            )
            by_episode: dict[str, list] = {}
            for row in cur.fetchall():
                by_episode.setdefault(str(row["episode_id"]), []).append(row)
            return by_episode


def _require_episode_in(cur, ls: dict, episode_id: UUID) -> dict:
    cur.execute(
        "select * from episodes where id = %s and season_id = %s",
        [str(episode_id), str(ls["season_id"])],
    )
    episode = cur.fetchone()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode


def already_eliminated_ids(
    cur, season_id: str, episode_number: int, ids: list[str]
) -> list[str]:
    """Which of `ids` were finally eliminated before this episode.

    Shared with advantage_plays.py: Extra Vote ×2's target must be as
    pickable as any ballot name (#673).
    """
    cur.execute(
        """
        select e.contestant_id::text
        from eliminations e
        join episodes ep on e.episode_id = ep.id
        where ep.season_id = %s and e.is_final
          and ep.episode_number < %s
          and e.contestant_id::text = any(%s)
        """,
        [season_id, episode_number, ids],
    )
    return [row["contestant_id"] for row in cur.fetchall()]


def pick_limit(
    cur, ls: dict, episode: dict, user_id, assume_double_vote: bool = False
) -> int:
    """This user's pick cap for one episode (#673 extends #240).

    max_elimination_picks, plus one for an extra_vote play or a targeted
    Extra Vote ×2 play that episode (#307: at most one such play exists),
    capped at (contestants still in the game − 1) so a big base limit never
    lets you pick every remaining option. Shared by submit_picks (to reject
    an over-long ballot) and take_back_advantage (to trim one down after a
    ×2 play is undone).

    assume_double_vote: count as if a targeted Extra Vote ×2 play exists even
    before its row is written — the ballot save creates that play in the same
    request it raises the limit for (#673).
    """
    cur.execute(
        """
        select 1 from advantage_plays
        where user_id = %s and league_season_id = %s and episode_id = %s
          and (advantage_type = 'extra_vote'
               or (advantage_type = 'double_vote_points'
                   and target_contestant_id is not null))
        limit 1
        """,
        [str(user_id), str(ls["id"]), str(episode["id"])],
    )
    extra = 1 if (cur.fetchone() or assume_double_vote) else 0

    cur.execute(
        "select count(*) as n from contestants c"
        " where c.season_id = %s and not exists ("
        "   select 1 from eliminations e"
        "   join episodes ep on ep.id = e.episode_id"
        "   where e.contestant_id = c.id and e.is_final"
        "     and ep.episode_number < %s)",
        [str(ls["season_id"]), episode["episode_number"]],
    )
    still_in = cur.fetchone()["n"]
    return min(episode["max_elimination_picks"] + extra, max(still_in - 1, 0))


def redemption_island_ids(cur, episode_number: int, ids: list[str]) -> list[str]:
    """Which of `ids` sit on Redemption Island as of this episode (#655).

    Shared with advantage_plays.py, see already_eliminated_ids.
    """
    cur.execute(
        """
        select c.id::text as id from contestants c
        join lateral (
          select t.is_redemption from contestant_tribes ct
          join tribes t on t.id = ct.tribe_id
          where ct.contestant_id = c.id and ct.from_episode <= %s
          order by ct.from_episode desc limit 1
        ) tribe on true
        where c.id::text = any(%s) and tribe.is_redemption
        """,
        [episode_number, ids],
    )
    return [row["id"] for row in cur.fetchall()]


@router.get(
    "/league-seasons/{league_season_id}/episodes/{episode_id}/picks/{user_id}",
    response_model=list[EliminationPick],
)
def get_picks(
    league_season_id: UUID,
    episode_id: UUID,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], current_user)
            episode = _require_episode_in(cur, ls, episode_id)

            # Other players' picks open up as soon as the episode LOCKS, not
            # when it's scored. Once picks are locked nobody can act on what
            # they see, and the commissioner may not score until the next day —
            # so the old scored-only rule (#134) hid the league from itself for
            # the whole episode. Restores the original visibility rule (#36):
            # private until the corresponding lock passes.
            if str(user_id) != str(current_user) and not episode_locked(episode):
                raise HTTPException(
                    status_code=403,
                    detail="Picks are hidden until the episode locks",
                )
            cur.execute(
                """
                select * from elimination_picks
                where league_season_id = %s and episode_id = %s and user_id = %s
                order by created_at
                """,
                [str(league_season_id), str(episode_id), str(user_id)],
            )
            return cur.fetchall()


@router.post(
    "/league-seasons/{league_season_id}/episodes/{episode_id}/picks",
    response_model=EliminationPickSubmitResponse,
)
def submit_picks(
    league_season_id: UUID,
    episode_id: UUID,
    body: EliminationPickSubmitRequest,
    user_id: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            ls = database.require_league_season(cur, league_season_id)
            database.require_member(cur, ls["league_id"], user_id)
            episode = _require_episode_in(cur, ls, episode_id)
            season_id = str(ls["season_id"])

            if episode_locked(episode):
                raise HTTPException(
                    status_code=400, detail="Picks are locked for this episode"
                )

            # Week-by-week rule: only the next unlocked episode accepts picks
            next_open = next_open_episode(cur, ls)
            if next_open is None:
                raise HTTPException(
                    status_code=400, detail="No episode is currently open for picks"
                )
            if next_open["id"] != episode["id"]:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Picks are only open for episode"
                        f" {next_open['episode_number']}"
                    ),
                )

            ids = [str(c) for c in body.contestant_ids]

            # The ballot save carries the ×2 placement now (#673) — there's no
            # separate play/move step. Look up this episode's Extra Vote ×2
            # play, if any, to decide whether this request creates one, moves
            # it, drops it, or leaves it alone.
            cur.execute(
                """
                select id::text as id,
                       target_contestant_id::text as target_contestant_id
                from advantage_plays
                where user_id = %s and league_season_id = %s and episode_id = %s
                  and advantage_type = 'double_vote_points'
                """,
                [str(user_id), str(league_season_id), str(episode_id)],
            )
            ballot_play = cur.fetchone()
            doubled_id = (
                str(body.doubled_contestant_id) if body.doubled_contestant_id else None
            )
            creating_play = doubled_id is not None and ballot_play is None
            deleting_play = doubled_id is None and ballot_play is not None and not ids

            if doubled_id is not None and doubled_id not in ids:
                raise HTTPException(
                    status_code=400,
                    detail="Put the ×2 on one of your names",
                )
            if doubled_id is None and ballot_play is not None and ids:
                raise HTTPException(
                    status_code=400, detail="Choose which vote is doubled"
                )

            if creating_play:
                # Same gates play_advantage applies when spending the week's
                # one play (#307) — the ballot save is just another way to
                # spend it.
                if advantages_locked(
                    episode["episode_number"],
                    episode["is_finale"],
                    ls["advantage_lock_episode"],
                ):
                    raise HTTPException(
                        status_code=400,
                        detail="Advantages can no longer be played this season",
                    )
                cur.execute(
                    "select id::text as id, advantage_type from advantage_plays"
                    " where user_id = %s and league_season_id = %s"
                    " and episode_id = %s",
                    [str(user_id), str(league_season_id), str(episode_id)],
                )
                other_play = cur.fetchone()
                if other_play is not None:
                    # A roster double is fungible with the ballot's ×2 — the
                    # week's one play just moves, same as a manual take-back
                    # then play (#673). roster_swap and extra_vote aren't:
                    # the swap already happened (#394) and extra_vote has no
                    # take-back path of its own.
                    if other_play["advantage_type"] == "double_roster_points":
                        cur.execute(
                            "delete from advantage_plays where id = %s",
                            [other_play["id"]],
                        )
                    else:
                        raise HTTPException(
                            status_code=409,
                            detail="You have already used your advantage this episode",
                        )

            max_picks = pick_limit(cur, ls, episode, user_id, creating_play)

            if len(ids) > max_picks:
                raise HTTPException(
                    status_code=400,
                    detail=(f"Too many picks: max is {max_picks}, got {len(ids)}"),
                )

            if len(body.contestant_ids) != len(set(body.contestant_ids)):
                raise HTTPException(
                    status_code=400, detail="Duplicate contestants in picks"
                )

            cur.execute(
                "select id::text as id from contestants"
                " where season_id = %s and id::text = any(%s)",
                [season_id, ids],
            )
            valid_id_strs = {row["id"] for row in cur.fetchall()}
            invalid = [c for c in ids if c not in valid_id_strs]
            if invalid:
                raise HTTPException(
                    status_code=400,
                    detail=f"Contestants not in this season: {invalid}",
                )

            already_eliminated = already_eliminated_ids(
                cur, season_id, episode["episode_number"], ids
            )
            if already_eliminated:
                raise HTTPException(
                    status_code=400,
                    detail=(f"Contestant(s) already eliminated: {already_eliminated}"),
                )

            # The ballot is who gets voted off a tribe; nobody on Redemption
            # Island can be (#655). Tribe as of this episode, not later.
            on_redemption = redemption_island_ids(cur, episode["episode_number"], ids)
            if on_redemption:
                raise HTTPException(
                    status_code=400,
                    detail=f"Contestant(s) on Redemption Island: {on_redemption}",
                )

            # Apply the ×2 change decided above — create it, move it, or drop
            # it. Never touches elimination_picks; the diff below carries the
            # ballot itself.
            if creating_play:
                cur.execute(
                    """
                    insert into advantage_plays
                        (user_id, league_season_id, episode_id, advantage_type,
                         target_contestant_id, token_cost)
                    values (%s, %s, %s, 'double_vote_points', %s, 0)
                    """,
                    [str(user_id), str(league_season_id), str(episode_id), doubled_id],
                )
            elif deleting_play:
                cur.execute(
                    "delete from advantage_plays where id = %s", [ballot_play["id"]]
                )
            elif ballot_play is not None and doubled_id is not None:
                cur.execute(
                    "update advantage_plays set target_contestant_id = %s"
                    " where id = %s",
                    [doubled_id, ballot_play["id"]],
                )

            # Drop picks that fell off the ballot and add new ones, leaving
            # unchanged picks (and their created_at) alone — take_back_advantage
            # trims the newest picks first when a ×2 play is undone, so
            # "newest" has to mean something (#673). An empty list is
            # intentionally allowed and clears the user's picks for the episode.
            cur.execute(
                """
                delete from elimination_picks
                where league_season_id = %s and episode_id = %s and user_id = %s
                  and not (contestant_id::text = any(%s))
                """,
                [str(league_season_id), str(episode_id), str(user_id), ids],
            )
            for cid in ids:
                # clock_timestamp(), not the created_at column's now() default:
                # take_back_advantage orders by created_at to find the
                # "newest" pick, and now() is fixed for a whole transaction —
                # indistinguishable from a pick made in the same request as an
                # earlier one otherwise (#673).
                cur.execute(
                    """
                    insert into elimination_picks
                        (user_id, league_season_id, episode_id, contestant_id,
                         created_at)
                    values (%s, %s, %s, %s, clock_timestamp())
                    on conflict (user_id, league_season_id, episode_id, contestant_id)
                        do nothing
                    """,
                    [str(user_id), str(league_season_id), str(episode_id), cid],
                )

            cur.execute(
                """
                select * from elimination_picks
                where league_season_id = %s and episode_id = %s and user_id = %s
                order by created_at
                """,
                [str(league_season_id), str(episode_id), str(user_id)],
            )
            picks = cur.fetchall()

            # The play, post-save, in the same response — the caller used to
            # GET it separately, chaining a third round trip onto the ballot
            # save (#673).
            cur.execute(
                """
                select * from advantage_plays
                where user_id = %s and league_season_id = %s and episode_id = %s
                  and advantage_type = 'double_vote_points'
                """,
                [str(user_id), str(league_season_id), str(episode_id)],
            )
            return {"picks": picks, "play": cur.fetchone()}
