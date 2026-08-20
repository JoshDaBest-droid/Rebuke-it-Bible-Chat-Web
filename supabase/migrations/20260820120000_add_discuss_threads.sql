-- discuss_threads — one row per multi-turn "Discuss" conversation thread.
-- Whole-thread-as-one-row (client_id/title/messages jsonb), mirroring
-- chat_history's existing pattern: the messages array is stored as-is,
-- since it's already exactly what renders on-device — no separate
-- messages table needed (nothing in the app queries messages independent
-- of their thread). updated_at drives the thread list's sort order, since
-- a thread's "recency" is its last message, not its creation time.
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
