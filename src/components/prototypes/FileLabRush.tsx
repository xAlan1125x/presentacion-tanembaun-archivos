import { useEffect, useRef, useState, type DragEvent } from 'react'

type StationId = 'readOnly' | 'hidden' | 'system' | 'archive' | 'txt' | 'csv' | 'png' | 'zip'

interface RushTemplate {
  name: string
  request: string
  state: string
  target: StationId
}

interface RushFile extends RushTemplate {
  id: number
}

const DURATION = 75
const MAX_VISIBLE_FILES = 3
const TEMPLATES: RushTemplate[] = [
  { name: 'config.ini', request: 'Debe impedir modificaciones', state: 'Elegí una bandera', target: 'readOnly' },
  { name: 'contrato.txt', request: 'Debe conservarse sin cambios', state: 'Elegí una bandera', target: 'readOnly' },
  { name: 'secreto.txt', request: 'No debe aparecer en el listado normal', state: 'Elegí una bandera', target: 'hidden' },
  { name: 'perfil.dat', request: 'Debe quedar fuera de la vista habitual', state: 'Elegí una bandera', target: 'hidden' },
  { name: 'inicio.cfg', request: 'Pertenece al sistema ficticio', state: 'Elegí una bandera', target: 'system' },
  { name: 'kernel.lab', request: 'Es importante para FileLab OS', state: 'Elegí una bandera', target: 'system' },
  { name: 'cambios.dat', request: 'Fue modificado y requiere respaldo', state: 'Elegí una bandera', target: 'archive' },
  { name: 'proyecto.lab', request: 'Debe incluirse en el próximo respaldo', state: 'Elegí una bandera', target: 'archive' },
  { name: 'instrucciones', request: 'Contenido de texto simple', state: 'Elegí una extensión', target: 'txt' },
  { name: 'bitacora', request: 'Notas legibles sin formato especial', state: 'Elegí una extensión', target: 'txt' },
  { name: 'ventas', request: 'Tabla con valores separados por comas', state: 'Elegí una extensión', target: 'csv' },
  { name: 'asistencia', request: 'Filas y columnas de datos', state: 'Elegí una extensión', target: 'csv' },
  { name: 'captura', request: 'Imagen de la pantalla', state: 'Elegí una extensión', target: 'png' },
  { name: 'diagrama', request: 'Imagen con transparencia', state: 'Elegí una extensión', target: 'png' },
  { name: 'entrega', request: 'Paquete comprimido de archivos', state: 'Elegí una extensión', target: 'zip' },
  { name: 'respaldo', request: 'Conjunto de archivos comprimidos', state: 'Elegí una extensión', target: 'zip' },
]

const FLAG_STATIONS: Array<{ id: StationId; label: string; hint: string; icon: string }> = [
  { id: 'readOnly', label: 'SÓLO LECTURA', hint: 'Impedir cambios', icon: '◇' },
  { id: 'hidden', label: 'OCULTO', hint: 'No listar normalmente', icon: '◌' },
  { id: 'system', label: 'SISTEMA', hint: 'Archivo del sistema', icon: '⚙' },
  { id: 'archive', label: 'ARCHIVO', hint: 'Pendiente de respaldo', icon: '⚑' },
]

const EXTENSION_STATIONS: Array<{ id: StationId; label: string; hint: string; icon: string }> = [
  { id: 'txt', label: '.TXT', hint: 'Texto simple', icon: 'T' },
  { id: 'csv', label: '.CSV', hint: 'Datos tabulares', icon: '▦' },
  { id: 'png', label: '.PNG', hint: 'Imagen', icon: '▧' },
  { id: 'zip', label: '.ZIP', hint: 'Comprimido', icon: '⇣' },
]

function createRushFile(template: RushTemplate, id: number): RushFile {
  return { ...template, id }
}

export function FileLabRush() {
  const nextId = useRef(1)
  const lastTemplateIndex = useRef(-1)
  const nextSpawnAt = useRef(8)
  const [started, setStarted] = useState(false)
  const [practice, setPractice] = useState(false)
  const [finished, setFinished] = useState(false)
  const [remaining, setRemaining] = useState(DURATION)
  const [elapsed, setElapsed] = useState(0)
  const [files, setFiles] = useState<RushFile[]>([])
  const [selectedId, setSelectedId] = useState<number>()
  const [score, setScore] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [errors, setErrors] = useState(0)
  const [combo, setCombo] = useState(0)
  const [feedbackTone, setFeedbackTone] = useState<'neutral' | 'success' | 'error'>('neutral')
  const [message, setMessage] = useState('Seleccioná un archivo y envialo al destino correcto.')

  useEffect(() => {
    if (!started || finished) return undefined
    const timer = window.setInterval(() => {
      setElapsed((current) => {
        const next = current + 1
        if (next >= nextSpawnAt.current) {
          addFile()
          nextSpawnAt.current += next < 25 ? 8 : next < 50 ? 4 : 2
        }
        return next
      })
      if (practice) return
      setRemaining((current) => {
        if (current <= 1) {
          setFinished(true)
          return 0
        }
        return current - 1
      })
    }, 1000)
    return () => window.clearInterval(timer)
  }, [started, finished, practice])

  function randomTemplate(): RushTemplate {
    let index = Math.floor(Math.random() * TEMPLATES.length)
    if (index === lastTemplateIndex.current) index = (index + 1) % TEMPLATES.length
    lastTemplateIndex.current = index
    return TEMPLATES[index]
  }

  function addFile() {
    const file = createRushFile(randomTemplate(), nextId.current++)
    setFiles((current) => current.length < MAX_VISIBLE_FILES ? [...current, file] : current)
  }

  function start(isPractice: boolean) {
    nextId.current = 1
    lastTemplateIndex.current = -1
    setRemaining(DURATION)
    setElapsed(0)
    setFiles([createRushFile(randomTemplate(), nextId.current++)])
    setSelectedId(undefined)
    setScore(0)
    setCorrect(0)
    setErrors(0)
    setCombo(0)
    setFeedbackTone('neutral')
    setMessage('¡La cinta está en marcha! Leé la necesidad antes de elegir.')
    setFinished(false)
    setPractice(isPractice)
    setStarted(true)
    nextSpawnAt.current = 8
  }

  function route(fileId: number, stationId: StationId) {
    const file = files.find((candidate) => candidate.id === fileId)
    if (!file) return
    const success = file.target === stationId
    setFiles((current) => current.filter((candidate) => candidate.id !== fileId))
    setSelectedId(undefined)
    if (success) {
      const nextCombo = combo + 1
      const earned = 15 + Math.min(15, (nextCombo - 1) * 3)
      setCombo(nextCombo)
      if (!practice) setScore((value) => value + earned)
      setCorrect((value) => value + 1)
      setFeedbackTone('success')
      setMessage((practice ? '' : '+' + earned + ' · ') + '¡Correcto! ' + file.name + ' → ' + stationId.toUpperCase() + '.')
    } else {
      if (!practice) setScore((value) => Math.max(0, value - 5))
      setErrors((value) => value + 1)
      setCombo(0)
      setFeedbackTone('error')
      setMessage((practice ? '' : '−5 · ') + 'Destino incorrecto. Revisá la necesidad del archivo.')
    }
  }

  function drop(event: DragEvent<HTMLButtonElement>, stationId: StationId) {
    event.preventDefault()
    const id = Number(event.dataTransfer.getData('text/plain'))
    if (Number.isFinite(id)) route(id, stationId)
  }

  if (finished) return <PrototypeResult title="Turno finalizado" score={score} detail={`${correct} aciertos · ${errors} errores`} onRestart={() => start(false)} />

  return (
    <main id="contenido" className="prototype-shell rush-prototype">
      <PrototypeHeader label="Prototipo A · arcade" title="FileLab Rush" remaining={practice ? 'LIBRE' : remaining} score={practice ? 0 : score} scoreLabel={practice ? 'Modo práctica · sin puntaje' : undefined} />
      {!started && <section className="factory-preflight rush-preflight" aria-labelledby="rush-preflight-title"><div><span>Antes de arrancar</span><strong id="rush-preflight-title">Observá las banderas, extensiones y la cinta</strong><small>En práctica no hay reloj ni puntaje. Las oleadas aparecen cada vez más seguido.</small></div><div><button type="button" className="prototype-primary" onClick={() => start(false)}>Empezar</button><button type="button" className="prototype-secondary" onClick={() => start(true)}>Practicar</button></div></section>}
      <div className="rush-gamebar"><span>Oleada {elapsed < 25 ? 1 : elapsed < 50 ? 2 : 3}</span><div><i style={{ width: practice ? Math.min(100, elapsed / DURATION * 100) + '%' : ((DURATION - remaining) / DURATION) * 100 + '%' }} /></div><strong className={combo > 1 ? 'is-hot' : ''}>Combo ×{combo}</strong></div>
      <p className="prototype-metaphor prototype-metaphor--compact">Elegí archivo → bandera o extensión. Máximo tres archivos en la cinta.</p>
      <StationRow stations={FLAG_STATIONS} selectedId={selectedId} onRoute={route} onDrop={drop} className="rush-stations rush-stations-top" label="Banderas" />
      <section className="rush-conveyor" aria-label="Cinta de archivos">
        <div className="rush-belt" aria-hidden="true" />
        {files.length === 0 && <p className="rush-empty">{started ? 'Preparando el próximo archivo…' : 'La cinta comenzará cuando elijas un modo.'}</p>}
        {files.map((file) => <button type="button" draggable key={file.id} className={'rush-file file-' + file.target + ' ' + (selectedId === file.id ? 'is-selected' : '')} onClick={() => setSelectedId(file.id)} onDragStart={(event) => event.dataTransfer.setData('text/plain', String(file.id))}><span className="rush-file-icon" aria-hidden="true">▤</span><strong>{file.name}</strong><small>{file.request}</small><em>{file.state}</em><b>{selectedId === file.id ? 'EN MANO' : 'TOCÁ O ARRASTRÁ'}</b></button>)}
      </section>
      <p className={'prototype-feedback is-' + feedbackTone} role="status" aria-live="polite">{message}</p>
      <StationRow stations={EXTENSION_STATIONS} selectedId={selectedId} onRoute={route} onDrop={drop} className="rush-stations rush-stations-bottom" label="Extensiones" />
    </main>
  )
}

function StationRow({ stations, selectedId, onRoute, onDrop, className, label }: { stations: Array<{ id: StationId; label: string; hint: string; icon: string }>; selectedId?: number; onRoute: (fileId: number, stationId: StationId) => void; onDrop: (event: DragEvent<HTMLButtonElement>, stationId: StationId) => void; className: string; label: string }) {
  return <section className={className} aria-label={label}>{stations.map((station) => <button type="button" key={station.id} className={'rush-station station-' + station.id} disabled={!selectedId} onClick={() => selectedId && onRoute(selectedId, station.id)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => onDrop(event, station.id)}><span aria-hidden="true">{station.icon}</span><strong>{station.label}</strong><small>{station.hint}</small></button>)}</section>
}

function PrototypeResult({ title, score, detail, onRestart }: { title: string; score: number; detail: string; onRestart: () => void }) {
  return <main id="contenido" className="prototype-shell prototype-centered"><span className="prototype-eyebrow">Resultado local · no se guarda</span><h1>{title}</h1><strong className="prototype-final-score">{score} puntos</strong><p>{detail}</p><button type="button" className="prototype-primary" onClick={onRestart}>Jugar otra vez</button></main>
}

function PrototypeHeader({ label, title, remaining, score, scoreLabel }: { label: string; title: string; remaining: number | string; score: number; scoreLabel?: string }) {
  return <header className="prototype-header"><div><span className="prototype-eyebrow">{label}</span><h1>{title}</h1></div><div className="prototype-hud"><strong>{typeof remaining === 'number' ? remaining + 's' : remaining}</strong><span>{scoreLabel ?? score + ' puntos'}</span></div></header>
}
