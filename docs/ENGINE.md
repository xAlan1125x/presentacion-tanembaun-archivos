# Motor de simulación de FileLab

El motor vive en `src/engine` y no importa React, APIs del navegador ni servicios externos. Su estado sólo puede modificarse mediante operaciones explícitas; las consultas devuelven copias defensivas.

## Alcance académico

El contrato cubre las operaciones de Tanenbaum 4.1.6:

| Operación | Contrato de FileLab |
| --- | --- |
| `create` | Crea un archivo vacío. No lo abre y nunca trunca uno existente. |
| `delete` | Elimina un archivo si el proceso tiene permiso y la regla del escenario lo permite. |
| `open` | Crea un descriptor dentro del proceso y establece una posición inicial. |
| `close` | Invalida el descriptor para ese proceso. |
| `read` | Lee desde la posición actual y devuelve datos o EOF explícito. |
| `write` | Sobrescribe desde la posición actual y puede extender el archivo. |
| `append` | Escribe al final, independientemente de la posición actual. |
| `seek` | Modifica la posición asociada al descriptor. |
| `getAttributes` | Devuelve atributos y tamaño mediante una copia defensiva. |
| `setAttributes` | Modifica únicamente atributos admitidos por el modelo. |
| `rename` | Cambia el nombre respetando las reglas configuradas. |

El método complementario `creat` representa la llamada usada en el programa C de 4.1.7. A diferencia de `create`, crea o trunca el destino y lo deja abierto para escritura.

## Resultados y errores

Todas las operaciones devuelven una unión discriminada:

```ts
type EngineResult<T> =
  | { ok: true; operation: EngineOperation; value: T }
  | { ok: false; operation: EngineOperation; error: EngineError }
```

Una lectura exitosa agrega otro discriminante:

```ts
type ReadOutcome = 'data' | 'eof'
```

- `data` puede contener menos bytes que los solicitados.
- `eof` es un resultado exitoso con cero bytes, no un error.
- Descriptor inválido, permiso denegado o modo incorrecto son errores y nunca se informan como EOF.
- Una lectura solicitando cero bytes es un éxito `data` sin movimiento del cursor.

## Búferes y transferencias parciales

`IOBuffer` separa:

- `capacity`: espacio total reservado;
- `data`: almacenamiento del búfer;
- `validLength`: cantidad de bytes válidos.

Los límites `maxReadBytesPerCall` y `maxWriteBytesPerCall` permiten escenarios deterministas donde una llamada transfiere menos bytes de los solicitados. El consumidor debe comprobar siempre `bytesTransferred`.

## Procesos y descriptores

- Cada proceso tiene un principal y su propia tabla de descriptores.
- Los descriptores comienzan en 3 para facilitar la relación didáctica con ejemplos UNIX, sin simular entrada, salida y error estándar.
- Dos aperturas del mismo archivo mantienen posiciones independientes.
- Modos disponibles: `read`, `write`, `read-write` y `append`.
- Los permisos se comprueban al abrir y nuevamente al efectuar cada operación.

## Modelo didáctico de protección

`filelab-didactic-v1` contiene permisos de lectura y escritura para:

- propietario;
- otros procesos.

Además existen las banderas `readOnly`, `hidden`, `system`, `archive`, `temporary` y `locked`.

Este modelo no representa permisos POSIX, ACL de Windows ni otro sistema real. Sus reglas son:

- `readOnly` impide modificar el contenido;
- `locked` impide escritura, renombrado y eliminación;
- sólo el propietario puede cambiar atributos;
- `hidden`, `system`, `archive` y `temporary` son metadatos y no conceden permisos;
- cambiar la protección de un archivo abierto afecta las operaciones posteriores.

## Decisiones configurables o explícitas de FileLab

- La sensibilidad a mayúsculas, longitud máxima, nombres reservados y caracteres prohibidos son configurables por escenario.
- Por defecto no se permite eliminar un archivo abierto. `allowDeleteOpenFiles` puede cambiar esa regla.
- `seek` se limita al intervalo entre cero y el tamaño actual. No se modelan archivos dispersos en esta fase.
- Los tipos `directory`, `character-special` y `block-special` pueden representarse, pero su semántica de E/S no se inventa: `open` devuelve `UNSUPPORTED_FILE_TYPE`.
- Renombrar un archivo abierto conserva sus descriptores porque éstos referencian el identificador estable, no el nombre.

Estas decisiones pertenecen al simulador y no deben presentarse como universales.

## Escenarios

Un `ScenarioDefinition` contiene configuración de nombres, transferencias y reloj, además de archivos y procesos iniciales.

El reloj y los identificadores son deterministas. `restoreScenario()` reconstruye bytes, atributos, procesos, descriptores, posiciones, reloj y contadores desde la definición original. Dos motores creados desde la misma definición mantienen estados independientes.

## API pública

```ts
import { FileSystemEngine, BASIC_SCENARIO } from './engine'

const engine = new FileSystemEngine(BASIC_SCENARIO)
const opened = engine.open('editor', 'notes', 'read')

if (opened.ok) {
  const result = engine.read('editor', opened.value.descriptor, 4096)
  if (result.ok && result.value.outcome === 'data') {
    console.log(result.value.bytesTransferred)
  }
}
```

## Verificación

```bash
npm test
npm run typecheck
npm run build
```
