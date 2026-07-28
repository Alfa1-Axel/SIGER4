# SIGER4 — Guía de despliegue (Supabase + Vercel)

## 0. Checklist rápido antes de desplegar

Si ya tenés un proyecto de Supabase funcionando y solo querés confirmar que está todo al día antes
de un deploy a Vercel, revisá esto (el detalle de cada paso está en las secciones siguientes):

- [ ] **Migraciones**: las 23 migraciones de `supabase/migrations/` corridas en orden (`0001` a
      `0023`) en el SQL Editor del proyecto de Supabase real. Ver sección 1.2 para la lista exacta.
- [ ] **RLS activo**: todas las tablas con el ícono de RLS en verde en **Table Editor** (sección 1.3).
- [ ] **Variables de entorno del frontend**: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`
      configuradas en Vercel (Production, Preview y Development) — nunca la `service_role`.
- [ ] **Edge Function `analyze-report` desplegada** (opcional pero recomendado): sin esto, los
      reportes PDF se generan igual, solo sin análisis de IA. Ver sección 1.7.
      - [ ] Secreto `GEMINI_API_KEY` configurado.
      - [ ] `supabase functions deploy analyze-report` corrido después de cualquier cambio en
            `supabase/functions/analyze-report/index.ts`.
- [ ] **Buckets de Storage**: `station-media` y `avatars` (públicos), `documents` (privado) —
      se crean solos al correr las migraciones 0017/0019, pero conviene confirmar en **Storage**
      que existen y tienen la visibilidad correcta.
- [ ] **Al menos un usuario `informatica_r4` creado** (sección 1.5), para poder administrar el
      sistema apenas esté desplegado.
- [ ] **Build/lint/audit locales sin errores nuevos**: `npm run build`, `npm run lint`,
      `npm audit --audit-level=high` (la única advisory esperada es la de React Router en modo RSC,
      no aplicable a esta SPA — ver sección 4).
- [ ] **Vercel**: Build Command `npm run build`, Output Directory `dist`, Framework Preset Vite
      (sección 2.2).
- [ ] **PWA verificada** en la URL de producción real (sección 2.5) — el manifest/service worker
      usan rutas absolutas, así que solo se puede confirmar del todo en el dominio final, no en
      `localhost`.

### Antes de dar acceso a usuarios reales (no solo de prueba)

- [ ] **Datos de prueba limpiados** si corriste el sistema en modo de pruebas: ver sección 1.6bis
      y `supabase/cleanup_test_data.sql` (plantilla a revisar y customizar, no un script para
      correr a ciegas).
- [ ] **Sesión de pruebas funcionales conjunta** hecha al menos una vez sobre los flujos
      principales (login, alta de cuartel, carga de asistencia/intervención/personal, generación
      de un reporte PDF) — este proyecto la fue difiriendo módulo a módulo; antes de dar acceso a
      personal real es el momento de hacerla.
- [ ] **Roles y alcances reales asignados** a cada usuario invitado (no dejar cuentas con rol
      `informatica_r4` de más, ni usuarios sin alcance asignado).
- [ ] **Contraseña de base de datos y claves de Supabase/Gemini guardadas en un lugar seguro**
      (no en el repositorio, no en chats).

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
   - `supabase/migrations/0023_automatic_notifications.sql`
3. (Opcional) Para tener datos de prueba en el dashboard, ejecutar también `supabase/seed_example.sql`
   (solo tiene sentido si ya cargaste cuarteles reales o vas a usar datos de ejemplo temporales).

**Nota:** si tu proyecto Supabase ya tenía el esquema aplicado desde antes (instalación previa),
solo necesitás correr las migraciones que todavía no ejecutaste, siempre respetando el orden
numérico. Si es un proyecto Supabase nuevo, `0001_schema.sql` y `0002_rls_helpers.sql` ya incluyen
la versión final del esquema (subsedes, roles simplificados, alcance de subsede, campos de
vehículos/cursos, contexto territorial de auditoría, notificaciones, perfil institucional, módulo
de documentos, personal/dotación por cuartel, campos operativos de intervenciones, notificaciones
automáticas), pero igual conviene correr las 23 migraciones en orden para mantener el historial
consistente.

**Nota sobre 0023:** agrega notificaciones automáticas (además de las manuales existentes) para:
curso nuevo, documento nuevo, cambio de estado de cuartel/vehículo/personal, y carga de un resumen
de asistencia o de intervenciones. Se implementan como triggers (mismo patrón que la auditoría
automática), así que respetan el alcance del evento que las origina y quedan auditadas solas (la
tabla `notifications` ya tiene su propio trigger de auditoría desde 0004). También agrega una
política de RLS (`notifications_write_self`) que permite a cualquier usuario autenticado insertarse
una notificación a sí mismo — la necesita la confirmación de "reporte generado", que se inserta
desde el frontend porque no existe una tabla `reports` de la cual disparar un trigger.

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
- La migración ya inserta la fila de `regions` para "Regional 4" (code `R4`) y sus 3 subsedes base
  (Las Varillas, Luque, Río Primero).
- Cuarteles, vehículos, personal, cursos, asistencias, intervenciones, documentos y usuarios ya se
  cargan desde la propia app (cada módulo tiene su formulario de alta) — no hace falta cargarlos a
  mano por SQL Editor salvo que prefieras un alta masiva puntual.

### 1.6bis Limpiar datos de prueba antes de pasar a producción

Si cargaste datos de prueba mientras desarrollabas/probabas SIGER4 y ahora vas a empezar a usarlo
con cuarteles y personal reales, `supabase/cleanup_test_data.sql` es una plantilla de limpieza —
**no un script para correr a ciegas**. Instrucciones completas dentro del archivo; en resumen:

1. Abrí el archivo y reemplazá `'admin@tudominio.com'` por tu email real en los lugares indicados.
2. Corré primero la **Sección 0** (una serie de `select count(*)`) en el SQL Editor y confirmá que
   los números de "a borrar" tienen sentido — no debería aparecer nada que quieras conservar.
3. Si ya tenés cuarteles o usuarios reales que no son de prueba, agregalos a las exclusiones antes
   de seguir.
4. Recién ahí corré la **Sección 2** (el borrado), que ya viene envuelta en `begin;`/`commit;` para
   poder hacer `rollback;` si los números finales no cuadran.

El script conserva siempre: tu perfil/rol/alcance de administrador, la fila de `regions` con
code `R4`, y las 3 subsedes (`LV`, `LQ`, `RP`) — nunca toca estructura, RLS, ni migraciones. No
borra archivos de Storage (`station-media`, `avatars`, `documents`): esos se limpian a mano desde
el dashboard, ver la Sección 4 del script para el detalle.

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
5. Desplegar la función (correr esto de nuevo cada vez que cambie
   `supabase/functions/analyze-report/index.ts`):
   ```
   supabase functions deploy analyze-report
   ```
   Si no instalaste el CLI globalmente, usá `npx` en su lugar:
   ```
   npx supabase functions deploy analyze-report
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
`[SIGER4] Análisis IA no disponible` con un `code` (`auth`, `config`, `payload`, `quota`,
`gemini_request`, `gemini_response`), una `categoria` en texto plano explicando qué significa ese
código, el `modelo` usado, y un `detail` con el mensaje técnico exacto — nunca incluye la API key.
`config` casi siempre es API key inválida/sin permisos o nombre de modelo incorrecto; `auth` es un
problema de sesión del usuario, no de la IA en sí.

**Error 429 (`code: "quota"`) — límite de cuota/rate limit de Gemini:** significa que se agotó la
cuota gratuita de la API key configurada (o se superó el rate limit de requests por minuto), **no**
que algo esté roto en SIGER4. El PDF se sigue generando normalmente, solo sin el análisis de IA —
se muestra "IA no disponible por límite de cuota de Gemini. El reporte se generó correctamente sin
análisis automático." Esto **no se soluciona re-desplegando la función ni cambiando código**.
Opciones:
- Esperar a que se renueve la cuota (el nivel gratuito de Gemini se resetea periódicamente).
- Revisar los límites vigentes en https://ai.dev/rate-limit.
- Cambiar a otra API key/proyecto de Google AI Studio con cuota disponible
  (`supabase secrets set GEMINI_API_KEY=nueva-clave`, sin re-desplegar).
- Activar facturación (billing) en el proyecto de Google Cloud si corresponde, para subir de nivel
  de cuota.
- Reducir la cantidad de llamadas: SIGER4 ya cachea en el navegador (localStorage) los análisis
  exitosos por reporte + filtros + usuario + día, así que generar el mismo reporte varias veces el
  mismo día no vuelve a consultar a Gemini. Los payloads enviados también están recortados a
  resúmenes agregados (KPIs, rankings top/bottom, totales) en vez de mandar la tabla completa,
  para no gastar cuota de más en reportes con muchos registros.

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

### 2.6 Checklist post-deploy (probar en la URL real de Vercel, no en localhost)

Recorrido rápido para confirmar que el deploy quedó bien, antes de dar acceso a nadie más:

- [ ] **Abrir la URL de Vercel** (`https://<proyecto>.vercel.app` o tu dominio propio) y confirmar
      que carga el login sin errores en blanco.
- [ ] **Login con tu usuario `informatica_r4`**: entrar con email/contraseña reales y confirmar que
      redirige al Panel.
- [ ] **Navegación en PC**: confirmar que se ve el sidebar lateral fijo, sin bottom nav.
- [ ] **Navegación en mobile** (o DevTools → toggle device toolbar): confirmar que el sidebar
      desaparece y aparece el botón hamburguesa; que abre el drawer, que se cierra al elegir una
      opción, tocar afuera, o el botón "X".
- [ ] **Carga de un cuartel**: crear un cuartel de prueba (o editar uno existente), subir logo/
      portada, confirmar que el lightbox de imágenes abre al hacer click.
- [ ] **Reportes PDF**: generar al menos un reporte (ej. "Reporte de Vehículos") y confirmar que se
      descarga un PDF real, en horizontal, con logos institucionales y pie de página.
      - [ ] Si el bloque de IA del PDF dice "IA no disponible por límite de cuota de Gemini...",
            **eso es esperado si la cuota gratuita de Gemini está agotada** — no es un error del
            sistema, ver la nota sobre el error 429 en la sección 1.7. El PDF se generó igual.
- [ ] **Documentos**: subir un documento de prueba, confirmar que aparece en el listado y que se
      puede abrir/descargar (usa una signed URL del bucket privado `documents`).
- [ ] **Notificaciones**: confirmar que aparece al menos una notificación automática después de
      alguna de las acciones anteriores (ej. "Nuevo documento") en `/notificaciones`.
- [ ] **Auditoría**: entrar a `/auditoria` y confirmar que las acciones anteriores (alta de
      cuartel, de documento, etc.) aparecen en la bitácora con texto humanizado (no JSON crudo).
- [ ] **Consola del navegador sin errores críticos**: abrir DevTools → Console mientras se navega
      por las pantallas anteriores. Warnings de PWA/Workbox son normales; errores rojos de red
      (403/500) hacia Supabase no lo son.

## 3. Estado de los módulos y deuda técnica conocida

Resumen de qué está construido y qué queda pendiente, para no asumir por el nombre de una tabla o
columna que un módulo ya tiene flujo real detrás:

- **Cuarteles, subsedes, regiones**: ✅ completo (alta/edición, logo/portada con recorte y
  lightbox para ampliar, filtros, permisos por rol).
- **Usuarios, roles y alcances (scopes)**: ✅ completo (invitación por link, roles múltiples,
  alcances region/subsede/cuartel/escuela/sistema, protección de superadmin `informatica_r4`
  reflejada tanto en RLS como en la UI de `/usuarios/:id`).
- **Vehículos, Personal/Dotación, Asistencias, Intervenciones**: ✅ completo (alta/edición desde
  el detalle de cuartel, con permisos visuales por rol además de RLS). Intervenciones incluye
  franja horaria, personal/móviles involucrados y horas de trabajo (migración 0022) para poder
  cruzar carga operativa con dotación.
- **`courses.enrolled_count`**: cantidad de inscriptos a un curso. No hay módulo de inscripciones
  (una persona anotándose a un curso) todavía. Distinto de `courses.attendees_count`, que sí es
  real y editable desde el formulario (asistencia registrada manualmente al finalizar la actividad).
- **Documentos**: ✅ completo (alta/edición con alcance region/subsede/cuartel/usuario específico,
  historial de versiones, descarga vía signed URL desde el bucket privado `documents`).
- **Notificaciones**: ✅ completo, manuales y automáticas (migración 0023): curso nuevo, documento
  nuevo, cambio de estado de cuartel/vehículo/personal, carga de asistencia/intervención, y
  confirmación de reporte generado. Pendiente como mejora futura: una opción de "notificar a
  todos" sin alcance específico (hoy no soportada por RLS — un registro sin alcance solo lo ve
  `informatica_r4`).
- **Auditoría**: ✅ completo (`/auditoria`, filtros, detalle humanizado campo por campo en vez de
  JSON crudo, permisos por alcance).
- **Reportes PDF + análisis con IA**: ✅ completo (6 tipos de reporte, PDFs reales en horizontal,
  gráficos, análisis con Gemini con cache local y manejo claro de errores de cuota — ver sección
  1.7). Sigue dependiendo de la disponibilidad de cuota gratuita de Gemini.

## 4. Notas de seguridad

- Nunca subir el archivo `.env` con claves reales al repositorio (ya está en `.gitignore`).
- La clave `anon` de Supabase es pública por diseño; la seguridad real la dan las políticas RLS,
  por eso es fundamental no desactivarlas ni usar la `service_role` key en el frontend.
- **Vercel solo necesita 2 variables**: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Nunca
  configures ahí `GEMINI_API_KEY` ni `SUPABASE_SERVICE_ROLE_KEY` — el prefijo `VITE_` hace que
  Vite empaquete la variable en el bundle del navegador (público), así que cualquier variable sin
  ese prefijo no llega al frontend igual, pero por claridad y para evitar errores futuros, esas dos
  claves no deben existir en la configuración de Vercel bajo ningún nombre.
- `GEMINI_API_KEY` vive **solo** como secreto de la Edge Function `analyze-report` en Supabase
  (`supabase secrets set GEMINI_API_KEY=...`), nunca en Vercel ni en el repositorio.
- La Edge Function `analyze-report` exige un usuario autenticado real (valida el JWT recibido
  contra Supabase Auth) antes de llamar a Gemini — no es invocable de forma anónima.
- Antes de producción, revisar con el Dpto. de Informática y Estadística que las políticas de
  `audit_logs`, `documents` y `profiles` cumplan los requisitos de privacidad institucional.
