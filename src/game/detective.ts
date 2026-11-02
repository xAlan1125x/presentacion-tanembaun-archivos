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
      content: 'CABECERA: RESCATE\\nREGISTROS: 01, 02',
      bytes: '43 41 42 45 43 45 52 41 3A 20 52 45 53 43 41 54 45 0A 52 45 47 49 53 54 52 4F 53 3A 20 30 31 2C 20 30 32',
      properties: ['regular', 'texto ASCII', '35 bytes'],
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
      content: 'CABECERA: RESCATE\\nREGISTROS: 01, 02, 03, 04',
      bytes: '43 41 42 45 43 45 52 41 3A 20 52 45 53 43 41 54 45 0A 52 45 47 49 53 54 52 4F 53 3A 20 30 31 2C 20 30 32 2C 20 30 33 2C 20 30 34',
      properties: ['regular', 'texto ASCII', '43 bytes'],
      attributes: ['propietario: ana', 'modificado: 09:58:10', 'sólo lectura: no'],
      timestamp: '09:58:10',
      objective: 'El origen conserva los cuatro registros y es más grande que el destino.',
      relevant: true,
    },
    {
      id: 'backup',
      kind: 'file',
      title: 'informe-final.bak',
      summary: 'Una copia anterior con nombre parecido.',
      content: 'CABECERA: RESCATE\\nREGISTROS: 01, 02, 03',
      bytes: '43 41 42 45 43 45 52 41 3A 20 52 45 53 43 41 54 45 0A 52 45 47 49 53 54 52 4F 53 3A 20 30 31 2C 20 30 32 2C 20 30 33',
      properties: ['regular', 'texto ASCII', '39 bytes'],
      attributes: ['propietario: ana', 'oculto: sí', 'modificado: 08:20:00'],
      timestamp: '08:20:00',
      objective: 'Es una copia vieja; explica una pista engañosa, pero no el estado actual del destino.',
      relevant: false,
    },
    {
      id: 'creat',
      kind: 'event',
      title: 'creat("informe-final.txt")',
      summary: 'La llamada abrió el destino para escritura.',
      content: 'El destino se truncó antes de recibir nuevos bytes. Descriptor devuelto: 4.',
      bytes: 'operación de metadatos',
      properties: ['operación: creat', 'modo: escritura', 'fd: 4'],
      attributes: ['proceso: rescate', 'resultado: éxito'],
      timestamp: '10:03:58',
      objective: 'creat crea o trunca y deja abierto el destino; no es equivalente a create.',
      relevant: true,
    },
    {
      id: 'partial-write',
      kind: 'event',
      title: 'write(fd=4, 43 bytes)',
      summary: 'La escritura transfirió sólo el primer bloque.',
      content: 'bytes solicitados: 43 · bytes transferidos: 35 · posición: 0 → 35',
      bytes: '35 bytes transferidos',
      properties: ['operación: write', 'solicitados: 43', 'transferidos: 35'],
      attributes: ['proceso: rescate', 'resultado: éxito parcial del ciclo'],
      timestamp: '10:04:03',
      objective: 'La llamada escribió un bloque, pero el registro muestra que el ciclo no continuó con el resto del origen.',
      relevant: true,
    },
    {
      id: 'rename',
      kind: 'event',
      title: 'rename("informe-final.bak", "informe-final.txt")',
      summary: 'Una acción de mantenimiento cambió un nombre.',
      content: 'El identificador del archivo no cambia; sólo cambia el nombre visible.',
      bytes: 'sin modificación de contenido',
      properties: ['operación: rename', 'origen: informe-final.bak', 'destino: informe-final.txt'],
      attributes: ['proceso: mantenimiento', 'resultado: éxito'],
      timestamp: '10:05:10',
      objective: 'Renombrar no transforma los bytes, pero este evento ocurrió después del diagnóstico y no explica el destino actual.',
      relevant: false,
    },
  ],
  hypotheses: [
    {
      id: 'truncated-copy',
      label: 'Se truncó el destino y la copia quedó incompleta.',
      explanation: 'La evidencia encaja con creat, que trunca el destino, seguida por una transferencia que no continuó con todo el origen. El contenido actual confirma que sólo llegaron dos registros.',
      requiredEvidenceIds: ['report', 'source', 'creat', 'partial-write'],
    },
    {
      id: 'extension-corruption',
      label: 'La extensión .txt convirtió los datos en texto.',
      explanation: 'Una extensión es un nombre o convención: cambiarla no reescribe los bytes. No explica que el destino tenga menos registros.',
      requiredEvidenceIds: ['rename'],
    },
    {
      id: 'old-backup',
      label: 'La copia .bak fue restaurada completa.',
      explanation: 'La copia .bak es anterior y contiene tres registros, no los dos del destino ni los cuatro del origen. Es una pista engañosa.',
      requiredEvidenceIds: ['backup'],
    },
  ],
  hints: [
    { id: 'operation', text: 'Buscá una operación que pueda dejar el destino vacío antes de escribir.', penaltyPoints: 10 },
    { id: 'comparison', text: 'Compará el tamaño y los registros del origen con los del destino.', penaltyPoints: 10 },
    { id: 'name', text: 'El nombre no cambia los bytes: concentráte en la secuencia creat → write.', penaltyPoints: 10 },
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
  misleadingEvidenceIds: string[]
  hypothesisCorrect: boolean
  revealedHintIds: string[]
}

export function evaluateInvestigation(answers: DetectiveAnswers): DetectiveEvaluation {
  const solution = DIGITAL_DETECTIVE_CASE.hypotheses[0]
  const selected = new Set(answers.selectedEvidenceIds)
  const required = new Set(solution.requiredEvidenceIds)
  const relevantEvidenceIds = answers.selectedEvidenceIds.filter((id) => required.has(id))
  const missingEvidenceIds = solution.requiredEvidenceIds.filter((id) => !selected.has(id))
  const misleadingEvidenceIds = answers.selectedEvidenceIds.filter((id) => !required.has(id))
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
    misleadingEvidenceIds,
    hypothesisCorrect,
    revealedHintIds,
  }
}

export function saveDetectiveEvaluation(state: Phase5State, evaluation: DetectiveEvaluation, now?: string): Phase5State {
  return recordEvaluation(state, 'digital-detective', evaluation, now)
}
