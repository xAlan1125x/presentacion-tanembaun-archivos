import { describe, expect, it } from 'vitest'
import { GAME_IDS, createInitialState, evaluateResolution, finalizeLocalParticipation, isGameUnlocked, progressPercentage, recordEvaluation, startNewRun, totalScore } from '..'

const result = (score: number) => ({ score, completed: true, explanation: `Resultado ${score}.` })

function completeRun(scores = [90, 80, 70, 60, 125]) {
  return GAME_IDS.reduce((state, gameId, index) => recordEvaluation(state, gameId, result(scores[index])), createInitialState('jugador', '2026-01-01T00:00:00.000Z', 'run-1'))
}

describe('recorridos de Operación Rescate', () => {
  it('habilita las cinco etapas en orden', () => {
    let state = createInitialState('jugador-1', '2026-01-01T00:00:00.000Z', 'run-1')
    expect(isGameUnlocked(state, 'classify-files')).toBe(true)
    expect(isGameUnlocked(state, 'digital-detective')).toBe(false)
    expect(recordEvaluation(state, 'digital-detective', result(100))).toBe(state)
    state = recordEvaluation(state, 'classify-files', result(100))
    expect(isGameUnlocked(state, 'digital-detective')).toBe(true)
    expect(progressPercentage(state)).toBe(20)
  })

  it('conserva un único resultado definitivo por etapa', () => {
    let state = createInitialState('jugador')
    state = recordEvaluation(state, 'classify-files', result(80))
    expect(recordEvaluation(state, 'classify-files', result(100))).toBe(state)
    expect(state.games['classify-files']).toMatchObject({ status: 'completed', bestScore: 80, attempts: 1 })
  })

  it('crea un nuevo recorrido sin mezclar resultados y conserva el mejor completo', () => {
    const completed = completeRun()
    expect(totalScore(completed)).toBe(425)
    expect(completed.bestRun).toMatchObject({ totalScore: 425, fixedGamesScore: 300, factoryScore: 125 })
    const next = startNewRun(completed, '2026-01-02T00:00:00.000Z', 'run-2')
    expect(next).toMatchObject({ currentRunNumber: 2, currentRunId: 'run-2' })
    expect(totalScore(next)).toBe(0)
    expect(next.bestRun?.totalScore).toBe(425)
  })

  it('finalizar bloquea nuevos recorridos y modificaciones', () => {
    const finalized = finalizeLocalParticipation(completeRun(), '2026-01-03T00:00:00.000Z')
    expect(finalized.finalizedAt).toBe('2026-01-03T00:00:00.000Z')
    expect(startNewRun(finalized)).toBe(finalized)
    expect(recordEvaluation(finalized, 'escape-room', result(999))).toBe(finalized)
  })

  it('aplica penalizaciones sin permitir puntajes fijos fuera de rango', () => {
    expect(evaluateResolution({ resolutionQuality: 1, completed: true, penaltyPoints: 50 }, 'Parcial.').score).toBe(50)
    expect(evaluateResolution({ resolutionQuality: 2, completed: true, penaltyPoints: 500 }, 'Incorrecto.').score).toBe(0)
  })
})
