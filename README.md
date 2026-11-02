# FileLab

Aplicación educativa sobre archivos en Sistemas Operativos, basada en los apartados 4.1.1 a 4.1.7 de Tanenbaum.

## Ejecutar localmente

```bash
npm install
npm run dev
```

## Verificaciones

```bash
npm test
npm run typecheck
npm run build
```

## Implementado

### Fase 1 — Presentación y base visual

- Base React, Vite y TypeScript.
- Presentación vertical con once bloques visuales.
- Navegación, progreso, modo exposición y controles por teclado.
- Diseño responsive para pantalla compartida, computadora y celular.
- Paneles expandibles accesibles.
- Base visual del explorador FileLab OS.
- Patrón visual para separar acciones de interfaz y operaciones internas.

### Fase 2 — Motor de simulación

- Motor TypeScript independiente de React y de cualquier backend.
- Archivos con identificador, nombre, tipo, formato, bytes y atributos.
- Procesos, descriptores, modos de apertura y posiciones independientes.
- Las once operaciones de Tanenbaum 4.1.6.
- `creat` complementario y separado de `create` para el ejemplo de 4.1.7.
- Búferes con capacidad y longitud válida.
- Transferencias parciales configurables.
- EOF diferenciado de los errores de lectura.
- Nomenclatura configurable y sensibilidad a mayúsculas.
- Modelo de protección didáctico identificado como `filelab-didactic-v1`.
- Escenarios deterministas, independientes y restaurables.
- Pruebas unitarias de operaciones, errores, permisos, cursores y casos límite.

Los contratos y las decisiones didácticas están documentados en [docs/ENGINE.md](docs/ENGINE.md).

### Fase 3 — Explorador FileLab OS

- Explorador conectado al motor, sin duplicar sus reglas en React.
- Navegación por carpetas simuladas, creación, apertura, edición, guardado, renombrado y eliminación.
- Ventanas de contenido reutilizables con vistas de texto y hexadecimal.
- Inspector de propiedades, fechas, tipo, formato, banderas y protección didáctica.
- Consola para las once operaciones del motor y el `creat` complementario.
- Observadores de descriptores, modos, cursores, búferes, bytes transferidos y resultados.
- Tres escenarios genéricos, restauración por escenario y reinicio general.
- Mensajes accesibles de éxito y error que identifican la operación fallida.
- Diseño responsive revisado en escritorio y móvil.

La integración y las decisiones propias de esta fase están documentadas en [docs/FILELAB_OS.md](docs/FILELAB_OS.md).

### Fase 4 — Contenidos y demostraciones académicas

- Clase completa sobre Tanenbaum 4.1.1–4.1.7.
- Contexto, definiciones, conceptos relacionados, ejemplos e ideas esenciales.
- Siete microactividades con resoluciones justificadas y revelables.
- Siete demostraciones interactivas conectadas al motor.
- Escenarios académicos independientes y restaurables.
- Demostraciones ampliables sin salir de la página.
- Copyfile sincronizado con código, descriptores, búfer, lecturas, escrituras y EOF.
- Recorridos de 30 o 45–50 minutos sin omitir contenidos centrales.
- Matriz de trazabilidad académica, pedagógica y técnica.

La cobertura detallada está en [docs/ACADEMIC_TRACEABILITY.md](docs/ACADEMIC_TRACEABILITY.md).

## Pendiente

- Operación Rescate está integrada en la subfase 5.7: apodo local, panel de misión, progreso general sobre 1.000 puntos, resultados por etapa, reinicio completo y pantalla final. La subfase 5.1 define sus contratos, puntuación, progreso y persistencia local en [docs/PHASE5_CONTRACTS.md](docs/PHASE5_CONTRACTS.md); las subfases 5.2 a 5.6 implementan los cinco minijuegos. Supabase, ranking, partidas online y panel docente continúan pendientes.
- Las subfases 6.1–6.3 agregan integración opcional con Supabase, autenticación del expositor, partidas, participantes, sincronización, ranking y panel docente; la configuración y las migraciones están documentadas en [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md).
- El despliegue es estático y puede realizarse en Vercel o Cloudflare Pages con el directorio `dist`.

La portada todavía necesita los nombres del grupo y de sus integrantes cuando se proporcionen. No se inventaron datos personales para completar ese requisito docente.
