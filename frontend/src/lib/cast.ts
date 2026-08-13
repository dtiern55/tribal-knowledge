import type { CastMember } from '../types'

export type CastFilter = 'all' | 'active' | 'eliminated'
export type CastSort = 'score' | 'name'

export function castStatus(member: Pick<CastMember, 'placement' | 'eliminated_in_episode'>) {
  if (member.placement != null) return `Placed #${member.placement}`
  if (member.eliminated_in_episode != null) return `Eliminated in episode ${member.eliminated_in_episode}`
  return 'Still in the game'
}

export function filterAndSortCast(
  cast: CastMember[],
  filter: CastFilter,
  sort: CastSort,
): CastMember[] {
  const filtered = cast.filter((member) => {
    if (filter === 'active') return member.eliminated_in_episode == null
    if (filter === 'eliminated') return member.eliminated_in_episode != null
    return true
  })

  return [...filtered].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    return b.total_points - a.total_points || a.name.localeCompare(b.name)
  })
}
