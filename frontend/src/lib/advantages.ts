import defaultIcon from '../assets/default-advantage-icon.webp'
import s27Icon from '../assets/s27-advantage-icon.webp'
import s51Icon from '../assets/s51-advantage-icon.webp'

/** Per-season advantage art, the season's idol, keyed by show season number (#642).
 *  Seasons not listed fall back to the carved skull idol. Source renders live in
 *  design/source-art; run design/export_advantage_icons.py and add a line here. */
const SEASON_IDOLS: Record<number, string> = {
  27: s27Icon,
  51: s51Icon,
}

export function advantageIdolFor(seasonNumber: number | null | undefined): string {
  return (seasonNumber != null && SEASON_IDOLS[seasonNumber]) || defaultIcon
}

// Display names for advantage types. Shared so My Season and another player's
// team page can't drift apart on what an advantage is called.
export const ADV_LABELS: Record<string, string> = {
  double_roster_points: 'Double Castaway Points',
  double_vote_points: 'Power Vote',
  extra_vote: 'Extra Vote',
  roster_swap: 'Swap',
}
