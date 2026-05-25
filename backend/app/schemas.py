from datetime import datetime
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
    status: str
    created_at: datetime


class Contestant(BaseModel):
    id: UUID
    season_id: UUID
    name: str
    placement: Optional[int]
    created_at: datetime
