import { describe, expect, it } from 'vitest'
import { RepairSystemGame, createInitialState, saveRepairEvaluation } from '..'

function solve(game: RepairSystemGame) {
  game.setReadOnly(false)
  game.openProtected()
  game.writeProtected()
  game.invalidRead()
  game.openRecords()
  game.readRecords()
  game.openSequence()
  game.seekSequence()
  game.readSequence()
  game.closeAll()
}

describe('Repará el sistema', () => {
  it('usa operaciones reales y exige la secuencia completa para ganar', () => {
    const game = new RepairSystemGame()
    game.writeProtected()
    expect(game.snapshot().solvedChallengeIds).not.toContain('permissions')
    solve(game)
    expect(game.snapshot().completed).toBe(true)
    expect(game.evaluate()).toMatchObject({ score: 200, completed: true })
  })

  it('registra permisos insuficientes, descriptor inválido y cursor incorrecto', () => {
    const game = new RepairSystemGame()
    game.openProtected()
    const afterOpen = game.snapshot()
    expect(afterOpen.actions.at(-1)?.ok).toBe(false)
    game.invalidRead()
    game.readRecords()
    game.readSequence()
    expect(game.snapshot().actions.filter((action) => !action.ok)).toHaveLength(4)
    expect(game.evaluate().score).toBe(0)
  })

  it('aplica pistas y conserva el mejor resultado en el contrato de fase 5', () => {
    const game = new RepairSystemGame()
    solve(game)
    game.useHint('permissions')
    const evaluation = game.evaluate()
    expect(evaluation.score).toBe(190)
    const state = saveRepairEvaluation(createInitialState('local'), evaluation)
    expect(state.games['repair-system'].bestScore).toBe(190)
  })

  it('restaura el escenario y elimina estado transitorio', () => {
    const game = new RepairSystemGame()
    game.setReadOnly(false)
    game.openProtected()
    expect(game.restore().actions).toHaveLength(0)
    expect(game.snapshot().lab.engine.files.find((file) => file.id === 'protected')?.attributes.readOnly).toBe(true)
  })
})
