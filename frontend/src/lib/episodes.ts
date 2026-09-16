import type { Episode, Season } from '../types'

// The one episode open for picks: the lowest unscored one at or after the
// roster lock, and only while its own lock is still ahead. Once that passes
// the episode is airing and NOTHING is open until it's scored — you can't
// call episode N+1's boot before knowing episode N's. Mirrors backend
// app/locking.py — keep in sync.
export function openEpisode(episodes: Episode[], season: Season): Episode | undefined {
  const pending = episodes
    .filter(
      (e) =>
        e.status !== 'scored' && e.episode_number >= (season.roster_lock_episode ?? 1),
    )
    .sort((a, b) => a.episode_number - b.episode_number)[0]
  return pending && new Date(pending.picks_lock_at) > new Date() ? pending : undefined
}

// The episode that has locked but isn't scored — airing right now.
export function airingEpisode(episodes: Episode[], season: Season): Episode | undefined {
  return episodes
    .filter(
      (e) =>
        e.status !== 'scored' &&
        e.episode_number >= (season.roster_lock_episode ?? 1) &&
        new Date(e.picks_lock_at) <= new Date(),
    )
    .sort((a, b) => a.episode_number - b.episode_number)[0]
}

export function isEpisodeOpen(ep: Episode, season: Season, episodes: Episode[]): boolean {
  return openEpisode(episodes, season)?.id === ep.id
}

// Has THIS episode stopped accepting entries — locked or scored? Independent
// of which episode is currently open, so it stays false for future episodes.
// `isEpisodeOpen` answers "is this the one open episode", which is a much
// narrower question: negating it would call every future episode closed.
// Mirrors backend app/locking.py EPISODE_LOCKED_SQL.
export function episodeClosed(ep: Episode): boolean {
  return ep.status === 'scored' || new Date(ep.picks_lock_at) <= new Date()
}

// Advantages can't be played from advantage_lock_episode onward (extends #85);
// when unset the cutoff is the finale. Mirrors backend app/locking.py.
export function advantagesLocked(ep: Episode, season: Season): boolean {
  return season.advantage_lock_episode != null
    ? ep.episode_number >= season.advantage_lock_episode
    : ep.is_finale
}

// Advantages don't open during the watch-only premiere — that first week is
// roster-building and cast intros (the show hasn't even assigned tribes), so
// the weekly play only muddies it. The window opens once the premiere is behind
// us, i.e. when episode 2 opens for a season whose roster locks at episode 2
// (Danny, 2026-09-13, S51). Mirrors resolveMySeasonState's watch-only test, so
// "open" here is exactly "not watch-only". A season that locks its roster at
// episode 1 has no watch-only premiere and opens at episode 1. With
// advantagesLocked's upper cutoff this is the full window the play is live.
export function advantagesOpenYet(season: Season, episodes: Episode[]): boolean {
  const rosterStarts = season.roster_lock_episode ?? 1
  return !episodes.some((e) => e.episode_number < rosterStarts && e.status !== 'scored')
}

// Effective swap lock: explicit swap_lock_episode, else the default (ep 8), so
// the last episode you can swap for is the one before it. Sole Survivor
// designation locks with the swaps (2026-09-03), so it is the same number.
// Mirrors backend app/routers/roster.py.
export const SWAP_LOCK_DEFAULT = 8
export function swapLockEpisodeNumber(season: Season): number {
  return season.swap_lock_episode ?? SWAP_LOCK_DEFAULT
}

// Sole Survivor pick rides the swap lock (one dial, no merge): it opens going
// into the last swappable episode (lock - 1), the one the roster finalizes on,
// and locks with the swaps when that episode locks. Mirrors backend
// roster.py ss_designation_open.
export function ssDesignationOpen(season: Season, episodes: Episode[]): boolean {
  if (season.status === 'completed') return false
  const nextOpen = openEpisode(episodes, season)
  if (!nextOpen || nextOpen.is_finale) return false
  const lock = swapLockEpisodeNumber(season)
  return lock - 1 <= nextOpen.episode_number && nextOpen.episode_number < lock
}

// Swaps lock once the next open episode reaches the effective swap lock, and
// the finale never accepts swaps (#84, #163, #672).
export function swapsLocked(season: Season, episodes: Episode[]): boolean {
  const nextOpen = openEpisode(episodes, season)
  // No open episode means play is over (finale locked, or season ended), so
  // everything is locked — not unlocked (#283).
  if (!nextOpen) return true
  const effectiveLock = swapLockEpisodeNumber(season)
  return nextOpen.episode_number >= effectiveLock || nextOpen.is_finale
}
