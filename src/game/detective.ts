import { evaluateResolution, recordEvaluation } from './rules'
import type { GameEvaluation, Phase5State } from './types'

export type DetectiveEvidenceKind = 'file' | 'event'

export interface DetectiveEvidence {
  id: string
  kind: DetectiveEvidenceKind
  title: string
  summary: string
  content: string
  bytes: string
  properties: string[]
  attributes: string[]
  timestamp: string
  objective: string
  relevant: boolean
}

export interface DetectiveHypothesis {
  id: string
  label: string
  explanation: string
  requiredEvidenceIds: string[]
}

export interface DetectiveHint {
  id: string
  text: string
  penaltyPoints: number
}

export interface DetectiveCase {
  title: string
  incident: string
  evidence: DetectiveEvidence[]
  hypotheses: DetectiveHypothesis[]
  hints: DetectiveHint[]
}

export const DIGITAL_DETECTIVE_CASE: DetectiveCase = {
  title: 'El informe que volvió incompleto',
  incident: 'Después de una recuperación, el equipo encontró informe-final.txt con sólo parte de los datos. ¿Qué operación dejó el archivo en ese estado?',
  evidence: [
    {
      id: 'report',
      kind: 'file',
      title: 'informe-final.txt',
      summary: 'El archivo visible para el equipo.',
      content: 'REGISTROS: 01, 02',
      bytes: 'contenido incompleto',
      properties: ['archivo regular', 'texto', 'faltan registros'],
      attributes: ['propietario: ana', 'modificado: 10:04:03', 'no bloqueado'],
      timestamp: '10:04:03',
      objective: 'El destino contiene sólo dos registros, aunque el origen tenía cuatro.',
      relevant: true,
    },
    {
      id: 'source',
      kind: 'file',
      title: 'informe-origen.txt',
      summary: 'El archivo que debía copiarse.',
      content: 'REGISTROS: 01, 02, 03, 04',
      bytes: 'contenido completo',
      properties: ['archivo regular', 'texto', 'cuatro registros'],
      attributes: ['propietario: ana', 'modificado: 09:58:10', 'sólo lectura: no'],
      timestamp: '09:58:10',
      objective: 'El origen conserva los cuatro registros y es más grande que el destino.',
      relevant: true,
    },
    {
      id: 'backup',
      kind: 'file',
      title: 'copia.bak',
      summary: 'Una copia anterior del informe.',
      content: 'REGISTROS: 01, 02, 03',
      bytes: 'contenido anterior',
      properties: ['archivo regular', 'texto', 'tres registros'],
      attributes: ['propietario: ana', 'copia previa', 'no es el destino actual'],
      timestamp: 'copia anterior',
      objective: 'La copia anterior tiene tres registros: no es una copia completa del origen, que tiene cuatro.',
      relevant: false,
    },
    {
      id: 'creat',
      kind: 'event',
      title: 'creat("informe-final.txt")',
      summary: 'La llamada abrió el destino para escritura.',
      content: 'El destino se vació antes de recibir los datos nuevos.',
      bytes: 'operación sobre el archivo',
      properties: ['operación: creat', 'prepara el destino', 'puede truncarlo'],
      attributes: ['proceso: rescate', 'resultado: éxito'],
      timestamp: '10:03:58',
      objective: 'creat crea el destino o lo deja vacío antes de la copia.',
      relevant: true,
    },
  ],
  hypotheses: [
    {
      id: 'truncated-copy',
      label: 'Se truncó el destino y la copia quedó incompleta.',
      explanation: 'El origen tenía cuatro registros, pero el destino conserva sólo dos. creat dejó el destino vacío antes de la copia y por eso el archivo quedó incompleto.',
      requiredEvidenceIds: ['report', 'source', 'creat'],
    },
    {
      id: 'extension-corruption',
      label: 'La extensión .txt convirtió los datos en texto.',
      explanation: 'La extensión sólo es parte del nombre. No explica que falten registros en el destino.',
      requiredEvidenceIds: ['report'],
    },
    {
      id: 'old-backup',
      label: 'La copia .bak fue restaurada completa.',
      explanation: 'copia.bak tiene tres registros y el origen tiene cuatro, así que no es una copia completa. Además, el destino actual sólo conserva dos.',
      requiredEvidenceIds: ['backup'],
    },
  ],
  hints: [
    { id: 'operation', text: 'Compará los registros: el origen tiene cuatro, el destino sólo dos. Buscá qué operación vacía el destino antes de copiar.', penaltyPoints: 5 },
  ],
}

export interface DetectiveAnswers {
  selectedEvidenceIds: string[]
  hypothesisId?: string
  revealedHintIds?: string[]
}

export interface DetectiveEvaluation extends GameEvaluation {
  selectedEvidenceIds: string[]
  relevantEvidenceIds: string[]
  missingEvidenceIds: string[]
  contextualEvidenceIds: string[]
  misleadingEvidenceIds: string[]
  evidenceExplanations: DetectiveEvidenceExplanation[]
  hypothesisCorrect: boolean
  revealedHintIds: string[]
}

export interface DetectiveEvidenceExplanation {
  evidenceId: string
  title: string
  relevant: boolean
  explanation: string
}

export function evaluateInvestigation(answers: DetectiveAnswers): DetectiveEvaluation {
  const solution = DIGITAL_DETECTIVE_CASE.hypotheses[0]
  const selected = new Set(answers.selectedEvidenceIds)
  const required = new Set(solution.requiredEvidenceIds)
  const relevantEvidenceIds = answers.selectedEvidenceIds.filter((id) => required.has(id))
  const missingEvidenceIds = solution.requiredEvidenceIds.filter((id) => !selected.has(id))
  const contextualEvidenceIds = answers.selectedEvidenceIds.filter((id) => {
    const evidence = DIGITAL_DETECTIVE_CASE.evidence.find((item) => item.id === id)
    return !required.has(id) && evidence?.relevant === false
  })
  const misleadingEvidenceIds = answers.selectedEvidenceIds.filter((id) => !required.has(id) && !contextualEvidenceIds.includes(id))
  const evidenceExplanations = DIGITAL_DETECTIVE_CASE.evidence.map((evidence) => ({
    evidenceId: evidence.id,
    title: evidence.title,
    relevant: required.has(evidence.id),
    explanation: required.has(evidence.id)
      ? `Es relevante: ${evidence.objective}`
      : evidence.relevant === false
        ? `Es contextual y opcional: ${evidence.objective} No es necesaria para la causa correcta.`
        : `No es necesaria para la causa correcta: ${evidence.objective}`,
  }))
  const hypothesisCorrect = answers.hypothesisId === solution.id
  const evidenceQuality = relevantEvidenceIds.length / solution.requiredEvidenceIds.length
  const hypothesisQuality = hypothesisCorrect ? 0.4 : 0
  const quality = hypothesisQuality + evidenceQuality * 0.6
  const revealedHintIds = answers.revealedHintIds ?? []
  const penaltyPoints = DIGITAL_DETECTIVE_CASE.hints
    .filter((hint) => revealedHintIds.includes(hint.id))
    .reduce((sum, hint) => sum + hint.penaltyPoints, 0)
  const completed = Boolean(answers.hypothesisId) && relevantEvidenceIds.length === solution.requiredEvidenceIds.length
  const explanation = hypothesisCorrect
    ? `${solution.explanation}${missingEvidenceIds.length ? ` Falta incorporar: ${missingEvidenceIds.join(', ')}.` : ''}${misleadingEvidenceIds.length ? ` Estas pistas no sostienen el diagnóstico: ${misleadingEvidenceIds.join(', ')}.` : ''}`
    : 'El diagnóstico no coincide con la secuencia objetiva del registro. Compará tamaños, bytes y operaciones antes de concluir.'
  return {
    ...evaluateResolution({ resolutionQuality: quality, completed, penaltyPoints }, explanation),
    selectedEvidenceIds: answers.selectedEvidenceIds,
    relevantEvidenceIds,
    missingEvidenceIds,
    contextualEvidenceIds,
    misleadingEvidenceIds,
    evidenceExplanations,
    hypothesisCorrect,
    revealedHintIds,
  }
}

export function saveDetectiveEvaluation(state: Phase5State, evaluation: DetectiveEvaluation, now?: string): Phase5State {
  return recordEvaluation(state, 'digital-detective', evaluation, now)
}
