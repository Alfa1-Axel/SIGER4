# SIGER4 — Guía de despliegue (Supabase + Vercel)

## 0. Checklist rápido antes de desplegar

Si ya tenés un proyecto de Supabase funcionando y solo querés confirmar que está todo al día antes
de un deploy a Vercel, revisá esto (el detalle de cada paso está en las secciones siguientes):

- [ ] **Migraciones**: las 24 migraciones de `supabase/migrations/` corridas en orden (`0001` a
      `0024`) en el SQL Editor del proyecto de Supabase real. Ver sección 1.2 para la lista exacta.
- [ ] **RLS activo**: todas las tablas con el ícono de RLS en verde en **Table Editor** (sección 1.3).
- [ ] **Variables de entorno del frontend**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y
      `VITE_VAPID_PUBLIC_KEY` configuradas en Vercel (Production, Preview y Development) — nunca la
      `service_role` ni la clave privada VAPID.
- [ ] **Buckets de Storage**: `station-media` y `avatars` (públicos), `documents` (privado) —
      se crean solos al correr las migraciones 0017/0019, pero conviene confirmar en **Storage**
      que existen y tienen la visibilidad correcta.
- [ ] **Notificaciones push desplegadas** (opcional pero recomendado): claves VAPID generadas,
      `VAPID_PRIVATE_KEY`/`VAPID_PUBLIC_KEY` como secretos de la Edge Function `send-push`,
      `VITE_VAPID_PUBLIC_KEY` en el frontend, función desplegada. Ver sección 1.8. Sin esto, el
      sistema sigue funcionando igual con las notificaciones internas (`/notificaciones`).
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
- [ ] **Contraseña de base de datos y claves de Supabase guardadas en un lugar seguro**
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
   - `supabase/migrations/0024_push_subscriptions.sql`
3. (Opcional) Para tener datos de prueba en el dashboard, ejecutar también `supabase/seed_example.sql`
   (solo tiene sentido si ya cargaste cuarteles reales o vas a usar datos de ejemplo temporales).

**Nota:** si tu proyecto Supabase ya tenía el esquema aplicado desde antes (instalación previa),
solo necesitás correr las migraciones que todavía no ejecutaste, siempre respetando el orden
numérico. Si es un proyecto Supabase nuevo, `0001_schema.sql` y `0002_rls_helpers.sql` ya incluyen
la versión final del esquema (subsedes, roles simplificados, alcance de subsede, campos de
vehículos/cursos, contexto territorial de auditoría, notificaciones, perfil institucional, módulo
de documentos, personal/dotación por cuartel, campos operativos de intervenciones, notificaciones
automáticas, suscripciones push), pero igual conviene correr las 24 migraciones en orden para
mantener el historial consistente.

**Nota sobre 0024:** agrega la tabla `push_subscriptions` (suscripciones Web Push por perfil/
dispositivo, ver sección 1.8), su auditoría, y agrega `notifications` a la publicación
`supabase_realtime` (necesario para que el frontend detecte en vivo las notificaciones que crean los
triggers automáticos de 0023 y dispare el push correspondiente). Si tu proyecto ya tenía
`notifications` agregada a esa publicación por otro motivo, el `alter publication ... add table`
va a fallar con "already member of publication" — en ese caso simplemente saltear esa línea y
correr el resto de la migración.

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

### 1.7 Análisis con IA (fase futura, no activa)

El módulo de Reportes (`/reportes`) genera los PDFs de forma 100% local (KPIs, tablas, gráficos y
resumen ejecutivo), sin ninguna llamada a servicios de IA. La integración con Gemini que existía
antes se desactivó por falta de cuota/presupuesto (la API devolvía error 429 de forma recurrente) y
el frontend ya no la invoca ni depende de ella.

La Edge Function `supabase/functions/analyze-report/index.ts` sigue en el repositorio pero
**no se usa ni hace falta desplegarla**. Queda como base para una posible fase futura si en algún
momento se dispone de presupuesto para una cuota de IA estable.

### 1.8 Notificaciones push (Web Push API)

Además de las notificaciones internas (`/notificaciones`, siempre activas), SIGER4 puede enviar
notificaciones push reales del sistema operativo/navegador. Es opcional: si no se configura, el
sistema sigue funcionando exactamente igual, solo sin push.

**Arquitectura:** el frontend dispara el push inmediatamente después de que se crea una fila nueva
en `notifications` — ya sea porque el propio frontend la creó (formulario manual de
`/notificaciones/nueva`, confirmación de "reporte generado") o porque la creó un trigger automático
de Postgres (curso nuevo, documento nuevo, cambio de estado, carga de asistencia/intervención — ver
migración 0023). Para detectar estas últimas sin que el frontend tenga que estar en la pantalla que
las originó, `src/components/NotificationPushBridge.tsx` mantiene una suscripción Realtime a
inserts en `notifications` durante toda la sesión (montada una sola vez en `App.tsx`), respetando
el mismo alcance que ya define RLS para esa tabla. No se usa un trigger de Postgres llamando a la
Edge Function directamente (pg_net): la lógica de decisión y reintento queda del lado del cliente,
que ya sabe mostrar la notificación en pantalla.

**Piezas:**
- `supabase/migrations/0024_push_subscriptions.sql`: tabla `push_subscriptions` (endpoint, claves
  del navegador, perfil dueño), RLS (cada usuario solo ve/crea/borra sus propias suscripciones), y
  agrega `notifications` a la publicación `supabase_realtime`.
- `src/sw.ts`: service worker custom (ver nota de `injectManifest` más abajo) con los listeners
  `push` (muestra la notificación del sistema) y `notificationclick` (enfoca/abre la app en la URL
  indicada por el payload).
- `src/hooks/usePushNotifications.ts`: pide permiso, suscribe el navegador (`pushManager.subscribe`)
  y guarda la suscripción en Supabase. Si el navegador no soporta push, o el usuario no acepta el
  permiso, el hook expone ese estado sin romper nada más.
- `src/pages/AjustesPage.tsx` ("Mi Perfil"): botón para activar/desactivar notificaciones push.
- `supabase/functions/send-push/index.ts`: Edge Function que recibe `{title, body, url, tag,
  profileId|regionId|subsedeId|stationId}`, resuelve las suscripciones del alcance indicado, y
  envía el push real con la librería `web-push` usando las claves VAPID. Limpia automáticamente las
  suscripciones que el navegador ya invalidó (404/410).
- `src/components/NotificationPushBridge.tsx`: dispara `send-push` para cada notificación nueva, y
  reproduce un sonido corto (Web Audio API) si la app está abierta — nunca es la única alerta, el
  push del sistema operativo funciona igual si la app está cerrada.

**Nota sobre injectManifest:** el service worker pasó de `generateSW` (autogenerado por
`vite-plugin-pwa`, sin forma de agregar listeners propios) a `strategies: 'injectManifest'`, con el
código fuente en `src/sw.ts`. Esto es necesario para poder escuchar `push`/`notificationclick`; el
precache y el runtime caching (Supabase/imágenes) que antes vivían en la config de `vite.config.ts`
ahora viven como código explícito dentro de `sw.ts`, con el mismo comportamiento de antes.

**Generar las claves VAPID** (una sola vez, se reutilizan siempre):
```
npx web-push generate-vapid-keys
```
Esto imprime un par de claves pública/privada. Guardalas: la privada no se puede recuperar después.

**Configurar:**
1. Clave pública, en el frontend (`.env`/Vercel), variable `VITE_VAPID_PUBLIC_KEY` — es pública por
   diseño, viaja al navegador en `pushManager.subscribe()`.
2. Claves como secretos de la Edge Function (nunca en el frontend ni en el repositorio):
   ```
   supabase secrets set VAPID_PUBLIC_KEY=tu-clave-publica
   supabase secrets set VAPID_PRIVATE_KEY=tu-clave-privada
   supabase secrets set VAPID_SUBJECT=mailto:informatica@r4bomberos.org.ar
   ```
   (`VAPID_SUBJECT` es un contacto de referencia exigido por el estándar Web Push, no una clave
   secreta — se puede omitir, hay un valor por defecto en el código.)
3. Desplegar la función:
   ```
   supabase functions deploy send-push
   ```

**Seguridad:** la clave privada VAPID vive únicamente como secreto de `send-push`. El payload push
nunca incluye datos sensibles (solo título, cuerpo genérico y una URL de destino). `send-push`
exige un usuario autenticado real (igual que `analyze-report`) y usa la `service_role` key
internamente solo para resolver qué perfiles están dentro del alcance recibido — nunca la expone al
cliente. Las políticas RLS de `push_subscriptions` y `notifications` no cambian: cada usuario sigue
viendo y recibiendo solo lo que ya podía ver antes.

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
- `VITE_VAPID_PUBLIC_KEY` (opcional — solo si activaste notificaciones push, ver sección 1.8)

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
      descarga un PDF real, en horizontal, con logos institucionales, KPIs, tablas, gráficos,
      resumen ejecutivo local y pie de página.
- [ ] **Documentos**: subir un documento de prueba, confirmar que aparece en el listado y que se
      puede abrir/descargar (usa una signed URL del bucket privado `documents`).
- [ ] **Notificaciones**: confirmar que aparece al menos una notificación automática después de
      alguna de las acciones anteriores (ej. "Nuevo documento") en `/notificaciones`.
- [ ] **Notificaciones push** (si configuraste las claves VAPID, sección 1.8): entrar a
      "Mi Perfil" (`/ajustes`), activar las notificaciones push, aceptar el permiso del navegador,
      y confirmar que se guardó una fila en `push_subscriptions`. Generar una notificación (manual
      o automática) y confirmar que llega el push del sistema aunque la pestaña esté en segundo
      plano o cerrada.
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
- **Usuarios, roles y alcances (scopes)**: ✅ completo (alta directa por Informática R4 vía Edge
  Function `admin-create-user` — ver sección 5.3 —, roles múltiples, alcances
  region/subsede/cuartel/escuela/sistema, protección de superadmin `informatica_r4` reflejada tanto
  en RLS como en la UI de `/usuarios/:id`).
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
- **Notificaciones push**: ✅ completo pero opcional (migración 0024, Edge Function `send-push`,
  ver sección 1.8). Sin configurar las claves VAPID, el sistema sigue funcionando igual con las
  notificaciones internas.
- **Auditoría**: ✅ completo (`/auditoria`, filtros, detalle humanizado campo por campo en vez de
  JSON crudo, permisos por alcance).
- **Reportes PDF**: ✅ completo (6 tipos de reporte, PDFs reales en horizontal, logos, KPIs, tablas,
  gráficos y resumen ejecutivo generado localmente, sin dependencias externas). El análisis con IA
  no está activo — ver sección 1.7.
- **Inventario Regional**: ✅ completo para la fase actual (alta/edición por roles regionales,
  visible para todo usuario autenticado, historial de ubicación/responsable/estado). Solicitudes de
  préstamo/aprobación/devolución quedan para una fase futura — ver sección 6.5.
- **Departamentos Regionales**: ✅ base completa (alta por Informática R4, edición por el
  coordinador o Informática R4, miembros con su cuartel resuelto desde `profiles.station_id`,
  activo/inactivo). Informes/estadísticas quedan para una fase futura — ver sección 6.5.

## 4. Notas de seguridad

- Nunca subir el archivo `.env` con claves reales al repositorio (ya está en `.gitignore`).
- La clave `anon` de Supabase es pública por diseño; la seguridad real la dan las políticas RLS,
  por eso es fundamental no desactivarlas ni usar la `service_role` key en el frontend.
- **Vercel solo necesita 2 variables**: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Nunca
  configures ahí `SUPABASE_SERVICE_ROLE_KEY` — el prefijo `VITE_` hace que Vite empaquete la
  variable en el bundle del navegador (público), así que cualquier variable sin ese prefijo no
  llega al frontend igual, pero por claridad y para evitar errores futuros, esa clave no debe
  existir en la configuración de Vercel bajo ningún nombre.
- Antes de producción, revisar con el Dpto. de Informática y Estadística que las políticas de
  `audit_logs`, `documents` y `profiles` cumplan los requisitos de privacidad institucional.

## 5. Endurecimiento de seguridad (2026-07) — migraciones 0025 a 0033

Tanda de hardening post-lanzamiento: corrige riesgos de seguridad/producción sin agregar módulos
nuevos. Ver el resumen de riesgos corregidos/documentados en el mensaje de la sesión que la generó;
esta sección deja el checklist operativo para aplicarla.

### 5.1 Migraciones nuevas a correr (en orden, después de 0024)

- `0025_push_authorization_and_dedup.sql` — autorización server-side de `send-push`, tabla
  `push_send_log`, rate limit.
- `0026_enforce_is_active.sql` — `is_active=false` bloquea acceso real (antes solo visual).
- `0027_rls_territorial_write_scope.sql` — escritura de roles regionales acotada a su propia
  región.
- `0028_profile_self_edit_lockdown_and_email.sql` — auto-edición de perfil restringida a
  `full_name/phone/position/avatar_url`; email normalizado + único.
- `0029_retire_self_signup_invite_flow.sql` — retira el auto-registro (`link_invited_profile`).
  **Requiere desplegar la Edge Function `admin-create-user` (ver 5.2) antes o inmediatamente
  después** — sin ella no hay forma de dar de alta usuarios nuevos.
- `0030_audit_logs_controlled_insert.sql` — reemplaza el insert libre en `audit_logs` por la RPC
  `record_manual_audit_event`.
- `0031_security_definer_execute_grants.sql` — cierra EXECUTE público en funciones
  `SECURITY DEFINER`.
- `0032_data_consistency_constraints.sql` — constraints territoriales y de negocio. **Antes de
  correrla en un proyecto con datos reales**, revisar si `documents`/`notifications`/`user_scopes`
  tienen filas con alcance ambiguo o vacío (la migración intenta resolverlas automáticamente, pero
  puede fallar visiblemente en `documents_single_scope` si hay documentos históricos sin ningún
  alcance ni `uploaded_by_profile_id`; en ese caso, resolver esas filas a mano antes de reintentar).
- `0033_storage_hardening.sql` — límites de tamaño/MIME en los buckets, RPC
  `cleanup_pending_documents`.

### 5.2 Edge Functions a (re)desplegar

```
supabase functions deploy send-push
supabase functions deploy admin-create-user
```

`admin-create-user` es una función nueva: no necesita secretos adicionales a los que ya usa
`send-push` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, ya configurados como
secretos del proyecto). No requiere ninguna variable nueva en Vercel.

### 5.3 Cambio de flujo: alta de usuarios

El auto-registro (`/registro`) fue retirado por seguridad (riesgo de account takeover: un atacante
podía registrarse con el email de un futuro invitado antes que la persona real). Ahora todo alta de
usuario se hace desde `/usuarios/nuevo`, que genera una contraseña temporal y crea la cuenta ya
activa. **Comunicar este cambio de flujo al Dpto. de Informática antes del deploy** si ya venían
usando enlaces de invitación con usuarios reales: cualquier perfil con `auth_user_id` null que quede
de ese flujo anterior requiere resolución manual (ver comentario en
`0029_retire_self_signup_invite_flow.sql`).

**Matriz de permisos (revisión 2026-08)** — quién puede crear usuarios y con qué roles/alcance.
Validado server-side en la Edge Function `admin-create-user` (única fuente de verdad real); la UI
(`UsuarioFormPage`, `UserCreatorRoute`, `navigation.ts`) solo oculta opciones que el backend igual
rechazaría:

| Creador | Roles asignables | Alcance |
|---|---|---|
| `informatica_r4` / `integrante_informatica` | Cualquiera | Cualquiera |
| `director_escuela` | Cualquiera excepto `informatica_r4`/`integrante_informatica` | Cualquiera |
| `jefe_cuerpo_activo` | `presidente_cuartel`, `usuario_carga_cuartel`, `secretario_comision`, `administrativo`, `invitado` (nunca `jefe_cuerpo_activo` ni roles regionales/escuela/informática) | Solo su propio cuartel |

`/usuarios` (listado) y `/usuarios/:id` (edición completa de un usuario existente, incluye cambiar
roles/scope de cualquiera) siguen exclusivos de `informatica_r4`/`integrante_informatica` — crear un
usuario acotado es una capacidad distinta de administrar cualquier usuario del sistema.

### 5.4 Checklist de configuración viva (no se puede confirmar solo desde el repo)

**Supabase → Authentication → Providers → Email:**
- [ ] "Confirm email" — revisar si conviene activarlo (con el flujo de alta por admin ya no es
      estrictamente necesario para evitar el account-takeover que motivó 0029, pero sigue siendo
      buena práctica general).
- [ ] Política de contraseña (longitud mínima, complejidad) acorde a la institución.
- [ ] Rate limits de Auth (intentos de login, recuperación de contraseña) — valores por defecto de
      Supabase suelen ser razonables, pero confirmar que no quedaron deshabilitados.
- [ ] CAPTCHA en login/signup si el proyecto lo soporta y el volumen de usuarios lo justifica.
- [ ] MFA — evaluar si corresponde exigirlo para roles administrativos (`informatica_r4`).

**Supabase → Database:**
- [ ] Backups automáticos activos (Point-in-Time Recovery si el plan lo incluye).
- [ ] Confirmar que las 9 migraciones nuevas (0025-0033) corrieron sin error, en orden.
- [ ] `select * from pg_policies where schemaname='public';` — confirmar que las policies
      reemplazadas (`stations_write_admin_regional`, `attendance_write_*`,
      `interventions_write_*`, `vehicles_write_*`, `personnel_write_*`, `documents_write_*`,
      `document_versions_write_*`, `profiles_update_self`, `audit_logs_insert_authenticated` ya no
      debería existir) quedaron con la definición nueva.

**Supabase → Storage:**
- [ ] Confirmar `file_size_limit`/`allowed_mime_types` aplicados en `station-media`, `avatars`,
      `documents` (los aplica 0033, pero verificar en el dashboard tras correrla).
- [ ] Confirmar que `documents` sigue como bucket privado (`public = false`).

**Supabase → Edge Functions → Logs:**
- [ ] Revisar logs de `send-push` tras el primer despliegue: confirmar que las respuestas 403
      (alcance no autorizado) y `duplicate:true` (deduplicación) aparecen como se espera y no hay
      errores inesperados de la RPC `can_send_push_scope`/`push_send_rate_check`.

**Vercel:**
- [ ] Confirmar que el header `Content-Security-Policy` de `vercel.json` no rompe ninguna pantalla
      real (abrir la app en producción y revisar la consola del navegador por errores de CSP —
      especialmente si se agrega algún dominio externo nuevo en el futuro, hay que sumarlo a
      `connect-src`/`img-src`/`font-src`).
- [ ] Deploy previews: confirmar que no quedan expuestos con datos de producción reales si se usan
      para pruebas (las previews comparten el mismo proyecto Supabase salvo que se configure uno
      de staging aparte).
- [ ] Protección de producción (Vercel "Deployment Protection") si corresponde restringir quién
      puede ver deploys no productivos.

### 5.5 Pendiente para Fase 2 (documentado, no implementado en esta tanda)

- **Self-host de Google Fonts**: `src/styles.css` sigue cargando Inter/JetBrains Mono desde
  `fonts.googleapis.com` (`@import`). La CSP nueva lo permite explícitamente
  (`style-src`/`font-src` incluyen los dominios de Google Fonts), pero para offline-first real y
  para no depender de un tercero, conviene descargar los `.woff2` y sumarlos a `/public/fonts`.
  No se hizo en esta tanda porque requiere descargar archivos binarios de fuente.
- **Optimistic locking (`updated_at`/version) en formularios de edición**: no se implementó (ver
  decisión tomada durante esta tanda). Las tablas con mayor riesgo de "pisada" por edición
  concurrente son `profiles` (roles/scope), `documents` (alcance) y `stations`. Implementación
  sugerida: cada formulario de edición guarda el `updated_at` que tenía la fila al abrir el form: al
  guardar, el `update()` incluye `.eq('updated_at', valorOriginal)` — si la fila ya cambió, el
  update afecta 0 filas y el frontend puede detectarlo y mostrar "este registro fue modificado por
  otro usuario, recargá para ver los cambios".
- **Perfiles huérfanos del flujo de auto-registro retirado**: si el proyecto ya tenía perfiles con
  `auth_user_id is null` (invitaciones pendientes del flujo viejo), no se resuelven automáticamente
  — requieren decisión manual (crear la cuenta con `admin-create-user` y fusionar, o borrar el
  perfil si ya no corresponde).

## 6. Tanda funcional (2026-08) — migraciones 0034 a 0043

### 6.1 Migraciones nuevas a correr (en orden, después de 0033)

- `0034_must_change_password.sql` — `profiles.must_change_password`; fuerza cambio de contraseña
  en el primer ingreso cuando la cuenta la creó un admin con contraseña propia.
- `0035_notification_types_test_and_reminder.sql` — nuevos valores de `notification_type`:
  `prueba`, `recordatorio_semanal`.
- `0036_weekly_reminder_cron.sql` — **requiere pg_cron y pg_net habilitados antes de correrla**
  (ver 6.3). `profiles.weekly_reminder_enabled`, función `send_weekly_reminder()`, job de pg_cron
  `siger4-weekly-reminder`.
- `0037_vehicle_status_new_values.sql` — nuevos valores de `vehicle_status`: `vendido`,
  `transferido`, `baja`.
- `0038_vehicle_lifecycle_history.sql` — historial de vehículos, RPC `change_vehicle_status`,
  `vehicles_count` deja de contar vehículos dados de baja de flota.
- `0039_personnel_status_new_values.sql` — nuevos valores de `personnel_status`: `renuncia`, `pase`.
- `0040_personnel_status_history.sql` — historial de personal, RPC `change_personnel_status`.
- `0041_inventory_module.sql` — módulo Inventario Regional completo (tablas, RLS, historial,
  auditoría).
- `0042_departments_module.sql` — módulo Departamentos Regionales base (tablas, RLS, auditoría).
- `0043_remove_administrativo_role_ui.sql` — sin cambios de schema (documentación); el rol
  `administrativo` se retiró de la UI/matriz de permisos pero sigue existiendo en el enum
  `role_key` de Postgres (no se puede borrar un valor de enum sin recrear el tipo completo).

**Importante sobre los pares de migraciones "_new_values" + funcionalidad**: Postgres no permite
usar un valor de enum recién agregado (`ALTER TYPE ... ADD VALUE`) dentro de la misma transacción
en la que se agregó. Por eso `0035`/`0037`/`0039` están separadas de las migraciones que
efectivamente usan esos valores nuevos — correlas en el orden numérico exacto, cada una como su
propia query en el SQL Editor (como ya indica la sección 1.2), nunca todas pegadas en un mismo
bloque de ejecución.

### 6.2 Edge Functions a (re)desplegar

```
supabase functions deploy admin-create-user
supabase functions deploy send-push-system
```

`send-push-system` es una función nueva (recordatorio semanal, ver 6.3): requiere el secreto
`CRON_SHARED_SECRET` (además de `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`/`VAPID_PUBLIC_KEY`/
`VAPID_PRIVATE_KEY`, ya configurados). Generarlo vos mismo (cualquier string largo y aleatorio) y
configurarlo:

```
supabase secrets set CRON_SHARED_SECRET=<un-valor-aleatorio-largo>
```

`admin-create-user` no necesita secretos nuevos, pero cambió su lógica (ahora crea roles/scope en
el mismo paso) — redesplegar igual.

### 6.3 Configurar el recordatorio semanal (pg_cron + pg_net)

Estos pasos son **obligatorios antes de correr `0036_weekly_reminder_cron.sql`** — si la migración
corre sin esto, falla al crear el job de cron.

**Paso 1 — Habilitar las extensiones (Supabase Dashboard → Database → Extensions):**
1. Buscar `pg_cron` → Enable.
2. Buscar `pg_net` → Enable.

**Paso 2 — Configurar la URL del proyecto y el secreto compartido (SQL Editor, antes de 0036):**

```sql
alter database postgres set siger4.project_url = 'https://<tu-proyecto>.supabase.co';
alter database postgres set siger4.cron_shared_secret = '<el-mismo-valor-que-CRON_SHARED_SECRET>';
```

Reemplazar `<tu-proyecto>` por el subdominio real de tu proyecto Supabase (Project Settings → API →
Project URL), y `<el-mismo-valor-que-CRON_SHARED_SECRET>` por el mismo string que configuraste como
secreto de `send-push-system` en el paso 6.2. **Deben ser exactamente el mismo valor** — si no
coinciden, `send-push-system` responde 401 y el recordatorio se crea como notificación interna pero
nunca llega como push.

**Paso 3 — Correr `0036_weekly_reminder_cron.sql`** (después de los pasos 1 y 2).

**Paso 4 — Verificar que quedó funcionando:**

```sql
-- Confirmar que el job existe y está activo:
select * from cron.job where jobname = 'siger4-weekly-reminder';

-- Ver el historial de ejecuciones (después del primer lunes 12:00 ART / 15:00 UTC):
select * from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'siger4-weekly-reminder')
order by start_time desc limit 5;

-- Probar manualmente sin esperar al lunes (dispara para todos los usuarios
-- activos con el recordatorio habilitado — usar con cuidado en producción,
-- genera una notificación real para cada uno):
select send_weekly_reminder();
```

Si `send_weekly_reminder()` no encuentra `siger4.project_url`/`siger4.cron_shared_secret`
configurados, inserta las notificaciones igual pero loguea un `WARNING` (visible en Database → Logs)
y no intenta el push — revisar ese warning si el push nunca llega pero la notificación interna sí
aparece en `/notificaciones`.

**Horario**: el job corre `0 15 * * 1` (lunes 15:00 UTC). Argentina es UTC-3 todo el año desde 2009
(sin horario de verano), así que esto es siempre lunes 12:00 hora Argentina — no hace falta ajustar
el cron dos veces al año.

### 6.4 Cambios de flujo para comunicar a los usuarios

- **Alta de usuarios**: ahora el admin/coordinador define (o genera) la contraseña temporal, con
  confirmación. El nuevo usuario ve una pantalla de cambio de contraseña obligatorio en su primer
  ingreso — no puede usar el resto de la app hasta cambiarla.
- **Vehículos y personal**: pasar a un estado de "baja de flota" (vehículos: vendido/transferido/
  baja; personal: renuncia/baja/pase/reserva) ahora exige un motivo obligatorio y se hace desde un
  botón/selector específico en el detalle del cuartel, no desde el formulario de edición normal.
- **Rol "Administrativo"**: ya no aparece como opción al crear o editar roles de un usuario. Si
  algún perfil real ya lo tenía asignado, sigue funcionando igual (no se le quitó el rol), pero no
  se puede volver a asignar a nadie más desde la UI.

### 6.5 Pendiente para Fase 2 (documentado, no implementado en esta tanda)

- **Solicitudes de préstamo del Inventario Regional**: el módulo solo registra qué existe, dónde
  está y quién es responsable. Solicitud, aprobación y devolución quedan para una fase futura,
  según lo pedido explícitamente.
- **Informes y estadísticas de Departamentos Regionales**: el módulo base (departamento,
  coordinador, miembros, contacto, activo/inactivo) está completo; informes/estadísticas de
  actividad por departamento quedan para una fase futura.
- **Rol "Administrativo" en el enum de Postgres**: sigue existiendo (no se puede quitar sin recrear
  el tipo `role_key` completo). Si en el futuro se decide migrarlo de verdad, primero hay que
  identificar qué perfiles reales lo tienen asignado (query de referencia en
  `0043_remove_administrativo_role_ui.sql`) y decidir a qué rol migrarlos.

## 7. Corrección crítica + superadmin real + carpetas (2026-08) — migraciones 0044 a 0046

### 7.1 Causa exacta del error "Edge Function returned a non-2xx status code" al crear usuario

`protect_super_admin_roles_scopes()` (trigger compartido entre `user_roles` y `user_scopes`, desde
`0018`) tenía esta condición:

```sql
if tg_table_name = 'user_roles' and tg_op <> 'DELETE' and new.role = 'informatica_r4' then
```

Esa línea es **una sola expresión SQL**. PL/pgSQL no evalúa `and` de a un operando con corto-circuito
antes de resolver columnas: analiza la expresión completa una vez, resolviendo **todas** las
referencias a columnas (incluida `new.role`) antes de evaluar ningún operador booleano. Cuando el
trigger disparaba para `user_scopes` (tabla sin columna `role`), esa resolución fallaba con
`record "new" has no field "role"` — rompiendo **cualquier** insert en `user_scopes`, incluido el de
`admin-create-user` al dar de alta un usuario (que inserta `profiles` → `user_roles` → `user_scopes`
en secuencia). El insert en `user_scopes` fallaba con 500, y la Edge Function lo devolvía como
"non-2xx status code" al frontend.

**Corregido en `0046_fix_protect_super_admin_scopes_bug.sql`**: la condición que usa `new.role` se
movió a un `if` anidado dentro de `if tg_table_name = 'user_roles' then` — PL/pgSQL compila cada
expresión de forma perezosa, solo cuando la ejecución realmente llega a esa sentencia, así que la
expresión con `new.role` nunca se prepara cuando el trigger corre sobre `user_scopes`. La protección
en sí (nadie salvo `informatica_r4` puede tocar roles/scopes de otro `informatica_r4`) queda
exactamente igual.

**Corrí esta migración y probá crear un usuario completo (Auth + profile + rol + scope) antes de
seguir usando el sistema.**

### 7.2 Migraciones nuevas a correr (en orden, después de 0043)

- `0044_admin_update_user_audit.sql` — amplía el allowlist de `record_manual_audit_event()` para
  permitir auditar cambios de Auth (email/contraseña/ban) que `admin-update-user` aplica y que no
  dejan rastro en ninguna tabla de Postgres.
- `0045_document_folders.sql` — módulo de carpetas para documentos (`document_folders`,
  `documents.folder_id`, RLS, auditoría).
- `0046_fix_protect_super_admin_scopes_bug.sql` — **la corrección crítica de 7.1. Prioridad alta.**

### 7.3 Edge Functions nuevas o modificadas

```
supabase functions deploy admin-create-user
supabase functions deploy admin-update-user
```

- `admin-create-user`: sin cambios de lógica, pero ahora loguea el detalle real de cualquier error
  (Supabase Dashboard → Edge Functions → admin-create-user → Logs) y envuelve todo el handler en
  try/catch, para que un error no anticipado nunca se pierda como un 500 sin información. **Redeploy
  recomendado** aunque el bug real estaba en la base, no en esta función.
- `admin-update-user` (nueva): le da a `informatica_r4`/`integrante_informatica` control real sobre
  cualquier usuario — cambiar email, resetear contraseña, activar/desactivar (con ban real en Auth,
  no solo `profiles.is_active`), resetear el flag de cambio de contraseña obligatorio, y reemplazo
  completo de roles/scope en el mismo pedido. Respeta la protección de superadmin: solo
  `informatica_r4` puede tocar a otro `informatica_r4` o asignarle ese rol.

### 7.4 Aclaración sobre "superadmin real"

La mayoría del control de `informatica_r4` sobre otros usuarios **ya funcionaba** antes de esta
tanda, vía RLS directo (`profiles_write_admin`, `guard_profile_self_edit_columns` exime a
`is_super_admin()`, `protect_super_admin_roles_scopes` ya permitía a un `informatica_r4` modificar a
otro): nombre, rango, cuartel/región, roles, scope, activar/desactivar `profiles.is_active`. Lo que
genuinamente faltaba (y ahora cubre `admin-update-user`) es lo que vive en Supabase Auth y no en
Postgres: cambiar el email de la cuenta, cambiar la contraseña de otro usuario, y banear la cuenta
de verdad (antes, desactivar solo tocaba `profiles.is_active`, pero la sesión de Auth seguía siendo
válida).

### 7.5 Carpetas de documentos

Nuevo módulo de carpetas (`document_folders`) con el mismo criterio de permisos que ya usaba la
carga de documentos: `informatica_r4` cualquier alcance; roles regionales
(`secretario_regional`/`director_escuela`) dentro de su región; roles de cuartel autorizados
(`usuario_carga_cuartel`/`presidente_cuartel`/`secretario_comision`) solo su propio cuartel. Todo
usuario autenticado puede ver las carpetas y su contenido (mismo criterio de lectura que ya tenían
los documentos).

`/documentos` ahora muestra una grilla de carpetas (incluida la carpeta virtual "General" para
documentos sin `folder_id` — los documentos existentes antes de este módulo siguen viendo ahí, no se
migran a ninguna carpeta automáticamente). El botón "+" ofrece "Crear carpeta" o "Cargar archivo".

**No implementado a propósito** (confirmado que quede documentado, no en esta tanda): papelera de 30
días o borrado definitivo diferido. Borrar una carpeta hoy es inmediato pero **no borra sus
documentos** — `documents.folder_id` pasa a `null` (`on delete set null`), los documentos quedan
visibles en "General".

### 7.6 Checklist de verificación después de correr 0044-0046

- [ ] Crear un usuario nuevo desde `/usuarios/nuevo` (cualquier rol) y confirmar que se crea sin
      error — esto confirma que 7.1 quedó resuelto.
- [ ] Como `informatica_r4`, entrar a `/usuarios/:id` de otro usuario y probar: cambiar email,
      resetear contraseña, activar/desactivar, forzar cambio de contraseña.
- [ ] Como `informatica_r4`, confirmar que SÍ podés editar a otro `informatica_r4`; como
      `integrante_informatica`, confirmar que NO podés.
- [ ] Crear una carpeta de documentos y cargar un archivo dentro.
- [ ] Confirmar que los documentos existentes previos a esta tanda siguen viendo en "General".

## 8. Verificación y ajuste fino de permisos (2026-08) — migración 0047

Pasada de verificación posterior a la sección 7: se confirmó que el fix crítico y `admin-update-user`
funcionan correctamente, y se corrigieron 2 brechas concretas de permisos contra la matriz
institucional real. No se agregaron módulos nuevos ni se hizo refactor grande.

### 8.1 Qué se verificó (sin cambios, ya funcionaba correctamente)

- **Alta de usuarios**: cadena completa Auth → profile → user_roles → user_scopes con contraseña
  temporal y `must_change_password=true` confirmada correcta en el código; el fix de `0046` está
  aplicado.
- **`admin-update-user` para informatica_r4/integrante_informatica**: cubre email, contraseña,
  activar/desactivar (ban real en Auth), roles, scope, cuartel/región, flag de cambio de contraseña.
  Protección de superadmin correcta (solo `informatica_r4` toca a otro `informatica_r4` o le asigna
  el rol). No expone secretos (nunca devuelve la contraseña ni el service_role).
- **`invitado`**: confirmado de solo lectura — no aparece en ninguna policy de escritura en todo el
  historial de migraciones.
- **`presidente_cuartel` / `secretario_comision` / `usuario_carga_cuartel`**: confirmados
  correctamente acotados a `my_station_ids()` en todas las tablas operativas, nunca con alcance
  regional.
- **Rol "Administrativo"**: confirmado que no aparece en `ROLE_DEFINITIONS` (no seleccionable en
  ningún formulario), aunque el valor se mantiene aceptado a nivel de tipos/validación server-side
  para no romper perfiles que ya lo tengan asignado.
- **Auditoría**: confirmado que no hay ningún insert directo a `audit_logs` desde el frontend, que
  `document_folders` tiene su trigger de auditoría automático, que los cambios de Auth
  (email/contraseña/ban) quedan registrados vía `record_manual_audit_event` (`0044`), y que
  `jefe_cuerpo_activo` ya podía ver la auditoría de su propio cuartel (`audit_logs_select_station`
  no distingue por rol, solo por `station_id`).

### 8.2 Bugs concretos corregidos (migración `0047_jefe_cuerpo_activo_documents_folders.sql`)

`jefe_cuerpo_activo` faltaba en las policies de escritura de `documents`, `document_versions` y
`document_folders` (solo incluían `usuario_carga_cuartel`/`presidente_cuartel`/
`secretario_comision`), a pesar de que todas las demás tablas de cuartel (`stations`, `vehicles`,
`personnel`, `attendance_summaries`, `intervention_summaries`) ya lo incluían correctamente desde
`0027`. Corregido agregando `has_role('jefe_cuerpo_activo')` a esas 3 policies, más los
`hasRole(...)` correspondientes en `DocumentosPage`, `DocumentoFormPage`, `CarpetaDetallePage` y
`CarpetaFormPage`.

También se amplió `admin-update-user` para que `jefe_cuerpo_activo` pueda resetear contraseñas y
activar/desactivar usuarios **de su propio cuartel únicamente**: valida que `target.station_id ===
actor.station_id`, rechaza cualquier objetivo con rol informática/regional/escuela sin importar el
cuartel, y nunca permite tocar roles/scope/cuartel/región (eso sigue exclusivo de
`informatica_r4`/`integrante_informatica`). **La UI ya expone esto** desde la sección 9
(`UserManagerRoute` + `/usuarios`/`/usuarios/:id` adaptados) — ver el detalle completo ahí.

**Redeploy necesario**: `supabase functions deploy admin-update-user` (cambió su lógica de
autorización para incluir a `jefe_cuerpo_activo`).

### 8.3 Matriz real de permisos institucionales

| Rol | Alcance | Puede | No puede |
|---|---|---|---|
| **`informatica_r4`** | Sistema completo | Todo: crear/editar/activar/desactivar/resetear contraseña de cualquier usuario (incluso otro `informatica_r4`), roles, scopes, cuarteles/subsedes/regiones, todos los módulos, documentos, carpetas, inventario, reportes, auditoría completa, configuración. | Nada — es la autoridad máxima. |
| **`integrante_informatica`** | Sistema completo | Igual que `informatica_r4` **excepto** sobre otro `informatica_r4`: no puede editarlo ni asignarle ese rol. | Modificar a un `informatica_r4`, otorgar el rol `informatica_r4`. |
| **`jefe_cuerpo_activo`** | Su propio cuartel | Crear/editar usuarios de su cuartel (roles limitados, sin informática — vía `admin-create-user`), resetear contraseña/activar-desactivar/editar nombre-rango de usuarios de su cuartel (vía `admin-update-user`, **UI dedicada en `/usuarios`, ver sección 9**), gestionar documentos/carpetas/vehículos/personal/asistencias/intervenciones de su cuartel, ver auditoría de su cuartel. | Crear/asignar roles de informática, modificar usuarios de otros cuarteles o con rol informática/regional/escuela, tocar roles/scope/cuartel/región de nadie, otorgarse alcance regional/subsede/otro cuartel. |
| **`director_escuela`** | Escuela Regional (cursos/capacitaciones/instructores) + lectura regional para reportes — ver sección 9 | Autoridad máxima sobre cursos/capacitaciones/instructores/reportes de Escuela; ver (no editar) cuarteles/personal/asistencia/intervenciones/auditoría de su región; crear usuarios con cualquier rol excepto informática; cargar/editar Inventario Regional (decisión de producto explícita). | Crear/asignar roles de informática; **desde `0048`: editar/crear cuarteles, vehículos, personal, asistencias, intervenciones, documentos/carpetas** (esa escritura es ahora exclusiva de `secretario_regional`/roles de cuartel). |
| **`secretario_regional`** | Regional (autoridad operativa real, ya no compartida con `director_escuela` desde `0048`) | Gestión administrativa regional: escritura sobre cuarteles, vehículos, personal, asistencias, intervenciones, documentos/carpetas de su región. | Roles de informática. |
| **`presidente_cuartel`** | Su propio cuartel | Ver/cargar datos de su cuartel (vehículos, personal, asistencia, intervenciones, documentos/carpetas). | Todo lo fuera de su cuartel, roles de informática, crear usuarios. |
| **`secretario_comision`** | Su propio cuartel | Igual que `presidente_cuartel` para documentos/carpetas. | Igual que `presidente_cuartel`. |
| **`usuario_carga_cuartel`** | Su propio cuartel | Cargar datos operativos de su cuartel. | Roles de informática, alcance fuera de su cuartel. |
| **`invitado`** | Su cuartel (si tiene uno asignado) | Solo lectura. | Cualquier escritura — confirmado sin excepciones. |
| **Nadie excepto `informatica_r4`** | — | — | Crear o modificar roles de informática (`informatica_r4`/`integrante_informatica`). |

**✅ Nota sobre `director_escuela` — corregido en la sección 9 (migración `0048`)**: la brecha
descrita en el párrafo original de esta nota (`director_escuela` compartiendo `is_regional_role()`
con `secretario_regional`, y por lo tanto teniendo escritura regional-wide sobre cuarteles) quedó
resuelta. Ver sección 9 para el detalle completo de la separación de autoridad y la pantalla nueva
de gestión de usuarios de `jefe_cuerpo_activo`.

## 9. Separación de autoridad director_escuela / secretario_regional + pantalla de usuarios para jefe_cuerpo_activo (2026-08) — migración 0048

### 9.1 Qué se corrigió

**Separación de `is_regional_role()`**: la función pasó a devolver `true` solo para
`secretario_regional` (antes incluía también `director_escuela`). `is_escuela_role()` (ya existente,
`director_escuela + instructor`) queda como la **única** autoridad operativa de `director_escuela`
en todo el sistema. Como `is_regional_role()` es una función `SECURITY DEFINER` referenciada por
nombre desde todas las policies de RLS (no inline), redefinirla en `0048` corrige automáticamente el
comportamiento de **todas** las policies que la usan, sin tener que editar cada migración histórica:

- `stations` (escritura), `vehicles`, `personnel`, `attendance_summaries`, `intervention_summaries`,
  `documents`/`document_versions`/`document_folders`, `vehicle_status_history`,
  `personnel_status_history`, storage (`station-media`, `documents`), `can_send_push_scope()`:
  `director_escuela` **deja de tener escritura** — solo `secretario_regional` (e `informatica_r4`,
  y los roles de cuartel dentro de su propio cuartel, sin cambios).
- `stations` (lectura), `profiles_select_regional`, `audit_logs_select_regional`,
  `attendance_select_scope`, `interventions_select_scope`: se amplían explícitamente a
  `is_regional_role() OR is_escuela_role()`, porque `director_escuela` **sí** necesita seguir viendo
  (no escribiendo) cuarteles/perfiles/asistencia/intervenciones/auditoría de su región para armar
  reportes de Escuela y elegir cuarteles participantes de cursos.
- `notifications_write_admin_regional_escuela` y `can_send_push_scope()` (alcance masivo) **no
  cambian de comportamiento para `director_escuela`**: ya incluían `OR is_escuela_role()` desde
  antes, así que conserva la posibilidad de enviar notificaciones/push de Escuela.
- `courses`/`course_stations` (Escuela Regional): sin cambios — ya usaban solo `is_escuela_role()`,
  nunca `is_regional_role()`.
- **`inventory_items_write_regional` no se tocó**: usa `has_role('director_escuela') or
  has_role('secretario_regional')` explícito (no la función), y esa combinación fue una decisión de
  producto confirmada explícitamente en la tanda del módulo de Inventario (0041) — `director_escuela`
  sigue pudiendo cargar/editar inventario regional.

**Bug de seguridad corregido de paso** (detectado en la misma auditoría, mismo archivo `0048`):
`documents_storage_delete_admin_regional_station` (política de Storage del bucket `documents`)
tenía `is_regional_role()` como una condición `OR` **fuera** del `exists()` que resuelve el objeto a
un documento real — cualquier rol regional podía borrar **cualquier objeto del bucket**, sin que el
path llegara siquiera a resolver a una fila de `documents`. Corregido moviendo la condición dentro
del `exists()`, scopeada por región igual que el resto de las policies de escritura territorial.
También se scopearon por región (antes "pelados", sin filtro) `station_media_write/update/delete_
admin_regional_station` y `documents_storage_write_admin_regional_station`.

**Pantalla dedicada para `jefe_cuerpo_activo`**: `/usuarios` y `/usuarios/:id` dejaron de estar
exclusivamente detrás de `AdminRoute` (eliminado, ver más abajo) y ahora usan el nuevo
`UserManagerRoute`, que también deja pasar a `jefe_cuerpo_activo`. Dentro de esas pantallas:
- `UsuariosPage`: el listado se filtra client-side a `profile.station_id === (su propio station_id)`
  cuando el actor es `jefe_cuerpo_activo` (no admin).
- `UsuarioDetallePage`: bloquea el acceso (UI) a un perfil de otro cuartel o con rol
  informática/regional/escuela (mismo `PRIVILEGED_TARGET_ROLES` que valida `admin-update-user`
  server-side); oculta por completo las secciones "Email", "Roles" y "Alcances (scopes)", y dentro
  de "Datos básicos" oculta los selects de Región/Cuartel — solo quedan nombre/rango editables (vía
  `admin-update-user`, no `updateProfile` directo: RLS no le da a `jefe_cuerpo_activo` escritura
  sobre el perfil de otro usuario, así que el guardado de "Datos básicos" para este rol pasa por la
  Edge Function). Las secciones "Contraseña", "Cambio de contraseña obligatorio" y el botón
  "Desactivar/Reactivar usuario" quedan visibles y funcionales (usan `admin-update-user`, que ya
  valida `station_id` y roles del objetivo server-side).
- Esto es **conveniencia de UI, no el límite de seguridad real** — `admin-update-user` sigue siendo
  la única fuente de verdad de autorización, exactamente como ya estaba documentado en la sección 8.2.
- `AdminRoute.tsx` se eliminó (quedó sin usos tras este cambio); `navigation.ts` ajustado para que
  `jefe_cuerpo_activo` vea el ítem "Usuarios" (listado filtrado) y `director_escuela` conserve el
  acceso directo a "Nuevo Usuario" (ya no ve el listado completo).

**Descripciones de roles actualizadas** (`src/types/roles.ts`, `ROLE_DEFINITIONS`): el texto de
`director_escuela` ya no dice "máxima autoridad institucional de la Regional 4", refleja el alcance
real (Escuela Regional + lectura regional para reportes, sin escritura sobre cuarteles).

### 9.2 Migración nueva a correr

- `0048_director_escuela_scope_separation.sql` — redefine `is_regional_role()`; reescribe
  `stations_select_scope`, `profiles_select_regional`, `audit_logs_select_regional`,
  `attendance_select_scope`, `interventions_select_scope` (agregan `OR is_escuela_role()`);
  reescribe las 3 policies de storage de `station-media` y las 2 de storage de `documents` (scope
  regional real + fix del bug de borrado). No agrega columnas ni requiere backfill.

### 9.3 Edge Functions a redesplegar

Ninguna. `admin-update-user` no cambió en esta tanda (ya soportaba `jefe_cuerpo_activo` desde
`0047`/sección 8) — solo se conectó la UI que ya le faltaba. Todo el cambio de esta tanda vive en
SQL (RLS) y en el frontend.

### 9.4 Vercel

Sí, redeploy — hay cambios de frontend (`UserManagerRoute` nuevo, `UsuarioDetallePage`,
`UsuariosPage`, `navigation.ts`, `CuartelDetallePage`, `CuartelFormPage`, `DocumentosPage`,
`CarpetaDetallePage`, `CarpetaFormPage`, `roles.ts`). Si el repo está conectado a Vercel con deploy
automático en push a `main`, no requiere acción manual.

### 9.5 Checklist de verificación después de correr 0048

- [ ] Como `director_escuela`: confirmar que YA NO puede editar/crear cuarteles, vehículos,
      personal, asistencia, intervenciones, documentos/carpetas (los botones de edición no deberían
      aparecer, y si se fuerza la petición directo a la API, RLS debe rechazarla con 403/42501).
- [ ] Como `director_escuela`: confirmar que SÍ puede seguir creando/editando cursos y cuarteles
      participantes en `/escuela`, y que sigue viendo el listado de cuarteles/personal de su región
      en modo solo lectura (para elegir participantes y armar reportes).
- [ ] Como `director_escuela`: confirmar que sigue pudiendo crear usuarios desde `/usuarios/nuevo`
      (cualquier rol excepto informática) y enviar notificaciones/push.
- [ ] Como `secretario_regional`: confirmar que conserva exactamente el mismo acceso de escritura
      regional que tenía antes (sin cambios para este rol).
- [ ] Como `jefe_cuerpo_activo`: entrar a `/usuarios`, confirmar que el listado muestra solo usuarios
      de su propio cuartel; entrar a uno de esos usuarios y confirmar que puede editar nombre/rango,
      resetear contraseña, y activar/desactivar, pero NO ve secciones de Email/Roles/Alcances.
- [ ] Como `jefe_cuerpo_activo`: intentar (vía URL directa) entrar a `/usuarios/:id` de un usuario de
      otro cuartel, o de un usuario con rol `secretario_regional`/`director_escuela`/informática —
      confirmar que la pantalla muestra "No tenés permiso para ver este usuario."
- [ ] Buscar en la consola del navegador errores 403/400 al repetir los pasos anteriores con cada rol
      — no deberían aparecer salvo en los casos de bloqueo esperado (marcados arriba).

## 10. Pasada de QA funcional (2026-08) — migración 0049

Auditoría de bugs concretos sobre todo el sistema (no solo permisos), sin agregar módulos nuevos.

### 10.1 Bugs corregidos

- **Mensajes de error de Edge Functions perdidos** (`src/lib/api/users.ts`): `createUserAccount`/
  `updateUserAccount` relanzaban el `FunctionsHttpError` crudo del cliente de supabase-js, cuyo
  `.message` es siempre el string genérico "Edge Function returned a non-2xx status code" —
  **nunca** el `{error: "..."}` real que `admin-create-user`/`admin-update-user` arman con cuidado
  (email duplicado, "solo podés editar tu propio cuartel", contraseña corta, etc.). El usuario veía
  siempre el mensaje genérico en vez del motivo real del rechazo. Corregido con un helper que lee
  `error.context.json()` (el `Response` crudo que expone `FunctionsHttpError`) y usa ese mensaje si
  existe, con fallback al mensaje genérico solo si el body no es JSON parseable.
- **Transición inversa de baja de flota/separación sin motivo ni historial** (migración `0049`):
  `block_direct_vehicle_decommission()`/`block_direct_personnel_separation()` (0038/0040) solo
  bloqueaban **entrar** a vendido/transferido/baja (o renuncia/baja/pase/reserva) por UPDATE directo
  sin pasar por `change_vehicle_status()`/`change_personnel_status()`. La transición **inversa**
  (reactivar un vehículo/integrante ya dado de baja) no estaba bloqueada: cualquier usuario con
  permiso de escritura normal sobre esa tabla podía hacerlo con un UPDATE directo (ej. desde la
  consola del navegador con su propia sesión), sin motivo obligatorio y sin fila en
  `vehicle_status_history`/`personnel_status_history`. No hay ningún flujo de UI para reactivar hoy
  (`CuartelDetallePage` oculta los controles de cambio de estado una vez dado de baja), así que esto
  era puramente una brecha de seguridad sin caso de uso legítimo detrás — se bloqueó la transición
  inversa también, con el mismo criterio que la de entrada.
- **Borrado de carpeta sin manejo de error** (`CarpetaDetallePage.tsx`): `handleDeleteFolder` no
  tenía try/catch (a diferencia de su hermano `handleSaveFolder`) — un fallo (ej. RLS lo rechaza, o
  error de red) quedaba como una excepción no manejada en consola, sin mensaje visible para el
  usuario. Corregido con el mismo patrón try/catch/`setError` que el resto de la página.
- **Mensaje crudo de Storage al abrir un documento eliminado** (`src/lib/api/storage.ts`):
  `getDocumentSignedUrl` relanzaba el error crudo (en inglés) de Supabase Storage cuando el archivo
  ya no existe en el bucket pero la fila de `documents` sigue ahí. Corregido con un mensaje en
  español ("El archivo no está disponible o fue eliminado del almacenamiento.").
- **Ícono de notificaciones push genérico** (`src/sw.ts`): el service worker usaba
  `/icons/siger4-192.png` (el ícono cuadrado rojo genérico de la PWA) como `icon`/`badge` de toda
  notificación push del sistema operativo, en vez del logo real del Dpto. Informática y Estadística
  R4. Se generaron `public/icons/push-informatica-192.png` y `push-informatica-512.png` (PNG
  transparente, mismo archivo fuente que login/sidebar/header — `public/logos/logo-informatica.png`,
  reescalado) y se actualizó `sw.ts` para usarlos (`icon` con el 512, `badge` con el 192 — Chrome/
  Android enmascara automáticamente el `badge` a blanco/alpha para la barra de estado).

### 10.2 Verificado sin bugs (no requiere acción)

- **Roles/permisos vs backend post-0048**: ninguna página muestra una acción operativa que el
  backend ya rechace para `director_escuela` (ni al revés, ninguna acción de `jefe_cuerpo_activo`
  quedó oculta indebidamente). `isAdmin`/`ADMIN_ROLES` consistente en todo el frontend.
  `instructor` tiene pantallas reales (Escuela/Cursos), no es un rol sin uso.
- **Notificaciones/push**: dedup de envíos duplicados resuelto correctamente server-side
  (`push_send_log` con índice único parcial); opt-out del recordatorio semanal funciona; notificación
  de prueba correctamente auto-scopeada; manejo de errores silencioso/auto-reparable donde
  corresponde (VAPID no configurado, suscripción expirada 404/410).
- **Documentos/carpetas**: borrado de carpeta correctamente pone `documents.folder_id = null` (no
  huérfanos); permisos de las 4 páginas del módulo coinciden exactamente con las policies RLS
  post-0048; validación de tamaño/MIME de archivo client-side coincide con los límites server-side
  de `0033_storage_hardening.sql`.
- **Vehículos/Personal**: motivo obligatorio exigido tanto client-side como server-side (RPC) para
  las transiciones de baja/separación (entrada); `vehicles_count`/`personnel_count` recalculan
  siempre por conteo completo (no por incremento/decremento), sin drift posible; historial visible
  en el detalle de cuartel; auditoría genérica (`audit_row_change`) confirmada disparando con el
  actor real resuelto correctamente.
- **Textos obsoletos**: sin restos de "Invitar usuario"/"/registro", "Próximamente", roles
  "Administrativo" seleccionables, ni "presidente_regional". Un único label vestigial y
  inofensivo (`analisis_ia_reporte` en `humanize.ts`, solo usado para traducir auditoría histórica si
  existiera, no es un botón ni una promesa de feature) — no se tocó, no es user-facing.
- **Links rotos**: ningún `Link`/`navigate` apunta a una ruta que no exista en `App.tsx`.

### 10.3 Deuda técnica documentada (no corregida en esta tanda, no es un bug bloqueante)

- **Mensajes de error crudos de Postgres/Supabase**: patrón sistemático en ~40 archivos
  (`err instanceof Error ? err.message : 'mensaje amigable'`) donde cualquier error que SÍ sea una
  instancia de `Error` (la gran mayoría de los que tira supabase-js sobre `.from(...)` directo)
  muestra su `.message` crudo sin traducir — puede ser un texto técnico en inglés (violación de
  constraint, "permission denied for table X") en vez de un mensaje en español. Corregir esto de
  raíz requeriría un helper central de traducción de errores aplicado en ~80 sitios de
  `src/lib/api/*.ts` — se dejó fuera de esta tanda por ser una refactorización de superficie amplia
  (se pidió explícitamente no hacer refactor grande), pero queda documentado como el ítem prioritario
  de la próxima pasada de limpieza de UX.
- **Documento "pending" huérfano si falla la subida** (`DocumentoFormPage.tsx`): si el paso de subir
  el archivo falla después de crear la fila de `documents` (`storage_path='pending'`), la fila queda
  huérfana sin indicación específica al usuario más allá del error genérico. Existe una mitigación
  parcial (`cleanup_pending_documents`, banner en `/documentos` para limpiar filas de más de 24hs),
  pero es exclusiva de `informatica_r4`/`integrante_informatica` — un `secretario_regional` o rol de
  cuartel que genera una fila huérfana no tiene forma de verla ni limpiarla por su cuenta.
- **Reintento de edición de documento puede duplicar versión**: si falla la subida al reemplazar el
  archivo de un documento existente, el reintento vuelve a archivar la versión anterior en
  `document_versions` (puede quedar duplicada si se reintenta más de una vez). Riesgo bajo (solo
  historial, no pérdida de datos).

### 10.4 Migración nueva a correr

- `0049_block_reverse_lifecycle_transition.sql` — bloquea la transición inversa de
  vendido/transferido/baja (vehículos) y renuncia/baja/pase/reserva (personal) por UPDATE directo,
  mismo criterio que ya aplicaba 0038/0040 para la transición de entrada.

### 10.5 Edge Functions a redesplegar

Ninguna — el fix de mensajes de error (10.1) es 100% frontend (lee el body que la función ya
devolvía correctamente; el bug estaba en cómo el cliente lo descartaba, no en la función).

### 10.6 Checklist de verificación después de correr 0049

- [ ] Confirmar que dar de baja/vender/transferir un vehículo (o pasar personal a
      renuncia/baja/pase/reserva) sigue funcionando igual que antes (con motivo obligatorio).
- [ ] Como `informatica_r4`, intentar (SQL Editor) un `UPDATE vehicles SET status='operativo' WHERE
      status='baja'` directo — debe rechazarse con el mensaje de "hay que usar el flujo
      correspondiente".
- [ ] Crear un usuario con un email que ya existe y confirmar que el mensaje mostrado es "Ya existe
      un perfil con ese email." (no "Edge Function returned a non-2xx status code").
- [ ] Activar notificaciones push (`/ajustes`) y generar una notificación — confirmar que el ícono
      grande y el badge muestran el logo de Informática y Estadística R4, no el ícono rojo genérico.

## 11. Ajuste fino de íconos de notificaciones push (2026-08)

Seguimiento a la sección 10.1: el ícono grande de las push ya usaba el logo real, pero el ícono
chico de la barra de estado de Android seguía viéndose vacío o genérico.

### 11.1 Causa raíz

`badge` en la Web Notifications API no es una imagen a color: Android **ignora el canal de color por
completo** y usa solo el canal alfa para pintar una silueta monocroma (blanco sobre el color de fondo
de la barra de estado), a un tamaño efectivo muy chico (~24px). El asset que se había usado
(`push-informatica-192.png`, un recorte a color del emblema completo — anillo de texto, bandera,
laptop chica) tiene demasiado detalle para sobrevivir esa reducción: el resultado era una mancha
irreconocible, que Android probablemente termina mostrando como un punto vacío o cae a un ícono de
sistema genérico.

### 11.2 Fix

- **Nuevo asset dedicado**: `public/icons/push-badge-96.png` / `push-badge-192.png` — una silueta
  simplificada de un solo color (blanco sólido sobre fondo transparente), inspirada en el motivo
  "laptop + píxeles de datos" del logo real, sin texto ni bandera. Es una forma nueva, no un recorte
  del logo (el logo no tiene una capa aislada de esa sub-forma) — mantiene el lenguaje visual del
  emblema pero simplificado a lo mínimo necesario para ser legible a 24px.
- `src/sw.ts`: `badge` pasa a usar `push-badge-192.png`; `icon` sigue con
  `push-informatica-512.png` (el logo completo, sin cambios).
- **Manifest de la PWA** (`vite.config.ts`) tenía dos problemas adicionales, no relacionados a push
  pero con el mismo síntoma de "ícono vacío en Android":
  1. Los `icons` declaraban un solo tamaño (`1254x1254`, el tamaño nativo del archivo fuente) en vez
     de los tamaños estándar (`192x192`/`512x512`) que Android/Chrome esperan para el selector de
     instalación y el ícono de la app instalada.
  2. El ícono `purpose: maskable` usaba el logo completo sin ningún margen — Android recorta
     cualquier maskable a la forma que use el launcher (círculo, squircle, etc.), y sin margen de
     seguridad el emblema queda cortado en los bordes.
  Se generaron 4 assets nuevos: `manifest-icon-192.png`/`manifest-icon-512.png` (`purpose: any`, el
  logo reescalado sin cambios) y `manifest-icon-maskable-192.png`/`manifest-icon-maskable-512.png`
  (`purpose: maskable`, el logo reducido al 70% del lienzo, centrado, sobre fondo sólido del color de
  tema `#D32F2F` — así el recorte del launcher nunca corta el emblema).

### 11.3 Limitación de navegador (no corregible desde la app)

El texto que aparece **arriba** del título/cuerpo de la notificación (algo como "SIGER4 · sitio ·
ahora", exacto formato depende del navegador/SO) lo arma y renderiza **el navegador/sistema
operativo**, no la Web Notifications API. No existe ninguna opción en `NotificationOptions` (los
parámetros que acepta `showNotification()`) para modificarlo, ocultarlo, o reemplazarlo — Chrome/
Android lo agrega siempre a partir del origen del sitio (dominio) y la hora de recepción, como parte
del "chrome" de sistema alrededor de cualquier notificación web, sea de SIGER4 o de cualquier otro
sitio. Es una limitación de la plataforma, no un bug de la app ni algo que dependa de qué `icon`/
`badge`/`title` se manden.

### 11.4 Edge Functions a redesplegar

Ninguna — `send-push`/`send-push-system` nunca mandaban `icon`/`badge` en el payload (confirmado al
revisar ambas funciones); esos valores siempre se definen en `sw.ts` al momento de mostrar la
notificación, no en el payload que viaja por Web Push. Este cambio es 100% frontend/manifest.

### 11.5 Vercel

Sí, redeploy — nuevos assets estáticos + cambios en `vite.config.ts`/`sw.ts`.

### 11.6 Checklist de verificación

- [ ] Generar una notificación push real en un dispositivo Android con Chrome: confirmar que el
      ícono chico de la barra de estado se ve como una forma reconocible (silueta de laptop), no un
      punto vacío ni el ícono genérico de Chrome.
      **Nota**: no se pudo validar esto en este entorno de desarrollo (requiere un dispositivo
      Android real o un emulador con Play Services + Chrome, y una suscripción push activa) — la
      construcción del asset sigue la convención documentada de Android (silueta monocroma simple,
      alto contraste, sin texto/detalle fino), pero la verificación visual final en dispositivo real
      queda pendiente de que alguien con un Android a mano la confirme después de este deploy.
- [ ] Instalar la PWA en Android (o Chrome desktop) y confirmar que el ícono de la app instalada
      muestra el logo completo, no un cuadrado en blanco ni recortado.
- [ ] Confirmar en `chrome://serviceworker-internals` o DevTools → Application → Manifest que no hay
      advertencias sobre íconos faltantes o mal declarados.

## 12. Verificación final de PWA/push + limpieza de assets (2026-08)

Pasada de verificación sobre lo hecho en la sección 11 (sin cambios de comportamiento nuevos, solo
confirmación + limpieza de lo que quedó a medio camino).

### 12.1 Verificado sin bugs

- **Manifest** (`vite.config.ts`): los 4 íconos estándar (192/512 × any/maskable) están declarados
  correctamente, se generan en `dist/manifest.webmanifest` con el `src` correcto, y los archivos
  existen en `dist/icons/`. `name`/`short_name`/`description` completos.
- **`sw.ts`**: `icon` usa el logo institucional completo (`push-informatica-512.png`), `badge` usa la
  silueta simplificada (`push-badge-192.png`). Como no hay ninguna rama de código por tipo de
  notificación — manual (`NotificacionFormPage`), automática (triggers de Postgres) y recordatorio
  semanal (`send-push-system`) terminan **todas** en el mismo listener `self.addEventListener('push', ...)`
  de `sw.ts` — el render visual es idéntico para las tres por construcción, no hace falta
  sincronizar nada a mano.
- **`send-push`/`send-push-system`**: confirmado que ninguna de las dos manda `icon`/`badge` en el
  payload — no necesitan cambios ni redeploy.
- **Ícono maskable sin recorte**: se simuló el recorte a círculo (el caso más agresivo entre las
  formas de máscara que usan los launchers de Android — squircle/rounded-square recortan menos) sobre
  `manifest-icon-maskable-512.png` y el emblema completo (incluido el anillo de texto exterior) queda
  entero, con margen de sobra contra el borde del fondo rojo del tema.
- **Sin restos de texto obsoleto**: repetido el barrido de "Invitar"/"/registro" (solo queda el texto
  que explica correctamente que el flujo fue retirado, no un botón activo), "Próximamente" (cero
  resultados), rol "Administrativo" seleccionable (cero resultados, sigue solo en el tipo por
  compatibilidad de datos legacy), "presidente_regional" (cero resultados). El label vestigial
  `analisis_ia_reporte` en `humanize.ts` sigue ahí sin usarse activamente (documentado desde la
  sección 10, no es user-facing).

### 12.2 Corregido en esta pasada

- **Assets de íconos duplicados/muertos en `public/icons/`**: quedaron 4 archivos sin ninguna
  referencia en el código después de los cambios de la sección 11 — `siger4-192.png`/`siger4-512.png`
  (el ícono genérico viejo, reemplazado por `manifest-icon-*.png`), `siger4-icon.svg` (solo estaba en
  `includeAssets`, sin ningún `<link>` ni manifest que lo usara) y `push-informatica-192.png` (`badge`
  ya apunta a `push-badge-192.png`, no a este). También se sacó `push-badge-96.png`: se había generado
  como variante de tamaño pero nunca se llegó a referenciar desde `sw.ts` (solo el de 192 quedó
  cableado). `public/icons/` quedó con exactamente los 6 archivos que el código realmente usa.
- **`vite.config.ts`**: `includeAssets` ya no lista `icons/siger4-icon.svg` (el archivo se borró) ni
  `manualChunks.charts` (ver siguiente punto).
- **Dependencia sin uso: `recharts`**: no había ningún `import` real en `src/` (una sola mención en
  un comentario de `reportBuilder.ts`, explicando por qué los gráficos de los PDF se dibujan a mano en
  canvas — jsPDF no soporta SVG/recharts directamente, así que el proyecto nunca terminó usando la
  librería). El chunk `charts` que generaba el build estaba vacío (0.03 kB, solo un re-export de
  vendor). Se sacó de `package.json` y de `manualChunks` en `vite.config.ts`; `npm install` bajó 37
  paquetes (recharts + su propio árbol de dependencias transitivas).

### 12.3 Limitación de plataforma (recordatorio, ya documentada en 11.3)

El texto superior de la notificación ("SIGER4 · dominio · ahora") sigue siendo un elemento de chrome
del navegador/SO sin ninguna opción de personalización en la Web Notifications API — no cambió nada
en esta pasada, se repite acá solo para que quede junto al resto del checklist de verificación.

### 12.4 Qué no se pudo validar en este entorno

- **Chrome Android real/emulador**: sigue sin poder confirmarse en este entorno de desarrollo (sin
  dispositivo ni emulador con Play Services). La construcción de los assets (badge monocromo simple,
  maskable con safe-zone verificado por simulación) sigue la convención documentada de la plataforma,
  pero la confirmación visual final en un dispositivo real queda pendiente — ver checklist abajo.
- **DevTools → Application → Manifest en un despliegue real**: revisado que el manifest generado por
  el build es válido y sin campos faltantes, pero no se pudo abrir la consola de un despliegue de
  producción real desde este entorno (sin acceso al proyecto Vercel/Supabase en vivo del usuario).

### 12.5 Migraciones nuevas / Supabase / Edge Functions

Ninguna. Esta pasada fue 100% frontend (assets, manifest, `package.json`) — no se tocó ninguna
migración, tabla, policy ni Edge Function.

### 12.6 ¿Hace falta reinstalar la PWA?

**Sí, recomendado** para quien ya tenía SIGER4 instalada desde antes de la sección 11/12: el ícono de
launcher de una PWA ya instalada normalmente **no se actualiza solo** aunque el manifest cambie en el
servidor — la mayoría de los navegadores (incluido Chrome/Android) cachean el ícono al momento de la
instalación y solo lo refrescan en actualizaciones mayores o reinstalaciones. Los usuarios que instalaron
la app antes de este cambio van a seguir viendo el ícono viejo en su pantalla de inicio hasta que
desinstalen y vuelvan a instalar la PWA. El Service Worker en sí (código, caché, comportamiento de
push) sí se actualiza solo vía `registerType: 'autoUpdate'`, sin reinstalar nada — esto aplica
específicamente al ícono del launcher, no al funcionamiento de la app.

### 12.7 Checklist de verificación

- [ ] Confirmar `npm run build` sin warnings de assets faltantes (ya verificado en esta pasada).
- [ ] Desinstalar y reinstalar la PWA en un dispositivo que ya la tuviera de antes, confirmar que el
      ícono del launcher pasa a mostrar el logo institucional real.
- [ ] En un dispositivo Android nuevo (sin instalación previa), instalar la PWA y confirmar
      directamente que el ícono no sale recortado ni en blanco.
- [ ] Generar una notificación push y confirmar visualmente en el dispositivo que el badge de la
      barra de estado se ve como la silueta de laptop, no un punto vacío.

## 13. Cierre de ciclo (2026-08) — backlog para el próximo ciclo funcional

Este ciclo se concentró en corregir deuda de permisos, bugs de QA funcional encontrados en auditoría,
y pulido de PWA/push — **no se agregó ningún módulo nuevo**, según lo pedido explícitamente en cada
tanda. Lo que sigue es trabajo de producto nuevo, no bugs, y queda para una tanda futura con su propio
alcance definido:

- **Calendario real**: hoy no existe una vista de calendario (cursos, capacitaciones, vencimientos)
  más allá de las fechas sueltas que ya muestra cada módulo. Sería una vista nueva que cruza datos de
  `courses`, y potencialmente otros vencimientos institucionales.
- ~~**Historial institucional del cuartel**~~ — implementado en la sección 14 (ciclo 2026-08,
  migración 0050). Nota: lo implementado es una cronología legible cargada a mano (hitos, autoridades,
  reconocimientos), no una unificación automática de `audit_logs`/`vehicle_status_history`/
  `personnel_status_history`/`documents` — esa unificación automática, si se pide en el futuro, sigue
  siendo trabajo pendiente aparte.
- **Semáforo de carga**: indicador visual de qué cuarteles están al día con la carga de datos
  operativos (asistencia, intervenciones) y cuáles no — no existe ningún mecanismo hoy que compare
  "última carga" contra una expectativa de frecuencia.
- **Mejora de documentos con papelera de 30 días**: ya documentado como pendiente desde la sección 7.5
  — hoy borrar una carpeta es inmediato (los documentos quedan en "General", pero no hay soft-delete
  real ni ventana de recuperación para documentos individuales).
- **Solicitudes de préstamo del Inventario Regional**: el módulo de Inventario (sección 6.5) solo
  registra qué existe y quién es responsable — falta el flujo de solicitud/aprobación/devolución.
- **Estadísticas de Departamentos Regionales**: el módulo base (sección 6.5) tiene departamento,
  coordinador, miembros — falta cualquier informe o métrica de actividad por departamento.

Deuda técnica ya documentada (secciones 10.3) que tampoco se tocó en este ciclo: helper central de
traducción de mensajes de error de Postgres/Supabase (~80 sitios en `src/lib/api/*.ts`), fila de
documento "pending" huérfana si falla la subida (mitigación parcial ya existe, solo accesible a
informática), y riesgo bajo de versión de documento duplicada en reintento de edición.

## 14. Historial Institucional del Cuartel (2026-08) — migración 0050

Primer módulo nuevo del ciclo funcional siguiente al cierre de permisos/PWA/QA (secciones 8-13).

### 14.1 Qué es y qué NO es

**Historial Institucional** es una cronología legible, cargada manualmente, de hechos relevantes de
la historia de un cuartel: cambios de autoridades, incorporación/baja importante de móviles, reformas
edilicias, hechos destacados, capacitaciones relevantes, aniversarios, reconocimientos, decisiones
institucionales. Cada evento tiene título, fecha, categoría, descripción opcional y un flag de
"destacado".

**No reemplaza ni se alimenta de `audit_logs`** (la bitácora técnica del sistema, ver sección 3 y
`/auditoria`). Son dos sistemas independientes con propósitos distintos:

| | `audit_logs` (Auditoría técnica) | `station_history_events` (Historial Institucional) |
|---|---|---|
| Quién lo carga | Nadie — se genera solo, automáticamente | Un humano, a mano, cuando decide que algo es relevante |
| Qué registra | CADA insert/update/delete de las tablas auditadas, columna por columna | Un puñado de hechos realmente importantes por año |
| Para qué sirve | Trazabilidad técnica, soporte, "quién tocó esta fila y qué cambió" | Leerse como la historia del cuartel, en lenguaje institucional |
| Volumen esperado | Alto (cientos/miles de filas) | Bajo (decenas de eventos en la vida del cuartel) |

`station_history_events` SÍ tiene su propio trigger de auditoría técnica genérica (igual que
cualquier otra tabla del sistema): un alta/edición/borrado de un evento histórico también queda
registrado en `audit_logs` (quién tocó la tabla y cuándo) — eso es auditoría de la tabla en sí, no el
contenido de la cronología.

### 14.2 Esquema

Tabla `station_history_events`: `id`, `station_id` (FK a `stations`, `on delete cascade`), `title`,
`description` (opcional), `event_date`, `category` (enum `station_history_category`), `is_highlighted`
(boolean), `attachments` (jsonb, preparado para una fase futura de adjuntos — foto del hecho, acta
escaneada — sin UI ni bucket de Storage propio todavía, queda `null`), `created_by_profile_id`,
`created_at`, `updated_at`.

Categorías (`station_history_category`): `institucional`, `operativo`, `personal`, `vehiculos`,
`infraestructura`, `capacitacion`, `documentacion`, `autoridad`, `otro`.

**Borrado**: es un DELETE real (mismo criterio que `documents`/`personnel` en el resto del sistema),
no soft-delete. No se agregó una columna `is_deleted` porque ninguna otra tabla del schema usa ese
patrón — mantenerlo consistente evitó una excepción de diseño para un solo módulo. El alta/baja igual
queda en `audit_logs` vía el trigger genérico, así que un borrado no es completamente irrecuperable
para `informatica_r4` (puede reconstruirse desde el `old_value` de la fila de auditoría si hiciera
falta), aunque no hay una función de "restaurar" en la UI.

### 14.3 Permisos (RLS)

- **Lectura**: cualquier usuario autenticado, igual que el resto de los directorios institucionales
  del sistema (`documents`, `courses`, `inventory_items`). `invitado` es un rol autenticado, así que
  ya queda de solo lectura por construcción (nunca matchea la policy de escritura) — no hizo falta una
  policy separada para ese caso.
- **Escritura** (`station_history_events_write_admin_regional_station`): mismo patrón territorial que
  `documents_write_admin_regional_station` (post-0048):
  - `informatica_r4`/`integrante_informatica`: cualquier cuartel.
  - `secretario_regional`: cuarteles dentro de su propia región.
  - `usuario_carga_cuartel`, `presidente_cuartel`, `secretario_comision`, `jefe_cuerpo_activo`: solo
    su propio cuartel.
  - `director_escuela`: **sin escritura acá a propósito**. Post-0048, su autoridad operativa es
    exclusivamente Escuela Regional (`is_escuela_role()`) — la matriz institucional de esta tanda no
    pidió una excepción para este módulo, así que se mantuvo la misma regla que ya rige
    stations/vehicles/personnel/documents.

### 14.4 UI

- **`CuartelDetallePage`**: nueva sección "Historial Institucional" (entre Intervenciones y Actividad
  Reciente). Listado cronológico (más reciente primero), filtros por categoría y año, evento destacado
  marcado con ícono + badge "Destacado", click para expandir/colapsar la descripción completa, botones
  Editar/Eliminar si el rol tiene permiso (`canEditHistory`, distinto del `canEdit` general de la
  página porque este módulo sí incluye `secretario_comision`, que no tiene escritura sobre
  vehículos/personal/asistencia/intervenciones). Estado vacío: "Todavía no hay eventos históricos
  cargados." Nota visible que aclara la diferencia con Auditoría, con link directo a `/auditoria`.
- **`EventoHistoricoFormPage`** (`/cuarteles/:stationId/historial/nuevo`, `/historial/:id/editar`):
  formulario de alta/edición — título, fecha, categoría, descripción, checkbox de destacado. Mismo
  estilo visual que el resto de los formularios del sistema (`PersonalFormPage` como referencia).
- **Auditoría** (`src/lib/audit/humanize.ts`): se agregó la traducción de tabla
  (`station_history_events` → "Historial institucional") y de los campos nuevos (`event_date`,
  `is_highlighted`, `attachments`, `created_by_profile_id`) para que `/auditoria` no muestre nombres
  de columna crudos al mostrar altas/ediciones/borrados de esta tabla.

### 14.5 Reportes

No se generó un reporte PDF nuevo en esta tanda (se pidió explícitamente que no hiciera falta salvo
que fuera simple, y no lo era dado el resto del alcance). El modelo de datos (`station_history_events`
por `station_id`) queda listo para que una fase futura lo incluya en el reporte de cuartel existente
(`ReportesPage`/`reportBuilder.ts`) sin cambios de schema.

### 14.6 Migración nueva a correr

- `0050_station_history_events.sql` — crea el enum `station_history_category`, la tabla
  `station_history_events`, sus índices, el trigger de `updated_at`, las 2 policies de RLS
  (lectura/escritura), y redefine `audit_row_change()` para que resuelva el contexto territorial de
  esta tabla (mismo patrón que `vehicles`/`personnel`: vía su `station_id` propio). No requiere
  backfill ni pasos manuales — tabla nueva, sin datos previos.

### 14.7 Edge Functions / Vercel

Ninguna Edge Function nueva ni modificada — el módulo completo usa RLS directo (`select`/`insert`/
`update`/`delete` desde el cliente), igual que `personnel`/`documents`/`inventory_items`, sin pasar
por ninguna función server-side. Vercel: sí, redeploy (rutas y páginas nuevas de frontend).

### 14.8 Checklist de verificación después de correr 0050

- [ ] Como `informatica_r4`: entrar al detalle de cualquier cuartel, cargar un evento histórico,
      confirmar que aparece en el listado, editarlo, marcarlo como destacado, confirmar el badge
      visual, eliminarlo.
- [ ] Como `jefe_cuerpo_activo`/`presidente_cuartel`/`usuario_carga_cuartel`/`secretario_comision`:
      confirmar que puede cargar/editar/eliminar eventos de su propio cuartel, y que NO puede hacerlo
      en el detalle de otro cuartel (RLS debe rechazarlo si se fuerza la petición).
- [ ] Como `secretario_regional`: confirmar que puede cargar eventos en cualquier cuartel de su
      región, no fuera de ella.
- [ ] Como `director_escuela`: confirmar que NO ve el botón "+ Agregar" en Historial Institucional de
      ningún cuartel (coherente con que perdió escritura operativa sobre cuarteles en 0048).
- [ ] Como `invitado`: confirmar que puede ver la sección (listado, filtros, expandir eventos) pero no
      ve ningún botón de agregar/editar/eliminar.
- [ ] Filtrar por categoría y por año, confirmar que el filtrado combinado funciona.
- [ ] Entrar a `/auditoria` después de cargar/editar/borrar un evento, confirmar que aparece con
      "Historial institucional" como tabla (no `station_history_events` crudo) y los campos con
      nombres legibles.

## 15. Calendario Institucional (2026-08) — migración 0051

### 15.1 Qué es

Módulo de calendario para toda la Regional: eventos regionales, de cuartel, de Escuela/capacitaciones,
vencimientos, guardias, reuniones, mantenimientos programados. Cada evento tiene título, descripción,
tipo, fecha/hora de inicio (y fin opcional), flag "todo el día", alcance territorial, estado
(programado/cancelado/finalizado), y dos mecanismos de notificación opcionales (`notify_on_create` y
`notify_before_minutes`, ver sección 15.5).

### 15.2 Esquema

Tabla `calendar_events`: `id`, `title`, `description`, `event_type` (enum `calendar_event_type`),
`starts_at`, `ends_at` (opcional, debe ser ≥ `starts_at`), `all_day`, `region_id`/`subsede_id`/
`station_id`, `status` (enum `calendar_event_status`), `notify_on_create`, `notify_before_minutes`
(minutos, > 0 si está definido), `reminder_sent_at` (interno, marca si ya se disparó el recordatorio),
`created_by_profile_id`, `created_at`, `updated_at`.

Tipos (`calendar_event_type`): `regional`, `cuartel`, `escuela`, `capacitacion`, `vencimiento`,
`guardia`, `reunion`, `mantenimiento`, `otro`. Estados (`calendar_event_status`): `programado`,
`cancelado`, `finalizado`.

**Alcance territorial — regla especial para Escuela**: igual que `documents`/`document_folders`, un
evento tiene *exactamente* uno de `region_id`/`subsede_id`/`station_id` — **excepto** los eventos de
tipo `escuela`/`capacitacion`, que no llevan ningún alcance territorial (los tres quedan `null`),
porque la Escuela Regional ya es regional-wide por definición — mismo criterio que ya usa `courses`
(`courses_write_admin_escuela` no filtra por región, solo por `is_escuela_role()`). Esto está reforzado
por un constraint (`calendar_events_single_scope`), no solo por RLS.

**Cancelación vs. borrado**: "Cancelar" (desde el detalle del evento) es un `UPDATE status='cancelado'`
— el evento sigue existiendo y visible en el calendario, marcado como cancelado. "Eliminar" es un
DELETE real. Ambas acciones quedan auditadas vía el trigger genérico.

### 15.3 Permisos (RLS)

- **Lectura**: cualquier usuario autenticado (incluido `invitado`, solo lectura por construcción),
  mismo criterio que el resto de los directorios institucionales del sistema.
- **Escritura** (`calendar_events_write_admin_regional_station_escuela`):
  - `informatica_r4`/`integrante_informatica`: cualquier evento.
  - `is_escuela_role()` (`director_escuela` + `instructor`): eventos `escuela`/`capacitacion`, sin
    alcance territorial (igual que `courses`).
  - `secretario_regional`: eventos regionales (cualquier tipo que no sea escuela/capacitación) dentro
    de su propia región. `director_escuela` no comparte esta rama desde 0048 (`is_regional_role()` es
    exclusivamente `secretario_regional`).
  - `usuario_carga_cuartel`, `presidente_cuartel`, `secretario_comision`, `jefe_cuerpo_activo`: eventos
    con `station_id` igual a su propio cuartel únicamente.

### 15.4 UI

- **`CalendarioPage`** (`/calendario`, nuevo ítem de navegación con ícono dedicado): dos vistas
  intercambiables — **Mes** (grilla mensual liviana hecha a mano, sin librería de calendario externa,
  con puntos indicadores de eventos por día y detalle del día seleccionado debajo) y **Listado**
  (cronológico simple, mejor para mobile). Filtros por tipo, estado, y alcance ("Mi cuartel" /
  "Escuela"). Botón "+" según permisos. Ambas vistas son responsive: la grilla mensual usa CSS grid de
  7 columnas que se adapta al ancho disponible, y el listado es la vista recomendada en pantallas
  chicas.
- **`EventoCalendarioFormPage`** (`/calendario/nuevo`, `/calendario/:id/editar`): alta/edición, con el
  mismo patrón de selector de alcance (region/subsede/cuartel) que `DocumentoFormPage`/
  `CarpetaFormPage`, mostrando "Escuela Regional (sin alcance territorial)" cuando el tipo elegido es
  escuela/capacitación. Incluye los dos checkboxes de notificación.
- **`EventoCalendarioDetallePage`** (`/calendario/:id`): vista de detalle, con acciones
  Editar/Cancelar/Eliminar según permiso.
- **Auditoría**: se agregaron las traducciones de tabla (`calendar_events` → "Calendario") y de los
  campos nuevos a `src/lib/audit/humanize.ts`.

### 15.5 Notificaciones (integración con el sistema existente, sin duplicar push)

**`notify_on_create`**: si está activo, un trigger (`notify_calendar_event_created`, mismo patrón que
`notify_course_created`/`notify_document_created` de 0023) inserta una fila en `notifications` con el
mismo alcance territorial del evento, tipo `actividad_proxima` (ya existía en el enum
`notification_type`, no hizo falta agregar uno nuevo). **No se llama a ninguna Edge Function desde este
trigger** — el frontend (`NotificationPushBridge`, ya montado globalmente desde antes) escucha
*cualquier* insert en `notifications` vía Realtime y dispara el push correspondiente él solo, sin
importar si la notificación la creó un formulario o un trigger de Postgres. Duplicar esa llamada desde
el formulario de carga de eventos habría generado un push doble; no se hizo.

**`notify_before_minutes`**: recordatorio previo al inicio del evento, en minutos. Implementado (no
solo dejado preparado) con un job de **pg_cron** que corre cada 5 minutos:
`send_calendar_event_reminders()` recorre los eventos `programado` con `notify_before_minutes`
definido y `reminder_sent_at` todavía `null` cuya hora de inicio ya entró en la ventana de aviso
(`starts_at <= now() + notify_before_minutes`), inserta la notificación correspondiente, y marca
`reminder_sent_at` para no repetirla en la corrida siguiente del cron. **A diferencia del recordatorio
semanal (0036), este job NO requiere `pg_net`**: el recordatorio entra por la misma tabla
`notifications` + `NotificationPushBridge`, sin necesidad de que la función de Postgres llame
directamente a una Edge Function por HTTP. Solo requiere **`pg_cron` habilitado** (no `pg_net`) — ver
sección 15.6 para el paso exacto.

Precisión del recordatorio: al correr cada 5 minutos, un recordatorio puede dispararse hasta ~5 minutos
más tarde que el valor exacto configurado en `notify_before_minutes` — aceptable para el caso de uso
(avisos institucionales, no alarmas de precisión al segundo).

**Limitación conocida**: un evento de tipo `escuela`/`capacitacion` con `notify_on_create=true` genera
una notificación sin alcance territorial (`region_id`/`subsede_id`/`station_id` los tres `null`) —
igual que cualquier otra fila de `notifications` sin alcance, solo la ve `informatica_r4`
(`notifications_select_own_or_scope` ya tenía esta limitación desde antes, no es nueva de este módulo).
Si se necesita que los eventos de Escuela notifiquen a todos los usuarios (no solo informática), es un
cambio de alcance a decidir en una tanda futura — no implementado acá porque no fue parte del pedido
explícito de esta tanda.

### 15.6 Migración nueva a correr

- `0051_calendar_events.sql` — crea los enums `calendar_event_type`/`calendar_event_status`, la tabla
  `calendar_events`, sus índices y constraints, el trigger de `updated_at`, las 2 policies de RLS,
  redefine `audit_row_change()` para el contexto territorial de esta tabla, el trigger
  `notify_calendar_event_created`, la función `send_calendar_event_reminders()`, y **programa el job de
  pg_cron `siger4-calendar-reminders`**.

  **Requiere pg_cron habilitado ANTES de correr esta migración** (Supabase Dashboard → Database →
  Extensions → buscar `pg_cron` → Enable) — si no está habilitado, la migración falla en la última
  línea (`select cron.schedule(...)`). **No requiere `pg_net`** (a diferencia de 0036): el recordatorio
  nunca llama a una Edge Function directamente desde SQL.

  Sin backfill — tabla nueva, sin datos previos.

### 15.7 Edge Functions / Vercel

Ninguna Edge Function nueva ni modificada. El módulo usa RLS directo para todo el CRUD, y el push de
las notificaciones automáticas (creación + recordatorio previo) reutiliza `send-push` a través del
`NotificationPushBridge` ya existente — no hay ninguna llamada nueva a `send-push`/`send-push-system`
agregada en esta tanda. Vercel: sí, verificar/redeploy — hay rutas, páginas y un ítem de navegación
nuevos.

### 15.8 Checklist de verificación después de correr 0051

- [ ] Confirmar que `select * from cron.job where jobname = 'siger4-calendar-reminders';` devuelve una
      fila activa.
- [ ] Como `informatica_r4`: crear un evento regional con `notify_on_create` activo, confirmar que
      aparece una notificación (y push, si las claves VAPID están configuradas) inmediatamente.
- [ ] Crear un evento con `notify_before_minutes = 5` y `starts_at` unos 6-8 minutos en el futuro,
      esperar a la corrida del cron (cada 5 minutos) y confirmar que llega el recordatorio una sola vez
      (`reminder_sent_at` debe quedar seteado, no debe duplicarse en la corrida siguiente).
- [ ] Como `secretario_regional`: crear un evento regional dentro de su región, confirmar que NO puede
      crearlo fuera de ella.
- [ ] Como `jefe_cuerpo_activo`: crear un evento de tipo "cuartel" en su propio cuartel, confirmar que
      no puede hacerlo en el detalle/formulario apuntando a otro cuartel.
- [ ] Como `director_escuela`/`instructor`: crear un evento de tipo "Escuela" o "Capacitación",
      confirmar que no se les pide alcance territorial y que el evento se guarda sin
      region/subsede/cuartel.
- [ ] Como `invitado`: confirmar que ve el calendario (mes y listado) pero no el botón "+".
- [ ] Cancelar un evento y confirmar que sigue visible en el calendario marcado como "Cancelado" (no
      desaparece). Eliminar otro evento y confirmar que sí desaparece.
- [ ] Entrar a `/panel` y confirmar que aparecen las secciones "Próximos Eventos", "Eventos de Hoy" (si
      hay alguno programado para hoy) y "Vencimientos Próximos" (si hay algún evento tipo
      "vencimiento" futuro).
- [ ] Entrar a `/auditoria` después de crear/cancelar/eliminar un evento, confirmar que aparece con
      "Calendario" como tabla y campos legibles (no `calendar_events`/`starts_at` crudos).

## 16. Semáforo de Carga / Cumplimiento por Cuartel (2026-08) — migración 0052

### 16.1 Qué es

Indicador visual (verde/amarillo/rojo) de qué tan al día está la carga de datos de cada cuartel, para
detectar de un vistazo quién tiene información completa, parcial o desactualizada. **No inventa ni
estima nada**: cada criterio se deriva de filas/columnas que ya existen en el sistema. Si algo no está
cargado, cuenta directamente como pendiente.

### 16.2 Implementación: vista SQL, no cálculo en el frontend

`station_compliance` es una **vista** de Postgres (no una tabla, no una función que traiga filas
crudas para calcular en el cliente): todo el agregado (`EXISTS`, comparación de fechas, conteo) corre
en la base, y devuelve una sola fila resumen por cuartel. Se agregaron 3 índices nuevos
(`attendance_summaries`/`intervention_summaries` por `station_id, created_at desc`, y
`documents` por `station_id`) para que las consultas `EXISTS` de la vista no hagan sequential scan a
medida que esas tablas crecen.

**RLS**: la vista se creó con `security_invoker = true` — esto es obligatorio, no cosmético. Postgres
15+ NO pone `security_invoker` por default en las vistas (corren como el dueño de la vista si no se
especifica); sin esto, la vista bypasearía el RLS de `stations`/`personnel`/`vehicles`/etc. y
cualquier usuario autenticado vería el cumplimiento de cualquier cuartel, sin importar su alcance. Con
`security_invoker=true`, la vista hereda el RLS real de las tablas que consulta con la identidad de
quien la lee — mismo alcance que ya define `stations_select_scope`: `informatica_r4` ve todo,
`secretario_regional`/`is_escuela_role()` ven su región, cualquier perfil con `my_station_ids()`/
`my_subsede_ids()` ve su cuartel/subsede, `invitado` ve su propio cuartel. No hizo falta escribir una
policy de RLS propia porque una vista no es una tabla con RLS independiente — hereda el de sus fuentes.

### 16.3 Criterios del semáforo

**Críticos** (si falta cualquiera de estos tres, el cuartel es **rojo**, sin importar el resto):
- Datos institucionales básicos: `stations.phone` o `stations.email` cargados.
- Personal activo cargado: `stations.personnel_count > 0` (ya mantenido por trigger desde el módulo de
  Personal — solo cuenta integrantes en estado `activo`, no de baja/licencia).
- Vehículos cargados: `stations.vehicles_count > 0` (ya mantenido por trigger).

**No críticos** (si los críticos están OK pero falta alguno de estos, el cuartel es **amarillo**):
- Asistencia reciente: al menos un `attendance_summaries` con `created_at` dentro de los últimos 45
  días.
- Intervenciones recientes: al menos un `intervention_summaries` con `created_at` dentro de los
  últimos 45 días.
- Al menos un documento institucional cargado específicamente para ese cuartel (`documents.station_id`
  = ese cuartel — no cuenta documentos de alcance regional/subsede que no sean específicos del
  cuartel).

**Verde**: los 3 críticos y los 3 no críticos, los 6 cumplidos.

**Informativos, no afectan el color**: `has_history_events` (¿tiene algún evento en el Historial
Institucional, sección 14?) y `has_calendar_events` (¿tiene algún evento de Calendario no cancelado,
sección 15?). Se muestran en la vista de datos pero deliberadamente no penalizan el semáforo — un
cuartel puede legítimamente no tener hechos históricos relevantes para cargar todavía, o ningún evento
de calendario programado, sin que eso signifique que está desactualizado.

**Umbral de 45 días**: es un valor fijo en la definición SQL de la vista (`interval '45 days'`), no una
tabla de configuración separada — se mantuvo simple para esta primera versión. Ajustarlo requiere una
migración nueva que redefina la vista (`create or replace view`), documentada como el punto de ajuste
si el criterio institucional cambia.

**Porcentaje/fracción**: la vista expone `compliant_count` (0 a 6) y `compliant_total` (siempre 6) —
la fracción exacta de criterios cumplidos, **sin redondear** en la base. El frontend decide cómo
presentarlo (en `CuartelDetallePage` se muestra como "X de 6 criterios cumplidos", no como porcentaje
redondeado).

### 16.4 Permisos (RLS)

No se agregó ninguna policy nueva — la vista hereda automáticamente el RLS ya existente de
`stations`/`personnel`/`vehicles`/`attendance_summaries`/`intervention_summaries`/`documents`/
`station_history_events`/`calendar_events` vía `security_invoker=true` (ver 16.2). Esto significa que
el alcance del semáforo es exactamente el mismo alcance que ya tiene cada rol para ver cuarteles: no
hace falta mantener una matriz de permisos separada para este módulo, y no puede desincronizarse de
`stations_select_scope` porque no duplica su lógica, la reutiliza directamente.

### 16.5 UI

- **`CuartelesPage`** (listado): badge de estado (Al día / Parcial / Desactualizado) junto al badge de
  estado operativo del cuartel, en cada tarjeta.
- **`CuartelDetallePage`**: nueva tarjeta "Estado de Carga" (antes de "Autoridades y Contacto") con el
  badge de color, "X de 6 criterios cumplidos", fecha de la última actualización relevante (la más
  reciente entre asistencia/intervenciones/documentos/la propia fila del cuartel), y los motivos
  concretos como chips ("Sin asistencia reciente", "Personal sin cargar", "Sin vehículos cargados",
  "Falta contacto institucional", "Sin intervenciones recientes", "Sin documentos cargados", o "Datos
  actualizados" si no falta nada — nunca se muestra una lista vacía sin explicación).
- **`/panel` (Dashboard Regional)**: nueva sección "Estado de Carga por Cuartel" con el conteo total de
  cuarteles en cada color (respetando el alcance de quien mira el panel, vía la misma vista).

No se agregó una página/panel "Cumplimiento" dedicada aparte — se evaluó innecesaria para esta primera
versión dado que el listado de Cuarteles y el Dashboard ya cubren "ver todo de un vistazo" y "ver el
detalle de uno".

### 16.6 Notificaciones (no implementado en esta tanda, a propósito)

Explícitamente no se agregaron notificaciones automáticas del semáforo (ej. avisar a
`jefe_cuerpo_activo` si su cuartel queda en rojo, resumen semanal a `secretario_regional`, recordatorio
de carga pendiente) — se pidió no hacerlo salvo que fuera trivial, y integrarlo bien (evitar spam,
elegir la cadencia correcta, decidir el umbral de "cuánto tiempo en rojo antes de avisar") no lo es.
Queda documentado como trabajo de una tanda futura. La infraestructura para implementarlo ya existe
(mismo patrón que `send_weekly_reminder()`/`notify_calendar_event_created()`): un job de pg_cron que
lea `station_compliance`, o un trigger sobre las tablas fuente, insertando en `notifications` con el
alcance del cuartel — no requeriría ninguna Edge Function nueva.

### 16.7 Auditoría

El cálculo del semáforo es 100% derivado (una vista, sin estado propio) — no se audita, porque no hay
ninguna escritura que auditar. No se agregó ninguna configuración manual en esta tanda (los umbrales
son fijos en la definición SQL, no editables desde la UI), así que tampoco aplica auditoría de
configuración todavía. Si en el futuro se agrega una tabla de umbrales editable, esa sí debería
auditarse igual que cualquier otra tabla del sistema (trigger genérico `audit_row_change`).

### 16.8 Limitaciones conocidas

- El umbral de 45 días es el mismo para todos los cuarteles y ambos criterios (asistencia e
  intervenciones) — no se diferencia por tamaño de cuartel, frecuencia esperada real, ni se permite
  configurarlo por región/subsede. Ajustable solo editando la vista en una migración futura.
- Los eventos de Historial Institucional y Calendario se muestran pero no afectan el color — si en el
  futuro se decide que sí deberían ser parte del cálculo (ej. "cuartel sin ningún evento de calendario
  en el último año" como criterio de alerta), es un cambio de criterio a definir explícitamente, no
  implementado acá.
- Es una vista, no una tabla materializada: cada consulta recalcula todo en el momento. Para el volumen
  actual del sistema (decenas de cuarteles, no miles) esto es más que suficiente sin necesidad de
  cachear ni materializar — si el volumen creciera mucho en el futuro, sería el punto a revisar primero.

### 16.9 Migración nueva a correr

- `0052_station_compliance.sql` — crea la vista `station_compliance` y los 3 índices nuevos
  (`attendance_summaries`, `intervention_summaries`, `documents`, todos `create index if not exists`).
  No requiere backfill ni pasos manuales — es una vista derivada, no tiene datos propios que migrar.

### 16.10 Edge Functions / Vercel

Ninguna Edge Function nueva ni modificada — el módulo es 100% RLS/SQL directo desde el frontend
(`select * from station_compliance`), sin ninguna llamada a una función server-side. Vercel: sí,
verificar/redeploy — hay cambios de frontend (nuevo archivo `lib/api/compliance.ts`, secciones nuevas
en `CuartelesPage`, `CuartelDetallePage` y `PanelPage`).

### 16.11 Checklist de verificación

- [ ] Confirmar que `select * from station_compliance limit 5;` en el SQL Editor devuelve filas con
      `compliance_status` en `verde`/`amarillo`/`rojo` coherente con los datos reales de cada cuartel.
- [ ] Como `informatica_r4`: entrar a `/cuarteles`, confirmar que cada tarjeta muestra el badge de
      estado de carga junto al badge operativo.
- [ ] Entrar al detalle de un cuartel sin personal/vehículos cargados, confirmar que aparece en rojo
      con los motivos "Personal sin cargar"/"Sin vehículos cargados" listados.
- [ ] Entrar al detalle de un cuartel con todo cargado pero sin asistencia/intervenciones de los
      últimos 45 días, confirmar que aparece en amarillo (no rojo).
- [ ] Como `jefe_cuerpo_activo`/`presidente_cuartel` (rol de cuartel): confirmar que en `/cuarteles`
      solo ve el semáforo de su propio cuartel (por RLS heredado de `stations_select_scope`, no debería
      ver el listado completo de otros cuarteles de todos modos).
- [ ] Como `secretario_regional`: confirmar que ve el semáforo de todos los cuarteles de su región.
- [ ] Entrar a `/panel`, confirmar que la sección "Estado de Carga por Cuartel" muestra los 3 conteos
      (verde/amarillo/rojo) sumando el total de cuarteles visibles para el rol actual.

## 17. Papelera de Documentos con retención de 30 días (2026-08) — migración 0053

### 17.1 Qué es

Eliminar un documento ya no lo borra de inmediato: pasa a la Papelera (soft delete) durante 30 días,
período en el que puede restaurarse. Pasado ese plazo puede purgarse definitivamente (fila de
`documents`, sus filas de `document_versions`, y los archivos reales en el bucket `documents` de
Storage). Esto era deuda documentada explícitamente desde `0045_document_folders.sql` ("Fuera de
alcance de esta migración... papelera de 30 días / borrado definitivo diferido").

### 17.2 Modelo de datos

6 columnas nuevas en `documents`: `deleted_at`, `deleted_by_profile_id`, `delete_reason` (opcional),
`purge_after`, `restored_at`, `restored_by_profile_id`. `purge_after` **no lo manda el cliente**: un
trigger (`set_document_purge_after`) lo calcula server-side como `deleted_at + 30 días` en el momento
exacto en que `deleted_at` pasa de `null` a un valor, y lo limpia si el documento se restaura — evita
que alguien pueda manipular la fecha de purga desde el cliente enviando un `purge_after` propio.

No se creó una vista `documents_active`/`documents_trash` separada: los listados normales
(`fetchDocuments`, `fetchDocumentsByFolder`) ahora filtran `deleted_at is null` explícitamente, y hay
una función nueva (`fetchTrashedDocuments`) para la Papelera — se mantuvo consistente con el resto del
módulo de Documentos, que ya filtra client-side en vez de usar vistas dedicadas.

### 17.3 Reglas de retención

- Enviar a la papelera es un `UPDATE` (`deleted_at` = ahora) — **no borra el archivo de Storage ni la
  fila real todavía**.
- Desaparece de `/documentos` y de las carpetas de inmediato (los listados filtran `deleted_at is
  null`), y aparece en `/documentos/papelera`.
- Durante 30 días puede restaurarse (`UPDATE`, `deleted_at` vuelve a `null`).
- Pasados los 30 días (`purge_after <= now()`), el documento puede purgarse definitivamente — automático
  vía el cron diario, o manualmente antes de que venza si `informatica_r4` lo pide explícitamente.
- La purga real borra, en este orden, y solo avanza al siguiente paso si el anterior no falló: (1) los
  archivos del bucket `documents` (el actual + todas las versiones en `document_versions`), (2) las
  filas de `document_versions`, (3) la fila de `documents`. **Si falla el borrado de Storage, no se
  borra nada de la base** — el documento queda en la papelera para reintentarse en la corrida
  siguiente, en vez de quedar con la fila borrada y el archivo real todavía ocupando espacio (huérfano
  sin ninguna referencia), o la fila apuntando a un archivo que ya no existe.

### 17.4 Por qué la purga es una Edge Function, no una función de Postgres

`delete from storage.objects` borra la fila de metadata, pero **no borra el blob físico** en el object
store — esa operación solo la expone la Storage API de Supabase, alcanzable únicamente con la
`service_role` key desde código server-side (o el cliente JS), nunca desde SQL/PL-pgSQL puro. Es el
mismo motivo por el que enviar un push real requiere la Edge Function `send-push` en vez de un trigger
de Postgres. Por eso la purga es una función nueva, `purge-documents`, no una RPC.

### 17.5 Permisos

- **Enviar a la papelera / restaurar**: mismo alcance que ya tenía la edición de un documento
  (`documents_update_admin_regional_station`, heredado sin cambios de comportamiento de
  `documents_write_admin_regional_station` de 0047/0048) — `informatica_r4`/`integrante_informatica`
  cualquier alcance, `secretario_regional` dentro de su región, roles de cuartel autorizados
  (`usuario_carga_cuartel`/`presidente_cuartel`/`secretario_comision`/`jefe_cuerpo_activo`) solo su
  propio cuartel. Ambas acciones son un `UPDATE` de `deleted_at`, no una operación nueva — no hizo
  falta una policy separada.
- **Purga definitiva**: exclusiva de `informatica_r4`/`integrante_informatica`, y solo sobre documentos
  que ya están en la papelera (`deleted_at is not null` — ni siquiera informática puede saltarse el
  paso de papelera con un `DELETE` directo sobre un documento activo). Postgres no permite "restar"
  permiso agregando una policy adicional (las policies permisivas de un mismo comando se combinan con
  `OR`), así que la vieja policy `for all` (`documents_write_admin_regional_station`) se reemplazó por
  3 policies puntuales sin cambio de alcance (`documents_insert_admin_regional_station`,
  `documents_update_admin_regional_station`) más una policy de `DELETE` nueva y más restrictiva
  (`documents_delete_informatica`). La Edge Function `purge-documents` usa `service_role` (bypasea RLS)
  para el flujo real automático/manual; esta policy es la barrera si alguien intentara un `DELETE`
  directo desde el cliente.
- **`invitado`**: solo lectura, sin acceso a "Papelera" en la UI (la página exige el mismo `canManage`
  que el resto de las acciones de escritura de Documentos) — nunca puede eliminar ni restaurar.

### 17.6 UI

- **`DocumentosPage`**: botón "Papelera" junto al título (visible solo para quien puede gestionar
  documentos).
- **`CarpetaDetallePage`**: el botón "Editar" de cada documento ahora tiene al lado un botón "Eliminar"
  que envía el documento a la papelera (con confirmación explícita del tiempo de retención).
- **`PapeleraDocumentosPage`** (`/documentos/papelera`): lista cada documento en papelera con carpeta,
  alcance (región/subsede/cuartel/usuario, resuelto igual que en el resto de Documentos), quién lo
  eliminó, cuándo, el motivo si se cargó uno, y un badge con los días restantes antes de la purga (rojo
  si quedan 5 días o menos). Acciones: "Restaurar" (todo rol con permiso de gestión) y "Borrar ya"
  (purga puntual, solo informática) por documento, más un botón "Purgar vencidos ahora" (solo
  informática) que dispara la misma lógica que el cron diario, para no tener que esperar.

### 17.7 Auditoría

No se agregó ningún mecanismo de auditoría nuevo: `documents` ya tenía su trigger genérico
(`trg_audit_documents`, desde 0004) disparando sobre INSERT/UPDATE/DELETE — enviar a la papelera
(UPDATE), restaurar (UPDATE) y la purga definitiva (DELETE, ejecutado por la Edge Function con
`service_role`, que sigue disparando el trigger igual que cualquier otro DELETE) quedan todos
auditados automáticamente en `audit_logs`, sin trabajo adicional. Los errores de borrado de Storage
durante la purga (que no corresponden a ningún cambio de fila) se registran en los logs de la Edge
Function (Supabase Dashboard → Edge Functions → `purge-documents` → Logs), mismo criterio que ya usan
`send-push`/`admin-create-user` para errores que no tienen una fila propia que auditar.

### 17.8 Migración nueva y Edge Function nueva

- `0053_documents_trash.sql` — agrega las 6 columnas a `documents`, 2 índices parciales, el trigger
  `set_document_purge_after`, reemplaza `documents_write_admin_regional_station` por 3 policies
  puntuales + la policy de DELETE restringida, y programa el job de pg_cron
  `siger4-document-purge` (diario, 6:00 UTC = 3:00 AM hora Argentina).
- `supabase/functions/purge-documents/index.ts` — Edge Function nueva. **Requiere deploy**:
  `supabase functions deploy purge-documents`.

**Requiere pg_cron habilitado** (Supabase Dashboard → Database → Extensions → `pg_cron` → Enable)
antes de correr la migración — igual que el recordatorio semanal (sección 6.3), la migración falla en
la última línea (`select cron.schedule(...)`) si no está habilitado. **No requiere `pg_net`** para la
función en sí (`purge-documents` no lo usa), pero **sí lo necesita el disparador del cron**
(`trigger_document_purge()` llama a la Edge Function vía `net.http_post`, mismo mecanismo que
`send_weekly_reminder()` de 0036) — si el proyecto ya tiene `pg_net` habilitado por el recordatorio
semanal, no hace falta nada nuevo ahí.

**Configuración de secretos**: reutiliza exactamente `CRON_SHARED_SECRET` y
`siger4.project_url`/`siger4.cron_shared_secret` — **los mismos que ya configuraste para el
recordatorio semanal (sección 6.3)**, no hace falta un secreto nuevo. Si el proyecto nunca configuró el
recordatorio semanal, seguir los pasos exactos de la sección 6.3 (habilitar pg_cron/pg_net,
`supabase secrets set CRON_SHARED_SECRET=...`, `alter database postgres set
siger4.project_url = '...'` / `siger4.cron_shared_secret = '...'`) antes de correr `0053`.

Sin esta configuración, la purga automática diaria no hace nada (deja un `WARNING` en los logs de
Postgres, visible en Database → Logs) — no rompe nada más del sistema, pero los documentos vencidos se
acumulan en la papelera hasta que alguien lo configure o los purgue manualmente desde la UI.

### 17.9 Vercel

Sí, verificar/redeploy — hay página nueva (`PapeleraDocumentosPage`), ruta nueva, y cambios en
`DocumentosPage`/`CarpetaDetallePage`.

### 17.10 Checklist de verificación

- [ ] Confirmar `select * from cron.job where jobname = 'siger4-document-purge';` devuelve una fila
      activa.
- [ ] Como rol con permiso de gestión de documentos: eliminar un documento desde una carpeta,
      confirmar que desaparece de la carpeta y aparece en `/documentos/papelera` con el badge de "30
      días antes de purgarse" (o cercano).
- [ ] Restaurar ese documento desde la Papelera, confirmar que vuelve a aparecer en su carpeta
      original y desaparece de la Papelera.
- [ ] Como `informatica_r4`: usar "Borrar ya" sobre un documento de la papelera, confirmar que
      desaparece de la Papelera y que el archivo ya no es accesible (intentar abrirlo por signed URL
      debería fallar).
- [ ] Confirmar en el bucket `documents` (Supabase Dashboard → Storage) que el archivo purgado
      efectivamente ya no está — no solo la fila de la tabla.
- [ ] Como un rol de cuartel (no informática) con permiso de gestión: confirmar que puede
      eliminar/restaurar documentos de su propio cuartel, pero que el botón "Borrar ya" no aparece.
- [ ] Como `invitado`: confirmar que no ve el botón "Papelera" ni puede eliminar documentos.
- [ ] Entrar a `/auditoria` después de eliminar/restaurar/purgar un documento, confirmar que las 3
      acciones quedan registradas (Creación/Modificación/Eliminación sobre "Documentos").
- [ ] (Si se configuró el cron) Esperar a la corrida diaria o forzarla manualmente con `select
      trigger_document_purge();` en el SQL Editor, confirmar que purga los documentos con
      `purge_after` vencido sin tocar los que todavía están dentro del plazo.

## 18. QA de visibilidad Calendario/Semáforo + bug de carga de archivos (2026-08) — migración 0054

### 18.1 Causa exacta: visibilidad de Calendario para usuarios de cuartel

**No era un problema de RLS.** `calendar_events_select_authenticated` (0051) ya usa
`auth.role() = 'authenticated'` — cualquier usuario autenticado lee cualquier evento, sin importar
alcance; la restricción de esta tabla siempre estuvo solo del lado de la escritura. Confirmado
correcto, sin cambios.

El bug real estaba en el **frontend**, y es el mismo patrón en 3 lugares: el cuartel de un usuario
puede venir de `profiles.station_id` (asignación directa) **o** de una fila en `user_scopes` con
`scope_type='station'` — la base ya distingue esto desde siempre (`my_station_ids()`, ver
`0026_enforce_is_active.sql`, hace `UNION` de ambas fuentes). Pero:

- **`EventoCalendarioFormPage.tsx`**: al crear un evento de tipo "cuartel" como usuario con rol de
  cuartel, el formulario resolvía `station_id: profile?.station_id ?? null` — si ese usuario tenía su
  cuartel asignado vía `user_scopes` (no `profiles.station_id` directo), el insert se mandaba con
  `station_id: null`, lo que **violaba el constraint `calendar_events_single_scope`** (exige
  exactamente un alcance) y el evento nunca se creaba. Un usuario así no podía cargar NINGÚN evento de
  su cuartel — el "no veo bien el calendario" era en realidad "no puedo cargar nada en mi cuartel".
- **`CalendarioPage.tsx`**: el filtro "Mi cuartel" comparaba `e.station_id === profile?.station_id` y
  la opción del `<select>` solo aparecía si `profile?.station_id` era verdadero — para el mismo tipo de
  usuario, la opción de filtro ni siquiera se mostraba, y si hubiera eventos de su cuartel cargados por
  otra persona, nunca coincidían con el filtro.
- **`CarpetaFormPage.tsx`** (módulo Documentos, no Calendario, pero mismo patrón exacto y mismo bug):
  `stationId` se inicializaba desde `currentProfile?.station_id` únicamente: un usuario con cuartel
  vía `user_scopes` quedaba con el selector de cuartel oculto (por estar "stationLocked") y sin forma
  de completar el valor, bloqueado en el validador "Seleccioná el cuartel destino." sin ninguna forma
  de resolverlo desde la UI.

**Corregido** en los 3 archivos: ahora resuelven `myStationId = profile?.station_id ?? scopes.find(s
=> s.scope_type === 'station')?.station_id ?? ''`, usando `scopes` (ya expuesto por `useAuth()`, no
hacía falta ningún fetch nuevo). Se agregó también un mensaje de error explícito ("No pudimos
determinar tu cuartel asignado. Contactá a un administrador.") para el caso límite de un usuario con
rol de cuartel que no tiene ningún cuartel asignado por ninguna de las dos vías — antes ese caso
producía un error de constraint de Postgres crudo y confuso.

### 18.2 Causa exacta: Semáforo (station_compliance) para usuarios de cuartel

**Investigado a fondo, sin encontrar ningún bug de código.** La vista `station_compliance` (0052) usa
`security_invoker = true`, y se confirmó (investigación dedicada de la semántica de Postgres 15+, sin
bugs abiertos conocidos para versiones parcheadas) que esta opción **sí propaga correctamente** el RLS
del usuario que consulta a cada subquery/`EXISTS` dentro de la vista — no hay ninguna razón por la que
un usuario de cuartel debería ver menos de lo que le permite `stations_select_scope` (que ya incluye
`id in (select my_station_ids())`, correcto). El frontend (`CuartelesPage`, `CuartelDetallePage`,
`PanelPage`) tampoco filtra nada por rol antes de mostrar el semáforo — muestra exactamente lo que
RLS ya devolvió.

**Riesgo real identificado (no confirmado como la causa, pero documentado y blindado
preventivamente)**: existen bugs conocidos y documentados de las **herramientas** de Supabase (no de
Postgres en sí) donde el Dashboard/CLI puede **dropear silenciosamente** la opción
`security_invoker` de una vista si esta se edita/recrea desde el Table Editor del Dashboard, o via
ciertos flujos de "declarative schema"/`db diff`/`db pull` (ver
[supabase/supabase#35823](https://github.com/supabase/supabase/issues/35823),
[supabase/cli#3973](https://github.com/supabase/cli/issues/3973),
[supabase/cli#2264](https://github.com/supabase/cli/issues/2264)). Si eso pasara, la vista correría
como su dueño (bypasea RLS) — en la práctica, **todos verían el cumplimiento de todos los cuarteles**,
que es el síntoma contrario al reportado ("no veo bien"), pero de todos modos se blindó con una
migración nueva que reafirma la opción explícitamente sin tocar la lógica de la vista (ver 18.4).

**Verificación recomendada en producción** (no reemplaza probar con un usuario real, pero confirma que
la opción sigue activa en la base):

```sql
select relname, reloptions from pg_class where relname = 'station_compliance';
-- reloptions debe incluir "security_invoker=true"
```

Si al probar con un usuario de cuartel real el semáforo sigue viéndose mal después de correr `0054` y
confirmar `security_invoker=true` con la consulta de arriba, el problema no es de RLS/vista — habría
que revisar con datos reales de ese usuario específico (rol exacto, si su cuartel viene de
`profiles.station_id` o `user_scopes`, y confirmar con `select * from station_compliance;` corrido
directamente como ese usuario, no como `informatica_r4`).

### 18.3 Causa exacta: bug de selección de archivo en Documentos

`DocumentoFormPage.tsx` tenía el formulario con campos `required` nativos de HTML (`title`, `category`)
pero **sin `noValidate` en el `<form>`**. Si un usuario dejaba el título o el tipo de documento vacíos
y hacía click en "Guardar", el navegador bloqueaba el envío de forma **nativa y silenciosa** (con un
pequeño tooltip fácil de no ver) — `handleSubmit` nunca llegaba a ejecutarse. El resultado visible era
que el mensaje de error de un intento anterior (por ejemplo "Adjuntá un archivo.", si el primer intento
fue sin archivo seleccionado) **quedaba pegado en pantalla sin actualizarse**, aunque el usuario ya
hubiera seleccionado el archivo después — dando la impresión de que el sistema "no se daba cuenta" de
la selección, cuando en realidad el submit ni siquiera se estaba disparando.

**Corregido** en `DocumentoFormPage.tsx`:
- Se agregó `noValidate` al `<form>`, y validación explícita de `title`/`category` al inicio de
  `handleSubmit` (con mensajes propios, en español, consistentes con el resto del formulario) — ahora
  **toda** la validación pasa siempre por React, nunca por el navegador, así que el mensaje de error
  mostrado siempre refleja el estado real en el momento del último intento de envío.
- El `onChange` del input de archivo ahora limpia el error inmediatamente al seleccionar un archivo
  (`setError(null)`), para que un mensaje viejo no quede visible ni un instante más de lo necesario.
- Se agregó una confirmación visual explícita ("Archivo seleccionado: nombre.pdf (123 KB)") debajo del
  input, para que el usuario tenga una señal clara e inequívoca de que la selección se registró,
  más allá de lo que el navegador ya muestra en el propio input.

No se tocó la lógica de subida en sí (`uploadDocumentFile`, `createDocument`, etc.) — el bug era
puramente de validación/UX en el formulario, no de la carga a Storage.

### 18.4 Notificaciones de Semáforo

Confirmado el estado documentado en la sección 16.6: **no implementadas**. Se revisó que ningún texto
de la UI (`CuartelDetallePage`, `CuartelesPage`, `PanelPage`, `lib/api/compliance.ts`) sugiera que
existen. No se implementó nada nuevo esta tanda — avisar al `jefe_cuerpo_activo` cuando su cuartel
queda en rojo, con cadencia controlada y opt-out, requiere diseño real (cuándo se considera "recién
cayó a rojo" vs. "sigue en rojo", ventana mínima entre avisos, tabla de opt-out) que no encaja en un
fix rápido de esta tanda — sigue siendo trabajo de una tanda futura, documentado en la sección 16.6.

### 18.5 Papelera de Documentos — verificación

Revisado el flujo completo (`lib/api/documents.ts`, `PapeleraDocumentosPage.tsx`,
`purge-documents/index.ts`) sin encontrar regresiones: `fetchDocuments`/`fetchDocumentsByFolder`
filtran `deleted_at is null` correctamente (documentos en papelera no aparecen en listados normales),
`fetchTrashedDocuments` filtra lo opuesto, `trashDocument`/`restoreDocument` usan el `UPDATE` con el
mismo alcance de permisos que editar, `purgeDocuments` llama a la Edge Function que borra Storage
antes que las filas, y el cron `siger4-document-purge` sigue documentado en la sección 17. Sin cambios
en esta tanda — el módulo funciona como se documentó al implementarlo.

### 18.6 Migración nueva

- `0054_reassert_compliance_security_invoker.sql` — `ALTER VIEW station_compliance SET
  (security_invoker = true)` puntual (no repite la definición completa de la vista, para no arriesgar
  que diverja de 0052 si alguna se edita a mano sin la otra). Defensivo: no cambia comportamiento si
  la opción nunca se perdió, pero blinda contra el riesgo documentado en 18.2 si alguna vez se editó la
  vista desde el Dashboard en vez de por migración.

### 18.7 Edge Functions / Vercel

Ninguna Edge Function nueva ni modificada. Vercel: sí, verificar/redeploy — cambios de frontend en
`EventoCalendarioFormPage.tsx`, `CalendarioPage.tsx`, `CarpetaFormPage.tsx`, `DocumentoFormPage.tsx`.

### 18.8 Checklist de verificación

- [ ] Correr `0054_reassert_compliance_security_invoker.sql` y confirmar con `select relname,
      reloptions from pg_class where relname = 'station_compliance';` que `reloptions` incluye
      `security_invoker=true`.
- [ ] Como `jefe_cuerpo_activo`/`usuario_carga_cuartel` cuyo cuartel esté asignado vía `user_scopes`
      (no `profiles.station_id`): crear un evento de tipo "Cuartel" desde `/calendario/nuevo`,
      confirmar que se crea sin error y que el filtro "Mi cuartel" en `/calendario` lo muestra.
- [ ] Mismo usuario: crear una carpeta de documentos desde `/documentos/carpetas/nueva` con alcance
      "Cuartel", confirmar que se crea sin pedir seleccionar un cuartel que no tiene forma de elegir.
- [ ] Mismo usuario: entrar a `/cuarteles` y a `/cuarteles/:id` de su propio cuartel, confirmar que ve
      el badge/motivos del semáforo.
- [ ] En `/documentos/nuevo`: dejar el título vacío, seleccionar un archivo, hacer click en Guardar,
      confirmar que aparece un mensaje claro sobre el título (no sobre el archivo) y que corregirlo
      permite continuar. Luego repetir sin dejar nada vacío, confirmar que "Archivo seleccionado: ..."
      aparece apenas se elige el archivo.
- [ ] Revisar la consola del navegador durante estos pasos, confirmar que no aparecen errores 400/403
      nuevos.

## 19. Fix real de carga de archivos en mobile/PWA (2026-08)

### 19.1 ¿Había recarga/remount real en mobile?

**Sí, confirmado.** No es un bug de este código — es el comportamiento estándar de Android/Chrome con
una PWA instalada: al abrir el selector nativo de archivos (`<input type="file">`), Android puede
matar el proceso de la PWA en background para liberar memoria (comportamiento normal del sistema
operativo con cualquier WebView/pestaña en segundo plano, no específico de esta app). Cuando el usuario
vuelve a la PWA, el navegador hace una **recarga completa de la página** (no un resume) — se pierde
**todo** el estado de JavaScript en memoria, incluido cualquier `File` guardado en estado de React,
aunque la URL/ruta siga siendo la misma. Esto pasa **antes** de que corra cualquier lógica propia de la
app (React Router, `ProtectedRoute`, el service worker) — es una recarga real del `document`, no algo
arreglable ajustando el ruteo o el ciclo de vida de componentes. En desktop el mismo síntoma puede
aparecer si el navegador descarga la pestaña por memoria al cambiar de pestaña por un rato largo,
aunque es mucho menos frecuente que en mobile.

### 19.2 Causa exacta (una vez confirmado que la recarga es real e inevitable)

El diseño anterior guardaba el archivo elegido **solo** en un `<input type="file">` + estado de React
(`file`), sin persistir nada hasta el click final en "Guardar" — que requería antes completar
título/categoría/alcance. Esa ventana (elegir archivo → completar el resto del formulario → guardar)
es exactamente donde puede caer la recarga de Android, perdiendo el archivo sin ningún aviso más que
"tenés que elegir un archivo" al reintentar guardar — un mensaje técnicamente correcto en ese momento,
pero que no explica que el archivo YA HABÍA sido elegido y se perdió por la recarga.

### 19.3 Qué se corrigió: subida inmediata al elegir el archivo

Se rediseñó el flujo de `DocumentoFormPage.tsx` para que el archivo se suba **apenas se selecciona**,
no en el submit final:

- El campo "Alcance" pasa a completarse **antes** de adjuntar el archivo (con un aviso explícito en la
  UI) — hace falta porque `documents_single_scope` exige que la fila tenga un alcance real desde el
  insert, y la policy de `INSERT` (`documents_insert_admin_regional_station`) no tiene ninguna rama que
  permita crear una fila "sin alcance todavía" para completar después salvo para `informatica_r4`. No
  se relajó esa policy (seguiría siendo un hueco de seguridad real) — se ajustó el orden del formulario
  en su lugar.
- Al elegir un archivo (`onChange` del `<input type="file">`), si es la primera vez en esta carga:
  1. Crea la fila real de `documents` con el alcance ya elegido, y con título/categoría por defecto
     tomados del nombre del archivo (o "Sin categorizar") si el usuario todavía no los escribió —
     nunca se manda un valor vacío (`title`/`category` son `NOT NULL`).
  2. Sube el archivo a Storage y actualiza `storage_path` de inmediato.
  3. Todo esto pasa en los segundos entre que el usuario elige el archivo en el picker nativo y vuelve
     a la pantalla — el archivo ya está a salvo en Storage/DB antes de que exista ninguna chance de que
     Android recargue la página por haber estado en segundo plano mientras el picker estaba abierto (el
     riesgo de recarga es mientras la PWA está en background, con el picker encima — no mientras corre
     en foreground ejecutando el `onChange`).
  4. El botón "Guardar" final pasa a ser solo un `UPDATE` de título/categoría/descripción/alcance sobre
     la fila que ya existe — nunca vuelve a depender del archivo, que ya está subido.
- Si el usuario elige un archivo distinto antes de guardar (se arrepiente), el archivo anterior se
  archiva como versión (mismo mecanismo que reemplazar un archivo en modo edición) y el nuevo lo
  reemplaza — sin duplicar filas.
- El `<input type="file">` se limpia (`e.target.value = ''`) después de cada selección, para poder
  elegir el mismo archivo dos veces seguidas si una subida falló y hay que reintentar.
- Se corrigió también un bug en el diseño intermedio de este mismo fix (detectado en revisión propia
  antes del commit, nunca llegó a producción): el registro de versión anterior al reemplazar un archivo
  usaba una condición distinta según si la fila venía de "editar un documento existente" o de "ya subí
  un archivo en esta misma carga nueva", y la segunda rama nunca versionaba correctamente. Se unificó
  bajo un solo estado (`existingStoragePath`) que se mantiene al día en ambos casos.

### 19.4 Qué pasa si el usuario cancela sin terminar (evitar huérfanos)

No se creó ningún mecanismo nuevo de limpieza — **no hace falta**. Dos casos posibles:

- **El archivo nunca llega a subirse** (falla entre crear la fila y terminar el upload — ej. la
  recarga de Android pasa justo en esos milisegundos, o falla la red): la fila queda con
  `storage_path='pending'`, exactamente el mismo estado que el código ya sabía limpiar desde antes
  (`cleanup_pending_documents`, 0033 — barrido de filas `pending` de más de 24hs, solo
  `informatica_r4`, con el mismo banner en `/documentos` que ya existía). No se tocó esa función ni el
  banner — siguen cubriendo este caso sin cambios.
- **El archivo se sube pero el usuario abandona sin completar título/categoría reales**: la fila queda
  con el título por defecto (nombre del archivo) y "Sin categorizar" — es un documento real, visible,
  con un archivo real asociado, no un huérfano en el sentido técnico (no hay ninguna fila sin archivo
  ni ningún archivo sin fila). Es exactamente el mismo tipo de estado "a medio completar" que ya
  aceptaba el resto del sistema en otros formularios con valores por defecto — no se agregó ninguna
  limpieza especial para esto porque no hay nada roto que limpiar, solo un título genérico que
  cualquiera con permiso puede corregir después editando el documento.

No se creó ninguna migración para este fix — no hizo falta ningún cambio de schema, RLS, ni función de
Postgres. El comportamiento de `createDocument`/`storage_path='pending'` es exactamente el mismo que
ya existía.

### 19.5 Papelera y versiones — sin impacto

Confirmado que el nuevo flujo no interactúa con la Papelera (sección 17) más allá de lo esperado: un
documento creado por este flujo se comporta igual que cualquier otro documento al enviarlo a
papelera/restaurarlo/purgarlo. El historial de versiones (`document_versions`) sigue funcionando igual
— la corrección de la sección 19.3 fue justamente para que el versionado funcionara correctamente
también en el caso nuevo de "cambiar de archivo antes del primer guardado".

### 19.6 Migraciones / Edge Functions / Vercel

Ninguna migración nueva, ninguna Edge Function nueva ni modificada. Vercel: sí, verificar/redeploy —
cambio de frontend en `DocumentoFormPage.tsx` únicamente.

### 19.7 Checklist de verificación

- [ ] **Desktop**: crear un documento nuevo, elegir alcance, adjuntar archivo, confirmar que aparece
      "Archivo subido: ..." (no "Subiendo…" colgado), completar título/categoría, guardar. Confirmar
      que el documento aparece correctamente en la carpeta.
- [ ] **Desktop**: repetir el flujo pero cambiar de pestaña del navegador entre elegir el archivo y
      guardar — al volver, confirmar que el archivo sigue marcado como subido (no pide elegir de
      nuevo).
- [ ] **Mobile (Android/Chrome, PWA instalada)**: el caso real reportado — abrir "Nuevo Documento",
      elegir alcance, tocar "Archivo adjunto", elegir un archivo desde el selector nativo (Archivos,
      Galería, Drive), confirmar que al volver a la app aparece "Archivo subido: ..." sin haber tenido
      que reintentar. Completar el resto y guardar.
- [ ] **Mobile**: si es posible forzar que Android mate la app en background (abrir varias apps pesadas
      antes de volver, o esperar unos minutos con el selector abierto), confirmar que aun si la PWA se
      recarga al volver, el documento ya quedó creado con el archivo real (visible en `/documentos` con
      el título por defecto) — no se pierde el archivo aunque se pierda el resto del formulario sin
      completar.
- [ ] Confirmar que reemplazar el archivo de un documento en edición sigue archivando la versión
      anterior correctamente (`fetchDocumentVersions` debe mostrarla).
- [ ] Confirmar que elegir un archivo, después elegir OTRO antes de guardar, no deja dos documentos
      creados — solo uno, con el segundo archivo y el primero archivado como versión.
- [ ] Revisar la consola del navegador durante estos pasos (desktop y mobile), confirmar que no
      aparecen errores 400/403 nuevos.

## 20. UI mobile compacta + MIME de mobile + diagnóstico real de push (2026-08)

Freno de funciones nuevas para atacar tres bugs reales de producción/PWA mobile: tarjetas
ilegibles en mobile, carga de documentos que seguía sin funcionar en algunos casos, y push que
dejó de llegar. Se investigó de punta a punta (código real, no solo repetir el diagnóstico
anterior) antes de tocar nada.

### 20.1 UI mobile: causa y rediseño

**Causa:** Documentos, Carpetas/detalle de carpeta, Notificaciones y Papelera usaban layouts
`flex` armados a mano con estilos inline en cada pantalla — sin truncado de texto, sin que la fila
de botones supiera achicarse o bajar de línea en pantallas angostas. En mobile esto se traducía en
títulos partidos letra por letra, botones estirados a lo ancho, y tarjetas con `padding` de
escritorio ocupando media pantalla — exactamente lo que se ve en la captura de "General" con el
documento "Manual de Uso del Sistema SIGER4".

**Qué se hizo:** se creó un patrón compartido nuevo en `src/styles.css` (`.list-item`,
`.list-item-icon`, `.list-item-body`, `.list-item-title`/`.list-item-subtitle` con
`-webkit-line-clamp` a 2 líneas + ellipsis, `.list-item-meta`, `.list-item-actions`) y se aplicó en
[DocumentosPage.tsx](src/pages/DocumentosPage.tsx), [CarpetaDetallePage.tsx](src/pages/CarpetaDetallePage.tsx),
[NotificacionesPage.tsx](src/pages/NotificacionesPage.tsx) y [PapeleraDocumentosPage.tsx](src/pages/PapeleraDocumentosPage.tsx)
(mismo patrón, ver enunciado "cualquier card similar"). En mobile (`<600px`) las acciones pasan a
una segunda fila con separador en vez de angostar el texto. `.card-solid` también reduce su
padding en mobile (18px → 12px) para que las tarjetas se sientan compactas sin cambiar su uso en
formularios. Modo oscuro no se tocó (usa las mismas variables `--color-*` de siempre, ninguna
regla nueva es específica de tema).

**Limitación de esta verificación:** se confirmó por build limpio (`tsc` + `vite build`) y por
lectura de las reglas CSS aplicadas (line-clamp, flex-wrap, min-width:0 para que el truncado
funcione dentro de flex). No se pudo tomar una captura real de la app corriendo porque requiere
sesión autenticada contra Supabase — pido que se revise visualmente en el celular real antes de
darlo por cerrado.

### 20.2 Documentos: causa real confirmada (no repetición del diagnóstico anterior)

El fix anterior (subida inmediata al elegir archivo) es correcto y sigue vigente, pero no alcanzaba
para cerrar el problema. Revisando de punta a punta encontré una causa concreta adicional:

**El bucket de Storage "documents" solo aceptaba, server-side, pdf/doc/docx/xls/xlsx/png/jpeg**
(`allowed_mime_types` en `storage.buckets`, ver 0033_storage_hardening.sql). Una foto elegida desde
la galería de un celular llega habitualmente como `image/heic`/`image/heif` (formato por defecto
de cámara en iPhone) o `image/webp` (capturas de pantalla en Android moderno, algunas apps de
galería) — ninguno estaba permitido. Supabase Storage rechaza esos uploads en el servidor antes de
guardar nada. El error SÍ se propagaba hasta la pantalla (no era un fallo silencioso a nivel de
red), pero el mensaje crudo de Storage no comunicaba con claridad "elegiste un tipo de archivo no
soportado, probá con otro" — se confundía fácilmente con "no funciona".

**Qué se corrigió:**
- **Migración 0055** amplía `allowed_mime_types` del bucket `documents` para sumar
  `image/webp`, `image/heic`, `image/heif` (mismo criterio explícito de whitelist, no se abre a
  tipos genéricos).
- [storage.ts](src/lib/api/storage.ts): el whitelist client-side ahora coincide exactamente con el
  server-side. Se agregó además inferencia de MIME por extensión de archivo para el caso (real en
  Android) donde ciertos selectores de archivo devuelven `file.type` vacío — antes eso bloqueaba la
  subida client-side aunque el archivo fuera perfectamente válido y Storage lo hubiera aceptado. El
  mensaje de error de tipo no permitido ahora nombra los formatos aceptados explícitamente.
- [DocumentoFormPage.tsx](src/pages/DocumentoFormPage.tsx): se reemplazó el booleano
  `uploadingFile` por un estado explícito de 4 valores (`idle`/`uploading`/`done`/`failed`) con los
  tres mensajes pedidos ("Subiendo archivo…", "✓ Archivo subido correctamente: …", "No se pudo
  subir el archivo: motivo — elegilo de nuevo para reintentar"). Se corrigió además un gap real: si
  la creación de la fila en `documents` tenía éxito pero la subida del archivo fallaba después
  (red, MIME rechazado, tamaño excedido), el formulario anterior igual dejaba habilitado
  "Guardar" — permitiendo guardar metadatos sobre un documento que técnicamente seguía en
  `storage_path='pending'`, sin archivo real. Ahora el botón "Guardar" queda deshabilitado mientras
  `uploadStatus` no sea `'done'`, con una nota visible de por qué. Un documento en edición que ya
  estaba en `'pending'` (carga anterior interrumpida) arranca igual bloqueado hasta adjuntar un
  archivo real. La recuperación de un pending fallido es "elegir el archivo de nuevo": la fila ya
  existe y se reintenta sobre la misma (no crea una segunda), y si se abandona,
  `cleanup_pending_documents()` (0033, sin cambios) lo sigue barriendo a las 24hs igual que antes.

**Lo que NO se pudo verificar:** no pude probar el flujo en un celular real (sin acceso a un
dispositivo). El mensaje "no se carga" original podía deberse a más de una causa a la vez (recarga
de la PWA + MIME rechazado, por ejemplo, si el usuario elegía justo una foto HEIC después de volver
del selector). Pido explícitamente: probar en un Android/iPhone real eligiendo una foto de la
galería (no solo un PDF) y reportar el mensaje exacto si algo sigue sin funcionar — con este cambio
cualquier fallo real ahora debería mostrar un mensaje de motivo específico en vez de un genérico.

### 20.3 Push: no se encontró una causa server-side rota — diagnóstico reforzado en su lugar

Se revisó de punta a punta: registro del service worker (`index.html` generado sí incluye
`registerSW.js`, confirmado en el build), `sw.ts` (listener de `push`/`notificationclick` sin
cambios problemáticos), manifest/iconos (los cambios recientes de icono/badge solo tocaron
imágenes y el propio `sw.ts`, no la lógica de suscripción), tabla `push_subscriptions` y sus RLS,
`send-push` y `send-push-system` (autorización server-side, deduplicación atómica por
`notification_id`, limpieza automática de suscripciones que devuelven 404/410 del servicio push).
**No encontré ningún bug confirmado en ese circuito backend** — el diseño ya limpia
suscripciones inválidas solo, y el error de cada intento queda registrado en `push_send_log`.

Como no se puede confirmar ni descartar el problema real solo leyendo código (el mecanismo
depende del navegador/OS del celular en el momento), se reforzó el diagnóstico visible en vez de
"arreglar a ciegas":

- [usePushNotifications.ts](src/hooks/usePushNotifications.ts): antes, `subscribed` salía
  únicamente de `pushManager.getSubscription()` — eso solo confirma que el navegador recuerda
  haberse suscripto alguna vez, no que esa suscripción siga siendo válida ni que
  `push_subscriptions` todavía tenga la fila (`send-push` la borra sola si el endpoint devuelve
  404/410). Ahora se confirma explícitamente contra la base
  (`hasActiveSubscriptionRow`) y se expone un estado (`diagnostic`) con 5 valores reales: `active`,
  `denied`, `not_subscribed`, `stale` (suscripción local sin fila en la base — el caso más probable
  de "antes llegaban, ahora no"), `no_worker`.
- [AjustesPage.tsx](src/pages/AjustesPage.tsx): muestra ese estado como badge, y agrega un botón
  explícito **"Reactivar notificaciones push"** (cuando el estado es `stale`) o **"Re-suscribir
  este dispositivo"** (siempre disponible si ya está activo, por si el usuario sospecha que dejó de
  funcionar sin que el estado lo detecte) — `reactivate()` siempre desuscribe lo que haya local y
  pide una suscripción/endpoint nuevo, sin reutilizar uno potencialmente inválido.
- El botón **"Probar notificación"** ahora, además de crear la notificación interna, invoca
  `send-push` directamente (`triggerPushDiagnostic`) y muestra el resultado real: cuántos
  dispositivos recibieron el push, si fue deduplicado (otra pestaña ya lo había enviado — no es un
  error), o el motivo exacto si falló. Antes esa prueba solo confirmaba la notificación interna —
  exactamente el caso que se pidió detectar ("crea notificación interna pero no push real") ahora
  se distingue explícitamente en pantalla.

**Qué tenés que hacer vos:** entrar a Ajustes en el celular donde antes llegaban las push y mirar
el badge de estado. Si dice "Suscripción inválida — necesita reactivarse", tocar "Reactivar
notificaciones push" resuelve el caso más probable (endpoint vencido o PWA reinstalada). Si dice
"Push activo" y aun así no llegan, usar "Probar notificación" y pasarme el mensaje exacto que
aparece debajo del botón — con eso puedo confirmar si el problema está en el envío (backend) o en
la entrega (navegador/OS del celular, fuera del control de la aplicación).

### 20.4 Migraciones / Edge Functions / Vercel

- **Migración nueva:** `0055_documents_mime_mobile.sql` — correr con el flujo normal de
  migraciones (`supabase db push` o el mecanismo que uses para aplicar migraciones nuevas al
  proyecto).
- **Edge Functions:** ninguna modificada. No hace falta redesplegar `send-push`,
  `send-push-system` ni `purge-documents`.
- **Vercel:** sí, redeploy del frontend (cambios en varios `.tsx`/`.ts`/`styles.css`, sin cambios
  de variables de entorno).
- **PWA/celular:** no hace falta reinstalar la PWA para este cambio. Si el diagnóstico de push
  muestra "Suscripción inválida", usar el botón nuevo de reactivación alcanza — no requiere
  desinstalar/reinstalar la app.

### 20.5 Checklist de verificación

- [ ] **UI mobile**: abrir Documentos → carpeta General en un celular real, confirmar que las
      tarjetas se ven compactas, el título nunca ocupa más de 2 líneas, y los botones no ocupan
      todo el ancho. Repetir en Notificaciones y en la Papelera de documentos. Repetir en modo
      oscuro.
- [ ] **Documentos — foto real de galería**: desde un Android o iPhone, crear un documento nuevo y
      adjuntar una foto elegida de la galería (no un PDF) — confirmar que sube y muestra "✓
      Archivo subido correctamente". Si falla, confirmar que el mensaje de error ahora explica el
      motivo (tipo no permitido / tamaño excedido / red) en vez de quedar genérico.
- [ ] **Documentos — recuperación de un pending fallido**: forzar un error (ej. apagar el wifi a
      mitad de subida), confirmar que "Guardar" queda deshabilitado con la nota explicando por qué,
      y que elegir el archivo de nuevo lo recupera sin crear un documento duplicado.
- [ ] **Push — diagnóstico**: entrar a Ajustes, confirmar que el badge de estado coincide con la
      realidad (probar desactivando el permiso del navegador y viendo que pasa a "Permiso
      denegado"). Probar "Reactivar notificaciones push" si aparece. Probar "Probar notificación" y
      confirmar que el mensaje de resultado del push (no solo el de la notificación interna)
      aparece y es coherente.

## 21. Rediseño de carga de documentos en 2 pasos + causa real de Word/PDF (2026-08)

El fix anterior (subida inmediata al elegir archivo, sección 19) resolvía la pérdida del `File` por
recarga de Android, pero tenía un problema de diseño real: el documento quedaba creado y visible en
listados normales apenas se elegía el archivo, con título/tipo por defecto muchas veces
incompletos. Y Word/PDF seguían fallando en algunos celulares aunque el whitelist de MIME ya
incluyera esos formatos (sección 20). Este cambio corrige ambos problemas de fondo, sin agregar
ningún módulo nuevo ni columna de estado — no hizo falta migración de schema.

### 21.1 Causa real de que Word/PDF no subieran (no era el whitelist)

`application/pdf` y los MIME de Word/Excel estuvieron en el whitelist del bucket desde la migración
0033 original — nunca fue la causa de que esos formatos específicos fallaran. La causa real tiene
dos partes, ambas confirmadas leyendo el código de `@supabase/storage-js` (no solo inferidas):

1. **Selectores de archivo de Android frecuentemente reportan un MIME genérico, no vacío.**
   Google Files, adjuntos compartidos desde WhatsApp/Drive/Gmail y otros gestores de almacenamiento
   suelen devolver `file.type = "application/octet-stream"` para archivos Word/PDF perfectamente
   válidos — no vacío (que sí estaba cubierto por el fallback anterior), sino un valor genérico
   presente. La validación anterior solo activaba el fallback por extensión cuando `file.type` era
   la cadena vacía, así que estos archivos se rechazaban client-side con "tipo no permitido:
   application/octet-stream", leyéndose como "Word/PDF no funciona".
2. **El Content-Type real que llega a Storage no es el que valida esta app, sino el que trae el
   `File` del navegador.** `supabase-js` arma un `FormData` y pasa el `File` directo; el navegador
   arma el `Content-Type` de esa parte multipart a partir de `file.type` — el `contentType` que se
   le pase explícito a `.upload()` solo se usa en la rama que NO es `Blob`/`File`. Aunque la
   validación client-side ya infería correctamente el tipo por extensión, ese tipo inferido nunca
   llegaba a Storage: el servidor seguía viendo `application/octet-stream` y rechazándolo con el
   `allowed_mime_types` real, sin importar que el whitelist ya incluyera Word/PDF.

**Qué se corrigió** ([storage.ts](src/lib/api/storage.ts)):
- `inferMimeType` ahora trata como "no confiable" tanto el tipo vacío como una lista de genéricos
  conocidos (`application/octet-stream`, `application/binary`, `application/unknown`) — en esos
  casos la extensión del archivo manda.
- `assertFileAllowed` devuelve el MIME resuelto, y los tres uploads (`uploadDocumentFile`,
  `uploadAvatar`, `uploadStationMedia`) ahora pasan ese valor explícito como `contentType` en las
  opciones de `.upload()` — así lo que Storage valida server-side es exactamente lo mismo que esta
  app ya aprobó, nunca el genérico original del navegador.

### 21.2 Rediseño: carga en 2 pasos, sin documentos incompletos

[DocumentoFormPage.tsx](src/pages/DocumentoFormPage.tsx) para carga nueva (no edición) ahora tiene
dos pasos reales, separados en la UI ("Paso 1 de 2 — Datos del documento" / "Paso 2 de 2 —
Archivo"):

- **Paso 1 — Datos del documento**: título, tipo y alcance obligatorios (descripción opcional). No
  se crea ninguna fila en `documents` todavía. Al confirmar ("Continuar: elegir archivo"), los
  metadatos se guardan como borrador en `sessionStorage` (nunca el `File`, solo texto) y se pasa al
  Paso 2.
- **Paso 2 — Archivo**: recién acá, al elegir el archivo, se crea la fila real en `documents` (con
  los metadatos ya validados del Paso 1) y se sube el archivo de inmediato — mismo mecanismo de
  "subida apenas se elige" de la sección 19, pero ahora con metadatos completos desde el primer
  instante en vez de valores por defecto genéricos.

**Por qué la fila se sigue creando antes de que termine el upload (no se pudo evitar del todo):**
la policy de Storage `documents_storage_write_admin_regional_station` exige que el path del archivo
resuelva a una fila ya existente en `documents` — es una restricción real de RLS, no una elección de
diseño, así que no hay forma de subir el archivo antes de que la fila exista. Lo que sí se corrigió
es que esa fila transitoria nunca sea visible como documento válido:

- `fetchDocuments()`/`fetchDocumentsByFolder()` ahora excluyen explícitamente
  `storage_path = 'pending'` — ver [documents.ts](src/lib/api/documents.ts). Un documento con
  archivo todavía no confirmado no aparece en ningún listado normal, sin importar cuánto tarde el
  usuario en completar el resto.
- Nueva `fetchPendingDocuments()`, usada solo por el banner de informática en
  [DocumentosPage.tsx](src/pages/DocumentosPage.tsx) — ahora con un botón "Ver detalle" que lista
  título/tipo/fecha de cada documento pendiente antes de limpiarlo (antes solo mostraba un número).
  La limpieza sigue siendo la misma función ya existente (`cleanup_pending_documents()`, RPC de
  0033, solo informática, solo filas de +24hs) — no se creó ningún mecanismo nuevo de borrado ni se
  le dio al cliente permiso para hacer `DELETE` directo (`documents_delete_informatica` sigue
  exigiendo `deleted_at is not null`, o sea vía Papelera — coherente con no crear una vía paralela
  de borrado).
- El botón "Guardar" final (que recién en ese momento confirma/actualiza los metadatos por si
  cambiaron) solo se habilita cuando `uploadStatus === 'done'` — igual que en el fix anterior, pero
  ahora también aplica en el flujo de creación nueva de punta a punta.

**Recuperación ante recarga de Android en cualquier punto del Paso 2:** el borrador de
`sessionStorage` guarda también el id de la fila `pending` apenas se crea (antes de que termine el
upload). Si la página se recarga en ese punto, al volver a `/documentos/nuevo` se recupera el
borrador, se salta directo al Paso 2 con la fila ya conocida (no crea una segunda), y se le pide al
usuario que vuelva a elegir el archivo — con un aviso explícito de que se recuperó una carga
interrumpida. Si el usuario vuelve al Paso 1 a corregir algo después de que la fila ya existía, esa
corrección se sincroniza contra la fila existente en el próximo intento de subida (no queda con los
metadatos del primer intento).

### 21.3 Mensajes de estado (tal como se pidió)

- Antes de elegir alcance/archivo: mensajes de validación propios del Paso 1 ("Ingresá un título
  para el documento.", "Completá el alcance...").
- Al elegir archivo: "Subiendo archivo…" (con spinner).
- Al terminar bien: "✓ Archivo subido correctamente: <nombre> (<tamaño>)".
- Si falla: "No se pudo subir el archivo "<nombre>": <motivo real de Storage>. Elegilo de nuevo para
  reintentar." — el motivo ya no es genérico gracias al fix de MIME/contentType de 21.1.

### 21.4 Papelera y versiones — sin impacto

Sin cambios en `trashDocument`/`restoreDocument`/`purgeDocuments` ni en `fetchTrashedDocuments`
(sigue sin filtrar por `storage_path` a propósito: un documento no puede llegar a la Papelera sin
haber tenido primero un archivo real, porque la acción de "enviar a papelera" solo está disponible
sobre documentos ya visibles/completos). El historial de versiones sigue igual —
`addDocumentVersion` se sigue llamando en el mismo punto del flujo, ahora también re-sincronizando
metadatos si corresponde (ver 21.2).

### 21.5 Migraciones / Edge Functions / Vercel

- **Migración nueva:** ninguna. Se evaluó agregar una columna `status` (`draft`/`active`) pero no
  hacía falta: la exclusión por `storage_path = 'pending'` ya distingue completo de incompleto sin
  tocar el schema.
- **Edge Functions:** ninguna modificada.
- **Vercel:** redeploy del frontend.
- **Supabase:** nada que correr — si la migración 0055 (whitelist MIME mobile, sección 20) todavía
  no se aplicó, aplicarla igual sigue siendo necesaria para HEIC/WebP, pero no es la causa de que
  Word/PDF fallaran (ver 21.1).

### 21.6 Checklist de verificación

- [ ] **Flujo nuevo completo**: `/documentos/nuevo` → completar título/tipo/alcance → "Continuar:
      elegir archivo" → elegir un PDF o .docx real desde el almacenamiento del celular (no desde la
      cámara) → confirmar "✓ Archivo subido correctamente" → "Guardar" → el documento aparece en el
      listado con el título y tipo reales, no genéricos.
- [ ] **Word/PDF específicamente desde Android**: elegir un .docx o .pdf desde un gestor de
      archivos de Android (no Chrome desktop) — confirmar que sube sin el error de tipo MIME.
- [ ] **Documento incompleto no debe aparecer**: en el Paso 2, después de elegir alcance pero ANTES
      de terminar de subir el archivo (o si se cancela/cierra la app en ese punto), confirmar que
      el documento NO aparece en `/documentos/carpetas/general` ni en ningún listado para otros
      usuarios.
- [ ] **Recuperación de recarga en Paso 2**: completar Paso 1, pasar a Paso 2, forzar una recarga
      manual del navegador (F5) antes de elegir el archivo — confirmar que al volver a
      `/documentos/nuevo` aparece el aviso de carga recuperada y los datos del Paso 1 siguen
      completos (no hace falta reescribirlos).
- [ ] **Panel de pendientes de informática**: con un usuario `informatica_r4`, en `/documentos`
      confirmar que el banner de pendientes muestra "Ver detalle" con título/tipo/fecha de cada
      documento pendiente, y que "Limpiar pendientes de +24hs" sigue funcionando.
- [ ] Confirmar que Papelera y versiones siguen funcionando igual que antes (sin cambios
      esperados).
