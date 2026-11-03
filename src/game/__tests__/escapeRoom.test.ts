import { describe, expect, it } from 'vitest'
import { CHAOS_REQUESTS, EscapeRoomGame, saveEscapeRoomEvaluation } from '../escapeRoom'
import { createInitialState, recordEvaluation, totalScore } from '../rules'

describe('Caos en el sistema de archivos', () => {
  it('presenta tres procesos, dos archivos y 90 segundos', () => {
    const snapshot = new EscapeRoomGame().snapshot()
    expect(snapshot.processes).toHaveLength(3)
    expect(snapshot.files).toHaveLength(2)
    expect(snapshot.remainingSeconds).toBe(90)
    expect(snapshot.totalRequests).toBe(9)
  })

  it('asigna, espera y libera un archivo exclusivo', () => {
    const game = new EscapeRoomGame()
    game.assign('p1', 'informe.dat')
    game.tick(5)
    let snapshot = game.snapshot()
    expect(snapshot.processes.find((process) => process.id === 'p3')?.status).toBe('waiting')
    expect(snapshot.files.find((file) => file.id === 'informe.dat')?.readyToRelease).toBe(true)

    game.release('informe.dat')
    snapshot = game.snapshot()
    expect(snapshot.completedCount).toBe(1)
    expect(snapshot.processes.find((process) => process.id === 'p3')?.status).toBe('ready')
  })

  it('penaliza asignaciones incorrectas y liberaciones prematuras', () => {
    const game = new EscapeRoomGame()
    game.assign('p1', 'registro.log')
    game.assign('p1', 'informe.dat')
    const snapshot = game.release('informe.dat')
    expect(snapshot.failedActionCount).toBe(2)
    expect(snapshot.penalties).toBe(10)
    expect(snapshot.score).toBe(0)
  })

  it('completa todas las solicitudes con un máximo de 200 puntos', () => {
    const game = new EscapeRoomGame()
    for (const request of CHAOS_REQUESTS) {
      const now = game.snapshot().elapsedSeconds
      if (request.availableAt > now) game.tick(request.availableAt - now)
      game.assign(request.processId, request.fileId)
      game.tick(request.duration)
      game.release(request.fileId)
    }
    const snapshot = game.snapshot()
    expect(snapshot.finished).toBe(true)
    expect(snapshot.completedCount).toBe(9)
    expect(snapshot.score).toBe(200)
  })

  it('finaliza al vencer el tiempo y reinicia sin conservar el intento', () => {
    const game = new EscapeRoomGame()
    expect(game.tick(90).finished).toBe(true)
    const restored = game.restore()
    expect(restored.finished).toBe(false)
    expect(restored.remainingSeconds).toBe(90)
    expect(restored.completedCount).toBe(0)
  })

  it('registra un intento una sola vez y conserva la mejor puntuación', () => {
    const game = new EscapeRoomGame()
    game.tick(90)
    const unlocked = (['classify-files', 'digital-detective', 'repair-system', 'copyfile-challenge'] as const).reduce(
      (state, gameId) => recordEvaluation(state, gameId, { score: 100, completed: true, explanation: 'Lista.' }),
      createInitialState('test-player'),
    )
    const once = saveEscapeRoomEvaluation(unlocked, game.evaluate())
    expect(once.games['escape-room']?.attempts).toBe(1)
    expect(once.games['escape-room']?.bestScore).toBe(0)
    expect(totalScore(once)).toBe(400)
  })
})
