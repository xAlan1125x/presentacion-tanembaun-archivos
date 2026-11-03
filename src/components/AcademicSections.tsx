import { Fragment, useState, type ReactNode } from 'react'
import { AccessDemo, AttributesDemo, CopyfileDemo, NamingDemo, OperationsDemo, StructureDemo, TypesDemo } from './demos/AcademicDemos'

function SectionHeader({ id, eyebrow, title, description }: { id: string; eyebrow: string; title: string; description: string }) {
  return <header className="section-heading"><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2><p>{description}</p></header>
}

function Activity({ label, prompt, answer, children }: { label: string; prompt: string; answer: string; children?: ReactNode }) {
  const [revealed,setRevealed]=useState(false)
  return <aside className={`micro-activity ${revealed?'is-revealed':''}`}><div><span>{label}</span><p>{prompt}</p>{children}</div><button type="button" aria-expanded={revealed} onClick={()=>setRevealed((value)=>!value)}>{revealed?'Ocultar resolución':'Ver resolución'}</button>{revealed&&<div className="activity-answer"><strong>Resolución</strong><p>{answer}</p></div>}</aside>
}

const fileAttributes = [
  { category: 'Protección', rows: [
    ['Protección', 'Quién puede acceso al archivo y en qué forma'],
    ['Contraseña', 'Contraseña necesaria para acceder al archivo'],
    ['Creador', 'ID de la persona que creó el archivo'],
    ['Propietario', 'El propietario actual'],
  ]},
  { category: 'Banderas', rows: [
    ['Bandera de sólo lectura', '0 para lectura/escritura; 1 para sólo lectura'],
    ['Bandera oculto', '0 para normal; 1 para que no aparezca en los listados'],
    ['Bandera del sistema', '0 para archivos normales; 1 para archivo del sistema'],
    ['Bandera de archivo', '0 si ha sido respaldado; 1 si necesita respaldarse'],
    ['Bandera ASCII/binario', '0 para archivo ASCII; 1 para archivo binario'],
    ['Bandera de acceso aleatorio', '0 para sólo acceso secuencial; 1 para acceso aleatorio'],
    ['Bandera temporal', '0 para normal; 1 para eliminar archivo al salir del proceso'],
    ['Banderas de bloqueo', '0 para desbloqueado; distinto de cero para bloqueado'],
  ]},
  { category: 'Registros y llaves', rows: [
    ['Longitud de registro', 'Número de bytes en un registro'],
    ['Posición de la llave', 'Desplazamiento de la llave dentro de cada registro'],
    ['Longitud de la llave', 'Número de bytes en el campo llave'],
  ]},
  { category: 'Tiempos', rows: [
    ['Hora de creación', 'Fecha y hora en que se creó el archivo'],
    ['Hora del último acceso', 'Fecha y hora en que se accedió al archivo por última vez'],
    ['Hora de la última modificación', 'Fecha y hora en que se modificó por última vez el archivo'],
  ]},
  { category: 'Tamaños', rows: [
    ['Tamaño actual', 'Número de bytes en el archivo'],
    ['Tamaño máximo', 'Número de bytes hasta donde puede crecer el archivo'],
  ]},
] as const

function FileAttributesTable() {
  const [expanded, setExpanded] = useState(false)
  return <div className="file-attributes-table">
    <button className="file-attributes-toggle" type="button" aria-expanded={expanded} aria-controls="file-attributes-list" onClick={() => setExpanded((value) => !value)}>{expanded ? 'Ocultar atributos' : 'Ver todos los atributos'}</button>
    {expanded && <div id="file-attributes-list" className="file-attributes-list"><table><caption>Figura 4-4 · Algunos posibles atributos de archivos</caption><thead><tr><th scope="col">Atributo</th><th scope="col">Significado</th></tr></thead><tbody>{fileAttributes.map((group) => <Fragment key={group.category}><tr className="file-attributes-category"><th scope="colgroup" colSpan={2}>{group.category}</th></tr>{group.rows.map(([name, meaning]) => <tr key={name}><th scope="row">{name}</th><td>{meaning}</td></tr>)}</Fragment>)}</tbody></table></div>}
  </div>
}

function Essential({ children }: { children: ReactNode }) { return <div className="essential-idea"><span>Idea esencial</span><p>{children}</p></div> }

export function NamingSection() {
  return <section id="nombres" className="presentation-section naming-section academic-section" aria-labelledby="nombres-title">
    <SectionHeader id="nombres-title" eyebrow="4.1.1 · Nomenclatura" title="Encontrar un archivo empieza por nombrarlo" description="El nombre permite identificar información persistente; sus reglas y el papel de la extensión dependen del sistema." />
    <div className="academic-problem"><span>La necesidad</span><h3>¿Cómo recuperamos un dato después de cerrar el proceso?</h3><p>Necesitamos una referencia estable y comprensible. El sistema administra identificadores internos; las personas trabajan con nombres.</p></div>
    <div className="naming-concepts"><article><span>01</span><h3>Nombre</h3><p>Cadena que identifica al archivo dentro de su contexto. Longitud, caracteres permitidos y distinción de mayúsculas varían.</p></article><article><span>02</span><h3>Extensión</h3><p>Sufijo separado por un punto. Puede orientar el tipo o el programa asociado, pero no cambia por sí solo los datos.</p></article><div className="case-comparator"><code>maria</code><code>Maria</code><code>MARIA</code><p>En un sistema sensible son tres nombres; en otro pueden colisionar.</p></div></div>
    <Activity label="Predicción" prompt="Si renombramos nota.txt como nota.jpg, ¿el archivo se convierte en imagen?" answer="No. Rename modifica el nombre; la secuencia de bytes permanece igual. La extensión es una convención o asociación cuya interpretación depende del sistema y las aplicaciones." />
    <NamingDemo />
    <Essential>El nombre localiza; la extensión orienta; los bytes determinan qué información contiene realmente el archivo.</Essential>
  </section>
}

export function StructureSection() {
  return <section id="estructura" className="presentation-section structure-section section-dark academic-section" aria-labelledby="estructura-title">
    <SectionHeader id="estructura-title" eyebrow="4.1.2 · Estructura" title="¿Quién decide qué significan los datos?" description="Tanenbaum describe tres modelos. Cambia la unidad que el sistema o el programa reconoce dentro del archivo." />
    <div className="structure-models academic-models"><article className="model-card model-bytes"><span className="source-tag">Modelo de Tanenbaum</span><div className="byte-ribbon">41 4E 41 20 4C 55 5A</div><h3>Secuencia de bytes</h3><p>El sistema no impone campos: el programa interpreta cada byte. Es el modelo usado por UNIX y Windows.</p></article><article className="model-card model-records"><span className="source-tag">Modelo de Tanenbaum</span><div className="record-stack"><i>020 · Luz</i><i>050 · Ana</i><i>080 · Sol</i></div><h3>Registros fijos</h3><p>Lectura y escritura trabajan con registros del mismo tamaño, una idea heredada de sistemas históricos.</p></article><article className="model-card model-tree"><span className="source-tag">Modelo de Tanenbaum</span><div className="mini-tree"><b>050</b><span><i>020</i><i>080</i></span></div><h3>Árbol de registros</h3><p>Cada registro posee una llave en posición fija que permite ordenar y localizar información.</p></article></div>
    <div className="model-boundary"><strong>Distinción importante</strong><p>Los tres son modelos de estructura interna del libro. Los colores, animaciones y la búsqueda visual son representaciones adicionales de FileLab.</p></div>
    <Activity label="Elección de modelo" prompt="Una aplicación consulta alumnos repetidamente por legajo. ¿Qué modelo del esquema facilita una búsqueda por llave?" answer="El árbol de registros con llave: el campo llave dirige la búsqueda. En una secuencia de bytes, esa organización tendría que implementarla el programa." />
    <StructureDemo />
    <Essential>La estructura define qué unidad se reconoce: un byte, un registro o un registro localizado por llave.</Essential>
  </section>
}

export function TypesSection() {
  return <section id="tipos" className="presentation-section types-section academic-section" aria-labelledby="tipos-title">
    <SectionHeader id="tipos-title" eyebrow="4.1.3 · Tipos" title="No todos los archivos se usan de la misma manera" description="El tipo permite distinguir información ordinaria de directorios o dispositivos, mientras el formato indica cómo interpretar el contenido regular." />
    <div className="type-taxonomy academic-taxonomy"><div className="taxonomy-root">Archivos</div><div className="taxonomy-branches"><article><span>Regulares</span><strong>Texto ASCII</strong><small>Líneas y caracteres legibles</small><strong>Binarios</strong><small>Estructura interna conocida por el programa</small></article><article><span>Directorios</span><p>Organizan y permiten localizar otros archivos. Se desarrollarán fuera del 4.1 asignado.</p></article><article><span>Especiales · UNIX</span><strong>Caracteres</strong><small>Flujo de E/S, como terminales</small><strong>Bloques</strong><small>Dispositivos de almacenamiento</small></article></div></div>
    <figure className="executable-figure">
      <div className="binary-structures" role="img" aria-label="Figura 4-3: estructura interna de un archivo ejecutable y de un archivo compuesto por módulos objeto">
        <div className="binary-structure binary-structure--executable">
          <div className="binary-block binary-block--header"><strong>Encabezado</strong><small>Número mágico · tamaño del texto · tamaño de los datos · tamaño del BSS · tamaño de la tabla de símbolos · punto de entrada</small><span>Banderas</span></div>
          <div className="binary-block binary-block--text">Texto</div>
          <div className="binary-block binary-block--data">Datos</div>
          <div className="binary-block binary-block--relocation">Bits de reubicación</div>
          <div className="binary-block binary-block--symbols">Tabla de símbolos</div>
          <b className="binary-figure-label">(a) Archivo ejecutable</b>
        </div>
        <div className="binary-structure binary-structure--modules">
          <div className="binary-block binary-block--header">Encabezado</div><div className="binary-block binary-block--object">Módulo objeto</div>
          <div className="binary-block binary-block--header">Encabezado</div><div className="binary-block binary-block--object">Módulo objeto</div>
          <div className="binary-block binary-block--header">Encabezado</div><div className="binary-block binary-block--object">Módulo objeto</div>
          <b className="binary-figure-label">(b) Archivo</b>
        </div>
        <div className="binary-module-detail"><strong>Nombre del módulo</strong><span>Datos</span><span>Propietario</span><span>Protección</span><span>Tamaño</span></div>
      </div>
      <figcaption>Figura 4-3. Dos formas de organizar archivos binarios: un ejecutable con encabezado y áreas de carga, y un archivo compuesto por módulos objeto.</figcaption>
    </figure>
    <div className="policy-mechanism"><div><span>Política</span><p>¿Qué tipos reconoce o exige el sistema?</p></div><div><span>Mecanismo</span><p>¿Cómo representa y abre cada clase?</p></div><strong>La clasificación concreta varía entre sistemas operativos.</strong></div>
    <Activity label="Detective digital" prompt="Un archivo se llama foto.txt y comienza con bytes FF D8 FF. ¿Confiarías sólo en la extensión?" answer="No. La extensión puede orientar, pero los bytes y la estructura interna aportan evidencia del formato. Cambiar el nombre no reescribe el contenido." />
    <TypesDemo />
    <Essential>“Regular” incluye texto y binarios; los archivos especiales permiten representar E/S de dispositivos en sistemas que adoptan ese modelo.</Essential>
  </section>
}

export function AccessSection() {
  return <section id="acceso" className="presentation-section access-section academic-section" aria-labelledby="acceso-title">
    <SectionHeader id="acceso-title" eyebrow="4.1.4 · Acceso" title="Leer en orden o ir directo al dato" description="Una apertura mantiene una posición actual. Podemos consumir desde allí o reposicionarla antes de continuar." />
    <div className="access-story"><article><header><span>Secuencial</span><strong>leer → avanzar → leer</strong></header><div className="record-track">{['01','02','03','04','05'].map((item)=><i key={item}>{item}</i>)}</div><p>Fue el único acceso de los primeros sistemas. Sirve cuando el orden natural coincide con el procesamiento.</p></article><article><header><span>Aleatorio</span><strong>seek → leer</strong></header><div className="record-track random-jump">{['01','02','03','04','05'].map((item,index)=><i className={index===3?'target':''} key={item}>{item}</i>)}</div><p>Permite saltar a una posición, crucial para aplicaciones como bases de datos.</p></article></div>
    <div className="cursor-explainer"><span>Posición actual</span><p>No pertenece “al archivo en abstracto”: FileLab la asocia al descriptor abierto. Dos aperturas pueden avanzar de forma independiente.</p></div>
    <Activity label="Elegí la operación" prompt="Necesitamos leer el cuarto registro sin recorrer los tres anteriores. ¿read repetido o seek seguido de read?" answer="Seek reposiciona el cursor al comienzo del cuarto registro; read obtiene los bytes desde esa nueva posición. El acceso sigue usando una secuencia de bytes, pero cambia dónde empieza la próxima lectura." />
    <AccessDemo />
    <Essential>Read consume desde la posición actual; seek cambia esa posición sin transferir datos.</Essential>
  </section>
}

export function AttributesSection() {
  return <section id="atributos" className="presentation-section attributes-section section-ink academic-section" aria-labelledby="atributos-title">
    <SectionHeader id="atributos-title" eyebrow="4.1.5 · Atributos" title="El archivo también conserva datos sobre sí mismo" description="Además de nombre y contenido, el sistema asocia metadatos para describirlo, protegerlo y administrarlo." />
    <div className="attribute-spectrum"><article><span>Identidad</span><strong>Creador · propietario</strong><p>Relacionan el archivo con usuarios o procesos.</p></article><article><span>Protección</span><strong>Acceso · contraseñas</strong><p>Indican quién puede usarlo y de qué manera, según el sistema.</p></article><article><span>Estado</span><strong>Banderas</strong><p>Sólo lectura, oculto, sistema, archivo, temporal o bloqueo son ejemplos; no todos existen en todos los sistemas.</p></article><article><span>Descripción</span><strong>Tiempos · tamaño · registros</strong><p>Fechas, longitud actual o máxima y campos estructurales apoyan la administración.</p></article></div>
    <FileAttributesTable />
    <Activity label="Diagnóstico" prompt="El propietario abre un archivo, pero la escritura falla. ¿Alcanza con mirar el contenido?" answer="No. Hay que consultar los atributos: una bandera de sólo lectura, un bloqueo, la protección o un límite de tamaño pueden impedir la operación sin cambiar los bytes existentes." />
    <AttributesDemo />
    <Essential>Los atributos son metadatos. Su conjunto y significado dependen del sistema; FileLab usa un modelo didáctico explícito y limitado.</Essential>
  </section>
}

export function OperationsSection() {
  return <section id="operaciones" className="presentation-section operations-section academic-section" aria-labelledby="operaciones-title">
    <SectionHeader id="operaciones-title" eyebrow="4.1.6 · Operaciones" title="El sistema ofrece una interfaz para actuar sobre archivos" description="Las operaciones separan lo que solicita el proceso de cómo el sistema organiza físicamente el almacenamiento." />
    <div className="operation-groups"><article><span>Ciclo de vida</span><strong>create · delete · rename</strong><p>Hacen aparecer, desaparecer o cambiar la referencia visible.</p></article><article><span>Sesión de uso</span><strong>open · close</strong><p>Open devuelve un descriptor; close libera la entrada asociada.</p></article><article><span>Transferencia</span><strong>read · write · append</strong><p>Usan bytes y actualizan posiciones o tamaño.</p></article><article><span>Control</span><strong>seek · get attributes · set attributes</strong><p>Reposicionan o consultan/modifican metadatos.</p></article></div>
    <div className="descriptor-diagram"><div><span>Proceso</span><strong>fd 3</strong></div><i>→</i><div><span>Entrada abierta</span><strong>modo · cursor</strong></div><i>→</i><div><span>Archivo</span><strong>bytes · atributos</strong></div><p>Diagrama conceptual de FileLab: un descriptor referencia estado de apertura; no es el nombre del archivo.</p></div>
    <Activity label="Repará la secuencia" prompt="create(archivo) → read(10) → close(). ¿Qué falta y por qué?" answer="Falta open. Create anuncia un archivo nuevo, pero read necesita un descriptor abierto con permiso de lectura y una posición actual. Close también recibe ese descriptor." />
    <OperationsDemo />
    <Essential>Éxito, EOF y error son resultados distintos. Una transferencia puede completar menos bytes que los solicitados.</Essential>
  </section>
}

export function CopyfileSection() {
  return <section id="copyfile" className="presentation-section copyfile-section section-dark academic-section" aria-labelledby="copyfile-title">
    <SectionHeader id="copyfile-title" eyebrow="4.1.7 · Programa copyfile" title="Copiar es repetir transferencias válidas" description="El ejemplo integra argumentos, descriptores, un búfer de 4096 bytes y llamadas al sistema de archivos." />
    <div className="copyfile-story"><div><span>1</span><strong>open(origen)</strong><p>Abre el primer argumento sólo para lectura.</p></div><i>→</i><div><span>2</span><strong>creat(destino)</strong><p>Crea o sobrescribe el segundo argumento.</p></div><i>→</i><div><span>3</span><strong>read / write</strong><p>El valor devuelto por read es la cantidad que debe escribirse.</p></div><i>→</i><div><span>4</span><strong>close</strong><p>Cierra ambos descriptores al terminar.</p></div></div>
    <div className="original-vs-complement"><article><span>Ejemplo del libro</span><p>Dos argumentos válidos, búfer de 4096, ciclo hasta EOF y comprobación de errores.</p></article><article><span>Complemento de robustez</span><p>FileLab muestra transferencias parciales y explica cómo repetir write si no completa todos los bytes.</p></article></div>
    <Activity label="Predicción numérica" prompt="Origen: 9500 bytes. Búfer: 4096. Tras dos lecturas completas, ¿cuántos bytes devuelve la tercera y cuántos debe recibir write?" answer="Quedan 9500 − 8192 = 1308 bytes. Read devuelve 1308 y write debe recibir 1308, no la capacidad total de 4096. La lectura siguiente devuelve EOF con 0 bytes." />
    <CopyfileDemo />
    <Essential>La cantidad válida no es el tamaño del búfer: es el valor realmente devuelto por read.</Essential>
  </section>
}
