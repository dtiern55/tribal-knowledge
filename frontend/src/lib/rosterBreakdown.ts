import { useState } from 'react'
import { api } from './api'
import type { AdvantagePlay, ContestantPerformance, Episode } from '../types'

export const EMPTY_EP_MAP = new Map<number, number>()

/**
 * Per-contestant, per-episode Double Roster Points bonus, keyed
 * contestant_id → (episode_number → bonus points). Drives the "2x Points" pill
 * and the itemized 2x line; roster totals already fold the doubling in
 * server-side.
 */
export function doubledByContestantEpisode(
  plays: AdvantagePlay[],
  episodes: Episode[],
): Map<string, Map<number, number>> {
  const epNumById = new Map(episodes.map((e) => [e.id, e.episode_number]))
  const out = new Map<string, Map<number, number>>()
  for (const p of plays) {
    if (
      p.advantage_type === 'double_roster_points' &&
      p.episode_id != null &&
      p.target_contestant_id
    ) {
      const epNum = epNumById.get(p.episode_id)
      if (epNum != null && p.points_earned) {
        const m = out.get(p.target_contestant_id) ?? new Map<number, number>()
        m.set(epNum, (m.get(epNum) ?? 0) + p.points_earned)
        out.set(p.target_contestant_id, m)
      }
    }
  }
  return out
}

/**
 * Lazy per-contestant performance for the tap-to-expand breakdown (#257):
 * one card open at a time, each contestant fetched the first time it opens.
 */
export function useRosterBreakdown() {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [perfs, setPerfs] = useState<Map<string, ContestantPerformance>>(new Map())
  function toggleExpand(cid: string) {
    setExpandedId((cur) => (cur === cid ? null : cid))
    if (!perfs.has(cid)) {
      api
        .get<ContestantPerformance>(`/contestants/${cid}/performance`)
        .then((p) => setPerfs((prev) => new Map(prev).set(cid, p)))
        .catch(() => {})
    }
  }
  return { expandedId, perfs, toggleExpand }
}
