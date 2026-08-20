export interface UserProfile {
  id: string
  display_name: string
  is_admin: boolean
}

export interface LeagueSettings {
  id: string
  join_code: string
  updated_at: string
}

export interface Season {
  id: string
  name: string
  season_number: number
  roster_size: number
  roster_lock_episode: number | null
  merge_episode: number | null
  swap_token_cost: number
  free_swaps: number
  ss_lock_episode: number | null
  // Escalating swap cost (#404): the Nth charged swap costs step * N, floored.
  // Both negative.
  swap_penalty_step: number
  swap_penalty_floor: number
  swap_lock_episode: number | null
  advantage_lock_episode: number | null
  weekly_token_allocation: number
  token_economy_enabled: boolean
  // Votes per episode as the field shrinks (#269); a tier applies from its
  // episode until the next one starts. Empty = 3 unless set per episode.
  elimination_pick_schedule: EliminationPickTier[]
  status: 'upcoming' | 'active' | 'completed'
  created_at: string
}

export interface EliminationPickTier {
  from_episode: number
  picks: number
}

export interface Contestant {
  id: string
  season_id: string
  name: string
  placement: number | null
  image_url: string | null
  eliminated_in_episode: number | null
  tribe_name: string | null
  tribe_color: string | null
  created_at: string
}

export interface Episode {
  id: string
  season_id: string
  episode_number: number
  air_date: string
  max_elimination_picks: number
  is_finale: boolean
  picks_lock_at: string
  status: string
  created_at: string
}

export interface StandingSurvivor {
  contestant_id: string
  name: string
  image_url: string | null
  tribe_name: string | null
  tribe_color: string | null
  // Only set on recently_eliminated_survivors entries.
  eliminated_episode: number | null
}

export interface StandingEntry {
  user_id: string
  display_name: string
  roster_points: number
  elimination_points: number
  finale_points: number
  total_points: number
  trend: 'up' | 'down' | 'same' | null
  trend_delta: number
  last_episode_points: number
  // Rostered castaways still in the game; empty until rosters lock.
  active_survivors: StandingSurvivor[]
  // Rostered castaways eliminated in the latest scored episode; kept
  // visible (greyed out) for one episode instead of vanishing (#457).
  recently_eliminated_survivors: StandingSurvivor[]
}

export interface RosterPick {
  id: string
  user_id: string
  season_id: string
  contestant_id: string
  active_from_episode: number
  active_until_episode: number | null
  is_sole_survivor: boolean
  swap_penalty_points: number
  created_at: string
}

export interface EliminationPick {
  id: string
  user_id: string
  episode_id: string
  contestant_id: string
  created_at: string
}

export interface Elimination {
  id: string
  episode_id: string
  contestant_id: string
  elimination_type: string
  created_at: string
}

export interface FinalePrediction {
  id: string
  user_id: string
  season_id: string
  early_boot_contestant_id: string | null
  fire_loss_contestant_id: string | null
  winner_contestant_id: string | null
  created_at: string
}

export interface AdvantageType {
  advantage_type: string
  label: string
  token_cost: number
  enabled: boolean
}

export interface AdvantagePlay {
  id: string
  user_id: string
  season_id: string
  // null while the advantage sits unused in the owner's inventory
  episode_id: string | null
  advantage_type: string
  target_contestant_id: string | null
  token_cost: number
  // bonus points a played double earned; null until played / for extra_vote
  points_earned: number | null
  created_at: string
}

export interface EpisodeResultContestant {
  contestant_id: string
  name: string
  image_url: string | null
}

export interface EpisodeResultElimination extends EpisodeResultContestant {
  elimination_type: string
}

export interface EpisodeResultBallotPick extends EpisodeResultContestant {
  prediction_type: 'elimination' | 'early_boot' | 'fire_loss' | 'winner'
  correct: boolean
  points: number
}

export interface EpisodeResultBreakdownLine {
  event_type: string
  label: string
  quantity: number
  points: number
}

export interface EpisodeResultRosterMember extends EpisodeResultContestant {
  points: number
  breakdown: EpisodeResultBreakdownLine[]
}

export interface EpisodeResultWeeklyPlay {
  advantage_play_id: string
  advantage_type: string
  target_contestant_id: string | null
  target_name: string | null
  bonus_points: number
}

/** Optional editorial facts are added by #333. Reveal deliberately accepts
 * an absent/empty collection so no placeholder insight module leaks into the
 * base result experience. */
export interface EpisodeResultInsight {
  id: string
  label: string
  value: string
  detail?: string | null
}

export interface EpisodeResult {
  episode_id: string
  episode_number: number
  is_finale: boolean
  eliminated: EpisodeResultElimination[]
  ballot: EpisodeResultBallotPick[]
  roster: EpisodeResultRosterMember[]
  roster_points: number
  roster_adjustment_points: number
  ballot_points: number
  weekly_plays: EpisodeResultWeeklyPlay[]
  weekly_play_bonus: number
  total_points: number
  current_rank: number | null
  prior_rank: number | null
  rank_delta: number | null
  insights?: EpisodeResultInsight[]
}

export type EpisodeInsightType =
  | 'pick_popularity'
  | 'multiple_correct_ballots'
  | 'performance_vs_median'
  | 'weekly_play_usage'

export interface EpisodeInsightConfig {
  id: string
  episode_id: string
  insight_type: EpisodeInsightType
  contestant_id: string | null
  advantage_type: 'double_roster_points' | 'double_vote_points' | 'roster_swap' | null
  display_order: number
}

export interface ScoringEventType {
  event_type: string
  label: string
}

export interface RuleScoringEvent {
  event_type: string
  label: string
  point_value: number
  postmerge_point_value: number | null
  token_value: number
  is_per_unit: boolean
}

export interface RulePredictionScore {
  key: string
  label: string
  point_value: number
  postmerge_point_value: number | null
}

export interface RulesResponse {
  season: Season
  scoring_events: RuleScoringEvent[]
  prediction_scores: RulePredictionScore[]
  advantages: AdvantageType[]
}

export interface TokenBalance {
  user_id: string
  season_id: string
  balance: number
}

export interface TokenLedgerEntry {
  created_at: string
  transaction_type: string
  amount: number
  episode_number: number | null
  description: string | null
}

export interface ContestantPoints {
  contestant_id: string
  points: number
}

export interface PickResult {
  episode_id: string
  contestant_id: string
  correct: boolean
  points: number
}

export interface ScoringBreakdown {
  roster: ContestantPoints[]
  picks: PickResult[]
}

export interface CastMember {
  id: string
  name: string
  image_url: string | null
  placement: number | null
  eliminated_in_episode: number | null
  tribe_name: string | null
  tribe_color: string | null
  total_points: number
  total_tokens: number
}

export interface ContestantEventStat {
  label: string
  points: number
  token_value: number
  quantity: number
}

export interface ContestantEpisodeStat {
  episode_number: number
  points: number
  events: ContestantEventStat[]
  eliminated_type: string | null
  // Token earning stops at the advantage cutoff — an event's token_value on a
  // locked episode is a rule value nobody received.
  tokens_locked: boolean
  is_finale: boolean
}

export interface ContestantPerformance {
  name: string
  image_url: string | null
  placement: number | null
  eliminated_in_episode: number | null
  tribe_name: string | null
  tribe_color: string | null
  age: number | null
  occupation: string | null
  hometown: string | null
  bio: string | null
  total_points: number
  episodes: ContestantEpisodeStat[]
}
