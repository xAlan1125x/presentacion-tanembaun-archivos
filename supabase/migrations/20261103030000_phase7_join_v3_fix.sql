-- Evita la ambigüedad entre la columna participant_id y el parámetro de salida
-- homónimo de join_game_session al inicializar recorridos v3.
create or replace function public.join_game_session(requested_code text, participant_nickname text)
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

revoke all on function public.join_game_session(text, text) from public, anon;
grant execute on function public.join_game_session(text, text) to authenticated;
