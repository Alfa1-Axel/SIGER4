# Frontend

La interfaz web de SIGER4: React, TypeScript y Vite, instalable como PWA. Es un workspace de npm (`siger4-frontend`): se
instala con un solo `npm install` en la raíz del repositorio y sus comandos se corren también desde la raíz.

| Comando (desde la raíz) | Qué hace |
|---|---|
| `npm run dev` | `http://localhost:5173` |
| `npm run build` | Arma el sitio en `frontend/dist/` |
| `npm run preview` | Sirve `frontend/dist/` en `http://localhost:4173` |
| `npm run lint` | ESLint |

## Qué hay

- `src/`: pantallas (`pages/`), componentes, hooks, la capa de datos (`lib/api/`, contra Supabase con la clave pública y la
  sesión de cada persona; los permisos los decide la base), reportes PDF (`lib/pdf/`), tipos (`types/`) y el service worker
  (`sw.ts`).
- `public/`: se publica tal cual: logos (`logos/`, ver su README), íconos de la PWA y de las notificaciones (`icons/`) y
  `theme-init.js` (aplica el tema claro u oscuro antes de dibujar la primera pantalla).
- `vite.config.ts`: el armado, el manifest de la PWA, el registro del service worker y el archivo `/version.json` que se
  publica con cada despliegue.
- `.env.example`: las variables públicas. La copia real va en `frontend/.env`, que no se versiona
  ([docs/variables-de-entorno.md](../docs/variables-de-entorno.md)).
- `scripts/generate-icons.cjs`: herramienta vieja que genera dos íconos que hoy no se usan (ver
  [docs/estructura.md](../docs/estructura.md)).

## Cosas que conviene saber

- **La versión del sistema** se toma del `package.json` de la raíz, no del de esta carpeta: es la versión de todo SIGER4.
- **`vercel.json` está en la raíz** del repositorio: Vercel lo lee desde ahí. Define el armado (`npm run build`), la carpeta
  publicada (`frontend/dist`), que toda ruta abra la aplicación (`index.html`) y los encabezados de seguridad, incluida la
  política de contenido (CSP). Una dirección externa nueva que use la interfaz (imágenes, mapas, conexiones) tiene que
  agregarse a la CSP.
- **Nada de acá puede importar código de `backend/`** ni de `tests/`: `npm run security:check` lo controla.
- Las pruebas de pantalla están en `tests/frontend/ui/` (`npm run test:frontend`).
