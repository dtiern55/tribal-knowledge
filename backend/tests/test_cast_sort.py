from app.routers.contestants import _cast_sort_key


def test_cast_sort_active_by_score_then_boots_at_bottom():
    """Still-in players sort by score high→low; voted-out sink below in reverse
    boot order (first person out at the very bottom, #7)."""
    rows = [
        {"name": "Boot-ep1-a", "eliminated_in_episode": 1, "total_points": 0},
        {"name": "Leader", "eliminated_in_episode": None, "total_points": 30},
        {"name": "Boot-ep2", "eliminated_in_episode": 2, "total_points": 99},
        {"name": "Midpack", "eliminated_in_episode": None, "total_points": 10},
        {"name": "Boot-ep1-b", "eliminated_in_episode": 1, "total_points": 5},
    ]
    ordered = [r["name"] for r in sorted(rows, key=_cast_sort_key)]
    assert ordered == ["Leader", "Midpack", "Boot-ep2", "Boot-ep1-a", "Boot-ep1-b"]
