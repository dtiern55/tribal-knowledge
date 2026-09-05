import idolImg from '../assets/weekly-advantage-idol-dimensional.webp'
import whaleS51 from '../assets/weekly-advantage-whale-s51.webp'

/** Per-season ×2 art keyed by show season number (#642). Seasons not listed
 *  fall back to the carved skull idol. Source renders live in
 *  design/source-art; export a 128px RGBA webp into `src/assets` and add a
 *  line here. */
const SEASON_IDOLS: Record<number, string> = {
  51: whaleS51,
}

export function advantageIdolFor(seasonNumber: number | null | undefined): string {
  return (seasonNumber != null && SEASON_IDOLS[seasonNumber]) || idolImg
}

// Display names for advantage types. Shared so My Season and another player's
// team page can't drift apart on what an advantage is called.
export const ADV_LABELS: Record<string, string> = {
  double_roster_points: 'Double Castaway Points',
  double_vote_points: 'Double Ballot Points',
  extra_vote: 'Extra Vote',
  roster_swap: 'Tribe Swap',
}
