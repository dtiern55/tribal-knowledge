import type { CastMember } from '../types'

/** Nickname stands in for the legal name wherever contestants come from the
 * raw `/seasons/{id}/contestants` list (other endpoints already coalesce
 * this server-side). */
export const displayName = (c: { name: string; nickname?: string | null }) => c.nickname || c.name

export function castStatus(member: Pick<CastMember, 'placement' | 'eliminated_in_episode'>) {
  if (member.placement != null) return `Placed #${member.placement}`
  if (member.eliminated_in_episode != null) return `Eliminated in episode ${member.eliminated_in_episode}`
  return 'Still in the game'
}

/**
 * Active castaways form the live points ranking. Eliminated castaways follow
 * in boot order, with the first person voted out anchored at the bottom.
 */
export function rankCast(cast: CastMember[]): CastMember[] {
  return [...cast].sort((a, b) => {
    const aOut = a.eliminated_in_episode
    const bOut = b.eliminated_in_episode
    if (aOut == null && bOut != null) return -1
    if (aOut != null && bOut == null) return 1
    if (aOut == null && bOut == null) return b.total_points - a.total_points || a.name.localeCompare(b.name)
    // Eliminated: boot order, first out at the bottom. Placement is the true
    // order (it breaks same-episode double-boots); fall back to episode then
    // name only when a placement hasn't been recorded yet. Points never apply.
    if (a.placement != null && b.placement != null) return a.placement - b.placement
    return bOut! - aOut! || a.name.localeCompare(b.name)
  })
}
