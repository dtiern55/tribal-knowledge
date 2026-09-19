import { describe, expect, it } from 'vitest'
import {
  applyDraftTribes,
  chipEventsForTab,
  convertWinsToTeam,
  deriveEliminations,
  deriveScoringEvents,
  draftIsPublished,
  emptyState,
  moveToTribe,
  suggestedBoot,
  tabForEvent,
  voteTally,
} from './watchTracker'
import type { CastMember, RuleScoringEvent } from '../types'

describe('watchTracker derivation', () => {
  it('wins become scoring events, one per contestant', () => {
    const s = emptyState()
    s.wins = { win_team_immunity: ['a', 'b'], win_individual_reward: ['c'] }
    const ev = deriveScoringEvents(s)
    expect(ev).toContainEqual({ contestant_id: 'a', event_type: 'win_team_immunity', quantity: 1 })
    expect(ev.filter((e) => e.event_type === 'win_team_immunity')).toHaveLength(2)
    expect(ev).toContainEqual({ contestant_id: 'c', event_type: 'win_individual_reward', quantity: 1 })
  })

  it('only a confirmed vote for a boot scores a correct vote', () => {
    const s = emptyState()
    s.boots = ['x']
    s.votes = {
      voter1: { target: 'x', confirmed: true }, // correct
      voter2: { target: 'y', confirmed: true }, // wrong target
      voter3: { target: 'x', confirmed: false }, // still a prediction
    }
    const correct = deriveScoringEvents(s).filter((e) => e.event_type === 'vote_correctly_at_tribal')
    expect(correct).toEqual([{ contestant_id: 'voter1', event_type: 'vote_correctly_at_tribal', quantity: 1 }])
  })

  it('per-unit chip counts carry through as quantity', () => {
    const s = emptyState()
    s.events = { read_treemail_or_instructions: { a: 3 }, go_on_journey: { b: 1, c: 0 } }
    const ev = deriveScoringEvents(s)
    expect(ev).toContainEqual({ contestant_id: 'a', event_type: 'read_treemail_or_instructions', quantity: 3 })
    expect(ev).toContainEqual({ contestant_id: 'b', event_type: 'go_on_journey', quantity: 1 })
    expect(ev.find((e) => e.contestant_id === 'c')).toBeUndefined() // zeroed out
  })

  it('boots become voted-out, final eliminations (one per tribal)', () => {
    const s = emptyState()
    s.boots = ['x', 'y']
    expect(deriveEliminations(s)).toEqual([
      { contestant_id: 'x', elimination_type: 'voted_out', is_final: true },
      { contestant_id: 'y', elimination_type: 'voted_out', is_final: true },
    ])
  })

  it('vote tally counts only confirmed votes, most-voted first', () => {
    const s = emptyState()
    s.votes = {
      a: { target: 'x', confirmed: true },
      b: { target: 'x', confirmed: true },
      c: { target: 'y', confirmed: true },
      d: { target: 'y', confirmed: false },
    }
    expect(voteTally(s)).toEqual([
      { target: 'x', count: 2 },
      { target: 'y', count: 1 },
    ])
  })

  it('routes events to tabs and keeps win/vote/placement events off the chips', () => {
    expect(tabForEvent('jeff_thats_how_you_do_it')).toBe('extras')
    expect(tabForEvent('win_fire_making_challenge')).toBe('final')
    expect(tabForEvent('go_on_journey')).toBe('camp') // unmapped default
    const events: RuleScoringEvent[] = [
      { event_type: 'win_team_immunity', label: 'Team immunity', point_value: 5, postmerge_point_value: null, token_value: 0, is_per_unit: false },
      { event_type: 'vote_correctly_at_tribal', label: 'Vote correctly', point_value: 3, postmerge_point_value: 5, token_value: 0, is_per_unit: false },
      { event_type: 'go_on_journey', label: 'Journey', point_value: 4, postmerge_point_value: null, token_value: 0, is_per_unit: false },
    ]
    const camp = chipEventsForTab(events, 'camp')
    expect(camp.map((e) => e.event_type)).toEqual(['go_on_journey']) // win + vote excluded
  })

  it('suggests the vote-tally leader as the boot when none is marked (#774)', () => {
    const s = emptyState()
    s.votes = {
      a: { target: 'x', confirmed: true },
      b: { target: 'x', confirmed: true },
      c: { target: 'y', confirmed: true },
    }
    expect(suggestedBoot(s)).toBe('x')
    s.boots = ['x'] // once a boot is marked, no suggestion
    expect(suggestedBoot(s)).toBeNull()
    expect(suggestedBoot(emptyState())).toBeNull() // nothing to go on
  })

  it('converts individual wins to team, deduping (#773)', () => {
    const wins = { win_individual_immunity: ['a', 'b'], win_team_immunity: ['b'] }
    const out = convertWinsToTeam(wins, 'win_individual_immunity', 'win_team_immunity')
    expect(out.win_individual_immunity).toEqual([])
    expect([...out.win_team_immunity].sort()).toEqual(['a', 'b'])
    expect(convertWinsToTeam({}, 'win_individual_immunity', 'win_team_immunity')).toEqual({}) // no-op
  })
})

describe('draft tribes', () => {
  const person = (id: string, tribe_name: string | null = null, tribe_color: string | null = null) =>
    ({ id, name: id, tribe_name, tribe_color }) as CastMember

  it('moves a contestant between tribes and back to the pool', () => {
    let t = [
      { name: 'Luvu', color: '#1f6fb2', members: [] as string[] },
      { name: 'Gata', color: '#e0b020', members: [] as string[] },
    ]
    t = moveToTribe(t, 'a', 0)
    t = moveToTribe(t, 'a', 1)
    expect(t.map((x) => x.members)).toEqual([[], ['a']])
    expect(moveToTribe(t, 'a', null).map((x) => x.members)).toEqual([[], []])
  })

  it('overrides published tribes, and reads as published once the server matches', () => {
    const tribes = [{ name: ' Luvu ', color: '#1F6FB2', members: ['a'] }]
    const cast = [person('a'), person('b', 'Old', '#000000')]
    const drafted = applyDraftTribes(cast, tribes)
    expect(drafted.map((c) => c.tribe_name)).toEqual(['Luvu', 'Old'])
    expect(draftIsPublished(cast, tribes)).toBe(false)
    expect(draftIsPublished([person('a', 'Luvu', '#1f6fb2')], tribes)).toBe(true)
    expect(draftIsPublished(cast, [])).toBe(false)
  })
})
