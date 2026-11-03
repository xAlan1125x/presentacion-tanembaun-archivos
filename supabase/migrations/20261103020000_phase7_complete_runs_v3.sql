-- Recorridos v3: cuatro etapas de hasta 100 puntos y Factory con puntaje abierto.
-- Las sesiones existentes conservan rules_version = 1 y participant_progress intacto.

alter table public.sessions
  add column if not exists rules_version smallint not null default 1
  check (rules_version in (1, 3));

create table if not exists public.participant_run_state_v3 (
  participant_id uuid primary key references public.participants(id) on delete cascade,
  current_state jsonb not null,
  best_run jsonb,
  best_academic_score bigint not null default 0 check (best_academic_score between 0 and 400),
  best_factory_score bigint not null default 0 check (best_factory_score >= 0),
  best_total_score bigint not null default 0 check (best_total_score >= 0),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(current_state) = 'object'),
  check (best_total_score = best_academic_score + best_factory_score)
);

alter table public.participant_run_state_v3 enable row level security;

drop policy if exists run_state_v3_select on public.participant_run_state_v3;
create policy run_state_v3_select on public.participant_run_state_v3 for select using (
  exists (
    select 1 from public.participants p
    where p.id = participant_id
      and (p.auth_user_id = auth.uid() or public.is_session_owner(p.session_id))
  )
);

revoke all on public.participant_run_state_v3 from anon, authenticated;
grant select on public.participant_run_state_v3 to authenticated;

-- La versión de reglas identifica el formato histórico de una partida y no debe
-- poder cambiarse mediante el update genérico que usa el panel para cerrarla.
revoke update on public.sessions from authenticated;
grant update (name, status, closed_at) on public.sessions to authenticated;

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
    insert into public.sessions (owner_id, name, join_code, rules_version)
    values (auth.uid(), btrim(session_name), generated_code, 3)
    on conflict (join_code) do nothing
    returning * into created;
    exit when created.id is not null;
  end loop;

  return created;
end;
$$;

drop function if exists public.join_game_session(text, text);

create function public.join_game_session(requested_code text, participant_nickname text)
returns table (participant_id uuid, session_id uuid, nickname text, finished_at timestamptz, rules_version smallint, run_state jsonb)
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
  p_run_state jsonb;
  run_id text;
  created_at timestamptz := now();
  empty_games jsonb;
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

  if target.rules_version = 3 then
    run_id := gen_random_uuid()::text;
    empty_games := jsonb_build_object(
      'classify-files', jsonb_build_object('status', 'not-started', 'bestScore', 0, 'attempts', 0),
      'digital-detective', jsonb_build_object('status', 'not-started', 'bestScore', 0, 'attempts', 0),
      'repair-system', jsonb_build_object('status', 'not-started', 'bestScore', 0, 'attempts', 0),
      'copyfile-challenge', jsonb_build_object('status', 'not-started', 'bestScore', 0, 'attempts', 0),
      'escape-room', jsonb_build_object('status', 'not-started', 'bestScore', 0, 'attempts', 0)
    );
    insert into public.participant_run_state_v3 (participant_id, current_state)
    values (p_id, jsonb_build_object(
      'version', 3,
      'playerId', p_nickname,
      'currentRunId', run_id,
      'currentRunNumber', 1,
      'startedAt', created_at,
      'updatedAt', created_at,
      'games', empty_games
    ))
    on conflict on constraint participant_run_state_v3_pkey do nothing;
    select r.current_state into p_run_state
    from public.participant_run_state_v3 r
    where r.participant_id = p_id;
  else
    insert into public.participant_progress (participant_id, game_id)
    select p_id, game_id
    from unnest(array['classify-files', 'digital-detective', 'repair-system', 'copyfile-challenge', 'escape-room']) as game_id
    on conflict on constraint participant_progress_pkey do nothing;
  end if;

  participant_id := p_id;
  session_id := p_session_id;
  nickname := p_nickname;
  finished_at := p_finished_at;
  rules_version := target.rules_version;
  run_state := p_run_state;
  return next;
end;
$$;

-- La RPC anterior queda disponible sólo para las sesiones históricas v1.
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
      and s.rules_version = 1
  ) then
    raise exception 'participant access denied, participation finalized, session closed, or incompatible rules';
  end if;

  insert into public.participant_progress (
    participant_id, game_id, status, best_score, attempts,
    last_explanation, completed_at, updated_at
  ) values (
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

create or replace function public.get_participant_run_state_v3(target_participant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
  finished timestamptz;
begin
  select r.current_state, p.finished_at into result, finished
  from public.participant_run_state_v3 r
  join public.participants p on p.id = r.participant_id
  where r.participant_id = target_participant_id
    and (p.auth_user_id = auth.uid() or public.is_session_owner(p.session_id));

  if result is null then
    return null;
  end if;
  if finished is not null then
    result := result || jsonb_build_object('finalizedAt', finished);
  end if;
  return result;
end;
$$;

create or replace function public.save_participant_run_state_v3(target_participant_id uuid, next_state jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  stored public.participant_run_state_v3;
  canonical jsonb;
  old_game jsonb;
  next_game jsonb;
  game_id text;
  game_ids text[] := array['classify-files', 'digital-detective', 'repair-system', 'copyfile-challenge', 'escape-room'];
  status_value text;
  score_value bigint;
  attempts_value integer;
  seen_unfinished boolean := false;
  current_complete boolean := true;
  is_new_run boolean := false;
  participant_nickname text;
  session_status text;
  session_rules smallint;
  fixed_score bigint;
  factory_score bigint;
  total_score bigint;
  summary jsonb;
  best jsonb;
  best_fixed bigint := 0;
  best_factory bigint := 0;
  best_total bigint := 0;
  server_now timestamptz := now();
begin
  select p.nickname, s.status, s.rules_version
  into participant_nickname, session_status, session_rules
  from public.participants p
  join public.sessions s on s.id = p.session_id
  where p.id = target_participant_id
    and p.auth_user_id = auth.uid()
    and p.finished_at is null
  for update of p, s;

  if participant_nickname is null or session_status <> 'active' or session_rules <> 3 then
    raise exception 'participant access denied, participation finalized, session closed, or incompatible rules';
  end if;

  if next_state is null
    or jsonb_typeof(next_state) <> 'object'
    or next_state->>'version' is distinct from '3'
    or nullif(next_state->>'currentRunId', '') is null
    or next_state->>'currentRunNumber' is null
    or (next_state->>'currentRunNumber') !~ '^[1-9][0-9]*$'
    or nullif(next_state->>'startedAt', '') is null
    or next_state->'games' is null
    or jsonb_typeof(next_state->'games') <> 'object'
    or (select count(*) from jsonb_object_keys(next_state->'games')) <> 5 then
    raise exception 'invalid phase 5 state';
  end if;

  foreach game_id in array game_ids loop
    next_game := next_state->'games'->game_id;
    status_value := next_game->>'status';
    if next_game is null
      or jsonb_typeof(next_game) <> 'object'
      or status_value is null
      or status_value not in ('not-started', 'in-progress', 'completed')
      or next_game->>'bestScore' is null
      or (next_game->>'bestScore') !~ '^[0-9]+$'
      or next_game->>'attempts' is null
      or (next_game->>'attempts') !~ '^[0-1]$' then
      raise exception 'invalid progress for %', game_id;
    end if;
    score_value := (next_game->>'bestScore')::bigint;
    attempts_value := (next_game->>'attempts')::integer;
    if (game_id <> 'escape-room' and score_value > 100) or score_value < 0 then
      raise exception 'invalid score for %', game_id;
    end if;
    if status_value = 'completed' and (attempts_value <> 1 or nullif(next_game->>'completedAt', '') is null) then
      raise exception 'completed stage lacks its definitive result';
    end if;
    if status_value <> 'completed' and attempts_value <> 0 then
      raise exception 'unfinished stage cannot count an attempt';
    end if;
    if seen_unfinished and status_value <> 'not-started' then
      raise exception 'stages must be completed sequentially';
    end if;
    if status_value <> 'completed' then
      seen_unfinished := true;
      current_complete := false;
    end if;
  end loop;

  select * into stored
  from public.participant_run_state_v3
  where participant_id = target_participant_id
  for update;

  if stored.participant_id is null then
    raise exception 'v3 run state not initialized';
  end if;

  is_new_run := stored.current_state->>'currentRunId' <> next_state->>'currentRunId';
  if is_new_run then
    if (next_state->>'currentRunNumber')::integer <> (stored.current_state->>'currentRunNumber')::integer + 1
      or exists (
        select 1 from unnest(game_ids) id
        where stored.current_state->'games'->id->>'status' <> 'completed'
      )
      or exists (
        select 1 from unnest(game_ids) id
        where next_state->'games'->id->>'status' <> 'not-started'
          or (next_state->'games'->id->>'bestScore')::bigint <> 0
          or (next_state->'games'->id->>'attempts')::integer <> 0
      ) then
      raise exception 'invalid new run transition';
    end if;
  else
    if (next_state->>'currentRunNumber')::integer <> (stored.current_state->>'currentRunNumber')::integer
      or next_state->>'startedAt' <> stored.current_state->>'startedAt' then
      raise exception 'run identity cannot change';
    end if;
    foreach game_id in array game_ids loop
      old_game := stored.current_state->'games'->game_id;
      next_game := next_state->'games'->game_id;
      if old_game->>'status' = 'completed' and old_game <> next_game then
        raise exception 'completed stage % cannot be modified', game_id;
      end if;
    end loop;
  end if;

  best := stored.best_run;
  best_fixed := stored.best_academic_score;
  best_factory := stored.best_factory_score;
  best_total := stored.best_total_score;
  canonical := (next_state - 'bestRun' - 'finalizedAt')
    || jsonb_build_object('playerId', participant_nickname, 'updatedAt', server_now);

  if current_complete then
    fixed_score := (canonical->'games'->'classify-files'->>'bestScore')::bigint
      + (canonical->'games'->'digital-detective'->>'bestScore')::bigint
      + (canonical->'games'->'repair-system'->>'bestScore')::bigint
      + (canonical->'games'->'copyfile-challenge'->>'bestScore')::bigint;
    factory_score := (canonical->'games'->'escape-room'->>'bestScore')::bigint;
    total_score := fixed_score + factory_score;
    summary := jsonb_build_object(
      'runId', canonical->>'currentRunId',
      'runNumber', (canonical->>'currentRunNumber')::integer,
      'scores', jsonb_build_object(
        'classify-files', (canonical->'games'->'classify-files'->>'bestScore')::bigint,
        'digital-detective', (canonical->'games'->'digital-detective'->>'bestScore')::bigint,
        'repair-system', (canonical->'games'->'repair-system'->>'bestScore')::bigint,
        'copyfile-challenge', (canonical->'games'->'copyfile-challenge'->>'bestScore')::bigint,
        'escape-room', factory_score
      ),
      'fixedGamesScore', fixed_score,
      'factoryScore', factory_score,
      'totalScore', total_score,
      'completedAt', server_now
    );
    if best is null or total_score > best_total then
      best := summary;
      best_fixed := fixed_score;
      best_factory := factory_score;
      best_total := total_score;
    end if;
  end if;

  if best is not null then
    canonical := canonical || jsonb_build_object('bestRun', best);
  end if;

  update public.participant_run_state_v3
  set current_state = canonical,
      best_run = best,
      best_academic_score = best_fixed,
      best_factory_score = best_factory,
      best_total_score = best_total,
      updated_at = server_now
  where participant_id = target_participant_id;

  return canonical;
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
  rules smallint;
begin
  select s.rules_version into rules
  from public.participants p
  join public.sessions s on s.id = p.session_id
  where p.id = target_participant_id
    and p.auth_user_id = auth.uid()
    and p.finished_at is null
    and s.status = 'active'
  for update of p, s;

  if rules is null then
    raise exception 'participant access denied, participation finalized, or session closed';
  end if;

  if rules = 3 then
    if not exists (
      select 1 from public.participant_run_state_v3 r
      where r.participant_id = target_participant_id
        and r.best_run is not null
        and not exists (
          select 1
          from jsonb_each(r.current_state->'games') game
          where game.value->>'status' <> 'completed'
        )
    ) then
      raise exception 'a complete v3 run is required before finalizing';
    end if;
  elsif (
    select count(*) from public.participant_progress
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

drop function if exists public.get_session_ranking(uuid);
create function public.get_session_ranking(target_session_id uuid)
returns table ("position" bigint, nickname text, academic_score bigint, factory_score bigint, total_score bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  rules smallint;
begin
  if not exists (
    select 1 from public.participants p
    where p.session_id = target_session_id and p.auth_user_id = auth.uid()
  ) and not public.is_session_owner(target_session_id) then
    raise exception 'session access denied';
  end if;

  select s.rules_version into rules from public.sessions s where s.id = target_session_id;
  if rules = 3 then
    return query
    with scores as (
      select p.nickname, r.best_academic_score, r.best_factory_score, r.best_total_score
      from public.participants p
      join public.participant_run_state_v3 r on r.participant_id = p.id
      where p.session_id = target_session_id and p.finished_at is not null and r.best_run is not null
    )
    select rank() over (order by scores.best_total_score desc) as "position",
      scores.nickname, scores.best_academic_score, scores.best_factory_score, scores.best_total_score
    from scores
    order by scores.best_total_score desc, scores.nickname asc;
  else
    return query
    with scores as (
      select p.id, p.nickname,
        coalesce(sum(pp.best_score) filter (where pp.game_id <> 'escape-room'), 0)::bigint as academic_score,
        coalesce(sum(pp.best_score) filter (where pp.game_id = 'escape-room'), 0)::bigint as factory_score
      from public.participants p
      left join public.participant_progress pp on pp.participant_id = p.id
      where p.session_id = target_session_id and p.finished_at is not null
      group by p.id, p.nickname
    )
    select rank() over (order by scores.academic_score + scores.factory_score desc) as "position",
      scores.nickname, scores.academic_score, scores.factory_score,
      scores.academic_score + scores.factory_score as total_score
    from scores
    order by (scores.academic_score + scores.factory_score) desc, scores.nickname asc;
  end if;
end;
$$;

create or replace function public.get_session_participant_summary(target_session_id uuid)
returns table (participant_id uuid, nickname text, finished_at timestamptz, academic_score bigint, factory_score bigint, total_score bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  rules smallint;
begin
  if not public.is_session_owner(target_session_id) then
    raise exception 'session owner access required';
  end if;
  select s.rules_version into rules from public.sessions s where s.id = target_session_id;
  if rules = 3 then
    return query
    select p.id, p.nickname, p.finished_at,
      coalesce(r.best_academic_score, 0), coalesce(r.best_factory_score, 0), coalesce(r.best_total_score, 0)
    from public.participants p
    left join public.participant_run_state_v3 r on r.participant_id = p.id
    where p.session_id = target_session_id
    order by p.created_at asc;
  else
    return query
    select p.id, p.nickname, p.finished_at,
      coalesce(sum(pp.best_score) filter (where pp.game_id <> 'escape-room'), 0)::bigint,
      coalesce(sum(pp.best_score) filter (where pp.game_id = 'escape-room'), 0)::bigint,
      coalesce(sum(pp.best_score), 0)::bigint
    from public.participants p
    left join public.participant_progress pp on pp.participant_id = p.id
    where p.session_id = target_session_id
    group by p.id, p.nickname, p.finished_at, p.created_at
    order by p.created_at asc;
  end if;
end;
$$;

revoke all on function public.create_game_session(text) from public, anon;
revoke all on function public.join_game_session(text, text) from public, anon;
revoke all on function public.update_participant_progress(uuid, text, text, integer, integer, text, timestamptz) from public, anon;
revoke all on function public.get_participant_run_state_v3(uuid) from public, anon;
revoke all on function public.save_participant_run_state_v3(uuid, jsonb) from public, anon;
revoke all on function public.finalize_participation(uuid) from public, anon;
revoke all on function public.get_session_ranking(uuid) from public, anon;
revoke all on function public.get_session_participant_summary(uuid) from public, anon;
grant execute on function public.create_game_session(text) to authenticated;
grant execute on function public.join_game_session(text, text) to authenticated;
grant execute on function public.update_participant_progress(uuid, text, text, integer, integer, text, timestamptz) to authenticated;
grant execute on function public.get_participant_run_state_v3(uuid) to authenticated;
grant execute on function public.save_participant_run_state_v3(uuid, jsonb) to authenticated;
grant execute on function public.finalize_participation(uuid) to authenticated;
grant execute on function public.get_session_ranking(uuid) to authenticated;
grant execute on function public.get_session_participant_summary(uuid) to authenticated;
