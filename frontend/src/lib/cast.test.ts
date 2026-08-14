import { describe, expect, it } from 'vitest'
import type { CastMember } from '../types'
import { castStatus, rankCast } from './cast'

function member(
  name: string,
  points: number,
  eliminated: number | null = null,
  tribe = 'Original tribe',
): CastMember {
  return {
    id: name,
    name,
    image_url: null,
    placement: null,
    eliminated_in_episode: eliminated,
    tribe_name: tribe,
    tribe_color: '#123456',
    total_points: points,
    total_tokens: 0,
  }
}

describe('cast ranking helpers', () => {
  const cast = [
    member('Zoe', 2),
    member('Amy', 10, 3),
    member('Ben', 10, null, 'New tribe'),
    member('First boot', 40, 1),
    member('Second boot', -3, 2),
  ]

  it('ranks active castaways by points before eliminated castaways in reverse boot order', () => {
    const rows = rankCast(cast)
    expect(rows.map((row) => row.name)).toEqual(['Ben', 'Zoe', 'Amy', 'Second boot', 'First boot'])
    expect(rows.find((row) => row.name === 'Ben')?.tribe_name).toBe('New tribe')
  })

  it('describes active, eliminated, and placed states in full', () => {
    expect(castStatus(member('A', 0))).toBe('Still in the game')
    expect(castStatus(member('B', 0, 4))).toBe('Eliminated in episode 4')
    expect(castStatus({ placement: 2, eliminated_in_episode: 12 })).toBe('Placed #2')
  })
})
