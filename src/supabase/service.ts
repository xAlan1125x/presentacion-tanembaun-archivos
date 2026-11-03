import type { AuthError, User } from '@supabase/supabase-js'
import { GAME_IDS, parsePhase5State, type GameId, type Phase5State } from '../game'
import { supabase } from './client'
import type { OnlineSession, ParticipantProgressRow, RankingEntry, SessionParticipantSummary } from './types'
import type { GameProgress } from '../game'

interface SessionRow {
  id: string
  owner_id: string
  name: string
  join_code: string
  status: 'active' | 'closed'
  rules_version?: number
  created_at: string
  closed_at: string | null
}

function mapSession(row: SessionRow): OnlineSession {
  return {
    id: row.id,
    ownerId: row.owner_id,
    name: row.name,
    joinCode: row.join_code,
    status: row.status,
    rulesVersion: Number(row.rules_version ?? 1),
    createdAt: row.created_at,
    ...(row.closed_at ? { closedAt: row.closed_at } : {}),
  }
}

export function getSupabaseUnavailableError(): Error {
  return new Error('Supabase no está configurado. El modo local continúa disponible.')
}

export async function signInTeacher(email: string, password: string): Promise<{ user: User | null; error: AuthError | null }> {
  if (!supabase) return { user: null, error: { name: 'configuration', message: getSupabaseUnavailableError().message } as AuthError }
  const result = await supabase.auth.signInWithPassword({ email, password })
  return { user: result.data.user, error: result.error }
}

export async function signOutTeacher(): Promise<{ error: AuthError | null }> {
  if (!supabase) return { error: { name: 'configuration', message: getSupabaseUnavailableError().message } as AuthError }
  const result = await supabase.auth.signOut()
  return { error: result.error }
}

export async function getCurrentUser(): Promise<{ user: User | null; error: AuthError | null }> {
  if (!supabase) return { user: null, error: { name: 'configuration', message: getSupabaseUnavailableError().message } as AuthError }
  const result = await supabase.auth.getUser()
  return { user: result.data.user, error: result.error }
}

export async function createTeacherSession(name: string): Promise<{ session: OnlineSession | null; error: Error | null }> {
  if (!supabase) return { session: null, error: getSupabaseUnavailableError() }
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return { session: null, error: new Error('Iniciá sesión como expositor para crear una partida.') }
  const { data, error } = await supabase.rpc('create_game_session', { session_name: name.trim() })
  if (error) return { session: null, error }
  return { session: data ? mapSession(data as SessionRow) : null, error: data ? null : new Error('Supabase no devolvió la partida creada.') }
}

export async function listTeacherSessions(): Promise<{ sessions: OnlineSession[]; error: Error | null }> {
  if (!supabase) return { sessions: [], error: getSupabaseUnavailableError() }
  const { data, error } = await supabase.from('sessions').select('id, owner_id, name, join_code, status, rules_version, created_at, closed_at').order('created_at', { ascending: false })
  if (error) return { sessions: [], error }
  return { sessions: (data as SessionRow[]).map(mapSession), error: null }
}

export async function closeTeacherSession(sessionId: string): Promise<{ error: Error | null }> {
  if (!supabase) return { error: getSupabaseUnavailableError() }
  const { error } = await supabase.from('sessions').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sessionId)
  return { error }
}

export async function signInAnonymousParticipant(): Promise<{ user: User | null; error: AuthError | null }> {
  if (!supabase) return { user: null, error: { name: 'configuration', message: getSupabaseUnavailableError().message } as AuthError }
  const current = await supabase.auth.getUser()
  if (current.data.user?.is_anonymous) return { user: current.data.user, error: null }
  const result = await supabase.auth.signInAnonymously()
  return { user: result.data.user, error: result.error }
}

export async function joinSession(joinCode: string, nickname: string): Promise<{ participantId: string | null; sessionId: string | null; nickname: string | null; finishedAt: string | null; rulesVersion: number | null; state: Phase5State | null; error: Error | null }> {
  if (!supabase) return { participantId: null, sessionId: null, nickname: null, finishedAt: null, rulesVersion: null, state: null, error: getSupabaseUnavailableError() }
  const { data, error } = await supabase.rpc('join_game_session', { requested_code: joinCode.trim().toUpperCase(), participant_nickname: nickname.trim() })
  if (error) return { participantId: null, sessionId: null, nickname: null, finishedAt: null, rulesVersion: null, state: null, error }
  const row = Array.isArray(data) ? data[0] : data
  const parsedState = parseRemoteState(row?.run_state)
  return {
    participantId: row?.participant_id ?? null,
    sessionId: row?.session_id ?? null,
    nickname: row?.nickname ?? null,
    finishedAt: row?.finished_at ?? null,
    rulesVersion: row?.rules_version == null ? null : Number(row.rules_version),
    state: parsedState.state,
    error: !row ? new Error('Supabase no devolvió el participante.') : parsedState.error,
  }
}

export async function finalizeParticipant(participantId: string): Promise<{ finishedAt: string | null; error: Error | null }> {
  if (!supabase) return { finishedAt: null, error: getSupabaseUnavailableError() }
  const { data, error } = await supabase.rpc('finalize_participation', { target_participant_id: participantId })
  if (error) return { finishedAt: null, error }
  return { finishedAt: typeof data === 'string' ? data : data?.finished_at ?? null, error: null }
}

export async function loadSessionRanking(sessionId: string): Promise<{ ranking: RankingEntry[]; error: Error | null }> {
  if (!supabase) return { ranking: [], error: getSupabaseUnavailableError() }
  const { data, error } = await supabase.rpc('get_session_ranking', { target_session_id: sessionId })
  if (error) return { ranking: [], error }
  return {
    ranking: (Array.isArray(data) ? data : []).map((row) => ({
      position: Number(row.position),
      nickname: String(row.nickname),
      academicScore: Number(row.academic_score),
      factoryScore: Number(row.factory_score),
      totalScore: Number(row.total_score),
    })),
    error: null,
  }
}

export async function loadSessionParticipantSummary(sessionId: string): Promise<{ participants: SessionParticipantSummary[]; error: Error | null }> {
  if (!supabase) return { participants: [], error: getSupabaseUnavailableError() }
  const { data, error } = await supabase.rpc('get_session_participant_summary', { target_session_id: sessionId })
  if (error) return { participants: [], error }
  return {
    participants: (Array.isArray(data) ? data : []).map((row) => ({
      participantId: String(row.participant_id),
      nickname: String(row.nickname),
      ...(typeof row.finished_at === 'string' ? { finishedAt: row.finished_at } : {}),
      academicScore: Number(row.academic_score),
      factoryScore: Number(row.factory_score),
      totalScore: Number(row.total_score),
    })),
    error: null,
  }
}

function parseRemoteState(data: unknown): { state: Phase5State | null; error: Error | null } {
  if (data == null) return { state: null, error: null }
  const parsed = parsePhase5State(data)
  return parsed.ok ? { state: parsed.value, error: null } : { state: null, error: new Error(parsed.error) }
}

export async function loadParticipantRunState(participantId: string): Promise<{ state: Phase5State | null; error: Error | null }> {
  if (!supabase) return { state: null, error: getSupabaseUnavailableError() }
  const { data, error } = await supabase.rpc('get_participant_run_state_v3', { target_participant_id: participantId })
  return error ? { state: null, error } : parseRemoteState(data)
}

export async function saveParticipantRunState(participantId: string, state: Phase5State): Promise<{ state: Phase5State | null; error: Error | null }> {
  if (!supabase) return { state: null, error: getSupabaseUnavailableError() }
  const { data, error } = await supabase.rpc('save_participant_run_state_v3', { target_participant_id: participantId, next_state: state })
  return error ? { state: null, error } : parseRemoteState(data)
}

export async function updateParticipantProgress(participantId: string, gameId: GameId, progress: GameProgress): Promise<{ error: Error | null }> {
  if (!supabase) return { error: getSupabaseUnavailableError() }
  const { error } = await supabase.rpc('update_participant_progress', {
    target_participant_id: participantId,
    target_game_id: gameId,
    next_status: progress.status,
    next_score: progress.bestScore,
    next_attempts: progress.attempts,
    next_explanation: progress.lastExplanation ?? null,
    next_completed_at: progress.completedAt ?? null,
  })
  return { error }
}

export async function loadParticipantProgress(participantId: string): Promise<{ progress: ParticipantProgressRow[]; error: Error | null }> {
  if (!supabase) return { progress: [], error: getSupabaseUnavailableError() }
  const { data, error } = await supabase.from('participant_progress').select('participant_id, game_id, status, best_score, attempts, last_explanation, completed_at, updated_at').eq('participant_id', participantId)
  if (error) return { progress: [], error }
  return {
    progress: (data as Array<Record<string, unknown>>).filter((row): row is Record<string, string | number | null> => typeof row.game_id === 'string' && GAME_IDS.includes(row.game_id as GameId)).map((row) => ({
      participantId: row.participant_id as string,
      gameId: row.game_id as GameId,
      status: row.status as ParticipantProgressRow['status'],
      bestScore: row.best_score as number,
      attempts: row.attempts as number,
      ...(row.last_explanation ? { lastExplanation: row.last_explanation as string } : {}),
      ...(row.completed_at ? { completedAt: row.completed_at as string } : {}),
      updatedAt: row.updated_at as string,
    })),
    error: null,
  }
}
