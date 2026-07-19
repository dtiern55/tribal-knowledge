from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin, get_current_user
from app.schemas import (
    TokenBalance,
    TokenLedgerEntry,
    TokenTransaction,
    WeeklyAllocationRequest,
)

router = APIRouter(tags=["tokens"])


@router.get(
    "/seasons/{season_id}/tokens/{user_id}/history",
    response_model=list[TokenLedgerEntry],
)
def get_token_history(
    season_id: UUID,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    """Owner-only ledger of where a user's tokens came from and went (#74)."""
    if str(user_id) != str(current_user):
        raise HTTPException(status_code=403, detail="Token history is private")
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            cur.execute(
                """
                select tt.created_at, tt.transaction_type, tt.amount,
                       e.episode_number,
                       coalesce(c.name || ' — ' || et.label,
                                ap.advantage_type, tt.notes) as description
                from token_transactions tt
                left join episodes e on e.id = tt.episode_id
                left join scoring_events se on se.id = tt.scoring_event_id
                left join contestants c on c.id = se.contestant_id
                left join season_scoring_event_types et
                  on et.event_type = se.event_type
                 and et.season_id = tt.season_id
                left join advantage_plays ap on ap.id = tt.advantage_play_id
                where tt.user_id = %s and tt.season_id = %s
                order by tt.created_at desc
                """,
                [str(user_id), str(season_id)],
            )
            return cur.fetchall()


@router.get("/seasons/{season_id}/tokens/{user_id}", response_model=TokenBalance)
def get_token_balance(
    season_id: UUID,
    user_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    if str(user_id) != str(current_user):
        raise HTTPException(status_code=403, detail="Token balances are private")
    with database.get_db() as conn:
        with conn.cursor() as cur:
            database.require_season(cur, season_id)
            cur.execute(
                """
                select coalesce(sum(amount), 0) as balance
                from token_transactions
                where user_id = %s and season_id = %s
                """,
                [str(user_id), str(season_id)],
            )
            balance = cur.fetchone()["balance"]
    return TokenBalance(user_id=user_id, season_id=season_id, balance=balance)


@router.post(
    "/seasons/{season_id}/tokens/weekly-allocation",
    response_model=list[TokenTransaction],
)
def allocate_weekly_tokens(
    season_id: UUID,
    body: WeeklyAllocationRequest,
    _: UUID = Depends(get_current_admin),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select id from episodes where id = %s and season_id = %s",
                [str(body.episode_id), str(season_id)],
            )
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Episode not found")

            # Idempotent: insert for all users who don't yet have one for this episode
            cur.execute(
                """
                insert into token_transactions
                    (user_id, season_id, episode_id, transaction_type, amount)
                select p.id, %(season)s, %(episode)s, 'weekly_allocation', %(amount)s
                from profiles p
                where not p.is_admin
                  and not exists (
                    select 1 from token_transactions tt
                    where tt.user_id = p.id
                      and tt.season_id = %(season)s
                      and tt.episode_id = %(episode)s
                      and tt.transaction_type = 'weekly_allocation'
                )
                on conflict do nothing
                returning *
                """,
                {
                    "season": str(season_id),
                    "episode": str(body.episode_id),
                    "amount": body.amount,
                },
            )
            return cur.fetchall()
