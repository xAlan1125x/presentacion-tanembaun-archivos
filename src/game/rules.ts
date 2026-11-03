import {
  GAME_IDS,
  GAME_MAX_SCORE,
  FIXED_SCORE_GAME_IDS,
  PHASE5_STATE_VERSION,
  type GameEvaluation,
  type GameId,
  type GameProgressMap,
  type Phase5State,
  type ScoreInput,
} from './types'

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value))

const createRunId = (): string => globalThis.crypto?.randomUUID?.() ?? `run-${Date.now()}-${Math.random().toString(16).slice(2)}`

function createEmptyGames(): GameProgressMap {
  return Object.fromEntries(
    GAME_IDS.map((gameId) => [gameId, { status: 'not-started', bestScore: 0, attempts: 0 }]),
  ) as GameProgressMap
}

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

export function createInitialState(playerId: string, now = new Date().toISOString(), runId = createRunId()): Phase5State {
  return { version: PHASE5_STATE_VERSION, playerId, currentRunId: runId, currentRunNumber: 1, startedAt: now, updatedAt: now, games: createEmptyGames() }
}

export function isGameUnlocked(state: Phase5State, gameId: GameId): boolean {
  const index = GAME_IDS.indexOf(gameId)
  return index === 0 || GAME_IDS.slice(0, index).every((previousId) => state.games[previousId].status === 'completed')
}

export function isCurrentRunComplete(state: Phase5State): boolean {
  return GAME_IDS.every((gameId) => state.games[gameId].status === 'completed')
}

function completedRun(state: Phase5State, completedAt: string) {
  const scores = Object.fromEntries(GAME_IDS.map((gameId) => [gameId, state.games[gameId].bestScore])) as Record<GameId, number>
  const fixedScore = FIXED_SCORE_GAME_IDS.reduce((sum, gameId) => sum + scores[gameId], 0)
  const factoryScore = scores['escape-room']
  return { runId: state.currentRunId, runNumber: state.currentRunNumber, scores, fixedGamesScore: fixedScore, factoryScore, totalScore: fixedScore + factoryScore, completedAt }
}

export function recordEvaluation(
  state: Phase5State,
  gameId: GameId,
  evaluation: GameEvaluation,
  now = new Date().toISOString(),
): Phase5State {
  if (state.finalizedAt || !isGameUnlocked(state, gameId) || state.games[gameId].status === 'completed') return state
  const previous = state.games[gameId]
  const maximum = gameId === 'escape-room' ? Number.MAX_SAFE_INTEGER : GAME_MAX_SCORE
  const next: Phase5State = {
    ...state,
    updatedAt: now,
    games: {
      ...state.games,
      [gameId]: {
        status: evaluation.completed ? 'completed' : 'in-progress',
        bestScore: clamp(Math.round(evaluation.score), 0, maximum),
        attempts: evaluation.completed ? 1 : 0,
        lastExplanation: evaluation.explanation,
        ...(evaluation.completed ? { completedAt: now } : {}),
      },
    },
  }
  if (!isCurrentRunComplete(next)) return next
  const summary = completedRun(next, now)
  return { ...next, bestRun: !next.bestRun || summary.totalScore > next.bestRun.totalScore ? summary : next.bestRun }
}

export function totalScore(state: Phase5State): number {
  return GAME_IDS.reduce((sum, gameId) => sum + state.games[gameId].bestScore, 0)
}

export function fixedGamesScore(state: Phase5State): number {
  return FIXED_SCORE_GAME_IDS.reduce((sum, gameId) => sum + state.games[gameId].bestScore, 0)
}

export function progressPercentage(state: Phase5State): number {
  const completed = GAME_IDS.filter((gameId) => state.games[gameId].status === 'completed').length
  return Math.round((completed / GAME_IDS.length) * 100)
}

export function resetState(state: Phase5State, now = new Date().toISOString()): Phase5State {
  return createInitialState(state.playerId, now)
}

export function resetGameProgress(state: Phase5State, gameId: GameId, now = new Date().toISOString()): Phase5State {
  void gameId
  void now
  return state
}

export function startNewRun(state: Phase5State, now = new Date().toISOString(), runId = createRunId()): Phase5State {
  if (state.finalizedAt || !isCurrentRunComplete(state)) return state
  return { ...state, currentRunId: runId, currentRunNumber: state.currentRunNumber + 1, startedAt: now, updatedAt: now, games: createEmptyGames() }
}

export function finalizeLocalParticipation(state: Phase5State, now = new Date().toISOString()): Phase5State {
  if (state.finalizedAt || !isCurrentRunComplete(state) || !state.bestRun) return state
  return { ...state, finalizedAt: now, updatedAt: now }
}
