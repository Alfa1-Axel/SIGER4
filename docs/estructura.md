# Estructura del repositorio

```text
SIGER4/
├── frontend/                    interfaz web (workspace de npm "siger4-frontend")
│   ├── src/                     React + TypeScript: pantallas, componentes, hooks, cliente de Supabase, service worker (sw.ts)
│   ├── public/                  archivos que se publican tal cual: logos, íconos de la PWA, theme-init.js
│   ├── scripts/                 generate-icons.cjs (ver "Archivos para revisar")
│   ├── index.html
│   ├── vite.config.ts           armado, PWA (manifest y service worker) y /version.json
│   ├── tsconfig*.json, eslint.config.js
│   ├── package.json             dependencias de la interfaz
│   └── .env.example             variables públicas de ejemplo (la copia real, .env, no se versiona)
├── backend/
│   ├── supabase/
│   │   ├── migrations/          122 migraciones, en orden; se corren a mano en el SQL Editor
│   │   ├── functions/           Edge Functions (Deno) y _shared/ (código que comparten entre sí)
│   │   └── *.sql                scripts de operación: security_audit, cleanup_test_data, reset_functional_db, seed_example,
│   │                            create_admin_user_example
│   ├── scripts/                 security-check.mjs (npm run security:check) y announce-release.mjs (npm run release:announce)
│   └── README.md                cómo trabajar con la CLI de Supabase
├── tests/
│   ├── frontend/ui/             pruebas de pantalla (Chrome + Supabase simulado en mock-supabase/)
│   ├── backend/db/              migraciones y permisos contra PostgreSQL local
│   ├── backend/release/         anuncio de versiones: contrato, Edge Function y comando, con servidores simulados
│   └── README.md
├── docs/                        esta documentación
├── package.json                 versión del sistema, workspace, overrides y comandos
├── package-lock.json            un único lockfile para todo el repositorio
├── vercel.json                  despliegue de la interfaz: armado, salida, reescrituras y encabezados de seguridad
├── README.md
└── DEPLOYMENT.md                procedimiento de despliegue e historial de cada versión
```

## Qué es frontend y qué es backend

**Frontend** es todo lo que se descarga en el navegador o se usa para armarlo: la aplicación React, sus estilos, el service
worker, los archivos públicos, la configuración de Vite, TypeScript y ESLint, y el cliente que habla con Supabase
(`frontend/src/lib/supabaseClient.ts` y `frontend/src/lib/api/`). Solo usa variables públicas (`VITE_*`).

**Backend** es lo que corre fuera del navegador: el esquema, las políticas RLS, las funciones y los triggers de la base
(migraciones), las Edge Functions, los scripts SQL de operación y los dos scripts de Node que trabajan contra el servidor o
auditan el repositorio. Es el único lugar donde se usan secretos.

**Pruebas:** `tests/frontend` prueba la interfaz con un backend simulado; `tests/backend` prueba la base (PostgreSQL local) y
el anuncio de versiones (Node, sin red). Hoy no hay pruebas automáticas de integración entre la interfaz y un backend real:
ver [tests/README.md](../tests/README.md).

## Qué queda en la raíz y por qué

| Archivo | Por qué está en la raíz |
|---|---|
| `package.json` | Es la raíz del workspace: un solo `npm install` instala todo, y todos los comandos se corren desde acá. Tiene la **versión del sistema** (la de todo SIGER4: interfaz, base y funciones), que lee `frontend/vite.config.ts` para el panel de versión y `/version.json`, y que verifica `npm run release:announce`. Los `overrides` de npm solo se respetan en la raíz. |
| `package-lock.json` | npm usa un único lockfile por workspace, en la raíz. |
| `vercel.json` | Vercel lo lee desde el directorio raíz del proyecto, que en el panel es la raíz del repositorio. Define `buildCommand` y `outputDirectory: frontend/dist`, que tienen prioridad sobre el panel: así no hubo que cambiar nada en Vercel. |
| `.gitignore`, `README.md`, `DEPLOYMENT.md` | Generales del repositorio. |

## Por qué `supabase/` está dentro de `backend/`

La CLI de Supabase busca la carpeta `supabase/` desde donde se ejecuta hacia arriba. Corriéndola desde `backend/` (o desde
cualquier subcarpeta, o con `--workdir backend` desde la raíz) encuentra `backend/supabase/`; esto se comprobó con la CLI
2.122.0. Desde la raíz, sin `--workdir`, no encuentra las funciones: un `functions deploy` falla sin desplegar nada. El
repositorio no tiene `config.toml` y **no hay que crearlo**: cambiaría la verificación de JWT de las funciones, que hoy se
controla con `--no-verify-jwt` al desplegar (DEPLOYMENT.md, sección 51). Detalle en [backend/README.md](../backend/README.md).

## Código compartido

No hay una carpeta `shared/` porque no hace falta:

- `backend/supabase/functions/_shared/` lo comparten las Edge Functions entre sí y con `backend/scripts/announce-release.mjs`
  (el contrato del anuncio de versiones). Es todo backend.
- Los roles, los tipos de notificación y las tablas existen en la base (enums, RLS) y, para mostrar la interfaz, en
  `frontend/src/types/`. La base es la que decide los permisos; la interfaz solo los refleja. Un paquete común no evitaría
  esa doble definición (el lado SQL sigue existiendo) y complicaría el armado de las funciones, que la CLI empaqueta desde
  `supabase/functions/`.
- **La interfaz nunca importa nada de fuera de `frontend/`.** `npm run security:check` lo comprueba en cada corrida.

## Equivalencias con las rutas anteriores

Las secciones 1 a 75 de `DEPLOYMENT.md` usan las rutas de su momento:

| Antes | Ahora |
|---|---|
| `src/`, `public/`, `index.html` | `frontend/src/`, `frontend/public/`, `frontend/index.html` |
| `vite.config.ts`, `tsconfig*.json`, `eslint.config.js` | `frontend/` |
| `.env.example` y la copia local `.env` | `frontend/.env.example` y `frontend/.env` |
| `dist/` | `frontend/dist/` |
| `supabase/` (migraciones, funciones y scripts SQL) | `backend/supabase/` |
| `scripts/security-check.mjs`, `scripts/announce-release.mjs` | `backend/scripts/` |
| `scripts/generate-icons.cjs` | `frontend/scripts/generate-icons.cjs` |
| `tests/ui/` (y su `backend/`) | `tests/frontend/ui/` (y `mock-supabase/`) |
| `tests/db/` | `tests/backend/db/` |
| `tests/db/rebuild.sh` | `npm run test:db` (`tests/backend/db/run.mjs`) |
| `tests/release/` | `tests/backend/release/` |
| Comandos `supabase …` desde la raíz | Desde `backend/` |

## Archivos que no se versionan

| Archivo | Dónde | Qué es |
|---|---|---|
| `.env` | `frontend/.env` | Valores reales de las variables públicas, para desarrollo local |
| `.temp/` | `backend/supabase/.temp/` | Proyecto vinculado con `supabase link` (lo crea la CLI) |
| `node_modules/` | raíz | Dependencias; `node_modules/siger4-frontend` es el enlace del workspace a `frontend/` |
| `dist/`, `*.tsbuildinfo` | `frontend/` | Salida del armado; se regeneran |
| `Logo escuela.png`, `LG INFORMATICA Y ESTADÍSTICA.png` | raíz | Originales de los logos (la copia que usa la aplicación está en `frontend/public/logos/` y `frontend/src/assets/`) |

## Archivos para revisar

- `frontend/scripts/generate-icons.cjs` genera `siger4-192.png` y `siger4-512.png`, que hoy no usa ninguna parte del
  sistema (la PWA usa `frontend/public/icons/manifest-icon-*.png`). Se conserva porque en la sección 68.3 de DEPLOYMENT.md
  se decidió dejarlo como herramienta de mantenimiento; si no se va a usar, se puede borrar.
- Tres comentarios de las Edge Functions todavía nombran las rutas anteriores de las pruebas y del comando de publicación
  (`_shared/releaseAnnouncement.ts` y `announce-release/index.ts`). No se tocaron para que el código de las funciones siga
  idéntico al desplegado; se pueden actualizar la próxima vez que se modifique esa función.
