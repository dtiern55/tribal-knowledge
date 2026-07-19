import type { Episode, Season } from '../types'

// An episode accepts picks/advantage plays until it locks or is scored.
// Episodes before the season's roster_lock_episode are watch-only and never
// open (decision #51). Mirrors backend app/locking.py — keep in sync.
export function isEpisodeOpen(ep: Episode, season: Season): boolean {
  return (
    ep.status !== 'scored' &&
    new Date(ep.picks_lock_at) > new Date() &&
    ep.episode_number >= (season.roster_lock_episode ?? 1)
  )
}

// Advantages can't be played from advantage_lock_episode onward (extends #85);
// when unset the cutoff is the finale. Mirrors backend app/locking.py.
export function advantagesLocked(ep: Episode, season: Season): boolean {
  return season.advantage_lock_episode != null
    ? ep.episode_number >= season.advantage_lock_episode
    : ep.is_finale
}

// Swaps lock once the next open episode reaches swap_lock_episode; unset falls
// back to merge + 2, and the finale never accepts swaps (#84, #163). Mirrors
// backend app/locking.py.
export function swapsLocked(season: Season, episodes: Episode[]): boolean {
  const nextOpen = episodes.find((e) => isEpisodeOpen(e, season))
  if (!nextOpen) return false
  const effectiveLock =
    season.swap_lock_episode ??
    (season.merge_episode != null ? season.merge_episode + 2 : null)
  return (
    (effectiveLock != null && nextOpen.episode_number >= effectiveLock) ||
    nextOpen.is_finale
  )
}
