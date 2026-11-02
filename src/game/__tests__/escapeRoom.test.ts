import { describe, expect, it } from 'vitest'
import {
  createInitialState,
  EscapeRoomGame,
  saveEscapeRoomEvaluation,
} from '..'

function completeMission(game: EscapeRoomGame) {
  game.selectFile('archive')
  game.setAccess()
  game.openArchive()
  game.seek(7)
  game.readSecret()
  game.prepareRecovery()
  game.writeRecovery()
  game.verify()
  game.closeAll()
}

describe('EscapeRoomGame', () => {
  it('unlocks the five connected steps only after effective actions', () => {
    const game = new EscapeRoomGame()
    expect(game.snapshot().steps.map((step) => step.unlocked)).toEqual([true, false, false, false, false])
    game.selectFile('decoy')
    expect(game.snapshot().selectedFileId).toBeUndefined()
    game.selectFile('archive')
    expect(game.snapshot().steps[1].solved).toBe(false)
    game.setAccess()
    expect(game.snapshot().steps[1].solved).toBe(true)
    expect(game.snapshot().lab.engine.files.find((file) => file.id === 'archive')?.attributes.readOnly).toBe(true)
    game.openArchive()
    game.seek(7)
    game.readSecret()
    expect(game.snapshot().pendingBytes.length).toBe(8)
    expect(game.snapshot().steps[3].unlocked).toBe(true)
  })

  it('rejects invalid access and cursor operations without corrupting the mission', () => {
    const game = new EscapeRoomGame()
    expect(game.setAccess().message).toContain('Seleccioná')
    game.selectFile('archive')
    expect(game.seek(7).message).toContain('Abrí')
    game.setAccess()
    game.openArchive()
    expect(game.seek(20).message).toContain('intervalo')
    expect(game.snapshot().pendingBytes.length).toBe(0)
  })

  it('recovers the exact bytes and requires closing descriptors', () => {
    const game = new EscapeRoomGame()
    completeMission(game)
    const evaluation = game.evaluate()
    expect(evaluation.completed).toBe(true)
    expect(evaluation.score).toBe(200)
    expect(evaluation.bytesRecovered).toBe(true)
    expect(evaluation.descriptorsClosed).toBe(true)
    expect(evaluation.solvedStepIds).toHaveLength(5)
  })

  it('applies hint penalties and preserves the best result through phase contracts', () => {
    const game = new EscapeRoomGame()
    game.useHint('seek')
    completeMission(game)
    const evaluation = game.evaluate()
    expect(evaluation.score).toBe(190)
    const state = saveEscapeRoomEvaluation(createInitialState('player'), evaluation, '2026-11-01T20:00:00.000Z')
    expect(state.games['escape-room'].bestScore).toBe(190)
    expect(state.games['escape-room'].attempts).toBe(1)
  })

  it('restores only the Escape Room scenario', () => {
    const game = new EscapeRoomGame()
    completeMission(game)
    const restored = game.restore()
    expect(restored.selectedFileId).toBeUndefined()
    expect(restored.pendingBytes.length).toBe(0)
    expect(restored.actions).toHaveLength(0)
    expect(restored.lab.engine.files.find((file) => file.id === 'recovery')?.size).toBe(9)
    expect(restored.steps[0].unlocked).toBe(true)
    expect(restored.steps[1].unlocked).toBe(false)
  })
})
