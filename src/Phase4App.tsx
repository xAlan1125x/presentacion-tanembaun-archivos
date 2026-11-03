import { useCallback, useEffect, useMemo, useState } from 'react'
import { AccessSection, AttributesSection, CopyfileSection, NamingSection, OperationsSection, StructureSection, TypesSection } from './components/AcademicSections'
import { FileLabOS } from './components/filelab/FileLabOS'
import { ClassificationGame } from './components/games/ClassificationGame'
import { DigitalDetectiveGame } from './components/games/DigitalDetectiveGame'
import { RepairSystemGame } from './components/games/RepairSystemGame'
import { CopyfileChallengeGame } from './components/games/CopyfileChallengeGame'
import { FileLabFactoryGame } from './components/games/FileLabFactoryGame'
import { OperationRescueHub } from './components/games/OperationRescueHub'
import { createLocalGameStore, isGameUnlocked, type Phase5State } from './game'
import { createActiveGameStore, getOnlineParticipant } from './supabase'
import { PresentationControls } from './components/PresentationControls'
import { SectionNav } from './components/SectionNav'
import { PublicRanking } from './components/online/PublicRanking'
import { presentationSections } from './data/sections'
import { useActiveSection } from './hooks/useActiveSection'

const sectionIds = presentationSections.map((section) => section.id)
const SectionHeader = ({ id, eyebrow, title, description }: { id: string; eyebrow: string; title: string; description: string }) => <header className="section-heading"><span className="eyebrow">{eyebrow}</span><h2 id={id}>{title}</h2><p>{description}</p></header>
const loadRescueState = (): Phase5State | null => {
  if (typeof window === 'undefined') return null
  const participant = getOnlineParticipant()
  const invitationCode = new URLSearchParams(window.location.search).get('partida')?.toUpperCase()
  if (participant && invitationCode && participant.joinCode !== invitationCode) return null
  const loaded = participant ? createActiveGameStore().load() : createLocalGameStore(window.localStorage).load()
  return loaded.ok && loaded.value && loaded.value.playerId !== 'local-player' ? loaded.value : null
}

function Phase4App() {
  const activeId = useActiveSection(sectionIds)
  const [navOpen, setNavOpen] = useState(false)
  const [presentationMode, setPresentationMode] = useState(false)
  const [rescueState, setRescueState] = useState<Phase5State | null>(loadRescueState)
  const activeIndex = Math.max(0, sectionIds.indexOf(activeId))
  const progress = ((activeIndex + 1) / sectionIds.length) * 100
  const navigateTo = useCallback((id: string) => { document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setNavOpen(false) }, [])
  const togglePresentationMode = useCallback(async () => {
    if (!presentationMode) { setPresentationMode(true); try { await document.documentElement.requestFullscreen?.() } catch { /* El enfoque funciona sin fullscreen. */ } return }
    setPresentationMode(false); if (document.fullscreenElement) await document.exitFullscreen()
  }, [presentationMode])
  useEffect(() => { const handler=()=>{if(!document.fullscreenElement)setPresentationMode(false)}; document.addEventListener('fullscreenchange',handler); return()=>document.removeEventListener('fullscreenchange',handler) },[])
  useEffect(() => { document.body.classList.toggle('presentation-mode',presentationMode); return()=>document.body.classList.remove('presentation-mode') },[presentationMode])
  useEffect(() => { const handler=(event:KeyboardEvent)=>{if(!presentationMode||['INPUT','TEXTAREA','BUTTON','SELECT'].includes((event.target as HTMLElement).tagName))return;if(event.key==='ArrowRight'||event.key==='PageDown')navigateTo(sectionIds[Math.min(activeIndex+1,sectionIds.length-1)]);if(event.key==='ArrowLeft'||event.key==='PageUp')navigateTo(sectionIds[Math.max(activeIndex-1,0)])};window.addEventListener('keydown',handler);return()=>window.removeEventListener('keydown',handler)},[activeIndex,navigateTo,presentationMode])
  const currentSection=useMemo(()=>presentationSections[activeIndex],[activeIndex])
  const handleRescueStateChange = useCallback((state: Phase5State | null) => setRescueState(state), [])
  const lockedRescueStage = <div className="rescue-stage-locked"><strong>{rescueState ? 'Esta etapa todavía está bloqueada.' : 'Comenzá Operación Rescate desde el panel de misión.'}</strong><p>{rescueState ? 'Completá la etapa anterior para continuar este recorrido.' : 'Elegí un apodo para habilitar las herramientas y guardar tus resultados.'}</p><button type="button" className="primary-action" onClick={()=>navigateTo('operacion-rescate')}>Ir al panel <span aria-hidden="true">→</span></button></div>

  return <div className="app-shell">
    <SectionNav sections={presentationSections} activeId={activeId} isOpen={navOpen} onToggle={()=>setNavOpen((open)=>!open)} onNavigate={navigateTo}/>
    <div className="top-progress" aria-hidden="true"><span style={{width:`${progress}%`}}/></div><div className="section-live-label" aria-live="polite"><span>{currentSection.eyebrow}</span>{currentSection.shortTitle}</div>
    <main id="contenido">
      <section id="inicio" className="presentation-section hero-section section-dark" aria-labelledby="inicio-title"><div className="hero-noise" aria-hidden="true"/><div className="hero-copy"><span className="phase-label">Sistemas Operativos · Capítulo 4.1</span><h1 id="inicio-title">Archivos,<br/><em>por dentro.</em></h1><p>Una clase interactiva para comprender cómo se nombran, estructuran, interpretan y manipulan los archivos.</p><div className="hero-actions"><button type="button" className="primary-action" onClick={()=>navigateTo('problema')}>Comenzar recorrido <span aria-hidden="true">↓</span></button><span>7 temas · 7 demostraciones · 30–50 min</span></div></div><div className="hero-visual" aria-label="Archivo representado en capas"><div className="file-orbit orbit-one"><span>nombre</span></div><div className="file-orbit orbit-two"><span>atributos</span></div><div className="file-orbit orbit-three"><span>operaciones</span></div><div className="file-core"><span className="file-fold"/><strong>archivo</strong><small>0100 0110</small></div></div><div className="scroll-cue"><span aria-hidden="true">↓</span> Desplazá para explorar</div></section>

      <section id="problema" className="presentation-section context-section" aria-labelledby="problema-title"><div className="context-question"><span className="eyebrow">Introducción y contexto</span><h2 id="problema-title">Un proceso termina.<br/><em>¿Sus datos también?</em></h2><p>La memoria de trabajo es temporal. Los archivos ofrecen una abstracción para conservar información, compartirla entre procesos y recuperarla sin exponer todos los detalles físicos del dispositivo.</p></div><div className="persistence-story" aria-label="Secuencia de persistencia de datos"><article><span>01</span><div className="memory-block">RAM</div><h3>El proceso produce datos</h3><p>Mientras ejecuta, mantiene información en memoria.</p></article><div className="story-connector" aria-hidden="true">→</div><article><span>02</span><div className="process-end">×</div><h3>El proceso termina</h3><p>Su espacio de memoria deja de estar disponible.</p></article><div className="story-connector" aria-hidden="true">→</div><article className="story-highlight"><span>03</span><div className="persistent-file">▤</div><h3>El archivo permanece</h3><p>Otro proceso puede nombrarlo, abrirlo y operar con él.</p></article></div><div className="context-questions"><article><span>Sin archivos</span><p>Cada programa tendría que conservar todo mientras permanece activo.</p></article><article><span>Si se aplican mal</span><p>Podemos perder datos, interpretar bytes con el formato incorrecto o vulnerar protección.</p></article><article><span>Durante la clase</span><p>Primero predecimos; luego ejecutamos en FileLab y justificamos el resultado.</p></article></div></section>

      <NamingSection/><StructureSection/><TypesSection/><AccessSection/><AttributesSection/><OperationsSection/><CopyfileSection/>

      <section id="laboratorio" className="presentation-section lab-section" aria-labelledby="laboratorio-title"><SectionHeader id="laboratorio-title" eyebrow="FileLab OS · Laboratorio libre" title="Ahora explorá sin guion" description="Los siete escenarios académicos también están disponibles en el explorador completo, junto con consola, propiedades, bytes y descriptores."/><FileLabOS/></section>

      <section id="operacion-rescate" className="presentation-section rescue-section rescue-hub-section" aria-labelledby="operacion-rescate-title"><SectionHeader id="operacion-rescate-title" eyebrow="Operación Rescate · Fase 5.7" title="Una misión, cinco desafíos" description="Identificate localmente, seguí tu progreso y elegí la próxima etapa sin depender de un expositor."/><OperationRescueHub state={rescueState} onStateChange={handleRescueStateChange} onNavigate={navigateTo}/></section>

      <section id="clasificar-archivos" className="presentation-section rescue-section" aria-labelledby="clasificar-archivos-title"><SectionHeader id="clasificar-archivos-title" eyebrow="Operación Rescate · Fase 5.2" title="Rescatá la evidencia, no la etiqueta" description="Primer minijuego local: clasificá archivos usando nomenclatura, bytes, tipos y estructuras sin confundir sus categorías."/>{rescueState && isGameUnlocked(rescueState, 'classify-files') ? <ClassificationGame key={rescueState.currentRunId}/> : lockedRescueStage}</section>

      <section id="detective-digital" className="presentation-section detective-section" aria-labelledby="detective-digital-title"><SectionHeader id="detective-digital-title" eyebrow="Operación Rescate · Fase 5.3" title="Reconstruí el incidente" description="Examiná archivos, atributos y acontecimientos para diagnosticar por qué un informe quedó incompleto."/>{rescueState && isGameUnlocked(rescueState, 'digital-detective') ? <DigitalDetectiveGame key={rescueState.currentRunId}/> : lockedRescueStage}</section>

      <section id="reparar-sistema" className="presentation-section repair-section" aria-labelledby="reparar-sistema-title"><SectionHeader id="reparar-sistema-title" eyebrow="Operación Rescate · Fase 5.4" title="Elegí la operación adecuada" description="Resolvé cuatro situaciones breves sobre protección, descriptores, cursores y cierre de archivos."/>{rescueState && isGameUnlocked(rescueState, 'repair-system') ? <RepairSystemGame key={rescueState.currentRunId}/> : lockedRescueStage}</section>

      <section id="copyfile-challenge" className="presentation-section copy-challenge-section" aria-labelledby="copyfile-challenge-title"><SectionHeader id="copyfile-challenge-title" eyebrow="Operación Rescate · Fase 5.5" title="Copiá sin perder ningún byte" description="Completá el ciclo copyfile con búferes, transferencias parciales, EOF y descriptores observables."/>{rescueState && isGameUnlocked(rescueState, 'copyfile-challenge') ? <CopyfileChallengeGame key={rescueState.currentRunId}/> : lockedRescueStage}</section>

      <section id="filelab-factory" className="presentation-section escape-room-section" aria-labelledby="filelab-factory-title"><SectionHeader id="filelab-factory-title" eyebrow="Operación Rescate · Etapa 5" title="FileLab Factory" description="Gestioná pedidos y llevá cada archivo por una secuencia lógica de llamadas al sistema durante 105 segundos."/>{rescueState && isGameUnlocked(rescueState, 'escape-room') ? <FileLabFactoryGame key={rescueState.currentRunId}/> : lockedRescueStage}</section>

      <section id="sintesis" className="presentation-section summary-section section-dark" aria-labelledby="sintesis-title"><div className="summary-heading"><span className="eyebrow">Conclusión</span><h2 id="sintesis-title">Siete decisiones.<br/><em>Un mismo archivo.</em></h2><p>La abstracción es simple para el usuario, pero combina identificación, interpretación, estado y operaciones.</p></div><div className="takeaway-grid" aria-label="Síntesis de conceptos">{[['Nombre','permite encontrarlo'],['Estructura','define sus unidades'],['Tipo','orienta la interpretación'],['Acceso','decide desde dónde leer'],['Atributos','describen y controlan'],['Operaciones','cambian estado y datos'],['Copyfile','integra todo el ciclo']].map(([name,idea],index)=><article key={name}><span>{String(index+1).padStart(2,'0')}</span><strong>{name}</strong><p>{idea}</p></article>)}</div><div className="final-check"><span>Comprobación final</span><p>Si una lectura devuelve menos bytes que los solicitados, ¿es siempre un error?</p><strong>No. Puede ser una transferencia parcial o el final próximo del archivo; hay que observar el resultado y la cantidad transferida.</strong></div><div className="summary-footer"><span>Alcance completado</span><p>4.1.1–4.1.7 · explicación, predicción, demostración y resolución.</p></div></section>

      <section id="clasificacion" className="presentation-section public-ranking-section" aria-labelledby="clasificacion-title"><SectionHeader id="clasificacion-title" eyebrow="Operación Rescate · Resultados" title="Clasificación de la partida" description="Consultá el mejor recorrido completo de una partida mediante su código, sin unirte como participante."/><PublicRanking/></section>
    </main>
    <PresentationControls current={activeIndex} total={presentationSections.length} presentationMode={presentationMode} onPrevious={()=>navigateTo(sectionIds[Math.max(activeIndex-1,0)])} onNext={()=>navigateTo(sectionIds[Math.min(activeIndex+1,sectionIds.length-1)])} onTogglePresentation={togglePresentationMode}/>
  </div>
}

export default Phase4App
