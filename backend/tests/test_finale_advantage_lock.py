"""The finale never accepts advantages, however the season is configured."""

from app.locking import advantages_locked


def test_finale_locked_even_when_cutoff_is_beyond_it():
    # A season whose cutoff sits past the last episode used to leave the
    # finale unlocked — the case this guard exists for.
    assert advantages_locked(13, is_finale=True, advantage_lock_episode=20)


def test_finale_locked_when_cutoff_unset():
    assert advantages_locked(13, is_finale=True, advantage_lock_episode=None)


def test_cutoff_still_locks_earlier_episodes():
    assert advantages_locked(13, is_finale=False, advantage_lock_episode=13)
    assert not advantages_locked(12, is_finale=False, advantage_lock_episode=13)


def test_open_when_no_cutoff_and_not_finale():
    assert not advantages_locked(5, is_finale=False, advantage_lock_episode=None)
