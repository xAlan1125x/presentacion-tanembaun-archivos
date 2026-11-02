# FileLab OS — integración del explorador

La fase 3 conecta el explorador con `FileSystemEngine` mediante `FileLabSession`. React presenta snapshots y envía intenciones; no valida nombres, permisos, modos, cursores ni transferencias por su cuenta.

## Capas

1. `src/engine`: estado y reglas de las operaciones de archivos.
2. `src/lab`: sesión del laboratorio, escenarios, ubicación visual por carpetas, consola e historial.
3. `src/components/filelab`: explorador, ventanas, inspector y observadores.

El motor continúa siendo independiente de React y de cualquier backend.

## Carpetas simuladas

El motor de la fase 2 utiliza un espacio de nombres plano. Para ofrecer navegación convencional sin cambiar ese contrato, `FileLabSession` mantiene una relación `fileId → folderId` asociada al escenario.

Las carpetas son organización de la interfaz del laboratorio en esta fase:

- no agregan operaciones de directorio al motor;
- no se presentan como uno de los modelos de estructura interna de archivos de Tanenbaum 4.1.2;
- se restauran junto con el escenario;
- no admiten creación, renombrado ni eliminación todavía, porque no son necesarios para el objetivo de la fase.

## Guardado desde una ventana

Guardar contenido completo es una acción de interfaz compuesta:

1. `creat` trunca el archivo y abre un descriptor de escritura;
2. `write` se repite hasta transferir todos los bytes, porque una llamada puede ser parcial;
3. se cierra el descriptor temporal;
4. el archivo se vuelve a abrir en modo `read-write`.

Cada paso queda registrado como operación interna. Es una estrategia de FileLab para el editor y no se presenta como comportamiento universal de exploradores o sistemas operativos reales.

Los archivos binarios se pueden abrir e inspeccionar en hexadecimal, pero la edición textual está deshabilitada para no sugerir una transformación de formato inexistente.

## Consola

La consola acepta nombres entre comillas y expone:

```text
create <nombre>
creat <nombre>
delete <archivo>
open <archivo> <read|write|read-write|append>
close <descriptor>
read <descriptor> <bytes>
write <descriptor> <texto>
append <descriptor> <texto>
seek <descriptor> <posición> [start|current|end]
attrs <archivo>
set <archivo> <readOnly|hidden|system|archive|temporary|locked> <true|false>
rename <archivo> <nombre>
```

`help`, `ls` y `clear` son comandos auxiliares de la interfaz, no operaciones de archivos del apartado 4.1.6.

## Escenarios de fase 3

- **Espacio de trabajo:** texto, código y bytes para recorridos generales.
- **Atributos y protección:** archivos de sólo lectura, bloqueados y compartidos.
- **Transferencias parciales:** limita cada `read` y `write` a cuatro bytes.

Son escenarios técnicos de práctica. Los escenarios académicos guiados para 4.1.1–4.1.7 pertenecen a la fase 4.

La fase 4 agrega siete escenarios académicos con prefijo `academic-`. Su cobertura se documenta en [ACADEMIC_TRACEABILITY.md](ACADEMIC_TRACEABILITY.md).

## Restauración

- **Restaurar escenario** recupera bytes, atributos, descriptores, cursores y ubicaciones del escenario seleccionado.
- **Reinicio general** vuelve al espacio de trabajo inicial.
- Cambiar de escenario descarta el estado transitorio del escenario anterior.

## Verificación

Las pruebas de `src/lab/__tests__/FileLabSession.test.ts` cubren el recorrido completo de edición, renombrado, atributos, bytes, consola, descriptores, EOF, errores, restauración y transferencias parciales.

```bash
npm test
npm run typecheck
npm run build
```
