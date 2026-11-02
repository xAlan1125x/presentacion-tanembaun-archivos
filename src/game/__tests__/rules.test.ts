import { describe, expect, it } from 'vitest'
import { GAME_IDS, GAME_MAX_SCORE, createInitialState, evaluateResolution, progressPercentage, recordEvaluation, totalScore } from '..'

describe('contratos de progreso de fase 5', () => {
  it('crea las cinco etapas sin bloquear el avance autónomo', () => {
    const state = createInitialState('jugador-1', '2026-01-01T00:00:00.000Z')
    expect(Object.keys(state.games)).toEqual([...GAME_IDS])
    expect(Object.values(state.games).every((game) => game.status === 'not-started')).toBe(true)
  })

  it('prioriza la resolución, limita cada etapa a 200 y conserva el mejor resultado', () => {
    let state = createInitialState('jugador')
    state = recordEvaluation(state, 'classify-files', evaluateResolution({ resolutionQuality: 1, completed: true }, 'Clasificación correcta.'))
    state = recordEvaluation(state, 'classify-files', evaluateResolution({ resolutionQuality: 0.25, completed: false }, 'Revisá la clasificación.'))
    expect(state.games['classify-files']).toMatchObject({ status: 'completed', bestScore: GAME_MAX_SCORE, attempts: 2 })
    expect(totalScore(state)).toBe(GAME_MAX_SCORE)
    expect(progressPercentage(state)).toBe(20)
  })

  it('aplica penalizaciones sin permitir puntajes fuera de rango', () => {
    expect(evaluateResolution({ resolutionQuality: 1, completed: true, penaltyPoints: 50 }, 'Parcial.').score).toBe(150)
    expect(evaluateResolution({ resolutionQuality: 2, completed: true, penaltyPoints: 500 }, 'Incorrecto.').score).toBe(0)
    expect(evaluateResolution({ resolutionQuality: 1, completed: false }, 'Incompleto.').score).toBe(199)
  })
})
