-- Only a Dungeon: tables for player IDs, cloud saves and leaderboards.
-- Paste into Supabase → SQL Editor → New query → Run. Safe to run again.

-- 1. Player IDs (shown on leaderboards). One per account, unique ignoring upper/lower case.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  player_id text not null check (player_id ~ '^[A-Za-z0-9_一-鿿-]{3,16}$'),
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_player_id_key on public.profiles (lower(player_id));

-- 2. Cloud saves: the whole save as JSON, one per account.
create table if not exists public.saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  save_version int not null default 1,
  updated_at timestamptz not null default now()
);

-- 3. Leaderboard scores, one row per account.
create table if not exists public.scores (
  user_id uuid primary key references auth.users (id) on delete cascade,
  player_id text not null,
  class_id text,
  mix_name text,
  best_tier int not null default 0,
  account_level int not null default 1,
  wb_day text,
  wb_damage double precision not null default 0,
  updated_at timestamptz not null default now()
);
create index if not exists scores_best_tier_idx on public.scores (best_tier desc);
create index if not exists scores_wb_idx on public.scores (wb_day, wb_damage desc);

-- 4. Locker rules (Row Level Security): everyone can read IDs and scores; you can only write your own rows.
alter table public.profiles enable row level security;
alter table public.saves enable row level security;
alter table public.scores enable row level security;

drop policy if exists "read ids" on public.profiles;
drop policy if exists "write own id" on public.profiles;
drop policy if exists "update own id" on public.profiles;
create policy "read ids" on public.profiles for select using (true);
create policy "write own id" on public.profiles for insert to authenticated with check (auth.uid() = id);
create policy "update own id" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "own save" on public.saves;
create policy "own save" on public.saves for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "read scores" on public.scores;
drop policy if exists "write own score" on public.scores;
drop policy if exists "update own score" on public.scores;
create policy "read scores" on public.scores for select using (true);
create policy "write own score" on public.scores for insert to authenticated with check (auth.uid() = user_id);
create policy "update own score" on public.scores for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
