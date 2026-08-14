import type { Episode, Season } from '../types'

export type CommissionerStage = 'setup' | 'scheduled' | 'review' | 'complete'

export interface CommissionerContext {
  stage: CommissionerStage
  episode: Episode | null
  title: string
  action: string
}

export function commissionerContext(
  season: Season,
  episodes: Episode[],
  now = new Date(),
): CommissionerContext {
  if (episodes.length === 0) {
    return { stage: 'setup', episode: null, title: 'Season setup', action: 'Create the episode schedule.' }
  }

  const ordered = [...episodes].sort((a, b) => a.episode_number - b.episode_number)
  const unscored = ordered.filter((episode) => episode.status !== 'scored')
  if (unscored.length === 0 || season.status === 'completed') {
    return { stage: 'complete', episode: ordered.at(-1) ?? null, title: 'Season complete', action: 'Review final results and make corrections only when needed.' }
  }

  const locked = unscored.find((episode) => new Date(episode.picks_lock_at) <= now)
  if (locked) {
    return { stage: 'review', episode: locked, title: `Episode ${locked.episode_number} needs review`, action: 'Confirm eliminations and scoring events, then score the episode.' }
  }

  const next = unscored[0]
  return { stage: 'scheduled', episode: next, title: `Episode ${next.episode_number} is scheduled`, action: 'Verify its air date, lock time, and pick limit before lock.' }
}

export function commissionerEpisodeLabel(episode: Episode, now = new Date()): string {
  if (episode.status === 'scored') return 'Scored'
  if (new Date(episode.picks_lock_at) <= now) return 'Ready to score'
  return 'Scheduled'
}
