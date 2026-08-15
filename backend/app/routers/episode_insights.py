from statistics import median
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app import database, scoring
from app.auth import get_current_admin
from app.schemas import EpisodeInsightConfig, EpisodeInsightConfigEntry

router = APIRouter(tags=["episode insights"])

PLAY_LABELS = {
    "double_roster_points": "Double Roster Points",
    "double_vote_points": "Double Ballot Points",
    "roster_swap": "Roster Swap",
}


def _require_episode(cur, episode_id: UUID) -> dict:
    cur.execute("select * from episodes where id = %s", [str(episode_id)])
    episode = cur.fetchone()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    return episode


@router.get(
    "/episodes/{episode_id}/insights",
    response_model=list[EpisodeInsightConfig],
)
def get_episode_insights(episode_id: UUID, _: UUID = Depends(get_current_admin)):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            _require_episode(cur, episode_id)
            cur.execute(
                "select * from episode_insights where episode_id = %s"
                " order by display_order",
                [str(episode_id)],
            )
            return cur.fetchall()


@router.put(
    "/episodes/{episode_id}/insights",
    response_model=list[EpisodeInsightConfig],
)
def set_episode_insights(
    episode_id: UUID,
    body: list[EpisodeInsightConfigEntry],
    _: UUID = Depends(get_current_admin),
):
    if len(body) > 3:
        raise HTTPException(status_code=400, detail="Choose at most three insights")
    selections = [
        (item.insight_type, str(item.contestant_id), item.advantage_type)
        for item in body
    ]
    if len(selections) != len(set(selections)):
        raise HTTPException(status_code=400, detail="Duplicate insight selection")

    with database.get_db() as conn:
        with conn.cursor() as cur:
            episode = _require_episode(cur, episode_id)
            for item in body:
                if item.insight_type == "pick_popularity":
                    if episode["is_finale"]:
                        raise HTTPException(
                            status_code=400,
                            detail=(
                                "Pick popularity is not supported for finale ballots"
                            ),
                        )
                    if item.contestant_id is None:
                        raise HTTPException(
                            status_code=400,
                            detail="Pick popularity needs an eliminated castaway",
                        )
                    cur.execute(
                        "select 1 from eliminations el join contestants c"
                        " on c.id = el.contestant_id"
                        " where el.episode_id = %s and el.contestant_id = %s"
                        " and c.season_id = %s",
                        [
                            str(episode_id),
                            str(item.contestant_id),
                            str(episode["season_id"]),
                        ],
                    )
                    if cur.fetchone() is None:
                        raise HTTPException(
                            status_code=400,
                            detail="Popularity target must be eliminated this episode",
                        )
                    if item.advantage_type is not None:
                        raise HTTPException(
                            status_code=400, detail="Unexpected play type"
                        )
                elif item.insight_type == "weekly_play_usage":
                    if item.advantage_type is None or item.contestant_id is not None:
                        raise HTTPException(
                            status_code=400,
                            detail="Weekly play usage needs one supported play type",
                        )
                elif item.contestant_id is not None or item.advantage_type is not None:
                    raise HTTPException(
                        status_code=400, detail="This insight takes no target"
                    )

            cur.execute(
                "delete from episode_insights where episode_id = %s",
                [str(episode_id)],
            )
            rows = []
            for order, item in enumerate(body):
                cur.execute(
                    """
                    insert into episode_insights
                        (episode_id, insight_type, contestant_id,
                         advantage_type, display_order)
                    values (%s, %s, %s, %s, %s) returning *
                    """,
                    [
                        str(episode_id),
                        item.insight_type,
                        str(item.contestant_id) if item.contestant_id else None,
                        item.advantage_type,
                        order,
                    ],
                )
                rows.append(cur.fetchone())
            return rows


def compute_episode_insights(
    conn, season: dict, episode: dict, user_id: UUID
) -> list[dict]:
    """Compute selected facts beyond the scored-result privacy boundary."""
    if episode["status"] != "scored":
        return []
    with conn.cursor() as cur:
        cur.execute(
            "select ei.*, c.name as contestant_name from episode_insights ei"
            " left join contestants c on c.id = ei.contestant_id"
            " where ei.episode_id = %s order by ei.display_order",
            [str(episode["id"])],
        )
        configured = cur.fetchall()
    if not configured:
        return []

    episode_scores = scoring.episode_points(
        conn, season["id"], episode["episode_number"]
    )
    with conn.cursor() as cur:
        cur.execute(
            "select distinct p.id::text as id from profiles p"
            " join roster_picks rp on rp.user_id = p.id"
            " where not p.is_admin and rp.season_id = %s",
            [str(season["id"])],
        )
        participants = [row["id"] for row in cur.fetchall()]

    insights = []
    for item in configured:
        kind = item["insight_type"]
        if kind == "pick_popularity":
            with conn.cursor() as cur:
                cur.execute(
                    """
                    select count(distinct user_id)::int as total,
                           count(distinct user_id) filter (
                             where contestant_id = %s)::int as picked
                    from elimination_picks where episode_id = %s
                    """,
                    [str(item["contestant_id"]), str(episode["id"])],
                )
                counts = cur.fetchone()
            if counts["total"] == 0:
                continue
            pct = round(counts["picked"] * 100 / counts["total"])
            insights.append(
                {
                    "id": item["id"],
                    "label": f"League call: {item['contestant_name']}",
                    "value": f"{pct}%",
                    "detail": (
                        f"{counts['picked']} of {counts['total']} submitted"
                        " ballots included this castaway."
                    ),
                }
            )
        elif kind == "multiple_correct_ballots":
            with conn.cursor() as cur:
                cur.execute(
                    """
                    with ballot as (
                      select pick.user_id,
                             count(el.contestant_id)::int as correct
                      from elimination_picks pick
                      left join eliminations el
                        on el.episode_id = pick.episode_id
                       and el.contestant_id = pick.contestant_id
                      where pick.episode_id = %s
                      group by pick.user_id
                    )
                    select count(*)::int as total,
                           count(*) filter (where correct >= 2)::int as multiple
                    from ballot
                    """,
                    [str(episode["id"])],
                )
                counts = cur.fetchone()
            if counts["total"] == 0:
                continue
            insights.append(
                {
                    "id": item["id"],
                    "label": "Multiple correct picks",
                    "value": f"{counts['multiple']} of {counts['total']}",
                    "detail": "submitted ballots called at least two eliminations.",
                }
            )
        elif kind == "performance_vs_median":
            if not participants:
                continue
            league_median = median(
                episode_scores.get(player_id, 0) for player_id in participants
            )
            own = episode_scores.get(str(user_id), 0)
            difference = own - league_median
            formatted = f"{difference:+g} pts" if difference else "Even"
            insights.append(
                {
                    "id": item["id"],
                    "label": "Versus league median",
                    "value": formatted,
                    "detail": (
                        f"You scored {own}; the league median was {league_median:g}."
                    ),
                }
            )
        elif kind == "weekly_play_usage":
            if not participants:
                continue
            with conn.cursor() as cur:
                cur.execute(
                    "select count(distinct user_id)::int as used"
                    " from advantage_plays where episode_id = %s"
                    " and advantage_type = %s and user_id::text = any(%s)",
                    [str(episode["id"]), item["advantage_type"], participants],
                )
                used = cur.fetchone()["used"]
            label = PLAY_LABELS[item["advantage_type"]]
            insights.append(
                {
                    "id": item["id"],
                    "label": f"{label} usage",
                    "value": f"{used} of {len(participants)}",
                    "detail": f"league players used {label} this episode.",
                }
            )
    return insights
