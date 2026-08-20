from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Response, status

from app import database, scoring
from app.auth import get_current_user
from app.routers.episode_insights import compute_episode_insights
from app.schemas import (
    EpisodeResult,
    RevealAcknowledgement,
    RevealAcknowledgementRequest,
)

router = APIRouter(tags=["episode results"])


def _require_scored_playable_episode(cur, season: dict, episode_id: UUID) -> dict:
    cur.execute(
        "select * from episodes where id = %s and season_id = %s",
        [str(episode_id), str(season["id"])],
    )
    episode = cur.fetchone()
    if not episode:
        raise HTTPException(status_code=404, detail="Episode not found")
    roster_lock = season["roster_lock_episode"]
    if roster_lock is None or episode["episode_number"] < roster_lock:
        raise HTTPException(status_code=404, detail="Episode has no playable result")
    if episode["status"] != "scored":
        raise HTTPException(status_code=409, detail="Episode has not been scored")
    return episode


def _roster_lane(conn, season_id: UUID, user_id: UUID, episode: dict):
    with conn.cursor() as cur:
        cur.execute(
            """
            select x.contestant_id, x.name, x.image_url,
                   x.raw_points
                     + round(case when x.is_sole_survivor and %s
                                  then x.raw_points * 0.5 else 0 end)::int
                     as points
            from (
              select c.id::text as contestant_id, c.name, c.image_url,
                     rp.is_sole_survivor,
                     coalesce(sum(case when se.id is null then 0 else
                       (case
                          when s.merge_episode is not null
                           and ep.episode_number >= s.merge_episode
                           and et.postmerge_point_value is not null
                          then et.postmerge_point_value else et.point_value
                        end)
                       * (case when et.is_per_unit then se.quantity else 1 end)
                     end), 0)::int as raw_points
              from roster_picks rp
              join contestants c on c.id = rp.contestant_id
              join seasons s on s.id = rp.season_id
              join episodes ep on ep.id = %s
              left join scoring_events se
                on se.episode_id = ep.id and se.contestant_id = rp.contestant_id
              left join season_scoring_event_types et
                on et.season_id = s.id and et.event_type = se.event_type
              where rp.season_id = %s and rp.user_id = %s
                and rp.active_from_episode <= ep.episode_number
                and (rp.active_until_episode is null
                     or rp.active_until_episode >= ep.episode_number)
              group by c.id, c.name, c.image_url, rp.is_sole_survivor
            ) x
            order by x.name
            """,
            [
                episode["is_finale"],
                str(episode["id"]),
                str(season_id),
                str(user_id),
            ],
        )
        roster = cur.fetchall()

        # Per-event breakdown (#473): one row per scoring event, mirroring the
        # aggregate above so the reveal can show how each member's total was
        # earned. Summed per contestant this equals raw_points above; any gap
        # is the finale Sole Survivor bonus, which isn't a scoring_events row,
        # so it's folded in as its own line below rather than recomputed.
        cur.execute(
            """
            select rp.contestant_id::text as contestant_id, se.event_type, et.label,
                   (case when et.is_per_unit then se.quantity else 1 end) as quantity,
                   (case
                      when s.merge_episode is not null
                       and ep.episode_number >= s.merge_episode
                       and et.postmerge_point_value is not null
                      then et.postmerge_point_value else et.point_value
                    end)
                   * (case when et.is_per_unit then se.quantity else 1 end)
                     as points
            from roster_picks rp
            join seasons s on s.id = rp.season_id
            join episodes ep on ep.id = %s
            join scoring_events se
              on se.episode_id = ep.id and se.contestant_id = rp.contestant_id
            join season_scoring_event_types et
              on et.season_id = s.id and et.event_type = se.event_type
            where rp.season_id = %s and rp.user_id = %s
              and rp.active_from_episode <= ep.episode_number
              and (rp.active_until_episode is null
                   or rp.active_until_episode >= ep.episode_number)
            order by et.label
            """,
            [str(episode["id"]), str(season_id), str(user_id)],
        )
        events_by_contestant: dict[str, list[dict]] = {}
        for row in cur.fetchall():
            events_by_contestant.setdefault(row["contestant_id"], []).append(
                {
                    "event_type": row["event_type"],
                    "label": row["label"],
                    "quantity": row["quantity"],
                    "points": row["points"],
                }
            )
        for member in roster:
            events = events_by_contestant.get(member["contestant_id"], [])
            gap = member["points"] - sum(e["points"] for e in events)
            if gap:
                events = events + [
                    {
                        "event_type": "sole_survivor_bonus",
                        "label": "Sole Survivor bonus",
                        "quantity": 1,
                        "points": gap,
                    }
                ]
            member["breakdown"] = events

        cur.execute(
            "select coalesce(sum(swap_penalty_points), 0)::int as points"
            " from roster_picks where season_id = %s and user_id = %s"
            " and active_until_episode = %s",
            [str(season_id), str(user_id), episode["episode_number"] - 1],
        )
        adjustment = cur.fetchone()["points"]
    return roster, adjustment


def _ballot_lane(conn, season_id: UUID, user_id: UUID, episode: dict):
    with conn.cursor() as cur:
        if not episode["is_finale"]:
            cur.execute(
                "select point_value, postmerge_point_value"
                " from season_prediction_score_types"
                " where season_id = %s and key = 'correct_elimination'",
                [str(season_id)],
            )
            cfg = cur.fetchone()
            cur.execute(
                """
                select c.id::text as contestant_id, c.name, c.image_url,
                       (el.contestant_id is not null) as correct
                from elimination_picks pick
                join contestants c on c.id = pick.contestant_id
                left join eliminations el
                  on el.episode_id = pick.episode_id
                 and el.contestant_id = pick.contestant_id
                where pick.user_id = %s and pick.episode_id = %s
                order by pick.created_at, c.name
                """,
                [str(user_id), str(episode["id"])],
            )
            picks = cur.fetchall()
            value = (
                cfg["postmerge_point_value"]
                if cfg["postmerge_point_value"] is not None
                and episode["episode_number"] >= _merge_episode(cur, season_id)
                else cfg["point_value"]
            )
            return [
                {
                    **row,
                    "prediction_type": "elimination",
                    "points": value if row["correct"] else 0,
                }
                for row in picks
            ]

        cur.execute(
            """
            select early_boot_contestant_id, fire_loss_contestant_id,
                   winner_contestant_id
            from finale_predictions where season_id = %s and user_id = %s
            """,
            [str(season_id), str(user_id)],
        )
        prediction = cur.fetchone()
        if not prediction:
            return []
        cur.execute(
            "select key, point_value from season_prediction_score_types"
            " where season_id = %s and key in"
            " ('correct_early_boot', 'correct_fire_loss', 'correct_winner_vote')",
            [str(season_id)],
        )
        values = {row["key"]: row["point_value"] for row in cur.fetchall()}
        cur.execute(
            "select id::text as contestant_id, name, image_url, placement"
            " from contestants where season_id = %s",
            [str(season_id)],
        )
        contestants = {row["contestant_id"]: row for row in cur.fetchall()}
        cur.execute(
            "select contestant_id::text as contestant_id, elimination_type"
            " from eliminations where episode_id = %s",
            [str(episode["id"])],
        )
        eliminations = {
            row["contestant_id"]: row["elimination_type"] for row in cur.fetchall()
        }

    ballot = []
    definitions = (
        ("early_boot", "early_boot_contestant_id", "correct_early_boot"),
        ("fire_loss", "fire_loss_contestant_id", "correct_fire_loss"),
        ("winner", "winner_contestant_id", "correct_winner_vote"),
    )
    for prediction_type, column, score_key in definitions:
        contestant_id = prediction[column]
        if contestant_id is None:
            continue
        contestant = contestants[str(contestant_id)]
        if prediction_type == "early_boot":
            correct = eliminations.get(str(contestant_id)) == "voted_out"
        elif prediction_type == "fire_loss":
            correct = eliminations.get(str(contestant_id)) == "fire_making_loss"
        else:
            correct = contestant["placement"] == 1
        ballot.append(
            {
                "contestant_id": contestant_id,
                "name": contestant["name"],
                "image_url": contestant["image_url"],
                "prediction_type": prediction_type,
                "correct": correct,
                "points": values[score_key] if correct else 0,
            }
        )
    return ballot


def _merge_episode(cur, season_id: UUID) -> int:
    cur.execute("select merge_episode from seasons where id = %s", [str(season_id)])
    return cur.fetchone()["merge_episode"] or 2**31 - 1


def _rank_context(conn, season: dict, user_id: UUID, result_episode: dict):
    with conn.cursor() as cur:
        if season["status"] == "completed":
            cur.execute(
                "select p.id::text as id, p.display_name from profiles p"
                " where not p.is_admin and exists (select 1 from roster_picks rp"
                " where rp.user_id = p.id and rp.season_id = %s)",
                [str(season["id"])],
            )
        else:
            cur.execute(
                "select id::text as id, display_name from profiles where not is_admin"
            )
        profiles = cur.fetchall()
        cur.execute(
            "select max(episode_number) as n from episodes"
            " where season_id = %s and status = 'scored'",
            [str(season["id"])],
        )
        latest_scored = cur.fetchone()["n"]

    roster = scoring.roster_points(conn, season["id"])
    elimination = scoring.elimination_points(conn, season["id"])
    finale = scoring.finale_points(conn, season["id"])
    totals = {
        p["id"]: roster.get(p["id"], 0)
        + elimination.get(p["id"], 0)
        + finale.get(p["id"], 0)
        for p in profiles
    }
    ordered = sorted(profiles, key=lambda p: (-totals[p["id"]], p["display_name"]))
    current_ranks = {p["id"]: i + 1 for i, p in enumerate(ordered)}
    uid = str(user_id)
    current_rank = current_ranks.get(uid)
    if latest_scored != result_episode["episode_number"] or current_rank is None:
        return current_rank, None, None

    delta = scoring.episode_points(conn, season["id"], latest_scored)
    previous = sorted(
        profiles,
        key=lambda p: (
            -(totals[p["id"]] - delta.get(p["id"], 0)),
            p["display_name"],
        ),
    )
    prior_rank = {p["id"]: i + 1 for i, p in enumerate(previous)}[uid]
    return current_rank, prior_rank, prior_rank - current_rank


def _build_result(conn, season: dict, episode: dict, user_id: UUID) -> dict:
    with conn.cursor() as cur:
        cur.execute(
            """
            select c.id::text as contestant_id, c.name, c.image_url,
                   el.elimination_type
            from eliminations el
            join contestants c on c.id = el.contestant_id
            where el.episode_id = %s
            order by el.created_at, c.name
            """,
            [str(episode["id"])],
        )
        eliminated = cur.fetchall()
        cur.execute(
            """
            select ap.id::text as advantage_play_id, ap.advantage_type,
                   ap.target_contestant_id::text as target_contestant_id,
                   c.name as target_name
            from advantage_plays ap
            left join contestants c on c.id = ap.target_contestant_id
            where ap.user_id = %s and ap.season_id = %s and ap.episode_id = %s
            order by ap.created_at
            """,
            [str(user_id), str(season["id"]), str(episode["id"])],
        )
        plays = cur.fetchall()

    roster, roster_adjustment = _roster_lane(conn, season["id"], user_id, episode)
    ballot = _ballot_lane(conn, season["id"], user_id, episode)
    roster_points = sum(row["points"] for row in roster)
    ballot_points = sum(row["points"] for row in ballot)
    total_points = scoring.episode_points(
        conn, season["id"], episode["episode_number"]
    ).get(str(user_id), 0)
    weekly_bonus = total_points - roster_points - roster_adjustment - ballot_points

    by_play = scoring.advantage_bonus_by_play(conn, season["id"], user_id)
    for play in plays:
        play["bonus_points"] = by_play.get(play["advantage_play_id"], 0)
    if plays:
        residual = weekly_bonus - sum(p["bonus_points"] for p in plays)
        plays[0]["bonus_points"] += residual

    current_rank, prior_rank, rank_delta = _rank_context(conn, season, user_id, episode)
    insights = compute_episode_insights(conn, season, episode, user_id)
    return {
        "episode_id": episode["id"],
        "episode_number": episode["episode_number"],
        "is_finale": episode["is_finale"],
        "eliminated": eliminated,
        "ballot": ballot,
        "roster": roster,
        "roster_points": roster_points,
        "roster_adjustment_points": roster_adjustment,
        "ballot_points": ballot_points,
        "weekly_plays": plays,
        "weekly_play_bonus": weekly_bonus,
        "total_points": total_points,
        "current_rank": current_rank,
        "prior_rank": prior_rank,
        "rank_delta": rank_delta,
        "insights": insights,
    }


@router.get(
    "/seasons/{season_id}/reveal",
    response_model=EpisodeResult,
    responses={204: {"description": "No unseen result"}},
)
def get_latest_unseen_result(
    season_id: UUID, current_user: UUID = Depends(get_current_user)
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            if season["roster_lock_episode"] is None:
                return Response(status_code=status.HTTP_204_NO_CONTENT)
            # The migration pre-acknowledges participants in completed seasons
            # that existed at rollout. A non-participant (including somebody
            # who joined later) must not be offered one of those old reveals.
            if season["status"] == "completed":
                cur.execute(
                    "select 1 from roster_picks where season_id = %s and user_id = %s",
                    [str(season_id), str(current_user)],
                )
                if cur.fetchone() is None:
                    return Response(status_code=status.HTTP_204_NO_CONTENT)
            cur.execute(
                """
                select ep.* from episodes ep
                left join reveal_acknowledgements ra
                  on ra.user_id = %s and ra.season_id = ep.season_id
                left join episodes seen on seen.id = ra.episode_id
                where ep.season_id = %s and ep.status = 'scored'
                  and ep.episode_number >= %s
                  and (seen.id is null or ep.episode_number > seen.episode_number)
                order by ep.episode_number desc limit 1
                """,
                [str(current_user), str(season_id), season["roster_lock_episode"]],
            )
            episode = cur.fetchone()
        if not episode:
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        return _build_result(conn, season, episode, current_user)


@router.get(
    "/seasons/{season_id}/episode-results/{episode_id}",
    response_model=EpisodeResult,
)
def get_episode_result(
    season_id: UUID,
    episode_id: UUID,
    current_user: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            episode = _require_scored_playable_episode(cur, season, episode_id)
        return _build_result(conn, season, episode, current_user)


@router.post(
    "/seasons/{season_id}/reveal-acknowledgement",
    response_model=RevealAcknowledgement,
)
def acknowledge_reveal(
    season_id: UUID,
    body: RevealAcknowledgementRequest,
    current_user: UUID = Depends(get_current_user),
):
    with database.get_db() as conn:
        with conn.cursor() as cur:
            season = database.require_season(cur, season_id)
            episode = _require_scored_playable_episode(cur, season, body.episode_id)
            database.lock_user_season(cur, current_user, season_id)
            cur.execute(
                """
                select ra.*, ep.episode_number
                from reveal_acknowledgements ra
                join episodes ep on ep.id = ra.episode_id
                where ra.user_id = %s and ra.season_id = %s
                """,
                [str(current_user), str(season_id)],
            )
            existing = cur.fetchone()
            if not existing or episode["episode_number"] > existing["episode_number"]:
                cur.execute(
                    """
                    insert into reveal_acknowledgements
                        (user_id, season_id, episode_id)
                    values (%s, %s, %s)
                    on conflict (user_id, season_id) do update
                    set episode_id = excluded.episode_id, acknowledged_at = now()
                    returning season_id, episode_id, acknowledged_at
                    """,
                    [str(current_user), str(season_id), str(body.episode_id)],
                )
                return cur.fetchone()
            return {
                "season_id": existing["season_id"],
                "episode_id": existing["episode_id"],
                "acknowledged_at": existing["acknowledged_at"],
            }
