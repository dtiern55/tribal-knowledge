"""The shared "episode is locked" rule (decision #11).

An episode stops accepting picks once its picks_lock_at passes or an admin
has scored it. Both forms below encode the same rule; keep them in sync.
"""

from datetime import datetime, timezone

# SQL predicate on an episodes row, for use inside a WHERE clause.
EPISODE_LOCKED_SQL = "(picks_lock_at <= now() or status = 'scored')"


def episode_locked(episode: dict) -> bool:
    """True once a fetched episode row no longer accepts picks."""
    return (
        episode["picks_lock_at"] <= datetime.now(timezone.utc)
        or episode["status"] == "scored"
    )


def next_open_episode(cur, season_id: str) -> dict | None:
    """The one episode currently open for picks (decision #38, week-by-week):
    the lowest-numbered episode that hasn't locked or been scored yet.
    """
    cur.execute(
        """
        select id, episode_number from episodes
        where season_id = %s and picks_lock_at > now()
          and status != 'scored'
        order by episode_number
        limit 1
        """,
        [season_id],
    )
    return cur.fetchone()
