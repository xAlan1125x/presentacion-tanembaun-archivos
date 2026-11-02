export const GAME_IDS = [
  'classify-files',
  'digital-detective',
  'repair-system',
  'copyfile-challenge',
  'escape-room',
] as const

export type GameId = (typeof GAME_IDS)[number]
export type GameStatus = 'not-started' | 'in-progress' | 'completed'

export const GAME_MAX_SCORE = 200
export const TOTAL_MAX_SCORE = GAME_IDS.length * GAME_MAX_SCORE
export const PHASE5_STATE_VERSION = 1

export interface GameProgress {
  status: GameStatus
  bestScore: number
  attempts: number
  lastExplanation?: string
  completedAt?: string
}

export type GameProgressMap = Record<GameId, GameProgress>

export interface Phase5State {
  version: typeof PHASE5_STATE_VERSION
  playerId: string
  startedAt: string
  updatedAt: string
  games: GameProgressMap
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
