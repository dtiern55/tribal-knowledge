"""The shared "episode is locked" rule (decision #11).

An episode stops accepting picks once its picks_lock_at passes or an admin
has scored it. Both forms below encode the same rule; keep them in sync.
"""

from datetime import datetime, timezone


def episode_locked_sql(alias: str = "") -> str:
    """The episode-locked predicate for a WHERE clause, column-qualified.

    Pass the episodes-table alias (e.g. "ep") when the query also joins a table
    with a `status` column — seasons has one — so the reference isn't ambiguous.
    """
    p = f"{alias}." if alias else ""
    return f"({p}picks_lock_at <= now() or {p}status = 'scored')"


# SQL predicate on an episodes row, for use inside a WHERE clause.
EPISODE_LOCKED_SQL = episode_locked_sql()


def advantages_locked(
    episode_number: int, is_finale: bool, advantage_lock_episode: int | None
) -> bool:
    """Advantages can't be played and weekly tokens aren't granted from here on
    (extends #85). Configurable per season; NULL falls back to the finale.
    Keep the two callers (advantage use, episode scoring) in sync via this.

    The finale is ALWAYS locked, whatever the season is configured with — a
    cutoff set past the last episode used to leave the finale wide open. It's
    a rule, not a setting, so it doesn't depend on getting the config right.
    """
    if is_finale:
        return True
    if advantage_lock_episode is not None:
        return episode_number >= advantage_lock_episode
    return False


def episode_locked(episode: dict) -> bool:
    """True once a fetched episode row no longer accepts picks."""
    return (
        episode["picks_lock_at"] <= datetime.now(timezone.utc)
        or episode["status"] == "scored"
    )


def latest_locked_episode(cur, season_id) -> int | None:
    """Highest episode_number whose picks have locked (or been scored).

    The boundary for showing another player's roster: a swap into a still-open
    episode is undoable strategy, so their roster is only revealed as it stood
    at this episode — pending swaps stay hidden until their episode locks (#164
    follow-up).
    """
    cur.execute(
        f"""
        select max(episode_number) as n from episodes
        where season_id = %s and {EPISODE_LOCKED_SQL}
        """,
        [str(season_id)],
    )
    row = cur.fetchone()
    return row["n"] if row else None


def next_open_episode(cur, ls: dict) -> dict | None:
    """The one episode currently open for picks (decision #38, week-by-week).

    It is the lowest-numbered episode that hasn't been scored — and it's open
    only while its own lock is still ahead. Once that lock passes the episode
    is airing, and NOTHING is open until it's scored: you must not be able to
    call episode N+1's boot before knowing episode N's. That matches the rule
    as written (#11) — "after an episode airs *and is scored*, the next open
    window is the following episode" — which the old timestamp-only query
    didn't enforce, so N+1 opened the moment N locked.

    Episodes before the league-season's roster_lock_episode are watch-only and
    never open (decision #51). Mirrored in frontend/src/lib/episodes.ts.
    """
    cur.execute(
        """
        select e.id, e.episode_number, e.is_finale, e.picks_lock_at from episodes e
        where e.season_id = %s and e.status != 'scored'
          and e.episode_number >= %s
        order by e.episode_number
        limit 1
        """,
        [str(ls["season_id"]), ls["roster_lock_episode"] or 1],
    )
    ep = cur.fetchone()
    if ep is None:
        return None
    return ep if ep["picks_lock_at"] > datetime.now(timezone.utc) else None


def airing_episode(cur, ls: dict) -> dict | None:
    """The episode that has locked but hasn't been scored — i.e. airing now.

    The gap between lock and scoring is a real state, not dead air: picks are
    in, nothing new can be entered, and the next episode stays shut.
    """
    cur.execute(
        """
        select e.id, e.episode_number, e.is_finale, e.picks_lock_at from episodes e
        where e.season_id = %s and e.status != 'scored'
          and e.picks_lock_at <= now()
          and e.episode_number >= %s
        order by e.episode_number
        limit 1
        """,
        [str(ls["season_id"]), ls["roster_lock_episode"] or 1],
    )
    return cur.fetchone()


def used_weekly_play(cur, user_id, league_season_id, episode_id) -> bool:
    """Has this player already spent their one advantage play this episode?

    #307: the allowance is one play per player per episode, whatever it was
    spent on — a double or a paid roster swap. Callers must already hold the
    user/season advisory lock, since this is a count-then-insert.
    """
    cur.execute(
        "select 1 from advantage_plays"
        " where user_id = %s and league_season_id = %s and episode_id = %s limit 1",
        [str(user_id), str(league_season_id), str(episode_id)],
    )
    return cur.fetchone() is not None
