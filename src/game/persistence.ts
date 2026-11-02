import {
  GAME_IDS,
  GAME_MAX_SCORE,
  PHASE5_STATE_VERSION,
  type GameProgressStore,
  type GameStatus,
  type Phase5State,
  type PersistenceResult,
} from './types'

export const PHASE5_STORAGE_KEY = 'filelab:phase5:progress:v1'
export const PHASE5_PROGRESS_EVENT = 'filelab:phase5-progress-updated'

export function notifyPhase5ProgressUpdated(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PHASE5_PROGRESS_EVENT))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseState(value: unknown): PersistenceResult<Phase5State> {
  if (!isRecord(value) || value.version !== PHASE5_STATE_VERSION || typeof value.playerId !== 'string' ||
      typeof value.startedAt !== 'string' || typeof value.updatedAt !== 'string' || !isRecord(value.games)) {
    return { ok: false, error: 'El progreso guardado no tiene un formato compatible.' }
  }

  const games = {} as Phase5State['games']
  for (const gameId of GAME_IDS) {
    const game = value.games[gameId]
    if (!isRecord(game) || !['not-started', 'in-progress', 'completed'].includes(game.status as string) ||
        typeof game.bestScore !== 'number' || !Number.isInteger(game.bestScore) || game.bestScore < 0 || game.bestScore > GAME_MAX_SCORE ||
        typeof game.attempts !== 'number' || !Number.isInteger(game.attempts) || game.attempts < 0 ||
        (game.lastExplanation !== undefined && typeof game.lastExplanation !== 'string') ||
        (game.completedAt !== undefined && typeof game.completedAt !== 'string')) {
      return { ok: false, error: `El progreso de ${gameId} no tiene un formato compatible.` }
    }
    games[gameId] = {
      status: game.status as GameStatus,
      bestScore: game.bestScore,
      attempts: game.attempts,
      ...(game.lastExplanation !== undefined ? { lastExplanation: game.lastExplanation } : {}),
      ...(game.completedAt !== undefined ? { completedAt: game.completedAt } : {}),
    }
  }
  return { ok: true, value: { version: PHASE5_STATE_VERSION, playerId: value.playerId, startedAt: value.startedAt, updatedAt: value.updatedAt, games } }
}

export function createLocalGameStore(storage: Storage, key = PHASE5_STORAGE_KEY): GameProgressStore {
  return {
    load(): PersistenceResult<Phase5State | null> {
      try {
        const raw = storage.getItem(key)
        if (raw === null) return { ok: true, value: null }
        try {
          return parseState(JSON.parse(raw))
        } catch {
          return { ok: false, error: 'El progreso guardado no contiene JSON válido.' }
        }
      } catch {
        return { ok: false, error: 'No se pudo leer el progreso local.' }
      }
    },
    save(state) {
      try {
        storage.setItem(key, JSON.stringify(state))
        return { ok: true, value: undefined }
      } catch {
        return { ok: false, error: 'No se pudo guardar el progreso local.' }
      }
    },
    clear() {
      try {
        storage.removeItem(key)
        return { ok: true, value: undefined }
      } catch {
        return { ok: false, error: 'No se pudo borrar el progreso local.' }
      }
    },
  }
}
