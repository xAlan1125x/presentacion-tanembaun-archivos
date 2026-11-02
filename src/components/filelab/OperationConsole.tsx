import { useState } from 'react'
import type { BufferObservation, ConsoleReply, LabEvent } from '../../lab'
import type { ProcessSnapshot } from '../../engine'

interface OperationConsoleProps {
  events: LabEvent[]
  processes: ProcessSnapshot[]
  buffer?: BufferObservation
  onCommand: (command: string) => ConsoleReply
  onClear: () => void
}

type DockTab = 'console' | 'descriptors' | 'buffer' | 'results'

export function OperationConsole({ events, processes, buffer, onCommand, onClear }: OperationConsoleProps) {
  const [tab, setTab] = useState<DockTab>('console')
  const [command, setCommand] = useState('')
  const [reply, setReply] = useState<ConsoleReply>({ ok: true, message: 'Usá help para ver los comandos disponibles.' })
  const submit = () => {
    const next = onCommand(command)
    setReply(next)
    if (next.clear) onClear()
    setCommand('')
  }
  return (
    <section className="filelab-dock" aria-label="Observador del simulador">
      <div className="filelab-dock-tabs" role="tablist" aria-label="Herramientas internas">
        {([['console','Consola'],['descriptors','Descriptores'],['buffer','Búfer'],['results','Resultados']] as const).map(([id,label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}{id === 'descriptors' && <span>{processes.reduce((sum, process) => sum + process.openFiles.length, 0)}</span>}</button>)}
      </div>
      <div className="filelab-dock-body" role="tabpanel">
        {tab === 'console' && <div className="console-panel"><form onSubmit={(event) => { event.preventDefault(); submit() }}><span aria-hidden="true">›</span><label className="sr-only" htmlFor="filelab-command">Comando del motor</label><input id="filelab-command" value={command} onChange={(event) => setCommand(event.target.value)} placeholder='Ej.: open "informe.txt" read' autoComplete="off" /><button type="submit">Ejecutar</button></form><p className={reply.ok ? 'console-reply' : 'console-reply is-error'} aria-live="polite">{reply.message}</p></div>}
        {tab === 'descriptors' && <div className="descriptor-table"><div className="descriptor-head"><span>Proceso</span><span>FD</span><span>Archivo</span><span>Modo</span><span>Cursor</span></div>{processes.flatMap((process) => process.openFiles.map((handle) => <div key={`${process.id}-${handle.descriptor}`}><span>{process.id}</span><strong>{handle.descriptor}</strong><code>{handle.fileId}</code><span>{handle.mode}</span><strong>{handle.position}</strong></div>))}{processes.every((process) => process.openFiles.length === 0) && <p className="filelab-empty">No hay descriptores abiertos.</p>}</div>}
        {tab === 'buffer' && (buffer ? <div className="buffer-observer"><div><span>Operación</span><strong>{buffer.operation}</strong></div><div><span>Solicitados</span><strong>{buffer.requested} B</strong></div><div><span>Transferidos</span><strong>{buffer.transferred} B</strong></div><div><span>Cursor</span><strong>{buffer.positionBefore} → {buffer.positionAfter}</strong></div><code>{[...buffer.buffer.data].map((byte, index) => index < buffer.buffer.validLength ? byte.toString(16).padStart(2,'0') : '··').join(' ') || 'búfer vacío'}</code></div> : <p className="filelab-empty">Ejecutá read, write o append para observar el último búfer.</p>)}
        {tab === 'results' && <div className="event-log" aria-live="polite">{[...events].reverse().map((event) => <article key={event.id} className={`event-${event.kind} event-${event.status}`}><span>{event.kind === 'interface' ? 'Interfaz' : event.kind === 'engine' ? 'Motor' : 'Sistema'}</span><code>{event.operation}</code><p>{event.message}</p>{event.errorCode && <strong>{event.errorCode}</strong>}</article>)}{events.length === 0 && <p className="filelab-empty">El historial está vacío.</p>}</div>}
      </div>
    </section>
  )
}
