# Fase 5 — contratos de juego local

La subfase 5.1 define la base reutilizable de «Operación Rescate». Las subfases 5.2 a 5.6 agregan cinco minijuegos locales; las integraciones online quedan pendientes.

## Separación de responsabilidades

- `src/game/types.ts` contiene contratos serializables: etapas, progreso, evaluación y persistencia.
- `src/game/rules.ts` contiene reglas puras: creación de estado, cálculo de puntos, acumulación del mejor resultado y progreso.
- `src/game/persistence.ts` contiene el único adaptador de efectos externos: lectura, escritura y borrado de `localStorage`.
- La futura presentación sólo debe enviar una evaluación producida por las reglas del minijuego y mostrar su explicación. No debe calcular puntos ni validar contratos.

La subfase 5.2 implementa `classifyFiles.ts` como primer contrato concreto. Cada archivo se evalúa en tres ejes independientes: `type`, `format` y `structure`. El resultado incluye comprobaciones por archivo, cantidad de campos respondidos y explicaciones para los errores. La interfaz puede usar botones o arrastre, pero ambos caminos producen las mismas respuestas.

La subfase 5.3 implementa `detective.ts` como investigación basada en evidencias. El jugador selecciona hechos del expediente, inspecciona archivos y acontecimientos, consulta la secuencia temporal, puede pedir pistas con penalización y presenta una hipótesis. La validación diferencia evidencia relevante, evidencia engañosa, hipótesis correcta y piezas faltantes; la interfaz no decide la causa.

La subfase 5.4 implementa `repairSystem.ts` sobre un `FileLabSession` real. Cada desafío se resuelve sólo si el snapshot final y la traza de acciones cumplen sus condiciones: atributos, descriptores, cursor y cierre del ciclo. Los errores de permisos, descriptores inválidos y orden incorrecto quedan registrados y no cuentan como reparación.

La subfase 5.5 implementa `copyfileChallenge.ts` sobre un `FileLabSession` y el escenario `copyfile-challenge`. La interfaz ejecuta operaciones manuales reales: `open`, `creat`, `read`, `write` y `close`; los snapshots exponen descriptores, posiciones, búfer válido, bytes pendientes, lecturas, escrituras y EOF. La regla de escritura parcial del escenario limita cada `write` a 2.048 bytes, mientras que `read` limita cada lectura a 4.096, por lo que la última lectura válida contiene 1.308 bytes. Una evaluación sólo se completa cuando el destino coincide byte a byte con el origen, se alcanzó EOF y no quedan descriptores abiertos. Una cantidad de escritura inválida se registra como error controlado y no modifica el destino. `CopyfileSimulation` continúa siendo la demostración automática de referencia de 4.1.7; el desafío usa el mismo motor sin duplicar sus reglas.

La subfase 5.6 implementa `escapeRoom.ts` sobre el escenario independiente `escape-room`. La progresión exige cinco estados verificables: seleccionar `archive` por sus evidencias, retirar `readOnly`, abrir y reposicionar el descriptor, recuperar ocho bytes mediante `read`, escribirlos en `recuperacion.txt` y verificar el contenido con todos los descriptores cerrados. Los señuelos permanecen disponibles para inspección, los errores se registran sin alterar la solución y cuatro pistas opcionales descuentan puntos. La victoria se calcula desde snapshots del motor, bytes reales y la traza de operaciones; React sólo presenta herramientas desbloqueadas y resultados.

La subfase 5.7 integra las cinco etapas mediante `OperationRescueHub`. El apodo validado se almacena como `Phase5State.playerId`, sin registro tradicional ni nueva migración; el panel calcula la suma de mejores resultados con `totalScore`, muestra estados y conserva explicaciones por etapa. Un evento local actualiza el panel después de evaluar o reiniciar una etapa en la misma pestaña, mientras que `localStorage` permite recuperar la partida después de recargar. El reinicio completo borra únicamente la clave de progreso de Operación Rescate, con confirmación, y no toca el explorador ni los escenarios académicos. El panel final resume las cinco puntuaciones y los conceptos integrados. Los resultados son locales y no deben considerarse seguros contra manipulación; la fase 6 deberá asociarlos y recalcularlos en servidor.

Los contratos no dependen de React, `FileSystemEngine`, `FileLabSession` ni de Supabase. Los minijuegos podrán reutilizar esos simuladores dentro de sus propias reglas sin duplicar operaciones de archivos.

## Puntuación

Cada etapa tiene un máximo de 200 puntos y la fase completa un máximo de 1.000. `resolutionQuality` es un valor entre 0 y 1 calculado por las reglas del minijuego. La puntuación es proporcional a esa resolución, se descuentan penalizaciones explícitas y siempre se limita a 0..200.

La velocidad no participa en el cálculo. Una resolución incompleta no puede obtener la puntuación máxima. El estado conserva el mejor resultado de cada etapa, aunque registra todos los intentos.

## Estado y persistencia

`Phase5State` identifica al jugador local, registra fechas ISO y contiene el progreso independiente de las cinco etapas. Todas las etapas comienzan disponibles (`not-started`); no existe un bloqueo obligatorio entre ellas.

El adaptador usa la clave `filelab:phase5:progress:v1`. La persistencia local sólo permite reanudar tras recargar y **no es segura frente a manipulaciones**. El cargador valida versión, etapas, puntajes e intentos, y devuelve un error explícito ante datos inválidos. El reinicio debe borrar esta clave o crear un estado inicial nuevo.

## Evolución para servidor

El estado y las evaluaciones usan datos JSON simples y resultados discriminados (`ok: true/false`). Un futuro servidor puede reutilizar estos contratos como DTOs, pero deberá recalcular y verificar las evaluaciones; nunca debe confiar en el puntaje enviado por el navegador.
