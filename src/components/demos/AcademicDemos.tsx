import { useRef, useState } from 'react'
import type { EngineResult, FileSnapshot } from '../../engine'
import { CopyfileSimulation } from '../../demos/CopyfileSimulation'
import { HexView } from '../filelab/HexView'
import { DemoFrame } from './DemoFrame'
import { useDemoSession } from './useDemoSession'

const decoder = new TextDecoder()
const encoder = new TextEncoder()
const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
const describe = (result: EngineResult<unknown>) => result.ok ? `✓ ${result.operation}: operación completada.` : `✕ ${result.operation} · ${result.error.code}: ${result.error.message}`

export function NamingDemo() {
  const { session, snapshot, refresh, reset: restore } = useDemoSession('academic-names')
  const [message, setMessage] = useState('Elegí un experimento y anticipá el resultado antes de ejecutarlo.')
  const reset = () => { restore(); setMessage('Escenario restaurado: nombres y bytes volvieron al estado inicial.') }
  const note = snapshot.engine.files.find((file) => file.id === 'note')!
  const runCase = () => { const result = session.createFile('Informe.txt'); setMessage(result.ok ? 'Se creó Informe.txt: este escenario distingue mayúsculas, por eso no colisionó con informe.txt.' : describe(result)); refresh() }
  const changeExtension = () => { const before = note.content; const result = session.renameFile('note', 'nota.jpg'); const after = session.snapshot().engine.files.find((file) => file.id === 'note')!.content; setMessage(result.ok ? `Cambió el nombre, pero los ${after.length} bytes son idénticos: ${hex(before)}.` : describe(result)); refresh() }
  return (
    <DemoFrame number="01" title="Laboratorio de nombres" description="Dos experimentos; ninguna extensión transforma el contenido." onReset={reset}>
      <div className="naming-demo">
        <div className="demo-file-shelf">{snapshot.engine.files.map((file) => <article key={file.id}><span>{file.name.split('.').at(-1)?.toUpperCase()}</span><strong>{file.name}</strong><small>{file.size} B · {file.format}</small></article>)}</div>
        <div className="demo-actions"><button type="button" onClick={runCase}>Crear “Informe.txt”</button><button type="button" onClick={changeExtension}>Renombrar nota.txt → nota.jpg</button></div>
        <div className="demo-result" aria-live="polite"><span>Resultado explicado</span><p>{message}</p></div>
      </div>
    </DemoFrame>
  )
}

type StructureModel = 'bytes' | 'records' | 'tree'
export function StructureDemo() {
  const { session, snapshot, refresh, reset: restore } = useDemoSession('academic-structures')
  const [model, setModel] = useState<StructureModel>('bytes')
  const [descriptor, setDescriptor] = useState<number>()
  const [message, setMessage] = useState('El motor conserva 24 bytes. La forma de interpretarlos depende del modelo.')
  const file = snapshot.engine.files[0]
  const records = [0, 8, 16].map((start) => decoder.decode(file.content.slice(start, start + 8)))
  const runRead = (position: number, count: number, label: string) => {
    let fd = descriptor
    if (fd === undefined) { const opened = session.open(file.id, 'read'); if (!opened.ok) { setMessage(describe(opened)); return } fd = opened.value.descriptor; setDescriptor(fd) }
    const seek = session.seek(fd, position)
    if (!seek.ok) { setMessage(describe(seek)); refresh(); return }
    const read = session.read(fd, count)
    setMessage(read.ok ? `${label}: “${decoder.decode(read.value.buffer.data.slice(0, read.value.buffer.validLength))}”. Cursor ${read.value.positionBefore} → ${read.value.positionAfter}.` : describe(read))
    refresh()
  }
  const reset = () => { restore(); setDescriptor(undefined); setModel('bytes'); setMessage('Escenario restaurado: 24 bytes y cursor cerrado.') }
  return (
    <DemoFrame number="02" title="Tres estructuras, un archivo" description="Modelos descritos por Tanenbaum; la animación es una representación de FileLab." onReset={reset}>
      <div className="structure-demo">
        <div className="model-tabs" role="tablist">{([['bytes','Secuencia de bytes'],['records','Registros fijos'],['tree','Árbol por llave']] as const).map(([id,label]) => <button key={id} role="tab" aria-selected={model === id} className={model === id ? 'is-active' : ''} type="button" onClick={() => setModel(id)}>{label}</button>)}</div>
        {model === 'bytes' && <div className="byte-sequence">{[...file.content].map((byte, index) => <button type="button" key={index} onClick={() => runRead(index, 1, `Byte ${index}`)}><small>{index}</small><strong>{byte.toString(16).padStart(2,'0')}</strong><span>{byte >= 32 ? String.fromCharCode(byte) : '·'}</span></button>)}</div>}
        {model === 'records' && <div className="record-demo">{records.map((record,index) => <button type="button" key={record} onClick={() => runRead(index * 8, 8, `Registro ${index + 1}`)}><span>registro {index + 1}</span><strong>{record.slice(0,3)}</strong><b>{record.slice(3)}</b><small>8 bytes</small></button>)}</div>}
        {model === 'tree' && <div className="record-tree"><button type="button" onClick={() => runRead(8,8,'Llave 050')}>050 · Ana</button><div><button type="button" onClick={() => runRead(0,8,'Llave 020')}>020 · Luz</button><button type="button" onClick={() => runRead(16,8,'Llave 080')}>080 · Sol</button></div><p>La llave guía la búsqueda; FileLab muestra el registro localizado.</p></div>}
        <div className="demo-result"><span>Observación</span><p>{message}</p></div>
      </div>
    </DemoFrame>
  )
}

export function TypesDemo() {
  const { session, snapshot, refresh, reset: restore } = useDemoSession('academic-types')
  const [selected, setSelected] = useState<FileSnapshot>(snapshot.engine.files[0])
  const [message, setMessage] = useState('Seleccioná un tipo y pedí al motor que lo abra.')
  const [bytes, setBytes] = useState<Uint8Array>()
  const [terminalInput, setTerminalInput] = useState('')
  const [terminalReceived, setTerminalReceived] = useState('')
  const [selectedBlock, setSelectedBlock] = useState<number>()
  const blocks = [
    { number: 0, data: '4F 53 2D 30 31', label: 'cabecera del sistema' },
    { number: 1, data: '46 49 4C 45 4C 41 42', label: 'datos de FileLab' },
    { number: 2, data: '00 01 02 03 04 05', label: 'índice de bloques' },
    { number: 3, data: 'FF EE DD CC BB AA', label: 'bloque de respaldo' },
  ]
  const inspect = (file: FileSnapshot) => {
    setSelected(file); setBytes(undefined)
    setTerminalReceived(''); setSelectedBlock(undefined)
    const opened = session.open(file.id, 'read')
    if (!opened.ok) {
      setMessage(file.type === 'character-special'
        ? 'terminal.char representa una terminal: escribí un mensaje para simular su recepción.'
        : 'disco.block representa un dispositivo de bloques: seleccioná un bloque para inspeccionar sus datos.')
      refresh()
      return
    }
    const read = session.read(opened.value.descriptor, file.size)
    session.close(opened.value.descriptor)
    if (read.ok) { const valid = read.value.buffer.data.slice(0, read.value.buffer.validLength); setBytes(valid); setMessage(file.format === 'ascii' ? 'Archivo regular de texto: los bytes se interpretan como caracteres.' : 'Archivo regular binario: las posiciones son bytes, pero no todos representan texto legible.') }
    refresh()
  }
  const sendToTerminal = () => {
    const value = terminalInput.trim()
    if (!value) return
    setTerminalReceived(value)
    setTerminalInput('')
    setMessage(`La terminal recibió “${value}”. Es una simulación de E/S de caracteres, no una terminal real.`)
  }
  const selectBlock = (block: typeof blocks[number]) => {
    setSelectedBlock(block.number)
    setMessage(`Bloque ${block.number} seleccionado: ${block.label}. Es una simulación educativa de almacenamiento por bloques, no acceso a un disco real.`)
  }
  const reset = () => { restore(); setSelected(session.snapshot().engine.files[0]); setBytes(undefined); setTerminalInput(''); setTerminalReceived(''); setSelectedBlock(undefined); setMessage('Escenario restaurado.') }
  return (
    <DemoFrame number="03" title="La evidencia está en los bytes" description="Regular no significa texto; los especiales representan dispositivos en sistemas como UNIX." onReset={reset}>
      <div className="types-demo"><div className="type-file-grid">{snapshot.engine.files.map((file) => <button type="button" key={file.id} className={selected.id === file.id ? 'is-active' : ''} onClick={() => inspect(file)}><span>{file.type === 'regular' ? (file.format === 'ascii' ? 'TXT' : 'BIN') : file.type === 'character-special' ? 'CHR' : 'BLK'}</span><strong>{file.name}</strong><small>{file.type}</small></button>)}</div>
        <div className="type-inspector"><header><strong>{selected.name}</strong><span>{selected.type} · {selected.format}</span></header>{bytes ? <><HexView bytes={bytes} />{selected.format === 'ascii' && <pre>{decoder.decode(bytes)}</pre>}</> : selected.type === 'character-special' ? <div className="special-simulation"><p>Dispositivo especial de caracteres: recibe un flujo de datos.</p><label htmlFor="terminal-message">Mensaje para la terminal</label><div><input id="terminal-message" value={terminalInput} onChange={(event) => setTerminalInput(event.target.value)} placeholder="Escribí un mensaje" /><button type="button" onClick={sendToTerminal}>Enviar</button></div>{terminalReceived && <output>Recepción: {terminalReceived}</output>}<small>Simulación educativa; no accede al hardware real.</small></div> : selected.type === 'block-special' ? <div className="special-simulation"><p>Dispositivo especial de bloques: seleccioná una unidad de almacenamiento.</p><div className="block-grid">{blocks.map((block) => <button type="button" key={block.number} className={selectedBlock === block.number ? 'is-active' : ''} onClick={() => selectBlock(block)}><strong>Bloque {block.number}</strong><code>{block.data}</code><small>{block.label}</small></button>)}</div><small>Simulación educativa; no accede a un disco real.</small></div> : <div className="special-placeholder">Seleccioná un archivo para inspeccionarlo.</div>}</div>
        <div className="demo-result"><span>Conclusión</span><p>{message}</p></div></div>
    </DemoFrame>
  )
}

export function AccessDemo() {
  const { session, snapshot, refresh, reset: restore } = useDemoSession('academic-access')
  const [descriptor, setDescriptor] = useState<number>()
  const [lastReadPosition, setLastReadPosition] = useState<number>()
  const [message, setMessage] = useState('El cursor empieza en 0. Cada registro ocupa 2 bytes.')
  const ensureOpen = () => { if (descriptor !== undefined) return descriptor; const opened = session.open('flights','read'); if (!opened.ok) return undefined; setDescriptor(opened.value.descriptor); return opened.value.descriptor }
  const read = () => { const fd=ensureOpen(); if(fd===undefined)return; const result=session.read(fd,2); setLastReadPosition(result.ok && result.value.outcome !== 'eof' ? result.value.positionBefore : undefined); setMessage(result.ok ? result.value.outcome === 'eof' ? 'EOF: lectura exitosa con 0 bytes; no es un error.' : `Leído “${decoder.decode(result.value.buffer.data.slice(0,result.value.buffer.validLength))}”; cursor ${result.value.positionBefore} → ${result.value.positionAfter}.` : describe(result)); refresh() }
  const jump = (record: number) => { const fd=ensureOpen(); if(fd===undefined)return; const seek=session.seek(fd,record*2); if(!seek.ok){setMessage(describe(seek));refresh();return} const result=session.read(fd,2); setLastReadPosition(result.ok && result.value.outcome !== 'eof' ? result.value.positionBefore : undefined); setMessage(result.ok ? `seek llevó el cursor a ${record*2}; se leyó directamente “${decoder.decode(result.value.buffer.data.slice(0,result.value.buffer.validLength))}”.` : describe(result)); refresh() }
  const reset=()=>{restore();setDescriptor(undefined);setLastReadPosition(undefined);setMessage('Cursor cerrado y escenario restaurado.')}
  const position=snapshot.engine.processes[0].openFiles.find((handle)=>handle.descriptor===descriptor)?.position ?? 0
  return <DemoFrame number="04" title="Recorrer o saltar" description="Cada registro ocupa 2 bytes: se distingue lo leído, el cursor actual y el próximo registro." onReset={reset}><div className="access-demo"><div className="record-track interactive-track">{['A1','B2','C3','D4','E5'].map((record,index)=><button type="button" key={record} className={`${lastReadPosition === index*2 ? 'is-read' : ''} ${position === index*2 ? 'is-next' : ''}`} onClick={()=>jump(index)}><small>{index*2}</small><strong>{record}</strong>{lastReadPosition === index*2 && <em>leído</em>}{position === index*2 && <em>próximo</em>}</button>)}<span className="cursor-label" style={{'--cursor':Math.min(position/2,5)} as React.CSSProperties}>▲ cursor {position}</span></div><div className="demo-actions"><button type="button" onClick={read}>Leer siguiente registro</button><button type="button" onClick={()=>jump(3)}>seek(6) + read(2)</button><button type="button" onClick={()=>{const fd=ensureOpen();if(fd!==undefined){session.seek(fd,10);setLastReadPosition(undefined);refresh();setMessage('Cursor situado al final. La próxima lectura mostrará EOF.')}}}>Ir al final</button></div><div className="demo-result"><span>Resultado</span><p>{message}</p></div></div></DemoFrame>
}

export function AttributesDemo() {
  const { session, snapshot, refresh, reset: restore } = useDemoSession('academic-attributes')
  const [message,setMessage]=useState('El archivo permite lectura a otros, pero sólo el propietario puede escribir y cambiar atributos.')
  const file=snapshot.engine.files[0]
  const guestWrite=()=>{const result=session.open(file.id,'write','guest');setMessage(result.ok?'Apertura inesperada.':`${result.error.code}: el proceso visitante no tiene permiso de escritura.`);refresh()}
  const toggleReadOnly=()=>{const result=session.setAttributes(file.id,{readOnly:!file.attributes.readOnly});setMessage(result.ok?`Bandera sólo lectura: ${!file.attributes.readOnly?'activada':'desactivada'}. Los bytes no cambiaron.`:describe(result));refresh()}
  const ownerWrite=()=>{const result=session.open(file.id,'write');if(result.ok)session.close(result.value.descriptor);setMessage(result.ok?'El propietario pudo abrir para escritura.':`${result.error.code}: la bandera sólo lectura bloquea incluso al propietario.`);refresh()}
  const reset=()=>{restore();setMessage('Atributos y permisos restaurados.')}
  return <DemoFrame number="05" title="Metadatos que describen y controlan" description="Protección y banderas del modelo didáctico FileLab, no permisos universales." onReset={reset}><div className="attributes-demo"><div className="attribute-file-card"><span>TXT</span><strong>{file.name}</strong><small>{file.size} bytes de contenido</small></div><dl className="attribute-grid"><div><dt>Propietario</dt><dd>{file.attributes.ownerId}</dd></div><div><dt>Modificado</dt><dd>{new Date(file.attributes.lastModifiedAt).toLocaleTimeString('es-AR')}</dd></div><div><dt>Sólo lectura</dt><dd>{file.attributes.readOnly?'Sí':'No'}</dd></div><div><dt>Archivo</dt><dd>{file.attributes.archive?'Sí':'No'}</dd></div><div><dt>Otros · leer</dt><dd>{file.attributes.protection.others.read?'Sí':'No'}</dd></div><div><dt>Otros · escribir</dt><dd>{file.attributes.protection.others.write?'Sí':'No'}</dd></div></dl><div className="demo-actions"><button type="button" onClick={guestWrite}>Visitante intenta escribir</button><button type="button" onClick={toggleReadOnly}>{file.attributes.readOnly?'Quitar':'Activar'} sólo lectura</button><button type="button" onClick={ownerWrite}>Propietario intenta escribir</button></div><div className="didactic-warning">Modelo FileLab didactic v1 · simplifica propietario/otros y no representa POSIX ni ACL.</div><div className="demo-result"><span>Diagnóstico</span><p>{message}</p></div></div></DemoFrame>
}

const operationNames = ['create','delete','open','close','read','write','append','seek','get attributes','set attributes','rename']
export function OperationsDemo() {
  const { session, snapshot, refresh, reset: restore } = useDemoSession('academic-operations')
  const [descriptor,setDescriptor]=useState<number>()
  const [message,setMessage]=useState('Elegí una operación. Si falta un descriptor, el error también es parte del resultado.')
  const run=(name:string)=>{
    let result:EngineResult<unknown>
    const diary=session.snapshot().engine.files.find((file)=>file.id==='diary')
    const created=session.snapshot().engine.files.find((file)=>file.name==='nuevo.txt')
    switch(name){
      case 'create': result=session.createFile('nuevo.txt');break
      case 'delete': result=created?session.deleteFile(created.id):session.deleteFile('inexistente');break
      case 'open': {const opened=session.open('diary','read-write');result=opened;if(opened.ok)setDescriptor(opened.value.descriptor);break}
      case 'close': result=session.close(descriptor??99);if(result.ok)setDescriptor(undefined);break
      case 'read': result=session.read(descriptor??99,4);break
      case 'write': result=session.write(descriptor??99,encoder.encode('XYZ'));break
      case 'append': result=session.append(descriptor??99,encoder.encode('!'));break
      case 'seek': result=session.seek(descriptor??99,0);break
      case 'get attributes': result=session.getAttributes('diary');break
      case 'set attributes': result=session.setAttributes('diary',{hidden:!diary?.attributes.hidden});break
      default: result=session.renameFile('diary',diary?.name==='diario.txt'?'registro.txt':'diario.txt')
    }
    setMessage(describe(result));refresh()
  }
  const reset=()=>{restore();setDescriptor(undefined);setMessage('Escenario y descriptores restaurados.')}
  const process=snapshot.engine.processes[0]
  return <DemoFrame number="06" title="Once operaciones, resultados explícitos" description="Las acciones de esta consola invocan directamente el motor de FileLab." onReset={reset}><div className="operations-demo"><div className="operation-pad">{operationNames.map((name)=><button type="button" key={name} onClick={()=>run(name)}>{name}</button>)}</div><div className="descriptor-monitor"><header><span>Tabla del proceso</span><strong>{process.id}</strong></header>{process.openFiles.length?process.openFiles.map((handle)=><div key={handle.descriptor}><b>fd {handle.descriptor}</b><span>{handle.fileId}</span><code>{handle.mode}</code><strong>cursor {handle.position}</strong></div>):<p>Sin descriptores abiertos</p>}</div><div className="operation-files">{snapshot.engine.files.map((file)=><span key={file.id}><strong>{file.name}</strong><small>{file.size} B {file.attributes.hidden?'· oculto':''}</small></span>)}</div><div className="demo-result"><span>Último resultado</span><p>{message}</p></div></div></DemoFrame>
}

const copyCode = [
  { text: '/* Programa para copiar archivos. La verificación y el reporte de errores son mínimos. */' },
  { text: '#include <sys/types.h>' },
  { text: '#include <fcntl.h>' },
  { text: '#include <stdlib.h>' },
  { text: '#include <unistd.h>' },
  { text: '' },
  { text: 'int main(int argc, char *argv[]);                         /* prototipo ANSI */' },
  { text: '' },
  { text: '#define TAM_BUF 4096                                      /* usa un tamaño de búfer de 4096 bytes */' },
  { text: '#define MODO_SALIDA 0700                                  /* bits de protección para el archivo de salida */' },
  { text: '' },
  { text: 'int main(int argc, char *argv[])' },
  { text: '{' },
  { text: '        int ent_da, sal_da, leer_cuenta, escribir_cuenta;' },
  { text: '        char bufer[TAM_BUF];' },
  { text: '' },
  { text: '        if (argc != 3) exit(1);                           /* error de sintaxis si argc no es 3 */' },
  { text: '' },
  { text: '        /* Abre el archivo de entrada y crea el archivo de salida */' },
  { text: '        ent_da = open(argv[1], O_RDONLY);                  /* abre el archivo fuente */', step: 1 },
  { text: '        if (ent_da < 0) exit(2);                           /* si no se puede abrir, termina */' },
  { text: '        sal_da = creat(argv[2], MODO_SALIDA);              /* crea el archivo de destino */', step: 2 },
  { text: '        if (sal_da < 0) exit(3);                           /* si no se puede crear, termina */' },
  { text: '' },
  { text: '        /* Ciclo de copia */' },
  { text: '        while (TRUE) {' },
  { text: '                leer_cuenta = read(ent_da, bufer, TAM_BUF); /* lee un bloque de datos */', step: 3 },
  { text: '                if (leer_cuenta <= 0) break;               /* si llega al fin de archivo o hay un error, sale del ciclo */', step: 5 },
  { text: '                escribir_cuenta = write(sal_da, bufer, leer_cuenta); /* escribe los datos */', step: 4 },
  { text: '                if (escribir_cuenta <= 0) exit(4);         /* escribir_cuenta <= 0 es un error */' },
  { text: '        }' },
  { text: '' },
  { text: '        /* Cierra los archivos */' },
  { text: '        close(ent_da);', step: 6 },
  { text: '        close(sal_da);', step: 7 },
  { text: '        if (leer_cuenta == 0)                               /* no hubo error en la última lectura */' },
  { text: '                exit(0);' },
  { text: '        else' },
  { text: '                exit(5);                                   /* hubo un error en la última lectura */' },
  { text: '}' },
]
export function CopyfileDemo() {
  const simulationRef=useRef(new CopyfileSimulation())
  const [snapshot,setSnapshot]=useState(simulationRef.current.snapshot())
  const reset=()=>setSnapshot(simulationRef.current.restore())
  const state=snapshot.state
  const source=snapshot.lab.engine.files.find((file)=>file.id==='source')!
  const destination=snapshot.lab.engine.files.find((file)=>file.id==='destination')!
  return <DemoFrame number="07" title="Copyfile, llamada por llamada" description="Código completo de ejemplo y animación de sus operaciones principales." onReset={reset}><div className="copyfile-demo"><div className="copy-visual"><article><span>Origen</span><strong>{source.name}</strong><b>{source.size} B</b><small>fd {state.inputDescriptor??'—'}</small></article><div className="live-buffer"><span>Búfer · capacidad 4096 B</span><div><i style={{width:`${Math.min(100,(state.pendingBytes.length/4096)*100)}%`}} /></div><strong>{state.pendingBytes.length} byte(s) pendientes</strong><small>última lectura {state.lastRead} · última escritura {state.lastWrite}</small></div><article><span>Destino</span><strong>{destination.name}</strong><b>{destination.size} B</b><small>fd {state.outputDescriptor??'—'}</small></article></div><div className="copy-workbench"><pre>{copyCode.map((line,index)=><code key={`${index}-${line.text}`} className={state.activeLine===line.step?'is-active':''}><span>{index+1}</span>{line.text}</code>)}</pre><div className="copy-stats"><div><span>Total copiado</span><strong>{state.bytesCopied} / 9500 B</strong></div><div><span>Iteraciones escritas</span><strong>{state.iterations}</strong></div><div><span>Próxima llamada</span><strong>{state.nextAction}</strong></div><button type="button" disabled={state.completed||state.nextAction==='error'} onClick={()=>setSnapshot(simulationRef.current.next())}>{state.completed?'Copia completa':'Ejecutar siguiente llamada →'}</button></div></div><div className="demo-result"><span>Traza sincronizada</span><p>{state.message}</p></div><p className="robustness-note"><strong>Complemento de robustez:</strong> la simulación ejecuta las llamadas principales y conserva las comprobaciones de error visibles en el ejemplo.</p></div></DemoFrame>
}
