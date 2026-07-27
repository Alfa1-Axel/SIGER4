# SIGER4 — Guía de despliegue (Supabase + Vercel)

## 1. Supabase

### 1.1 Crear el proyecto
1. Entrar a https://supabase.com y crear una cuenta/organización si no existe.
2. "New project" → elegir organización, nombre (ej. `siger4-r4`), contraseña de base de datos
   (guardarla en un lugar seguro) y región más cercana (ej. `South America (São Paulo)`).
3. Esperar a que el proyecto termine de aprovisionarse (unos 2 minutos).

### 1.2 Cargar el esquema SQL
1. En el panel del proyecto, ir a **SQL Editor** → **New query**.
2. Pegar y ejecutar, **en este orden exacto**, el contenido de cada archivo (una migración por
   query, esperando a que cada una termine antes de pasar a la siguiente):
   - `supabase/migrations/0001_schema.sql`
   - `supabase/migrations/0002_rls_helpers.sql`
   - `supabase/migrations/0003_rls_policies.sql`
   - `supabase/migrations/0004_audit_triggers.sql`
   - `supabase/migrations/0005_user_invites.sql`
   - `supabase/migrations/0006_station_status_simplify.sql`
   - Antes de continuar, verificar en el SQL Editor: `select count(*) from stations;` → si da
     `0`, seguir sin problema (no hace falta backfill de `subsede_id`).
   - `supabase/migrations/0007_subsedes.sql`
   - `supabase/migrations/0008_role_key_simplify.sql`
   - `supabase/migrations/0009_scope_type_add_subsede.sql`
   - `supabase/migrations/0010_user_scopes_subsede.sql`
   - `supabase/migrations/0011_vehicles_fields.sql`
   - `supabase/migrations/0012_courses_fields.sql`
   - `supabase/migrations/0013_vehicles_count_sync.sql`
   - `supabase/migrations/0014_subsede_scope_gaps_and_audit_territory.sql`
3. (Opcional) Para tener datos de prueba en el dashboard, ejecutar también `supabase/seed_example.sql`
   (solo tiene sentido si ya cargaste cuarteles reales o vas a usar datos de ejemplo temporales).

**Nota:** si tu proyecto Supabase ya tenía el esquema aplicado desde antes (instalación previa),
solo necesitás correr las migraciones que todavía no ejecutaste, siempre respetando el orden
numérico. Si es un proyecto Supabase nuevo, `0001_schema.sql` y `0002_rls_helpers.sql` ya incluyen
la versión final del esquema (subsedes, roles simplificados, alcance de subsede, campos de
vehículos/cursos, contexto territorial de auditoría), pero igual conviene correr las 14
migraciones en orden para mantener el historial consistente.

**Nota sobre 0014:** agrega `region_id`/`subsede_id`/`station_id` a `audit_logs` y reescribe la
función de auditoría para resolver ese contexto por tabla. Los registros de auditoría **anteriores**
a esta migración quedan con esas 3 columnas en `null` (no se hace backfill histórico) — esto es
intencional, no un error; ver la sección de deuda técnica más abajo.

**Nota sobre 0009 y 0010:** deben ejecutarse como dos queries separadas (dos "Run" distintos). La
0009 agrega el valor `'subsede'` al enum `scope_type`; Postgres no permite usar un valor de enum
recién agregado dentro de la misma transacción que lo creó, por eso todo lo que depende de
`'subsede'` (columna, políticas, función helper) está en la 0010, no en la misma query.

### 1.3 Verificar que RLS esté activo
1. Ir a **Table Editor** → seleccionar cada tabla (stations, profiles, courses, etc.).
2. Confirmar que el ícono de "RLS" esté en verde/activado (las migraciones ya lo activan con
   `alter table ... enable row level security`, pero conviene verificarlo).
3. En **Authentication → Policies** se puede ver el listado completo de políticas creadas.

### 1.4 Obtener las variables de entorno
1. Ir a **Project Settings → API**.
2. `VITE_SUPABASE_URL` = el valor de "Project URL".
3. `VITE_SUPABASE_ANON_KEY` = el valor de "anon public" (¡no uses la "service_role"!).
4. Copiar `.env.example` a `.env` en el proyecto local y completar ambos valores para desarrollo.

### 1.5 Crear usuarios de prueba
1. Ir a **Authentication → Users → Add user** (o "Invite").
2. Crear un usuario con email y contraseña.
3. Ir al **SQL Editor** y crear su perfil y rol, por ejemplo:
   ```sql
   -- Reemplazar el uuid por el "User UID" que aparece en Authentication → Users
   insert into profiles (auth_user_id, full_name, email, region_id)
   values (
     'UUID-DEL-USUARIO-AUTH',
     'Nombre Apellido',
     'usuario@bomberos.gob.ar',
     (select id from regions where code = 'R4')
   );

   insert into user_roles (profile_id, role)
   values (
     (select id from profiles where email = 'usuario@bomberos.gob.ar'),
     'informatica_r4' -- o el rol que corresponda, ver src/types/roles.ts
   );
   ```
4. Para un usuario de cuartel, además asignar `station_id` en `profiles` y/o crear una fila en
   `user_scopes` con `scope_type = 'station'` y el `station_id` correspondiente.

### 1.6 Cargar datos iniciales reales
- La migración ya inserta la fila de `regions` para "Regional 4" (code `R4`).
- Cargar cuarteles reales desde **Table Editor → stations** o vía SQL Editor, usando el `region_id`
  de la Regional 4.
- Los cursos, vehículos, resúmenes de asistencia/intervenciones y notificaciones se cargan de la
  misma forma hasta que existan formularios de alta en la app (próxima fase).

## 2. Vercel

### 2.1 Importar el repositorio
1. Conectar tu cuenta de GitHub con Vercel (si no lo está) en https://vercel.com/new.
2. Seleccionar el repositorio de SIGER4 (ver sección "GitHub" más abajo si todavía no lo subiste).

### 2.2 Configuración del proyecto
- **Framework Preset**: Vite (Vercel lo detecta automáticamente).
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install` (por defecto)

### 2.3 Variables de entorno
En **Project Settings → Environment Variables**, agregar (en Production, Preview y Development):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### 2.4 Deploy
1. Hacer clic en "Deploy". Vercel construye el proyecto y publica una URL `https://<proyecto>.vercel.app`.
2. Cada nuevo push a la rama principal genera un nuevo deploy de producción automáticamente.

### 2.5 Verificar que la PWA funcione
1. Abrir la URL de producción en Chrome (desktop o mobile).
2. Verificar que aparezca el ícono de "Instalar app" en la barra de direcciones (desktop) o la
   opción "Agregar a pantalla de inicio" (mobile).
3. Instalar la app y confirmar que abre en modo standalone (sin la barra del navegador).
4. Desconectar la red y recargar: debería seguir funcionando con los datos cacheados y mostrar el
   aviso de "Sin conexión" en el header.
5. En DevTools → Application → Service Workers, confirmar que `sw.js` está activo.

## 3. Deuda técnica conocida (campos y módulos pendientes)

Estos campos y tablas existen en el esquema pero todavía no tienen un flujo real que los
alimente. No son bugs a corregir con un parche — quedan pendientes hasta que se construya el
módulo correspondiente:

- **`stations.personnel_count`**: columna de conteo de personal por cuartel. No hay módulo de
  personal/dotación (altas, bajas, roles internos) todavía, así que este número no refleja datos
  reales. Cuando se construya ese módulo, agregar un trigger de sincronización igual al que ya
  tiene `stations.vehicles_count` (ver `supabase/migrations/0013_vehicles_count_sync.sql` como
  referencia del patrón).
- **`courses.enrolled_count`**: cantidad de inscriptos a un curso. No hay módulo de inscripciones
  (una persona anotándose a un curso) todavía. Distinto de `courses.attendees_count`, que sí es
  real y editable desde el formulario (asistencia registrada manualmente al finalizar la actividad).
- **`attendance_summaries`** e **`intervention_summaries`**: ambas tablas tienen esquema y
  políticas RLS completas, pero no existe ningún archivo `src/lib/api/*.ts` ni pantalla que
  escriba filas en ellas. Los KPIs "Asistencia promedio" e "Intervenciones (período)" del
  Dashboard (`PanelPage.tsx`) consultan estas tablas de verdad, pero van a mostrar `—`/`0` hasta
  que existan los módulos reales de asistencia e intervenciones.
- **Reportes PDF reales e IA institucional** (`ReportesPage.tsx`): la página solo registra la
  solicitud en `audit_logs`; no genera ningún archivo ni corre ningún análisis todavía. Queda para
  una fase posterior (edge function + servicio de IA institucional).
- **Notificaciones** (`notifications` table + `src/lib/api/notifications.ts`): el esquema, RLS y
  las funciones de lectura ya existen, pero ninguna pantalla las consume todavía — el módulo de
  notificaciones (campanita, lista, marcado de leídas) queda pendiente de construir.
- **Documentos** (`documents` table): esquema, RLS y auditoría completos, pero no existe
  `src/lib/api/documents.ts` ni ninguna pantalla — falta construir el CRUD y la integración con
  Supabase Storage.

## 4. Notas de seguridad

- Nunca subir el archivo `.env` con claves reales al repositorio (ya está en `.gitignore`).
- La clave `anon` de Supabase es pública por diseño; la seguridad real la dan las políticas RLS,
  por eso es fundamental no desactivarlas ni usar la `service_role` key en el frontend.
- Antes de producción, revisar con el Dpto. de Informática y Estadística que las políticas de
  `audit_logs`, `documents` y `profiles` cumplan los requisitos de privacidad institucional.
