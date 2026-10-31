# Pruebas

| Carpeta | Comando | Qué prueba | Contra qué | Necesita | Dura |
|---|---|---|---|---|---|
| `frontend/ui/` | `npm run test:frontend` (= `test:ui`) | Cada variante de rol en cada pantalla, en celular y escritorio, claro y oscuro: que abra, sin desborde, accesibilidad (axe), un título, controles táctiles de 40 px | La interfaz real con un Supabase **simulado** dentro del navegador | Chrome | ~20 min el recorrido corto; `-- --full`, horas |
| `backend/release/` | `npm run test:release` | Contrato del anuncio de versiones, que coincida con la migración 0122, la Edge Function `announce-release` real y el comando `release:announce` de punta a punta | Node, con Supabase y producción **simulados**; sin red ni base | Node 22.18+ | segundos |
| `backend/db/` | `npm run test:db` | Todas las migraciones desde una base vacía, las suites SQL (permisos por rol y alcance, avisos), la reaplicación de las migraciones idempotentes y que `security_audit.sql` corra sin errores | **Base local**: PostgreSQL 16 en este equipo | PostgreSQL 16 | ~15 s |

`npm run test:backend` corre `test:release` y `test:db`; `npm test` corre el backend y después las pantallas.
`npm run security:check` no es una suite pero corre en cada revisión: dependencias, secretos en el árbol y en el historial,
código del navegador, separación frontend/backend, encabezados de `vercel.json`, migraciones y el build compilado.

## Base local para `npm run test:db`

Un PostgreSQL 16 solo para pruebas, en el puerto 54329 (para no chocar con otro que haya en el equipo). Con los binarios de
PostgreSQL 16 (por ejemplo, el ZIP de "binaries" de EDB):

```powershell
initdb -D C:\ruta\pgdata-siger4 -U postgres -A trust -E UTF8 --no-locale       # una sola vez
pg_ctl -D C:\ruta\pgdata-siger4 -o "-p 54329" -l C:\ruta\pgdata-siger4\pg.log start
$env:PSQL = "C:\ruta\pgsql\bin\psql.exe"                                         # si psql no está en el PATH
npm run test:db
pg_ctl -D C:\ruta\pgdata-siger4 stop
```

`-A trust` deja entrar sin contraseña: solo para una base de pruebas que escucha en este equipo. `test:db` se niega a
conectarse a otro equipo, borra y vuelve a crear la base `siger4_test` y la deja armada al terminar. Para armar una base solo
hasta una migración, sin suites: `node tests/backend/db/run.mjs mi_base 0120`.

Las suites (`backend/db/test_*.sql`) usan los datos de prueba de `fixture70.sql` y `fixture71.sql`, corren dentro de una
transacción que se deshace al final y escriben una línea `PASS` o `FAIL` por comprobación. Una suite nueva solo tiene que
llamarse `test_<algo>.sql` para que `test:db` la corra.

## Lo que no está automatizado

- **Integración interfaz + backend real.** No hay una suite que levante la interfaz contra un Supabase real o local: haría
  falta Supabase local completo (Docker), que el proyecto no usa. Por eso `npm run test:integration` no existe. Esa parte se
  verifica a mano en el preview de Vercel o en producción, con una cuenta de prueba, siguiendo las listas de DEPLOYMENT.md
  (sección 2.6 y la de cada versión).
- **Edge Functions en Deno.** Solo `announce-release` se prueba, y en Node con un Deno mínimo. Las demás funciones no tienen
  prueba automática.
- **Celular real, Safari o iOS y lectores de pantalla reales.** Las pruebas de pantalla emulan un Android en Chrome de
  escritorio.

## Cómo informar una prueba

Al dejar asentado qué se probó (por ejemplo, en una sección de DEPLOYMENT.md), separar por tipo de evidencia: revisión de
código; servidor simulado (`test:frontend`, `test:release`); base local (`test:db`); producción o preview de Vercel; Android
emulado; dispositivo físico. Lo que no se probó se dice explícitamente.
