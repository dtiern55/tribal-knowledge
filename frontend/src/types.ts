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
  winner_lock_episode: number | null
  swap_penalty_points: number
  weekly_token_allocation: number
  status: 'upcoming' | 'active' | 'completed'
  created_at: string
}

export interface Contestant {
  id: string
  season_id: string
  name: string
  placement: number | null
  image_url: string | null
  eliminated_in_episode: number | null
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

export interface StandingEntry {
  user_id: string
  display_name: string
  roster_points: number
  elimination_points: number
  winner_points: number
  finale_points: number
  total_points: number
}

export interface RosterPick {
  id: string
  user_id: string
  season_id: string
  contestant_id: string
  active_from_episode: number
  active_until_episode: number | null
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

export interface FinalePrediction {
  id: string
  user_id: string
  season_id: string
  early_boot_contestant_id: string | null
  fire_loss_contestant_id: string | null
  winner_contestant_id: string | null
  created_at: string
}

export interface WinnerPick {
  id: string
  user_id: string
  season_id: string
  winner_contestant_id: string
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
  created_at: string
}

export interface ScoringEventType {
  event_type: string
  label: string
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

