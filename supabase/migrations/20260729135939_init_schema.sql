-- Rebuke it: Bible Chat — Supabase schema
--
-- Run this once in your Supabase project's SQL Editor
-- (https://supabase.com/dashboard/project/rivaydnusrzogaibswct/sql/new).
-- Safe to re-run: every statement is idempotent (`if not exists` / `create or replace`).
--
-- Six tables, one per synced data type in the app. Every table is scoped to
-- the signed-in user via Row Level Security — a user can only ever read or
-- write their own rows, enforced by Postgres itself, not just app code.

create extension if not exists pgcrypto; -- provides gen_random_uuid()

-- ---------------------------------------------------------------------------
-- user_settings — one row per user. Mirrors ThemeContext.js's six prefs.
-- ---------------------------------------------------------------------------
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text,
  mode text,
  text_scale numeric,
  contrast boolean,
  reduced_motion boolean,
  font_color text,
  updated_at timestamptz not null default now()
);

alter table user_settings enable row level security;

drop policy if exists "own settings" on user_settings;
create policy "own settings" on user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- journal_entries — mirrors JournalScreen.js entries.
-- client_id stores the app's own local id ("j"+timestamp+random) so repeated
-- syncs of the same entry upsert instead of duplicating.
-- ---------------------------------------------------------------------------
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  text text not null,
  linked_ref text,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

alter table journal_entries enable row level security;

drop policy if exists "own journal entries" on journal_entries;
create policy "own journal entries" on journal_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- prayers — mirrors PrayerScreen.js entries.
-- ---------------------------------------------------------------------------
create table if not exists prayers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  text text not null,
  type text not null check (type in ('written', 'ai')),
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

alter table prayers enable row level security;

drop policy if exists "own prayers" on prayers;
create policy "own prayers" on prayers
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- highlights & bookmarks — mirrors VerseSheetContext.js. No synthetic id:
-- the app already keys these by verse reference alone (toggle on/off), so
-- (user_id, ref) is the natural primary key.
-- ---------------------------------------------------------------------------
create table if not exists highlights (
  user_id uuid not null references auth.users(id) on delete cascade,
  ref text not null,
  text text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, ref)
);

alter table highlights enable row level security;

drop policy if exists "own highlights" on highlights;
create policy "own highlights" on highlights
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  ref text not null,
  text text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, ref)
);

alter table bookmarks enable row level security;

drop policy if exists "own bookmarks" on bookmarks;
create policy "own bookmarks" on bookmarks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- plan_progress — mirrors PlansScreen.js. One row per completed reading-plan
-- day, matching the existing local toggle-by-ref semantics exactly.
-- ---------------------------------------------------------------------------
create table if not exists plan_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_id text not null,
  ref text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, plan_id, ref)
);

alter table plan_progress enable row level security;

drop policy if exists "own plan progress" on plan_progress;
create policy "own plan progress" on plan_progress
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
