import {
  createInitialState,
  createLocalGameStore,
  finalizeLocalParticipation,
  type GameProgressStore,
  type Phase5State,
  type PersistenceResult,
} from '../game'
import { finalizeParticipant, getCurrentUser, loadParticipantRunState, saveParticipantRunState } from './service'
import { supabase } from './client'

const PARTICIPANT_KEY = 'filelab:phase6:participant:v1'
const ONLINE_STATE_PREFIX = 'filelab:phase6:progress:v3:'
export const ONLINE_PROGRESS_EVENT = 'filelab:online-progress-updated'

export interface OnlineParticipant {
  participantId: string
  sessionId: string
  joinCode: string
  nickname: string
  rulesVersion: number
  finishedAt?: string
}

function readParticipant(storage: Storage): OnlineParticipant | null {
  try {
    const raw = storage.getItem(PARTICIPANT_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<OnlineParticipant>
    return typeof value.participantId === 'string' && typeof value.sessionId === 'string' &&
      typeof value.joinCode === 'string' && typeof value.nickname === 'string'
      ? { ...value, rulesVersion: typeof value.rulesVersion === 'number' ? value.rulesVersion : 1 } as OnlineParticipant
      : null
  } catch {
    return null
  }
}

export function getOnlineParticipant(): OnlineParticipant | null {
  return typeof window === 'undefined' ? null : readParticipant(window.localStorage)
}

export function saveOnlineParticipant(participant: OnlineParticipant): PersistenceResult<void> {
  if (typeof window === 'undefined') return { ok: false, error: 'El almacenamiento online no está disponible.' }
  try {
    window.localStorage.setItem(PARTICIPANT_KEY, JSON.stringify(participant))
    return { ok: true, value: undefined }
  } catch {
    return { ok: false, error: 'No se pudo guardar la identidad online.' }
  }
}

export function clearOnlineParticipant(): PersistenceResult<void> {
  if (typeof window === 'undefined') return { ok: false, error: 'El almacenamiento online no está disponible.' }
  try {
    const participant = readParticipant(window.localStorage)
    window.localStorage.removeItem(PARTICIPANT_KEY)
    if (participant) window.localStorage.removeItem(`${ONLINE_STATE_PREFIX}${participant.participantId}`)
    return { ok: true, value: undefined }
  } catch {
    return { ok: false, error: 'No se pudo borrar la partida online.' }
  }
}

function onlineStore(participantId: string): GameProgressStore {
  const key = `${ONLINE_STATE_PREFIX}${participantId}`
  return createLocalGameStore(window.localStorage, key)
}

export function loadOnlineState(participant: OnlineParticipant): Phase5State | null {
  const loaded = onlineStore(participant.participantId).load()
  return loaded.ok && loaded.value ? loaded.value : null
}

export async function restoreOnlineState(participant: OnlineParticipant): Promise<{ state: Phase5State; error: Error | null }> {
  const local = loadOnlineState(participant) ?? createInitialState(participant.nickname)
  if (participant.rulesVersion !== 3) return { state: local, error: new Error('Esta partida usa la escala anterior y permanece separada de los recorridos v3.') }
  const remote = await loadParticipantRunState(participant.participantId)
  if (remote.error) return { state: local, error: remote.error }
  if (participant.finishedAt) {
    const finalized = remote.state ?? { ...local, finalizedAt: participant.finishedAt }
    onlineStore(participant.participantId).save(finalized)
    return { state: finalized, error: null }
  }

  const candidate = loadOnlineState(participant) ?? remote.state ?? local
  const saved = await saveParticipantRunState(participant.participantId, candidate)
  if (saved.state) {
    onlineStore(participant.participantId).save(saved.state)
    return { state: saved.state, error: null }
  }
  if (remote.state) {
    onlineStore(participant.participantId).save(remote.state)
    return { state: remote.state, error: saved.error }
  }
  return { state: candidate, error: saved.error }
}

export async function retryOnlineSync(): Promise<{ error: Error | null }> {
  const participant = getOnlineParticipant()
  if (!participant || participant.finishedAt) return { error: null }
  const state = loadOnlineState(participant)
  if (!state) return { error: null }
  return syncOnlineState(state)
}

export async function syncOnlineState(state: Phase5State): Promise<{ error: Error | null }> {
  const participant = getOnlineParticipant()
  if (!participant || participant.finishedAt || !supabase) return { error: null }
  if (participant.rulesVersion !== 3) return { error: new Error('La partida anterior no admite recorridos v3.') }
  const auth = await getCurrentUser()
  if (auth.error || !auth.user || !auth.user.is_anonymous) return { error: auth.error ?? new Error('La sesión anónima ya no está disponible.') }
  const result = await saveParticipantRunState(participant.participantId, state)
  if (result.state) onlineStore(participant.participantId).save(result.state)
  return { error: result.error }
}

export async function finalizeOnlineParticipation(state: Phase5State): Promise<{ state: Phase5State; error: Error | null }> {
  const participant = getOnlineParticipant()
  if (!participant || participant.rulesVersion !== 3) return { state, error: new Error('No hay una participación online v3 activa.') }
  const synced = await syncOnlineState(state)
  if (synced.error) return { state, error: synced.error }
  const result = await finalizeParticipant(participant.participantId)
  if (result.error || !result.finishedAt) return { state, error: result.error ?? new Error('Supabase no devolvió la fecha de finalización.') }
  const finalized = finalizeLocalParticipation(state, result.finishedAt)
  const identitySaved = saveOnlineParticipant({ ...participant, finishedAt: result.finishedAt })
  if (!identitySaved.ok) return { state, error: new Error(identitySaved.error) }
  const stateSaved = onlineStore(participant.participantId).save(finalized)
  return stateSaved.ok ? { state: finalized, error: null } : { state, error: new Error(stateSaved.error) }
}

export function createActiveGameStore(): GameProgressStore {
  const participant = getOnlineParticipant()
  return participant ? onlineStore(participant.participantId) : createLocalGameStore(window.localStorage)
}

export function notifyOnlineProgressUpdated(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(ONLINE_PROGRESS_EVENT))
}

export function saveActiveGameState(state: Phase5State): PersistenceResult<void> {
  const participant = getOnlineParticipant()
  if (participant?.finishedAt || (participant && state.finalizedAt)) return { ok: false, error: 'Tu participación ya fue finalizada y no admite nuevos resultados.' }
  const saved = createActiveGameStore().save(state)
  if (!saved.ok) return saved
  if (getOnlineParticipant()) {
    void syncOnlineState(state).then((result) => {
      if (!result.error) {
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ONLINE_PROGRESS_EVENT, { detail: { message: 'Progreso sincronizado con Supabase.' } }))
      }
      else if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(ONLINE_PROGRESS_EVENT, { detail: { error: result.error.message } }))
    })
  }
  return saved
}
