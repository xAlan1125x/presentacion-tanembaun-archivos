# Supabase — subfase 6.1

La integración es opcional. Si `VITE_SUPABASE_URL` o `VITE_SUPABASE_ANON_KEY` no están definidos, FileLab continúa funcionando con el modo local de Operación Rescate.

## Configuración de un proyecto independiente

1. En [Supabase](https://supabase.com/dashboard), crear un proyecto nuevo e independiente para FileLab. Guardar la contraseña de la base de datos fuera del repositorio.
2. En `Authentication > Providers`, mantener habilitado `Email` y contraseña para la cuenta del expositor. Crear esa cuenta desde `Authentication > Users` o mediante el flujo de registro de Supabase. Para una práctica local, se puede desactivar temporalmente la confirmación de email; en un entorno compartido es preferible mantenerla activa.
3. En `Authentication > Providers`, habilitar `Anonymous Sign-Ins`. Los usuarios anónimos usan el rol `authenticated`, pero sus JWT incluyen `is_anonymous`; la migración los permite para el futuro ingreso de participantes y los bloquea específicamente para crear partidas.
4. En `Project Settings > API`, copiar la URL del proyecto y la clave pública `anon` (o publishable key equivalente).
5. Copiar `.env.example` como `.env.local` y completar:

   ```text
   VITE_SUPABASE_URL=https://<proyecto>.supabase.co
   VITE_SUPABASE_ANON_KEY=<clave pública anon>
   ```

6. Abrir `SQL Editor`, crear una consulta nueva, pegar el contenido completo de `supabase/migrations/20261101203000_phase6_1.sql` y ejecutarlo una sola vez. Esta subfase no aplica migraciones automáticamente. Verificar en `Table Editor` que existan `sessions`, `participants` y `participant_progress`.
7. Reiniciar Vite después de cambiar variables de entorno:

   ```bash
   npm run dev
   ```

La clave `anon` es una clave pública para el frontend. Nunca colocar `service_role`, contraseñas ni tokens administrativos en `.env.local` ni en el código cliente.

La función de creación exige una sesión no anónima; las sesiones anónimas quedan reservadas para el flujo de participantes de 6.2.

## Prueba manual de 6.1

1. Ejecutar `npm run dev` con `.env.local` presente.
2. Abrir `http://localhost:5173/#operacion-rescate`.
3. En `Administrar partidas online`, iniciar sesión con la cuenta docente.
4. Crear una partida con un nombre de entre 1 y 80 caracteres. Debe aparecer un código hexadecimal de 8 caracteres y un enlace.
5. Recargar la página. La misma cuenta debe seguir autenticada y la partida debe aparecer en la lista.
6. Cerrar la partida. Debe cambiar a `cerrada` y dejar de ofrecer el botón de cierre.
7. Como comprobación de permisos, no usar una sesión anónima para el panel docente: la base debe rechazar `create_game_session` con `teacher authentication required`.

La prueba real requiere un proyecto configurado, la migración ejecutada y las variables locales cargadas. Sin esos tres elementos sólo se puede verificar el fallback local.

## Subfase 6.2: participantes

Ejecutar manualmente `supabase/migrations/20261101220000_phase6_2.sql` después de la migración de 6.1. Esta corrección mantiene la actualización atómica del mejor puntaje y además rechaza actualizaciones cuando la partida ya está cerrada.

Si la RPC de ingreso devuelve `column reference "session_id" is ambiguous`, ejecutar también `supabase/migrations/20261101221000_phase6_2_join_fix.sql`. Es una corrección compatible que sólo reemplaza la función de ingreso.

Para entrar, el participante abre el enlace con `?partida=XXXXXXXX`, introduce el código y un apodo válido, y FileLab crea o recupera una sesión anónima. La identidad y el progreso online se guardan bajo claves separadas de `filelab:phase5:progress:v1`; el modo local no se mezcla con la partida online.

Los resultados se guardan primero en el dispositivo y se sincronizan mediante `update_participant_progress`. Si falla la red, el participante puede continuar; al volver la conexión se reintenta usando el estado local online y se conserva el máximo de cada etapa. La puntuación sigue siendo calculada por el navegador y puede manipularse.

## Revisión de integración

Durante la revisión se corrigieron dos casos relacionados con 6.1:

- Una sesión anónima persistida podía mostrarse como sesión docente en la interfaz, aunque la base rechazara correctamente la creación. El panel ahora exige un usuario no anónimo.
- La generación de códigos ahora reintenta si encuentra una colisión con un código existente, en lugar de fallar innecesariamente.
- En algunos proyectos Supabase, `pgcrypto` expone `gen_random_bytes` dentro de `extensions`; la función de creación la referencia explícitamente para que el código de partida funcione con `search_path = public`.

Las migraciones de 6.1 y 6.2 fueron aplicadas y verificadas manualmente en el proyecto de FileLab. No se incluyen credenciales administrativas en el frontend.

## Operativo en 6.1

Con Supabase configurado, el panel de Operación Rescate permite al expositor:

- iniciar sesión;
- crear partidas;
- consultar sus partidas;
- copiar manualmente el código o enlace generado;
- cerrar partidas.

La interfaz de participantes y la sincronización de resultados están activas para las cinco etapas.

## Modelo y límites

La migración crea `sessions`, `participants` y `participant_progress`, con relaciones, restricciones, RLS básica y funciones SQL para creación, incorporación futura y actualización atómica del mejor puntaje.

El progreso local de fase 5 conserva la clave `filelab:phase5:progress:v1` y no se mezcla con las tablas online. Las puntuaciones siguen calculándose localmente y pueden manipularse; Supabase conserva el mejor resultado recibido por participante y etapa.

## Subfase 6.3: finalización y clasificación

Ejecutar manualmente `supabase/migrations/20261101230000_phase6_3.sql` después de las migraciones anteriores. Esta migración agrega `finished_at`, permite finalizar sólo con las cinco etapas completadas, bloquea nuevas actualizaciones de participantes finalizados y agrega la consulta de clasificación con posiciones empatadas.

La clasificación incluye únicamente participantes finalizados y suma sus cinco mejores resultados. El panel docente actualiza los resultados bajo demanda; no utiliza Realtime ni polling. El modo local no usa estas funciones ni modifica sus datos.
