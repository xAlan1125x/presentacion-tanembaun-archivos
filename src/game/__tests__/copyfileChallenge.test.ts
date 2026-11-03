import { describe, expect, it } from 'vitest'
import {
  CopyfileChallenge,
  createInitialState,
  recordEvaluation,
  saveCopyChallengeEvaluation,
} from '..'

function completeCopy(game: CopyfileChallenge) {
  game.openSource()
  game.prepareDestination()
  for (let block = 0; block < 4; block += 1) {
    game.read()
    while (game.snapshot().pendingBytes.length > 0) game.write()
  }
  game.read()
  game.closeSource()
  game.closeDestination()
}

describe('CopyfileChallenge', () => {
  it('requires valid descriptors and reports controlled errors', () => {
    const game = new CopyfileChallenge()
    expect(game.read().message).toContain('Abrí el origen')
    game.openSource()
    game.prepareDestination()
    expect(game.writeWrongCount().message).toContain('bytes pendientes')
    game.read()
    expect(game.writeWrongCount().message).toContain('Error controlado')
    expect(game.snapshot().pendingBytes.length).toBe(4096)
  })

  it('handles partial writes and the final 1308-byte block', () => {
    const game = new CopyfileChallenge()
    game.openSource()
    game.prepareDestination()
    game.read()
    expect(game.snapshot().pendingBytes.length).toBe(4096)
    game.write()
    expect(game.snapshot().pendingBytes.length).toBe(2048)
    game.write()
    expect(game.snapshot().pendingBytes.length).toBe(0)
    game.read()
    while (game.snapshot().pendingBytes.length > 0) game.write()
    game.read()
    expect(game.snapshot().pendingBytes.length).toBe(1308)
    while (game.snapshot().pendingBytes.length > 0) game.write()
    game.read()
    expect(game.snapshot().eofReached).toBe(true)
  })

  it('only completes when bytes match, EOF is reached and descriptors are closed', () => {
    const game = new CopyfileChallenge()
    game.openSource()
    game.prepareDestination()
    expect(game.evaluate().completed).toBe(false)
    completeCopy(game)
    const evaluation = game.evaluate()
    expect(evaluation.completed).toBe(true)
    expect(evaluation.score).toBe(100)
    expect(evaluation.bytesMatch).toBe(true)
    expect(evaluation.descriptorsClosed).toBe(true)
  })

  it('applies hint penalties and preserves the best result through the existing contract', () => {
    const game = new CopyfileChallenge()
    game.useHint('partial')
    completeCopy(game)
    const evaluation = game.evaluate()
    expect(evaluation.score).toBe(95)
    const unlocked = (['classify-files', 'digital-detective', 'repair-system'] as const).reduce(
      (state, gameId) => recordEvaluation(state, gameId, { score: 100, completed: true, explanation: 'Lista.' }),
      createInitialState('player'),
    )
    const state = saveCopyChallengeEvaluation(unlocked, evaluation, '2025-01-01T00:00:00.000Z')
    expect(state.games['copyfile-challenge'].bestScore).toBe(95)
    expect(state.games['copyfile-challenge'].attempts).toBe(1)
  })

  it('restores an independent initial scenario', () => {
    const game = new CopyfileChallenge()
    game.openSource()
    game.prepareDestination()
    game.read()
    const restored = game.restore()
    expect(restored.sourceDescriptor).toBeUndefined()
    expect(restored.destinationDescriptor).toBeUndefined()
    expect(restored.pendingBytes.length).toBe(0)
    expect(restored.lab.engine.files.find((file) => file.id === 'destination')?.size).toBe(12)
  })
})
