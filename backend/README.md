# Backend

Todo lo que corre fuera del navegador: la base de datos (esquema, RLS, funciones y triggers), las Edge Functions y los scripts
de operación y auditoría. Es el único lugar del repositorio que trabaja con secretos.

```text
backend/
├── supabase/
│   ├── migrations/      122 migraciones (0001 a 0122), en orden
│   ├── functions/       Edge Functions (Deno) y _shared/
│   └── *.sql            scripts de operación (ver abajo)
└── scripts/
    ├── security-check.mjs    npm run security:check
    └── announce-release.mjs  npm run release:announce
```

## La CLI de Supabase se corre desde `backend/`

La CLI busca la carpeta `supabase/` desde donde se ejecuta hacia arriba. Desde `backend/` (o desde cualquier carpeta de
adentro) encuentra `backend/supabase/`; desde la raíz del repositorio hay que agregar `--workdir backend`. Desde la raíz y
sin `--workdir` no encuentra las funciones: un deploy así falla sin desplegar nada.

```powershell
cd backend
supabase functions deploy send-push
```

El proyecto vinculado (`supabase link`) queda en `backend/supabase/.temp/`, que Git ignora. El repositorio no tiene
`supabase/config.toml` y **no hay que crearlo**: cambiaría la verificación de JWT de las funciones, que hoy se controla al
desplegar con `--no-verify-jwt` (DEPLOYMENT.md, sección 51).

## Migraciones

Se corren **a mano en el SQL Editor de Supabase**, en orden numérico y una por ejecución, siguiendo la sección de
DEPLOYMENT.md de cada versión (algunas tienen que ir solas: 0009 antes que 0010 y 0121 antes que 0122, porque agregan valores a
un enum). Nunca se edita una migración ya aplicada: un cambio va siempre en una migración nueva, con el número siguiente.

Antes de correr una migración nueva en Supabase, `npm run test:db` (desde la raíz) la prueba sobre una base local armada
desde cero con todas las anteriores.

## Edge Functions

Cada una se despliega desde `backend/` con el comando que indica DEPLOYMENT.md:

| Función | Para qué | Despliegue |
|---|---|---|
| `admin-create-user` | Alta de usuarios (Informática y alta delegada por el coordinador de departamento) | `supabase functions deploy admin-create-user` |
| `admin-update-user` | Cambios de email, contraseña y estado de un usuario | `supabase functions deploy admin-update-user` |
| `admin-delete-user` | Borrado de usuarios | `supabase functions deploy admin-delete-user` |
| `send-push` | Push pedido por la aplicación | `supabase functions deploy send-push` |
| `send-push-system` | Push de las notificaciones que crea la base | `supabase functions deploy send-push-system --no-verify-jwt` |
| `purge-documents` | Borrado definitivo de la papelera de Documentos (30 días) | `supabase functions deploy purge-documents` |
| `announce-release` | Aviso de "Nueva actualización" (lo llama solo `release:announce`) | `supabase functions deploy announce-release --no-verify-jwt` |
| `analyze-report` | No se usa ni hace falta desplegarla (DEPLOYMENT.md, sección 1.7) | — |

`_shared/` es código que comparten las funciones (y el comando de publicación): un cambio ahí obliga a desplegar de nuevo cada
función que lo importa.

Secretos: `supabase secrets set NOMBRE=valor` (desde `backend/`), o en el panel, Edge Functions → Secrets. Qué secreto usa
cada función: [docs/variables-de-entorno.md](../docs/variables-de-entorno.md).

## Scripts SQL de operación

Se corren a mano en el SQL Editor, **leyéndolos enteros antes**:

| Archivo | Qué hace |
|---|---|
| `supabase/security_audit.sql` | Consultas de solo lectura para revisar RLS, permisos y funciones; dice qué resultado se espera en cada una |
| `supabase/create_admin_user_example.sql` | Ejemplo para crear el perfil y el rol del primer administrador |
| `supabase/seed_example.sql` | Datos de ejemplo para una demo (opcional) |
| `supabase/cleanup_test_data.sql` | Plantilla para borrar datos de prueba conservando lo real (hay que adaptarla) |
| `supabase/reset_functional_db.sql` | Borra todos los datos operativos y deja la Regional y el administrador |

## Scripts de Node

- `scripts/security-check.mjs` (`npm run security:check`): revisión de seguridad del repositorio. Con
  `npm run security:check -- --url https://<sitio>` revisa además los encabezados reales del sitio publicado.
- `scripts/announce-release.mjs` (`npm run release:announce`): anuncia una versión ya publicada (DEPLOYMENT.md, sección 75).
  Compara con la versión del `package.json` de la raíz.
