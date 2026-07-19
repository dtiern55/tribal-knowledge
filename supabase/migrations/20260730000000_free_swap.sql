-- Swap economics rework (issue #159, decided 2026-07-19): the first swap each
-- season is free, later ones cost tokens; default cost drops 30 -> 20 so a
-- charged swap prices like the top advantage (extra vote) instead of three
-- weeks of income.
alter table seasons add column free_swaps integer not null default 1;
alter table seasons alter column swap_token_cost set default 20;
