/**
 * Watch tracker (#737, v2): pure state + derivation for the commissioner's
 * live-episode scratchpad. The tracker captures what Danny sees while watching;
 * the scoring ritual reads the saved state. Everything here is pure so the
 * derivation is testable.
 */
import type { CastMember, RuleScoringEvent } from '../types'

export type TabKey = 'tribes' | 'camp' | 'challenge' | 'tribal' | 'advantages' | 'final' | 'notes'

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

/** Where a tappable event is entered: a tab's main chips, or a tucked-away
 *  section of one (Jeff's strip, Redemption, tribal advantages, the boot rows). */
export type ChipGroup = 'camp' | 'jeff' | 'reward' | 'redemption' | 'tribal' | 'boot' | 'advantages' | 'final'

// Every-episode events sit up front; the rare ones are tucked into sections.
// Chips show in list order. Anything unlisted falls to Camp, so a newly enabled
// event type still shows up somewhere instead of vanishing.
const GROUPS: Record<ChipGroup, string[]> = {
  camp: ['go_on_journey', 'episode_title_quote', 'read_treemail_or_instructions'],
  jeff: ['jeff_thats_how_you_do_it'],
  reward: ['taken_on_reward'],
  redemption: ['win_redemption_duel', 'return_from_redemption', 'return_from_redemption_endgame'],
  tribal: [
    'play_idol',
    'votes_blocked_by_idol',
    'idol_played_successfully',
    'play_other_advantage',
    'shot_in_the_dark_success',
    'play_idol_nullifier',
    'nullifier_played_successfully',
    'steal_immunity_idol',
    'blindside_with_active_idol',
    'fake_idol_played',
  ],
  boot: ['eliminated_holding_idol', 'join_jury'],
  advantages: [
    'acquire_active_idol',
    'acquire_inactive_idol',
    'activate_inactive_idol',
    'acquire_extra_vote',
    'acquire_other_advantage',
  ],
  final: ['win_fire_making_challenge'],
}

const TAB_OF_GROUP: Record<ChipGroup, TabKey> = {
  camp: 'camp',
  jeff: 'challenge',
  reward: 'challenge',
  redemption: 'challenge',
  tribal: 'tribal',
  boot: 'tribal',
  advantages: 'advantages',
  final: 'final',
}

export const groupForEvent = (eventType: string): ChipGroup =>
  (Object.keys(GROUPS) as ChipGroup[]).find((g) => GROUPS[g].includes(eventType)) ?? 'camp'

export function chipEventsForGroup(events: RuleScoringEvent[], group: ChipGroup): RuleScoringEvent[] {
  const order = (e: RuleScoringEvent) => {
    const i = GROUPS[group].indexOf(e.event_type)
    return i < 0 ? GROUPS[group].length : i
  }
  return events
    .filter((e) => !NON_CHIP.has(e.event_type) && groupForEvent(e.event_type) === group)
    .sort((a, b) => order(a) - order(b))
}

/** The tab an awarded event was entered on, for the Notes summary. */
export function tabForAward(eventType: string): TabKey {
  if ((Object.values(WIN_EVENTS) as string[]).includes(eventType)) return 'challenge'
  if (eventType === VOTE_CORRECT) return 'tribal'
  return TAB_OF_GROUP[groupForEvent(eventType)]
}

// Terser labels for the tracker — the commissioner knows these; the full
// house-copy labels stay in the rules/results/admin views. Unlisted events
// fall back to the season label.
const SHORT_LABEL: Record<string, string> = {
  nullifier_played_successfully: 'Nullifier voids a real idol',
  shot_in_the_dark_success: 'Successful shot in the dark',
  eliminated_holding_idol: 'Had an idol',
  join_jury: 'Jury',
  win_redemption_duel: 'Win duel',
  return_from_redemption: 'Return at the merge',
  return_from_redemption_endgame: 'Return in the endgame',
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
  taken_on_reward: 'Taken along on a reward',
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
  /** Hand-set tribes, a draft until published (the premiere, before survivoR
   *  has them). The tracker groups by these the moment they're set. */
  tribes: DraftTribe[]
}

export interface DraftTribe {
  name: string
  color: string
  members: string[]
}

export const emptyState = (): WatchState => ({
  wins: {},
  boots: [],
  votes: {},
  events: {},
  finale: { finalFour: [], finalThree: [], winner: null },
  notes: '',
  tribes: [],
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

/** The most-voted target when confirmed votes exist but no boot is marked —
 *  the prompt that catches "tracked the vote, forgot to tap the boot" (#774).
 *  Null once any boot is set or there's nothing to go on. */
export function suggestedBoot(state: WatchState): string | null {
  if (state.boots.length) return null
  return voteTally(state)[0]?.target ?? null
}

/** Move everyone marked for an individual win to the team equivalent — the
 *  one-tap fix when a tribe win got tapped as individuals on a swap week
 *  (#773). Individual immunity has one winner, so >1 is always this mistake. */
export function convertWinsToTeam(
  wins: WatchState['wins'],
  individualType: string,
  teamType: string,
): WatchState['wins'] {
  const ids = wins[individualType] ?? []
  if (!ids.length) return wins
  const team = [...new Set([...(wins[teamType] ?? []), ...ids])]
  return { ...wins, [individualType]: [], [teamType]: team }
}

// The scoring ritual reads the raw state from the server (deriveScoringEvents /
// deriveEliminations describe how it maps to scores), so there's no text
// hand-off to build here.

/** Move a contestant into tribe `to` (an index), or back to the pool (null). */
export function moveToTribe(tribes: DraftTribe[], id: string, to: number | null): DraftTribe[] {
  return tribes.map((t, i) => ({
    ...t,
    members: i === to ? [...t.members.filter((m) => m !== id), id] : t.members.filter((m) => m !== id),
  }))
}

/** The cast as the tracker sees it: draft tribes override the published ones
 *  for everyone they place, so scoring can group by them before publishing. */
export function applyDraftTribes(cast: CastMember[], tribes: DraftTribe[]): CastMember[] {
  const byId = new Map<string, DraftTribe>()
  for (const t of tribes) for (const id of t.members) byId.set(id, t)
  if (!byId.size) return cast
  return cast.map((c) => {
    const t = byId.get(c.id)
    return t ? { ...c, tribe_name: t.name.trim() || 'Unnamed tribe', tribe_color: t.color } : c
  })
}

/** True once the server's tribes match the draft, i.e. it's been published. */
export function draftIsPublished(cast: CastMember[], tribes: DraftTribe[]): boolean {
  const byId = new Map(cast.map((c) => [c.id, c]))
  const placed = tribes.flatMap((t) => t.members.map((id) => ({ t, c: byId.get(id) })))
  return (
    placed.length > 0 &&
    placed.every(
      ({ t, c }) => c?.tribe_name === t.name.trim() && c.tribe_color?.toLowerCase() === t.color.toLowerCase(),
    )
  )
}
