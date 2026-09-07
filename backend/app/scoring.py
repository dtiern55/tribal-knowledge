"""Live score computation.

Scores are always computed from raw facts (scoring_events, picks, eliminations)
— never cached. Each function takes a psycopg2 connection and a league-season
id (#595: one league playing one season) and returns a {user_id: points} dict
keyed by stringified UUID. Point values come from the shared season snapshot;
play rows (rosters, picks, plays, brackets) are the league-season's own.

Pre/post-merge: an episode is post-merge when its episode_number >= the season's
merge_episode (decision #10). When merge_episode is NULL, everything is pre-merge.
A scoring/prediction value uses postmerge_point_value when it is set and the
episode is post-merge, otherwise point_value.

Double Castaway Points / Power Vote (decision #12, 2026-07-06; ×2 redesigned
#673): a player spends a weekly play to double points. Double Roster names one
rostered contestant. Power Vote (advantage_type double_vote_points) names
one extra pick added to that episode's ballot and doubles only it. Both are
read from advantage_plays at scoring time rather than a stored flag — this
survives elimination_picks being deleted and reinserted on every resubmission
(decision #38).

Double Vote plays from before #303 doubled the whole ballot instead and
stored no target; the joins branch on `target_contestant_id is null` so those
seasons keep scoring exactly as they did — completed seasons are time capsules
(#170). Every play made after #673 always carries a target.
"""

from typing import Optional
from uuid import UUID

from app.locking import EPISODE_LOCKED_SQL, episode_locked_sql

# The point value a scoring event carries in its episode (pre/post-merge,
# per-unit). Needs `s` (seasons), `ep` (episodes), `et` (snapshot), `se`.
EVENT_POINTS_SQL = """
    (case
       when s.merge_episode is not null
        and ep.episode_number >= s.merge_episode
        and et.postmerge_point_value is not null
       then et.postmerge_point_value
       else et.point_value
     end)
    * (case when et.is_per_unit then se.quantity else 1 end)
"""

# A roster pick rostered in the event's episode — the effective-episode range.
ROSTER_ACTIVE_SQL = """
    rp.active_from_episode <= ep.episode_number
    and (rp.active_until_episode is null
         or rp.active_until_episode >= ep.episode_number)
"""

# A played Double Castaway Points that doubles this roster scoring event.
# Needs `rp` (roster_picks) and `se` (scoring_events); binds no params, aliases
# the play as `dbl` — pair with `(case when dbl.id is not null then 2 else 1 end)`.
DOUBLE_ROSTER_JOIN_SQL = """
    left join advantage_plays dbl
      on dbl.advantage_type = 'double_roster_points'
     and dbl.user_id = rp.user_id
     and dbl.league_season_id = rp.league_season_id
     and dbl.episode_id = se.episode_id
     and dbl.target_contestant_id = se.contestant_id
"""

# A played Power Vote (advantage_type double_vote_points) that doubles this
# elimination pick. Needs `pick` (elimination_picks); aliases the play as
# `dbl`, same doubling pattern as DOUBLE_ROSTER_JOIN_SQL. Every play made
# after #673 names a target and only doubles that pick; #303-era plays
# doubled the whole ballot instead (target_contestant_id is null).
DOUBLE_VOTE_JOIN_SQL = """
    left join advantage_plays dbl
      on dbl.advantage_type = 'double_vote_points'
     and dbl.user_id = pick.user_id
     and dbl.league_season_id = pick.league_season_id
     and dbl.episode_id = pick.episode_id
     and (dbl.target_contestant_id is null
          or dbl.target_contestant_id = pick.contestant_id)
"""


def _merge_value_sql(alias: str) -> str:
    """The pre- or post-merge value of one prediction snapshot row, by the
    episode's number against the season's merge. Needs `s` and `ep`."""
    return f"""(case
       when s.merge_episode is not null
        and ep.episode_number >= s.merge_episode
       then coalesce({alias}.postmerge_point_value, {alias}.point_value)
       else {alias}.point_value
     end)"""


# What one correct elimination pick is worth (#694): the rung it sits on for
# a season with ladder values, else the season's flat `correct_elimination`.
# An unranked pick in a ladder season (saved before the ladder, or a #303-era
# ballot) pays the flat value too. Needs `pick`, `ep`, `s`; joins three rows
# of the season's prediction snapshot as `rung`, `flat`, `pv`.
PICK_VALUE_JOIN_SQL = """
    left join season_prediction_score_types rung
      on rung.season_id = s.id
     and pick.rank is not null
     and rung.key = 'correct_elimination_' || pick.rank
    left join season_prediction_score_types flat
      on flat.season_id = s.id and flat.key = 'correct_elimination'
    left join season_prediction_score_types pv
      on pv.season_id = s.id and pv.key = 'power_vote'
"""
PICK_BASE_SQL = f"coalesce({_merge_value_sql('rung')}, {_merge_value_sql('flat')})"
# With the Power Vote on it (`dbl`, see DOUBLE_VOTE_JOIN_SQL) a pick pays the
# season's Power Vote value; a season without one, or a #303-era whole-ballot
# play, doubles the base instead.
PICK_TOTAL_SQL = f"""(case
       when dbl.id is null then {PICK_BASE_SQL}
       when dbl.target_contestant_id is not null and pv.key is not null
       then {_merge_value_sql('pv')}
       else 2 * {PICK_BASE_SQL}
     end)"""


def _season_id(cur, league_season_id: UUID) -> str:
    cur.execute(
        "select season_id from league_seasons where id = %s", [str(league_season_id)]
    )
    return str(cur.fetchone()["season_id"])


def roster_points(conn, league_season_id: UUID) -> dict[str, int]:
    """Points each user earns from contestants on their roster.

    A scoring_event scores for every user who had that contestant rostered in
    the event's episode (effective-episode ranges), plus each user's swap
    penalties. Per-unit events multiply by quantity, then double if the user
    played Double Castaway Points on that contestant for that episode.
    """
    points: dict[str, int] = {}
    with conn.cursor() as cur:
        cur.execute(
            f"""
            select user_id,
                   -- Sole Survivor adds half the designee's FINALE total,
                   -- once, rounded once. Multiplying each event row by 1.5
                   -- would round per row and stop reconciling.
                   sum(pts)
                     + round(sum(case when ss then pts else 0 end) * 0.5)::int
                     as points
            from (
              select rp.user_id::text as user_id,
                     (ep.is_finale and rp.is_sole_survivor) as ss,
                     {EVENT_POINTS_SQL}
                     * (case when dbl.id is not null then 2 else 1 end)
                     as pts
            from scoring_events se
            join episodes ep on se.episode_id = ep.id
            join seasons s on ep.season_id = s.id
            join league_seasons ls on ls.season_id = s.id
            join season_scoring_event_types et
              on se.event_type = et.event_type and et.season_id = s.id
            join roster_picks rp
              on rp.contestant_id = se.contestant_id
             and rp.league_season_id = ls.id
             and {ROSTER_ACTIVE_SQL}
            {DOUBLE_ROSTER_JOIN_SQL}
            -- An episode's results stay hidden until it locks: applying
            -- scoring_events before picks_lock_at must not leak the boot or
            -- point changes to players who can still change their picks (#559).
            where ls.id = %s and {episode_locked_sql("ep")}
            ) x
            group by user_id
            """,
            [str(league_season_id)],
        )
        for row in cur.fetchall():
            points[row["user_id"]] = row["points"]

        # A swap's penalty books only once its episode locks — until then the
        # swap is undoable (#403), so counting the cost early would both mis-state
        # the total and leak the swap to other players via standings (#164
        # follow-up). The swap happened at active_until_episode + 1.
        cur.execute(
            f"""
            select rp.user_id::text as user_id,
                   sum(
                     case when {EPISODE_LOCKED_SQL}
                          then rp.swap_penalty_points else 0 end
                   ) as penalty
            from roster_picks rp
            join league_seasons ls on ls.id = rp.league_season_id
            left join episodes pe
              on pe.season_id = ls.season_id
             and pe.episode_number = rp.active_until_episode + 1
            where rp.league_season_id = %s
            group by rp.user_id
            """,
            [str(league_season_id)],
        )
        for row in cur.fetchall():
            points[row["user_id"]] = points.get(row["user_id"], 0) + row["penalty"]

    return points


def elimination_points(conn, league_season_id: UUID) -> dict[str, int]:
    """Points each user earns from correct weekly elimination predictions.

    A pick scores when the predicted contestant appears in that episode's
    eliminations, at its rung's value (#694) or the flat pre/post-merge rate,
    and pays the Power Vote value instead if the user played it on that pick
    (#673; #303-era plays with no target double every pick). Finale episodes
    are excluded — there picks are scored as a winner vote instead (#19).
    """
    with conn.cursor() as cur:
        cur.execute(
            f"""
            select pick.user_id::text as user_id,
                   sum({PICK_TOTAL_SQL}) as points
            from elimination_picks pick
            join episodes ep on pick.episode_id = ep.id
            join seasons s on ep.season_id = s.id
            join eliminations el
              on el.episode_id = ep.id and el.contestant_id = pick.contestant_id
            {DOUBLE_VOTE_JOIN_SQL}
            {PICK_VALUE_JOIN_SQL}
            -- Hidden until the episode locks, same as roster_points (#559).
            where pick.league_season_id = %s and ep.is_finale = false
              and {episode_locked_sql("ep")}
            group by pick.user_id
            """,
            [str(league_season_id)],
        )
        return {row["user_id"]: row["points"] for row in cur.fetchall()}


def finale_actuals(cur, season_id: UUID):
    """The recorded finale outcome the bracket ballot resolves against (#534).

    Show data, so it takes the season. Returns (final_three, final_four,
    winner_id): the Final 3 are placements 1-3, the Final 4 is the Final 3 plus
    whoever lost fire-making, and the winner is placement 1. All are None/empty
    until the finale is scored, so finale points stay 0 until then.
    """
    cur.execute(
        "select id::text as id, placement from contestants"
        " where season_id = %s and placement in (1, 2, 3)",
        [str(season_id)],
    )
    rows = cur.fetchall()
    final_three = {r["id"] for r in rows}
    winner = next((r["id"] for r in rows if r["placement"] == 1), None)

    cur.execute(
        "select id from episodes where season_id = %s and is_finale = true",
        [str(season_id)],
    )
    fin = cur.fetchone()
    fire_loss = None
    if fin:
        cur.execute(
            "select contestant_id::text as id from eliminations"
            " where episode_id = %s and elimination_type = 'fire_making_loss'",
            [str(fin["id"])],
        )
        row = cur.fetchone()
        fire_loss = row["id"] if row else None

    final_four = set(final_three)
    if fire_loss:
        final_four.add(fire_loss)
    return final_three, final_four, winner


def finale_points(conn, league_season_id: UUID) -> dict[str, int]:
    """Points from each user's finale bracket ballot (#534).

    Survivor-centric: your Final 4 (partial credit per correct name), your
    Final 3 (partial credit, plus a bonus for nailing all three), and the
    winner. Values come from the season's scoring snapshot — the live template
    is 6 / 8 / 12 bonus / 40 winner.
    """
    with conn.cursor() as cur:
        season_id = _season_id(cur, league_season_id)
        cur.execute(
            """
            select key, point_value from season_prediction_score_types
            where season_id = %s
              and key in ('correct_final_four', 'correct_final_three',
                          'perfect_final_three', 'correct_winner_vote')
            """,
            [season_id],
        )
        v = {row["key"]: row["point_value"] for row in cur.fetchall()}
        if not v:
            return {}
        final_three, final_four, winner = finale_actuals(cur, season_id)

        cur.execute(
            """
            select user_id::text as user_id,
                   final_four_contestant_ids::text[] as final_four,
                   final_three_contestant_ids::text[] as final_three,
                   winner_contestant_id::text as winner
            from finale_predictions where league_season_id = %s
            """,
            [str(league_season_id)],
        )
        points: dict[str, int] = {}
        for row in cur.fetchall():
            f4 = {str(c) for c in (row["final_four"] or [])}
            f3 = {str(c) for c in (row["final_three"] or [])}
            pts = v.get("correct_final_four", 0) * len(f4 & final_four)
            pts += v.get("correct_final_three", 0) * len(f3 & final_three)
            # Bonus only for an exact Final 3 — all three, no extras.
            if len(f3) == 3 and f3 == final_three:
                pts += v.get("perfect_final_three", 0)
            if winner and row["winner"] == winner:
                pts += v.get("correct_winner_vote", 0)
            if pts:
                points[row["user_id"]] = pts
        return points


def roster_points_by_contestant(
    conn, league_season_id: UUID, user_id: UUID
) -> dict[str, int]:
    """One user's roster points broken down per contestant (My Season, #52).

    Same rules as roster_points() but grouped by contestant and scoped to one
    user: scoring-event points during each contestant's active range — doubled
    by a played Double Castaway Points (#257) and by the Sole Survivor finale
    double — plus that contestant's historical swap penalty and placement.
    Folds the Double Roster doubling in now (#257 reverses #136), so summing
    these always equals the user's roster_points total.
    """
    points: dict[str, int] = {}
    with conn.cursor() as cur:
        cur.execute(
            f"""
            select contestant_id,
                   sum(pts)
                     + round(sum(case when ss then pts else 0 end) * 0.5)::int
                     as points
            from (
              select se.contestant_id::text as contestant_id,
                     (ep.is_finale and rp.is_sole_survivor) as ss,
                     {EVENT_POINTS_SQL}
                     * (case when dbl.id is not null then 2 else 1 end)
                     as pts
            from scoring_events se
            join episodes ep on se.episode_id = ep.id
            join seasons s on ep.season_id = s.id
            join season_scoring_event_types et
              on se.event_type = et.event_type and et.season_id = s.id
            join roster_picks rp
              on rp.contestant_id = se.contestant_id
             and rp.league_season_id = %s
             and {ROSTER_ACTIVE_SQL}
            {DOUBLE_ROSTER_JOIN_SQL}
            -- Hidden until the episode locks (#559): this breakdown is visible
            -- to other players once rosters lock, so it must gate too.
            where rp.user_id = %s and {episode_locked_sql("ep")}
            ) x
            group by contestant_id
            """,
            [str(league_season_id), str(user_id)],
        )
        for row in cur.fetchall():
            points[row["contestant_id"]] = row["points"]

        # Same book-at-lock rule as roster_points(): a pending swap's penalty
        # stays off the breakdown until its episode locks (#164 follow-up).
        cur.execute(
            f"""
            select rp.contestant_id::text as contestant_id,
                   sum(
                     case when {EPISODE_LOCKED_SQL}
                          then rp.swap_penalty_points else 0 end
                   ) as penalty
            from roster_picks rp
            join league_seasons ls on ls.id = rp.league_season_id
            left join episodes pe
              on pe.season_id = ls.season_id
             and pe.episode_number = rp.active_until_episode + 1
            where rp.league_season_id = %s and rp.user_id = %s
            group by rp.contestant_id
            """,
            [str(league_season_id), str(user_id)],
        )
        for row in cur.fetchall():
            cid = row["contestant_id"]
            points[cid] = points.get(cid, 0) + row["penalty"]

    return points


def sole_survivor_bonus(
    conn, league_season_id: UUID, user_id: UUID
) -> tuple[Optional[str], int]:
    """The +50% Sole Survivor finale bonus for one user: (contestant_id, points).

    Mirrors the `ss` term folded into roster_points_by_contestant (#52) — half
    of the designated finalist's finale scoring, rounded once — but pulled out
    on its own so a player page can name where those points came from instead of
    burying them in the finalist's total. (None, 0) when no bonus applies yet.
    """
    with conn.cursor() as cur:
        cur.execute(
            f"""
            select se.contestant_id::text as contestant_id,
                   round(sum(
                     {EVENT_POINTS_SQL}
                     * (case when dbl.id is not null then 2 else 1 end)
                   ) * 0.5)::int as bonus
            from scoring_events se
            join episodes ep on se.episode_id = ep.id and ep.is_finale
            join seasons s on ep.season_id = s.id
            join season_scoring_event_types et
              on se.event_type = et.event_type and et.season_id = s.id
            join roster_picks rp
              on rp.contestant_id = se.contestant_id
             and rp.league_season_id = %s
             and rp.is_sole_survivor
             and {ROSTER_ACTIVE_SQL}
            {DOUBLE_ROSTER_JOIN_SQL}
            where rp.user_id = %s and {episode_locked_sql("ep")}
            group by se.contestant_id
            """,
            [str(league_season_id), str(user_id)],
        )
        row = cur.fetchone()
        if not row or not row["bonus"]:
            return None, 0
        return row["contestant_id"], row["bonus"]


def advantage_bonus_by_play(
    conn, league_season_id: UUID, user_id: UUID
) -> dict[str, int]:
    """Bonus points each played double actually earned (issue #85).

    A double adds one extra copy of the doubled points for that episode, so
    the bonus equals the un-doubled base: roster-event points for
    double_roster_points, and for double_vote_points (Power Vote, #673)
    the named pick's points (every correct pick, for #303-era plays with no
    target). extra_vote isn't included — there's no single pick to attribute
    (#304).
    Keyed by stringified advantage_plays.id.

    Mirrors the roster/pick joins of roster_points()/elimination_points():
    a double only pays if the user actually rostered/picked the target, and
    this report must never claim points the score didn't award (#115).
    """
    bonus: dict[str, int] = {}
    with conn.cursor() as cur:
        cur.execute(
            f"""
            select ap.id::text as play_id, coalesce(sum({EVENT_POINTS_SQL}), 0) as bonus
            from advantage_plays ap
            join episodes ep on ep.id = ap.episode_id
            join seasons s on s.id = ep.season_id
            join scoring_events se
              on se.episode_id = ap.episode_id
             and se.contestant_id = ap.target_contestant_id
            join season_scoring_event_types et
              on et.event_type = se.event_type and et.season_id = s.id
            join roster_picks rp
              on rp.contestant_id = ap.target_contestant_id
             and rp.league_season_id = ap.league_season_id
             and rp.user_id = ap.user_id
             and {ROSTER_ACTIVE_SQL}
            where ap.league_season_id = %s and ap.user_id = %s
              and ap.advantage_type = 'double_roster_points'
              and ap.episode_id is not null
              and {episode_locked_sql("ep")}
            group by ap.id
            """,
            [str(league_season_id), str(user_id)],
        )
        for row in cur.fetchall():
            bonus[row["play_id"]] = row["bonus"]

        # The play's bonus is what it added on top of the pick's own value:
        # the Power Vote value less the rung (#694), or a second copy of the
        # base for seasons that double (#303/#673).
        cur.execute(
            f"""
            select dbl.id::text as play_id, coalesce(sum(
                (case when el.contestant_id is null then 0
                 else {PICK_TOTAL_SQL} - {PICK_BASE_SQL} end)
            ), 0) as bonus
            from advantage_plays dbl
            join episodes ep on ep.id = dbl.episode_id
            join seasons s on s.id = ep.season_id
            left join elimination_picks pick
              on pick.user_id = dbl.user_id
             and pick.league_season_id = dbl.league_season_id
             and pick.episode_id = dbl.episode_id
             and (dbl.target_contestant_id is null
                  or pick.contestant_id = dbl.target_contestant_id)
            left join eliminations el
              on el.episode_id = dbl.episode_id
             and el.contestant_id = pick.contestant_id
            {PICK_VALUE_JOIN_SQL}
            where dbl.league_season_id = %s and dbl.user_id = %s
              and dbl.advantage_type = 'double_vote_points'
              and dbl.episode_id is not null
              and {episode_locked_sql("ep")}
            group by dbl.id
            """,
            [str(league_season_id), str(user_id)],
        )
        for row in cur.fetchall():
            bonus[row["play_id"]] = row["bonus"]

    return bonus


def elimination_pick_results(conn, league_season_id: UUID, user_id: UUID) -> list[dict]:
    """One user's weekly elimination picks with hit/miss and points (#52/#53).

    Every non-finale pick, correct or not: correct when the picked contestant
    was eliminated that episode, points at its rung's value (#694) or the
    flat pre/post-merge rate. BASE values only (#136): what the Power Vote
    added is its own line via advantage_bonus_by_play, so the displayed pick
    never silently inflates. Standings totals (elimination_points) include
    it. Finale picks are excluded — there they score as a winner vote.
    """
    with conn.cursor() as cur:
        cur.execute(
            f"""
            select pick.episode_id::text as episode_id,
                   pick.contestant_id::text as contestant_id,
                   pick.rank,
                   (el.contestant_id is not null) as correct,
                   (case when el.contestant_id is null then 0
                    else {PICK_BASE_SQL} end) as points
            from elimination_picks pick
            join episodes ep on pick.episode_id = ep.id
            join seasons s on ep.season_id = s.id
            -- Show the pending pick, but keep its result (correct/points)
            -- hidden until the episode locks (#559): matching an elimination
            -- applied before picks_lock_at would leak the boot to the owner,
            -- who can still change the pick.
            left join eliminations el
              on el.episode_id = ep.id and el.contestant_id = pick.contestant_id
             and {episode_locked_sql("ep")}
            {PICK_VALUE_JOIN_SQL}
            where pick.league_season_id = %s and pick.user_id = %s
              and ep.is_finale = false
            order by ep.episode_number, pick.rank nulls first, pick.created_at
            """,
            [str(league_season_id), str(user_id)],
        )
        return cur.fetchall()


def episode_points(conn, league_season_id: UUID, episode_number: int) -> dict[str, int]:
    """Points each user gained from one episode — the change in their total.

    Used for the Standings trend arrow: rank as of the prior episode = current
    total minus this. Every point in the standings traces to exactly one
    episode, so summing this over all episodes reconciles with the three
    standings components (see the invariant test). Components: roster scoring
    events (doubled where Double Castaway Points was played, plus 50% of a Sole
    Survivor designee's finale total) + swap penalties charged that episode +
    correct elimination picks (doubled); at the finale, also finale-ballot
    points, which resolve then.
    """
    points: dict[str, int] = {}

    def add(uid: str, val: int) -> None:
        points[uid] = points.get(uid, 0) + val

    with conn.cursor() as cur:
        cur.execute(
            f"""
            select user_id,
                   sum(pts)
                     + round(sum(case when ss then pts else 0 end) * 0.5)::int
                     as pts
            from (
              select rp.user_id::text as user_id,
                     (ep.is_finale and rp.is_sole_survivor) as ss,
                     {EVENT_POINTS_SQL}
                     * (case when dbl.id is not null then 2 else 1 end)
                     as pts
            from scoring_events se
            join episodes ep on ep.id = se.episode_id
            join seasons s on s.id = ep.season_id
            join season_scoring_event_types et
              on et.event_type = se.event_type and et.season_id = s.id
            join roster_picks rp
              on rp.contestant_id = se.contestant_id
             and rp.league_season_id = %s
             and {ROSTER_ACTIVE_SQL}
            {DOUBLE_ROSTER_JOIN_SQL}
            -- Consistent with roster_points: an episode's points don't count
            -- until it locks, so this delta reconciles with the total (#559).
            where ep.episode_number = %s and {episode_locked_sql("ep")}
            ) x
            group by user_id
            """,
            [str(league_season_id), episode_number],
        )
        for row in cur.fetchall():
            add(row["user_id"], row["pts"])

        # A swap charged at this episode closed the old pick at episode_number-1.
        cur.execute(
            "select user_id::text as user_id, sum(swap_penalty_points) as pen"
            " from roster_picks"
            " where league_season_id = %s and active_until_episode = %s"
            " group by user_id",
            [str(league_season_id), episode_number - 1],
        )
        for row in cur.fetchall():
            add(row["user_id"], row["pen"])

        cur.execute(
            f"""
            select pick.user_id::text as user_id, sum({PICK_TOTAL_SQL}) as pts
            from elimination_picks pick
            join episodes ep on ep.id = pick.episode_id
            join seasons s on s.id = ep.season_id
            join eliminations el
              on el.episode_id = ep.id and el.contestant_id = pick.contestant_id
            {DOUBLE_VOTE_JOIN_SQL}
            {PICK_VALUE_JOIN_SQL}
            where pick.league_season_id = %s and ep.episode_number = %s
              and ep.is_finale = false
              and {episode_locked_sql("ep")}
            group by pick.user_id
            """,
            [str(league_season_id), episode_number],
        )
        for row in cur.fetchall():
            add(row["user_id"], row["pts"])

        cur.execute(
            "select 1 from episodes ep"
            " join league_seasons ls on ls.season_id = ep.season_id"
            " where ls.id = %s and ep.episode_number = %s and ep.is_finale",
            [str(league_season_id), episode_number],
        )
        is_finale = cur.fetchone() is not None

    # The finale ballot resolves at the finale. Placement no longer needs a
    # special case — it's ordinary finale scoring events now.
    if is_finale:
        for uid, val in finale_points(conn, league_season_id).items():
            add(uid, val)

    return points
