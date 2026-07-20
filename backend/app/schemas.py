from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class Season(BaseModel):
    id: UUID
    name: str
    season_number: int
    roster_size: int
    roster_lock_episode: Optional[int]
    merge_episode: Optional[int]
    winner_lock_episode: Optional[int]
    swap_token_cost: int
    free_swaps: int
    max_swaps: int
    winner_mode: Literal["classic", "sole_survivor"]
    ss_lock_episode: Optional[int]
    swap_lock_episode: Optional[int]
    advantage_lock_episode: Optional[int]
    weekly_token_allocation: int
    status: str
    created_at: datetime


class Contestant(BaseModel):
    id: UUID
    season_id: UUID
    name: str
    placement: Optional[int]
    image_url: Optional[str] = None
    # Only populated by the season contestants list; None elsewhere
    eliminated_in_episode: Optional[int] = None
    created_at: datetime


class Episode(BaseModel):
    id: UUID
    season_id: UUID
    episode_number: int
    air_date: date
    max_elimination_picks: int
    is_finale: bool
    picks_lock_at: datetime
    status: str
    created_at: datetime


class RosterPick(BaseModel):
    id: UUID
    user_id: UUID
    season_id: UUID
    contestant_id: UUID
    active_from_episode: int
    active_until_episode: Optional[int]
    # Historical: the point penalty applied when this row was closed by a
    # pre-2026-07-18 swap. Always 0 since swaps moved to a token cost.
    swap_penalty_points: int
    # Sole Survivor designation (#164); masked for other players pre-lock.
    is_sole_survivor: bool = False
    created_at: datetime


class EliminationPick(BaseModel):
    id: UUID
    user_id: UUID
    episode_id: UUID
    contestant_id: UUID
    created_at: datetime


class StandingEntry(BaseModel):
    user_id: UUID
    display_name: str
    roster_points: int
    elimination_points: int
    winner_points: int
    finale_points: int
    total_points: int
    # Rank change vs the previous scored episode: "up" | "down" | "same".
    # None until at least one episode has been scored.
    trend: Optional[str] = None
    # Places moved since the previous scored episode (0 when trend is "same").
    trend_delta: int = 0
    # Points gained in the most recent scored episode (0 if none yet).
    last_episode_points: int = 0


class ContestantPoints(BaseModel):
    contestant_id: UUID
    points: int


class PickResult(BaseModel):
    episode_id: UUID
    contestant_id: UUID
    correct: bool
    points: int


class ScoringBreakdown(BaseModel):
    roster: list[ContestantPoints]
    picks: list[PickResult]


# --- Request bodies ---


class RosterSubmitRequest(BaseModel):
    contestant_ids: list[UUID]


class RosterSwapRequest(BaseModel):
    old_contestant_id: UUID
    new_contestant_id: UUID


class SoleSurvivorRequest(BaseModel):
    contestant_id: UUID


class EliminationPickSubmitRequest(BaseModel):
    contestant_ids: list[UUID]


class Elimination(BaseModel):
    id: UUID
    episode_id: UUID
    contestant_id: UUID
    elimination_type: str
    created_at: datetime


class ScoringEvent(BaseModel):
    id: UUID
    episode_id: UUID
    contestant_id: UUID
    event_type: str
    quantity: int
    notes: Optional[str]
    created_at: datetime


class ScoringEventType(BaseModel):
    event_type: str
    label: str


class RuleScoringEvent(BaseModel):
    event_type: str
    label: str
    point_value: int
    postmerge_point_value: Optional[int]
    token_value: int
    is_per_unit: bool


class RulePredictionScore(BaseModel):
    key: str
    label: str
    point_value: int
    postmerge_point_value: Optional[int]


# --- Admin write bodies ---


class SeasonCreateRequest(BaseModel):
    name: str
    season_number: int
    roster_size: int = Field(default=5, ge=1, le=10)
    # Required for a season to be playable (#152): default 1, explicit null 422s
    # at create time instead of 400ing every roster submit later.
    roster_lock_episode: int = Field(default=1, gt=0)
    merge_episode: Optional[int] = Field(default=None, gt=0)
    winner_lock_episode: Optional[int] = Field(default=3, gt=0)
    swap_token_cost: int = Field(default=20, ge=0)
    free_swaps: int = Field(default=1, ge=0)
    weekly_token_allocation: int = Field(default=10, ge=0)
    winner_mode: Literal["classic", "sole_survivor"] = "sole_survivor"
    ss_lock_episode: Optional[int] = Field(default=None, gt=0)
    status: Literal["upcoming", "active", "completed"] = "upcoming"


class SeasonUpdateRequest(BaseModel):
    name: Optional[str] = None
    season_number: Optional[int] = None
    roster_size: Optional[int] = Field(default=None, ge=1, le=10)
    roster_lock_episode: Optional[int] = Field(default=None, gt=0)
    merge_episode: Optional[int] = Field(default=None, gt=0)
    winner_lock_episode: Optional[int] = Field(default=None, gt=0)
    swap_token_cost: Optional[int] = Field(default=None, ge=0)
    free_swaps: Optional[int] = Field(default=None, ge=0)
    max_swaps: Optional[int] = Field(default=None, ge=0)
    ss_lock_episode: Optional[int] = Field(default=None, gt=0)
    swap_lock_episode: Optional[int] = Field(default=None, gt=0)
    advantage_lock_episode: Optional[int] = Field(default=None, gt=0)
    weekly_token_allocation: Optional[int] = Field(default=None, ge=0)
    status: Optional[Literal["upcoming", "active", "completed"]] = None


class ImportElimination(BaseModel):
    contestant_id: UUID
    name: str
    elimination_type: str
    result: str


class ImportEvent(BaseModel):
    contestant_id: UUID
    name: str
    event_type: str
    quantity: int


class ImportPlacement(BaseModel):
    contestant_id: UUID
    name: str
    placement: int


class ImportProposal(BaseModel):
    eliminations: list[ImportElimination]
    events: list[ImportEvent]
    placements: list[ImportPlacement]
    warnings: list[str]
    # survivoR names with no matching contestant — their items are dropped
    unmatched: list[str]
    source: str


class EpisodeProposalItem(BaseModel):
    episode_number: int
    name: str
    air_date: date
    # Defaults to the TVmaze airstamp; admin adjusts per episode as usual
    picks_lock_at: datetime
    is_finale: bool
    # Episode number already exists in the league season
    exists: bool


class EpisodeProposal(BaseModel):
    episodes: list[EpisodeProposalItem]
    source: str


class ContestantEventStat(BaseModel):
    label: str
    points: int
    token_value: int
    # >1 for per-unit events (e.g. votes received), so the UI can show N×.
    quantity: int


class ContestantEpisodeStat(BaseModel):
    episode_number: int
    points: int
    events: list[ContestantEventStat]
    eliminated_type: Optional[str] = None


class ContestantPerformance(BaseModel):
    name: str
    image_url: Optional[str] = None
    placement: Optional[int] = None
    eliminated_in_episode: Optional[int] = None
    total_points: int
    episodes: list[ContestantEpisodeStat]


class CastMember(BaseModel):
    id: UUID
    name: str
    image_url: Optional[str] = None
    placement: Optional[int] = None
    eliminated_in_episode: Optional[int] = None
    # Base gameplay score: raw scoring events only, no per-user advantage
    # doubling and no swap penalties (issue: full cast list).
    total_points: int
    total_tokens: int


class ContestantsCreateRequest(BaseModel):
    names: list[str] = Field(min_length=1)


class ContestantUpdateRequest(BaseModel):
    name: Optional[str] = None
    placement: Optional[int] = Field(default=None, gt=0)
    image_url: Optional[str] = None


class EpisodeCreateRequest(BaseModel):
    episode_number: int = Field(gt=0)
    air_date: date
    max_elimination_picks: int = Field(ge=1, le=3)
    is_finale: bool = False
    picks_lock_at: datetime


class EpisodeUpdateRequest(BaseModel):
    episode_number: Optional[int] = Field(default=None, gt=0)
    air_date: Optional[date] = None
    max_elimination_picks: Optional[int] = Field(default=None, ge=1, le=3)
    is_finale: Optional[bool] = None
    picks_lock_at: Optional[datetime] = None


class AdvantagePlay(BaseModel):
    id: UUID
    user_id: UUID
    season_id: UUID
    # None while the advantage sits unused in the owner's inventory
    episode_id: Optional[UUID]
    advantage_type: str
    target_contestant_id: Optional[UUID]
    token_cost: int
    # Bonus points a played double actually earned (issue #85); None until
    # played, and always None for extra_vote (no single pick to attribute).
    points_earned: Optional[int] = None
    created_at: datetime


class AdvantageBuyRequest(BaseModel):
    advantage_type: str


class AdvantageUseRequest(BaseModel):
    target_contestant_id: Optional[UUID] = None


class AdvantageType(BaseModel):
    advantage_type: str
    label: str
    token_cost: int
    enabled: bool


class RulesResponse(BaseModel):
    season: Season
    scoring_events: list[RuleScoringEvent]
    prediction_scores: list[RulePredictionScore]
    advantages: list[AdvantageType]


class LeagueSettings(BaseModel):
    id: UUID
    join_code: str
    updated_at: datetime


class LeagueSettingsUpdateRequest(BaseModel):
    join_code: str = Field(min_length=1)


class TokenTransaction(BaseModel):
    id: UUID
    user_id: UUID
    season_id: UUID
    episode_id: Optional[UUID]
    transaction_type: str
    amount: int
    scoring_event_id: Optional[UUID]
    advantage_play_id: Optional[UUID]
    notes: Optional[str]
    created_at: datetime


class TokenBalance(BaseModel):
    user_id: UUID
    season_id: UUID
    balance: int


class TokenLedgerEntry(BaseModel):
    created_at: datetime
    transaction_type: str
    amount: int
    episode_number: Optional[int] = None
    description: Optional[str] = None


class WeeklyAllocationRequest(BaseModel):
    episode_id: UUID
    amount: int = Field(gt=0)


class UserProfile(BaseModel):
    id: UUID
    display_name: str
    is_admin: bool


class JoinRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)
    join_code: str = Field(min_length=1)


class ProfileUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)


class WinnerPick(BaseModel):
    id: UUID
    user_id: UUID
    season_id: UUID
    winner_contestant_id: UUID
    created_at: datetime


class WinnerPickSubmitRequest(BaseModel):
    winner_contestant_id: UUID


class FinalePrediction(BaseModel):
    id: UUID
    user_id: UUID
    season_id: UUID
    early_boot_contestant_id: Optional[UUID]
    fire_loss_contestant_id: Optional[UUID]
    winner_contestant_id: Optional[UUID]
    created_at: datetime


class FinalePredictionRequest(BaseModel):
    early_boot_contestant_id: Optional[UUID] = None
    fire_loss_contestant_id: Optional[UUID] = None
    winner_contestant_id: Optional[UUID] = None


class EliminationEntry(BaseModel):
    contestant_id: UUID
    elimination_type: Literal[
        "voted_out", "medical_evacuation", "quit", "fire_making_loss"
    ]


class ScoringEventEntry(BaseModel):
    contestant_id: UUID
    event_type: str
    quantity: int = Field(default=1, ge=1)
    notes: Optional[str] = None
