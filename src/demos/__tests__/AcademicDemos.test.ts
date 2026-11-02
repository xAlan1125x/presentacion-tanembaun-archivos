import { describe, expect, it } from 'vitest'
import { FileLabSession } from '../../lab'
import { CopyfileSimulation } from '../CopyfileSimulation'

describe('escenarios académicos restaurables', () => {
  it('nomenclatura conserva bytes al cambiar la extensión y distingue mayúsculas', () => {
    const session = new FileLabSession('academic-names')
    const before = session.snapshot().engine.files.find((file) => file.id === 'note')!.content
    expect(session.renameFile('note', 'nota.jpg').ok).toBe(true)
    expect([...session.snapshot().engine.files.find((file) => file.id === 'note')!.content]).toEqual([...before])
    expect(session.createFile('Informe.txt').ok).toBe(true)
    expect(session.snapshot().engine.files.some((file) => file.name === 'informe.txt')).toBe(true)
    session.restoreScenario()
    expect(session.snapshot().engine.files.some((file) => file.name === 'Informe.txt')).toBe(false)
  })

  it('estructura declara longitud de registro y campos de llave sin cambiar los bytes', () => {
    const file = new FileLabSession('academic-structures').snapshot().engine.files[0]
    expect(file.attributes).toMatchObject({ recordLength: 8, keyOffset: 0, keyLength: 3 })
    expect(file.size).toBe(24)
  })

  it('tipos regulares se abren y los especiales producen un error controlado', () => {
    const session = new FileLabSession('academic-types')
    expect(session.open('text', 'read').ok).toBe(true)
    const special = session.open('terminal', 'read')
    expect(special.ok).toBe(false)
    if (!special.ok) expect(special.error.code).toBe('UNSUPPORTED_FILE_TYPE')
    session.restoreScenario()
    expect(session.snapshot().engine.processes[0].openFiles).toHaveLength(0)
  })

  it('acceso secuencial mueve el cursor y seek lo reposiciona', () => {
    const session = new FileLabSession('academic-access')
    const opened = session.open('flights', 'read')
    if (!opened.ok) throw new Error(opened.error.message)
    session.read(opened.value.descriptor, 2)
    expect(session.snapshot().engine.processes[0].openFiles[0].position).toBe(2)
    session.seek(opened.value.descriptor, 6)
    expect(session.snapshot().engine.processes[0].openFiles[0].position).toBe(6)
  })

  it('atributos impiden escritura por bandera o protección', () => {
    const session = new FileLabSession('academic-attributes')
    expect(session.open('confidential', 'write', 'guest').ok).toBe(false)
    session.setAttributes('confidential', { readOnly: true })
    const owner = session.open('confidential', 'write')
    expect(owner.ok).toBe(false)
    if (!owner.ok) expect(owner.error.code).toBe('READ_ONLY')
  })

  it('operaciones distinguen EOF de descriptor inválido', () => {
    const session = new FileLabSession('academic-operations')
    const opened = session.open('diary', 'read')
    if (!opened.ok) throw new Error(opened.error.message)
    session.seek(opened.value.descriptor, 8)
    const eof = session.read(opened.value.descriptor, 4)
    expect(eof.ok && eof.value.outcome).toBe('eof')
    session.close(opened.value.descriptor)
    const invalid = session.read(opened.value.descriptor, 4)
    expect(invalid.ok).toBe(false)
  })
})

describe('copyfile paso a paso', () => {
  it('trunca, copia 9500 bytes en 4096 + 4096 + 1308, detecta EOF y cierra', () => {
    const demo = new CopyfileSimulation()
    const reads: number[] = []
    let snapshot = demo.snapshot()
    for (let guard = 0; guard < 20 && !snapshot.state.completed; guard += 1) {
      snapshot = demo.next()
      if (snapshot.state.nextAction === 'write') reads.push(snapshot.state.lastRead)
    }
    expect(snapshot.state.completed).toBe(true)
    expect(reads).toEqual([4096, 4096, 1308])
    expect(snapshot.state.bytesCopied).toBe(9500)
    expect(snapshot.lab.engine.files.find((file) => file.id === 'destination')?.size).toBe(9500)
    expect(snapshot.lab.engine.processes[0].openFiles).toHaveLength(0)

    const restored = demo.restore()
    expect(restored.lab.engine.files.find((file) => file.id === 'destination')?.size).toBe(18)
  })
})
