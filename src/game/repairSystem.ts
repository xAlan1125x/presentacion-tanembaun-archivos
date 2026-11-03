import { evaluateResolution, recordEvaluation } from './rules'
import type { GameEvaluation, Phase5State } from './types'

export interface RepairOption {
  id: string
  label: string
  correct: boolean
}

export interface RepairChallenge {
  id: string
  title: string
  situation: string
  question: string
  options: RepairOption[]
  explanation: string
}

export interface RepairAnswer {
  challengeId: string
  optionId: string
  correct: boolean
}

export interface RepairSnapshot {
  challenges: RepairChallenge[]
  currentIndex: number
  answers: RepairAnswer[]
  feedback: string
  completed: boolean
}

export interface RepairEvaluation extends GameEvaluation {
  solvedChallengeIds: string[]
  failedActionCount: number
}

export const REPAIR_CHALLENGES: RepairChallenge[] = [
  {
    id: 'permissions',
    title: 'Archivo de sólo lectura',
    situation: 'Necesitás guardar cambios, pero reporte.txt tiene activa la bandera readOnly.',
    question: '¿Qué deberías hacer antes de escribir?',
    options: [
      { id: 'open-write', label: 'Abrirlo en modo escritura para reemplazar la bandera', correct: false },
      { id: 'remove-readonly', label: 'Quitar la protección de sólo lectura', correct: true },
      { id: 'append', label: 'Usar append para no sobrescribir los datos existentes', correct: false },
    ],
    explanation: 'readOnly impide escribir. Primero hay que quitar esa protección y luego realizar la escritura.',
  },
  {
    id: 'descriptor',
    title: 'Descriptor inválido',
    situation: 'El proceso intentó usar read con un descriptor que no está abierto.',
    question: '¿Cómo obtiene un descriptor válido?',
    options: [
      { id: 'reuse', label: 'Reutilizando un descriptor abierto para otro archivo', correct: false },
      { id: 'seek-descriptor', label: 'Aplicando seek al número de descriptor inválido', correct: false },
      { id: 'open', label: 'Abriendo el archivo y usando el descriptor devuelto', correct: true },
    ],
    explanation: 'open devuelve un descriptor válido para ese proceso. Las operaciones posteriores deben usarlo.',
  },
  {
    id: 'seek',
    title: 'Acceso a otra posición',
    situation: 'Necesitás leer un dato ubicado más adelante sin recorrer todo lo anterior.',
    question: '¿Qué operación permite mover el cursor?',
    options: [
      { id: 'seek', label: 'seek', correct: true },
      { id: 'read-all', label: 'Hacer read repetidamente hasta llegar a esa posición', correct: false },
      { id: 'reopen', label: 'Cerrar y volver a abrir el archivo', correct: false },
    ],
    explanation: 'seek reposiciona el cursor del descriptor. Después se puede leer desde la nueva posición.',
  },
  {
    id: 'close',
    title: 'Finalización',
    situation: 'El proceso terminó de trabajar con el archivo y ya no necesita el descriptor.',
    question: '¿Qué operación corresponde?',
    options: [
      { id: 'seek-end', label: 'Mover el cursor al final del archivo', correct: false },
      { id: 'wait', label: 'Dejar el descriptor abierto hasta que termine el proceso', correct: false },
      { id: 'close', label: 'Cerrar el descriptor con close', correct: true },
    ],
    explanation: 'close cierra el descriptor cuando el proceso termina de usar el archivo; no elimina el archivo.',
  },
]

export class RepairSystemGame {
  private currentIndex = 0
  private answers: RepairAnswer[] = []
  private feedback = 'Elegí una respuesta para resolver el primer problema.'
  private finished = false

  snapshot(): RepairSnapshot {
    return {
      challenges: REPAIR_CHALLENGES,
      currentIndex: this.currentIndex,
      answers: this.answers.map((answer) => ({ ...answer })),
      feedback: this.feedback,
      completed: this.finished,
    }
  }

  answer(optionId: string): RepairSnapshot {
    const challenge = REPAIR_CHALLENGES[this.currentIndex]
    if (!challenge || this.answers.some((answer) => answer.challengeId === challenge.id)) return this.snapshot()
    const option = challenge.options.find((candidate) => candidate.id === optionId)
    if (!option) return this.snapshot()
    this.answers.push({ challengeId: challenge.id, optionId, correct: option.correct })
    this.feedback = (option.correct ? 'Correcto. ' : 'No es la opción adecuada. ') + challenge.explanation
    return this.snapshot()
  }

  advance(): RepairSnapshot {
    const challenge = REPAIR_CHALLENGES[this.currentIndex]
    if (!challenge || !this.answers.some((answer) => answer.challengeId === challenge.id)) return this.snapshot()
    if (this.currentIndex < REPAIR_CHALLENGES.length - 1) {
      this.currentIndex += 1
      this.feedback = 'Leé la situación y elegí una respuesta.'
    } else {
      this.finished = true
    }
    return this.snapshot()
  }

  restore(): RepairSnapshot {
    this.currentIndex = 0
    this.answers = []
    this.finished = false
    this.feedback = 'Juego reiniciado. Volvés al problema 1 de 4.'
    return this.snapshot()
  }

  evaluate(): RepairEvaluation {
    const solvedChallengeIds = this.answers.filter((answer) => answer.correct).map((answer) => answer.challengeId)
    const completed = this.finished
    const explanation = completed
      ? 'Resolviste correctamente ' + solvedChallengeIds.length + ' de 4 problemas sobre protección, descriptores, seek y close.'
      : 'Respondé los ' + (REPAIR_CHALLENGES.length - this.answers.length) + ' problemas restantes antes de finalizar.'
    return {
      ...evaluateResolution({ resolutionQuality: solvedChallengeIds.length / REPAIR_CHALLENGES.length, completed }, explanation),
      solvedChallengeIds,
      failedActionCount: this.answers.filter((answer) => !answer.correct).length,
    }
  }
}

export function saveRepairEvaluation(state: Phase5State, evaluation: RepairEvaluation, now?: string): Phase5State {
  return recordEvaluation(state, 'repair-system', evaluation, now)
}
