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

// Effective Sole Survivor lock mirrors the backend chain (2026-07-19
// decision): explicit ss_lock_episode, else the advantage lock, else the
// finale. Mirrors backend app/locking.py.
export function ssLockEpisodeNumber(season: Season, episodes: Episode[]): number | null {
  return (
    season.ss_lock_episode ??
    season.advantage_lock_episode ??
    episodes.find((e) => e.is_finale)?.episode_number ??
    null
  )
}

// The designation window stays open until the effective lock episode locks
// picks or is scored.
export function ssDesignationOpen(season: Season, episodes: Episode[]): boolean {
  if (season.status === 'completed') return false
  const lockEp = ssLockEpisodeNumber(season, episodes)
  if (lockEp == null) return false
  const lockEpisode = episodes.find((e) => e.episode_number === lockEp)
  return (
    lockEpisode == null ||
    (lockEpisode.status !== 'scored' && new Date(lockEpisode.picks_lock_at) > new Date())
  )
}

// Swaps lock once the next open episode reaches swap_lock_episode; unset falls
// back to merge + 2, and the finale never accepts swaps (#84, #163). Mirrors
// backend app/locking.py.
export function swapsLocked(season: Season, episodes: Episode[]): boolean {
  const nextOpen = openEpisode(episodes, season)
  // No open episode means play is over (finale locked, or season ended), so
  // everything is locked — not unlocked (#283).
  if (!nextOpen) return true
  const effectiveLock =
    season.swap_lock_episode ??
    (season.merge_episode != null ? season.merge_episode + 2 : null)
  return (
    (effectiveLock != null && nextOpen.episode_number >= effectiveLock) ||
    nextOpen.is_finale
  )
}
