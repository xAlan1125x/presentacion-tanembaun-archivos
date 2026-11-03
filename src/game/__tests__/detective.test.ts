import { describe, expect, it } from 'vitest'
import {
  DIGITAL_DETECTIVE_CASE,
  createInitialState,
  evaluateInvestigation,
  recordEvaluation,
  resetGameProgress,
  saveDetectiveEvaluation,
} from '..'

const solution = {
  hypothesisId: 'truncated-copy',
  selectedEvidenceIds: ['report', 'source', 'creat'],
}

describe('Detective digital', () => {
  it('permite construir una investigación con evidencias inspeccionables', () => {
    const report = DIGITAL_DETECTIVE_CASE.evidence.find((item) => item.id === 'report')
    const operation = DIGITAL_DETECTIVE_CASE.evidence.find((item) => item.id === 'creat')
    const backup = DIGITAL_DETECTIVE_CASE.evidence.find((item) => item.id === 'backup')
    expect(DIGITAL_DETECTIVE_CASE.evidence).toHaveLength(4)
    expect(report).toMatchObject({ kind: 'file', content: 'REGISTROS: 01, 02' })
    expect(report?.properties).toContain('faltan registros')
    expect(operation).toMatchObject({ kind: 'event', timestamp: '10:03:58' })
    expect(backup).toMatchObject({ kind: 'file', content: 'REGISTROS: 01, 02, 03' })
  })

  it('otorga 100 al diagnóstico correcto sustentado y descarta pistas engañosas', () => {
    const result = evaluateInvestigation(solution)
    expect(result).toMatchObject({ score: 100, completed: true, hypothesisCorrect: true })
    expect(result.relevantEvidenceIds).toHaveLength(3)
    expect(result.contextualEvidenceIds).toHaveLength(0)
    expect(result.misleadingEvidenceIds).toHaveLength(0)
    expect(result.explanation).toContain('creat')
  })

  it('hace que las evidencias relevantes aporten al puntaje y deja la copia como contexto opcional', () => {
    const partial = evaluateInvestigation({ hypothesisId: 'truncated-copy', selectedEvidenceIds: ['report'] })
    const withContext = evaluateInvestigation({ ...solution, selectedEvidenceIds: [...solution.selectedEvidenceIds, 'backup'] })
    expect(partial.score).toBe(60)
    expect(partial.completed).toBe(false)
    expect(withContext.score).toBe(100)
    expect(withContext.contextualEvidenceIds).toEqual(['backup'])
    expect(withContext.misleadingEvidenceIds).toHaveLength(0)
    expect(withContext.evidenceExplanations.find((item) => item.evidenceId === 'backup')?.explanation).toContain('No es necesaria')
  })

  it('explica un diagnóstico incorrecto y limita el puntaje', () => {
    const result = evaluateInvestigation({ hypothesisId: 'old-backup', selectedEvidenceIds: ['backup'] })
    expect(result.score).toBe(0)
    expect(result.completed).toBe(false)
    expect(result.hypothesisCorrect).toBe(false)
    expect(result.explanation).toContain('no coincide')
  })

  it('aplica la penalización de pistas sin superar 100 puntos', () => {
    const result = evaluateInvestigation({ ...solution, revealedHintIds: ['operation'] })
    expect(result.score).toBe(95)
    expect(result.revealedHintIds).toEqual(['operation'])
  })

  it('registra Detective sólo después de la etapa anterior y no permite reiniciarlo', () => {
    const unlocked = recordEvaluation(createInitialState('local'), 'classify-files', { score: 100, completed: true, explanation: 'Lista.' })
    const state = saveDetectiveEvaluation(unlocked, evaluateInvestigation(solution))
    expect(state.games['digital-detective'].bestScore).toBe(100)
    const reset = resetGameProgress(state, 'digital-detective')
    expect(reset.games['digital-detective']).toMatchObject({ status: 'completed', bestScore: 100, attempts: 1 })
    expect(reset.games['classify-files']).toEqual(state.games['classify-files'])
  })
})
