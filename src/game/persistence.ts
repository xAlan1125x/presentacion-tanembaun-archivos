import {
  GAME_IDS,
  GAME_MAX_SCORE,
  PHASE5_STATE_VERSION,
  type CompletedRun,
  type GameId,
  type GameProgressStore,
  type GameStatus,
  type Phase5State,
  type PersistenceResult,
} from './types'

export const PHASE5_STORAGE_KEY = 'filelab:phase5:progress:v3'
export const PHASE5_PROGRESS_EVENT = 'filelab:phase5-progress-updated'

export function notifyPhase5ProgressUpdated(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PHASE5_PROGRESS_EVENT))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseCompletedRun(value: unknown): CompletedRun | undefined {
  if (!isRecord(value) || typeof value.runId !== 'string' || !Number.isInteger(value.runNumber) || Number(value.runNumber) < 1 ||
      typeof value.completedAt !== 'string' || !isRecord(value.scores)) return undefined
  const scores = {} as Record<GameId, number>
  for (const gameId of GAME_IDS) {
    const score = value.scores[gameId]
    const maximum = gameId === 'escape-room' ? Number.MAX_SAFE_INTEGER : GAME_MAX_SCORE
    if (!Number.isInteger(score) || Number(score) < 0 || Number(score) > maximum) return undefined
    scores[gameId] = Number(score)
  }
  const fixedGamesScore = GAME_IDS.slice(0, 4).reduce((sum, gameId) => sum + scores[gameId], 0)
  const factoryScore = scores['escape-room']
  const totalScore = fixedGamesScore + factoryScore
  if (value.fixedGamesScore !== fixedGamesScore || value.factoryScore !== factoryScore || value.totalScore !== totalScore) return undefined
  return { runId: value.runId, runNumber: Number(value.runNumber), scores, fixedGamesScore, factoryScore, totalScore, completedAt: value.completedAt }
}

export function parsePhase5State(value: unknown): PersistenceResult<Phase5State> {
  if (!isRecord(value) || value.version !== PHASE5_STATE_VERSION || typeof value.playerId !== 'string' ||
      typeof value.currentRunId !== 'string' || !Number.isInteger(value.currentRunNumber) || Number(value.currentRunNumber) < 1 ||
      typeof value.startedAt !== 'string' || typeof value.updatedAt !== 'string' || !isRecord(value.games)) {
    return { ok: false, error: 'El progreso guardado no tiene un formato compatible.' }
  }

  const games = {} as Phase5State['games']
  for (const gameId of GAME_IDS) {
    const game = value.games[gameId]
    const maximum = gameId === 'escape-room' ? Number.MAX_SAFE_INTEGER : GAME_MAX_SCORE
    if (!isRecord(game) || !['not-started', 'in-progress', 'completed'].includes(game.status as string) ||
        typeof game.bestScore !== 'number' || !Number.isInteger(game.bestScore) || game.bestScore < 0 || game.bestScore > maximum ||
        typeof game.attempts !== 'number' || !Number.isInteger(game.attempts) || game.attempts < 0 || game.attempts > 1 ||
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
  const bestRun = value.bestRun === undefined ? undefined : parseCompletedRun(value.bestRun)
  if (value.bestRun !== undefined && !bestRun) return { ok: false, error: 'El mejor recorrido guardado no tiene un formato compatible.' }
  if (value.finalizedAt !== undefined && typeof value.finalizedAt !== 'string') return { ok: false, error: 'La finalizaciÃ³n guardada no tiene un formato compatible.' }
  return { ok: true, value: {
    version: PHASE5_STATE_VERSION,
    playerId: value.playerId,
    currentRunId: value.currentRunId,
    currentRunNumber: Number(value.currentRunNumber),
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
    games,
    ...(bestRun ? { bestRun } : {}),
    ...(value.finalizedAt ? { finalizedAt: value.finalizedAt } : {}),
  } }
}

export function createLocalGameStore(storage: Storage, key = PHASE5_STORAGE_KEY): GameProgressStore {
  return {
    load(): PersistenceResult<Phase5State | null> {
      try {
        const raw = storage.getItem(key)
        if (raw === null) return { ok: true, value: null }
        try {
          return parsePhase5State(JSON.parse(raw))
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
