import {
  GAME_IDS,
  GAME_MAX_SCORE,
  PHASE5_STATE_VERSION,
  TOTAL_MAX_SCORE,
  type GameEvaluation,
  type GameId,
  type Phase5State,
  type ScoreInput,
} from './types'

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

export function calculateScore(input: ScoreInput): number {
  if (!Number.isFinite(input.resolutionQuality) || !Number.isFinite(input.penaltyPoints ?? 0)) return 0
  const quality = clamp(input.resolutionQuality, 0, 1)
  const penalty = Math.max(0, input.penaltyPoints ?? 0)
  const baseScore = Math.round(GAME_MAX_SCORE * quality)
  return clamp(input.completed ? baseScore - penalty : Math.min(baseScore, GAME_MAX_SCORE - 1) - penalty, 0, GAME_MAX_SCORE)
}

export function evaluateResolution(input: ScoreInput, explanation: string): GameEvaluation {
  return {
    score: calculateScore(input),
    explanation,
    completed: input.completed,
  }
}

export function createInitialState(playerId: string, now = new Date().toISOString()): Phase5State {
  const games = Object.fromEntries(
    GAME_IDS.map((gameId) => [gameId, { status: 'not-started', bestScore: 0, attempts: 0 }]),
  ) as Phase5State['games']
  return { version: PHASE5_STATE_VERSION, playerId, startedAt: now, updatedAt: now, games }
}

export function recordEvaluation(
  state: Phase5State,
  gameId: GameId,
  evaluation: GameEvaluation,
  now = new Date().toISOString(),
): Phase5State {
  const previous = state.games[gameId]
  const bestScore = Math.max(previous.bestScore, clamp(Math.round(evaluation.score), 0, GAME_MAX_SCORE))
  return {
    ...state,
    updatedAt: now,
    games: {
      ...state.games,
      [gameId]: {
        status: previous.status === 'completed' || evaluation.completed ? 'completed' : 'in-progress',
        bestScore,
        attempts: previous.attempts + 1,
        lastExplanation: evaluation.explanation,
        ...(evaluation.completed || previous.completedAt ? { completedAt: previous.completedAt ?? now } : {}),
      },
    },
  }
}

export function totalScore(state: Phase5State): number {
  return GAME_IDS.reduce((sum, gameId) => sum + state.games[gameId].bestScore, 0)
}

export function progressPercentage(state: Phase5State): number {
  return Math.round((totalScore(state) / TOTAL_MAX_SCORE) * 100)
}

export function resetState(state: Phase5State, now = new Date().toISOString()): Phase5State {
  return createInitialState(state.playerId, now)
}

export function resetGameProgress(state: Phase5State, gameId: GameId, now = new Date().toISOString()): Phase5State {
  return {
    ...state,
    updatedAt: now,
    games: {
      ...state.games,
      [gameId]: { status: 'not-started', bestScore: 0, attempts: 0 },
    },
  }
}
