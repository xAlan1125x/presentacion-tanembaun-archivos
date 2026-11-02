# Fase 4 — matriz de trazabilidad académica y pedagógica

Fuente académica principal: Andrew S. Tanenbaum, *Sistemas Operativos*, sección 4.1, páginas impresas 257–268 del material provisto. Fuente pedagógica: *Pautas para la preparación de la clase grupal*.

La página sigue el recorrido solicitado por las pautas: necesidad → concepto → ejemplo visual → actividad → resolución → demostración → idea esencial. Las composiciones visuales cambian entre secciones para no convertir la exposición en una plantilla repetitiva.

| Apartado | Conceptos cubiertos | Sección | Demostración y escenario | Participación y resolución | Verificación |
| --- | --- | --- | --- | --- | --- |
| 4.1.1 | nombres, longitud/reglas variables, extensiones como convenciones, sensibilidad a mayúsculas | `#nombres` | `NamingDemo` · `academic-names`: crea `Informe.txt` junto a `informe.txt`; cambia `.txt` por `.jpg` y compara bytes | Predicción sobre si la extensión transforma el contenido; resolución: rename no modifica bytes | prueba de conservación de contenido, colisión sensible y restauración |
| 4.1.2 | secuencia de bytes, registros de longitud fija, árbol de registros con llave | `#estructura` | `StructureDemo` · `academic-structures`: el mismo archivo se lee por byte, registro de 8 bytes o llave de 3 bytes | Elección del modelo para buscar por legajo; resolución: árbol por llave | prueba de longitud de registro, posición de llave y tamaño inalterado |
| 4.1.3 | archivos regulares, texto ASCII, binarios, directorios, especiales de caracteres y bloques | `#tipos` | `TypesDemo` · `academic-types`: abre texto y binario; tipos especiales devuelven error controlado | Caso `foto.txt` con firma binaria; resolución basada en evidencia interna | prueba de apertura regular, `UNSUPPORTED_FILE_TYPE` y restauración |
| 4.1.4 | acceso secuencial, acceso aleatorio, posición actual, seek | `#acceso` | `AccessDemo` · `academic-access`: lee registros de 2 bytes, reposiciona, llega a EOF | Elección entre lecturas repetidas y seek + read; resolución con cursor visible | prueba de avance secuencial y reposicionamiento a offset 6 |
| 4.1.5 | protección, propietario/creador, banderas, tiempos, tamaño y atributos estructurales | `#atributos` | `AttributesDemo` · `academic-attributes`: visitante intenta escribir; propietario activa sólo lectura y vuelve a intentar | Diagnóstico de una escritura fallida; resolución consultando metadatos | prueba de `PERMISSION_DENIED`, `READ_ONLY` y restauración |
| 4.1.6 | create, delete, open, close, read, write, append, seek, get/set attributes, rename; descriptor, modo, cursor, resultado | `#operaciones` | `OperationsDemo` · `academic-operations`: panel de once operaciones, tabla de descriptores y errores explícitos | Reparación de `create → read → close`; resolución: falta open y su descriptor | pruebas del motor y prueba académica que diferencia EOF de descriptor inválido |
| 4.1.7 | argumentos, open, creat, búfer de 4096, read, write de la cantidad leída, close, reporte de errores | `#copyfile` | `CopyfileDemo` · `academic-copyfile`: origen de 9500 B, destino truncado, código y llamadas sincronizadas | Cálculo de la última lectura; resolución: 1308 B y luego EOF | prueba paso a paso: 4096 + 4096 + 1308, destino de 9500 B, descriptores cerrados y restauración |

## Distinciones conceptuales

- Los tres modelos de 4.1.2 son los descritos por Tanenbaum. La animación, los colores y la búsqueda clicable son representaciones didácticas adicionales.
- Las extensiones, tipos y atributos no se presentan como universales. La página señala explícitamente que sus reglas varían entre sistemas.
- `create` conserva el significado conceptual de 4.1.6. `creat` se usa únicamente para la llamada C del programa de 4.1.7.
- El modelo `filelab-didactic-v1` no representa permisos POSIX ni ACL.
- EOF es un resultado exitoso de lectura con cero bytes; no se muestra como error.
- La estructura base del programa copyfile permanece fiel al libro. El tratamiento general de escrituras parciales aparece rotulado como complemento de robustez.

## Adaptación temporal

### Recorrido esencial — aproximadamente 30 minutos

- Contexto: 3 min.
- Siete conceptos e ideas esenciales: 14 min.
- Demostraciones breves de nomenclatura, acceso, atributos, operaciones y copyfile: 10 min.
- Síntesis: 3 min.

Las demostraciones de estructura y tipos pueden mostrarse sólo con un caso representativo sin eliminar sus conceptos centrales.

### Recorrido extendido — aproximadamente 45–50 minutos

- Contexto y predicción inicial: 4 min.
- Explicación de los siete apartados: 18 min.
- Siete microactividades con resolución: 9 min.
- Siete demostraciones completas: 15 min.
- Síntesis y dudas: 4 min.

## Alcance pendiente

- Completar en la portada los nombres del grupo y sus integrantes cuando sean proporcionados.
- Los juegos, puntuación, Supabase, ranking y panel docente permanecen fuera de esta fase.
