export interface UserProfile {
  id: string
  display_name: string
  is_admin: boolean
}

export interface Season {
  id: string
  name: string
  season_number: number
  roster_size: number
  roster_lock_episode: number | null
  merge_episode: number | null
  swap_penalty_points: number
  status: 'upcoming' | 'active' | 'completed'
  created_at: string
}

export interface Contestant {
  id: string
  season_id: string
  name: string
  placement: number | null
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
  is_doubled: boolean
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
  backup_contestant_id: string
  effective_episode: number
  created_at: string
}

export interface TokenBalance {
  user_id: string
  season_id: string
  balance: number
}

export interface TokenTransaction {
  id: string
  user_id: string
  season_id: string
  episode_id: string | null
  transaction_type: string
  amount: number
  scoring_event_id: string | null
  advantage_play_id: string | null
  notes: string | null
  created_at: string
}

export interface AdvantagePlay {
  id: string
  user_id: string
  episode_id: string
  advantage_type: string
  target_user_id: string | null
  target_contestant_id: string | null
  episode_affected_id: string | null
  status: string
  token_cost: number
  created_at: string
}
