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
    swap_penalty_points: int
    status: str
    created_at: datetime


class Contestant(BaseModel):
    id: UUID
    season_id: UUID
    name: str
    placement: Optional[int]
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
    is_doubled: bool
    created_at: datetime


class StandingEntry(BaseModel):
    user_id: UUID
    display_name: str
    roster_points: int
    elimination_points: int
    winner_points: int
    finale_points: int
    total_points: int


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


# --- Admin write bodies ---


class SeasonCreateRequest(BaseModel):
    name: str
    season_number: int
    roster_size: int = Field(default=5, ge=1, le=10)
    roster_lock_episode: Optional[int] = Field(default=None, gt=0)
    merge_episode: Optional[int] = Field(default=None, gt=0)
    swap_penalty_points: int = Field(default=-20, le=0)
    status: Literal["upcoming", "active", "completed"] = "upcoming"


class SeasonUpdateRequest(BaseModel):
    name: Optional[str] = None
    season_number: Optional[int] = None
    roster_size: Optional[int] = Field(default=None, ge=1, le=10)
    roster_lock_episode: Optional[int] = Field(default=None, gt=0)
    merge_episode: Optional[int] = Field(default=None, gt=0)
    swap_penalty_points: Optional[int] = Field(default=None, le=0)
    status: Optional[Literal["upcoming", "active", "completed"]] = None


class ContestantsCreateRequest(BaseModel):
    names: list[str] = Field(min_length=1)


class ContestantUpdateRequest(BaseModel):
    name: Optional[str] = None
    placement: Optional[int] = Field(default=None, gt=0)


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
    episode_id: UUID
    advantage_type: str
    target_user_id: Optional[UUID]
    target_contestant_id: Optional[UUID]
    episode_affected_id: Optional[UUID]
    status: str
    token_cost: int
    created_at: datetime


class AdvantagePlayRequest(BaseModel):
    user_id: UUID
    episode_id: UUID
    advantage_type: str
    target_user_id: Optional[UUID] = None
    target_contestant_id: Optional[UUID] = None
    episode_affected_id: Optional[UUID] = None
    token_cost: int = Field(ge=0)


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


class WinnerPick(BaseModel):
    id: UUID
    user_id: UUID
    season_id: UUID
    winner_contestant_id: UUID
    backup_contestant_id: UUID
    effective_episode: int
    created_at: datetime


class WinnerPickSubmitRequest(BaseModel):
    winner_contestant_id: UUID
    backup_contestant_id: UUID


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
