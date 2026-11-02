create or replace function public.join_game_session(requested_code text, participant_nickname text)
returns table (participant_id uuid, session_id uuid, nickname text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target public.sessions;
  p_id uuid;
  p_session_id uuid;
  p_nickname text;
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
  returning participants.id, participants.session_id, participants.nickname
  into p_id, p_session_id, p_nickname;

  insert into public.participant_progress (participant_id, game_id)
  select p_id, game_id
  from unnest(array['classify-files', 'digital-detective', 'repair-system', 'copyfile-challenge', 'escape-room']) as game_id
  on conflict on constraint participant_progress_pkey do nothing;

  participant_id := p_id;
  session_id := p_session_id;
  nickname := p_nickname;
  return next;
end;
$$;

revoke all on function public.join_game_session(text, text) from public, anon;
grant execute on function public.join_game_session(text, text) to authenticated;
