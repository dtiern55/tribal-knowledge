-- An optional commissioner's note on the episode, shown in the results
-- reveal below the headline (#185). Carries the judgment-call narrative the
-- one-line headline can't — revote rulings, deferred calls, cry/cuss tokens.
alter table episodes add column note text;
