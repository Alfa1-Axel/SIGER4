# Desarrollo

## Requisitos

| Herramienta | Para qué | Versión |
|---|---|---|
| Node y npm | todo | Node 22.18 o más nuevo (`release:announce` y `test:release` leen TypeScript directamente). Probado con Node 24.22.2 y npm 11.19.1 |
| Google Chrome | `npm run test:frontend` | el instalado en el equipo; otro lugar: variable `CHROME_PATH` |
| PostgreSQL 16 | `npm run test:db` | local, en el puerto 54329 (ver [tests/README.md](../tests/README.md)) |
| CLI de Supabase | desplegar funciones y cargar secretos | probada la 2.122.0 ([backend/README.md](../backend/README.md)) |

## Instalación

```powershell
npm install
```

Se corre **una sola vez y en la raíz**: el repositorio es un workspace de npm, así que instala las dependencias de la
interfaz (`frontend/package.json`) y las herramientas de la raíz (pruebas y revisión de seguridad) en un único
`node_modules/` y con un único `package-lock.json`. `npm ci` hace lo mismo respetando el lockfile al pie de la letra (es lo
que conviene si `node_modules` quedó en un estado raro).

Después, las variables públicas de la interfaz:

```powershell
Copy-Item frontend/.env.example frontend/.env
```

y completar `frontend/.env` con la URL y la clave pública (anon) del proyecto de Supabase. Qué es cada variable y dónde va:
[variables-de-entorno.md](variables-de-entorno.md).

## Trabajo diario

| Comando (desde la raíz) | Qué hace |
|---|---|
| `npm run dev` | Interfaz en `http://localhost:5173`, con recarga en caliente |
| `npm run build` | `tsc -b` y `vite build`; deja el sitio en `frontend/dist/` (con el service worker y `/version.json`) |
| `npm run preview` | Sirve `frontend/dist/` en `http://localhost:4173` para revisar el build de producción |
| `npm run lint` | ESLint sobre `frontend/` |
| `npm run security:check` | Revisión de seguridad del repositorio (también corre `npm audit`) |

Los cuatro primeros también funcionan desde `frontend/` (`npm run dev`, etc.); los demás comandos existen solo en la raíz.
A `dev`, `build` y `preview` se les pueden pasar opciones de Vite después de `--`: `npm run dev -- --port 5175`.

Para cambiar algo del backend (migraciones, funciones, scripts SQL): [backend/README.md](../backend/README.md). Para las
pruebas: [tests/README.md](../tests/README.md).

## Errores frecuentes

**`npm error Missing script: "test:db"` (u otro comando).** Se corrió dentro de `frontend/`, que solo tiene `dev`, `build`,
`preview` y `lint`. Los comandos generales se corren desde la raíz.

**La aplicación no se conecta y la consola del navegador dice "Faltan las variables de entorno VITE_SUPABASE_URL /
VITE_SUPABASE_ANON_KEY".** Falta `frontend/.env`. Si venías de antes de la separación, el `.env` estaba en la raíz: hay que
moverlo a `frontend/.env` (Vite lo busca en la carpeta de la interfaz).

**Después de traer la separación a un equipo que ya tenía el repositorio.** Git mueve los archivos versionados, pero no los
que ignora. En ese equipo hay que:
1. mover `.env` de la raíz a `frontend/.env`;
2. mover `supabase/.temp/` a `backend/supabase/.temp/` (es el proyecto vinculado de la CLI; si no existe, vincularlo de nuevo
   desde `backend/`) y borrar la carpeta `supabase/` que queda vacía en la raíz;
3. borrar `dist/` y `tsconfig.*.tsbuildinfo` de la raíz si existen (se regeneran dentro de `frontend/`);
4. correr `npm ci` en la raíz.

**La CLI de Supabase no encuentra la función, o aparece una carpeta `supabase/` nueva en la raíz.** La CLI se corrió desde
la raíz. Hay que correrla desde `backend/` (o con `--workdir backend`). Un `functions deploy` desde la raíz no despliega
nada; un `functions new` o un `link` crean una carpeta `supabase/` suelta en la raíz (Git la ignora): borrarla y repetir
desde `backend/`.

**Git o `psql` dicen que un archivo no existe o que el nombre es demasiado largo (Windows).** Windows limita las rutas a 260
caracteres para los programas que no admiten rutas largas, como `psql`. La ruta más larga del repositorio es
`backend/supabase/migrations/0097_avales_coordinator_from_departments_and_audit_super_admin.sql` (94 caracteres): la carpeta
donde se clona tiene que tener menos de unos 160. Para Git alcanza con `git config core.longpaths true`; para `psql`, no:
clonar en una carpeta más corta. `npm run test:db` avisa con una falla si `psql` no pudo leer una migración.

**`npm run build` falla con "The fileName or name properties of emitted chunks and assets must be strings that are neither
absolute nor relative paths".** El repositorio se abrió desde una unidad creada con `subst` (o un enlace a otra carpeta): Vite
mezcla la ruta de la unidad con la real. Abrirlo desde su ruta real.

**`node_modules` con versiones que no coinciden con `package-lock.json`.** Puede pasar si la carpeta se sincroniza con
OneDrive u otro servicio. `npm ci` en la raíz lo deja exactamente como el lockfile. Conviene que el repositorio no viva en una
carpeta sincronizada: además de `node_modules`, sincronizar `.git` entre equipos puede dañar el repositorio.

**`npm audit` muestra 4 avisos de severidad baja.** Son de la cadena de `vite-plugin-pwa` (`workbox-build`) y solo intervienen
en el armado; el único arreglo que propone npm es bajar `vite-plugin-pwa` a una versión de hace años. `npm audit
--audit-level=high` y `npm run security:check` pasan.

**`npm run release:announce` dice "No se pudo cargar el contrato compartido".** Hace falta Node 22.18 o más nuevo.

**`npm run test:frontend` no encuentra Chrome, o dice que ya hay algo en el puerto 5199.** Indicar la ruta con
`CHROME_PATH`, o cerrar lo que esté usando el puerto (la prueba nunca reutiliza un servidor que podría estar conectado a la
base real).

**`npm run test:db` dice "No responde un PostgreSQL en localhost:54329".** Falta levantar el PostgreSQL 16 de pruebas
(ver [tests/README.md](../tests/README.md)). Si dice que no pudo ejecutar `psql`, indicar su ruta con la variable `PSQL`.

**Git avisa "LF will be replaced by CRLF".** Es la conversión de fin de línea de Git para Windows (`core.autocrlf`). En el
repositorio los archivos quedan con LF; no hay que hacer nada.
