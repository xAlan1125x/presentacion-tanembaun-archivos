-- Consulta pública y acotada del ranking v3 mediante código de partida.
-- No expone identificadores, usuarios de autenticación ni estados internos.

create or replace function public.get_public_session_ranking(requested_code text)
returns table (
  "position" bigint,
  nickname text,
  academic_score bigint,
  factory_score bigint,
  total_score bigint,
  finalized boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with target_session as (
    select s.id
    from public.sessions s
    where s.join_code = upper(btrim(requested_code))
      and s.rules_version = 3
  ), scores as (
    select
      p.nickname,
      r.best_academic_score,
      r.best_factory_score,
      r.best_total_score,
      p.finished_at is not null as finalized
    from target_session s
    join public.participants p on p.session_id = s.id
    join public.participant_run_state_v3 r on r.participant_id = p.id
    where r.best_run is not null
  )
  select
    rank() over (order by scores.best_total_score desc) as "position",
    scores.nickname,
    scores.best_academic_score,
    scores.best_factory_score,
    scores.best_total_score,
    scores.finalized
  from scores
  order by scores.best_total_score desc, scores.nickname asc;
$$;

revoke all on function public.get_public_session_ranking(text) from public;
grant execute on function public.get_public_session_ranking(text) to anon, authenticated;
