import { useCallback, useMemo, useRef, useState } from 'react'
import type { FileSnapshot, MutableFileAttributes } from '../../engine'
import { FileLabSession, LAB_SCENARIOS, type EditorDocument } from '../../lab'
import { FileLabDialog } from './FileLabDialog'
import { HexView } from './HexView'
import { OperationConsole } from './OperationConsole'
import { PropertiesInspector } from './PropertiesInspector'

type DialogState = { type: 'create'; value: string } | { type: 'rename'; value: string } | { type: 'delete'; value: string } | null
type EditorView = 'text' | 'hex'
interface EditorWindow { document: EditorDocument; draft: string; view: EditorView; dirty: boolean }

const fileGlyph = (file: FileSnapshot) => file.format === 'binary' ? 'BIN' : file.name.endsWith('.c') ? '</>' : 'TXT'
const friendlyError = (operation: string, code: string, message: string) => `${operation} falló (${code}): ${message}`

export function FileLabOS() {
  const sessionRef = useRef(new FileLabSession())
  const [revision, setRevision] = useState(0)
  const [selectedId, setSelectedId] = useState<string>()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [editors, setEditors] = useState<EditorWindow[]>([])
  const [activeEditorId, setActiveEditorId] = useState<string>()
  const [status, setStatus] = useState('Laboratorio listo. Las acciones de interfaz y las operaciones internas se registran por separado.')
  const session = sessionRef.current
  const snapshot = useMemo(() => session.snapshot(), [session, revision])
  const files = useMemo(() => session.filesInFolder(snapshot.currentFolderId), [session, snapshot.currentFolderId, revision])
  const selected = snapshot.engine.files.find((file) => file.id === selectedId)
  const activeEditor = editors.find((editor) => editor.document.fileId === activeEditorId)
  const currentFolder = snapshot.folders.find((folder) => folder.id === snapshot.currentFolderId)!

  const refresh = useCallback(() => setRevision((value) => value + 1), [])
  const closeDialog = useCallback(() => setDialog(null), [])
  const report = (message: string) => { setStatus(message); refresh() }
  const interfaceAction = (operation: string, message: string) => session.interfaceAction(operation, message)

  const selectFile = (file: FileSnapshot) => {
    setSelectedId(file.id)
    interfaceAction('seleccionar', `Seleccionar “${file.name}” (sin llamada interna).`)
    report(`${file.name} seleccionado. Esta acción visual no abrió el archivo.`)
  }

  const openFile = async (file = selected) => {
    if (!file) return
    const existing = editors.find((editor) => editor.document.fileId === file.id)
    if (existing) { setActiveEditorId(file.id); report(`La ventana de ${file.name} ya estaba abierta.`); return }
    interfaceAction('abrir ventana', `Abrir “${file.name}” desde el explorador.`)
    const result = await session.openEditor(file.id)
    if (!result.ok) { report(friendlyError('Abrir', result.error.code, result.error.message)); return }
    const editor: EditorWindow = { document: result.value, draft: result.value.text, view: file.format === 'binary' ? 'hex' : 'text', dirty: false }
    setEditors((current) => [...current, editor])
    setActiveEditorId(file.id)
    report(`${file.name} abierto con descriptor ${result.value.descriptor}${result.value.readOnly ? ' en modo lectura' : ''}.`)
  }

  const saveEditor = (editor: EditorWindow) => {
    interfaceAction('guardar ventana', `Guardar cambios de “${editor.document.name}”.`)
    const result = session.saveEditor(editor.document, editor.draft)
    if (!result.ok) { report(friendlyError('Guardar', result.error.code, result.error.message)); return }
    setEditors((current) => current.map((item) => item.document.fileId === editor.document.fileId ? { ...item, document: result.value, dirty: false } : item))
    report(`${editor.document.name} guardado: ${result.value.bytes.length} byte(s).`)
  }

  const closeEditor = (editor: EditorWindow) => {
    interfaceAction('cerrar ventana', `Cerrar ventana de “${editor.document.name}”.`)
    const result = session.closeEditor(editor.document)
    setEditors((current) => current.filter((item) => item.document.fileId !== editor.document.fileId))
    setActiveEditorId((current) => current === editor.document.fileId ? undefined : current)
    report(result.ok ? `${editor.document.name} cerrado; descriptor liberado.` : friendlyError('Cerrar', result.error.code, result.error.message))
  }

  const submitDialog = () => {
    if (!dialog) return
    if (dialog.type === 'create') {
      interfaceAction('nuevo archivo', `Solicitar creación de “${dialog.value}”.`)
      const result = session.createFile(dialog.value)
      if (!result.ok) { report(friendlyError('Crear', result.error.code, result.error.message)); return }
      setSelectedId(result.value.file.id); report(`${result.value.file.name} creado en ${currentFolder.name}.`)
    } else if (dialog.type === 'rename' && selected) {
      interfaceAction('renombrar', `Solicitar nuevo nombre “${dialog.value}”.`)
      const result = session.renameFile(selected.id, dialog.value)
      if (!result.ok) { report(friendlyError('Renombrar', result.error.code, result.error.message)); return }
      setEditors((current) => current.map((editor) => editor.document.fileId === selected.id ? { ...editor, document: { ...editor.document, name: dialog.value } } : editor))
      report(`Archivo renombrado de ${result.value.previousName} a ${dialog.value}; sus bytes no cambiaron.`)
    } else if (dialog.type === 'delete' && selected) {
      interfaceAction('eliminar', `Solicitar eliminación de “${selected.name}”.`)
      const result = session.deleteFile(selected.id)
      if (!result.ok) { report(friendlyError('Eliminar', result.error.code, result.error.message)); return }
      setSelectedId(undefined); report(`${result.value.name} eliminado del escenario actual.`)
    }
    setDialog(null)
  }

  const applyAttributes = (patch: MutableFileAttributes) => {
    if (!selected) return
    interfaceAction('aplicar propiedades', `Modificar atributos de “${selected.name}”.`)
    const result = session.setAttributes(selected.id, patch)
    report(result.ok ? `Atributos de ${selected.name} actualizados en el modelo didáctico.` : friendlyError('Modificar atributos', result.error.code, result.error.message))
  }

  const changeScenario = (scenarioId: string) => {
    editors.forEach((editor) => session.closeEditor(editor.document))
    session.loadScenario(scenarioId)
    setEditors([]); setActiveEditorId(undefined); setSelectedId(undefined)
    report(`Escenario “${session.snapshot().scenario.title}” cargado.`)
  }

  const restore = () => {
    interfaceAction('restaurar', 'Restaurar el escenario seleccionado.')
    session.restoreScenario(); setEditors([]); setActiveEditorId(undefined); setSelectedId(undefined)
    report('Escenario restaurado a su estado preparado; se cerraron todos los descriptores.')
  }

  const reset = () => {
    session.resetLab(); setEditors([]); setActiveEditorId(undefined); setSelectedId(undefined)
    report('Laboratorio reiniciado al espacio de trabajo inicial.')
  }

  return (
    <div className="filelab-shell">
      <div className="filelab-titlebar"><div className="window-dots" aria-hidden="true"><i /><i /><i /></div><strong>FileLab OS · Explorador</strong><span className="functional-badge">Motor conectado</span></div>
      <div className="filelab-scope"><strong>Simulación educativa.</strong> Los archivos y carpetas son ficticios. La columna “Interfaz” describe gestos visuales; “Motor” muestra operaciones internas de FileLab, no reglas universales de otros sistemas.</div>
      <div className="filelab-scenario-bar">
        <label>Escenario<select value={snapshot.scenario.id} onChange={(event) => changeScenario(event.target.value)}>{LAB_SCENARIOS.map((scenario) => <option key={scenario.id} value={scenario.id}>{scenario.title}</option>)}</select></label>
        <p>{snapshot.scenario.description}</p>
        <div><button type="button" onClick={restore}>↶ Restaurar escenario</button><button type="button" className="danger-soft" onClick={reset}>Reinicio general</button></div>
      </div>
      <div className="filelab-toolbar">
        <div className="filelab-breadcrumb" aria-label="Ruta actual"><span>FileLab</span><b>/</b><strong>{currentFolder.name}</strong></div>
        <div className="filelab-actions" aria-label="Acciones de archivo">
          <button type="button" onClick={() => setDialog({ type: 'create', value: 'nuevo.txt' })}>＋ Nuevo</button>
          <button type="button" disabled={!selected} onClick={() => void openFile()}>Abrir</button>
          <button type="button" disabled={!selected} onClick={() => selected && setDialog({ type: 'rename', value: selected.name })}>Renombrar</button>
          <button type="button" disabled={!selected} onClick={() => setDialog({ type: 'delete', value: '' })}>Eliminar</button>
        </div>
      </div>
      <div className="filelab-workspace">
        <nav className="filelab-folders" aria-label="Carpetas simuladas"><p>Carpetas</p>{snapshot.folders.filter((folder) => folder.id !== 'root').map((folder) => <button type="button" key={folder.id} className={folder.id === snapshot.currentFolderId ? 'is-current' : ''} aria-current={folder.id === snapshot.currentFolderId ? 'page' : undefined} onClick={() => { session.navigate(folder.id); setSelectedId(undefined); report(`Carpeta ${folder.name} abierta.`) }}><span aria-hidden="true">▰</span>{folder.name}<small>{snapshot.engine.files.filter((file) => snapshot.fileLocations[file.id] === folder.id).length}</small></button>)}</nav>
        <main className="filelab-files" aria-label={`Archivos en ${currentFolder.name}`}>
          <header><div><strong>{currentFolder.name}</strong><span>{files.length} elemento(s)</span></div><small>Doble clic o Enter para abrir</small></header>
          <div className="filelab-file-head" aria-hidden="true"><span>Nombre</span><span>Tipo</span><span>Tamaño</span><span>Modificado</span></div>
          <div className="filelab-file-list" role="listbox" aria-label="Archivos">
            {files.map((file) => <button role="option" aria-selected={selectedId === file.id} type="button" key={file.id} className={selectedId === file.id ? 'is-selected' : ''} onClick={() => selectFile(file)} onDoubleClick={() => void openFile(file)} onKeyDown={(event) => { if (event.key === 'Enter') void openFile(file); if (event.key === 'Delete') { selectFile(file); setDialog({ type: 'delete', value: '' }) } }}><span className={`filelab-file-icon is-${file.format}`}>{fileGlyph(file)}</span><span className="filelab-file-name"><strong>{file.name}</strong><small>{file.attributes.readOnly ? 'Sólo lectura' : file.attributes.locked ? 'Bloqueado' : file.attributes.hidden ? 'Oculto' : 'Disponible'}</small></span><span>{file.format}</span><span>{file.size} B</span><span>{new Date(file.attributes.lastModifiedAt).toLocaleDateString('es-AR')}</span></button>)}
            {files.length === 0 && <p className="filelab-empty">Esta carpeta no contiene archivos.</p>}
          </div>
        </main>
        <PropertiesInspector file={selected} onApply={applyAttributes} />
      </div>

      {activeEditor && <div className="filelab-editor-layer">
        <section className="filelab-editor-window" role="dialog" aria-modal="false" aria-labelledby="editor-title">
          <header><div><span className={`filelab-file-icon is-${activeEditor.document.format}`}>{activeEditor.document.format === 'binary' ? 'BIN' : 'TXT'}</span><div><h3 id="editor-title">{activeEditor.document.name}{activeEditor.dirty && ' •'}</h3><small>Descriptor {activeEditor.document.descriptor} · {activeEditor.document.readOnly || activeEditor.document.format === 'binary' ? 'lectura' : 'lectura/escritura'}</small></div></div><button type="button" aria-label="Cerrar editor" onClick={() => closeEditor(activeEditor)}>×</button></header>
          {editors.length > 1 && <div className="filelab-editor-tabs">{editors.map((editor) => <button type="button" key={editor.document.fileId} className={editor.document.fileId === activeEditorId ? 'is-active' : ''} onClick={() => setActiveEditorId(editor.document.fileId)}>{editor.document.name}</button>)}</div>}
          <div className="filelab-view-switch" role="tablist"><button role="tab" aria-selected={activeEditor.view === 'text'} type="button" className={activeEditor.view === 'text' ? 'is-active' : ''} onClick={() => setEditors((items) => items.map((item) => item.document.fileId === activeEditorId ? { ...item, view: 'text' } : item))}>Texto</button><button role="tab" aria-selected={activeEditor.view === 'hex'} type="button" className={activeEditor.view === 'hex' ? 'is-active' : ''} onClick={() => setEditors((items) => items.map((item) => item.document.fileId === activeEditorId ? { ...item, view: 'hex' } : item))}>Hexadecimal</button></div>
          <div className="filelab-editor-content">{activeEditor.view === 'text' ? <textarea aria-label={`Contenido de ${activeEditor.document.name}`} value={activeEditor.draft} readOnly={activeEditor.document.readOnly || activeEditor.document.format === 'binary'} onChange={(event) => setEditors((items) => items.map((item) => item.document.fileId === activeEditorId ? { ...item, draft: event.target.value, dirty: event.target.value !== item.document.text } : item))} /> : <HexView bytes={activeEditor.dirty ? new TextEncoder().encode(activeEditor.draft) : activeEditor.document.bytes} />}</div>
          <footer><span>{activeEditor.dirty ? 'Cambios sin guardar' : `${activeEditor.document.bytes.length} byte(s)`}{activeEditor.document.format === 'binary' && ' · edición de texto deshabilitada'}</span><div><button type="button" onClick={() => closeEditor(activeEditor)}>Cerrar</button><button className="filelab-primary-button" type="button" disabled={!activeEditor.dirty || activeEditor.document.readOnly || activeEditor.document.format === 'binary'} onClick={() => saveEditor(activeEditor)}>Guardar</button></div></footer>
        </section>
      </div>}

      <OperationConsole events={snapshot.events} processes={snapshot.engine.processes} buffer={snapshot.lastBuffer} onCommand={(command) => { interfaceAction('consola', `Ejecutar: ${command}`); const reply = session.executeConsole(command); report(reply.message); return reply }} onClear={() => { session.clearEvents(); refresh() }} />
      <div className={`filelab-status ${status.includes('falló') ? 'is-error' : ''}`} role="status" aria-live="polite"><span className="status-dot" aria-hidden="true" />{status}</div>

      {dialog && <FileLabDialog title={dialog.type === 'create' ? 'Crear archivo' : dialog.type === 'rename' ? 'Renombrar archivo' : 'Eliminar archivo'} description={dialog.type === 'delete' ? `Esta acción eliminará “${selected?.name}” del escenario actual.` : 'La validación del nombre la realiza el motor de simulación.'} onClose={closeDialog}>
        {dialog.type !== 'delete' && <label className="filelab-field">Nombre<input value={dialog.value} onChange={(event) => setDialog((current) => current && current.type !== 'delete' ? { ...current, value: event.target.value } : current)} onKeyDown={(event) => { if (event.key === 'Enter') submitDialog() }} /></label>}
        <div className="filelab-dialog-actions"><button type="button" onClick={closeDialog}>Cancelar</button><button className={dialog.type === 'delete' ? 'filelab-danger-button' : 'filelab-primary-button'} type="button" onClick={submitDialog}>{dialog.type === 'create' ? 'Crear' : dialog.type === 'rename' ? 'Guardar nombre' : 'Eliminar'}</button></div>
      </FileLabDialog>}
    </div>
  )
}
