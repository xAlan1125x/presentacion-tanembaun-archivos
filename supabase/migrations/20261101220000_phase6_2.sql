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
      and s.status = 'active'
  ) then
    raise exception 'participant access denied or session closed';
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

revoke all on function public.update_participant_progress(uuid, text, text, integer, integer, text, timestamptz) from public, anon;
grant execute on function public.update_participant_progress(uuid, text, text, integer, integer, text, timestamptz) to authenticated;
