from datetime import date, datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class EliminationPickTier(BaseModel):
    """One step of a season's vote schedule: from this episode on, this many
    elimination picks (#269). Applies until the next tier starts."""

    from_episode: int = Field(gt=0)
    picks: int = Field(ge=1, le=3)


class Season(BaseModel):
    """The show: shared by every league playing it (#595)."""

    id: UUID
    name: str
    season_number: int
    merge_episode: Optional[int]
    elimination_pick_schedule: list[EliminationPickTier]
    status: str
    created_at: datetime


class LeagueSeason(Season):
    """One league playing one season: the season plus that league's rule knobs.

    `id` is the league-season id; `season_id` is the show. Every play route
    is keyed by `id`.
    """

    season_id: UUID
    league_id: UUID
    league_name: str
    roster_size: int
    roster_lock_episode: Optional[int]
    swap_lock_episode: Optional[int]
    free_swaps: int
    swap_penalty_step: int
    swap_penalty_floor: int
    swap_token_cost: int
    weekly_token_allocation: int
    token_economy_enabled: bool
    ss_lock_episode: Optional[int]
    advantage_lock_episode: Optional[int]


class LeagueSeasonCreateRequest(BaseModel):
    season_id: UUID
    roster_size: int = Field(default=5, ge=1, le=10)
    # Required for a season to be playable (#152): default 1.
    roster_lock_episode: int = Field(default=1, gt=0)
    swap_lock_episode: Optional[int] = Field(default=None, gt=0)
    free_swaps: int = Field(default=1, ge=0)
    swap_penalty_step: int = Field(default=-5, le=0)
    swap_penalty_floor: int = Field(default=-25, le=0)
    ss_lock_episode: Optional[int] = Field(default=None, gt=0)
    advantage_lock_episode: Optional[int] = Field(default=None, gt=0)
    # Tokens are retired (#307); kept so a league can switch the economy back
    # on deliberately.
    swap_token_cost: int = Field(default=20, ge=0)
    weekly_token_allocation: int = Field(default=0, ge=0)
    token_economy_enabled: bool = False


class LeagueSeasonUpdateRequest(BaseModel):
    roster_size: Optional[int] = Field(default=None, ge=1, le=10)
    roster_lock_episode: Optional[int] = Field(default=None, gt=0)
    swap_lock_episode: Optional[int] = Field(default=None, gt=0)
    free_swaps: Optional[int] = Field(default=None, ge=0)
    swap_penalty_step: Optional[int] = Field(default=None, le=0)
    swap_penalty_floor: Optional[int] = Field(default=None, le=0)
    ss_lock_episode: Optional[int] = Field(default=None, gt=0)
    advantage_lock_episode: Optional[int] = Field(default=None, gt=0)
    swap_token_cost: Optional[int] = Field(default=None, ge=0)
    weekly_token_allocation: Optional[int] = Field(default=None, ge=0)
    token_economy_enabled: Optional[bool] = None


class Contestant(BaseModel):
    id: UUID
    season_id: UUID
    name: str
    # Short display name (#nickname); null means fall back to `name`.
    nickname: Optional[str] = None
    placement: Optional[int]
    image_url: Optional[str] = None
    # Only populated by the season contestants list; None elsewhere
    eliminated_in_episode: Optional[int] = None
    # Current tribe (#212): None until tribes are synced / for pre-import seasons
    tribe_name: Optional[str] = None
    tribe_color: Optional[str] = None
    # Cast bio (#262): imported from survivoR, except the hand-written blurb
    age: Optional[int] = None
    occupation: Optional[str] = None
    hometown: Optional[str] = None
    bio: Optional[str] = None
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
    # Manually entered by the admin (#450) — no TVmaze auto-fetch.
    title: Optional[str] = None


class RosterPick(BaseModel):
    id: UUID
    user_id: UUID
    league_season_id: UUID
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


class StandingSurvivor(BaseModel):
    """One roster pick, for the standings glance (#83).

    `eliminated_episode` is only set for `recently_eliminated_survivors` entries.
    """

    contestant_id: UUID
    name: str
    image_url: Optional[str] = None
    tribe_name: Optional[str] = None
    tribe_color: Optional[str] = None
    eliminated_episode: Optional[int] = None


class StandingEntry(BaseModel):
    user_id: UUID
    display_name: str
    roster_points: int
    elimination_points: int
    finale_points: int
    total_points: int
    # Rank change vs the previous scored episode: "up" | "down" | "same".
    # None until at least one episode has been scored.
    trend: Optional[str] = None
    # Places moved since the previous scored episode (0 when trend is "same").
    trend_delta: int = 0
    # Points gained in the most recent scored episode (0 if none yet).
    last_episode_points: int = 0
    # Rostered castaways still in the game. Empty until rosters lock — same
    # visibility rule as the roster itself (#83/#160).
    active_survivors: list[StandingSurvivor] = []
    # Rostered castaways eliminated in the latest scored episode, kept visible
    # (greyed out in the UI) for one episode instead of vanishing immediately
    # (#457). Approximated as "until the next episode is scored", not "airs".
    recently_eliminated_survivors: list[StandingSurvivor] = []


class HubEntry(BaseModel):
    """One player's locked choices for the airing episode (#490).

    Only exposed once the episode locks, when everyone's picks are already
    public — the Hub is a view over data, not a new privacy surface.
    """

    user_id: UUID
    display_name: str
    roster: list[StandingSurvivor] = []
    ballot: list[StandingSurvivor] = []
    # The advantage played this episode, if any.
    advantage_type: Optional[str] = None
    advantage_target: Optional[StandingSurvivor] = None


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
    # The +50% Sole Survivor finale bonus, pulled out of the finalist's roster
    # total so a page can name it. Bonus is already inside that contestant's
    # `roster` points — this is for display, not a number to add on top.
    sole_survivor_contestant_id: Optional[UUID] = None
    sole_survivor_bonus: int = 0


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
    merge_episode: Optional[int] = Field(default=None, gt=0)
    status: Literal["upcoming", "active", "completed"] = "upcoming"


class SeasonUpdateRequest(BaseModel):
    name: Optional[str] = None
    season_number: Optional[int] = None
    merge_episode: Optional[int] = Field(default=None, gt=0)
    elimination_pick_schedule: Optional[list[EliminationPickTier]] = None
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
    # Token earning stops at the advantage cutoff (#102), so an event's
    # token_value here is a rule value nobody actually received (#295).
    tokens_locked: bool = False
    is_finale: bool = False


class ContestantPerformance(BaseModel):
    name: str
    image_url: Optional[str] = None
    placement: Optional[int] = None
    eliminated_in_episode: Optional[int] = None
    tribe_name: Optional[str] = None
    tribe_color: Optional[str] = None
    age: Optional[int] = None
    occupation: Optional[str] = None
    hometown: Optional[str] = None
    bio: Optional[str] = None
    total_points: int
    episodes: list[ContestantEpisodeStat]


class CastMember(BaseModel):
    id: UUID
    name: str
    image_url: Optional[str] = None
    placement: Optional[int] = None
    eliminated_in_episode: Optional[int] = None
    # The last episode this castaway played, which is NOT the elimination
    # episode for a finalist: survivoR maps sole survivor and runner-up to no
    # elimination at all, so their run ends at the finale (#532). Drives the
    # Cast badge; `eliminated_in_episode` still drives strike-through and sort.
    final_episode: Optional[int] = None
    tribe_name: Optional[str] = None
    tribe_color: Optional[str] = None
    # Base gameplay score: raw scoring events only, no per-user advantage
    # doubling and no swap penalties (issue: full cast list).
    total_points: int
    total_tokens: int


class ContestantsCreateRequest(BaseModel):
    names: list[str] = Field(min_length=1)


class ContestantUpdateRequest(BaseModel):
    name: Optional[str] = None
    nickname: Optional[str] = None
    placement: Optional[int] = Field(default=None, gt=0)
    image_url: Optional[str] = None
    age: Optional[int] = Field(default=None, gt=0)
    occupation: Optional[str] = None
    hometown: Optional[str] = None
    bio: Optional[str] = None


class EpisodeCreateRequest(BaseModel):
    episode_number: int = Field(gt=0)
    air_date: date
    # Omit to take the season's elimination_pick_schedule (#269); an explicit
    # value still wins, so a single episode can be overridden at create time.
    max_elimination_picks: Optional[int] = Field(default=None, ge=1, le=3)
    is_finale: bool = False
    picks_lock_at: datetime
    title: Optional[str] = None


class EpisodeUpdateRequest(BaseModel):
    episode_number: Optional[int] = Field(default=None, gt=0)
    air_date: Optional[date] = None
    max_elimination_picks: Optional[int] = Field(default=None, ge=1, le=3)
    is_finale: Optional[bool] = None
    picks_lock_at: Optional[datetime] = None
    title: Optional[str] = None


class AdvantagePlay(BaseModel):
    id: UUID
    user_id: UUID
    league_season_id: UUID
    # None while the advantage sits unused in the owner's inventory
    episode_id: Optional[UUID]
    advantage_type: str
    target_contestant_id: Optional[UUID]
    token_cost: int
    # Bonus points a played double actually earned (issue #85); None until
    # played, and always None for extra_vote (no single pick to attribute).
    points_earned: Optional[int] = None
    created_at: datetime


class AdvantagePlayRequest(BaseModel):
    """Spending the week's one advantage play (#307) — no separate buy step."""

    advantage_type: str
    target_contestant_id: Optional[UUID] = None


class EpisodeResultContestant(BaseModel):
    contestant_id: UUID
    name: str
    image_url: Optional[str] = None


class EpisodeResultElimination(EpisodeResultContestant):
    elimination_type: str


class EpisodeResultBallotPick(EpisodeResultContestant):
    prediction_type: Literal[
        "elimination",
        "final_four",
        "final_three",
        "perfect_final_three",
        "winner",
    ]
    correct: bool
    points: int


class EpisodeResultBreakdownLine(BaseModel):
    event_type: str
    label: str
    quantity: int
    points: int


class EpisodeResultRosterMember(EpisodeResultContestant):
    points: int
    breakdown: list[EpisodeResultBreakdownLine] = Field(default_factory=list)


class EpisodeResultWeeklyPlay(BaseModel):
    advantage_play_id: UUID
    advantage_type: str
    target_contestant_id: Optional[UUID] = None
    target_name: Optional[str] = None
    bonus_points: int


class EpisodeResultInsight(BaseModel):
    id: UUID
    label: str
    value: str
    detail: Optional[str] = None


class EpisodeResult(BaseModel):
    episode_id: UUID
    episode_number: int
    title: Optional[str] = None
    is_finale: bool
    eliminated: list[EpisodeResultElimination]
    ballot: list[EpisodeResultBallotPick]
    roster: list[EpisodeResultRosterMember]
    roster_points: int
    roster_adjustment_points: int
    ballot_points: int
    weekly_plays: list[EpisodeResultWeeklyPlay]
    weekly_play_bonus: int
    total_points: int
    current_rank: Optional[int] = None
    prior_rank: Optional[int] = None
    rank_delta: Optional[int] = None
    insights: list[EpisodeResultInsight] = Field(default_factory=list)


class EpisodeInsightConfigEntry(BaseModel):
    insight_type: Literal[
        "pick_popularity",
        "multiple_correct_ballots",
        "performance_vs_median",
        "weekly_play_usage",
        "manual_note",
    ]
    contestant_id: Optional[UUID] = None
    advantage_type: Optional[
        Literal["double_roster_points", "double_vote_points", "roster_swap"]
    ] = None
    label: Optional[str] = None
    value: Optional[str] = None
    detail: Optional[str] = None


class EpisodeInsightConfig(EpisodeInsightConfigEntry):
    id: UUID
    episode_id: UUID
    display_order: int


class RevealAcknowledgementRequest(BaseModel):
    episode_id: UUID


class RevealAcknowledgement(BaseModel):
    league_season_id: UUID
    episode_id: UUID
    acknowledged_at: datetime


class AdvantageType(BaseModel):
    advantage_type: str
    label: str
    token_cost: int
    enabled: bool


class RulesResponse(BaseModel):
    season: LeagueSeason
    scoring_events: list[RuleScoringEvent]
    prediction_scores: list[RulePredictionScore]
    advantages: list[AdvantageType]


class LeagueRef(BaseModel):
    id: UUID
    name: str


class League(LeagueRef):
    join_code: str
    member_count: int
    created_at: datetime


class LeagueCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    join_code: str = Field(min_length=1)


class LeagueUpdateRequest(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    join_code: Optional[str] = Field(default=None, min_length=1)


class LeagueMember(BaseModel):
    id: UUID
    display_name: str
    joined_at: datetime


class TokenTransaction(BaseModel):
    id: UUID
    user_id: UUID
    league_season_id: UUID
    episode_id: Optional[UUID]
    transaction_type: str
    amount: int
    scoring_event_id: Optional[UUID]
    advantage_play_id: Optional[UUID]
    notes: Optional[str]
    created_at: datetime


class TokenBalance(BaseModel):
    user_id: UUID
    league_season_id: UUID
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
    leagues: list[LeagueRef]


class JoinRequest(BaseModel):
    # Required on the first join (it creates the profile), ignored after.
    display_name: Optional[str] = Field(default=None, max_length=40)
    join_code: str = Field(min_length=1)


class ProfileUpdateRequest(BaseModel):
    display_name: str = Field(min_length=1, max_length=40)


class FinalePrediction(BaseModel):
    id: UUID
    user_id: UUID
    league_season_id: UUID
    final_four_contestant_ids: list[UUID] = Field(default_factory=list)
    final_three_contestant_ids: list[UUID] = Field(default_factory=list)
    winner_contestant_id: Optional[UUID]
    created_at: datetime


class FinalePredictionRequest(BaseModel):
    final_four_contestant_ids: list[UUID] = Field(default_factory=list, max_length=4)
    final_three_contestant_ids: list[UUID] = Field(default_factory=list, max_length=3)
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
