"""The ladder-rank invariant every ballot writer shares (#694, #757): the Power
Vote's sealed name is the one unranked pick, the rest fall 1..n in order."""

from app.routers.picks import rerank_ballot


class FakeCur:
    """Records the final rank each contestant is set to."""

    def __init__(self):
        self.ranks = {}

    def execute(self, sql, params):
        if "set rank = null" in sql:
            return  # the bulk clear — nothing per-contestant to record
        rank_value, _ls, _ep, _uid, cid = params
        self.ranks[cid] = rank_value


def test_sealed_name_is_the_only_unranked_pick():
    cur = FakeCur()
    rerank_ballot(cur, "ls", "ep", "u", ["a", "b", "c", "d"], "b")
    assert cur.ranks == {"a": 1, "b": None, "c": 2, "d": 3}


def test_seal_on_top_rung_ranks_the_extra_name():
    # The #757 bug: seal rides the top pick, so the top pick is unranked and the
    # bought extra (last in confidence order) becomes a real rung.
    cur = FakeCur()
    rerank_ballot(cur, "ls", "ep", "u", ["top", "r2", "r3", "extra"], "top")
    assert cur.ranks == {"top": None, "r2": 1, "r3": 2, "extra": 3}
