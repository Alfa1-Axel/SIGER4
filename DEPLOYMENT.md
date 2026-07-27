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
   - `supabase/migrations/0015_notifications_subsede_and_audit.sql`
   - `supabase/migrations/0016_attendance_intervention_audit.sql`
   - `supabase/migrations/0017_institutional_profiles_and_storage.sql`
   - `supabase/migrations/0018_super_admin_protection.sql`
   - `supabase/migrations/0019_documents_module.sql`
   - `supabase/migrations/0020_audit_logs_subsede_station_scope.sql`
   - `supabase/migrations/0021_personnel_module.sql`
   - `supabase/migrations/0022_intervention_summaries_operational_fields.sql`
3. (Opcional) Para tener datos de prueba en el dashboard, ejecutar también `supabase/seed_example.sql`
   (solo tiene sentido si ya cargaste cuarteles reales o vas a usar datos de ejemplo temporales).

**Nota:** si tu proyecto Supabase ya tenía el esquema aplicado desde antes (instalación previa),
solo necesitás correr las migraciones que todavía no ejecutaste, siempre respetando el orden
numérico. Si es un proyecto Supabase nuevo, `0001_schema.sql` y `0002_rls_helpers.sql` ya incluyen
la versión final del esquema (subsedes, roles simplificados, alcance de subsede, campos de
vehículos/cursos, contexto territorial de auditoría, notificaciones, perfil institucional, módulo
de documentos, personal/dotación por cuartel, campos operativos de intervenciones), pero igual
conviene correr las 22 migraciones en orden para mantener el historial consistente.

**Nota sobre 0022:** agrega columnas operativas a `intervention_summaries` para estadística real:
`time_of_day` (diurno/nocturno/mixto), `observations`, `personnel_count`, `vehicles_count` y
`work_hours`. Todas con default (`0` para los conteos/horas, `null` para franja horaria/
observaciones), así que los resúmenes ya cargados no se rompen — solo quedan con esos campos vacíos
hasta que se editen. Deliberadamente no se agrega nada que identifique víctimas, direcciones exactas
o personas involucradas: sigue siendo un resumen agregado por período/cuartel.

**Nota sobre 0021:** agrega el módulo de Personal/Dotación: tabla `personnel` (nombre, apellido, DNI
opcional, jerarquía, cargo/función, estado, departamento, fecha de ingreso, teléfono/email,
observaciones), RLS con el mismo patrón de alcance que `vehicles`, auditoría, y un trigger que
recalcula `stations.personnel_count` automáticamente a partir del personal en estado `activo` (deja
de ser un valor manual). Después de correr la migración, `personnel_count` va a quedar en `0` para
todos los cuarteles hasta que se cargue la dotación real desde la nueva sección "Personal /
Dotación" del detalle de cada cuartel — esto es esperado, el valor manual anterior no era
confiable (mismo criterio que se usó para `vehicles_count` en 0013).

**Nota sobre 0020:** agrega dos políticas de lectura a `audit_logs` para que usuarios con alcance de
subsede o de cuartel (no solo `informatica_r4` o roles regionales) puedan ver la actividad de su
propio alcance en la nueva pantalla `/auditoria`. No agrega columnas ni cambia la escritura de la
bitácora.

**Nota sobre 0019:** agrega el módulo de Documentos: columnas `description`/`subsede_id`/`profile_id`
en `documents`, la tabla `document_versions` (historial simple, se archiva la ruta anterior del
archivo cada vez que se reemplaza), políticas RLS actualizadas y el bucket de Storage `documents`
(a diferencia de `station-media`/`avatars`, este bucket se crea **privado** — `public: false` — así
que la descarga/visualización se hace siempre con una signed URL, nunca con una URL pública directa).
Después de correr la migración, confirmá en **Storage** que el bucket `documents` aparece listado y
marcado como **privado**.

**Nota sobre 0018:** hace que `informatica_r4` sea superadmin real: puede editar cualquier cosa,
incluido su propio rol/alcance/cuartel/región. Antes, la función `is_informatica_r4()` trataba a
`informatica_r4` e `integrante_informatica` como equivalentes, lo que permitía que un
`integrante_informatica` modificara o degradara el rol/alcance de un usuario `informatica_r4`, y que
ninguno de los dos pudiera cambiar su propio alcance ni siquiera cuando correspondía. Se agrega
`is_super_admin()` (true solo para `informatica_r4`) y dos triggers que bloquean cualquier
modificación de `user_roles`/`user_scopes` de un perfil `informatica_r4` —o el otorgamiento del rol
por primera vez— a menos que quien la haga sea también `informatica_r4`. No agrega columnas ni
requiere pasos manuales en el dashboard.

**Nota sobre 0015:** agrega `subsede_id` a `notifications` y el trigger de auditoría que esa tabla
no tenía. Corre como una sola query (no hay enum nuevo, a diferencia de 0009/0010).

**Nota sobre 0016:** agrega los triggers de auditoría que faltaban en `attendance_summaries` e
`intervention_summaries` (ninguna de las dos tenía). No agrega columnas ni cambia RLS — ambas
tablas ya tenían el esquema y las políticas completas desde antes.

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

### 1.7 Análisis IA de reportes (Edge Function)

El módulo de Reportes (`/reportes`) genera PDFs reales y, al final de cada uno, intenta agregar un
análisis institucional breve generado con IA (Gemini) a partir de los datos agregados del reporte.
Esto requiere desplegar la Edge Function `analyze-report` incluida en `supabase/functions/`. Si no
la desplegás, o no configurás la clave, **los reportes igual se generan sin romperse** — el bloque
de IA simplemente muestra un mensaje de "no disponible" en vez de un análisis.

1. Instalar el CLI de Supabase si no lo tenés: `npm install -g supabase` (o usar `npx supabase`).
2. Autenticarte y vincular el proyecto (una sola vez):
   ```
   supabase login
   supabase link --project-ref TU-PROJECT-REF
   ```
   (El `project-ref` es el ID que aparece en la URL del proyecto en el dashboard de Supabase.)
3. Conseguir una API key gratuita de Gemini en https://aistudio.google.com/app/apikey.
4. Configurar la clave como secreto de la función (nunca va en `.env` del frontend):
   ```
   supabase secrets set GEMINI_API_KEY=tu-clave-de-gemini
   ```
5. Desplegar la función:
   ```
   supabase functions deploy analyze-report
   ```
6. Verificar en el dashboard de Supabase, **Edge Functions → analyze-report**, que quedó desplegada
   y que el secreto `GEMINI_API_KEY` figura en **Edge Functions → Secrets**.

No hace falta ninguna variable nueva en `.env`/Vercel para esto — la función se invoca desde el
frontend con `supabase.functions.invoke('analyze-report', ...)`, usando las mismas
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` que ya tenés configuradas, y la función valida que
quien la llama sea un usuario autenticado real antes de consultar a Gemini.

Cada intento de análisis (exitoso o no disponible) queda registrado en `audit_logs` con la acción
`analisis_ia_reporte`.

**Modelo de Gemini usado:** `gemini-2.0-flash` (nivel gratuito, vigente). El modelo anterior,
`gemini-1.5-flash`, fue dado de baja por Google y devolvía error 404 en cada llamada — si el
análisis dejó de funcionar de un momento a otro sin cambios de tu parte, esa es la causa más común.
Si Google vuelve a cambiar los modelos disponibles, no hace falta re-desplegar la función: alcanza
con `supabase secrets set GEMINI_MODEL=nombre-del-modelo-vigente` (la función lee el nombre del
modelo desde ese secreto en cada llamada).

**Diagnóstico si el análisis sigue sin funcionar:** abrí la consola del navegador (F12) en
`/reportes` al generar un reporte. Si el análisis falla, el frontend loguea un
`[SIGER4] Análisis IA no disponible` con un `code` (`auth`, `config`, `payload`, `gemini_request`,
`gemini_response`) y un `detail` con el mensaje técnico exacto — nunca incluye la API key. `config`
casi siempre es API key inválida/sin permisos o nombre de modelo incorrecto; `auth` es un problema
de sesión del usuario, no de la IA en sí.

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

- **`stations.personnel_count`**: ✅ construido (migración 0021). Tabla `personnel` con alta/edición/
  baja desde la sección "Personal / Dotación" del detalle de cuartel, filtros por estado/jerarquía/
  departamento, y un trigger que recalcula `personnel_count` automáticamente a partir del personal
  en estado `activo` (mismo patrón que `vehicles_count`, ver 0013). El módulo mide capacidad
  institucional real, no es un padrón completo de RRHH — el DNI es opcional y no obligatorio.
- **`courses.enrolled_count`**: cantidad de inscriptos a un curso. No hay módulo de inscripciones
  (una persona anotándose a un curso) todavía. Distinto de `courses.attendees_count`, que sí es
  real y editable desde el formulario (asistencia registrada manualmente al finalizar la actividad).
- **`attendance_summaries`** e **`intervention_summaries`**: ✅ construidos (alta/edición de
  resúmenes por período y cuartel desde el detalle de cuartel, con auditoría). Modelan un
  **resumen agregado** por período (no asistencia individual por persona/día — eso requeriría un
  módulo de personal que no existe). Los KPIs "Asistencia promedio" e "Intervenciones (período)"
  del Dashboard ya muestran datos reales en cuanto se carga al menos un resumen.
- **Reportes PDF reales e IA institucional** (`ReportesPage.tsx`): la página solo registra la
  solicitud en `audit_logs`; no genera ningún archivo ni corre ningún análisis todavía. Queda para
  una fase posterior (edge function + servicio de IA institucional).
- **Notificaciones**: ✅ construido (campanita, lista, marcado de leída, alta manual desde
  `/notificaciones/nueva`, auditoría). Pendiente como mejora futura: creación automática desde
  otros flujos (ej. curso nuevo, cambio de estado) y una opción de "notificar a todos" sin scope
  (hoy no soportada por RLS — un registro sin alcance solo lo ve `informatica_r4`).
- **Documentos** (`documents` table): esquema, RLS y auditoría completos, pero no existe
  `src/lib/api/documents.ts` ni ninguna pantalla — falta construir el CRUD y la integración con
  Supabase Storage.

## 4. Notas de seguridad

- Nunca subir el archivo `.env` con claves reales al repositorio (ya está en `.gitignore`).
- La clave `anon` de Supabase es pública por diseño; la seguridad real la dan las políticas RLS,
  por eso es fundamental no desactivarlas ni usar la `service_role` key en el frontend.
- Antes de producción, revisar con el Dpto. de Informática y Estadística que las políticas de
  `audit_logs`, `documents` y `profiles` cumplan los requisitos de privacidad institucional.
