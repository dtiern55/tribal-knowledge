from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database
from app.auth import get_current_admin, get_current_user
from app.schemas import (
    StartingAllocationRequest,
    TokenBalance,
    TokenTransaction,
    WeeklyAllocationRequest,
)

router = APIRouter(tags=["tokens"])


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
            cur.execute("select id from seasons where id = %s", [str(season_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Season not found")
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
    "/seasons/{season_id}/tokens/starting-allocation",
    response_model=list[TokenTransaction],
)
def allocate_starting_tokens(
    season_id: UUID,
    body: StartingAllocationRequest,
    _: UUID = Depends(get_current_admin),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            cur.execute("select id from seasons where id = %s", [str(season_id)])
            if not cur.fetchone():
                raise HTTPException(status_code=404, detail="Season not found")

            if body.user_id is not None:
                cur.execute(
                    "select id from profiles where id = %s", [str(body.user_id)]
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="User not found")
                cur.execute(
                    """
                    select id from token_transactions
                    where user_id = %s and season_id = %s
                      and transaction_type = 'starting_allocation'
                    """,
                    [str(body.user_id), str(season_id)],
                )
                if cur.fetchone():
                    raise HTTPException(
                        status_code=409,
                        detail="Starting allocation already issued to this user",
                    )
                cur.execute(
                    """
                    insert into token_transactions
                        (user_id, season_id, transaction_type, amount)
                    values (%s, %s, 'starting_allocation', %s)
                    returning *
                    """,
                    [str(body.user_id), str(season_id), body.amount],
                )
                return [cur.fetchone()]
            else:
                # Allocate for all profiles who don't already have one
                cur.execute(
                    """
                    insert into token_transactions
                        (user_id, season_id, transaction_type, amount)
                    select p.id, %(season)s, 'starting_allocation', %(amount)s
                    from profiles p
                    where not exists (
                        select 1 from token_transactions tt
                        where tt.user_id = p.id
                          and tt.season_id = %(season)s
                          and tt.transaction_type = 'starting_allocation'
                    )
                    returning *
                    """,
                    {"season": str(season_id), "amount": body.amount},
                )
                return cur.fetchall()


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
                where not exists (
                    select 1 from token_transactions tt
                    where tt.user_id = p.id
                      and tt.season_id = %(season)s
                      and tt.episode_id = %(episode)s
                      and tt.transaction_type = 'weekly_allocation'
                )
                returning *
                """,
                {
                    "season": str(season_id),
                    "episode": str(body.episode_id),
                    "amount": body.amount,
                },
            )
            return cur.fetchall()
