import type { StandingEntry } from '../types'

export interface RankedStanding {
  entry: StandingEntry
  rank: number
  tied: boolean
}

/** Competition ranking: equal totals share a rank and the next rank is skipped. */
export function rankStandings(entries: StandingEntry[]): RankedStanding[] {
  return entries.map((entry, index) => ({
    entry,
    rank:
      index > 0 && entry.total_points === entries[index - 1].total_points
        ? rankStandingsRank(entries, index - 1)
        : index + 1,
    tied:
      (index > 0 && entry.total_points === entries[index - 1].total_points) ||
      (index < entries.length - 1 && entry.total_points === entries[index + 1].total_points),
  }))
}

function rankStandingsRank(entries: StandingEntry[], index: number): number {
  while (index > 0 && entries[index].total_points === entries[index - 1].total_points) {
    index -= 1
  }
  return index + 1
}

export function movementLabel(entry: StandingEntry): string | null {
  if (entry.trend === 'up') return `Up ${entry.trend_delta}`
  if (entry.trend === 'down') return `Down ${entry.trend_delta}`
  if (entry.trend === 'same') return 'No change'
  return null
}
