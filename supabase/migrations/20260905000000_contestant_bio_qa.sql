-- The CBS cast questionnaire ("3 Words to Describe You", "Why will you be the
-- Sole Survivor?", ...) as ordered question/answer pairs, shown as expandable
-- sections on the contestant page. Loaded by scripts/load_bio_qa.py; the
-- hand-written prose blurb stays in `bio`.
alter table contestants add column bio_qa jsonb;
