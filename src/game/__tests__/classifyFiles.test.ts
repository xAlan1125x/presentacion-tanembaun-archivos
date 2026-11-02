import { describe, expect, it } from 'vitest'
import { CLASSIFIABLE_FILES, createInitialState, evaluateClassifications, resetGameProgress, saveClassificationEvaluation } from '..'

const correctAnswers = Object.fromEntries(CLASSIFIABLE_FILES.map((file) => [file.id, file.target]))

describe('Clasificá los archivos', () => {
  it('evalúa correctamente tipo, formato y estructura sin mezclarlos', () => {
    const result = evaluateClassifications(correctAnswers)
    expect(result).toMatchObject({ score: 200, completed: true, answeredFields: 18, totalFields: 18 })
    expect(result.checks.every((check) => check.correct)).toBe(true)
  })

  it('explica el error de una extensión engañosa', () => {
    const result = evaluateClassifications({ photo: { type: 'regular', format: 'text', structure: 'bytes' } })
    expect(result.score).toBe(22)
    expect(result.checks.find((check) => check.fileId === 'photo')?.mistakes).toContain('El formato esperado es “binary”, no “text”.')
    expect(result.explanation).toContain('Cambiar .jpg por .txt no modifica los bytes.')
  })

  it('mantiene coherentes los tres registros fijos con los 12 bytes mostrados', () => {
    const students = CLASSIFIABLE_FILES.find((file) => file.id === 'students')
    expect(students?.bytes.split(' ')).toHaveLength(12)
    expect(students?.properties).toContain('12 bytes')
  })

  it('guarda el mejor resultado y reinicia sólo esta etapa', () => {
    const state = saveClassificationEvaluation(createInitialState('local'), evaluateClassifications(correctAnswers))
    expect(state.games['classify-files'].bestScore).toBe(200)
    const reset = resetGameProgress(state, 'classify-files')
    expect(reset.games['classify-files']).toMatchObject({ status: 'not-started', bestScore: 0, attempts: 0 })
    expect(reset.games['digital-detective']).toEqual(state.games['digital-detective'])
  })
})
