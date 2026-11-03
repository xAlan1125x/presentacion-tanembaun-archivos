import { describe, expect, it } from 'vitest'
import { REPAIR_CHALLENGES, RepairSystemGame, createInitialState, recordEvaluation, saveRepairEvaluation } from '..'

const unlockedState = () => (['classify-files', 'digital-detective'] as const).reduce(
  (state, gameId) => recordEvaluation(state, gameId, { score: 100, completed: true, explanation: 'Lista.' }),
  createInitialState('local'),
)

function answerAll(game: RepairSystemGame, correct: boolean) {
  REPAIR_CHALLENGES.forEach((challenge) => {
    const option = challenge.options.find((candidate) => candidate.correct === correct)!
    game.answer(option.id)
    game.advance()
  })
}

describe('Repará el sistema', () => {
  it('presenta cuatro problemas independientes con tres opciones', () => {
    const game = new RepairSystemGame()
    expect(game.snapshot().challenges).toHaveLength(4)
    expect(game.snapshot().challenges.every((challenge) => challenge.options.length === 3)).toBe(true)
    expect(game.snapshot().currentIndex).toBe(0)
    expect(REPAIR_CHALLENGES.map((challenge) => challenge.options.findIndex((option) => option.correct))).toEqual([1, 2, 0, 2])
  })

  it('permite avanzar después de una respuesta incorrecta', () => {
    const game = new RepairSystemGame()
    game.answer('open-write')
    expect(game.snapshot().feedback).toContain('No es la opción adecuada')
    expect(game.advance().currentIndex).toBe(1)
  })

  it('distribuye los 100 puntos entre las cuatro respuestas', () => {
    const game = new RepairSystemGame()
    answerAll(game, true)
    expect(game.snapshot().completed).toBe(true)
    expect(game.evaluate()).toMatchObject({ score: 100, completed: true, failedActionCount: 0 })

    const partial = new RepairSystemGame()
    REPAIR_CHALLENGES.forEach((challenge, index) => {
      const option = index === 0 ? challenge.options.find((candidate) => candidate.correct)! : challenge.options.find((candidate) => !candidate.correct)!
      partial.answer(option.id)
      partial.advance()
    })
    expect(partial.evaluate()).toMatchObject({ score: 25, completed: true, failedActionCount: 3 })
  })

  it('conserva el contrato de progreso y reinicia el cuestionario', () => {
    const game = new RepairSystemGame()
    answerAll(game, true)
    const state = saveRepairEvaluation(unlockedState(), game.evaluate())
    expect(state.games['repair-system']).toMatchObject({ bestScore: 100, status: 'completed', attempts: 1 })
    expect(game.restore()).toMatchObject({ currentIndex: 0, answers: [], completed: false })
  })

  it('recargar el estado guardado no registra otro intento y conserva el mejor puntaje', () => {
    const game = new RepairSystemGame()
    answerAll(game, true)
    const saved = saveRepairEvaluation(unlockedState(), game.evaluate())
    const reloaded = structuredClone(saved)
    expect(reloaded.games['repair-system']).toMatchObject({ attempts: 1, bestScore: 100 })

    const retry = new RepairSystemGame()
    answerAll(retry, false)
    const afterRetry = saveRepairEvaluation(reloaded, retry.evaluate())
    expect(afterRetry.games['repair-system']).toMatchObject({ attempts: 1, bestScore: 100 })
  })
})
