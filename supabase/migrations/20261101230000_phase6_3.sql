alter table public.participants
  add column if not exists finished_at timestamptz;

drop function if exists public.join_game_session(text, text);

create or replace function public.join_game_session(requested_code text, participant_nickname text)
returns table (participant_id uuid, session_id uuid, nickname text, finished_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.sessions;
  p_id uuid;
  p_session_id uuid;
  p_nickname text;
  p_finished_at timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select s.* into target
  from public.sessions s
  where s.join_code = upper(btrim(requested_code)) and s.status = 'active';

  if target.id is null then
    raise exception 'active session not found';
  end if;

  insert into public.participants (session_id, auth_user_id, nickname)
  values (target.id, auth.uid(), btrim(participant_nickname))
  on conflict on constraint participants_session_id_auth_user_id_key
  do update set nickname = excluded.nickname, last_seen_at = now()
  returning participants.id, participants.session_id, participants.nickname, participants.finished_at
  into p_id, p_session_id, p_nickname, p_finished_at;

  insert into public.participant_progress (participant_id, game_id)
  select p_id, game_id
  from unnest(array['classify-files', 'digital-detective', 'repair-system', 'copyfile-challenge', 'escape-room']) as game_id
  on conflict on constraint participant_progress_pkey do nothing;

  participant_id := p_id;
  session_id := p_session_id;
  nickname := p_nickname;
  finished_at := p_finished_at;
  return next;
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
    select 1
    from public.participants p
    join public.sessions s on s.id = p.session_id
    where p.id = target_participant_id
      and p.auth_user_id = auth.uid()
      and p.finished_at is null
      and s.status = 'active'
  ) then
    raise exception 'participant access denied, participation finalized, or session closed';
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

create or replace function public.finalize_participation(target_participant_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  finished timestamptz;
begin
  if not exists (
    select 1
    from public.participants p
    join public.sessions s on s.id = p.session_id
    where p.id = target_participant_id
      and p.auth_user_id = auth.uid()
      and p.finished_at is null
      and s.status = 'active'
  ) then
    raise exception 'participant access denied, participation finalized, or session closed';
  end if;

  if (
    select count(*)
    from public.participant_progress
    where participant_id = target_participant_id and status = 'completed'
  ) <> 5 then
    raise exception 'all five stages must be completed before finalizing';
  end if;

  update public.participants
  set finished_at = coalesce(finished_at, now()), last_seen_at = now()
  where id = target_participant_id
  returning participants.finished_at into finished;

  return finished;
end;
$$;

create or replace function public.get_session_ranking(target_session_id uuid)
returns table ("position" bigint, nickname text, total_score bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.participants p
    where p.session_id = target_session_id and p.auth_user_id = auth.uid()
  ) and not public.is_session_owner(target_session_id) then
    raise exception 'session access denied';
  end if;

  return query
  with scores as (
    select p.nickname,
      coalesce(sum(pp.best_score), 0)::bigint as total_score
    from public.participants p
    left join public.participant_progress pp on pp.participant_id = p.id
    where p.session_id = target_session_id and p.finished_at is not null
    group by p.id, p.nickname
  )
  select rank() over (order by scores.total_score desc) as "position",
    scores.nickname, scores.total_score
  from scores
  order by scores.total_score desc, scores.nickname asc;
end;
$$;

revoke all on function public.finalize_participation(uuid) from public, anon;
grant execute on function public.finalize_participation(uuid) to authenticated;
revoke all on function public.get_session_ranking(uuid) from public, anon;
grant execute on function public.get_session_ranking(uuid) to authenticated;
