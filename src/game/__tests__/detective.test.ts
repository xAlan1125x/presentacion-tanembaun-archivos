import { describe, expect, it } from 'vitest'
import {
  DIGITAL_DETECTIVE_CASE,
  createInitialState,
  evaluateInvestigation,
  resetGameProgress,
  saveDetectiveEvaluation,
} from '..'

const solution = {
  hypothesisId: 'truncated-copy',
  selectedEvidenceIds: ['report', 'source', 'creat', 'partial-write'],
}

describe('Detective digital', () => {
  it('permite construir una investigación con evidencias inspeccionables', () => {
    const report = DIGITAL_DETECTIVE_CASE.evidence.find((item) => item.id === 'report')
    const operation = DIGITAL_DETECTIVE_CASE.evidence.find((item) => item.id === 'creat')
    expect(report).toMatchObject({ kind: 'file', bytes: expect.stringContaining('43 41') })
    expect(report?.properties).toContain('35 bytes')
    expect(operation).toMatchObject({ kind: 'event', timestamp: '10:03:58' })
  })

  it('otorga 200 al diagnóstico correcto sustentado y descarta pistas engañosas', () => {
    const result = evaluateInvestigation(solution)
    expect(result).toMatchObject({ score: 200, completed: true, hypothesisCorrect: true })
    expect(result.relevantEvidenceIds).toHaveLength(4)
    expect(result.misleadingEvidenceIds).toHaveLength(0)
    expect(result.explanation).toContain('creat')
  })

  it('explica un diagnóstico incorrecto y limita el puntaje', () => {
    const result = evaluateInvestigation({ hypothesisId: 'old-backup', selectedEvidenceIds: ['backup'] })
    expect(result.score).toBe(0)
    expect(result.completed).toBe(false)
    expect(result.hypothesisCorrect).toBe(false)
    expect(result.explanation).toContain('no coincide')
  })

  it('aplica la penalización de pistas sin superar 200 puntos', () => {
    const result = evaluateInvestigation({ ...solution, revealedHintIds: ['operation', 'comparison'] })
    expect(result.score).toBe(180)
    expect(result.revealedHintIds).toEqual(['operation', 'comparison'])
  })

  it('conserva el mejor resultado y reinicia sólo Detective digital', () => {
    const state = saveDetectiveEvaluation(createInitialState('local'), evaluateInvestigation(solution))
    expect(state.games['digital-detective'].bestScore).toBe(200)
    const reset = resetGameProgress(state, 'digital-detective')
    expect(reset.games['digital-detective']).toMatchObject({ status: 'not-started', bestScore: 0, attempts: 0 })
    expect(reset.games['classify-files']).toEqual(state.games['classify-files'])
  })
})
