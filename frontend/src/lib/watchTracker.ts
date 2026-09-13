/**
 * Watch tracker (#737, v2): pure state + derivation for the commissioner's
 * live-episode scratchpad. The tracker captures what Danny sees while watching
 * and hands off a summary he applies on the admin page — it writes nothing to
 * the backend itself. Everything here is pure so the derivation is testable.
 */
import type { CastMember, RuleScoringEvent } from '../types'

export type TabKey = 'wins' | 'tribal' | 'extras' | 'camp' | 'final' | 'notes'

/** The four win events the Wins tab drives directly (tribe pills + per-person
 *  toggles), rather than as generic tap chips. */
export const WIN_EVENTS = {
  teamImmunity: 'win_team_immunity',
  teamReward: 'win_team_reward',
  individualImmunity: 'win_individual_immunity',
  individualReward: 'win_individual_reward',
} as const

export const VOTE_CORRECT = 'vote_correctly_at_tribal'
export const VOTES_RECEIVED = 'votes_received'
/** Minted by a DB trigger from contestants.placement, never entered as events. */
export const PLACEMENT_EVENTS = ['made_final_tribal', 'runner_up', 'won_season']

/** Event types the tabbed chips must NOT offer: the Wins tab and vote matrix
 *  own some, and placement events are derived. */
export const NON_CHIP = new Set<string>([
  ...Object.values(WIN_EVENTS),
  VOTE_CORRECT,
  VOTES_RECEIVED,
  ...PLACEMENT_EVENTS,
])

// Where each tappable event lands. Anything unmapped falls to Camp, so a newly
// enabled event type still shows up somewhere instead of vanishing.
const TAB_FOR_EVENT: Record<string, TabKey> = {
  eliminated_holding_idol: 'tribal',
  join_jury: 'tribal',
  blindside_with_active_idol: 'extras',
  episode_title_quote: 'extras',
  read_treemail_or_instructions: 'extras',
  jeff_thats_how_you_do_it: 'extras',
  fake_idol_played: 'extras',
  steal_immunity_idol: 'extras',
  win_fire_making_challenge: 'final',
}

export const tabForEvent = (eventType: string): TabKey => TAB_FOR_EVENT[eventType] ?? 'camp'

export const chipEventsForTab = (events: RuleScoringEvent[], tab: TabKey): RuleScoringEvent[] =>
  events.filter((e) => !NON_CHIP.has(e.event_type) && tabForEvent(e.event_type) === tab)

// Terser labels for the tracker — the commissioner knows these; the full
// house-copy labels stay in the rules/results/admin views. Unlisted events
// fall back to the season label.
const SHORT_LABEL: Record<string, string> = {
  steal_immunity_idol: 'Steal immunity idol',
  fake_idol_played: 'Make fake idol that gets played',
  blindside_with_active_idol: 'Blindside someone with active idol',
  jeff_thats_how_you_do_it: '"That\'s How You Do It"',
  read_treemail_or_instructions: 'Treemail',
  episode_title_quote: 'Quote',
  play_idol_nullifier: 'Play idol nullifier',
  acquire_active_idol: 'Acquire active idol',
  play_idol: 'Play immunity idol',
  acquire_extra_vote: 'Acquire extra vote',
  acquire_inactive_idol: 'Acquire inactive idol',
  activate_inactive_idol: 'Activate inactive idol',
  idol_played_successfully: 'Immunity idol saves target',
  go_on_journey: 'Journey',
  votes_blocked_by_idol: 'Vote blocked by immunity idol',
}

export const shortLabel = (eventType: string, fallback: string): string => SHORT_LABEL[eventType] ?? fallback

export interface VoteEntry {
  target: string
  confirmed: boolean
}

export interface WatchState {
  /** event_type -> contestant ids, for the four win events. */
  wins: Record<string, string[]>
  /** contestant ids voted out (more than one when a night has two tribals). */
  boots: string[]
  /** voter id -> their vote. */
  votes: Record<string, VoteEntry>
  /** event_type -> contestant id -> count (1 for a toggle, n for per-unit). */
  events: Record<string, Record<string, number>>
  finale: { finalFour: string[]; finalThree: string[]; winner: string | null }
  notes: string
}

export const emptyState = (): WatchState => ({
  wins: {},
  boots: [],
  votes: {},
  events: {},
  finale: { finalFour: [], finalThree: [], winner: null },
  notes: '',
})

export interface DerivedEvent {
  contestant_id: string
  event_type: string
  quantity: number
}

export interface DerivedElimination {
  contestant_id: string
  elimination_type: string
  is_final: boolean
}

/** The scoring events to hand off: wins, correct votes (a confirmed vote whose
 *  target is a boot), and the tapped chip events with their counts. */
export function deriveScoringEvents(state: WatchState): DerivedEvent[] {
  const out: DerivedEvent[] = []
  const boots = new Set(state.boots)
  for (const [event_type, ids] of Object.entries(state.wins))
    for (const id of ids) out.push({ contestant_id: id, event_type, quantity: 1 })
  for (const [voter, v] of Object.entries(state.votes))
    if (v.confirmed && boots.has(v.target))
      out.push({ contestant_id: voter, event_type: VOTE_CORRECT, quantity: 1 })
  for (const [event_type, byId] of Object.entries(state.events))
    for (const [id, n] of Object.entries(byId))
      if (n > 0) out.push({ contestant_id: id, event_type, quantity: n })
  return out
}

/** Boots default to voted-out and final; Redemption / non-vote exits are the
 *  rare cases the commissioner adjusts on the admin page. */
export function deriveEliminations(state: WatchState): DerivedElimination[] {
  return state.boots.map((contestant_id) => ({
    contestant_id,
    elimination_type: 'voted_out',
    is_final: true,
  }))
}

export function voteTally(state: WatchState): { target: string; count: number }[] {
  const counts: Record<string, number> = {}
  for (const v of Object.values(state.votes))
    if (v.confirmed) counts[v.target] = (counts[v.target] ?? 0) + 1
  return Object.entries(counts)
    .map(([target, count]) => ({ target, count }))
    .sort((a, b) => b.count - a.count)
}

/** Plain-text summary the commissioner applies on the admin page, grouped by
 *  the admin action each part maps to. */
export function buildHandoff(
  state: WatchState,
  cast: CastMember[],
  labelFor: (eventType: string) => string,
): string {
  const nameOf = (id: string) => cast.find((c) => c.id === id)?.name ?? id
  const lines: string[] = ['Commissioner entry', '']

  if (state.boots.length) lines.push('ELIMINATIONS', `  Voted out: ${state.boots.map(nameOf).join(', ')}`, '')

  const events = deriveScoringEvents(state)
  if (events.length) {
    lines.push('SCORING EVENTS')
    const byType = new Map<string, DerivedEvent[]>()
    for (const e of events) byType.set(e.event_type, [...(byType.get(e.event_type) ?? []), e])
    for (const [eventType, rows] of byType) {
      const named = rows.map((r) => (r.quantity > 1 ? `${nameOf(r.contestant_id)} x${r.quantity}` : nameOf(r.contestant_id)))
      lines.push(`  ${labelFor(eventType)}: ${named.join(', ')}`)
    }
    lines.push('')
  }

  const f = state.finale
  const placement: string[] = []
  if (f.winner) placement.push(`  Winner (1st): ${nameOf(f.winner)}`)
  if (f.finalThree.length) placement.push(`  Final 3: ${f.finalThree.map(nameOf).join(', ')} (set 2nd/3rd on admin)`)
  if (f.finalFour.length) placement.push(`  Final 4: ${f.finalFour.map(nameOf).join(', ')}`)
  if (placement.length) lines.push('PLACEMENTS (set on the contestant, the finale events follow)', ...placement, '')

  if (state.notes.trim()) lines.push('NOTES', state.notes.trim())

  if (lines.length <= 2) lines.push('Nothing recorded yet.')
  return lines.join('\n').trimEnd()
}
