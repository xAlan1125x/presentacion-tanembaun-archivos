import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../service', () => ({
  getCurrentUser: vi.fn(),
  loadParticipantProgress: vi.fn(),
  updateParticipantProgress: vi.fn(),
}))

vi.mock('../client', () => ({ supabase: {} }))

import { loadParticipantProgress, updateParticipantProgress } from '../service'
import {
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

const finishedParticipant: OnlineParticipant = {
  participantId: 'participant-finished',
  sessionId: 'session-test',
  joinCode: 'A1B2C3D4',
  nickname: 'Finalizado',
  finishedAt: '2026-11-02T02:40:00.000Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('persistencia online de participantes finalizados', () => {
  it('restaura el estado remoto sin intentar modificar resultados bloqueados', async () => {
    vi.stubGlobal('window', { localStorage: createStorage() })
    vi.mocked(loadParticipantProgress).mockResolvedValue({ progress: [], error: null })

    const result = await restoreOnlineState(finishedParticipant)

    expect(result.error).toBeNull()
    expect(result.state.playerId).toBe('Finalizado')
    expect(updateParticipantProgress).not.toHaveBeenCalled()
  })

  it('omite los reintentos de sincronización después de finalizar', async () => {
    vi.stubGlobal('window', { localStorage: createStorage() })
    expect(saveOnlineParticipant(finishedParticipant).ok).toBe(true)

    await expect(retryOnlineSync()).resolves.toEqual({ error: null })
    expect(updateParticipantProgress).not.toHaveBeenCalled()
  })
})
