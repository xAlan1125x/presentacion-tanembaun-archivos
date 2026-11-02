import { describe, expect, it } from 'vitest'
import {
  BASIC_SCENARIO,
  CASE_INSENSITIVE_SCENARIO,
  FileSystemEngine,
  bufferFromBytes,
  createBuffer,
  validBufferBytes,
  type EngineResult,
  type ScenarioDefinition,
} from '..'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function unwrap<T>(result: EngineResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
  return result.value
}

function expectError<T>(result: EngineResult<T>, code: string) {
  expect(result.ok).toBe(false)
  if (!result.ok) expect(result.error.code).toBe(code)
}

function scenario(overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
  return {
    id: 'test',
    title: 'Escenario de prueba',
    processes: [{ id: 'owner-process', principalId: 'owner' }, { id: 'guest-process', principalId: 'guest' }],
    files: [
      {
        id: 'alpha',
        name: 'alpha.txt',
        format: 'ascii',
        content: encoder.encode('ABCDE'),
        attributes: {
          ownerId: 'owner',
          creatorId: 'owner',
          protection: { owner: { read: true, write: true }, others: { read: true, write: false } },
        },
      },
    ],
    ...overrides,
  }
}

describe('archivos, nombres y snapshots', () => {
  it('crea archivos vacíos con identificadores deterministas sin abrirlos', () => {
    const engine = new FileSystemEngine(scenario({ files: [] }))
    const created = unwrap(engine.create('owner-process', 'nuevo.txt', { format: 'ascii' }))

    expect(created.file.id).toBe('file-1')
    expect(created.file.size).toBe(0)
    expect(created.file.attributes.ownerId).toBe('owner')
    expect(engine.getProcess('owner-process')?.openFiles).toHaveLength(0)
  })

  it('rechaza nombres inválidos y duplicados sin alterar el estado', () => {
    const engine = new FileSystemEngine(scenario())
    expectError(engine.create('owner-process', ''), 'INVALID_NAME')
    expectError(engine.create('owner-process', 'carpeta/archivo'), 'INVALID_NAME')
    expectError(engine.create('owner-process', 'alpha.txt'), 'NAME_EXISTS')
    expect(engine.listFiles()).toHaveLength(1)
  })

  it('valida atributos estructurales antes de crear el archivo', () => {
    const engine = new FileSystemEngine(scenario({ files: [] }))
    expectError(engine.create('owner-process', 'invalido.dat', { attributes: { maxSize: -1 } }), 'FILE_SIZE_LIMIT')
    expectError(engine.create('owner-process', 'registro.dat', { attributes: { recordLength: -4 } }), 'INVALID_COUNT')
    expect(engine.listFiles()).toHaveLength(0)
  })

  it('aplica sensibilidad a mayúsculas según el escenario', () => {
    const sensitive = new FileSystemEngine(scenario())
    expect(unwrap(sensitive.create('owner-process', 'ALPHA.TXT')).file.name).toBe('ALPHA.TXT')

    const insensitive = new FileSystemEngine(CASE_INSENSITIVE_SCENARIO)
    expectError(insensitive.create('shell', 'Maria'), 'NAME_EXISTS')
  })

  it('permite un cambio sólo de mayúsculas pero detecta colisiones con otros archivos', () => {
    const engine = new FileSystemEngine({
      ...CASE_INSENSITIVE_SCENARIO,
      files: [
        { id: 'one', name: 'maria' },
        { id: 'two', name: 'cathy' },
      ],
    })

    expect(unwrap(engine.rename('shell', 'one', 'MARIA')).file.name).toBe('MARIA')
    expectError(engine.rename('shell', 'one', 'CATHY'), 'NAME_EXISTS')
  })

  it('devuelve copias defensivas del contenido y los atributos', () => {
    const engine = new FileSystemEngine(scenario())
    const snapshot = engine.getFile('alpha')!
    snapshot.content[0] = 0
    snapshot.attributes.protection.owner.read = false

    expect(decoder.decode(engine.getFile('alpha')?.content)).toBe('ABCDE')
    expect(engine.getFile('alpha')?.attributes.protection.owner.read).toBe(true)
  })
})

describe('descriptores, lectura y fin de archivo', () => {
  it('asigna descriptores por proceso y mantiene cursores independientes', () => {
    const engine = new FileSystemEngine(scenario())
    const first = unwrap(engine.open('owner-process', 'alpha', 'read'))
    const second = unwrap(engine.open('owner-process', 'alpha', 'read'))

    expect([first.descriptor, second.descriptor]).toEqual([3, 4])
    unwrap(engine.read('owner-process', first.descriptor, 2))
    expect(engine.getProcess('owner-process')?.openFiles.map((entry) => entry.position)).toEqual([2, 0])
  })

  it('diferencia datos, lectura parcial por EOF y fin de archivo', () => {
    const engine = new FileSystemEngine(scenario())
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'read')).descriptor

    const first = unwrap(engine.read('owner-process', descriptor, 4))
    expect(first.outcome).toBe('data')
    expect(first.buffer.capacity).toBe(4)
    expect(first.buffer.validLength).toBe(4)
    expect(decoder.decode(validBufferBytes(first.buffer))).toBe('ABCD')

    const second = unwrap(engine.read('owner-process', descriptor, 4))
    expect(second.outcome).toBe('data')
    expect(second.bytesTransferred).toBe(1)
    expect(decoder.decode(validBufferBytes(second.buffer))).toBe('E')

    const eof = unwrap(engine.read('owner-process', descriptor, 4))
    expect(eof.outcome).toBe('eof')
    expect(eof.bytesTransferred).toBe(0)
    expect(eof.buffer.capacity).toBe(4)
    expect(eof.buffer.validLength).toBe(0)
  })

  it('trata una lectura de cero bytes como éxito sin confundirla con EOF', () => {
    const engine = new FileSystemEngine(scenario())
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'read')).descriptor
    const result = unwrap(engine.read('owner-process', descriptor, 0))

    expect(result.outcome).toBe('data')
    expect(result.bytesTransferred).toBe(0)
    expect(result.positionAfter).toBe(0)
  })

  it('invalida el descriptor al cerrar y reporta un error, no EOF', () => {
    const engine = new FileSystemEngine(scenario())
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'read')).descriptor
    unwrap(engine.close('owner-process', descriptor))

    expectError(engine.read('owner-process', descriptor, 1), 'INVALID_DESCRIPTOR')
    expectError(engine.close('owner-process', descriptor), 'INVALID_DESCRIPTOR')
  })

  it('limita transferencias de lectura de forma determinista', () => {
    const engine = new FileSystemEngine(scenario({ config: { transfers: { maxReadBytesPerCall: 2 } } }))
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'read')).descriptor
    const result = unwrap(engine.read('owner-process', descriptor, 5))

    expect(result.bytesRequested).toBe(5)
    expect(result.bytesTransferred).toBe(2)
    expect(result.buffer.capacity).toBe(5)
    expect(result.buffer.validLength).toBe(2)
  })
})

describe('escritura, append, búferes y cursores', () => {
  it('sobrescribe desde la posición actual y puede extender el archivo', () => {
    const engine = new FileSystemEngine(scenario())
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'read-write')).descriptor
    unwrap(engine.seek('owner-process', descriptor, 1))
    const result = unwrap(engine.write('owner-process', descriptor, encoder.encode('XYZ')))

    expect(result).toMatchObject({ positionBefore: 1, positionAfter: 4, sizeBefore: 5, sizeAfter: 5 })
    expect(decoder.decode(engine.getFile('alpha')?.content)).toBe('AXYZE')
  })

  it('append escribe al final sin depender de la posición actual', () => {
    const engine = new FileSystemEngine(scenario())
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'write')).descriptor
    unwrap(engine.seek('owner-process', descriptor, 1))
    const result = unwrap(engine.append('owner-process', descriptor, encoder.encode('!')))

    expect(result.positionBefore).toBe(5)
    expect(result.positionAfter).toBe(6)
    expect(decoder.decode(engine.getFile('alpha')?.content)).toBe('ABCDE!')
  })

  it('el modo append obliga a write a comenzar en el final', () => {
    const engine = new FileSystemEngine(scenario())
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'append')).descriptor
    unwrap(engine.seek('owner-process', descriptor, 0))
    unwrap(engine.write('owner-process', descriptor, encoder.encode('!')))

    expect(decoder.decode(engine.getFile('alpha')?.content)).toBe('ABCDE!')
  })

  it('modela escrituras parciales y conserva la cantidad solicitada', () => {
    const engine = new FileSystemEngine(scenario({ config: { transfers: { maxWriteBytesPerCall: 2 } } }))
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'write')).descriptor
    const source = createBuffer(8, encoder.encode('WXYZ'))
    const result = unwrap(engine.write('owner-process', descriptor, source))

    expect(result).toMatchObject({ bytesRequested: 4, bytesTransferred: 2, partial: true })
    expect(decoder.decode(engine.getFile('alpha')?.content)).toBe('WXCDE')
  })

  it('sólo escribe bytes válidos del búfer', () => {
    const engine = new FileSystemEngine(scenario())
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'write')).descriptor
    const source = createBuffer(10, encoder.encode('OK'))
    const result = unwrap(engine.write('owner-process', descriptor, source))

    expect(result.bytesRequested).toBe(2)
    expect(decoder.decode(engine.getFile('alpha')?.content)).toBe('OKCDE')
    expectError(engine.write('owner-process', descriptor, source, 3), 'INVALID_COUNT')
  })

  it('respeta el tamaño máximo y reporta transferencias parciales o límite agotado', () => {
    const engine = new FileSystemEngine(scenario())
    unwrap(engine.setAttributes('owner-process', 'alpha', { maxSize: 6 }))
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'append')).descriptor
    const partial = unwrap(engine.write('owner-process', descriptor, encoder.encode('XYZ')))

    expect(partial).toMatchObject({ bytesRequested: 3, bytesTransferred: 1, partial: true, sizeAfter: 6 })
    expectError(engine.write('owner-process', descriptor, encoder.encode('!')), 'FILE_SIZE_LIMIT')
  })

  it('reposiciona desde inicio, posición actual y final, rechazando límites inválidos', () => {
    const engine = new FileSystemEngine(scenario())
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'read-write')).descriptor

    expect(unwrap(engine.seek('owner-process', descriptor, 2, 'start')).positionAfter).toBe(2)
    expect(unwrap(engine.seek('owner-process', descriptor, 1, 'current')).positionAfter).toBe(3)
    expect(unwrap(engine.seek('owner-process', descriptor, -1, 'end')).positionAfter).toBe(4)
    expectError(engine.seek('owner-process', descriptor, 6, 'start'), 'INVALID_POSITION')
    expectError(engine.seek('owner-process', descriptor, -6, 'end'), 'INVALID_POSITION')
  })
})

describe('modos, protección y atributos', () => {
  it('hace cumplir los modos de apertura', () => {
    const engine = new FileSystemEngine(scenario())
    const readDescriptor = unwrap(engine.open('owner-process', 'alpha', 'read')).descriptor
    const writeDescriptor = unwrap(engine.open('owner-process', 'alpha', 'write')).descriptor

    expectError(engine.write('owner-process', readDescriptor, encoder.encode('X')), 'MODE_VIOLATION')
    expectError(engine.read('owner-process', writeDescriptor, 1), 'MODE_VIOLATION')
  })

  it('aplica el modelo didáctico de propietario y otros', () => {
    const engine = new FileSystemEngine(scenario())

    expect(unwrap(engine.open('guest-process', 'alpha', 'read')).descriptor).toBe(3)
    expectError(engine.open('guest-process', 'alpha', 'write'), 'PERMISSION_DENIED')
    expectError(engine.setAttributes('guest-process', 'alpha', { hidden: true }), 'PERMISSION_DENIED')
  })

  it('vuelve a comprobar la protección aunque el descriptor ya esté abierto', () => {
    const engine = new FileSystemEngine(scenario())
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'write')).descriptor
    unwrap(engine.setAttributes('owner-process', 'alpha', { readOnly: true }))

    expectError(engine.write('owner-process', descriptor, encoder.encode('X')), 'READ_ONLY')
    unwrap(engine.setAttributes('owner-process', 'alpha', { readOnly: false, locked: true }))
    expectError(engine.write('owner-process', descriptor, encoder.encode('X')), 'LOCKED')
  })

  it('obtiene y modifica atributos sin exponer referencias internas', () => {
    const engine = new FileSystemEngine(scenario())
    const updated = unwrap(engine.setAttributes('owner-process', 'alpha', {
      hidden: true,
      protection: { others: { read: false } },
      recordLength: 16,
    }))

    expect(updated.attributes.hidden).toBe(true)
    expect(updated.attributes.protection.others).toEqual({ read: false, write: false })
    expect(updated.size).toBe(5)
    expectError(engine.getAttributes('guest-process', 'alpha'), 'PERMISSION_DENIED')
  })

  it('actualiza tamaño, archive y marcas temporales de manera determinista', () => {
    const engine = new FileSystemEngine(scenario({ config: { clockStart: 100, clockStep: 10 } }))
    const before = engine.getFile('alpha')!
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'write')).descriptor
    unwrap(engine.write('owner-process', descriptor, encoder.encode('Z')))
    const after = engine.getFile('alpha')!

    expect(before.attributes.lastModifiedAt).toBe(100)
    expect(after.attributes.lastModifiedAt).toBe(110)
    expect(after.attributes.archive).toBe(true)
    expect(after.size).toBe(5)
  })
})

describe('delete, tipos especiales y creat', () => {
  it('rechaza delete mientras el archivo está abierto según la regla explícita de FileLab', () => {
    const engine = new FileSystemEngine(scenario())
    const descriptor = unwrap(engine.open('owner-process', 'alpha', 'read')).descriptor

    expectError(engine.delete('owner-process', 'alpha'), 'FILE_IN_USE')
    unwrap(engine.close('owner-process', descriptor))
    expect(unwrap(engine.delete('owner-process', 'alpha'))).toEqual({ fileId: 'alpha', name: 'alpha.txt' })
  })

  it('representa tipos especiales pero no inventa semánticas de E/S para ellos', () => {
    const engine = new FileSystemEngine(scenario({
      files: [{ id: 'terminal', name: 'terminal.char', type: 'character-special' }],
    }))

    expect(engine.getFile('terminal')?.type).toBe('character-special')
    expectError(engine.open('owner-process', 'terminal', 'read'), 'UNSUPPORTED_FILE_TYPE')
  })

  it('diferencia create de creat al encontrar un nombre existente', () => {
    const engine = new FileSystemEngine(scenario())
    expectError(engine.create('owner-process', 'alpha.txt'), 'NAME_EXISTS')
    expect(decoder.decode(engine.getFile('alpha')?.content)).toBe('ABCDE')

    const result = unwrap(engine.creat('owner-process', 'alpha.txt'))
    expect(result.truncated).toBe(true)
    expect(result.descriptor).toBe(3)
    expect(result.file.size).toBe(0)
    expect(engine.getProcess('owner-process')?.openFiles[0]).toMatchObject({ mode: 'write', position: 0 })
  })

  it('creat crea y abre cuando el nombre no existe', () => {
    const engine = new FileSystemEngine(scenario({ files: [] }))
    const result = unwrap(engine.creat('owner-process', 'destino.bin'))

    expect(result.truncated).toBe(false)
    expect(result.file.name).toBe('destino.bin')
    expect(result.descriptor).toBe(3)
  })
})

describe('escenarios restaurables', () => {
  it('restaura bytes, atributos, descriptores, reloj e identificadores', () => {
    const engine = new FileSystemEngine(BASIC_SCENARIO)
    const descriptor = unwrap(engine.open('editor', 'notes', 'read-write')).descriptor
    unwrap(engine.write('editor', descriptor, encoder.encode('Z')))
    unwrap(engine.setAttributes('editor', 'notes', { hidden: true }))
    unwrap(engine.create('editor', 'temporal.txt'))

    const restored = unwrap(engine.restoreScenario())
    expect(decoder.decode(engine.getFile('notes')?.content)).toBe('ABC')
    expect(engine.getFile('notes')?.attributes.hidden).toBe(false)
    expect(engine.listFiles()).toHaveLength(1)
    expect(engine.getProcess('editor')?.openFiles).toHaveLength(0)
    expect(restored.clock).toBe(BASIC_SCENARIO.config?.clockStart)
    expect(unwrap(engine.create('editor', 'nuevo.txt')).file.id).toBe('file-1')
  })

  it('mantiene escenarios independientes aunque compartan una definición', () => {
    const first = new FileSystemEngine(BASIC_SCENARIO)
    const second = new FileSystemEngine(BASIC_SCENARIO)
    const descriptor = unwrap(first.open('editor', 'notes', 'write')).descriptor
    unwrap(first.write('editor', descriptor, encoder.encode('Z')))

    expect(decoder.decode(first.getFile('notes')?.content)).toBe('ZBC')
    expect(decoder.decode(second.getFile('notes')?.content)).toBe('ABC')
  })
})

describe('búferes', () => {
  it('crea búferes con capacidad y longitud válida separadas', () => {
    const buffer = createBuffer(8, encoder.encode('ABC'))
    expect(buffer.capacity).toBe(8)
    expect(buffer.data).toHaveLength(8)
    expect(buffer.validLength).toBe(3)
    expect(decoder.decode(validBufferBytes(buffer))).toBe('ABC')
  })

  it('crea un búfer exacto desde bytes', () => {
    const buffer = bufferFromBytes(encoder.encode('ABC'))
    expect(buffer.capacity).toBe(3)
    expect(buffer.validLength).toBe(3)
  })
})
