# SIGER4

Sistema Informático de GEstión de la Regional 4 de bomberos voluntarios. Es una aplicación web instalable (PWA) hecha con
React y Vite; la base de datos, la autenticación, los archivos y las funciones del servidor están en Supabase, y la
interfaz se publica en Vercel.

## Estructura

```text
frontend/   la interfaz web: src/, public/, index.html y la configuración de Vite, TypeScript y ESLint
backend/    el servidor: supabase/ (migraciones, Edge Functions y scripts SQL de operación) y scripts/
tests/      las pruebas: frontend/ (pantallas) y backend/ (base de datos y anuncio de versiones)
docs/       documentación técnica
```

En la raíz quedan solo los archivos generales: `package.json` (versión del sistema, workspace y comandos),
`package-lock.json`, `vercel.json` (configuración del despliegue), `.gitignore`, este README y `DEPLOYMENT.md`. El detalle de
qué va en cada carpeta, y por qué, está en [docs/estructura.md](docs/estructura.md).

## Requisitos

- Node 22.18 o más nuevo, con npm (probado con Node 24.22.2).
- Google Chrome, para las pruebas de pantalla.
- PostgreSQL 16 local, para las pruebas de la base.
- La CLI de Supabase, solo para desplegar funciones y cargar secretos.

## Primeros pasos

```powershell
npm install                                     # una sola vez, en la raíz: instala la interfaz y las herramientas
Copy-Item frontend/.env.example frontend/.env   # completar con los valores públicos del proyecto de Supabase
npm run dev                                     # http://localhost:5173
```

## Comandos

Todos se corren desde la raíz.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Levanta la interfaz en modo desarrollo |
| `npm run build` | Compila la interfaz para producción en `frontend/dist` (lo mismo que corre Vercel) |
| `npm run preview` | Sirve en local el build de producción |
| `npm run lint` | Revisa la interfaz con ESLint |
| `npm test` | Todas las pruebas: primero las del backend, después las de pantalla |
| `npm run test:frontend` | Pruebas de pantalla por rol, ancho y tema, con Supabase simulado (es `test:ui`) |
| `npm run test:backend` | `test:release` y `test:db` |
| `npm run test:release` | Contrato, Edge Function y comando de anuncio de versiones, sin red ni base |
| `npm run test:db` | Todas las migraciones desde una base vacía, suites SQL y auditoría, contra un PostgreSQL 16 local |
| `npm run security:check` | Revisión de seguridad del repositorio; con `-- --url https://<sitio>` revisa también el sitio publicado |
| `npm run release:announce` | Anuncia una versión ya publicada, a mano ([DEPLOYMENT.md](DEPLOYMENT.md), sección 75) |

Qué prueba cada suite, qué necesita y qué no está automatizado: [tests/README.md](tests/README.md).

## Despliegue

- **Interfaz:** Vercel publica `main` en producción y cada rama en un preview, con lo que define `vercel.json`.
- **Base de datos:** las migraciones de `backend/supabase/migrations/` se corren a mano en el SQL Editor de Supabase, en
  orden y una por ejecución.
- **Edge Functions y secretos:** con la CLI de Supabase, siempre desde `backend/` ([backend/README.md](backend/README.md)).

El procedimiento completo y el historial de cada versión están en [DEPLOYMENT.md](DEPLOYMENT.md).

## Más documentación

- [docs/estructura.md](docs/estructura.md): carpetas, qué es frontend y qué es backend, código compartido y equivalencias
  con las rutas anteriores.
- [docs/desarrollo.md](docs/desarrollo.md): instalación, trabajo diario y errores frecuentes.
- [docs/variables-de-entorno.md](docs/variables-de-entorno.md): qué variable va dónde y cuáles son secretas.
- [frontend/README.md](frontend/README.md) y [backend/README.md](backend/README.md): lo propio de cada parte.
- [tests/README.md](tests/README.md): las pruebas.
