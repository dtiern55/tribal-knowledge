-- #262: cast flavor on the contestant page.
--
-- age / occupation / hometown are imported from survivoR (scripts/load_bios.py).
-- bio is the hand-written blurb: survivoR has no prose, and TVmaze returns a
-- person summary for none of the DvG cast, so there is nothing to import it
-- from. Nullable, and the page simply omits whatever is missing.

alter table contestants
  add column age        int,
  add column occupation text,
  add column hometown   text,
  add column bio        text;
