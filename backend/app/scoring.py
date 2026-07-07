"""Live score computation.

Scores are always computed from raw facts (scoring_events, picks, eliminations)
— never cached. Each function takes a psycopg2 connection and a season id and
returns a {user_id: points} dict keyed by stringified UUID.

Pre/post-merge: an episode is post-merge when its episode_number >= the season's
merge_episode (decision #10). When merge_episode is NULL, everything is pre-merge.
A scoring/prediction value uses postmerge_point_value when it is set and the
episode is post-merge, otherwise point_value.

Double Roster Points / Double Vote Points (decision #12, 2026-07-06): a player
spends tokens to double one contestant's roster-event or elimination-pick
points for one episode. The play names the target contestant and episode
directly (app/routers/advantage_plays.py), so roster_points/elimination_points
just check for a matching advantage_plays row rather than reading a stored
flag — this survives elimination_picks being deleted and reinserted on every
resubmission (decision #38).
"""

from uuid import UUID


def roster_points(conn, season_id: UUID) -> dict[str, int]:
    """Points each user earns from contestants on their roster.

    A scoring_event scores for every user who had that contestant rostered in
    the event's episode (effective-episode ranges), plus each user's swap
    penalties. Per-unit events multiply by quantity, then double if the user
    played Double Roster Points on that contestant for that episode.
    """
    points: dict[str, int] = {}
    with conn.cursor() as cur:
        cur.execute(
            """
            select rp.user_id::text as user_id,
                   sum(
                     (case
                        when s.merge_episode is not null
                         and ep.episode_number >= s.merge_episode
                         and et.postmerge_point_value is not null
                        then et.postmerge_point_value
                        else et.point_value
                      end)
                     * (case when et.is_per_unit then se.quantity else 1 end)
                     * (case when dbl.id is not null then 2 else 1 end)
                   ) as points
            from scoring_events se
            join episodes ep on se.episode_id = ep.id
            join seasons s on ep.season_id = s.id
            join scoring_event_types et on se.event_type = et.event_type
            join roster_picks rp
              on rp.contestant_id = se.contestant_id
             and rp.season_id = s.id
             and rp.active_from_episode <= ep.episode_number
             and (rp.active_until_episode is null
                  or rp.active_until_episode >= ep.episode_number)
            left join advantage_plays dbl
              on dbl.advantage_type = 'double_roster_points'
             and dbl.user_id = rp.user_id
             and dbl.episode_id = se.episode_id
             and dbl.target_contestant_id = se.contestant_id
            where s.id = %s
            group by rp.user_id
            """,
            [str(season_id)],
        )
        for row in cur.fetchall():
            points[row["user_id"]] = row["points"]

        cur.execute(
            """
            select user_id::text as user_id, sum(swap_penalty_points) as penalty
            from roster_picks
            where season_id = %s
            group by user_id
            """,
            [str(season_id)],
        )
        for row in cur.fetchall():
            points[row["user_id"]] = points.get(row["user_id"], 0) + row["penalty"]

    return points


def elimination_points(conn, season_id: UUID) -> dict[str, int]:
    """Points each user earns from correct weekly elimination predictions.

    A pick scores when the predicted contestant appears in that episode's
    eliminations; pre/post-merge rate comes from prediction_score_types, then
    doubles if the user played Double Vote Points on that pick's contestant
    for that episode. Finale episodes are excluded — there picks are scored
    as a winner vote instead (#19).
    """
    with conn.cursor() as cur:
        cur.execute(
            "select point_value, postmerge_point_value"
            " from prediction_score_types where key = 'correct_elimination'"
        )
        cfg = cur.fetchone()
        pre, post = cfg["point_value"], cfg["postmerge_point_value"]

        cur.execute(
            """
            select pick.user_id::text as user_id,
                   sum(
                     (case
                        when s.merge_episode is not null
                         and ep.episode_number >= s.merge_episode
                        then %s else %s
                      end)
                     * (case when dbl.id is not null then 2 else 1 end)
                   ) as points
            from elimination_picks pick
            join episodes ep on pick.episode_id = ep.id
            join seasons s on ep.season_id = s.id
            join eliminations el
              on el.episode_id = ep.id and el.contestant_id = pick.contestant_id
            left join advantage_plays dbl
              on dbl.advantage_type = 'double_vote_points'
             and dbl.user_id = pick.user_id
             and dbl.episode_id = pick.episode_id
             and dbl.target_contestant_id = pick.contestant_id
            where s.id = %s and ep.is_finale = false
            group by pick.user_id
            """,
            [post, pre, str(season_id)],
        )
        return {row["user_id"]: row["points"] for row in cur.fetchall()}


def winner_points(conn, season_id: UUID) -> dict[str, int]:
    """Points from each user's locked winner pick vs final placement.

    Winner pick placing 1st/2nd/3rd -> +100/+60/+25 (decision #12, 2026-07-06:
    no backup pick). The +30 finale 'correct winner vote' is scored separately
    in finale_points().
    """
    with conn.cursor() as cur:
        cur.execute("""
            select key, point_value from prediction_score_types
            where key in ('winner_sole_survivor', 'winner_runner_up',
                          'winner_2nd_runner_up')
            """)
        v = {row["key"]: row["point_value"] for row in cur.fetchall()}

        cur.execute(
            """
            select wp.user_id::text as user_id, wc.placement as winner_placement
            from winner_picks wp
            join contestants wc on wc.id = wp.winner_contestant_id
            where wp.season_id = %s
            """,
            [str(season_id)],
        )

        winner_value = {
            1: v["winner_sole_survivor"],
            2: v["winner_runner_up"],
            3: v["winner_2nd_runner_up"],
        }
        points: dict[str, int] = {}
        for row in cur.fetchall():
            total = winner_value.get(row["winner_placement"], 0)
            if total:
                points[row["user_id"]] = total
        return points


def finale_points(conn, season_id: UUID) -> dict[str, int]:
    """Points from each user's three-part finale ballot.

    early_boot correct (finale voted_out) -> +18; fire_loss correct (finale
    fire_making_loss) -> +18; winner correct (placement 1) -> +30. Stacks with
    winner_points (the season-long locked winner_pick).
    """
    with conn.cursor() as cur:
        cur.execute("""
            select key, point_value from prediction_score_types
            where key in ('correct_early_boot', 'correct_fire_loss',
                          'correct_winner_vote')
            """)
        v = {row["key"]: row["point_value"] for row in cur.fetchall()}

        cur.execute(
            """
            select fp.user_id::text as user_id,
                   (case when eb.contestant_id is not null then %(boot)s else 0 end
                    + case when fl.contestant_id is not null then %(fire)s else 0 end
                    + case when wc.placement = 1 then %(win)s else 0 end) as points
            from finale_predictions fp
            left join episodes fin
              on fin.season_id = fp.season_id and fin.is_finale = true
            left join eliminations eb
              on eb.episode_id = fin.id
             and eb.contestant_id = fp.early_boot_contestant_id
             and eb.elimination_type = 'voted_out'
            left join eliminations fl
              on fl.episode_id = fin.id
             and fl.contestant_id = fp.fire_loss_contestant_id
             and fl.elimination_type = 'fire_making_loss'
            left join contestants wc on wc.id = fp.winner_contestant_id
            where fp.season_id = %(season)s
            """,
            {
                "boot": v["correct_early_boot"],
                "fire": v["correct_fire_loss"],
                "win": v["correct_winner_vote"],
                "season": str(season_id),
            },
        )
        return {
            row["user_id"]: row["points"] for row in cur.fetchall() if row["points"]
        }
