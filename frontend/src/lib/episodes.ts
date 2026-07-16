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
