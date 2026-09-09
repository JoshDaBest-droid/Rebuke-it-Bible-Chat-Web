-- Rebuke it: Bible Chat — Supabase schema
--
-- Run this once in your Supabase project's SQL Editor
-- (https://supabase.com/dashboard/project/rivaydnusrzogaibswct/sql/new).
-- Safe to re-run: every statement is idempotent (`if not exists` / `create or replace`).
--
-- Seven tables, one per synced data type in the app. Every table is scoped to
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
-- chat_history — mirrors ChatScreen.js's persisted Guide history. response
-- is the full discovery-result object (themes/passages/relatedTopics, or a
-- journey/crisis {text,citations} shape) stored as-is, since it's exactly
-- what already rendered on-device — no need to regenerate it.
-- ---------------------------------------------------------------------------
create table if not exists chat_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  question text not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

alter table chat_history enable row level security;

drop policy if exists "own chat history" on chat_history;
create policy "own chat history" on chat_history
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- discuss_threads — mirrors DiscussScreen.js's saved conversation threads.
-- One row per thread; messages is the full ordered message array as-is
-- (same whole-blob pattern as chat_history), since that's already exactly
-- what renders on-device. updated_at (not created_at) is what the thread
-- list sorts by, since new messages keep a thread "current."
-- ---------------------------------------------------------------------------
create table if not exists discuss_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  title text not null,
  messages jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_id)
);

alter table discuss_threads enable row level security;

drop policy if exists "own discuss threads" on discuss_threads;
create policy "own discuss threads" on discuss_threads
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Signup notification — fires the worker's /webhooks/new-signup endpoint on
-- every new auth.users row, via pg_net (Postgres's async HTTP extension —
-- this is the same mechanism the dashboard's "Database Webhooks" UI uses
-- under the hood, written directly as SQL instead so it's versioned here).
-- Replace <WORKER_URL> and <WEBHOOK_SECRET> below with your deployed worker
-- URL and the SIGNUP_WEBHOOK_SECRET you set via `wrangler secret put` before
-- running this block.
-- ---------------------------------------------------------------------------
create extension if not exists pg_net;

create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform net.http_post(
    url := '<WORKER_URL>/webhooks/new-signup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', '<WEBHOOK_SECRET>'
    ),
    body := jsonb_build_object('record', jsonb_build_object('email', new.email))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_notify on auth.users;
create trigger on_auth_user_created_notify
  after insert on auth.users
  for each row
  execute function public.notify_new_signup();
