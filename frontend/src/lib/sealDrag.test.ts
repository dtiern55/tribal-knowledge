import { describe, expect, it } from 'vitest'

import { resolveDrop } from './sealDrag'

describe('resolveDrop', () => {
  it('moves a roster double onto the Ballot tab', () => {
    expect(resolveDrop('roster', 'beat:ballot')).toEqual({ kind: 'to_ballot' })
  })

  it('reassigns a roster double dropped on another castaway', () => {
    expect(resolveDrop('roster', 'cast-2')).toEqual({
      kind: 'reassign_roster',
      target: 'cast-2',
    })
  })

  it('does nothing on the roster double’s own or the advantage tab', () => {
    expect(resolveDrop('roster', 'beat:roster')).toEqual({ kind: 'none' })
    expect(resolveDrop('roster', 'beat:advantage')).toEqual({ kind: 'none' })
  })

  it('sends a ballot double back to roster to pick a castaway', () => {
    expect(resolveDrop('ballot', 'beat:roster')).toEqual({ kind: 'to_roster_picking' })
  })

  it('does nothing dropping a ballot double anywhere else', () => {
    expect(resolveDrop('ballot', 'beat:ballot')).toEqual({ kind: 'none' })
    expect(resolveDrop('ballot', 'cast-9')).toEqual({ kind: 'none' })
  })
})
