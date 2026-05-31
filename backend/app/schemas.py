from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


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


# --- Request bodies ---


class RosterSubmitRequest(BaseModel):
    user_id: UUID
    contestant_ids: list[UUID]


class RosterSwapRequest(BaseModel):
    user_id: UUID
    old_contestant_id: UUID
    new_contestant_id: UUID
    episode_id: UUID


class EliminationPickSubmitRequest(BaseModel):
    user_id: UUID
    contestant_ids: list[UUID]
