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
