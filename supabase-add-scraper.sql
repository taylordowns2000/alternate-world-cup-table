-- ============================================================================
-- Prepare the matches table for the scraper. Run in Supabase → SQL Editor.
-- (Run this once, after supabase-setup.sql.)
-- ============================================================================

-- The scraper keys each row on football-data.org's match id so re-runs update
-- in place instead of inserting duplicates. Add the column + unique index.
alter table public.matches add column if not exists ext_id bigint;
alter table public.matches add column if not exists stage  text;
create unique index if not exists matches_ext_id_key on public.matches (ext_id);

-- The 72 seed fixtures from supabase-setup.sql have no ext_id and only NULL
-- scores, so letting the scraper own the data is cleanest. This clears those
-- placeholders (nothing real is lost). If you've MANUALLY typed scores you want
-- to keep, do NOT run this line — tell me and I'll write a backfill instead.
truncate public.matches restart identity;
