import { evaluateResolution, recordEvaluation } from './rules'
import type { GameEvaluation, Phase5State } from './types'

export type ClassifiedFileType = 'regular' | 'character-special' | 'block-special'
export type ClassifiedFormat = 'text' | 'binary' | 'not-applicable'
export type ClassifiedStructure = 'bytes' | 'records' | 'tree' | 'not-applicable'

export interface Classification {
  type: ClassifiedFileType
  format: ClassifiedFormat
  structure: ClassifiedStructure
}

export interface ClassifiableFile {
  id: string
  name: string
  description: string
  bytes: string
  header: string
  properties: string[]
  target: Classification
  explanation: string
}

export const CLASSIFIABLE_FILES: ClassifiableFile[] = [
  {
    id: 'notes',
    name: 'notas.txt',
    description: 'Un apunte legible con una extensión confiable.',
    bytes: '4E 6F 74 61 73 0A',
    header: 'ASCII: "Notas\\n"',
    properties: ['regular', '6 bytes', 'legible'],
    target: { type: 'regular', format: 'text', structure: 'bytes' },
    explanation: 'Es regular porque conserva datos de usuario; su formato es texto y se interpreta como una secuencia de bytes.',
  },
  {
    id: 'photo',
    name: 'foto.txt',
    description: 'Su nombre engaña: la cabecera revela una imagen JPEG.',
    bytes: 'FF D8 FF E0 00 10 4A 46',
    header: 'FF D8 FF · firma JPEG',
    properties: ['regular', '8 bytes', 'cabecera binaria'],
    target: { type: 'regular', format: 'binary', structure: 'bytes' },
    explanation: 'Cambiar .jpg por .txt no modifica los bytes. La evidencia de la cabecera indica contenido binario aunque el nombre diga .txt.',
  },
  {
    id: 'terminal',
    name: 'terminal0',
    description: 'Flujo de caracteres producido por un dispositivo.',
    bytes: 'flujo externo',
    header: 'sin contenido persistente propio',
    properties: ['dispositivo', 'flujo', 'E/S de caracteres'],
    target: { type: 'character-special', format: 'not-applicable', structure: 'not-applicable' },
    explanation: 'Es especial de caracteres: representa un flujo de E/S. No se clasifica como texto regular sólo porque transporte caracteres.',
  },
]

export type ClassificationAnswers = Record<string, Partial<Classification>>

export interface ClassificationCheck {
  fileId: string
  correct: boolean
  mistakes: string[]
  explanation: string
}

export interface ClassificationEvaluation extends GameEvaluation {
  checks: ClassificationCheck[]
  answeredFields: number
  totalFields: number
}

const labels = {
  type: 'tipo',
  format: 'formato',
  structure: 'estructura',
} as const

export function evaluateClassifications(answers: ClassificationAnswers): ClassificationEvaluation {
  const checks = CLASSIFIABLE_FILES.map((file) => {
    const answer = answers[file.id] ?? {}
    const mistakes = (Object.keys(labels) as (keyof Classification)[]).filter((key) => answer[key] !== file.target[key])
      .map((key) => `El ${labels[key]} esperado es “${file.target[key]}”, no “${answer[key] ?? 'sin elegir'}”.`)
    return { fileId: file.id, correct: mistakes.length === 0, mistakes, explanation: file.explanation }
  })
  const correctFields = CLASSIFIABLE_FILES.reduce((sum, file) => {
    const answer = answers[file.id] ?? {}
    return sum + (Object.keys(labels) as (keyof Classification)[]).filter((key) => answer[key] === file.target[key]).length
  }, 0)
  const answeredFields = CLASSIFIABLE_FILES.reduce((sum, file) => {
    const answer = answers[file.id] ?? {}
    return sum + (Object.keys(labels) as (keyof Classification)[]).filter((key) => answer[key] !== undefined).length
  }, 0)
  const totalFields = CLASSIFIABLE_FILES.length * 3
  const completed = answeredFields === totalFields
  const resolutionQuality = correctFields / totalFields
  const explanation = checks.every((check) => check.correct)
    ? '¡Clasificación completa! Separaste tipo, formato y estructura usando evidencias.'
    : checks.filter((check) => !check.correct).map((check) => `${CLASSIFIABLE_FILES.find((file) => file.id === check.fileId)?.name}: ${check.mistakes.join(' ')} ${check.explanation}`).join(' ')
  return {
    ...evaluateResolution({ resolutionQuality, completed }, explanation),
    checks,
    answeredFields,
    totalFields,
  }
}

export function saveClassificationEvaluation(state: Phase5State, evaluation: ClassificationEvaluation, now?: string): Phase5State {
  return recordEvaluation(state, 'classify-files', evaluation, now)
}
