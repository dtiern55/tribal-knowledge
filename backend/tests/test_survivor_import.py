"""Unit tests for the survivoR → proposal mapping (no DB, no network)."""

from app.survivor_import import build_proposal, map_elimination_type

S = "US47"


def _vote(caster_id, caster, vote, voted_out, voted_out_id=None, **kw):
    return {
        "version_season": S,
        "episode": 5,
        "castaway_id": caster_id,
        "castaway": caster,
        "vote": vote,
        "vote_id": kw.pop("vote_id", None),
        "voted_out": voted_out,
        "voted_out_id": voted_out_id,
        "nullified": False,
        **kw,
    }


def _build(**overrides):
    base = {
        "vote_history": [],
        "boot_order": [],
        "challenge_results": [],
        "advantage_movement": [],
        "advantage_details": [],
        "castaways": [],
    }
    base.update(overrides)
    return build_proposal(S, 5, **base)


def _events(proposal, event_type):
    return [e for e in proposal["events"] if e["event_type"] == event_type]


def test_elimination_type_mapping():
    assert map_elimination_type("5th voted out") == "voted_out"
    assert map_elimination_type("Medically evacuated") == "medical_evacuation"
    assert map_elimination_type("Quit") == "quit"
    assert map_elimination_type("Lost final 4 fire challenge") == "fire_making_loss"
    assert map_elimination_type("Sole Survivor") is None
    assert map_elimination_type("Runner-up") is None


def test_votes_and_boot():
    votes = [
        _vote("A", "Ann", "Cat", "Cat", "C", vote_id="C"),
        _vote("B", "Bob", "Ann", "Cat", "C", vote_id="A"),
        _vote("C", "Cat", "Ann", "Cat", "C", vote_id="A"),
    ]
    boots = [
        {
            "version_season": S,
            "episode": 5,
            "castaway_id": "C",
            "castaway": "Cat",
            "result": "5th voted out",
        }
    ]
    p = _build(vote_history=votes, boot_order=boots)
    assert p["eliminations"] == [
        {
            "castaway_id": "C",
            "name": "Cat",
            "elimination_type": "voted_out",
            "result": "5th voted out",
        }
    ]
    correct = _events(p, "vote_correctly_at_tribal")
    assert [e["castaway_id"] for e in correct] == ["A"]
    received = {e["castaway_id"]: e["quantity"] for e in _events(p, "votes_received")}
    assert received == {"C": 1, "A": 2}


def test_nullified_vote_excluded_with_warning():
    votes = [_vote("A", "Ann", "Cat", "Cat", "C", vote_id="C", nullified=True)]
    p = _build(vote_history=votes)
    assert _events(p, "vote_correctly_at_tribal") == []
    assert _events(p, "votes_received") == []
    assert any("nullified" in w.lower() for w in p["warnings"])


def test_challenge_flags():
    rows = [
        {
            "version_season": S,
            "episode": 5,
            "castaway_id": "A",
            "castaway": "Ann",
            "won_tribal_immunity": 1,
            "won_individual_reward": 1,
        }
    ]
    p = _build(challenge_results=rows)
    assert len(_events(p, "win_team_immunity")) == 1
    assert len(_events(p, "win_individual_reward")) == 1


def test_advantage_lifecycle():
    details = [
        {
            "version_season": S,
            "advantage_id": 1,
            "advantage_type": "Hidden Immunity Idol",
        },
        {"version_season": S, "advantage_id": 2, "advantage_type": "Steal a Vote"},
    ]
    moves = [
        {
            "version_season": S,
            "episode": 5,
            "castaway_id": "A",
            "castaway": "Ann",
            "advantage_id": 1,
            "event": "Found",
        },
        {
            "version_season": S,
            "episode": 5,
            "castaway_id": "A",
            "castaway": "Ann",
            "advantage_id": 1,
            "event": "Played",
            "success": "Yes",
        },
        {
            "version_season": S,
            "episode": 5,
            "castaway_id": "B",
            "castaway": "Bob",
            "advantage_id": 2,
            "event": "Played",
        },
        {
            "version_season": S,
            "episode": 5,
            "castaway_id": "C",
            "castaway": "Cat",
            "advantage_id": 1,
            "event": "Voted out with advantage",
        },
    ]
    p = _build(advantage_movement=moves, advantage_details=details)
    assert len(_events(p, "acquire_active_idol")) == 1
    assert len(_events(p, "idol_played_successfully")) == 1
    assert len(_events(p, "use_steal_a_vote")) == 1
    assert len(_events(p, "eliminated_holding_idol")) == 1


def test_jury_and_placement():
    cast = [
        {
            "version_season": S,
            "episode": 5,
            "castaway_id": "C",
            "castaway": "Cat",
            "full_name": "Cat Fields",
            "jury": True,
            "place": 12,
        }
    ]
    p = _build(castaways=cast)
    assert len(_events(p, "join_jury")) == 1
    assert p["placements"] == [{"castaway_id": "C", "name": "Cat", "placement": 12}]
