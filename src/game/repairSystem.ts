import { FileLabSession, type LabSessionSnapshot } from '../lab'
import { evaluateResolution, recordEvaluation } from './rules'
import type { GameEvaluation, Phase5State } from './types'

export type RepairActionName = 'set-readonly' | 'open-protected' | 'write-protected' | 'invalid-read' | 'open-records' | 'read-records' | 'open-sequence' | 'seek-sequence' | 'read-sequence' | 'close-all'

export interface RepairAction {
  id: number
  name: RepairActionName
  ok: boolean
  message: string
}

export interface RepairChallenge {
  id: string
  title: string
  goal: string
  explanation: string
}

export interface RepairSnapshot {
  lab: LabSessionSnapshot
  actions: RepairAction[]
  challenges: RepairChallenge[]
  solvedChallengeIds: string[]
  hintsUsed: string[]
  message: string
  completed: boolean
}

export interface RepairEvaluation extends GameEvaluation {
  solvedChallengeIds: string[]
  failedActionCount: number
  hintsUsed: string[]
}

export const REPAIR_CHALLENGES: RepairChallenge[] = [
  { id: 'permissions', title: 'Desbloquear el reporte', goal: 'Modificar el atributo de sólo lectura y escribir el contenido de reparación.', explanation: 'La bandera readOnly bloqueaba la escritura. Primero había que cambiar el atributo y después escribir con un descriptor abierto en modo compatible.' },
  { id: 'descriptor', title: 'Recuperar el descriptor', goal: 'Abrir registros.txt y completar una lectura válida después del intento inválido.', explanation: 'Un descriptor no existe hasta open. El error INVALID_DESCRIPTOR no se arregla repitiendo read: hay que abrir el archivo y usar el descriptor devuelto.' },
  { id: 'cursor', title: 'Encontrar el registro', goal: 'Reposicionar secuencia.txt en 4 y leer desde esa posición.', explanation: 'seek modifica la posición asociada al descriptor. La lectura esperada comienza en el offset 4 y devuelve 456789.' },
  { id: 'order', title: 'Cerrar el ciclo', goal: 'Completar operaciones válidas y cerrar todos los descriptores abiertos.', explanation: 'Las operaciones dependen del estado: abrir antes de leer o escribir y cerrar después. Un estado final sin descriptores confirma el cierre del ciclo.' },
]

export const REPAIR_HINTS = [
  { id: 'permissions', text: 'Consultá o cambiá readOnly antes de intentar guardar el reporte.', penaltyPoints: 10 },
  { id: 'descriptor', text: 'El número 99 no identifica un descriptor abierto; usá el que devuelve open.', penaltyPoints: 10 },
  { id: 'cursor', text: 'La posición inicial es 0; necesitás seek(4) antes de leer.', penaltyPoints: 10 },
]

export class RepairSystemGame {
  private session = new FileLabSession('repair-system')
  private actions: RepairAction[] = []
  private hintsUsed: string[] = []
  private message = 'Inspeccioná el sistema y elegí una herramienta para comenzar.'

  snapshot(): RepairSnapshot {
    const solvedChallengeIds = this.solvedChallengeIds()
    return {
      lab: this.session.snapshot(),
      actions: this.actions.map((action) => ({ ...action })),
      challenges: REPAIR_CHALLENGES,
      solvedChallengeIds,
      hintsUsed: [...this.hintsUsed],
      message: this.message,
      completed: solvedChallengeIds.length === REPAIR_CHALLENGES.length,
    }
  }

  restore(): RepairSnapshot {
    this.session = new FileLabSession('repair-system')
    this.actions = []
    this.hintsUsed = []
    this.message = 'Escenario restaurado: los cuatro problemas vuelven a estar activos.'
    return this.snapshot()
  }

  inspect(fileId: string): RepairSnapshot {
    const result = this.session.getAttributes(fileId)
    this.message = result.ok ? `Atributos de ${fileId}: ${result.value.attributes.readOnly ? 'sólo lectura activa.' : 'escritura permitida.'}` : result.error.message
    this.session.interfaceAction('inspeccionar', this.message)
    return this.snapshot()
  }

  setReadOnly(enabled: boolean): RepairSnapshot {
    return this.run('set-readonly', 'setAttributes', () => this.session.setAttributes('protected', { readOnly: enabled }))
  }

  openProtected(): RepairSnapshot {
    return this.run('open-protected', 'open', () => this.session.open('protected', 'read-write'))
  }

  writeProtected(): RepairSnapshot {
    const descriptor = this.openDescriptorFor('protected')
    return this.run('write-protected', 'write', () => descriptor === undefined
      ? this.invalidResult('No hay descriptor válido para reporte-protegido.txt.')
      : this.session.write(descriptor, new TextEncoder().encode('REPARADO')))
  }

  invalidRead(): RepairSnapshot {
    return this.run('invalid-read', 'read', () => this.session.read(99, 4))
  }

  openRecords(): RepairSnapshot {
    return this.run('open-records', 'open', () => this.session.open('records', 'read'))
  }

  readRecords(): RepairSnapshot {
    const descriptor = this.openDescriptorFor('records')
    return this.run('read-records', 'read', () => descriptor === undefined
      ? this.invalidResult('Abrí registros.txt para obtener su descriptor.')
      : this.session.read(descriptor, 6))
  }

  openSequence(): RepairSnapshot {
    return this.run('open-sequence', 'open', () => this.session.open('sequence', 'read'))
  }

  seekSequence(): RepairSnapshot {
    const descriptor = this.openDescriptorFor('sequence')
    return this.run('seek-sequence', 'seek', () => descriptor === undefined
      ? this.invalidResult('Abrí secuencia.txt antes de reposicionar su cursor.')
      : this.session.seek(descriptor, 4))
  }

  readSequence(): RepairSnapshot {
    const descriptor = this.openDescriptorFor('sequence')
    return this.run('read-sequence', 'read', () => descriptor === undefined
      ? this.invalidResult('Abrí secuencia.txt y ejecutá seek antes de leer.')
      : this.session.read(descriptor, 6))
  }

  closeAll(): RepairSnapshot {
    const handles = this.session.snapshot().engine.processes[0]?.openFiles ?? []
    if (handles.length === 0) {
      this.record('close-all', false, 'No había descriptores abiertos para cerrar.')
      return this.snapshot()
    }
    let closed = 0
    for (const handle of handles) {
      const result = this.session.close(handle.descriptor)
      if (result.ok) closed += 1
    }
    this.record('close-all', closed === handles.length, `${closed} descriptor(es) cerrado(s).`)
    return this.snapshot()
  }

  useHint(id: string): RepairSnapshot {
    const hint = REPAIR_HINTS.find((item) => item.id === id)
    if (hint && !this.hintsUsed.includes(id)) {
      this.hintsUsed.push(id)
      this.message = `${hint.text} Penalización: ${hint.penaltyPoints} puntos.`
    }
    return this.snapshot()
  }

  evaluate(): RepairEvaluation {
    const snapshot = this.snapshot()
    const solved = snapshot.solvedChallengeIds
    const penaltyPoints = this.hintsUsed.reduce((sum, id) => sum + (REPAIR_HINTS.find((hint) => hint.id === id)?.penaltyPoints ?? 0), 0)
    const explanation = snapshot.completed
      ? 'Sistema reparado: los atributos permiten escribir, las lecturas usan descriptores válidos, el cursor encontró los datos y no quedaron descriptores abiertos.'
      : `Todavía faltan: ${REPAIR_CHALLENGES.filter((challenge) => !solved.includes(challenge.id)).map((challenge) => challenge.title).join(', ')}. Las acciones incorrectas no cuentan como reparación.`
    return {
      ...evaluateResolution({ resolutionQuality: solved.length / REPAIR_CHALLENGES.length, completed: snapshot.completed, penaltyPoints }, explanation),
      solvedChallengeIds: solved,
      failedActionCount: this.actions.filter((action) => !action.ok).length,
      hintsUsed: [...this.hintsUsed],
    }
  }

  private openDescriptorFor(fileId: string): number | undefined {
    return this.session.snapshot().engine.processes[0]?.openFiles.find((handle) => handle.fileId === fileId)?.descriptor
  }

  private run(name: RepairActionName, operation: string, action: () => { ok: boolean; error?: { message: string } }): RepairSnapshot {
    const result = action()
    this.record(name, result.ok, result.ok ? `${operation} ejecutado correctamente.` : result.error?.message ?? 'La operación falló.')
    return this.snapshot()
  }

  private invalidResult(message: string) {
    return { ok: false as const, error: { message } }
  }

  private record(name: RepairActionName, ok: boolean, message: string): void {
    this.actions.push({ id: this.actions.length + 1, name, ok, message })
    this.message = message
  }

  private solvedChallengeIds(): string[] {
    const names = this.actions.filter((action) => action.ok).map((action) => action.name)
    const allNames = this.actions.map((action) => action.name)
    const successfulIndex = (name: RepairActionName) => this.actions.findIndex((action) => action.name === name && action.ok)
    const snapshot = this.session.snapshot()
    const protectedFile = snapshot.engine.files.find((file) => file.id === 'protected')
    const sequenceDescriptor = snapshot.engine.processes[0]?.openFiles.find((handle) => handle.fileId === 'sequence')
    const reportSolved = Boolean(protectedFile && !protectedFile.attributes.readOnly && successfulIndex('set-readonly') < successfulIndex('open-protected') && successfulIndex('open-protected') < successfulIndex('write-protected') && snapshot.engine.files.find((file) => file.id === 'protected')?.content.every((byte, index) => byte === new TextEncoder().encode('REPARADO')[index]))
    const descriptorSolved = allNames.includes('invalid-read') && successfulIndex('open-records') < successfulIndex('read-records')
    const cursorSolved = successfulIndex('open-sequence') < successfulIndex('seek-sequence') && successfulIndex('seek-sequence') < successfulIndex('read-sequence') && sequenceDescriptor === undefined
    const orderSolved = successfulIndex('open-protected') < successfulIndex('write-protected') && successfulIndex('write-protected') < successfulIndex('close-all') && snapshot.engine.processes.every((process) => process.openFiles.length === 0)
    return [reportSolved && 'permissions', descriptorSolved && 'descriptor', cursorSolved && 'cursor', orderSolved && 'order'].filter((id): id is string => Boolean(id))
  }
}

export function saveRepairEvaluation(state: Phase5State, evaluation: RepairEvaluation, now?: string): Phase5State {
  return recordEvaluation(state, 'repair-system', evaluation, now)
}
