import { describe, expect, it } from 'vitest'
import type { CastMember } from '../types'
import { castStatus, filterAndSortCast } from './cast'

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

describe('cast browsing helpers', () => {
  const cast = [member('Zoe', 2), member('Amy', 10, 3), member('Ben', 10, null, 'New tribe')]

  it('filters on current game status and sorts the visible field by score', () => {
    expect(filterAndSortCast(cast, 'active', 'score').map((row) => row.name)).toEqual(['Ben', 'Zoe'])
    expect(filterAndSortCast(cast, 'eliminated', 'score').map((row) => row.name)).toEqual(['Amy'])
  })

  it('offers a predictable alphabetical order without changing current tribe data', () => {
    const rows = filterAndSortCast(cast, 'all', 'name')
    expect(rows.map((row) => row.name)).toEqual(['Amy', 'Ben', 'Zoe'])
    expect(rows.find((row) => row.name === 'Ben')?.tribe_name).toBe('New tribe')
  })

  it('describes active, eliminated, and placed states in full', () => {
    expect(castStatus(member('A', 0))).toBe('Still in the game')
    expect(castStatus(member('B', 0, 4))).toBe('Eliminated in episode 4')
    expect(castStatus({ placement: 2, eliminated_in_episode: 12 })).toBe('Placed #2')
  })
})
