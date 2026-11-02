import { describe, expect, it } from 'vitest'
import { FileLabSession } from '..'
import type { EngineResult } from '../../engine'

const decoder = new TextDecoder()

function unwrap<T>(result: EngineResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

describe('FileLabSession: recorridos del explorador', () => {
  it('completa crear → abrir → escribir → guardar → cerrar → volver a abrir', async () => {
    const session = new FileLabSession()
    const created = unwrap(session.createFile('recorrido.txt', 'documents'))
    const editor = unwrap(await session.openEditor(created.file.id))

    const saved = unwrap(session.saveEditor(editor, 'contenido persistente'))
    unwrap(session.closeEditor(saved))
    const reopened = unwrap(await session.openEditor(created.file.id))

    expect(reopened.text).toBe('contenido persistente')
    expect(decoder.decode(reopened.bytes)).toBe('contenido persistente')
    expect(session.snapshot().engine.processes[0].openFiles).toHaveLength(1)
  })

  it('renombra sin modificar el contenido', () => {
    const session = new FileLabSession()
    const before = session.snapshot().engine.files.find((file) => file.id === 'report')!

    unwrap(session.renameFile('report', 'resultados.txt'))
    const after = session.snapshot().engine.files.find((file) => file.id === 'report')!

    expect(after.name).toBe('resultados.txt')
    expect([...after.content]).toEqual([...before.content])
  })

  it('aplica atributos y hace visible su efecto al guardar', async () => {
    const session = new FileLabSession()
    unwrap(session.setAttributes('report', { readOnly: true, hidden: true }))
    const editor = unwrap(await session.openEditor('report'))

    expect(editor.readOnly).toBe(true)
    const save = session.saveEditor(editor, 'no debe guardarse')
    expect(save.ok).toBe(false)
    if (!save.ok) expect(save.error.code).toBe('READ_ONLY')
    expect(session.snapshot().engine.files.find((file) => file.id === 'report')?.attributes.hidden).toBe(true)
  })

  it('expone propiedades, bytes y un búfer con longitud realmente transferida', () => {
    const session = new FileLabSession('transferencias-parciales')
    const attributes = unwrap(session.getAttributes('stream'))
    const descriptor = unwrap(session.open('stream', 'read')).descriptor
    const read = unwrap(session.read(descriptor, 10))
    const snapshot = session.snapshot()

    expect(attributes.size).toBe(14)
    expect(read.bytesTransferred).toBe(4)
    expect(snapshot.lastBuffer).toMatchObject({ operation: 'read', requested: 10, transferred: 4, positionBefore: 0, positionAfter: 4 })
    expect(snapshot.lastBuffer?.buffer.capacity).toBe(10)
    expect(snapshot.lastBuffer?.buffer.validLength).toBe(4)
  })

  it('ejecuta operaciones por consola y refleja descriptor y cursor', () => {
    const session = new FileLabSession()
    expect(session.executeConsole('open "informe.txt" read').ok).toBe(true)
    expect(session.executeConsole('read 3 8').ok).toBe(true)
    expect(session.executeConsole('seek 3 2 start').ok).toBe(true)

    const handle = session.snapshot().engine.processes.find((process) => process.id === 'explorer')?.openFiles[0]
    expect(handle).toMatchObject({ descriptor: 3, fileId: 'report', mode: 'read', position: 2 })
  })

  it('expone create/creat y set attributes en consola y valida argumentos', () => {
    const session = new FileLabSession()
    expect(session.executeConsole('create consola.txt').ok).toBe(true)
    expect(session.executeConsole('creat consola.txt').ok).toBe(true)
    expect(session.executeConsole('close 3').ok).toBe(true)
    expect(session.executeConsole('set consola.txt hidden true').ok).toBe(true)
    expect(session.snapshot().engine.files.find((file) => file.name === 'consola.txt')?.attributes.hidden).toBe(true)
    expect(session.executeConsole('open consola.txt modo-inexistente')).toEqual(expect.objectContaining({ ok: false }))
    expect(session.executeConsole('seek 3 0 origen-inexistente')).toEqual(expect.objectContaining({ ok: false }))
  })

  it('explica errores controlados sin confundirlos con EOF', () => {
    const session = new FileLabSession()
    const invalid = session.read(99, 4)
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) expect(invalid.error.code).toBe('INVALID_DESCRIPTOR')

    const descriptor = unwrap(session.open('welcome', 'read')).descriptor
    unwrap(session.seek(descriptor, session.snapshot().engine.files.find((file) => file.id === 'welcome')!.size))
    const eof = unwrap(session.read(descriptor, 4))
    expect(eof.outcome).toBe('eof')
    expect(eof.bytesTransferred).toBe(0)
    expect(session.snapshot().events.at(-1)?.status).toBe('success')
  })

  it('restaura archivos, ubicaciones, descriptores y carpeta inicial', () => {
    const session = new FileLabSession()
    session.navigate('code')
    const created = unwrap(session.createFile('temporal.txt', 'code'))
    unwrap(session.open(created.file.id, 'read'))
    unwrap(session.renameFile('copyfile', 'cambiado.c'))

    session.restoreScenario()
    const snapshot = session.snapshot()
    expect(snapshot.currentFolderId).toBe('documents')
    expect(snapshot.engine.files.some((file) => file.id === created.file.id)).toBe(false)
    expect(snapshot.engine.files.find((file) => file.id === 'copyfile')?.name).toBe('copyfile.c')
    expect(snapshot.engine.processes.every((process) => process.openFiles.length === 0)).toBe(true)
    expect(snapshot.fileLocations).toEqual(snapshot.scenario.fileLocations)
  })

  it('guarda el contenido completo aunque write transfiera sólo cuatro bytes por llamada', async () => {
    const session = new FileLabSession('transferencias-parciales')
    const editor = unwrap(await session.openEditor('stream'))
    const text = 'escritura parcial completa'

    const saved = unwrap(session.saveEditor(editor, text))
    expect(saved.text).toBe(text)
    expect(decoder.decode(session.snapshot().engine.files.find((file) => file.id === 'stream')?.content)).toBe(text)
    const writes = session.snapshot().events.filter((event) => event.operation === 'write' && event.status === 'success')
    expect(writes.length).toBeGreaterThan(1)
  })
})
