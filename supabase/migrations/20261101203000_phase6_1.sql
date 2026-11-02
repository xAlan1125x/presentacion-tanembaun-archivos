create extension if not exists pgcrypto;

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  join_code text not null unique check (join_code ~ '^[A-F0-9]{8}$'),
  status text not null default 'active' check (status in ('active', 'closed')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table if not exists public.participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(btrim(nickname)) between 2 and 24),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (session_id, auth_user_id),
  unique (session_id, nickname)
);

create table if not exists public.participant_progress (
  participant_id uuid not null references public.participants(id) on delete cascade,
  game_id text not null check (game_id in ('classify-files', 'digital-detective', 'repair-system', 'copyfile-challenge', 'escape-room')),
  status text not null default 'not-started' check (status in ('not-started', 'in-progress', 'completed')),
  best_score integer not null default 0 check (best_score between 0 and 200),
  attempts integer not null default 0 check (attempts >= 0),
  last_explanation text,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (participant_id, game_id)
);

create index if not exists sessions_owner_id_idx on public.sessions(owner_id);
create index if not exists participants_session_id_idx on public.participants(session_id);

alter table public.sessions enable row level security;
alter table public.participants enable row level security;
alter table public.participant_progress enable row level security;

create or replace function public.is_session_owner(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sessions
    where id = target_session_id and owner_id = auth.uid()
  );
$$;

revoke all on function public.is_session_owner(uuid) from public, anon;
grant execute on function public.is_session_owner(uuid) to authenticated;

create or replace function public.create_game_session(session_name text)
returns public.sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  created public.sessions;
  generated_code text;
begin
  if auth.uid() is null or (auth.jwt() ->> 'is_anonymous') = 'true' then
    raise exception 'teacher authentication required';
  end if;

  loop
    generated_code := upper(substr(encode(extensions.gen_random_bytes(5), 'hex'), 1, 8));
    created := null;
    insert into public.sessions (owner_id, name, join_code)
    values (auth.uid(), btrim(session_name), generated_code)
    on conflict (join_code) do nothing
    returning * into created;
    exit when created.id is not null;
  end loop;

  return created;
end;
$$;

create or replace function public.join_game_session(requested_code text, participant_nickname text)
returns table (participant_id uuid, session_id uuid, nickname text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.sessions;
  participant public.participants;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into target from public.sessions
  where join_code = upper(btrim(requested_code)) and status = 'active';

  if target.id is null then
    raise exception 'active session not found';
  end if;

  insert into public.participants (session_id, auth_user_id, nickname)
  values (target.id, auth.uid(), btrim(participant_nickname))
  on conflict (session_id, auth_user_id)
  do update set nickname = excluded.nickname, last_seen_at = now()
  returning id, participants.session_id, participants.nickname into participant;

  insert into public.participant_progress (participant_id, game_id)
  select participant.id, game_id
  from unnest(array['classify-files', 'digital-detective', 'repair-system', 'copyfile-challenge', 'escape-room']) as game_id
  on conflict (participant_id, game_id) do nothing;

  return query select participant.id as participant_id, participant.session_id as session_id, participant.nickname as nickname;
end;
$$;

create or replace function public.update_participant_progress(
  target_participant_id uuid,
  target_game_id text,
  next_status text,
  next_score integer,
  next_attempts integer,
  next_explanation text,
  next_completed_at timestamptz
)
returns public.participant_progress
language plpgsql
security definer
set search_path = public
as $$
declare
  updated public.participant_progress;
begin
  if not exists (
    select 1 from public.participants
    where id = target_participant_id and auth_user_id = auth.uid()
  ) then
    raise exception 'participant access denied';
  end if;

  insert into public.participant_progress (
    participant_id, game_id, status, best_score, attempts,
    last_explanation, completed_at, updated_at
  )
  values (
    target_participant_id, target_game_id, next_status,
    least(200, greatest(0, next_score)), greatest(0, next_attempts),
    next_explanation, next_completed_at, now()
  )
  on conflict (participant_id, game_id)
  do update set
    status = case when public.participant_progress.status = 'completed' or excluded.status = 'completed'
      then 'completed' else excluded.status end,
    best_score = greatest(public.participant_progress.best_score, excluded.best_score),
    attempts = greatest(public.participant_progress.attempts, excluded.attempts),
    last_explanation = excluded.last_explanation,
    completed_at = coalesce(public.participant_progress.completed_at, excluded.completed_at),
    updated_at = now()
  returning * into updated;

  return updated;
end;
$$;

drop policy if exists sessions_owner_select on public.sessions;
create policy sessions_owner_select on public.sessions for select using (owner_id = auth.uid());
drop policy if exists sessions_owner_update on public.sessions;
create policy sessions_owner_update on public.sessions for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists participants_owner_select on public.participants;
create policy participants_owner_select on public.participants for select using (
  auth_user_id = auth.uid() or public.is_session_owner(session_id)
);
drop policy if exists progress_owner_select on public.participant_progress;
create policy progress_owner_select on public.participant_progress for select using (
  exists (
    select 1 from public.participants p
    where p.id = participant_id and (p.auth_user_id = auth.uid() or public.is_session_owner(p.session_id))
  )
);

revoke all on public.sessions from anon, authenticated;
revoke all on public.participants from anon, authenticated;
revoke all on public.participant_progress from anon, authenticated;
grant select on public.sessions to authenticated;
grant update on public.sessions to authenticated;
grant select on public.participants to authenticated;
grant select on public.participant_progress to authenticated;
revoke all on function public.create_game_session(text) from public, anon;
revoke all on function public.join_game_session(text, text) from public, anon;
revoke all on function public.update_participant_progress(uuid, text, text, integer, integer, text, timestamptz) from public, anon;
grant execute on function public.create_game_session(text) to authenticated;
grant execute on function public.join_game_session(text, text) to authenticated;
grant execute on function public.update_participant_progress(uuid, text, text, integer, integer, text, timestamptz) to authenticated;
