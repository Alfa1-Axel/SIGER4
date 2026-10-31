# Variables de entorno

Regla general: **todo lo que empieza con `VITE_` termina en el navegador** (Vite lo escribe dentro del código publicado), así
que solo puede ser público. Los secretos viven únicamente en Supabase (Edge Functions → Secrets) o, para el comando de
publicación, en la terminal mientras se usa. Nunca en el repositorio ni en un archivo que se suba.

## Interfaz (públicas)

Se configuran en Vercel (Project Settings → Environment Variables, en Production, Preview y Development) y, para trabajar en
el equipo, en `frontend/.env` (copia de `frontend/.env.example`, que tiene valores ficticios).

| Variable | Para qué | Obligatoria |
|---|---|---|
| `VITE_SUPABASE_URL` | Dirección del proyecto de Supabase | sí |
| `VITE_SUPABASE_ANON_KEY` | Clave pública (anon) del proyecto. **Nunca** la `service_role` | sí |
| `VITE_VAPID_PUBLIC_KEY` | Clave pública de las notificaciones push (DEPLOYMENT.md, sección 1.8) | solo con push |
| `VITE_PASSKEYS_ENABLED` | `true` para mostrar el ingreso con passkey (DEPLOYMENT.md, sección 57.5) | no (por defecto, apagado) |

Vercel agrega además `VERCEL_GIT_COMMIT_SHA` durante el armado: `frontend/vite.config.ts` lo usa para el commit que muestran
el panel de versión y `/version.json`. No hay que configurarla.

## Edge Functions (secretos)

Se cargan en Supabase, en Edge Functions → Secrets, o con la CLI desde `backend/` (`supabase secrets set NOMBRE=valor`;
`supabase secrets list` muestra solo los nombres).

| Secreto | Lo usan | Qué es |
|---|---|---|
| `CRON_SHARED_SECRET` | `send-push-system`, `purge-documents` | Secreto compartido con las tareas programadas de la base (encabezado `x-cron-secret`) |
| `VAPID_PRIVATE_KEY` | `send-push`, `send-push-system` | Clave privada de Web Push. Nunca en la interfaz |
| `VAPID_PUBLIC_KEY` | `send-push`, `send-push-system` | La pública, la misma que `VITE_VAPID_PUBLIC_KEY` |
| `VAPID_SUBJECT` | `send-push`, `send-push-system` | Contacto que exige el estándar Web Push (tiene un valor por defecto) |
| `RELEASE_ANNOUNCE_TOKEN` | `announce-release` | Secreto propio del anuncio de versiones, de 32 caracteres o más (DEPLOYMENT.md, sección 75.4) |
| `SIGER4_PUBLIC_URL` | `announce-release` | Dirección pública de producción, `https://` y sin barra final |

Supabase inyecta por su cuenta `SUPABASE_URL`, `SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en todas las funciones: no se
cargan a mano. `analyze-report` no se usa ni se despliega (DEPLOYMENT.md, sección 1.7), así que sus variables no hacen falta.

## Configuración guardada en la base

`project_url` y `cron_shared_secret` no son variables de entorno: están en la tabla `system_settings` y se cargan desde la
configuración del sistema que Informática tiene en la aplicación (DEPLOYMENT.md, sección 33). `cron_shared_secret` tiene que
ser el mismo valor que el secreto `CRON_SHARED_SECRET` de las funciones.

## Terminal, solo al anunciar una versión

`npm run release:announce` lee tres variables de la sesión de la terminal (DEPLOYMENT.md, sección 75.4). No se guardan en
ningún archivo y se borran al terminar:

| Variable | Qué es |
|---|---|
| `RELEASE_ANNOUNCE_TOKEN` | El mismo secreto que tiene la función `announce-release` |
| `SIGER4_FUNCTIONS_URL` | `https://<proyecto>.supabase.co/functions/v1` |
| `SIGER4_PUBLIC_URL` | Dirección pública de producción |

## Pruebas

| Variable | Prueba | Por defecto |
|---|---|---|
| `CHROME_PATH` | `test:frontend` | el Chrome instalado |
| `PSQL` | `test:db` | el `psql` del PATH |
| `PGPORT` | `test:db` | `54329` |
| `PGUSER` | `test:db` | `postgres` |
| `PGHOST` | `test:db` | `localhost`; solo acepta este equipo |

Las pruebas de pantalla levantan la interfaz con valores ficticios (`VITE_SUPABASE_URL=https://mock.supabase.local`), aunque
exista `frontend/.env`: nunca se conectan al proyecto real.

## Si un secreto quedó expuesto

1. Generar un valor nuevo y cargarlo donde corresponde: en Supabase para los secretos de las funciones (y, para
   `cron_shared_secret`, también en la configuración del sistema); en el gestor de contraseñas para el del anuncio.
2. Para la `service_role` o la clave anon, regenerarlas desde el panel de Supabase (Project Settings → API) y actualizar
   `VITE_SUPABASE_ANON_KEY` en Vercel y en `frontend/.env`.
3. Para el par VAPID, generar uno nuevo (las suscripciones push existentes dejan de servir y cada persona tiene que volver a
   activar el aviso).
4. Si el secreto llegó a un commit, rotarlo igual: borrarlo del historial no alcanza, porque el repositorio es público.

`npm run security:check` revisa el árbol, el historial de Git y el build en busca de archivos `.env`, claves y JWT con rol
`service_role`, sin imprimir nunca un valor.
