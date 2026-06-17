-- ============================================================================
-- World Cup 2026 table — Supabase setup
-- Run this whole file in: Supabase dashboard → SQL Editor → New query → Run.
-- ============================================================================

-- 1) The table. Scores are NULL until a match is played.
create table if not exists public.matches (
  id         bigint generated always as identity primary key,
  grp        text,                       -- group letter A–L (for reference)
  team1      text not null,              -- home team (canonical name, see TEAMS in the html)
  team2      text not null,              -- away team
  score1     int,                        -- home goals; leave NULL until played
  score2     int,                        -- away goals; leave NULL until played
  status     text not null default 'scheduled',  -- 'scheduled' | 'finished'
  kickoff    timestamptz,                -- optional
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh on every edit
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists matches_touch on public.matches;
create trigger matches_touch before update on public.matches
  for each row execute function public.touch_updated_at();

-- 2) Row-level security: the public anon key can READ, nothing else.
--    Writes happen in the dashboard table editor (service role, bypasses RLS).
alter table public.matches enable row level security;

drop policy if exists "public read" on public.matches;
create policy "public read" on public.matches
  for select to anon using (true);

-- 3) Seed all 72 group-stage fixtures (round-robin within each group),
--    scores left NULL. Fill them in from the table editor as matches finish.
insert into public.matches (grp, team1, team2) values
  ('A', 'Mexico', 'South Africa'),
  ('A', 'Mexico', 'South Korea'),
  ('A', 'Mexico', 'Czech Republic'),
  ('A', 'South Africa', 'South Korea'),
  ('A', 'South Africa', 'Czech Republic'),
  ('A', 'South Korea', 'Czech Republic'),
  ('B', 'Canada', 'Bosnia and Herzegovina'),
  ('B', 'Canada', 'Qatar'),
  ('B', 'Canada', 'Switzerland'),
  ('B', 'Bosnia and Herzegovina', 'Qatar'),
  ('B', 'Bosnia and Herzegovina', 'Switzerland'),
  ('B', 'Qatar', 'Switzerland'),
  ('C', 'Brazil', 'Morocco'),
  ('C', 'Brazil', 'Haiti'),
  ('C', 'Brazil', 'Scotland'),
  ('C', 'Morocco', 'Haiti'),
  ('C', 'Morocco', 'Scotland'),
  ('C', 'Haiti', 'Scotland'),
  ('D', 'United States', 'Paraguay'),
  ('D', 'United States', 'Australia'),
  ('D', 'United States', 'Turkey'),
  ('D', 'Paraguay', 'Australia'),
  ('D', 'Paraguay', 'Turkey'),
  ('D', 'Australia', 'Turkey'),
  ('E', 'Germany', 'Curacao'),
  ('E', 'Germany', 'Ivory Coast'),
  ('E', 'Germany', 'Ecuador'),
  ('E', 'Curacao', 'Ivory Coast'),
  ('E', 'Curacao', 'Ecuador'),
  ('E', 'Ivory Coast', 'Ecuador'),
  ('F', 'Netherlands', 'Japan'),
  ('F', 'Netherlands', 'Sweden'),
  ('F', 'Netherlands', 'Tunisia'),
  ('F', 'Japan', 'Sweden'),
  ('F', 'Japan', 'Tunisia'),
  ('F', 'Sweden', 'Tunisia'),
  ('G', 'Belgium', 'Egypt'),
  ('G', 'Belgium', 'Iran'),
  ('G', 'Belgium', 'New Zealand'),
  ('G', 'Egypt', 'Iran'),
  ('G', 'Egypt', 'New Zealand'),
  ('G', 'Iran', 'New Zealand'),
  ('H', 'Spain', 'Cape Verde'),
  ('H', 'Spain', 'Saudi Arabia'),
  ('H', 'Spain', 'Uruguay'),
  ('H', 'Cape Verde', 'Saudi Arabia'),
  ('H', 'Cape Verde', 'Uruguay'),
  ('H', 'Saudi Arabia', 'Uruguay'),
  ('I', 'France', 'Senegal'),
  ('I', 'France', 'Iraq'),
  ('I', 'France', 'Norway'),
  ('I', 'Senegal', 'Iraq'),
  ('I', 'Senegal', 'Norway'),
  ('I', 'Iraq', 'Norway'),
  ('J', 'Argentina', 'Algeria'),
  ('J', 'Argentina', 'Austria'),
  ('J', 'Argentina', 'Jordan'),
  ('J', 'Algeria', 'Austria'),
  ('J', 'Algeria', 'Jordan'),
  ('J', 'Austria', 'Jordan'),
  ('K', 'Portugal', 'DR Congo'),
  ('K', 'Portugal', 'Uzbekistan'),
  ('K', 'Portugal', 'Colombia'),
  ('K', 'DR Congo', 'Uzbekistan'),
  ('K', 'DR Congo', 'Colombia'),
  ('K', 'Uzbekistan', 'Colombia'),
  ('L', 'England', 'Croatia'),
  ('L', 'England', 'Ghana'),
  ('L', 'England', 'Panama'),
  ('L', 'Croatia', 'Ghana'),
  ('L', 'Croatia', 'Panama'),
  ('L', 'Ghana', 'Panama');
