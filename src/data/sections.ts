export interface PresentationSection {
  id: string
  eyebrow: string
  shortTitle: string
  title: string
}

export const presentationSections: PresentationSection[] = [
  { id: 'inicio', eyebrow: 'FileLab', shortTitle: 'Inicio', title: 'Archivos, por dentro' },
  { id: 'problema', eyebrow: 'Contexto', shortTitle: 'El problema', title: '¿Cómo persiste la información?' },
  { id: 'nombres', eyebrow: '4.1.1', shortTitle: 'Nombres', title: 'Nomenclatura de archivos' },
  { id: 'estructura', eyebrow: '4.1.2', shortTitle: 'Estructura', title: 'Tres formas de organizar un archivo' },
  { id: 'tipos', eyebrow: '4.1.3', shortTitle: 'Tipos', title: 'La extensión no cuenta toda la historia' },
  { id: 'acceso', eyebrow: '4.1.4', shortTitle: 'Acceso', title: 'Secuencial o aleatorio' },
  { id: 'atributos', eyebrow: '4.1.5', shortTitle: 'Atributos', title: 'Datos acerca de los datos' },
  { id: 'operaciones', eyebrow: '4.1.6', shortTitle: 'Operaciones', title: 'El ciclo de vida de un archivo' },
  { id: 'copyfile', eyebrow: '4.1.7', shortTitle: 'Copyfile', title: 'Copiar, bloque por bloque' },
  { id: 'laboratorio', eyebrow: 'Laboratorio', shortTitle: 'FileLab OS', title: 'Un explorador para observar lo invisible' },
  { id: 'operacion-rescate', eyebrow: 'Fase 5.7', shortTitle: 'Operación Rescate', title: 'Panel de misión' },
  { id: 'clasificar-archivos', eyebrow: 'Fase 5.2', shortTitle: 'Clasificá archivos', title: 'Clasificación práctica' },
  { id: 'detective-digital', eyebrow: 'Fase 5.3', shortTitle: 'Detective digital', title: 'Investigación de evidencias' },
  { id: 'reparar-sistema', eyebrow: 'Fase 5.4', shortTitle: 'Repará el sistema', title: 'Laboratorio de reparación' },
  { id: 'copyfile-challenge', eyebrow: 'Fase 5.5', shortTitle: 'Copyfile Challenge', title: 'Copia bloque por bloque' },
  { id: 'filelab-factory', eyebrow: 'Etapa 5', shortTitle: 'FileLab Factory', title: 'Gestión de pedidos y operaciones' },
  { id: 'sintesis', eyebrow: 'Cierre', shortTitle: 'Síntesis', title: 'Siete ideas, un mismo archivo' },
  { id: 'clasificacion', eyebrow: 'Resultados', shortTitle: 'Clasificación', title: 'Clasificación de la partida' },
]
