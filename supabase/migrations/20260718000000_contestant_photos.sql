-- ============================================================
-- Contestant photos (issue #54).
-- Own the image bytes in a public Storage bucket rather than hotlinking
-- external sites that may break mid-season. Photos are uploaded once per
-- season via the Supabase Studio dashboard; image_url stores the public
-- URL. Public bucket = readable by anyone with the link (photos aren't
-- secret); uploads go through the service role, which bypasses RLS.
-- ============================================================

alter table contestants add column image_url text;

insert into storage.buckets (id, name, public)
values ('contestant-photos', 'contestant-photos', true)
on conflict (id) do nothing;
