import { afterEach, describe, expect, it, vi } from 'vitest'
import { GAME_IDS, createInitialState, recordEvaluation, startNewRun } from '../../game'

vi.mock('../service', () => ({
  finalizeParticipant: vi.fn(),
  getCurrentUser: vi.fn(),
  loadParticipantRunState: vi.fn(),
  saveParticipantRunState: vi.fn(),
}))

vi.mock('../client', () => ({ supabase: {} }))

import { finalizeParticipant, getCurrentUser, loadParticipantRunState, saveParticipantRunState } from '../service'
import {
  createActiveGameStore,
  finalizeOnlineParticipation,
  restoreOnlineState,
  retryOnlineSync,
  saveOnlineParticipant,
  type OnlineParticipant,
} from '../participant'

function createStorage(): Storage {
  const values = new Map<string, string>()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key) },
    setItem: (key, value) => { values.set(key, value) },
  }
}

const participant = (extra: Partial<OnlineParticipant> = {}): OnlineParticipant => ({
  participantId: 'participant-v3',
  sessionId: 'session-v3',
  joinCode: 'A1B2C3D4',
  nickname: 'Ada',
  rulesVersion: 3,
  ...extra,
})

const completeFirstStage = (state = createInitialState('Ada', '2026-11-03T00:00:00.000Z', 'run-1')) =>
  recordEvaluation(state, 'classify-files', { score: 90, completed: true, explanation: 'Lista.' }, '2026-11-03T00:01:00.000Z')

const completeRun = () => GAME_IDS.reduce(
  (state, gameId, index) => recordEvaluation(state, gameId, { score: index === 4 ? 125 : 90, completed: true, explanation: 'Lista.' }),
  createInitialState('Ada', '2026-11-03T00:00:00.000Z', 'run-complete'),
)

function prepareWindow(identity: OnlineParticipant) {
  vi.stubGlobal('window', { localStorage: createStorage() })
  expect(saveOnlineParticipant(identity).ok).toBe(true)
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('recorridos v3 online', () => {
  it('restaura un participante finalizado sin intentar modificarlo', async () => {
    const identity = participant({ finishedAt: '2026-11-03T02:40:00.000Z' })
    const remote = { ...completeFirstStage(), finalizedAt: identity.finishedAt }
    prepareWindow(identity)
    vi.mocked(loadParticipantRunState).mockResolvedValue({ state: remote, error: null })

    const result = await restoreOnlineState(identity)

    expect(result.state.finalizedAt).toBe(identity.finishedAt)
    expect(saveParticipantRunState).not.toHaveBeenCalled()
  })

  it('sube el progreso local pendiente al reconectarse y conserva la respuesta canónica', async () => {
    const identity = participant()
    const local = completeFirstStage()
    const canonical = { ...local, updatedAt: '2026-11-03T00:02:00.000Z' }
    prepareWindow(identity)
    createActiveGameStore().save(local)
    vi.mocked(loadParticipantRunState).mockResolvedValue({ state: createInitialState('Ada', local.startedAt, 'server-run'), error: null })
    vi.mocked(saveParticipantRunState).mockResolvedValue({ state: canonical, error: null })

    const result = await restoreOnlineState(identity)

    expect(saveParticipantRunState).toHaveBeenCalledWith(identity.participantId, local)
    expect(result.state).toEqual(canonical)
    expect(createActiveGameStore().load()).toEqual({ ok: true, value: canonical })
  })

  it('recupera el servidor si un estado local obsoleto intenta repetir un recorrido', async () => {
    const identity = participant()
    const stale = createInitialState('Ada', '2026-11-03T00:00:00.000Z', 'old-run')
    const remote = completeFirstStage(createInitialState('Ada', '2026-11-03T01:00:00.000Z', 'new-run'))
    prepareWindow(identity)
    createActiveGameStore().save(stale)
    vi.mocked(loadParticipantRunState).mockResolvedValue({ state: remote, error: null })
    vi.mocked(saveParticipantRunState).mockResolvedValue({ state: null, error: new Error('invalid new run transition') })

    const result = await restoreOnlineState(identity)

    expect(result.state.currentRunId).toBe('new-run')
    expect(result.error?.message).toContain('invalid new run')
  })

  it('sincroniza un reintento completo sin combinar los resultados anteriores', async () => {
    const identity = participant()
    const completed = completeRun()
    const nextRun = startNewRun(completed, '2026-11-03T01:00:00.000Z', 'run-2')
    prepareWindow(identity)
    createActiveGameStore().save(nextRun)
    vi.mocked(loadParticipantRunState).mockResolvedValue({ state: completed, error: null })
    vi.mocked(saveParticipantRunState).mockResolvedValue({ state: nextRun, error: null })

    const result = await restoreOnlineState(identity)

    expect(result.state.currentRunNumber).toBe(2)
    expect(result.state.games['classify-files'].bestScore).toBe(0)
    expect(result.state.bestRun?.totalScore).toBe(completed.bestRun?.totalScore)
  })

  it('mantiene las partidas antiguas separadas sin leer ni escribir recorridos v3', async () => {
    const legacy = participant({ rulesVersion: 1 })
    prepareWindow(legacy)

    const result = await restoreOnlineState(legacy)

    expect(result.error?.message).toContain('escala anterior')
    expect(loadParticipantRunState).not.toHaveBeenCalled()
    expect(saveParticipantRunState).not.toHaveBeenCalled()
  })

  it('finaliza remotamente, persiste el bloqueo y no vuelve a sincronizar', async () => {
    const identity = participant()
    const state = completeRun()
    prepareWindow(identity)
    vi.mocked(getCurrentUser).mockResolvedValue({ user: { is_anonymous: true } as never, error: null })
    vi.mocked(saveParticipantRunState).mockResolvedValue({ state, error: null })
    vi.mocked(finalizeParticipant).mockResolvedValue({ finishedAt: '2026-11-03T03:00:00.000Z', error: null })

    const result = await finalizeOnlineParticipation(state)

    expect(result.error).toBeNull()
    expect(result.state.finalizedAt).toBe('2026-11-03T03:00:00.000Z')
    expect(finalizeParticipant).toHaveBeenCalledWith(identity.participantId)
    vi.clearAllMocks()
    await expect(retryOnlineSync()).resolves.toEqual({ error: null })
    expect(saveParticipantRunState).not.toHaveBeenCalled()
  })
})
