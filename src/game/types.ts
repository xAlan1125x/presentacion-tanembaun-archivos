export const GAME_IDS = [
  'classify-files',
  'digital-detective',
  'repair-system',
  'copyfile-challenge',
  'escape-room',
] as const

export type GameId = (typeof GAME_IDS)[number]
export type GameStatus = 'not-started' | 'in-progress' | 'completed'

export const GAME_MAX_SCORE = 100
export const FIXED_SCORE_GAME_IDS = GAME_IDS.slice(0, 4) as readonly GameId[]
export const FIXED_GAMES_MAX_SCORE = 400
export const PHASE5_STATE_VERSION = 3

export interface GameProgress {
  status: GameStatus
  /** Resultado de esta etapa dentro del recorrido actual; no es un mejor histórico individual. */
  bestScore: number
  /** 0 mientras no hay resultado definitivo y 1 cuando la etapa fue evaluada. */
  attempts: number
  lastExplanation?: string
  completedAt?: string
}

export type GameProgressMap = Record<GameId, GameProgress>

export interface CompletedRun {
  runId: string
  runNumber: number
  scores: Record<GameId, number>
  fixedGamesScore: number
  factoryScore: number
  totalScore: number
  completedAt: string
}

export interface Phase5State {
  version: typeof PHASE5_STATE_VERSION
  playerId: string
  currentRunId: string
  currentRunNumber: number
  startedAt: string
  updatedAt: string
  games: GameProgressMap
  bestRun?: CompletedRun
  finalizedAt?: string
}

export interface GameEvaluation {
  score: number
  explanation: string
  completed: boolean
}

export interface ScoreInput {
  /** 0..1, produced by the minigame's rules, not by the presentation layer. */
  resolutionQuality: number
  completed: boolean
  penaltyPoints?: number
}

export interface PersistenceSuccess<T> {
  ok: true
  value: T
}

export interface PersistenceFailure {
  ok: false
  error: string
}

export type PersistenceResult<T> = PersistenceSuccess<T> | PersistenceFailure

export interface GameProgressStore {
  load(): PersistenceResult<Phase5State | null>
  save(state: Phase5State): PersistenceResult<void>
  clear(): PersistenceResult<void>
}
