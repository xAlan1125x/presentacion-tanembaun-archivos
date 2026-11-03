import { useEffect, useState } from 'react'
import type { FileSnapshot, MutableFileAttributes } from '../../engine'
import { ExpandablePanel } from '../ExpandablePanel'

interface PropertiesInspectorProps {
  file?: FileSnapshot
  onApply: (patch: MutableFileAttributes) => void
}

const dateText = (value: number) => new Intl.DateTimeFormat('es-AR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))

export function PropertiesInspector({ file, onApply }: PropertiesInspectorProps) {
  const [draft, setDraft] = useState<MutableFileAttributes>({})
  useEffect(() => { setDraft(file ? {
    readOnly: file.attributes.readOnly, hidden: file.attributes.hidden, system: file.attributes.system,
    archive: file.attributes.archive, temporary: file.attributes.temporary, locked: file.attributes.locked,
    protection: {
      owner: { ...file.attributes.protection.owner },
      others: { ...file.attributes.protection.others },
    },
  } : {}) }, [file])

  if (!file) return <aside className="filelab-inspector"><p className="filelab-empty">Seleccioná un archivo para ver sus propiedades.</p></aside>
  const setFlag = (name: 'readOnly' | 'hidden' | 'system' | 'archive' | 'temporary' | 'locked', value: boolean) => setDraft((current) => ({ ...current, [name]: value }))
  const setPermission = (group: 'owner' | 'others', permission: 'read' | 'write', value: boolean) => setDraft((current) => ({ ...current, protection: { ...current.protection, [group]: { ...current.protection?.[group], [permission]: value } } }))

  return (
    <aside className="filelab-inspector" aria-label={`Propiedades de ${file.name}`}>
      <ExpandablePanel title="Propiedades" hint="Datos del motor" defaultOpen>
        <dl className="filelab-properties">
          <div><dt>Nombre</dt><dd>{file.name}</dd></div><div><dt>Tamaño</dt><dd>{file.size} B</dd></div>
          <div><dt>Tipo</dt><dd>{file.type}</dd></div><div><dt>Formato</dt><dd>{file.format}</dd></div>
          <div><dt>Creado</dt><dd>{dateText(file.attributes.createdAt)}</dd></div>
          <div><dt>Accedido</dt><dd>{dateText(file.attributes.lastAccessedAt)}</dd></div>
          <div><dt>Modificado</dt><dd>{dateText(file.attributes.lastModifiedAt)}</dd></div>
          <div><dt>Propietario</dt><dd>{file.attributes.ownerId}</dd></div>
        </dl>
      </ExpandablePanel>
      <ExpandablePanel title="Banderas" hint="Modelo didáctico editable">
        <div className="filelab-check-grid">
          {([['readOnly','Sólo lectura'],['hidden','Oculto'],['system','Sistema'],['archive','Archivo'],['temporary','Temporal'],['locked','Bloqueado']] as const).map(([key, label]) => (
            <label key={key}><input type="checkbox" checked={Boolean(draft[key])} onChange={(event) => setFlag(key, event.target.checked)} />{label}</label>
          ))}
        </div>
      </ExpandablePanel>
      <ExpandablePanel title="Protección" hint="FileLab didactic v1">
        <table className="permission-table"><thead><tr><th>Principal</th><th>Leer</th><th>Escribir</th></tr></thead><tbody>
          {(['owner','others'] as const).map((group) => <tr key={group}><th>{group === 'owner' ? 'Propietario' : 'Otros'}</th>{(['read','write'] as const).map((permission) => <td key={permission}><input aria-label={`${group} ${permission}`} type="checkbox" checked={Boolean(draft.protection?.[group]?.[permission])} onChange={(event) => setPermission(group, permission, event.target.checked)} /></td>)}</tr>)}
        </tbody></table>
        <button className="filelab-secondary-button filelab-full-button" type="button" onClick={() => onApply(draft)}>Aplicar atributos</button>
      </ExpandablePanel>
    </aside>
  )
}
