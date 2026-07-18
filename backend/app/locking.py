"""The shared "episode is locked" rule (decision #11).

An episode stops accepting picks once its picks_lock_at passes or an admin
has scored it. Both forms below encode the same rule; keep them in sync.
"""

from datetime import datetime, timezone

# SQL predicate on an episodes row, for use inside a WHERE clause.
EPISODE_LOCKED_SQL = "(picks_lock_at <= now() or status = 'scored')"


def advantages_locked(
    episode_number: int, is_finale: bool, advantage_lock_episode: int | None
) -> bool:
    """Advantages can't be played and weekly tokens aren't granted from here on
    (extends #85). Configurable per season; NULL falls back to the finale.
    Keep the two callers (advantage use, episode scoring) in sync via this.
    """
    if advantage_lock_episode is not None:
        return episode_number >= advantage_lock_episode
    return is_finale


def episode_locked(episode: dict) -> bool:
    """True once a fetched episode row no longer accepts picks."""
    return (
        episode["picks_lock_at"] <= datetime.now(timezone.utc)
        or episode["status"] == "scored"
    )


def next_open_episode(cur, season_id: str) -> dict | None:
    """The one episode currently open for picks (decision #38, week-by-week):
    the lowest-numbered episode that hasn't locked or been scored yet.

    Episodes before the season's roster_lock_episode are watch-only and never
    open (decision #51): players watch the premiere before anything is
    pickable. Mirrored in frontend/src/lib/episodes.ts.
    """
    cur.execute(
        """
        select e.id, e.episode_number, e.is_finale from episodes e
        join seasons s on s.id = e.season_id
        where e.season_id = %s and e.picks_lock_at > now()
          and e.status != 'scored'
          and e.episode_number >= coalesce(s.roster_lock_episode, 1)
        order by e.episode_number
        limit 1
        """,
        [season_id],
    )
    return cur.fetchone()
