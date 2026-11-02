import type { ScenarioDefinition } from '../engine'

const encoder = new TextEncoder()

export interface LabFolder {
  id: string
  name: string
  parentId?: string
}

export interface LabScenario {
  id: string
  title: string
  description: string
  engine: ScenarioDefinition
  folders: LabFolder[]
  fileLocations: Record<string, string>
  defaultFolderId: string
  primaryProcessId: string
}

const protection = (othersRead = true, othersWrite = false) => ({
  owner: { read: true, write: true },
  others: { read: othersRead, write: othersWrite },
})

const PRACTICE_SCENARIOS: LabScenario[] = [
  {
    id: 'workspace-basico',
    title: 'Espacio de trabajo',
    description: 'Archivos de texto, código y bytes para recorrer las herramientas principales.',
    defaultFolderId: 'documents',
    primaryProcessId: 'explorer',
    folders: [
      { id: 'root', name: 'FileLab' },
      { id: 'documents', name: 'Documentos', parentId: 'root' },
      { id: 'code', name: 'Código', parentId: 'root' },
      { id: 'binary', name: 'Binarios', parentId: 'root' },
    ],
    fileLocations: { welcome: 'documents', report: 'documents', copyfile: 'code', sample: 'binary' },
    engine: {
      id: 'workspace-basico',
      title: 'Espacio de trabajo de FileLab',
      config: { clockStart: 1_735_689_600_000, clockStep: 60_000, naming: { caseSensitive: true } },
      processes: [
        { id: 'explorer', principalId: 'estudiante' },
        { id: 'guest', principalId: 'visitante' },
      ],
      files: [
        {
          id: 'welcome', name: 'bienvenida.txt', format: 'ascii',
          content: encoder.encode('Bienvenidos a FileLab OS.\nEste archivo vive en el motor de simulación.'),
          attributes: { ownerId: 'estudiante', creatorId: 'estudiante', protection: protection() },
        },
        {
          id: 'report', name: 'informe.txt', format: 'ascii',
          content: encoder.encode('Resultados del laboratorio\nEstado: listo para experimentar.'),
          attributes: { ownerId: 'estudiante', creatorId: 'estudiante', archive: true, protection: protection() },
        },
        {
          id: 'copyfile', name: 'copyfile.c', format: 'ascii',
          content: encoder.encode('/* Extracto didáctico; el ejemplo completo se trabajará en fase 4. */\nwhile ((n = read(in, buffer, 4096)) > 0) write(out, buffer, n);'),
          attributes: { ownerId: 'estudiante', creatorId: 'estudiante', protection: protection() },
        },
        {
          id: 'sample', name: 'muestra.bin', format: 'binary',
          content: new Uint8Array([0x46, 0x4c, 0x00, 0xff, 0x10, 0x7f, 0x0a, 0x2a, 0x80, 0x01]),
          attributes: { ownerId: 'estudiante', creatorId: 'estudiante', protection: protection() },
        },
      ],
    },
  },
  {
    id: 'atributos-proteccion',
    title: 'Atributos y protección',
    description: 'Banderas y permisos del modelo didáctico de FileLab, no de un sistema real concreto.',
    defaultFolderId: 'protected',
    primaryProcessId: 'explorer',
    folders: [
      { id: 'root', name: 'FileLab' },
      { id: 'protected', name: 'Protegidos', parentId: 'root' },
      { id: 'shared', name: 'Compartidos', parentId: 'root' },
    ],
    fileLocations: { readonly: 'protected', locked: 'protected', public: 'shared' },
    engine: {
      id: 'atributos-proteccion',
      title: 'Atributos y protección didáctica',
      config: { clockStart: 1_735_776_000_000, clockStep: 60_000 },
      processes: [
        { id: 'explorer', principalId: 'estudiante' },
        { id: 'guest', principalId: 'visitante' },
      ],
      files: [
        {
          id: 'readonly', name: 'solo-lectura.txt', format: 'ascii', content: encoder.encode('Podés leerme, pero la bandera impide escribir.'),
          attributes: { ownerId: 'estudiante', creatorId: 'estudiante', readOnly: true, protection: protection() },
        },
        {
          id: 'locked', name: 'bloqueado.txt', format: 'ascii', content: encoder.encode('Archivo bloqueado para provocar un error controlado.'),
          attributes: { ownerId: 'estudiante', creatorId: 'estudiante', locked: true, protection: protection(false, false) },
        },
        {
          id: 'public', name: 'compartido.txt', format: 'ascii', content: encoder.encode('El modelo concede lectura a otros procesos.'),
          attributes: { ownerId: 'estudiante', creatorId: 'estudiante', protection: protection(true, false) },
        },
      ],
    },
  },
  {
    id: 'transferencias-parciales',
    title: 'Transferencias parciales',
    description: 'Cada read o write transfiere como máximo cuatro bytes para hacer visible el búfer.',
    defaultFolderId: 'transfers',
    primaryProcessId: 'explorer',
    folders: [
      { id: 'root', name: 'FileLab' },
      { id: 'transfers', name: 'Transferencias', parentId: 'root' },
    ],
    fileLocations: { stream: 'transfers' },
    engine: {
      id: 'transferencias-parciales',
      title: 'Transferencias parciales de cuatro bytes',
      config: {
        clockStart: 1_735_862_400_000, clockStep: 1_000,
        transfers: { maxReadBytesPerCall: 4, maxWriteBytesPerCall: 4 },
      },
      processes: [{ id: 'explorer', principalId: 'estudiante' }],
      files: [{
        id: 'stream', name: 'secuencia.txt', format: 'ascii', content: encoder.encode('ABCDEFGHIJKLMN'),
        attributes: { ownerId: 'estudiante', creatorId: 'estudiante', protection: protection() },
      }],
    },
  },
]

const copySource = Uint8Array.from({ length: 9_500 }, (_, index) => 65 + (index % 26))

export const ACADEMIC_SCENARIOS: LabScenario[] = [
  {
    id: 'academic-names', title: '4.1.1 · Nomenclatura',
    description: 'Extensiones, bytes sin cambios y nombres que distinguen mayúsculas.',
    defaultFolderId: 'names', primaryProcessId: 'explorer',
    folders: [{ id: 'root', name: 'FileLab' }, { id: 'names', name: 'Nombres', parentId: 'root' }],
    fileLocations: { report: 'names', note: 'names' },
    engine: {
      id: 'academic-names', title: 'Nomenclatura de archivos',
      config: { clockStart: 1_736_035_200_000, clockStep: 1_000, naming: { caseSensitive: true } },
      processes: [{ id: 'explorer', principalId: 'estudiante' }],
      files: [
        { id: 'report', name: 'informe.txt', format: 'ascii', content: encoder.encode('ventas: 42'), attributes: { ownerId: 'estudiante', protection: protection() } },
        { id: 'note', name: 'nota.txt', format: 'ascii', content: encoder.encode('Estos bytes siguen siendo texto.'), attributes: { ownerId: 'estudiante', protection: protection() } },
      ],
    },
  },
  {
    id: 'academic-structures', title: '4.1.2 · Estructuras',
    description: 'Los mismos bytes observados como secuencia, registros fijos o árbol por llave.',
    defaultFolderId: 'structures', primaryProcessId: 'explorer',
    folders: [{ id: 'root', name: 'FileLab' }, { id: 'structures', name: 'Estructuras', parentId: 'root' }],
    fileLocations: { students: 'structures' },
    engine: {
      id: 'academic-structures', title: 'Estructuras de archivos',
      config: { clockStart: 1_736_121_600_000, clockStep: 1_000 },
      processes: [{ id: 'explorer', principalId: 'estudiante' }],
      files: [{
        id: 'students', name: 'alumnos.dat', format: 'ascii', content: encoder.encode('020Luz  050Ana  080Sol  '),
        attributes: { ownerId: 'estudiante', protection: protection(), recordLength: 8, keyOffset: 0, keyLength: 3 },
      }],
    },
  },
  {
    id: 'academic-types', title: '4.1.3 · Tipos',
    description: 'Archivos regulares de texto y binarios junto con tipos especiales representados.',
    defaultFolderId: 'types', primaryProcessId: 'explorer',
    folders: [{ id: 'root', name: 'FileLab' }, { id: 'types', name: 'Tipos', parentId: 'root' }],
    fileLocations: { text: 'types', binary: 'types', terminal: 'types', disk: 'types' },
    engine: {
      id: 'academic-types', title: 'Tipos de archivos',
      config: { clockStart: 1_736_208_000_000, clockStep: 1_000 },
      processes: [{ id: 'explorer', principalId: 'estudiante' }],
      files: [
        { id: 'text', name: 'poema.txt', format: 'ascii', content: encoder.encode('Línea uno\nLínea dos'), attributes: { ownerId: 'estudiante', protection: protection() } },
        { id: 'binary', name: 'programa.bin', format: 'binary', content: new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x02, 0xff, 0x10]), attributes: { ownerId: 'estudiante', protection: protection() } },
        { id: 'terminal', name: 'terminal.char', type: 'character-special', format: 'binary', attributes: { ownerId: 'estudiante', protection: protection() } },
        { id: 'disk', name: 'disco.block', type: 'block-special', format: 'binary', attributes: { ownerId: 'estudiante', protection: protection() } },
      ],
    },
  },
  {
    id: 'academic-access', title: '4.1.4 · Acceso',
    description: 'Lectura desde la posición actual y reposicionamiento explícito con seek.',
    defaultFolderId: 'access', primaryProcessId: 'explorer',
    folders: [{ id: 'root', name: 'FileLab' }, { id: 'access', name: 'Acceso', parentId: 'root' }],
    fileLocations: { flights: 'access' },
    engine: {
      id: 'academic-access', title: 'Acceso secuencial y aleatorio',
      config: { clockStart: 1_736_294_400_000, clockStep: 1_000 },
      processes: [{ id: 'explorer', principalId: 'estudiante' }],
      files: [{ id: 'flights', name: 'vuelos.dat', format: 'ascii', content: encoder.encode('A1B2C3D4E5'), attributes: { ownerId: 'estudiante', protection: protection(), recordLength: 2 } }],
    },
  },
  {
    id: 'academic-attributes', title: '4.1.5 · Atributos',
    description: 'Metadatos, banderas y protección dentro del modelo didáctico de FileLab.',
    defaultFolderId: 'attributes', primaryProcessId: 'explorer',
    folders: [{ id: 'root', name: 'FileLab' }, { id: 'attributes', name: 'Atributos', parentId: 'root' }],
    fileLocations: { confidential: 'attributes' },
    engine: {
      id: 'academic-attributes', title: 'Atributos y protección',
      config: { clockStart: 1_736_380_800_000, clockStep: 60_000 },
      processes: [{ id: 'explorer', principalId: 'estudiante' }, { id: 'guest', principalId: 'visitante' }],
      files: [{ id: 'confidential', name: 'informe-final.txt', format: 'ascii', content: encoder.encode('Resultado aprobado'), attributes: { ownerId: 'estudiante', creatorId: 'estudiante', archive: true, protection: protection(true, false) } }],
    },
  },
  {
    id: 'academic-operations', title: '4.1.6 · Operaciones',
    description: 'Ciclo de vida visible: archivo, descriptor, cursor, resultado y error.',
    defaultFolderId: 'operations', primaryProcessId: 'explorer',
    folders: [{ id: 'root', name: 'FileLab' }, { id: 'operations', name: 'Operaciones', parentId: 'root' }],
    fileLocations: { diary: 'operations' },
    engine: {
      id: 'academic-operations', title: 'Operaciones de archivos',
      config: { clockStart: 1_736_467_200_000, clockStep: 1_000, transfers: { maxReadBytesPerCall: 4, maxWriteBytesPerCall: 4 } },
      processes: [{ id: 'explorer', principalId: 'estudiante' }],
      files: [{ id: 'diary', name: 'diario.txt', format: 'ascii', content: encoder.encode('ABCDEFGH'), attributes: { ownerId: 'estudiante', protection: protection() } }],
    },
  },
  {
    id: 'academic-copyfile', title: '4.1.7 · Copyfile',
    description: 'Origen de 9500 bytes, destino truncado, búfer de 4096 y llamadas sincronizadas.',
    defaultFolderId: 'copy', primaryProcessId: 'explorer',
    folders: [{ id: 'root', name: 'FileLab' }, { id: 'copy', name: 'Copyfile', parentId: 'root' }],
    fileLocations: { source: 'copy', destination: 'copy' },
    engine: {
      id: 'academic-copyfile', title: 'Programa copyfile',
      config: { clockStart: 1_736_553_600_000, clockStep: 1_000, transfers: { maxReadBytesPerCall: 4_096 } },
      processes: [{ id: 'explorer', principalId: 'estudiante' }],
      files: [
        { id: 'source', name: 'origen.bin', format: 'binary', content: copySource, attributes: { ownerId: 'estudiante', protection: protection() } },
        { id: 'destination', name: 'copia.bin', format: 'binary', content: encoder.encode('contenido anterior'), attributes: { ownerId: 'estudiante', protection: protection() } },
      ],
    },
  },
  {
    id: 'repair-system', title: 'Operación Rescate · Reparar el sistema',
    description: 'Escenario local con permisos, descriptores, cursores y orden de operaciones.',
    defaultFolderId: 'repair', primaryProcessId: 'rescuer',
    folders: [{ id: 'root', name: 'FileLab' }, { id: 'repair', name: 'Sistema dañado', parentId: 'root' }],
    fileLocations: { protected: 'repair', records: 'repair', sequence: 'repair' },
    engine: {
      id: 'repair-system', title: 'Sistema dañado',
      config: { clockStart: 1_736_640_000_000, clockStep: 1_000 },
      processes: [{ id: 'rescuer', principalId: 'rescatista' }],
      files: [
        {
          id: 'protected', name: 'reporte-protegido.txt', format: 'ascii',
          content: encoder.encode('REPARAR'),
          attributes: { ownerId: 'rescatista', creatorId: 'rescatista', readOnly: true, protection: protection() },
        },
        {
          id: 'records', name: 'registros.txt', format: 'ascii',
          content: encoder.encode('INICIO|FALLO|RESCATE'),
          attributes: { ownerId: 'rescatista', creatorId: 'rescatista', protection: protection() },
        },
        {
          id: 'sequence', name: 'secuencia.txt', format: 'ascii',
          content: encoder.encode('0123456789'),
          attributes: { ownerId: 'rescatista', creatorId: 'rescatista', protection: protection() },
        },
      ],
    },
  },
  {
    id: 'copyfile-challenge', title: 'Operación Rescate · Copyfile Challenge',
    description: 'Copia interactiva con lecturas de 4096 y escrituras parciales de 2048 bytes.',
    defaultFolderId: 'copy-challenge', primaryProcessId: 'copy-rescuer',
    folders: [{ id: 'root', name: 'FileLab' }, { id: 'copy-challenge', name: 'Copyfile Challenge', parentId: 'root' }],
    fileLocations: { source: 'copy-challenge', destination: 'copy-challenge' },
    engine: {
      id: 'copyfile-challenge', title: 'Copyfile Challenge',
      config: { clockStart: 1_736_726_400_000, clockStep: 1_000, transfers: { maxReadBytesPerCall: 4_096, maxWriteBytesPerCall: 2_048 } },
      processes: [{ id: 'copy-rescuer', principalId: 'rescatista' }],
      files: [
        { id: 'source', name: 'origen-reto.bin', format: 'binary', content: copySource, attributes: { ownerId: 'rescatista', creatorId: 'rescatista', protection: protection() } },
        { id: 'destination', name: 'destino-reto.bin', format: 'binary', content: encoder.encode('datos viejos'), attributes: { ownerId: 'rescatista', creatorId: 'rescatista', protection: protection() } },
      ],
    },
  },
  {
    id: 'escape-room', title: 'Operación Rescate · Escape Room',
    description: 'Misión integradora de nombres, atributos, acceso aleatorio, operaciones y verificación.',
    defaultFolderId: 'rescue', primaryProcessId: 'rescuer',
    folders: [{ id: 'root', name: 'FileLab' }, { id: 'rescue', name: 'Cámara de rescate', parentId: 'root' }],
    fileLocations: { note: 'rescue', image: 'rescue', decoy: 'rescue', archive: 'rescue', recovery: 'rescue' },
    engine: {
      id: 'escape-room', title: 'Cámara de recuperación',
      config: { clockStart: 1_736_812_800_000, clockStep: 1_000 },
      processes: [{ id: 'rescuer', principalId: 'rescatista' }],
      files: [
        { id: 'note', name: 'instrucciones.txt', format: 'ascii', content: encoder.encode('No todo nombre revela el formato.'), attributes: { ownerId: 'rescatista', creatorId: 'rescatista', protection: protection() } },
        { id: 'image', name: 'foto.dat', format: 'ascii', content: encoder.encode('PIXEL-0000'), attributes: { ownerId: 'rescatista', creatorId: 'rescatista', protection: protection() } },
        { id: 'decoy', name: 'rescate.bin', format: 'binary', content: new Uint8Array([0x00, 0x11, 0x22, 0x33]), attributes: { ownerId: 'rescatista', creatorId: 'rescatista', protection: protection() } },
        { id: 'archive', name: 'rescate-final.bin', format: 'binary', content: encoder.encode('HEADER|CLAVE-42|END'), attributes: { ownerId: 'rescatista', creatorId: 'rescatista', readOnly: true, protection: protection() } },
        { id: 'recovery', name: 'recuperacion.txt', format: 'ascii', content: encoder.encode('pendiente'), attributes: { ownerId: 'rescatista', creatorId: 'rescatista', protection: protection() } },
      ],
    },
  },
]

export const LAB_SCENARIOS: LabScenario[] = [...PRACTICE_SCENARIOS, ...ACADEMIC_SCENARIOS]

export const DEFAULT_LAB_SCENARIO_ID = LAB_SCENARIOS[0].id

export function getLabScenario(id: string): LabScenario {
  return LAB_SCENARIOS.find((scenario) => scenario.id === id) ?? LAB_SCENARIOS[0]
}
