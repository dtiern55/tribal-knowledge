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
    swap_penalty_points: int
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
    swap_penalty_points: int
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
    episode_id: UUID


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


# --- Admin write bodies ---


class SeasonCreateRequest(BaseModel):
    name: str
    season_number: int
    roster_size: int = Field(default=5, ge=1, le=10)
    roster_lock_episode: Optional[int] = Field(default=None, gt=0)
    merge_episode: Optional[int] = Field(default=None, gt=0)
    winner_lock_episode: Optional[int] = Field(default=3, gt=0)
    swap_penalty_points: int = Field(default=-20, le=0)
    weekly_token_allocation: int = Field(default=10, ge=0)
    status: Literal["upcoming", "active", "completed"] = "upcoming"


class SeasonUpdateRequest(BaseModel):
    name: Optional[str] = None
    season_number: Optional[int] = None
    roster_size: Optional[int] = Field(default=None, ge=1, le=10)
    roster_lock_episode: Optional[int] = Field(default=None, gt=0)
    merge_episode: Optional[int] = Field(default=None, gt=0)
    winner_lock_episode: Optional[int] = Field(default=None, gt=0)
    swap_penalty_points: Optional[int] = Field(default=None, le=0)
    weekly_token_allocation: Optional[int] = Field(default=None, ge=0)
    status: Optional[Literal["upcoming", "active", "completed"]] = None


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


class StartingAllocationRequest(BaseModel):
    amount: int = Field(gt=0)
    user_id: Optional[UUID] = None


class WeeklyAllocationRequest(BaseModel):
    episode_id: UUID
    amount: int = Field(gt=0)


class UserProfile(BaseModel):
    id: UUID
    display_name: str
    is_admin: bool


class JoinRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)
    join_code: str = Field(min_length=1)


class ProfileUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=100)


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
