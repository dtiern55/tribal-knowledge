import type { Episode, Season } from '../types'
import { airingEpisode, openEpisode } from './episodes'

export type MySeasonState =
  | { kind: 'complete' }
  | { kind: 'watch_only'; episode: Episode }
  | { kind: 'open'; episode: Episode }
  | { kind: 'locked'; episode: Episode }
  | { kind: 'intermission' }

export function isBroadcastWindow(episode: Episode, now = new Date()): boolean {
  const lock = new Date(episode.picks_lock_at).getTime()
  const elapsed = now.getTime() - lock
  return elapsed >= 0 && elapsed < 6 * 60 * 60 * 1000
}

/** Resolve the one durable My Season state used by both composition and
 * permissions. Reveal eligibility is intentionally separate (#331). */
export function resolveMySeasonState(
  season: Season,
  episodes: Episode[],
): MySeasonState {
  if (season.status === 'completed') return { kind: 'complete' }

  // A scored finale ends the season even if the status flip was missed: the
  // banner reads "Season complete" rather than falling through to intermission.
  if (episodes.some((episode) => episode.is_finale && episode.status === 'scored')) {
    return { kind: 'complete' }
  }

  const rosterStarts = season.roster_lock_episode ?? 1
  const watchOnly = episodes
    .filter((episode) => episode.episode_number < rosterStarts && episode.status !== 'scored')
    .sort((a, b) => a.episode_number - b.episode_number)[0]
  if (watchOnly) return { kind: 'watch_only', episode: watchOnly }

  const open = openEpisode(episodes, season)
  if (open) return { kind: 'open', episode: open }

  const locked = airingEpisode(episodes, season)
  if (locked) return { kind: 'locked', episode: locked }

  return { kind: 'intermission' }
}
