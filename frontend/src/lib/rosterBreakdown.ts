import { useState } from 'react'
import { api } from './api'
import type { AdvantagePlay, ContestantPerformance, Episode } from '../types'

export const EMPTY_EP_MAP = new Map<number, number>()

/**
 * Per-contestant, per-episode Double Castaway Points bonus, keyed
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
 * each card opens on its own, and each contestant is fetched the first time
 * it opens. `setExpanded` opens a whole list at once (Expand all, #827).
 */
export function useRosterBreakdown() {
  const [expanded, setExpandedIds] = useState<Set<string>>(new Set())
  const [perfs, setPerfs] = useState<Map<string, ContestantPerformance>>(new Map())
  function load(cid: string) {
    if (perfs.has(cid)) return
    api
      .get<ContestantPerformance>(`/contestants/${cid}/performance`)
      .then((p) => setPerfs((prev) => new Map(prev).set(cid, p)))
      .catch(() => {})
  }
  function toggleExpand(cid: string) {
    setExpandedIds((cur) => {
      const next = new Set(cur)
      if (!next.delete(cid)) next.add(cid)
      return next
    })
    load(cid)
  }
  function setExpanded(cids: string[]) {
    setExpandedIds(new Set(cids))
    cids.forEach(load)
  }
  return { expanded, perfs, toggleExpand, setExpanded }
}
