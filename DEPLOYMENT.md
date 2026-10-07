# SIGER4 — Guía de despliegue (Supabase + Vercel)

**→ Para preparar una puesta en marcha real (v1.0 beta), ver la sección 31 ("SIGER4 v1.0 beta — puesta
en marcha") al final de este documento: checklist completo de configuración, datos mínimos a cargar,
matriz de permisos final y checklist de prueba manual.**

## 0. Checklist rápido antes de desplegar

Si ya tenés un proyecto de Supabase funcionando y solo querés confirmar que está todo al día antes
de un deploy a Vercel, revisá esto (el detalle de cada paso está en las secciones siguientes):

- [ ] **Migraciones**: todas las migraciones de `supabase/migrations/` corridas en orden, desde
      `0001` hasta la última numerada (`0079` al momento de escribir esto — la numeración solo
      crece, confirmá el número más alto real en la carpeta antes de dar por completo este paso).
      Ver sección 1.2 para el detalle de las primeras 24; el resto se documentó incrementalmente en
      las secciones 16 en adelante, cada una con su propio número de migración en el título.
- [ ] **RLS activo**: todas las tablas con el ícono de RLS en verde en **Table Editor** (sección 1.3).
- [ ] **Variables de entorno del frontend**: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` y
      `VITE_VAPID_PUBLIC_KEY` configuradas en Vercel (Production, Preview y Development) — nunca la
      `service_role` ni la clave privada VAPID.
- [ ] **Buckets de Storage**: `station-media` y `avatars` (públicos), `documents` y
      `school-avales` (privados) — se crean solos al correr las migraciones 0017/0019/0095, pero
      conviene confirmar en **Storage** que existen y tienen la visibilidad correcta.
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
supabase functions deploy send-push-system --no-verify-jwt
```

> **⚠️ `send-push-system` SIEMPRE necesita `--no-verify-jwt`.** La función nunca lee ni valida un
> JWT de usuario (ver su código: la única autorización real es el header `x-cron-secret` contra
> `CRON_SHARED_SECRET`) — la invoca `pg_net` desde `dispatch_notification_push()`, que solo manda
> `Content-Type` y `x-cron-secret`, nunca `Authorization: Bearer <jwt>`. Si se despliega sin este
> flag (el comportamiento por default de `supabase functions deploy`, y este proyecto no tiene
> `supabase/config.toml` que lo cambie), el **gateway de Supabase Edge Functions** rechaza la
> llamada con 401 *antes* de que el código de la función se ejecute — un 401 que ningún cambio en
> `cron_shared_secret` puede arreglar, porque la comparación del secreto nunca llega a correr. Ver
> sección 51 para cómo distinguir este 401 (del gateway) de un 401 real de `x-cron-secret`
> desincronizado.

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

**Paso 2 — Configurar la URL del proyecto y el secreto compartido.**

> **⚠️ Desde 2026-08-12, esto YA NO se hace con `alter database ... set ...` ni con
> `select set_system_setting(...)` en el SQL Editor.** El primer procedimiento (documentado
> originalmente en esta sección) requiere privilegios de superusuario/owner sobre la base de datos,
> que el rol del SQL Editor de Supabase no tiene (`ERROR: 42501: permission denied to set parameter
> "siger4.project_url"`). El segundo (agregado como fix del primero) también falla desde el SQL
> Editor, por un motivo distinto: esa sesión no tiene el JWT de ningún usuario de la app
> (`ERROR: P0001: Solo informatica_r4 puede modificar la configuracion del sistema.`, aunque tu
> usuario real SÍ sea `informatica_r4`). Ninguno de los dos es un problema de este proyecto puntual —
> son limitaciones estructurales de cualquier proyecto Supabase gestionado. Ver sección 33 (rondas
> 2026-08-12) para el detalle completo y el mecanismo definitivo: una sección en la propia app
> (`/ajustes`), que sí corre bajo tu sesión real.

A partir de las migraciones `0073`/`0074`, la config vive en una tabla (`system_settings`, protegida
por RLS — solo `informatica_r4`), leída por las funciones de cron vía `get_system_setting(key)`, y
escrita únicamente desde una sección nueva en la app:

1. `project_url` ya queda insertada por la propia migración `0073` (no es secreta, viaja en claro en
   cada request de todos modos) — confirmá que el valor coincide con tu proyecto real, y si no,
   corregilo, ambos desde `/ajustes` → "Configuración del sistema" (solo visible para
   `informatica_r4`).
2. **`cron_shared_secret` sí es secreto — no viene precargado, hay que configurarlo a mano**:
   1. Generá o reutilizá un valor y configuralo como secreto de la Edge Function:
      ```
      npx supabase secrets set CRON_SHARED_SECRET="un-valor-largo-y-aleatorio"
      ```
   2. Entrá a la app como `informatica_r4` → `/ajustes` → "Configuración del sistema" → pegá
      exactamente el mismo valor en "Secreto compartido de cron" y guardá.
   **Deben ser exactamente el mismo valor en los dos lugares** — si no coinciden, `send-push-system`
   responde 401 y el recordatorio se crea como notificación interna pero nunca llega como push. Una
   vez guardado, no hay forma de volver a ver el valor (ni desde la UI ni por SQL) — solo se puede
   confirmar indirectamente que está configurado, ver la sección 33.5.

**Paso 3 — Correr `0036_weekly_reminder_cron.sql`** (después de los pasos 1 y 2. Si tu proyecto ya
tiene migraciones posteriores a `0074` aplicadas, `system_settings`/`get_system_setting`/la sección de
Ajustes ya existen desde antes de este paso — el orden solo importa la primera vez que se configura un
proyecto nuevo).

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

Si `send_weekly_reminder()` no encuentra `project_url`/`cron_shared_secret` configurados en
`system_settings`, inserta las notificaciones igual pero loguea un `WARNING` (visible en Database →
Logs) y no intenta el push — revisar ese warning si el push nunca llega pero la notificación interna
sí aparece en `/notificaciones`.

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

**Configuración de secretos**: reutiliza exactamente el secreto `CRON_SHARED_SECRET` de la Edge
Function y las claves `project_url`/`cron_shared_secret` de `system_settings` (ver sección 6.3 y 33)
— **los mismos que ya configuraste para el recordatorio semanal**, no hace falta nada nuevo. Si el
proyecto nunca configuró el recordatorio semanal, seguir los pasos exactos de la sección 6.3
(habilitar pg_cron/pg_net, `supabase secrets set CRON_SHARED_SECRET=...`, y guardar el mismo valor
desde `/ajustes` → "Configuración del sistema" logueado como `informatica_r4` — **no** desde el SQL
Editor, ver sección 33.3) antes de correr `0053`.

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

## 21. Carga de documentos desde mobile/PWA: pausada, decisión de producto (2026-08)

> **Actualización (2026-10-02):** la pausa se levantó. La carga desde el celular volvió a estar
> habilitada en Avales, Documentos y fotos; ver la sección 56.6. Lo que sigue queda como registro
> del diagnóstico.

**Decisión**: la carga y edición de archivos de Documentos queda disponible **solo desde
escritorio** hasta nuevo aviso. En mobile/PWA se puede seguir viendo, descargando, buscando y
administrando carpetas/papelera normalmente — lo único deshabilitado es elegir/subir/reemplazar el
archivo de un documento.

### 21.1 Por qué se pausa

Entre julio y agosto de 2026 se hicieron múltiples rondas de diagnóstico sobre un bug real y
reproducible: en ciertos dispositivos Android (confirmado en Chrome mobile y en el navegador propio
de Xiaomi/MIUI), el selector de archivos no devolvía ningún archivo al formulario de carga. Se
descartó, con evidencia directa en cada paso, una lista larga de causas candidatas: MIME/Storage/RLS,
service worker sirviendo JS desactualizado, `input.click()` programático vs. `<label>` real,
`setState` síncrono interrumpiendo el picker nativo, CSS/layout/overlay tapando el input, y synthetic
events de React vs. listeners nativos. Una página de control 100% fuera de React
(`raw-upload-test.html`, vanilla HTML/JS) demostró que el input nativo del sistema operativo
funcionaba perfecto en esos mismos dispositivos — pero ningún input dentro de ninguna ruta de React
probada (con o sin `AppShell`, con o sin wizard, con o sin `setState` en los handlers) llegó a
recibir ni siquiera el evento `click` de forma confiable, sin que se pudiera aislar una causa exacta
dentro de React pese a instrumentación exhaustiva (listeners nativos en paralelo, debug visual de
`getBoundingClientRect`/`elementFromPoint`/computed styles — todo limpio, el input igual no
respondía).

Se llegó a implementar una vía de carga alternativa fuera de React
(`document-upload-mobile.html`, segundo entry point de Vite reutilizando el cliente real de
Supabase) que si funcionaba en el dispositivo de prueba. Decisión de producto: en vez de mantener un
segundo camino de carga permanente (más superficie para mantener, más lugares donde un futuro cambio
puede romper algo), se prefiere pausar la carga mobile y mantener el módulo simple, hasta poder
volver con más tiempo/otra estrategia.

### 21.2 Qué se eliminó

Todo el código experimental de estas rondas se sacó del repositorio (no solo se ocultó):
`raw-upload-test.html`/`raw-upload-test.js` (página de control vanilla), `/diagnostico-upload` y
`DiagnosticoUploadPage.tsx` (página de diagnóstico React mínima), `document-upload-mobile.html` y
`src/document-upload-mobile/` (uploader vanilla alternativo), `uploadDiagnostics.ts` y
`UploadDiagnosticsPanel.tsx` (log persistente de eventos de carga), el plugin `buildInfoPlugin`/
`build-info.json` en `vite.config.ts` (solo existía para alimentar a las páginas de diagnóstico ya
eliminadas), el botón "Cargar archivo desde modo compatible mobile", y todo el wizard de 2 pasos +
borrador en `sessionStorage` + reintentos/avisos de "el navegador no devolvió ningún archivo" en
`DocumentoFormPage.tsx`.

**Se mantuvo** (no era parte del experimento, son fixes reales independientes): el registro manual
del service worker vía `virtual:pwa-register` en `main.tsx` (causa real de que updates no llegaran a
dispositivos ya instalados), el denylist de `.html` sueltos en el `NavigationRoute` de `src/sw.ts`
(bug real de Workbox, sigue siendo correcto aunque ya no haya HTML sueltos que proteger), y el
whitelist de MIME mobile-friendly de `0055_documents_mime_mobile.sql` (Storage sigue aceptando los
mismos tipos, la carga desde PC los necesita igual).

### 21.3 Qué quedó habilitado en escritorio

`DocumentoFormPage.tsx` se reescribió como un formulario de un solo paso (sin wizard, sin borrador,
sin reintentos especiales): completar título/tipo/alcance/descripción, elegir el archivo con un
`<input type="file">` estándar, un único botón "Guardar documento" que crea la fila, sube el archivo
a Storage y confirma `storage_path` en la misma acción. Editar un documento existente sigue el mismo
patrón (reemplazar archivo es opcional). PDF/DOCX/imágenes siguen validados contra el mismo whitelist
de MIME de siempre (`isDocumentMimeAllowed`, sin cambios).

### 21.4 Qué queda bloqueado en mobile

`DocumentoFormPage.tsx` detecta mobile por userAgent (`isMobileUserAgent()`, en `src/lib/device.ts`)
y, si es mobile, muestra una pantalla simple en vez del formulario: "La carga de documentos está
disponible solo desde PC. Desde el celular podés ver y descargar documentos, pero no cargar
archivos." con un link para volver a Documentos — sin crear ninguna fila, sin intentar subir nada,
sin ningún texto técnico de diagnóstico.

Los puntos de entrada a la carga también se ocultan en mobile (no solo la pantalla final, para no
llevar a alguien a un callejón sin salida):
- `DocumentosPage.tsx`: el ítem "Cargar archivo" del menú flotante "+" no aparece en mobile ("Crear
  carpeta" sigue disponible, no involucra archivos).
- `CarpetaDetallePage.tsx`: el botón flotante de "Cargar documento en esta carpeta" y el ícono
  "Editar" de cada documento no aparecen en mobile (editar nombre/descripción de la carpeta en sí,
  y enviar documentos a la papelera, siguen disponibles).

Ver/descargar documentos, carpetas, búsqueda, papelera y auditoría no tuvieron ningún cambio de
comportamiento en mobile.

### 21.5 Documentos `pending` de las pruebas de estas rondas

Cada ronda de diagnóstico que llegó a tocar "Subir archivo" pudo haber creado filas en `documents`
con `storage_path = 'pending'` (la fila se crea antes de que el archivo termine de subir, por
requisito de las políticas de Storage — ver `createDocument`). Estas filas nunca aparecen en ningún
listado normal (`fetchDocuments`/`fetchDocumentsByFolder` las excluyen siempre), pero pueden haberse
acumulado.

**No hizo falta ninguna migración ni script nuevo**: la herramienta de limpieza ya existía
(`cleanup_pending_documents(p_older_than_hours)`, migración `0033_storage_hardening.sql`, solo
`informatica_r4`) y ya estaba expuesta en la UI con vista previa antes de borrar — en
`/documentos`, el banner "Hay N documentos sin archivo subido" (visible para `informatica_r4`/
`integrante_informatica`) tiene un botón **"Ver detalle"** que lista título/categoría/fecha de cada
pendiente ANTES de tocar **"Limpiar pendientes de +24hs"**. Solo borra filas con
`storage_path = 'pending'` y más de 24hs de antigüedad — nunca un documento con archivo real.
**Acción recomendada**: entrar a `/documentos` con un usuario `informatica_r4`, revisar el detalle, y
correr la limpieza si aparecen pendientes de las pruebas de este período.

### 21.6 Migraciones / Edge Functions / Vercel

Ninguna migración nueva, ninguna Edge Function nueva, no hace falta ninguna acción manual en
Supabase. Redeploy normal del frontend en Vercel — el build ahora es de nuevo un solo entry point
(`index.html`), el precache del service worker bajó de 31 a 26 entradas (se sacaron las dos páginas
experimentales y `build-info.json`).

### 21.7 Fase futura

Si se retoma la carga mobile más adelante, el punto de partida ya documentado (y descartado por
ahora, no por invalidado) es `document-upload-mobile.html`: un entry point de Vite separado, sin
React/AppShell/Router, que reutiliza el cliente real de Supabase — funcionó en el dispositivo donde
se probó. Quedaría por resolver si vale la pena mantenerlo como segunda superficie permanente, o
seguir buscando la causa exacta por la que el input dentro de React no respondía en esos Android
puntuales.

## 22. Banner de novedades del sistema (2026-08)

> **Actualización (2026-10-03):** desde la sección 58.4 cada novedad tiene número de versión, la
> versión visible sale de `src/config/appUpdates.ts` y hay una página Novedades con el historial.

Sistema para avisar a los usuarios de cambios importantes al iniciar sesión — un banner flotante, no
invasivo, que aparece una sola vez por usuario por cada novedad publicada.

### 22.1 Cómo funciona

Tres piezas nuevas, cada una con una responsabilidad sola:
- **`src/config/appUpdates.ts`**: la fuente de contenido. Un array `APP_UPDATES` de objetos
  `{ id, date, title, description, changes[], severity }` — el **primer** elemento del array es la
  única novedad que se muestra en cada momento (el resto queda como historial en el código, no se
  borra, por si más adelante conviene una pantalla de "novedades anteriores").
- **`src/lib/appUpdateSeen.ts`**: guarda/consulta si el usuario ya vio una novedad puntual, por su
  `id`, en `localStorage` (clave `siger4:update-seen:<id>`).
- **`src/components/AppUpdateBanner.tsx`**: el componente visual. Se monta una sola vez dentro de
  `AuthProvider` en `App.tsx` (mismo patrón que `NotificationPushBridge`, ver sección de
  notificaciones push) — así se evalúa una vez por sesión real, sin importar en qué pantalla esté el
  usuario. Gateado por `session`/`profile` reales (no solo "terminó de cargar"), por lo que nunca
  aparece en `/login` ni en pantallas previas a terminar de autenticar.

Al montar, si hay sesión y la novedad más reciente todavía no fue vista (`hasSeenAppUpdate` devuelve
`false`), se muestra el banner. Tocar "Entendido" (o la X) llama a `markAppUpdateSeen` y lo oculta —
no vuelve a aparecer en ese navegador para esa misma novedad.

### 22.2 Por qué localStorage y no una tabla en la base

Se evaluaron las dos opciones que pedía el objetivo original. Se eligió `localStorage` porque la
única función de este control es "no repetir el banner en el mismo navegador" — no hace falta que
sobreviva a un cambio de dispositivo, no hace falta consultarlo desde ningún otro lugar del sistema
(ningún reporte, ninguna auditoría), y no hace falta saber "cuándo" lo vio cada usuario. Agregar una
tabla (`user_id`/`update_id`/`seen_at` + políticas RLS + una consulta de red extra en cada login)
sería infraestructura real para resolver un booleano que ya vive perfectamente bien en el propio
navegador. Si en el futuro hiciera falta una métrica agregada (cuántos usuarios vieron la última
novedad, por ejemplo, para saber si conviene reforzar la comunicación) ahí sí valdría la pena
reconsiderar una tabla — pero no es el caso hoy.

### 22.3 Cómo agregar una novedad nueva

1. Abrir `src/config/appUpdates.ts`.
2. Agregar un objeto nuevo **al principio** del array `APP_UPDATES` (antes del que hoy es el
   primero) — es el único que se va a mostrar a partir del próximo deploy.
3. Completar:
   - `id`: único y estable, nunca reutilizar uno ya usado. Convención sugerida:
     `"YYYY-MM-DD-slug-corto"`. Cambiar el `id` de una novedad ya publicada hace que vuelva a
     mostrarse a todos los usuarios que ya la habían visto — normalmente no es lo que se quiere.
   - `date`: formato `"YYYY-MM-DD"`, solo se muestra en el banner.
   - `title`/`description`: texto corto, en el mismo tono institucional del resto de SIGER4.
   - `changes`: array de strings, una línea por cambio — se muestra como lista.
   - `severity`: `'info'` (celeste), `'improvement'` (verde), o `'important'` (rojo) — define el
     color del badge en la esquina del banner.
4. Guardar, commitear, desplegar. No hace falta ninguna migración ni variable de entorno nueva.

### 22.4 Cómo funciona el "mostrar una sola vez"

Cada novedad tiene un `id` fijo. Al mostrarse y cerrarse, se guarda `localStorage["siger4:update-seen:<id>"] = "1"`
en el navegador del usuario. La próxima vez que `AppUpdateBanner` se monte (nuevo login, nueva pestaña,
recarga), si el `id` de la novedad más reciente ya tiene esa clave guardada, no se vuelve a mostrar.
Si se agrega una novedad nueva con un `id` distinto, se muestra de nuevo — es "una vez por usuario por
versión/novedad", no "una vez para siempre". Si el usuario borra los datos del sitio o cambia de
navegador/dispositivo, vuelve a ver la última novedad — comportamiento esperado y aceptado dado que se
eligió `localStorage` (ver 22.2).

### 22.5 UX

No bloquea el uso del sistema: la superposición (`.app-update-overlay`) tiene `pointer-events: none`,
solo la tarjeta en sí (`.app-update-card`) captura clicks — se puede seguir navegando/interactuando
con el resto de la pantalla mientras el banner está visible. Se ubica abajo a la derecha en escritorio
y abajo centrado en mobile (`max-width: 420px`, `width: 100%` dentro de ese máximo). Usa las mismas
variables CSS de tema (`--color-*`) que el resto del sistema, así que respeta claro/oscuro sin
lógica adicional. `z-index: 60`, por encima de cualquier otro elemento con posición fija del sistema
(sidebar 50, backdrop del drawer mobile 40, header 20).

### 22.6 Migraciones / Edge Functions / Vercel

Ninguna migración, ninguna Edge Function, ninguna variable de entorno nueva. Redeploy normal del
frontend.

## 23. Solicitudes de Préstamo del Inventario Regional (2026-08) — migraciones 0057-0059

> **Actualización (2026-10-03):** ver la sección 58: control de disponibilidad (0099), solicitud en
> nombre de un cuartel para Informática y el Secretario Regional, y mensajes de error reales.

Primer ciclo funcional del flujo de préstamos, fase explícitamente documentada como futura en
`0041_inventory_module.sql`: un cuartel solicita un elemento del Inventario Regional, el responsable
del elemento (o un rol regional) aprueba/rechaza, y se registra retiro y devolución con su propio
estado de conservación. Nada se borra nunca — toda solicitud queda como historial permanente.

### 23.1 Estados y ciclo de vida

```
pendiente -> aprobada -> retirada -> devuelta
         \-> rechazada
pendiente|aprobada -> cancelada
```

`pendiente` (recién creada), `aprobada` (el responsable/regional la aprobó, falta coordinar el
retiro), `rechazada` (terminal), `retirada` (el elemento ya está físicamente en el cuartel
solicitante), `devuelta` (terminal, ciclo completo), `cancelada` (terminal — el propio solicitante se
arrepiente, o el responsable cancela algo ya aprobado antes de que se retire). El frontend solo ofrece
los botones de la transición válida según el estado actual; la base no impide otros caminos a nivel de
RLS, pero no hay ninguna UI que los dispare.

### 23.2 Migración 0057 — tabla, RLS, validación y auditoría

Tabla `inventory_loan_requests` (todas las columnas pedidas: `inventory_item_id`,
`requesting_station_id`, `requested_by_profile_id`, `responsible_profile_id` opcional, `status`,
`request_reason`, `requested_from`, `expected_return_at`, `approved_by_profile_id`/`approved_at`,
`rejected_by_profile_id`/`rejected_at`/`rejection_reason`, `delivered_at`/`delivered_by_profile_id`/
`delivery_condition`, `returned_at`/`returned_by_profile_id`/`return_condition`, `notes`,
`created_at`/`updated_at`) + enum `loan_request_status`.

Un trigger `before insert` (`validate_inventory_loan_request_item_status`) bloquea crear una
solicitud sobre un elemento `baja`/`no_disponible`/`mantenimiento` — el elemento sigue visible en el
catálogo (`inventory_items` no cambió), solo se bloquea la solicitud nueva. No se revalida en updates:
aprobar/rechazar/retirar/devolver una solicitud ya existente no depende del estado actual del ítem,
que pudo cambiar después de creada la solicitud.

`audit_row_change()` (la misma función genérica que ya audita el resto del sistema) se extiende con
un branch para `inventory_loan_requests` (resuelve `region_id`/`subsede_id`/`station_id` desde
`requesting_station_id`) + `trg_audit_inventory_loan_requests` — solicitud creada, aprobación,
rechazo, retiro, devolución y cancelación quedan todas auditadas automáticamente (son todas
operaciones `update` sobre la misma fila, salvo la creación que es el `insert`).

### 23.3 Permisos (RLS, migración 0057)

- **Lectura**: cualquier usuario autenticado (mismo criterio que `inventory_items` — todos necesitan
  ver qué está disponible/reservado).
- **Crear solicitud**: `informatica_r4`, `secretario_regional`/`director_escuela` (cualquier cuartel,
  por si necesitan cargar en nombre de uno), o `jefe_cuerpo_activo`/`presidente_cuartel`/
  `usuario_carga_cuartel` **solo para su propio cuartel** (vía `my_station_ids()`, mismo criterio que
  vehicles/documents — nunca para un cuartel ajeno). En la UI, `requesting_station_id` se completa
  solo desde el cuartel del propio perfil, nunca es un `<select>` editable.
- **Aprobar/rechazar/retiro/devolución/cancelar**: `informatica_r4`, `secretario_regional`,
  `director_escuela` (mismo set que ya administra el catálogo de `inventory_items`), más el
  responsable puntual del elemento (`inventory_items.responsible_profile_id`) **solo para su propio
  elemento**. El solicitante también puede actualizar su propia solicitud (necesario para poder
  cancelarla).
- **Sin policy de delete** para ningún rol no-admin — "no borrar solicitudes históricas" es un
  requisito explícito, no hay ningún camino de borrado desde la app.
- `informatica_r4` administra todo; `secretario_regional`/`director_escuela` mantienen el mismo nivel
  de permisos que ya tenían sobre `inventory_items`, ahora extendido a las solicitudes.

### 23.4 Migraciones 0058-0059 — notificaciones automáticas

`ALTER TYPE ... ADD VALUE` no puede correr en la misma transacción que después usa el valor nuevo
(mismo motivo ya documentado en `0035_notification_types_test_and_reminder.sql`), por eso son dos
migraciones separadas:

- **0058**: agrega `prestamo_solicitado`, `prestamo_aprobado`, `prestamo_rechazado`,
  `prestamo_devuelto` a `notification_type`.
- **0059**: dos triggers sobre `inventory_loan_requests`, mismo patrón que el resto del sistema
  (insert en `notifications` desde Postgres, nunca desde el frontend — `NotificationPushBridge.tsx`
  ya escucha cualquier insert en esa tabla vía Realtime y dispara el push solo, sin cambios ahí):
  - `trg_notify_loan_request_created` (`after insert`): notifica al responsable puntual de la
    solicitud si se cargó, si no al responsable del elemento, si no a un aviso de alcance
    territorial del elemento (nadie asignado puntualmente, pero el equipo regional necesita
    enterarse igual).
  - `trg_notify_loan_request_status_change` (`after update`, guardado con
    `old.status is distinct from new.status` para no reenviar en updates que no cambian el estado):
    notifica al solicitante cuando se aprueba/rechaza su solicitud, y al responsable cuando se
    confirma la devolución. No notifica en `retirada`/`cancelada` a propósito — son acciones que el
    propio usuario que las ejecuta ya sabe que pasaron.

**Recordatorio antes de la fecha esperada de devolución: NO implementado en este ciclo.**
Requeriría un mecanismo de job programado (cron) que no existe hoy en el proyecto — evaluado y
descartado a propósito para este ciclo, queda como fase futura explícita (ver 23.7).

### 23.5 UI

- **`InventarioPage.tsx`**: las tarjetas ahora llevan al detalle del elemento (`/inventario/:id`)
  para cualquier usuario, no solo a editar — antes los usuarios sin permiso de edición no podían ni
  siquiera abrir un elemento (`pointerEvents: 'none'`). Nuevo botón "Solicitudes" en el encabezado.
- **`InventarioDetallePage.tsx`** (nueva): vista de un elemento con su info, botón **Solicitar**
  (solo visible si `status === 'disponible'` y el usuario puede solicitar), lista de solicitudes de
  ESE elemento, e historial (`inventory_item_history`, sin cambios). Un aviso explícito reemplaza el
  botón cuando el elemento no está disponible ("no está disponible para solicitar en este momento").
- **`SolicitudesPrestamoPage.tsx`** (nueva, `/inventario/solicitudes`): listado filtrable por estado
  y cuartel. `jefe_cuerpo_activo` (sin rol regional) ve por defecto solo las solicitudes de su propio
  cuartel — puede sacar el filtro si quiere ver otro.
- **`SolicitudPrestamoFormPage.tsx`** (nueva, `/inventario/:itemId/solicitudes/nueva`): formulario de
  creación — motivo, fecha de devolución estimada, notas. `requesting_station_id` se completa solo,
  nunca editable.
- **`SolicitudPrestamoDetallePage.tsx`** (nueva, `/inventario/solicitudes/:id`): detalle con botones
  de acción según el rol del usuario actual y el estado de la solicitud (Aprobar/Rechazar cuando
  `pendiente`, Registrar retiro cuando `aprobada`, Registrar devolución cuando `retirada`, Cancelar
  cuando `pendiente`/`aprobada` y el usuario es el solicitante o un manager). Los gates de UI
  (`isManager`/`isRequester`) son una mejora de experiencia — la autorización real la sigue haciendo
  la RLS de la base.
- **`AuditoriaPage.tsx`**: se agrega `fetchInventoryItems()` al lookup de nombres (antes faltaba
  incluso para `inventory_items`, que ya existía) para que los diffs de auditoría muestren el nombre
  del elemento en vez del UUID crudo.
- **`humanize.ts`**: `TABLE_LABELS`/`STATUS_LABELS`/`FIELD_LABELS`/`NOTIFICATION_TYPE_LABELS`/
  `NAME_RESOLVABLE_FIELDS` extendidos con las etiquetas de la tabla y los campos nuevos.

### 23.6 Cómo probar (checklist recomendado, sin pruebas funcionales largas)

1. Con un usuario `jefe_cuerpo_activo`/`presidente_cuartel`/`usuario_carga_cuartel`: entrar a un
   elemento `disponible` del Inventario Regional, tocar "Solicitar", completar y enviar — confirmar
   que queda en estado `pendiente` y que el responsable del elemento (o el alcance regional si no
   tiene responsable asignado) recibe la notificación.
2. Confirmar que un elemento `baja`/`no_disponible`/`mantenimiento` se sigue viendo en el catálogo
   pero el botón "Solicitar" no aparece (o muestra el aviso de no disponible).
3. Con el responsable del elemento (o `secretario_regional`/`director_escuela`): aprobar la
   solicitud — confirmar que el solicitante recibe la notificación de aprobación.
4. Registrar retiro (con estado de conservación) y después devolución — confirmar que el responsable
   recibe la notificación de devolución, y que el ciclo completo queda visible en
   `/inventario/solicitudes` con su badge de estado correcto en cada paso.
5. Confirmar en `/auditoria` que aparecen los eventos de creación/aprobación/retiro/devolución con el
   nombre del elemento resuelto (no un UUID).
6. Probar rechazar una solicitud con motivo, y cancelar una solicitud `pendiente` como el propio
   solicitante — confirmar los mensajes/notificaciones correspondientes.

### 23.7 Fase futura

Recordatorio automático antes de la fecha esperada de devolución: requiere un mecanismo de cron
(`pg_cron` en Supabase, o un cron de Vercel que llame una Edge Function) que corra periódicamente,
busque solicitudes `retirada` con `expected_return_at` próximo, y cree una notificación
`recordatorio_devolucion` — con cuidado explícito de no duplicar el aviso si ya se mandó uno
reciente. No evaluado en profundidad en este ciclo; el tipo de notificación ni siquiera se agregó al
enum todavía, para no dejar un valor sin uso real.

## 24. Bugs post-implementación de Solicitudes de Préstamo: error genérico + layout del shell (2026-08) — migración 0060

### 24.1 Causa exacta de "No fue posible procesar la solicitud"

**Bug real, confirmado**: crear una solicitud de préstamo, o registrar una devolución, fallaba
siempre que el elemento no tuviera un responsable puntual asignado — que es el caso más común (no
todos los elementos del inventario tienen `responsible_profile_id` cargado). Causa exacta:
`notify_loan_request_created()` y el branch `devuelta` de `notify_loan_request_status_change()`
(`0059_loan_request_notifications.sql`) armaban el alcance territorial de la notificación copiando
**a la vez** `region_id` **y** `station_id` del elemento cuando no había responsable a quien avisar
puntualmente. Como `inventory_items.region_id` es `NOT NULL` y `station_id` (dónde está físicamente
el elemento) también suele estar cargado, la notificación quedaba con DOS columnas de alcance
territorial no nulas a la vez con `profile_id` nulo — violando el constraint
`notifications_scope_not_ambiguous` (`0032_data_consistency_constraints.sql`: una notificación
masiva solo puede tener **una** de region/subsede/station seteada). Esa violación abortaba toda la
transacción del INSERT/UPDATE que disparó el trigger, y el error de constraint terminaba
mostrándose (o quedando enmascarado) como un mensaje genérico en pantalla.

El patrón se había copiado de `notify_document_created()` (0056), que es seguro únicamente porque
`documents` tiene el constraint `documents_single_scope` garantizando que como mucho un campo de
alcance viene seteado en el origen — garantía que `inventory_items` no tiene.

**Fix (migración 0060)**: ambas funciones ahora eligen un único nivel de alcance, el más específico
disponible (`station_id` > `subsede_id` > `region_id`), en vez de copiar los tres campos a la vez.

### 24.2 Mensajes de error reales, no genéricos

Nuevo `src/lib/api/errors.ts` (`describeSupabaseError`) traduce el error real de Supabase a un
mensaje entendible, reemplazando el patrón `err instanceof Error ? err.message : 'mensaje genérico'`
en las pantallas de Solicitudes de Préstamo (`SolicitudPrestamoDetallePage`,
`SolicitudPrestamoFormPage`, `SolicitudesPrestamoPage`, `InventarioDetallePage`):
- `42501` (RLS deniega la operación) → "No tenés permisos para realizar esta acción."
- `PGRST116` (el `UPDATE` no encontró ninguna fila para el `.select().single()` posterior — el caso
  más común cuando la policy `USING` rechaza la fila antes de llegar a ningún check explícito de
  permisos) → mismo mensaje de permisos, con una nota de "recargá e intentá de nuevo" por si en
  cambio fue que el estado cambió entre que se cargó la pantalla y se tocó el botón.
- `23502` (falta una columna `NOT NULL`) → "Falta completar un campo obligatorio: `<columna>`."
- `23503` (foreign key) → referencia a un registro que no existe o fue eliminado.
- `23514` (check constraint) → "El valor ingresado no es válido para el estado actual del registro."
- `P0001` (un `raise exception` explícito de un trigger nuestro, ej.
  `validate_inventory_loan_request_item_status` de la migración 0057) → se muestra tal cual, ya está
  escrito en español pensado para el usuario final.
- Cualquier otro caso → el `message`/`hint` real de Postgres, nunca un texto genérico inventado.

También se corrigió `fetchLoanRequestById` (`inventoryLoanRequests.ts`), que antes devolvía `null`
("no encontrado") ante **cualquier** error, incluida una falla real de RLS o de red — ahora solo
devuelve `null` para el código `PGRST116` (0 filas, caso legítimo de "no existe"), cualquier otro
error se relanza y se muestra con `describeSupabaseError`.

### 24.3 Sidebar y footer fijos, scroll independiente

Bug de layout real: `.app-shell` usaba `min-height: 100vh` (crecía con el contenido) y el documento
entero scrolleaba como una sola unidad — el sidebar usaba `position: sticky`, que solo re-ancla
dentro de ESE scroll compartido, no le da scroll propio. Resultado: en una pantalla con un menú
largo o con mucho contenido, todo se movía junto, y no había garantía de que "Cerrar sesión" quedara
visible.

**Fix**: `.app-shell` pasa a `height: 100vh` (nunca crece) + `overflow: hidden`. Sidebar
(`.app-sidebar`) y columna principal (`.app-main-column`) son ahora dos contenedores de altura fija
independientes. Dentro del sidebar, solo `.sidebar-nav` tiene `overflow-y: auto` — la marca/logo de
arriba (`.sidebar-brand-row`) y el pie con "Cerrar sesión" (`.sidebar-footer`) quedan siempre fijos y
visibles, sin importar cuántos ítems tenga el menú. Dentro de la columna principal, solo
`.app-content` tiene `overflow-y: auto` — el header (`.app-header`) y el footer institucional
(`.app-footer`, "Sistema creado por Dpto. Informática y Estadística R4") quedan fijos arriba y abajo
respectivamente, nunca se mueven ni se tapan con el contenido. `min-height: 0` en los contenedores
flex padres (`.app-main-column`, `.sidebar-nav`, `.app-content`) es lo que hace que el `overflow-y`
realmente tenga efecto en vez de que el hijo fuerce a crecer al padre (bug clásico de flexbox). El
drawer mobile usa el mismo `<aside>` y hereda el mismo criterio de scroll interno sin cambios
adicionales. Nada de esto depende del tema — usa las mismas variables CSS de siempre, se comporta
igual en claro y oscuro.

### 24.4 Migraciones / Edge Functions / Vercel

Una migración nueva: `0060_fix_loan_request_notification_scope.sql` (corrige las dos funciones de
notificación, no toca la tabla ni la RLS de `inventory_loan_requests`). Ninguna Edge Function.
Redeploy normal del frontend para el resto de los cambios (mensajes de error, layout).

### 24.5 Cómo verificar

1. Con un usuario de cuartel, solicitar un elemento del inventario que **no tenga responsable
   asignado** (`responsible_profile_id`/`responsible_name` vacíos) pero sí tenga `station_id` — antes
   fallaba siempre, ahora debe crear la solicitud sin error.
2. Completar el ciclo hasta devolución sobre ese mismo tipo de elemento (sin responsable) —
   `registerLoanReturn` es el otro punto que tenía el mismo bug.
3. Probar que un usuario sin permiso (ej. un rol de cuartel que no es responsable ni tiene rol
   regional) intentando aprobar una solicitud ajena vea el mensaje "No tenés permisos para realizar
   esta acción." en vez de un error técnico.
4. En desktop, con un usuario con muchos ítems visibles en el menú (ej. `informatica_r4`, que ve
   todo): confirmar que el menú lateral scrollea internamente si hace falta, y que "Cerrar sesión"
   sigue visible siempre abajo.
5. En cualquier pantalla con poco contenido (ej. un detalle vacío) y en una con mucho contenido (ej.
   un listado largo): confirmar que el footer institucional queda fijo abajo en ambos casos, nunca
   tapa contenido ni se despega del borde inferior de la ventana.
6. Repetir 4 y 5 en mobile (drawer) y en modo oscuro.

## 25. QA final del sistema antes de nuevos módulos (2026-08)

Pasada de revisión general (layout, Documentos, Solicitudes de préstamo, módulos principales, manejo
de errores) pedida explícitamente antes de empezar módulos nuevos. Hecha como auditoría de código
(RLS de cada migración contra el gate de cada pantalla, revisión de todos los `catch` de error) — no
se pudo hacer un click-through real en navegador en este entorno (sin herramienta de automatización
de browser disponible), así que la capa visual sigue pendiente de una verificación manual.

### 25.1 Bug real encontrado: tipo de evento del Calendario sin filtrar por rol

`EventoCalendarioFormPage.tsx` mostraba los 9 tipos de evento a cualquier usuario con permiso de
crear/editar, pero `calendar_events_write_admin_regional_station_escuela` (migración 0051) es
condicional por tipo: `is_escuela_role()` (`director_escuela`/`instructor`) únicamente puede escribir
`escuela`/`capacitacion`; el resto de los roles (regional o de cuartel) únicamente puede escribir los
otros 7 tipos. Un `director_escuela` podía elegir "Regional" en el `<select>` y recién enterarse del
rechazo al tocar Guardar — exactamente la clase de "botón que el backend rechaza" pedida en el QA.

**Fix**: el `<select>` de tipo ahora se arma con `allowedEventTypes`, filtrado según el rol actual
(`isAdmin` ve los 9, `is_escuela_role` ve solo escuela/capacitación, el resto ve los demás). En
edición, si el evento cargado ya tenía un tipo fuera de lo que el rol actual puede elegir (ej. lo
cargó un admin), se agrega igual como opción — si no, el `<select>` quedaría sin ninguna opción
realmente seleccionada y guardar sin tocar el campo cambiaría el tipo del evento sin que nadie lo
haya elegido. El valor inicial para un usuario de Escuela pasa de `'regional'` a `'escuela'`.

### 25.2 Mensajes de error reales en todo el sistema, no solo en Documentos/Solicitudes

El patrón `err instanceof Error ? err.message : 'mensaje genérico'` (introducido antes de que
existiera `describeSupabaseError`, ver sección 24.2) seguía repetido en 33 archivos más — cualquier
error real de RLS/constraint en esas pantallas se mostraba como texto técnico de Postgres, o el
`.message` real quedaba oculto detrás del fallback genérico sin ninguna pista. Se reemplazó en todo
el sistema (páginas, `usePushNotifications.ts`, `pushSubscriptions.ts`) por `describeSupabaseError`.

`describeSupabaseError` ahora acepta un **segundo argumento opcional** (`fallback`) para no perder
los mensajes específicos que algunas pantallas ya tenían pensados para el caso "no es un error de
Postgres" (ej. `AjustesPage.tsx`: "Cerrá y reabrí la app manualmente" al limpiar caché) — ese texto
solo se usa como último recurso, cuando el error no es un `PostgrestError` traducible.

### 25.3 Verificado, sin bugs encontrados (auditoría RLS vs. UI)

Se revisó explícitamente, migración por migración, que el gate de permisos de cada pantalla coincida
con la policy RLS real vigente — incluyendo casos donde una migración posterior redefine una función
`security definer` compartida (ej. `is_regional_role()` redefinida en la migración 0048 para dejar de
incluir a `director_escuela`, con efecto inmediato sobre todas las policies que la referencian por
nombre sin tener que tocarlas de nuevo):
- Documentos: `canCreate` en `DocumentoFormPage.tsx` coincide con `documents_insert_admin_regional_station`
  (0053) — incluye `jefe_cuerpo_activo`, agregado en la migración 0047.
- Solicitudes de préstamo: `canRequest`/`isManager` coinciden con `inventory_loan_requests_insert_station`/
  `inventory_loan_requests_update_managers` (0057).
- Vehículos/Personal/Asistencia/Intervenciones: los 4 `canEdit` coinciden con sus policies
  territoriales — correctamente sin `director_escuela` (post-0048).
- Cursos/Escuela: `canEdit` en `CursoFormPage.tsx` coincide con `courses_write_admin_escuela`.
- Cuarteles: create/edit en `CuartelFormPage.tsx` coincide con `stations_write_admin_regional` (solo
  `secretario_regional`) / `stations_update_admin_regional_or_own` (+ roles de cuartel).
- Departamentos: `canManage` (coordinador o admin) coincide con `departments_write_coordinator_or_admin`;
  creación limitada a admin coincide con que un no-admin no podría autoasignarse coordinador desde la UI.
- `UserManagerRoute`: gate de UI documentado explícitamente como conveniencia, la autorización real
  vive server-side — sin cambios necesarios.
- Semáforo de cumplimiento: confirmado integrado en `CuartelesPage`/`CuartelDetallePage`/`PanelPage`
  (no es una pantalla separada, es parte del módulo Cuarteles) — sin bugs.
- Ningún `supabase.from(...)` fuera de la capa `lib/api/` — todas las pantallas pasan por ahí, sin
  riesgo de queries directas con columnas equivocadas.

### 25.4 Dependencia

`npm audit` encontró una vulnerabilidad nueva (no presente en rondas anteriores): `js-yaml`
(dependencia transitiva de ESLint, nunca se empaqueta en el build de producción) con
CVE-2026-59870. Corregida con `npm audit fix` (sin `--force`, sin cambios de comportamiento) — subió
de 4.3.0 a 4.3.1. Las mismas 2 vulnerabilidades de `react-router` de rondas anteriores siguen
pendientes (requieren un downgrade con breaking changes, fuera de alcance de este ciclo).

### 25.5 Qué queda pendiente

- Verificación visual real (click-through en navegador) del layout — no se pudo hacer en este
  entorno. Recomendado: confirmar sidebar/footer fijos, drawer mobile, y claro/oscuro con una sesión
  real en desktop y mobile.
- Probar el flujo completo de Solicitudes de préstamo (crear → aprobar → retirar → devolver) en el
  celular/PC real, con las notificaciones y la auditoría a la vista — la corrección de la migración
  0060 (sección 24.1) no se había verificado todavía en producción real al momento de este ciclo.

## 26. Estadísticas de Departamentos Regionales (2026-08) — migración 0061

Primer ciclo funcional del módulo: registrar y visualizar actividad básica de cada departamento
regional (reuniones, capacitaciones, prácticas, mantenimiento, gestión, informes, otro), con KPIs y
gráficos livianos hand-rolled — sin librería de gráficos (no hay ninguna instalada en el proyecto,
`recharts` se sacó en una limpieza anterior) y sin un sistema complejo de aprobación todavía, tal
como se pidió explícitamente.

### 26.1 Migración 0061 — tabla, RLS, auditoría

Tabla `department_activity_reports`: `department_id` (FK `departments`, cascade), `title`,
`description`, `activity_date`, `activity_type` (enum `department_activity_type`: `reunion`,
`capacitacion`, `practica`, `mantenimiento`, `gestion`, `informe`, `otro`), `station_id`/`subsede_id`
(ambos opcionales e **independientes**, sin exclusión mutua — confirmado explícitamente con el
usuario, a diferencia del patrón "scope target" de Documentos/Calendario), `attendees_count`,
`hours_worked` (`numeric(6,2)`), `created_by_profile_id`, `created_at`/`updated_at`. Checks
`>= 0` en asistentes y horas.

`audit_row_change()` se extiende con un branch para `department_activity_reports` que resuelve
`station_id`/`subsede_id` directo del informe y `region_id` a partir de cualquiera de esos dos (a
diferencia de `departments`/`department_members`, que no tienen territorio propio y quedan en la
rama `else`). Trigger `after insert or update or delete` (a diferencia de
`inventory_loan_requests`, que solo audita insert/update porque nunca se borra — ver 26.2).

### 26.2 Permisos (confirmados explícitamente con el usuario)

- **Lectura**: cualquier usuario autenticado (mismo criterio que el resto de los directorios del
  sistema — incluye `secretario_regional`, `invitado`, etc.).
- **Crear/editar**: `informatica_r4`, `secretario_regional` (`is_regional_role()`, que desde la
  migración 0048 significa *solo* ese rol — `director_escuela` no comparte esta función), el
  coordinador del departamento, o **cualquier miembro** del departamento. `department_members` no
  distingue roles internos (es todo-o-nada a nivel membresía, ver 0042), así que cualquier miembro
  puede editar cualquier informe del departamento, no solo los que cargó él mismo.
- **Borrar**: más restrictivo que editar — `informatica_r4` o quien cargó el informe
  (`created_by_profile_id = uno mismo`). Un miembro puede editar un informe ajeno del mismo
  departamento, pero no borrarlo; ni siquiera el coordinador puede borrar el informe de otro miembro
  (solo admin o el propio autor). Decisión explícita: a diferencia de las solicitudes de préstamo del
  inventario (registro permanente, nunca se borra), un informe de actividad es un registro simple
  donde tiene sentido poder corregir una carga por error.

### 26.3 UI

Todo integrado dentro de `DepartamentoDetallePage.tsx` (sin pantalla de detalle propia por informe,
mismo criterio que `station_history_events`/`attendance_summaries` — es un registro simple, no un
workflow como las solicitudes de préstamo), nueva sección "Actividad / Informes" después de
"Miembros":
- **KPI tiles** (`card-grid`/`kpi-card`, mismo patrón que `PanelPage.tsx`): cantidad de actividades,
  horas acumuladas, asistentes acumulados — todos recalculados sobre el resultado filtrado, no sobre
  el total.
- **Gráficos livianos hand-rolled** (`SimpleBarRow`, nuevas clases `.simple-bar-*` en `styles.css`):
  actividades por mes (últimos 6 meses), horas por mes, actividad por tipo, cuarteles/subsedes
  involucrados. Una sola serie por gráfico → un solo hue (`--color-primary`), sin necesidad de
  leyenda; barra con extremo redondeado, ancho proporcional al máximo del conjunto, valor en texto al
  costado (nunca superpuesto a la barra). Sin SVG, sin librería — solo `div`s con `border-radius`.
- **Filtros**: tipo, cuartel, subsede, rango de fechas — se aplican tanto a la lista como a los
  KPIs/gráficos.
- **Lista de informes**: `card-solid` por informe con tipo/fecha/asistentes/horas/ubicación, acciones
  de editar (según `canLogActivity`, ver 26.2) y eliminar (según `canDeleteReport`, más restrictivo)
  independientes entre sí.
- **`InformeDepartamentoFormPage.tsx`** (nueva): formulario de creación/edición, mismo patrón que
  `VehiculoFormPage.tsx` (selector de tipo con botones tipo "pill", campos numéricos opcionales,
  dropdowns de cuartel/subsede poblados una vez). Rutas: `/departamentos/:departmentId/informes/nuevo`
  (creación, patrón `/cuarteles/:stationId/vehiculos/nuevo`) y `/informes/:id/editar` (edición,
  top-level, patrón `/vehiculos/:id/editar`).

### 26.4 Auditoría (humanize.ts / AuditoriaPage.tsx)

Se agregaron `departments`, `department_members` y `department_activity_reports` a `TABLE_LABELS` de
`humanize.ts` (los dos primeros no tenían etiqueta todavía, quedaban con el nombre crudo de la tabla
en `/auditoria`). Nuevas etiquetas de campo (`department_id`, `coordinator_profile_id`,
`contact_info`, `activity_date`, `activity_type`, `hours_worked`) y una traducción de valor propia
para `activity_type` (no comparte `STATUS_LABELS`: `department_activity_reports` no tiene columna
`status`). `department_id`/`coordinator_profile_id` se agregaron a `NAME_RESOLVABLE_FIELDS`, y
`AuditoriaPage.tsx` ahora también trae `fetchDepartments()` para poder resolver esos UUID a nombre
real en los diffs, en vez de mostrarlos crudos.

### 26.5 Fase futura

- **Reportes/PDF**: no se generó ningún PDF nuevo (pedido explícito de dejarlo para más adelante) —
  `jspdf`/`jspdf-autotable` ya están instalados y usados en otros módulos, así que el camino ya existe
  si se retoma.
- **Recordatorio de devolución** (no aplica a este módulo, pero sigue pendiente de otro ciclo — ver
  sección 23.7).
- El tipo de actividad `'otro'` no tiene un campo de texto libre tipo `category_other_label` (como sí
  tiene `inventory_items` para su categoría "Otros") — no se pidió explícitamente, evaluar si hace
  falta cuando haya uso real del módulo.

### 26.6 Migraciones / Edge Functions / Vercel

Una migración: `0061_department_activity_reports.sql`. Ninguna Edge Function. Redeploy normal del
frontend.

### 26.7 Cómo probar (checklist recomendado)

1. Con un miembro (no coordinador) de un departamento: entrar al departamento, confirmar que aparece
   "Nuevo informe" y que se puede cargar uno.
2. Confirmar que ese mismo miembro puede editar un informe cargado por otro miembro del mismo
   departamento, pero NO puede borrarlo (el botón de eliminar no debería aparecer).
3. Con el autor de un informe (no coordinador, no admin): confirmar que sí puede borrar su propio
   informe.
4. Con `secretario_regional`: confirmar que puede ver y cargar informes de cualquier departamento.
5. Cargar varios informes con distintos tipos/fechas/cuarteles y confirmar que los KPIs, los 4
   gráficos y los filtros reflejan los datos correctamente (en particular, que los gráficos se
   recalculan al aplicar un filtro).
6. Confirmar en `/auditoria` que la creación/edición/borrado de un informe queda registrada con el
   nombre del departamento resuelto (no un UUID crudo).

## 27. Auditoría profunda de permisos y accesos indebidos (2026-08) — migraciones 0062-0064

Antes de seguir con nuevas funciones (recordatorio automático de devolución de préstamos), se pidió
una auditoría completa de huecos funcionales, permisos y accesos indebidos en todo SIGER4: reportes,
integrantes de departamentos sin usuario, y un barrido general de rutas/sidebar/filtros/RLS/botones
en 15 módulos.

### 27.1 Reportes — acceso demasiado abierto (sin migración, solo frontend)

**Huecos encontrados:**

- `/reportes` usaba `ProtectedRoute` (solo exige sesión) — **cualquier rol autenticado** podía entrar,
  incluidos `presidente_cuartel`, `secretario_comision`, `instructor`, `invitado`, `administrativo`.
- El link "Reportes" del sidebar (`navigation.ts`) no tenía `showForRoles` — visible para todos.
- El botón "Nuevo Reporte" del Panel (`PanelPage.tsx`) era incondicional.
- Los 3 selectores de alcance (Regional/Subsede/Cuartel) en `ReportesPage.tsx` no estaban acotados:
  un `jefe_cuerpo_activo`/`usuario_carga_cuartel` veía y podía elegir **cualquier cuartel del
  sistema**, no solo el propio (aunque la RLS de las tablas de datos igual lo bloqueaba al traer los
  datos — no era fuga de datos, pero sí un selector engañoso).
- Los 6 tipos de reporte se mostraban igual a todos los roles con acceso, sin distinguir alcance
  institucional (ej. `director_escuela` veía "Reporte de Vehículos"/"Reporte de Intervenciones",
  datos operativos de cuartel ajenos a Escuela/capacitación).

**Corrección (solo frontend, la RLS de las tablas de datos — `attendance_summaries`,
`intervention_summaries`, `vehicles`, `stations` — ya estaba bien acotada por cuartel/región desde
antes):**

- Nuevo `src/components/layout/ReportsRoute.tsx`: exige `isAdmin` o
  `hasRole('director_escuela', 'secretario_regional', 'jefe_cuerpo_activo', 'usuario_carga_cuartel')`.
  El resto de roles no accede a `/reportes` (redirige a `/panel`).
- `navigation.ts`: el item "Reportes" ahora usa `showForRoles` con esos mismos 4 roles.
- `PanelPage.tsx`: el botón "Nuevo Reporte" solo se muestra si el rol tiene acceso.
- `ReportesPage.tsx`:
  - `jefe_cuerpo_activo`/`usuario_carga_cuartel` (alcance de solo cuartel): los selectores de
    Regional/Subsede se ocultan, el selector de Cuartel queda fijo y deshabilitado en el propio
    cuartel, y el tipo de reporte se limita a Asistencias/Intervenciones/Cursos/Vehículos/General por
    Cuartel (sin "Regional Consolidado"). Además, `handleGenerate` fuerza `stationId` al cuartel
    propio y `regionId`/`subsedeId` a `null` sin importar el estado de los selectores (defensa en
    profundidad, por si el estado quedara inconsistente).
  - `director_escuela`/`secretario_regional` (alcance regional/subsede/cuartel, confirmado con el
    usuario que `secretario_regional` tiene el mismo alcance que `director_escuela` acá): los 4 tipos
    de reporte se acotan a Asistencias, Cursos, General por Cuartel y Consolidado Regional (sin
    Vehículos ni Intervenciones — datos operativos ajenos a Escuela/capacitación y visión regional,
    confirmado con el usuario).
  - `informatica_r4`/`integrante_informatica`: sin cambios, acceso total a los 6 tipos y cualquier
    alcance.
- Se dejaron sin tocar (decisión confirmada con el usuario) las RLS de `regions`/`subsedes`/`courses`/
  `course_stations` (`auth.role() = 'authenticated'`, sin chequeo de rol/alcance): son tablas de
  referencia usadas por otras pantallas fuera de Reportes, y acotarlas ahí hubiera sido un cambio de
  alcance mayor con riesgo de romper otras pantallas.

### 27.2 Integrantes manuales de Departamentos — migración 0062

**Hueco encontrado:** `department_members` exige `profile_id not null` — la única forma de sumar un
integrante a un departamento era que ya tuviera usuario en el sistema. No existía forma de cargar a
alguien que solo debe figurar como integrante (nombre, cuartel, cargo/función), sin cuenta Auth ni rol.

**Corrección:** nueva tabla `department_manual_members` (migración `0062_department_manual_members.sql`),
hermana de `department_members`, sin tocarla:

- Campos: `first_name`, `last_name`, `station_id` (opcional), `role_function` (cargo/función, opcional),
  `contact_info` (opcional), `is_active`, `observations` (opcional), `linked_profile_id` (opcional,
  asociación no obligatoria a un profile real si el integrante también tiene cuenta), más
  `created_by_profile_id`/timestamps de auditoría.
- No ocupa cuenta Auth ni requiere rol del sistema.
- El coordinador del departamento sigue siendo obligatoriamente un profile/user real (sin cambios en
  `departments.coordinator_profile_id`).
- RLS: lectura para cualquier autenticado; escritura (alta/edición/desactivación) para
  `informatica_r4`, `secretario_regional` (`is_regional_role()`), el coordinador del departamento, o
  cualquier miembro real (`department_members`) — mismo criterio que `department_activity_reports`
  (0061), por consistencia dentro del módulo. **No hay policy de borrado**: las bajas se hacen con
  `is_active = false`, igual que el resto de "bajas" institucionales del sistema (perfiles,
  departamentos, ítems de inventario) — no `DELETE` físico desde la app.
- Auditoría: `audit_row_change()` redefinida con una rama nueva para `department_manual_members`
  (resuelve `region_id`/`subsede_id` a partir de `station_id` si tiene cuartel cargado).
- API: `src/lib/api/departments.ts` — `fetchDepartmentManualMembers`, `createDepartmentManualMember`,
  `updateDepartmentManualMember` (sin `deleteDepartmentManualMember`, coherente con la RLS).
- UI: nueva sección "Integrantes sin usuario" en `DepartamentoDetallePage.tsx`, entre "Miembros" y
  "Actividad / Informes" — listado con nombre/cargo/cuartel, alta/edición inline con formulario propio,
  desactivar/reactivar (ícono de tacho que alterna `is_active`), toggle para mostrar/ocultar inactivos.
  Gateada por el mismo `canLogActivity` (coordinador, admin, o cualquier miembro) que ya regía la
  sección de informes de actividad.
- `humanize.ts`: nueva entrada en `TABLE_LABELS` (`department_manual_members: 'Integrantes manuales de
  departamento'`); los campos (`first_name`, `last_name`, `role_function`, `contact_info`, `is_active`,
  `observations`, `station_id`) ya tenían label en `FIELD_LABELS` de rondas anteriores, no hizo falta
  agregar ninguno nuevo.

### 27.3 Notificaciones — permiso de escritura sin ningún límite territorial (migración 0063)

**Hueco encontrado (el más serio de la ronda — no era solo UI, era la RLS misma):**
`notifications_write_admin_regional_escuela` (migración 0003) permitía a `secretario_regional`,
`director_escuela` e `instructor` (`is_regional_role() or is_escuela_role()`) insertar una
notificación masiva a **cualquier región/subsede/cuartel/usuario del sistema**, sin ninguna
restricción de alcance — a diferencia de todas las demás tablas con escritura regional/escuela
(`documents`, `calendar_events`, `vehicles`, `personnel`, `attendance_summaries`,
`intervention_summaries`), que siempre acotan el destino al alcance propio del actor. `instructor` en
particular es el rol institucionalmente más acotado de los tres (dicta cursos, sin alcance regional
amplio) y podía igual difundir una notificación a toda la red regional. El frontend
(`NotificacionFormPage.tsx`) reflejaba fielmente ese permiso: selectores de región/subsede/cuartel/
usuario totalmente abiertos.

**Corrección:**

- Migración `0063_notifications_scope_write.sql`: reemplaza la policy por
  `notifications_write_regional_escuela_scoped`. `informatica_r4` mantiene alcance total.
  `secretario_regional`/`director_escuela`/`instructor` solo pueden escribir si el destino cae dentro
  de su propia región/subsede/cuartel (`my_region_ids()`/`my_subsede_ids()`/`my_station_ids()`), o si
  la notificación es a un usuario puntual (`profile_id` no nulo, que no necesita acotarse por
  territorio porque ya es 1 a 1).
- `NotificacionFormPage.tsx`: para estos 3 roles, los selectores de región/subsede/cuartel se filtran
  a la propia región (y si no tiene región propia asignada, el único alcance que le queda disponible
  es "Usuario específico"). `informatica_r4` sigue viendo todo sin restricción.

### 27.4 Calendario — selector de alcance de `secretario_regional` sin acotar (dead-end UI)

El fix anterior del `<select>` de tipo de evento (sección 25.1) seguía vigente y se confirmó
funcionando. Hueco nuevo encontrado: en `EventoCalendarioFormPage.tsx`, el selector de
región/subsede/cuartel no estaba acotado para `secretario_regional` — podía elegir cualquier región
del sistema, aunque `calendar_events_write_admin_regional_station_escuela` (migración 0051) ya
restringía la escritura real a `region_id in (select my_region_ids())`. Es decir, no era fuga de
datos (la RLS ya bloqueaba el guardado), pero sí un selector que dejaba elegir algo que después se
iba a rechazar. Se corrigió acotando `regions`/`subsedes`/`stations` a la región propia cuando el
actor es `secretario_regional` (mismo patrón que ya existía para los roles de cuartel, `stationLocked`).

También en `EventoCalendarioDetallePage.tsx`: los botones Editar/Cancelar/Eliminar se mostraban con
un chequeo de rol puro (`canManage`), sin comparar el evento realmente abierto contra el alcance del
actor — un `secretario_regional` o un rol de cuartel veía esos botones en cualquier evento visible
por RLS de lectura, aunque el guardado se rechazara. Se corrigió recalculando `canManage` contra el
`region_id`/`station_id`/`subsede_id`/`event_type` reales del evento, replicando exactamente la
condición de la RLS de escritura.

### 27.5 Cuarteles — `canEdit` sin comparar contra el cuartel realmente abierto (dead-end UI)

`CuartelDetallePage.tsx` y sus 5 formularios hijos (`PersonalFormPage`, `VehiculoFormPage`,
`AsistenciaFormPage`, `IntervencionFormPage`, `EventoHistoricoFormPage`) tenían un `canEdit`/
`canEditHistory` de solo rol (`isAdmin || hasRole(...)`), sin chequear que el cuartel visto fuera el
propio. Como `stations_select_scope` permite lectura de oversight más amplia que la escritura (ej.
`secretario_regional` lee toda su región, pero solo puede escribir en `personnel`/`vehicles` de esa
misma región — correcto —, y un rol de cuartel puede leer cuarteles de su misma subsede aunque solo
pueda escribir en el propio), esto mostraba Editar/Eliminar/cambiar estado en cuarteles ajenos, con la
RLS rechazando el guardado recién al enviar. Se corrigió agregando la comparación real: `secretario_regional`
requiere que `station.region_id === myRegionId`; los roles de cuartel requieren `station.id ===
myStationId`. No hubo cambios de RLS (ya estaba bien) — es una corrección de UX/UI únicamente.

### 27.6 Documentos — selector de alcance y gestión de carpetas sin acotar (dead-end UI)

Mismo patrón que Reportes y Calendario: en `DocumentoFormPage.tsx`, un rol de cuartel
(`presidente_cuartel`/`usuario_carga_cuartel`/`secretario_comision`/`jefe_cuerpo_activo`) veía los 4
alcances (Regional/Subsede/Cuartel/Usuario) y todos los cuarteles del sistema, aunque
`documents_write_admin_regional_station` (migración 0047) solo les permite escribir con
`station_id` = su propio cuartel (nunca región/subsede/usuario). Se corrigió: para estos roles el
selector de alcance se oculta completamente (queda fijo en su propio cuartel), y para
`secretario_regional` las listas de región/subsede/cuartel se acotan a su propia región.

En `CarpetaDetallePage.tsx`, `canManageFolders` (que gatea Editar/Eliminar carpeta y Cargar/Editar/
Eliminar documentos dentro de ella) era también un chequeo de rol puro — se mostraba en cualquier
carpeta, incluida "General" (sin alcance propio, antes solo debería administrarla informática) y
carpetas de otras regiones/cuarteles. Se corrigió comparando el `region_id`/`subsede_id`/`station_id`
real de la carpeta abierta contra el alcance del actor, replicando la condición de
`document_folders_write_admin_regional_station`.

`PapeleraDocumentosPage.tsx` se revisó y **no tenía el mismo problema**: la lista de documentos en
papelera ya viene acotada por RLS de lectura (`documents_select_scope`), así que un rol de cuartel
solo ve ahí los documentos de su propio alcance — no hacía falta ningún cambio.

### 27.7 Auditoría — `invitado` podía ver el historial completo de su cuartel (migración 0064)

**Hueco encontrado:** `audit_logs_select_station`/`audit_logs_select_subsede` (migración 0020) no
excluían ningún rol — cualquier usuario autenticado con alcance de cuartel/subsede podía leer el
historial completo de auditoría de ese alcance, incluidos los diffs `old_value`/`new_value` de cada
cambio. `invitado` está documentado explícitamente como *"Acceso de solo lectura limitado"* (ver
`ROLE_DEFINITIONS`); el sidebar ya ocultaba el link de Auditoría para ese rol
(`hideForRoles: ['invitado']`), pero ni la ruta ni la RLS lo excluían, así que igual podía entrar
tipeando `/auditoria` directamente.

**Corrección:** migración `0064_audit_logs_exclude_invitado.sql` agrega `not has_role('invitado')` a
ambas policies. `AuditoriaPage.tsx` agrega además una guarda propia (`canAccess = !hasRole('invitado')`)
que muestra un mensaje de "sin permisos" en vez de la bitácora — cierre en los tres niveles (sidebar,
página, RLS).

### 27.8 Revisado, sin huecos encontrados

- **Panel**: todas las queries (KPIs, listas) dependen enteramente de RLS ya bien acotada por tabla;
  nada destructivo ni de escritura en la página.
- **Usuarios**: `UserManagerRoute`/`UserCreatorRoute` y el filtrado de `UsuariosPage.tsx` para
  `jefe_cuerpo_activo` ya estaban bien construidos (rondas anteriores).
- **Inventario**: `canEdit` (solo `informatica_r4`/`director_escuela`/`secretario_regional`) es
  intencional — es un pool regional compartido por diseño, coherente con
  `inventory_items_write_regional`. Los roles de cuartel solo pueden "Solicitar" (préstamo), gateado
  aparte y correctamente.
- **Solicitudes de Préstamo**: chequeo liviano confirmó que `requesting_station_id` nunca es un
  `<select>` editable (se deriva de `profile.station_id`), coherente con la RLS de inserción.
- **Semáforo** (`station_compliance`, vista SQL `security_invoker`): de solo lectura, sin camino de
  escritura; hereda RLS real de las tablas subyacentes por viewer.
- **Ajustes**: enteramente autoservicio (perfil propio, contraseña propia, notificaciones de prueba
  siempre a uno mismo); la única sección admin-only ya estaba bien gateada.
- **Papelera de Documentos**: ver 27.6.

### 27.9 Matriz de permisos por rol y módulo

`V` = puede ver, `C` = puede crear, `E` = puede editar, `X` = puede eliminar/desactivar. Alcance
siempre "propio cuartel" salvo que se indique lo contrario. Roles no listados en una fila no tienen
ningún acceso a ese módulo.

| Módulo | informatica_r4 / integrante_informatica | director_escuela | secretario_regional | instructor | jefe_cuerpo_activo | usuario_carga_cuartel | presidente_cuartel | secretario_comision | invitado |
|---|---|---|---|---|---|---|---|---|---|
| Panel | V (todo) | V (su región) | V (su región) | V (su región) | V (su cuartel) | V (su cuartel) | V (su cuartel) | V (su cuartel) | V (su cuartel) |
| Cuarteles / Detalle | V/C/E/X (todo) | V (su región) | V/E (su región) | V (su región) | V (propio)/E | V (propio)/E | V (propio)/E | V (propio, solo historial) | V (propio) |
| Usuarios | V/C/E/X (todo) | C (crear Escuela) | — | — | V/E (su cuartel) | — | — | — | — |
| Reportes | V/C (todo alcance) | V/C (regional/subsede/cuartel, sin Vehículos/Intervenciones) | V/C (ídem director_escuela) | — | V/C (solo su cuartel) | V/C (solo su cuartel) | — | — | — |
| Documentos | V/C/E/X (todo) | — | V/C/E (su región) | — | V/C/E (su cuartel) | V/C/E (su cuartel) | V/C/E (su cuartel) | V/C/E (su cuartel) | V (su alcance) |
| Inventario | V/C/E/X (regional compartido) | V/C/E (regional compartido) | V/C/E (regional compartido) | — | V + Solicitar préstamo | V + Solicitar préstamo | V + Solicitar préstamo | — | V |
| Solicitudes de Préstamo | V/C/E/X (todo) | V (su región) | V/E (su región) | — | V/C (su cuartel) | V/C (su cuartel) | V/C (su cuartel) | — | — |
| Calendario | V/C/E/X (todo) | C/E (escuela/capacitación, sin territorio) | V/C/E (su región) | C/E (escuela/capacitación, sin territorio) | V/C/E (su cuartel) | V/C/E (su cuartel) | V/C/E (su cuartel) | V/C/E (su cuartel) | V |
| Semáforo (compliance) | V (todo) | V (su región) | V (su región) | V (su región) | V (su cuartel) | V (su cuartel) | V (su cuartel) | V (su cuartel) | V (su cuartel) |
| Departamentos | V/C/E/X (todo) | V | V/C/E (coordinador o admin gestiona miembros) | V | V | V | V | V | V |
| Estadísticas de Departamentos | V/C/E/X (todo) | V/C/E (si es miembro/coordinador) | V/C/E (todo, rol regional) | V | V (si es miembro) | V (si es miembro) | V (si es miembro) | V (si es miembro) | V |
| Auditoría | V (todo) | V (su región) | V (su región) | V (su región) | V (su cuartel) | V (su cuartel) | V (su cuartel) | V (su cuartel) | — (excluido, 0064) |
| Notificaciones | V (todo) + C (todo alcance) | V (su alcance) + C (su región) | V (su alcance) + C (su región) | V (su alcance) + C (su región) | V (su cuartel) | V (su cuartel) | V (su cuartel) | V (su cuartel) | V (su cuartel) |
| Ajustes | V/E (propio) + admin-only (versión/caché) | V/E (propio) | V/E (propio) | V/E (propio) | V/E (propio) | V/E (propio) | V/E (propio) | V/E (propio) | V/E (propio) |

Notas sobre la matriz:

- "Departamentos" (miembros con usuario e integrantes manuales) y "Estadísticas de Departamentos"
  (informes de actividad) usan un modelo de permisos por **membresía real**, no por rol: cualquier
  miembro de un departamento (`department_members`) puede cargar/editar informes e integrantes
  manuales de ESE departamento, sin importar su rol de sistema; el borrado de informes queda más
  restringido (admin o el propio autor). La columna refleja el caso "es miembro de al menos un
  departamento" — alguien sin membresía en ningún departamento solo tiene lectura.
  `secretario_regional`/`is_regional_role()` tiene además escritura total en cualquier departamento
  sin necesidad de ser miembro (ver 0061/0062).
- `administrativo` (rol legado, ya no asignable desde la UI) no aparece en la matriz: sigue existiendo
  como tipo válido para perfiles ya asignados en rondas previas del sistema, pero no se ofrece para
  asignar a nadie nuevo; su alcance efectivo es el más bajo (equivalente a invitado) en todas las
  tablas que no lo mencionan explícitamente en su RLS.

### 27.10 Migraciones nuevas de esta ronda

- `0062_department_manual_members.sql` — tabla `department_manual_members`, RLS, auditoría.
- `0063_notifications_scope_write.sql` — acota `notifications_write_admin_regional_escuela` al
  alcance propio del actor (reemplazada por `notifications_write_regional_escuela_scoped`).
- `0064_audit_logs_exclude_invitado.sql` — excluye a `invitado` de
  `audit_logs_select_station`/`audit_logs_select_subsede`.

Ninguna Edge Function nueva ni tocada. Redeploy normal del frontend (Vercel); las 3 migraciones deben
aplicarse en Supabase antes o junto con el deploy del frontend, en orden (0062 → 0063 → 0064).

### 27.11 Cómo probar (checklist recomendado)

1. Con `presidente_cuartel`/`secretario_comision`/`instructor`/`invitado`: confirmar que "Reportes" no
   aparece en el sidebar y que `/reportes` redirige a `/panel` si se tipea directo.
2. Con `jefe_cuerpo_activo`/`usuario_carga_cuartel`: confirmar en `/reportes` que no hay selector de
   Regional/Subsede, que el selector de Cuartel está fijo en el propio y deshabilitado, y que el tipo
   de reporte no ofrece "Consolidado Regional".
3. Con `director_escuela`/`secretario_regional`: confirmar que en `/reportes` no aparecen los tipos
   "Vehículos" ni "Intervenciones".
4. En un departamento, como coordinador o miembro: cargar un integrante manual (sin usuario), editarlo,
   desactivarlo, confirmar que reaparece al tocar "Mostrar inactivos", y que queda auditado en
   `/auditoria`.
5. Con `instructor`: confirmar en "Nueva Notificación" que los selectores de región/subsede/cuartel
   quedan acotados a su propia región (o, si no tiene región asignada, que el único alcance ofrecido
   es "Usuario específico").
6. Con `secretario_regional`: confirmar en "Nuevo Evento" de Calendario que el selector de
   región/subsede/cuartel está acotado a su propia región.
7. Con un rol de cuartel: entrar al detalle de OTRO cuartel de su misma subsede/región (visible por
   lectura) y confirmar que ya NO aparecen los botones de Editar/dar de baja en personal, vehículos,
   asistencia, intervenciones ni historial.
8. Con `invitado`: confirmar que "Auditoría" no aparece en el sidebar y que `/auditoria` muestra "sin
   permisos" si se tipea directo.

## 28. Reportes de Departamentos y borrado directo de usuarios (2026-08) — migración 0065, Edge Function admin-delete-user

### 28.1 Reportes de Departamentos Regionales

Dos tipos de reporte nuevos en `/reportes`, agregados a `REPORT_TYPES`/`ReportKey`/`REPORT_GENERATORS`
sin tocar ninguno de los 6 existentes:

- **"Departamentos Regionales — General"** (`departamentos_general`): resumen consolidado de todos los
  departamentos. KPIs: cantidad de departamentos, activos, integrantes (con usuario + manuales),
  actividades, horas y asistentes acumulados. Gráficos: actividades por tipo, actividades por mes
  (últimos 6). Tabla: ranking de departamentos por cantidad de actividades (el que más actividad tiene,
  primero).
- **"Departamento específico"** (`departamento_especifico`, `needsDepartment: true`): mismo criterio que
  `needsStation` para "Reporte General por Cuartel" — exige elegir un departamento del selector nuevo
  antes de generar. Incluye: coordinador, integrantes con usuario (con su cuartel resuelto por nombre,
  no UUID), integrantes manuales (con cargo/función y cuartel), evolución mensual (últimos 6 meses),
  actividades por tipo, cuarteles involucrados en las actividades (tabla aparte, solo si hay datos), y
  el detalle completo de informes de actividad.

**Datos**: fetcher nuevo `fetchDepartmentsReportData(departmentId?)` en `src/lib/api/reports.ts` — trae
`departments` (todos o uno solo), `department_members` (con `profile` embebido), `department_manual_members`
y `department_activity_reports` en paralelo, y arma cada departamento con sus propios miembros/informes
(`DepartmentWithMembers`). Las agregaciones (KPIs, por tipo, por mes) replican exactamente la lógica ya
usada en `DepartamentoDetallePage.tsx` (mismos últimos-6-meses, mismo agrupamiento por
`DepartmentActivityType`), factorizada en `activityByMonth()`/`activityByType()` dentro de
`reportGenerators.ts` para no duplicarla en el propio generador. Como
`departments`/`department_members`/`department_manual_members`/`department_activity_reports` tienen
lectura abierta a cualquier autenticado (sin scope territorial, ver auditoría de permisos anterior), el
control de acceso a estos 2 reportes vive enteramente en `ReportesPage.tsx`, no en RLS.

**PDF**: usa el mismo `ReportBuilder` que el resto de los reportes — mismo encabezado institucional (logo
Escuela + logo Informática), mismo pie `"Sistema creado por Dpto. Informática y Estadística R4"` en
todas las páginas, mismas tablas (`jspdf-autotable`) y mismos gráficos de barras horizontales
(`renderBarChartToDataUrl`, canvas → PNG incrustado — no hay librería de gráficos ni IA en ningún punto
del pipeline de generación). No se modificó `reportBuilder.ts`.

### 28.2 Permisos de Reportes de Departamentos

- `informatica_r4`/`integrante_informatica`: acceso total a ambos reportes, cualquier departamento.
- `director_escuela`/`secretario_regional`: acceso a ambos reportes (agregados a
  `ESCUELA_REGIONAL_REPORT_KEYS`), cualquier departamento — visión regional/escuela, confirmado con el
  usuario.
- **Coordinador de departamento** (`departments.coordinator_profile_id === profile.id`, dato, no rol de
  sistema): solo si además tiene uno de los roles que ya acceden a `/reportes`
  (`director_escuela`/`secretario_regional`/`jefe_cuerpo_activo`/`usuario_carga_cuartel`) o es admin —
  confirmado explícitamente con el usuario, en vez de ampliar `ReportsRoute.tsx` para dejar entrar a
  cualquier coordinador sin importar su rol de sistema (departments.coordinator_profile_id es un dato,
  no un `RoleKey`, así que ampliar la ruta hubiera requerido un fetch adicional ahí mismo). Cuando
  corresponde, ve **solo** "Departamento específico" (nunca "General"), y el selector de departamento
  se acota a los departamentos que coordina (`ReportesPage.tsx`: `isDepartmentCoordinator`).
- `jefe_cuerpo_activo`/`usuario_carga_cuartel` (roles de cuartel): **sin acceso** a ninguno de los 2
  reportes de Departamentos, salvo que además coordinen un departamento (caso anterior) — "no permitir
  que roles de cuartel generen reportes globales de departamentos salvo decisión explícita", tal cual
  pedido.
- Resto de roles: sin acceso a `/reportes` (sin cambios respecto a la ronda de auditoría anterior).

### 28.3 Borrado directo de usuarios — Edge Function `admin-delete-user`

Nueva función en `supabase/functions/admin-delete-user/`, mismo patrón que `admin-update-user`/
`admin-create-user` (sin `_shared/`, CORS y helpers inline, valida el JWT del caller antes que nada,
usa `service_role` solo después de validar permisos con el cliente del usuario).

**Autorización**: exclusivamente `informatica_r4` — ni siquiera `integrante_informatica` (que sí puede
usar `admin-update-user`) tiene acceso a este borrado. Se revalida 100% server-side; el frontend
también oculta el botón, pero la autorización real es la de la función.

**Qué borra**: un solo `auth.admin.deleteUser()` sobre el `auth_user_id` del perfil objetivo. Como
`profiles.auth_user_id references auth.users(id) on delete cascade`, esto dispara en cascada, dentro de
la misma transacción de Postgres:
- **Se borra** (dato propio del usuario): `profiles`, `user_roles`, `user_scopes`, `notifications`,
  `push_subscriptions`, `department_members` (todas `on delete cascade` desde `profiles`), y
  `documents`/`document_folders` cuando `profile_id` es el **destinatario** de un documento/carpeta
  personal (también `cascade` — distinto de `uploaded_by_profile_id`, que es `set null`).
- **Queda con referencia null** (registro institucional preservado): `audit_logs.actor_profile_id`,
  `documents.uploaded_by_profile_id`, `document_versions.uploaded_by_profile_id`,
  `document_folders.created_by_profile_id`, `courses.instructor_profile_id`,
  `vehicle_status_history.changed_by_profile_id`, `personnel_status_history.changed_by_profile_id`,
  `inventory_items.responsible_profile_id`/`created_by_profile_id`, `departments.coordinator_profile_id`/
  `created_by_profile_id`, `calendar_events.created_by_profile_id`,
  `station_history_events.created_by_profile_id`, `inventory_loan_requests.responsible_profile_id`/
  `approved_by_profile_id`/`rejected_by_profile_id`/`delivered_by_profile_id`/`returned_by_profile_id`,
  `department_activity_reports.created_by_profile_id`, `department_manual_members.linked_profile_id`/
  `created_by_profile_id` — todas `on delete set null`, el registro nunca desaparece.
- **Bloquea el borrado** (única excepción): `inventory_loan_requests.requested_by_profile_id` es
  `on delete restrict` a propósito (migración 0057: "nunca se borra el rastro de quién solicitó un
  préstamo"). `admin-delete-user` lo detecta ANTES de intentar el borrado (no deja que Postgres lo
  rechace con un error de FK crudo) y responde con un mensaje explícito: *"Este usuario tiene
  solicitudes de préstamo del inventario a su nombre; no se puede eliminar (se preserva el historial).
  Podés desactivarlo en su lugar."* No se modificó esa FK — cambiarla a `set null` hubiera contradicho
  la garantía explícita de esa migración.

**Protecciones**:
- Nadie puede eliminarse a sí mismo (`body.profile_id === actorProfile.id`), ni siquiera
  `informatica_r4`.
- No se puede eliminar al único `informatica_r4` **activo** del sistema (cuenta roles + estado de
  `profiles.is_active`, no solo la fila de `user_roles`) — protección que **no existía en ningún punto
  del sistema** antes de esta ronda (tampoco en `admin-update-user`, que queda fuera de este alcance por
  decisión explícita).
- Auditoría manual **antes** de ejecutar el borrado real, vía `record_manual_audit_event` (RPC, cliente
  del actor — no `service_role`), acción nueva `admin_delete_user` agregada al allowlist en migración
  `0065_admin_delete_user_audit.sql`. Necesario porque el borrado en cascada de `profiles` sí queda
  auditado automáticamente por el trigger existente, pero con `actor_profile_id = null` (corre bajo
  `service_role`, sin JWT de usuario) — el evento manual es el que deja constancia real de quién ejecutó
  la acción.

### 28.4 UI — botón "Eliminar usuario"

Nueva sección "Zona de riesgo" al final de `UsuarioDetallePage.tsx`, visible únicamente si
`isCurrentUserSuperAdmin` (rol `informatica_r4` real, ni siquiera `integrante_informatica` lo ve) y
`!isEditingSelf` (nunca en el propio perfil). Abre `DeleteUserConfirmModal` (componente nuevo,
`src/components/ui/DeleteUserConfirmModal.tsx`): a diferencia de `ReasonPromptModal` (motivo libre,
usado para bajas reversibles como vehículos/personal), esta exige **tipear el nombre completo exacto**
del usuario antes de habilitar el botón de confirmación — refuerzo mayor para una acción irreversible
que borra la cuenta de acceso. Si `admin-delete-user` responde con error (permiso, último admin,
solicitudes de préstamo, etc.), el modal lo muestra tal cual (vía `describeSupabaseError`) sin cerrarse,
en vez de un mensaje genérico. Al confirmar con éxito, navega a `/usuarios`.

### 28.5 Migraciones y despliegue de esta ronda

- `0065_admin_delete_user_audit.sql` — amplía el allowlist de `record_manual_audit_event()` con
  `table_name='auth_users'`/`action='admin_delete_user'` (mismo patrón que `admin_auth_update` de 0044).
- Edge Function nueva: `admin-delete-user` — desplegar con `supabase functions deploy admin-delete-user`.
- Sin cambios a `admin-update-user` ni a ninguna otra función existente.
- Redeploy normal del frontend (Vercel).

### 28.6 Cómo probar (checklist recomendado)

1. Con `informatica_r4`/`integrante_informatica`/`secretario_regional`/`director_escuela`: generar
   "Departamentos Regionales — General" y confirmar que el PDF trae el ranking de todos los
   departamentos con datos reales.
2. Con esos mismos roles: generar "Departamento específico" eligiendo uno del selector completo.
3. Asignar a un usuario sin esos roles como coordinador de un departamento (y sin ninguno de los roles
   de acceso a Reportes) y confirmar que NO ve "Reportes" en absoluto. Asignarle además
   `jefe_cuerpo_activo` y confirmar que ahora sí ve "Departamento específico" (nunca "General"),
   acotado únicamente al departamento que coordina.
4. Con `jefe_cuerpo_activo`/`usuario_carga_cuartel` sin coordinar ningún departamento: confirmar que no
   aparecen los reportes de Departamentos en absoluto.
5. Como `informatica_r4`, abrir el detalle de otro usuario y confirmar que aparece "Zona de riesgo" con
   el botón "Eliminar usuario"; confirmar que NO aparece en el propio perfil, ni para
   `integrante_informatica`.
6. Intentar eliminar sin escribir el nombre completo exacto: el botón de confirmación debe quedar
   deshabilitado.
7. Intentar eliminar al único `informatica_r4` activo del sistema (con otro usuario `informatica_r4`
   activo) y confirmar el mensaje de bloqueo.
8. Intentar eliminar un usuario que alguna vez cargó una solicitud de préstamo del inventario y
   confirmar el mensaje específico (no un error de FK crudo).
9. Eliminar un usuario de prueba sin conflictos y confirmar en `/auditoria` que queda un evento
   `admin_delete_user` con el actor real (no null) y el nombre del usuario eliminado.

## 29. Estabilidad global, Auditoría por rol/alcance y notificaciones inteligentes (2026-08) — migraciones 0066-0068

### 29.1 Causa confirmada de las recargas / pérdida de ruta

Con evidencia directa de código (no supuesta): `src/main.tsx` registraba el service worker con
`registerSW({ immediate: true })` **sin pasar `onNeedReload`**. El código fuente real de
`vite-plugin-pwa` (`registerType: 'autoUpdate'`) hace, en ese caso, `window.location.reload()`
automático y sin aviso apenas el service worker nuevo termina de activarse. Como `src/sw.ts` además
tenía `self.skipWaiting()` incondicional en `install` + `self.clients.claim()` en `activate`, un
service worker nuevo tomaba control de las pestañas ya abiertas de inmediato. El disparador típico:
si hubo un deploy nuevo mientras la PWA estaba en background (ej. el usuario cambió a WhatsApp), al
volver el navegador revalida el service worker, detecta la versión nueva, la activa, y sin
`onNeedReload` la librería recargaba todo sin preguntar — perdiendo cualquier dato/ruta en curso. No
había ningún código propio (`location.reload()`, redirect a `/panel`) causando esto directamente; el
`path="*"` → `/panel` de `App.tsx` solo entraba en juego si la URL en curso no coincidía con ninguna
ruta definida en el momento del reload.

Contribuyente secundario (percepción de "recarga", no una navegación real): en `useAuth.tsx`, el
`useEffect` que carga el perfil dependía de `[session?.user]` — un objeto con referencia nueva en
cada `TOKEN_REFRESHED` (disparado seguido al recuperar foco si el token estaba por vencer), aunque el
usuario fuera el mismo. Eso ponía `loading=true` de nuevo en cada refresh, haciendo parpadear el
spinner de `ProtectedRoute` sobre la pantalla actual.

### 29.2 Qué se corrigió en PWA/Auth/Router

- **`vite.config.ts`**: `registerType` cambiado de `'autoUpdate'` a `'prompt'` — la librería ya no
  manda `skipWaiting()` sola ni recarga automáticamente.
- **`src/sw.ts`**: se quitó `self.skipWaiting()` incondicional de `install`. Ahora el SW nuevo queda
  en estado "esperando" hasta recibir `{type: 'SKIP_WAITING'}` por `postMessage` (nuevo listener de
  `message`), que solo se envía cuando el usuario confirma la actualización.
- **`src/main.tsx`**: `registerSW({ onNeedRefresh })` — cuando hay una versión nueva esperando, se
  notifica al banner en vez de recargar. `updateServiceWorker()` (la función que devuelve `registerSW`)
  solo se invoca cuando el usuario hace clic en "Actualizar ahora".
- **`src/lib/swUpdate.ts`** (nuevo) + **`src/components/SwUpdateBanner.tsx`** (nuevo, montado en
  `App.tsx` fuera de `AuthProvider` para que funcione incluso en `/login`): banner fino arriba de toda
  la pantalla, no bloqueante, con "Actualizar ahora" y un botón para descartarlo. Reemplaza el
  auto-reload silencioso — la actualización real se sigue aplicando (el service worker nuevo entra en
  vigencia), pero solo cuando el usuario lo decide.
- **`src/hooks/useAuth.tsx`**: el `useEffect` de carga de perfil ahora depende de `[session?.user?.id]`
  (no del objeto `session?.user` completo), y solo pone `loading=true` si todavía no hay un perfil
  cargado. Un `TOKEN_REFRESHED` con el mismo usuario ya no dispara un refetch completo ni un parpadeo
  de spinner.
- **`AjustesPage.tsx`**: se corrigió el texto sobre actualización de la app, que describía el
  comportamiento viejo ("se actualiza sola... recarga automática") — ahora explica el banner nuevo.

No se tocó nada de `AppUpdateBanner.tsx` (el modal de "novedades", mecanismo completamente distinto,
basado en `localStorage`, sin relación con el service worker) ni la carga de documentos en mobile.

### 29.3 Auditoría por rol y alcance

`AuditoriaPage.tsx` ya tenía `buildEventSummary()` (frases institucionales en español, ej. "Juan Pérez
modificó Vehículos: DEF-123") y un toggle "Ver datos técnicos" por fila (JSON crudo, colapsado por
defecto) — gran parte de lo pedido en el punto 3 (UX institucional/técnica) ya existía. Lo que faltaba:

- **Filtrado de tablas por rol** (`src/lib/api/auditLogs.ts`: nuevo parámetro `allowedTableNames` en
  `AuditLogFilters`/`fetchAuditLogs`/`fetchDistinctAuditActions`/`fetchDistinctAuditTables`, vía
  `.in('table_name', ...)`). RLS ya acota las FILAS por territorio (región/subsede/cuartel); esto acota
  además qué MÓDULOS puede ver cada rol, independiente del territorio:
  - `informatica_r4`/`integrante_informatica`: sin restricción, ven todo (allowlist `null`).
  - `jefe_cuerpo_activo`: `stations`, `profiles`, `user_roles`, `user_scopes`, `vehicles`, `personnel`,
    `documents`, `document_versions`, `attendance_summaries`, `intervention_summaries`,
    `station_history_events`, `calendar_events` — nada de Departamentos ni Inventario Regional.
  - `director_escuela`/`instructor`: `courses`, `course_stations`, `calendar_events`, `profiles`,
    `user_roles`.
  - `secretario_regional`: set amplio (territorio regional/subsede/cuartel + cursos + departamentos +
    inventario), coherente con su rol administrativo regional.
  - Coordinador o miembro de al menos un departamento (`fetchMyDepartmentIds`, nuevo en
    `src/lib/api/departments.ts`: todos los `department_id` donde el perfil es coordinador o miembro,
    ya que `department_members` no tiene columna de rol interno): `departments`, `department_members`,
    `department_activity_reports`, `department_manual_members`, **acotado además a sus propios
    department_id** — `department_activity_reports`/`department_manual_members` no tienen scope
    territorial en RLS (lectura abierta a cualquier autenticado), así que ese recorte se hace
    client-side en `AuditoriaPage.tsx` (`visibleLogs`), leyendo `department_id` desde
    `old_value`/`new_value` de cada evento (no hay columna `department_id` en `audit_logs`).
    `secretario_regional`/`informatica_r4` ven todos los departamentos, sin este recorte.
  - Un rol que no calce en ningún set (ej. `presidente_cuartel`, `secretario_comision` — RLS igual los
    deja pasar con alcance de cuartel) recibe el mismo set acotado que `jefe_cuerpo_activo`, el más
    chico entre los definidos, en vez de quedar sin restricción por descarte.
- **Vista institucional vs. técnica**: el toggle "Ver datos técnicos" (JSON crudo) ahora solo se
  renderiza si `isAdmin` (`informatica_r4`/`integrante_informatica`) — `AuditLogDetail` recibe un nuevo
  prop `showTechnical`. El resto de los roles ve únicamente la frase institucional y el diff de campos
  ya traducido (`buildFieldDiff`), sin acceso al JSON crudo ni a los nombres técnicos de tabla en ese
  nivel de detalle.

### 29.4 Notificaciones sensibles inmediatas (migración 0066)

Cuatro triggers nuevos, todos insertando vía `notify_informatica_staff()` (una notificación
`profile_id`-puntual por cada `informatica_r4`/`integrante_informatica` **activo** — nunca una
notificación masiva sin scope, para no violar `notifications_scope_not_ambiguous`):

- `trg_notify_role_change` (`user_roles`, insert/delete): alta o baja de un rol a cualquier usuario.
- `trg_notify_scope_change` (`user_scopes`, insert/delete): alta o baja de un alcance a cualquier
  usuario.
- `trg_notify_profile_lifecycle` (`profiles`, insert/update): creación de usuario, y desactivación/
  reactivación (`is_active` cambia).
- `notify_admin_delete_user()`: **no** es un trigger (el borrado real ocurre en `auth.users`, no hay
  fila `new` de `profiles` para leer de forma confiable en ese punto) — se llama explícitamente desde
  `admin-delete-user` (Edge Function) después de un borrado exitoso, con el cliente del actor real.

Ninguno se auto-dispara cuando el propio afectado es quien ejecuta el cambio (evita que informática se
auto-notifique en sesiones administrativas normales) — salvo que la operación corra con `service_role`
(Edge Functions `admin-*`), donde no hay forma de resolver el actor real y se prefiere notificar de más
antes que perder el aviso. Tipo de notificación nuevo: `alerta_admin` (agregado al enum
`notification_type` y a `src/types/database.ts`/`humanize.ts`/`NotificacionesPage.tsx`).

### 29.5 Resumen semanal enriquecido (migración 0067)

`send_weekly_reminder()` (migración 0036, cron `siger4-weekly-reminder`, lunes 12:00 ART) **no se
tocó**: sigue siendo el recordatorio genérico para todos los usuarios activos con
`weekly_reminder_enabled=true`. Se agregó, aparte:

- **`send_weekly_admin_summary()`** — función nueva, itera solo sobre `informatica_r4`/
  `integrante_informatica` activos con `weekly_admin_summary_enabled=true` (columna nueva en
  `profiles`, mismo patrón que `weekly_reminder_enabled`, default `true`). El resumen incluye:
  cuarteles en rojo y en amarillo del semáforo (`station_compliance`) con su % de carga institucional
  (ej. "BV Villa del Rosario (43% de carga institucional)"), cuarteles sin actividad relevante hace más
  de 30 días (`last_relevant_update_at`), solicitudes de préstamo pendientes y vencidas, documentos
  nuevos de la semana, usuarios creados/desactivados/eliminados de la semana (via `audit_logs`),
  departamentos con al menos un informe de actividad en la semana.
- **Cron nuevo**: `siger4-weekly-admin-summary`, lunes 15:30 UTC (12:30 ART, 30 minutos después del
  recordatorio genérico, para no competir por la misma ventana de `pg_net`).
- **Toggle en Ajustes** (solo visible para `isAdmin`): "Resumen semanal administrativo", mismo patrón
  que el toggle de recordatorio genérico ya existente.
- Push real: igual que `send_weekly_reminder()`, vía `net.http_post` → `send-push-system` (con
  `x-cron-secret`), porque es un evento de cron sin usuario necesariamente conectado — no alcanza con
  insertar en `notifications` y esperar a `NotificationPushBridge`.

### 29.6 Recordatorio automático de devolución de préstamos (migración 0068)

Mismo patrón que `send_calendar_event_reminders()` (0051): función + `pg_cron`, sin `pg_net` (inserta
en `notifications`, `NotificationPushBridge` dispara el push si el destinatario tiene la app abierta) —
excepto el aviso a informática de un préstamo vencido, que además usa `notify_informatica_staff()`.

- **Columnas nuevas** en `inventory_loan_requests`: `reminder_sent_at`, `overdue_notified_at` — mismo
  criterio que `calendar_events.reminder_sent_at`, para no reenviar el mismo aviso en cada corrida del
  cron.
- **Tipos de notificación nuevos**: `prestamo_por_vencer`, `prestamo_vencido`.
- **`send_loan_return_reminders()`**: para solicitudes `status='retirada'` con `expected_return_at`
  definido —
  - 24hs antes del vencimiento (`expected_return_at` entre `now()` y `now() + 24h`, `reminder_sent_at`
    null): notifica al cuartel solicitante (alcance) y al responsable del elemento (puntual, si existe)
    — una sola vez, marca `reminder_sent_at`.
  - Ya vencido (`expected_return_at <= now()`, `overdue_notified_at` null): notifica al cuartel
    solicitante, al responsable, **y a informática** (vía `notify_informatica_staff`, solo en este
    caso, no en el aviso "por vencer" — se escala solo cuando ya es un problema real) — una sola vez,
    marca `overdue_notified_at`.
- **Cron nuevo**: `siger4-loan-return-reminders`, cada hora en punto.

### 29.7 Migraciones y despliegue de esta ronda

- `0066_admin_sensitive_notifications.sql` — tipo `alerta_admin`, `notify_informatica_staff()`,
  triggers de rol/scope/alta-baja de usuario, `notify_admin_delete_user()`.
- `0067_weekly_admin_summary.sql` — columna `weekly_admin_summary_enabled`, `send_weekly_admin_summary()`,
  cron `siger4-weekly-admin-summary`.
- `0068_loan_return_reminders.sql` — tipos `prestamo_por_vencer`/`prestamo_vencido`, columnas
  `reminder_sent_at`/`overdue_notified_at` en `inventory_loan_requests`, `send_loan_return_reminders()`,
  cron `siger4-loan-return-reminders`.
- **Edge Function modificada** (no nueva): `admin-delete-user` — llama a `notify_admin_delete_user`
  después de un borrado exitoso. Redesplegar con `supabase functions deploy admin-delete-user`.
- Las 3 migraciones reutilizan `pg_cron`/`pg_net` y la config de `project_url`/`cron_shared_secret`
  ya configurada desde la migración 0036 (desde `0073`, en `system_settings` — ver sección 6.3/32) —
  no hace falta volver a habilitar extensiones ni reconfigurar secretos si el proyecto ya tenía el
  recordatorio semanal genérico funcionando.
- Redeploy normal del frontend (Vercel).

### 29.8 Cómo verificar

1. **PWA**: hacer un deploy nuevo, abrir SIGER4 en un dispositivo con una pestaña/PWA ya abierta desde
   antes, cambiar a otra app y volver — confirmar que aparece el banner "Hay una actualización
   disponible" en vez de una recarga silenciosa, y que tocar "Actualizar ahora" sí aplica la
   actualización (confirmar el build nuevo en Ajustes).
2. **Auth**: dejar la pestaña en background el tiempo suficiente para que el token se refresque al
   volver, y confirmar que no hay parpadeo de spinner ni pérdida de la ruta/formulario en curso.
3. **Auditoría**: con `jefe_cuerpo_activo`, confirmar que el selector de "Tabla / módulo" no ofrece
   Departamentos ni Inventario Regional, y que el toggle "Ver datos técnicos" no aparece en el detalle
   de ningún evento. Con `informatica_r4`, confirmar que sí aparece.
4. Con un usuario que coordina o es miembro de un departamento (y no es `secretario_regional`/admin):
   cargar un informe de actividad en ESE departamento y en OTRO (con otro usuario), y confirmar en
   Auditoría que solo ve el evento del departamento propio.
5. Cambiarle un rol a un usuario de prueba y confirmar que llega una notificación `alerta_admin` a
   informática (y no al usuario cuyo rol cambió, salvo que también sea de informática y no sea el
   propio actor).
6. Desactivar y reactivar un usuario de prueba, y confirmar las 2 notificaciones correspondientes.
7. Correr manualmente `select send_weekly_admin_summary();` desde el SQL Editor de Supabase y
   confirmar en `/notificaciones` (con un usuario `informatica_r4`) que el resumen trae datos reales
   (no placeholders).
8. Crear una solicitud de préstamo de prueba, marcarla `retirada` con `expected_return_at` en menos de
   24hs, correr `select send_loan_return_reminders();` manualmente, y confirmar la notificación de
   "por vencer" al cuartel solicitante. Repetir con `expected_return_at` ya vencido y confirmar el
   aviso de "vencido" además de la notificación a informática.

## 30. QA funcional de estabilidad/Auditoría/notificaciones (2026-08) — migraciones 0069-0070

Pasada de QA sobre la sección 29 (sin agregar módulos nuevos). Se revisó cada punto con lectura
adversarial del código real (no solo relectura de lo ya documentado), verificando código fuente de
librerías de terceros y tipos de Postgres donde hizo falta.

### 30.1 Bugs encontrados y corregidos

1. **[Alto] `useAuth.tsx`: `loading` podía quedar pegado en `true` para siempre.** El `.then(...)` de
   `fetchCurrentUserContext(...)` no tenía `.catch()`. Confirmado contra el código fuente de
   `@supabase/postgrest-js` que un error de red real (no un `{error}` de Postgrest, sino que el propio
   `fetch` falle — típico al recuperar conectividad inestable al volver de background) puede rechazar
   la promesa en vez de resolver con un objeto de error. Sin `.catch()`, `setLoading(false)` nunca se
   llamaba, y `ProtectedRoute` quedaba mostrando el spinner de pantalla completa indefinidamente — el
   mismo escenario de "background con red inestable" que toda la sección 29 intentaba mejorar,
   empeorado a un cuelgue total. **Corregido**: se agregó `.catch()` con `setLoading(false)`.
2. **[Alto] Spam de notificaciones por alta/edición de usuario.** `trg_notify_role_change`/
   `trg_notify_scope_change` (migración 0066) eran `for each row`: un `insert` de N filas en una sola
   sentencia (ej. `admin-create-user` asignando 2 roles con un solo INSERT multi-fila) disparaba el
   trigger N veces — N notificaciones separadas por una sola acción. Se agravaba con
   `admin-update-user`, que reemplaza roles/scopes con el patrón "borrar todo lo previo + insertar todo
   lo nuevo": editar 1 rol de una lista de 3 generaba hasta 7 notificaciones de "cambio de rol" para lo
   que conceptualmente es "se agregó un rol". Contradecía directamente el objetivo explícito de "no
   notificar cada acción normal". **Corregido** (migración `0069`): los triggers pasan a
   `for each statement` con transition tables (`old_table`/`new_table`, Postgres 10+) — un solo aviso
   por sentencia SQL, que resume todos los roles/scopes tocados en un único mensaje (ej. "Roles
   asignados: Juan Pérez → jefe_cuerpo_activo, María Gómez → instructor").
3. **[Medio] Sin protección contra solapamiento de `pg_cron` en el recordatorio de préstamos.** Si
   `send_loan_return_reminders()` tardara más de una hora en correr (o se ejecutara manualmente
   mientras el cron también corre), dos ejecuciones concurrentes podían leer la misma solicitud con
   `overdue_notified_at is null` antes de que cualquiera la actualizara, generando el aviso de
   "vencido" duplicado. **Corregido** (migración `0070`): `pg_try_advisory_xact_lock` al inicio de la
   función — si otra ejecución ya tiene el lock, la corrida actual no hace nada y retorna de inmediato.
4. **[Bajo] `AuditoriaPage.tsx`: error de `fetchMyDepartmentIds` tragado en silencio.** Un fallo de red
   transitorio en esa llamada dejaba a un coordinador/miembro de departamento viendo cero eventos de
   Departamentos, indistinguible de "no tiene departamentos asignados" — sin log ni aviso visible, a
   diferencia del resto de errores de la página. **Corregido**: se agregó `console.warn` + mensaje de
   error visible en la UI.
5. **[Bajo] `AuditoriaPage.tsx`: `page` no se reseteaba cuando `allowedTableNames` cambiaba de forma
   asíncrona.** `myDepartmentIds` se resuelve después del primer render; si el usuario ya había
   avanzado de página antes de que resolviera, el refetch posterior (con un `allowedTableNames`
   ampliado) podía dejarlo en una página fuera de rango del nuevo resultado filtrado. **Corregido**: un
   `useEffect` nuevo resetea `page` a 0 cuando cambia `allowedTableNames`.

### 30.2 Verificado explícitamente y confirmado SIN bugs (con evidencia, no solo relectura)

- **PWA**: el flujo completo `onNeedRefresh → banner → click → updateServiceWorker → messageSkipWaiting
  → SW ejecuta skipWaiting() → evento `controlling` → recién ahí `location.reload()`** se confirmó
  contra el código fuente real de `vite-plugin-pwa` (`node_modules/vite-plugin-pwa/dist/client/build/register.js`).
  El reload solo ocurre tras confirmación explícita del usuario, nunca antes. No quedó ningún
  `location.reload()` propio del proyecto fuera de ese camino.
- **`session?.user?.id` como dependencia** (en vez de `session?.user`): no se encontró ningún flujo
  real de la app que dependa de reaccionar a un `session.user` con el mismo `id` pero distinta
  metadata (verificación de email, etc.) — los lugares que necesitan refrescar el perfil ya llaman
  explícitamente a `refreshProfile()`.
- **Redirects durante `loading`**: `ProtectedRoute`/`ReportsRoute`/`UserManagerRoute`/
  `UserCreatorRoute` siguen chequeando `loading` antes que cualquier otra condición: no hay ventana de
  redirect indebido.
- **"Al devolver deja de notificar" (el punto más crítico del pedido de préstamos)**: verificado
  explícitamente que el `WHERE status = 'retirada'` de ambos loops de `send_loan_return_reminders()`
  excluye automáticamente, en la corrida siguiente del cron, cualquier solicitud que ya haya pasado a
  `devuelta` — sin importar si ya se le había enviado el aviso de "vencido" antes. No hace falta
  resetear `reminder_sent_at`/`overdue_notified_at`: el filtro de `status` ya es suficiente y
  determinante.
- **`notifications_scope_not_ambiguous`**: los 6 `insert into notifications` de las migraciones 0066-0068
  se verificaron uno por uno contra la lista exacta de columnas de cada sentencia — ninguno setea más
  de un nivel territorial junto con `profile_id` null.
- **Nombres de columna contra tablas reales** (`station_compliance.compliant_count`/`compliant_total`/
  `compliance_status`/`last_relevant_update_at`, `inventory_items.responsible_profile_id`,
  `audit_logs.old_value`/`new_value`): todos verificados contra las migraciones que definen cada
  tabla/vista — sin discrepancias.
- **`round(100.0 * compliant_count / nullif(compliant_total, 0))`**: se confirmó que no falla en
  runtime — `100.0` es un literal `numeric` (no `double precision`), y con `compliant_count`/
  `compliant_total` como `integer`, toda la cadena de operaciones queda en `numeric`, para el cual
  `round()` de un solo argumento sí existe en Postgres.
- **Filtro de Auditoría por rol**: unión de sets con múltiples roles simultáneos, cobertura de
  `TABLE_LABELS` para las 4 constantes de tablas por rol, y fidelidad del código a la decisión de
  `secretario_regional` (alcance regional amplio, sin recorte de "mis departamentos") — todo
  verificado sin bugs.
- **`send_weekly_admin_summary()` vs `send_weekly_reminder()`**: usan tipos de notificación distintos
  (`alerta_admin` vs `recordatorio_semanal`); que un usuario de informática reciba ambas notificaciones
  esa semana es la intención documentada, no una duplicación accidental.

### 30.3 Migraciones nuevas de esta ronda

- `0069_fix_notification_spam.sql` — `trg_notify_role_change`/`trg_notify_scope_change` pasan de
  `for each row` a `for each statement` con transition tables.
- `0070_loan_reminders_advisory_lock.sql` — `send_loan_return_reminders()` redefinida con
  `pg_try_advisory_xact_lock` al inicio.

No se tocó ninguna Edge Function ni el frontend de PWA/Auth más allá del `.catch()` de `useAuth.tsx` y
los 2 fixes menores de `AuditoriaPage.tsx`.

#### 30.3.1 Corrección a `0069` (2026-08-09) — error `0A000` al aplicarla en Supabase

El primer contenido de `0069` fallaba en Supabase con
`ERROR: 0A000: transition tables cannot be specified for triggers with more than one event`: declaraba
un único trigger por tabla con `after insert or delete ... referencing new table ... old table ... for
each statement` — Postgres no permite `REFERENCING NEW TABLE`/`OLD TABLE` en un trigger que escucha más
de un evento a la vez. Como el error abortó la transacción completa, **nada de `0069` llegó a aplicarse
en la base** (ni las funciones ni los triggers nuevos, y los triggers viejos de `0066` siguieron
intactos) — no quedó ningún estado a medias que limpiar.

**Se corrigió el archivo `0069_fix_notification_spam.sql` in-place** (no se creó un `0071` aparte,
justamente porque no había nada que reconciliar): ahora declara **cuatro** triggers en vez de dos, uno
por tabla y por evento — `trg_notify_role_added`/`trg_notify_role_removed` sobre `user_roles`,
`trg_notify_scope_added`/`trg_notify_scope_removed` sobre `user_scopes` — cada uno con su propia función
y su propia transition table (`new_table` en los de INSERT, `old_table` en los de DELETE). El
comportamiento observable es idéntico al diseño original: un `insert` multi-fila de roles (alta de
usuario con varios roles) sigue generando **una sola** notificación agrupada; el patrón "borrar todo +
insertar todo" de `admin-update-user` sigue generando **dos** notificaciones (una de "quitados", una de
"agregados"), no una por fila. También se agregó `drop function if exists notify_role_change()`/
`notify_scope_change()` al final, para no dejar las funciones combinadas de `0066` (ahora sin trigger
que las use) como código muerto en la base.

**Qué correr en Supabase**: si ya intentaste aplicar la versión anterior de `0069` y falló, no hace
falta revertir nada — corré el archivo `0069_fix_notification_spam.sql` tal como está ahora (con su
contenido corregido) desde cero; el `drop trigger if exists`/`drop function if exists` al principio y al
final lo hacen seguro de re-ejecutar. Seguí aplicando `0070` después, sin cambios (ya se había aplicado
correctamente en la ronda anterior y no depende de nada de este fix).

### 30.4 Queries de verificación de cron / pg_net (correr en el SQL Editor de Supabase)

**Confirmar que los 5 jobs de `pg_cron` del sistema existen y están activos:**
```sql
select jobid, jobname, schedule, active
from cron.job
where jobname like 'siger4-%'
order by jobname;
```
Se esperan exactamente estas 5 filas, todas con `active = true`:

| jobname | schedule | qué hace |
|---|---|---|
| `siger4-calendar-reminders` | `*/5 * * * *` | Recordatorios de eventos de calendario (0051) |
| `siger4-document-purge` | `0 6 * * *` | Purga diaria de documentos en papelera vencidos (0053) |
| `siger4-loan-return-reminders` | `0 * * * *` | Recordatorio de devolución de préstamos (0068/0070) |
| `siger4-weekly-admin-summary` | `30 15 * * 1` | Resumen semanal enriquecido, solo informática (0067) |
| `siger4-weekly-reminder` | `0 15 * * 1` | Recordatorio semanal genérico, todos los usuarios (0036) |

**Confirmar que `pg_net`/`pg_cron` están habilitados como extensión:**
```sql
select extname, extversion from pg_extension where extname in ('pg_cron', 'pg_net');
```
Deben aparecer ambas filas.

**Confirmar que la config de `project_url`/`cron_shared_secret` está seteada** (necesaria para que
`send_weekly_reminder()`, `send_weekly_admin_summary()` y `trigger_document_purge()` puedan disparar el
push real vía `pg_net`; sin esto, las notificaciones internas igual se crean, pero sin push). Desde las
migraciones `0073`/`0074` (ver sección 33), la config vive en la tabla `system_settings`, no en un GUC
de sesión/base (`alter database ... set ...` no funciona en el SQL Editor de Supabase — ver sección
6.3). La forma recomendada de confirmarlo es la propia UI: `/ajustes` → "Configuración del sistema"
(logueado como `informatica_r4`) muestra el estado de cada clave sin exponer el secreto. Por SQL
directo (también solo `informatica_r4`, por RLS):
```sql
select key, is_secret, updated_at from system_settings where key in ('project_url', 'cron_shared_secret');
```
Deben aparecer 2 filas. Si preferís ver también el `value` (solo tiene sentido para `project_url`, que
no es secreto — `cron_shared_secret` sí mostraría el valor real en texto plano si se selecciona esa
columna, evitarlo salvo necesidad puntual y nunca pegar ese resultado en ningún chat/documento):
```sql
select key, value, is_secret, updated_at from system_settings where key in ('project_url', 'cron_shared_secret');
```
Si falta la fila de `cron_shared_secret`, configurarla desde `/ajustes` → "Configuración del sistema"
— **no** desde el SQL Editor (ver sección 33.3 para por qué eso no funciona).

**Ver las últimas ejecuciones de cada job (éxito/error, duración):**
```sql
select j.jobname, r.status, r.return_message, r.start_time, r.end_time
from cron.job_run_details r
join cron.job j on j.jobid = r.jobid
where j.jobname like 'siger4-%'
order by r.start_time desc
limit 30;
```

**Confirmar que los advisory locks (migraciones 0070/0072) no dejan ningún job "colgado":**
```sql
select * from pg_locks where locktype = 'advisory';
```
Fuera de una ejecución en curso, esta consulta no debería devolver ninguna fila para los locks de
`send_loan_return_reminders`/`send_weekly_reminder`/`send_weekly_admin_summary` (los 3 son
`xact`-scoped, se liberan solos al terminar la transacción del cron job — si aparece una fila
persistente entre corridas, algo quedó mal).

### 30.4.1 Diagnóstico paso a paso: "no llegó el recordatorio/resumen semanal"

Playbook para cuando un recordatorio semanal (genérico o el resumen de informática) no llegó como push
o ni siquiera se creó como notificación interna. Corré las queries EN ESTE ORDEN — cada una acota el
punto exacto donde se cortó la cadena `cron → función SQL → notifications → net.http_post →
send-push-system → push_send_log → push real`. Reemplazá las fechas por la semana que corresponda
verificar (ejemplo: lunes 2026-08-10).

1. **¿Está la config de push del sistema?** (causa más común — si falta, la notificación interna igual
   se crea pero nunca se intenta el push real). Desde la migración `0073`, la config vive en
   `system_settings`, no en un GUC (`current_setting`/`alter database` no funciona en el SQL Editor de
   Supabase — ver sección 6.3):
   ```sql
   select key, value, is_secret, updated_at
   from system_settings
   where key in ('project_url', 'cron_shared_secret');
   ```
   Deben aparecer 2 filas (solo `informatica_r4` puede correr esta query, por RLS). Si falta
   `cron_shared_secret`, configurarla desde `/ajustes` → "Configuración del sistema" — **no** desde el
   SQL Editor, `set_system_setting()` no funciona ahí (ver sección 33.3). Si aparece, comparar a mano
   el `value` mostrado contra el secreto `CRON_SHARED_SECRET` configurado en la Edge Function
   `send-push-system` (Dashboard → Edge Functions → send-push-system → Secrets) — un desajuste entre
   ambos hace que `send-push-system` responda 401 sin registrar nada en `push_send_log`.

2. **¿Existen los jobs y están activos?**
   ```sql
   select jobid, jobname, schedule, active, username
   from cron.job
   where jobname in ('siger4-weekly-reminder', 'siger4-weekly-admin-summary');
   ```
   Se esperan 2 filas, `active = true`. Anotar `username` — si no es el rol dueño del proyecto
   (típicamente `postgres`), puede afectar qué ve `station_compliance` en el resumen admin (la vista es
   `security_invoker`, hereda RLS del rol que ejecuta la función).

3. **¿Corrió el job, y falló?**
   ```sql
   select j.jobname, r.status, r.return_message, r.start_time, r.end_time
   from cron.job_run_details r
   join cron.job j on j.jobid = r.jobid
   where j.jobname in ('siger4-weekly-reminder', 'siger4-weekly-admin-summary')
     and r.start_time >= '2026-08-10 00:00:00-03'
     and r.start_time <  '2026-08-11 00:00:00-03'
   order by r.start_time desc;
   ```
   Sin filas: el job ni se disparó (ver punto 2). `status = 'failed'`: el `return_message` trae el
   error real — para el resumen admin, reproducirlo sin esperar al lunes con
   `select send_weekly_admin_summary();` (esto SÍ genera notificaciones/push reales, avisar antes de
   correrlo en producción).

4. **¿Se crearon las notificaciones internas?**
   ```sql
   select id, profile_id, type, title, created_at
   from notifications
   where type in ('recordatorio_semanal', 'alerta_admin')
     and created_at >= '2026-08-10 00:00:00-03'
     and created_at <  '2026-08-11 00:00:00-03'
   order by created_at desc;
   ```
   Si no hay filas pero el job sí corrió sin error (paso 3), revisar el punto 6 (perfiles filtrados).

5. **¿Llegó el intento de push hasta `send-push-system`?**
   ```sql
   select notification_id, profile_id, status, recipients_count, sent_count, error_message, created_at
   from push_send_log
   where created_at >= '2026-08-10 00:00:00-03'
     and created_at <  '2026-08-11 00:00:00-03'
   order by created_at desc;
   ```
   Notificación en el paso 4 sin fila acá → nunca se llamó a `net.http_post` (config faltante, paso 1)
   o `pg_net` no procesó la request (ver punto 5 bis). `status='ok'` con `sent_count=0` →
   no había `push_subscriptions` activas para ese perfil (paso 7). `sent_count > 0` → el push salió
   del backend correctamente; si el usuario igual no lo vio, el problema está en su dispositivo/SO
   (permisos revocados, Do Not Disturb, optimización de batería matando el service worker), no en
   SIGER4.

   **5 bis — ¿`pg_net` efectivamente ejecutó la llamada HTTP?**
   ```sql
   select id, url, status_code, created, error_msg
   from net._http_response
   where created >= '2026-08-10 14:50:00+00' and created <= '2026-08-10 15:45:00+00'
   order by created desc;
   ```
   (nombre de tabla puede variar según versión de `pg_net`; si no existe con ese nombre,
   `select * from net.http_request_queue;` muestra qué quedó encolado sin resolver). `status_code = 401`
   confirma el desajuste de secreto del punto 1.

6. **¿Los perfiles esperados cumplían los filtros?**
   ```sql
   -- Recordatorio general: quién quedó afuera y por qué
   select id, full_name, is_active, weekly_reminder_enabled
   from profiles
   where is_active = true and weekly_reminder_enabled = false;

   -- Resumen admin: rol + toggle correctos
   select p.id, p.full_name, p.is_active, p.weekly_admin_summary_enabled, ur.role
   from profiles p
   join user_roles ur on ur.profile_id = p.id
   where ur.role in ('informatica_r4', 'integrante_informatica');
   ```

7. **¿Había suscripción push activa para el dispositivo esperado?**
   ```sql
   select ps.profile_id, p.full_name, ps.endpoint, ps.user_agent, ps.created_at
   from push_subscriptions ps
   join profiles p on p.id = ps.profile_id
   where p.full_name = '<nombre del usuario a revisar>';
   ```
   Sin filas: el usuario nunca activó (o perdió) el push en ese dispositivo — revisar el estado en
   Ajustes → Notificaciones push (sección 31.7 más abajo cubre los 5 estados posibles).

**Nota sobre zona horaria y día de la semana**: confirmado que no hay desfase — en la sintaxis estándar
de `cron`/`pg_cron`, el campo día-de-semana usa `1` = lunes (`0`/`7` = domingo), así que `'0 15 * * 1'`
y `'30 15 * * 1'` sí corresponden a lunes. Argentina es UTC-3 fijo (sin horario de verano desde 2009),
así que 15:00/15:30 UTC = 12:00/12:30 ART, tal como documentan los propios comentarios de 0036/0067.

### 30.5 Checklist de prueba manual real

1. **PWA**: hacer un deploy nuevo a producción, abrir SIGER4 en un celular con la PWA instalada y ya
   abierta desde antes del deploy, cambiar a otra app (ej. WhatsApp) por al menos 1 minuto, y volver.
   Confirmar: (a) la app NO recargó sola ni volvió al Panel — sigue en la misma pantalla/ruta con
   cualquier dato sin guardar intacto; (b) aparece el banner "Hay una actualización disponible" arriba
   de la pantalla; (c) tocar "Actualizar ahora" sí aplica el cambio (confirmar el build nuevo en
   Ajustes → Versión); (d) si se ignora el banner y se sigue usando la app normalmente, no vuelve a
   recargar sola en ningún momento posterior.
2. **Auth**: con la pestaña/PWA abierta, esperar a que el token se refresque solo (o forzarlo
   revisando el tiempo de expiración en Ajustes/DevTools) y confirmar que no hay parpadeo de spinner
   visible ni pérdida de un formulario a medio completar.
3. **Auditoría — recorrido completo por rol** (usar usuarios de prueba con cada rol, o cambiar roles
   temporalmente a un usuario de prueba):
   - `informatica_r4`: ve todos los módulos en el selector de "Tabla/módulo", y el botón "Ver datos
     técnicos" aparece en el detalle de cualquier evento.
   - `integrante_informatica`: mismo comportamiento que `informatica_r4` (ambos son `isAdmin`).
   - `jefe_cuerpo_activo`: el selector de tabla NO ofrece Departamentos ni Inventario Regional; los
     eventos que ve son solo de su propio cuartel (RLS); no aparece "Ver datos técnicos".
   - `director_escuela`/`instructor`: el selector de tabla ofrece Cursos/Calendario/Usuarios, no
     Vehículos/Personal/Inventario/Departamentos.
   - `secretario_regional`: ve un set amplio (incluye Departamentos, sin recorte de "mis
     departamentos" — ve TODOS), acotado a su región por RLS.
   - Un usuario miembro/coordinador de un departamento (sin otro rol calificante): solo ve las 4 tablas
     de Departamentos, y dentro de esas, solo eventos de SUS departamentos (probar cargando un informe
     de actividad en un departamento propio y en uno ajeno con otro usuario).
   - `invitado`: `/auditoria` muestra "sin permisos", no aparece en el sidebar.
4. **Notificaciones sensibles — verificar que NO hay spam**: crear un usuario de prueba con 2 roles
   asignados de una vez. Confirmar en `/notificaciones` (con un usuario `informatica_r4`) que llega
   **una sola** notificación de "Usuario creado" y **una sola** notificación de "Cambio de rol de
   usuario" (con ambos roles listados en el cuerpo, no 2 notificaciones separadas). Repetir editando
   ese usuario para reemplazar sus 2 roles por otros 2 desde `admin-update-user` y confirmar que sigue
   siendo una notificación de "quitados" y una de "agregados" (no 4).
5. **Resumen semanal**: confirmar el toggle en Ajustes (solo visible para `informatica_r4`/
   `integrante_informatica`), correr `select send_weekly_admin_summary();` manualmente y confirmar en
   `/notificaciones` que el cuerpo trae datos reales (no placeholders) de semáforo, préstamos,
   documentos, usuarios y departamentos.
6. **Recordatorio de préstamos — ciclo completo**: crear una solicitud de préstamo de prueba,
   marcarla `retirada` con `expected_return_at` en menos de 24hs, correr
   `select send_loan_return_reminders();` y confirmar el aviso "por vencer". Ajustar
   `expected_return_at` a una fecha ya pasada (`update inventory_loan_requests set expected_return_at
   = now() - interval '1 hour' where id = '...'`), correr la función de nuevo, y confirmar el aviso de
   "vencido" (incluida la notificación a informática). Finalmente, marcar la solicitud como `devuelta`
   y correr la función una vez más — confirmar que NO se genera ninguna notificación nueva para esa
   solicitud.
7. **Solapamiento de cron**: ejecutar `select send_loan_return_reminders();` dos veces seguidas
   rápidamente desde dos pestañas del SQL Editor (simulando solapamiento) y confirmar que la segunda
   ejecución no genera notificaciones duplicadas (revisar `pg_locks`/logs de `cron.job_run_details` si
   hace falta diagnosticar).

## 31. SIGER4 v1.0 beta — puesta en marcha (2026-08)

Sin migraciones nuevas ni módulos nuevos — esta ronda preparó SIGER4 como primera versión estable
usable en producción real (uso institucional controlado, no solo pruebas), consolidando todo lo
construido en las rondas anteriores en un checklist único de puesta en marcha, la matriz de permisos
final verificada contra el código real, y un checklist de prueba manual compacto.

### 31.1 Versión del sistema

- **Versión visible**: `SIGER4 v1.0.0-beta.1` (formato semver estándar para pre-release). Se lee de
  `package.json` (`"version"`) y se inyecta en build vía `vite.config.ts` como
  `__SIGER4_APP_VERSION__`, igual que ya se hacía con el hash de build (`__SIGER4_BUILD_VERSION__`).
- **Dónde se muestra**:
  - `/ajustes`, arriba de todo, visible a **cualquier usuario**: `SIGER4 v1.0.0-beta.1`.
  - `/ajustes`, sección "Versión / actualización de la app (informática)" (solo `isAdmin`): versión +
    hash de commit + fecha/hora de compilación, sin cambios en el resto de esa sección.
- **Banner de novedades**: se agregó una entrada nueva en `src/config/appUpdates.ts`
  (`id: '2026-08-09-v1-0-beta'`, `severity: 'important'`) resumiendo los cambios institucionales más
  relevantes de esta serie de rondas (Reportes de Departamentos, Auditoría por rol, notificaciones
  automáticas, resumen semanal, recordatorio de préstamos, fix de recargas de PWA). Se muestra una
  sola vez por usuario la próxima vez que entre al sistema (mismo mecanismo ya existente, ver
  sección 22).
- **Para la próxima versión** (`1.0.0-beta.2`, `1.0.0`, etc.): actualizar `package.json` y agregar una
  entrada nueva al principio de `APP_UPDATES` — no hace falta tocar nada más, ambos mecanismos ya
  están conectados.

### 31.2 Checklist de puesta en marcha

Además de la checklist rápida de la sección 0 (deploy técnico), antes de dar acceso a **usuarios
reales** (no solo de prueba) confirmá cada uno de estos puntos:

**Base de datos (Supabase)**
- [ ] **Migraciones**: las 79 migraciones (`0001` a `0079`) corridas en orden en el SQL Editor del
      proyecto real. Confirmar con:
      ```sql
      select count(*) from supabase_migrations.schema_migrations;
      ```
      (si el proyecto no usa el CLI de Supabase para versionar migraciones, alternativamente
      confirmar a mano que las funciones/tablas de la última migración existen, ej.
      `select policyname from pg_policies where tablename = 'notifications' and policyname = 'notifications_write_scoped';`).
- [ ] **RLS activo en todas las tablas**: **Table Editor** → cada tabla con el ícono de RLS en verde
      (ninguna tabla de negocio debe quedar sin RLS habilitado).
- [ ] **`pg_cron`/`pg_net` habilitados**, con los 5 jobs activos y la config de
      `project_url`/`cron_shared_secret` seteada — ver las queries de verificación completas en la
      sección 30.4 (no se repiten acá para no duplicar).
- [ ] **VAPID configurado** (push real, no solo notificaciones internas): `VAPID_PUBLIC_KEY`/
      `VAPID_PRIVATE_KEY`/`VAPID_SUBJECT` como secretos de `send-push`, `VITE_VAPID_PUBLIC_KEY` en
      Vercel — ver sección 1.8 para el paso a paso completo. Sin esto, el sistema funciona igual, pero
      sin push real (solo campanita).
- [ ] **`CRON_SHARED_SECRET`** configurado como secreto de Supabase (usado por `send-push-system`,
      `trigger_document_purge`, `send_weekly_reminder`, `send_weekly_admin_summary`) — ver sección 6.3.
- [ ] **Buckets de Storage verificados**: `station-media` (público), `avatars` (público), `documents`
      (privado) — existen solos al correr las migraciones correspondientes, pero confirmar en
      **Storage** que están presentes con la visibilidad correcta.
- [ ] **Al menos un usuario `informatica_r4` creado** — es el único rol que puede crear otros usuarios
      sin restricción, gestionar roles/scopes, y hacer borrado directo de usuarios. Ver sección 1.5
      para crearlo desde el SQL Editor si es el primero del sistema (antes de que exista ningún
      usuario que pueda usar `admin-create-user`).
- [ ] **Backup/export recomendado antes del primer uso real**: desde el Dashboard de Supabase,
      **Database → Backups** (si el plan lo incluye) o un `pg_dump` manual del esquema + datos antes de
      cargar información institucional real — no es parte del flujo automático de SIGER4, es una
      precaución externa recomendada antes de empezar a cargar datos que importen.

**Edge Functions**
- [ ] Las 6 funciones activas desplegadas: `admin-create-user`, `admin-update-user`,
      `admin-delete-user`, `purge-documents`, `send-push`, `send-push-system`. Confirmar con
      `supabase functions list` o desde el Dashboard (**Edge Functions**).
- [ ] `analyze-report` (Gemini) — **no forma parte del flujo activo del sistema** (ver sección 31.6),
      podés dejarla desplegada sin uso o eliminarla; no bloquea nada si sigue ahí.

**Frontend (Vercel)**
- [ ] Variables de entorno seteadas en **Production** (y Preview/Development si corresponde):
      `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY` (si activaste push) —
      nunca `service_role` ni la clave privada VAPID en el frontend.
- [ ] Build Command `npm run build`, Output Directory `dist`, Framework Preset Vite.
- [ ] Deploy de producción corrido y accesible en el dominio final.

**PWA / dispositivos**
- [ ] **PWA instalada y probada** en al menos un dispositivo Android real (no solo `localhost`) —
      confirmar que el manifest/ícono/instalación funcionan en el dominio de producción.
- [ ] **Push probado de punta a punta**: activar notificaciones push desde `/ajustes` en un
      dispositivo real, usar el botón "Probar notificación", confirmar que llega tanto la
      notificación interna como el push real del sistema operativo.
- [ ] **Banner de actualización probado** al menos una vez: hacer un deploy nuevo con la PWA ya
      abierta desde antes y confirmar que aparece el aviso (no una recarga silenciosa) — ver
      checklist detallado en la sección 30.5, punto 1.

**Roles y datos**
- [ ] **Roles y alcances reales asignados** a cada usuario invitado — nunca dejar más cuentas
      `informatica_r4` de las estrictamente necesarias (recomendado: 1-2 personas del Dpto.
      Informática, no más), y ningún usuario operativo sin alcance (`region_id`/`station_id`) asignado.
- [ ] **Datos mínimos iniciales cargados** — ver checklist completo en la sección 31.3.
- [ ] **Datos de prueba limpiados** si se usó el sistema en modo de pruebas antes (ver sección 1.6bis
      y `supabase/cleanup_test_data.sql`).
- [ ] **Sesión de pruebas funcionales conjunta** hecha sobre el checklist de la sección 31.5, con al
      menos un usuario de cada rol relevante para la institución (no hace falta cubrir los 10 roles si
      alguno no se va a usar en la práctica, pero sí los que sí).

### 31.3 Datos mínimos iniciales — orden recomendado de carga

El sistema tiene dependencias jerárquicas reales (un cuartel necesita una región, un usuario necesita
un rol y opcionalmente un alcance, etc.) — cargar en este orden evita quedarte con formularios que no
tienen de dónde elegir una región/cuartel/departamento inexistente todavía:

1. **Regional 4** — la región raíz. Se carga una sola fila en `regions` (nombre, código). Sin esto,
   nada de lo que sigue tiene dónde colgar.
2. **Subsedes** — las subsedes dentro de la Regional 4 (`/cuarteles`, o directo en Supabase si preferís
   cargarlas antes de tener el primer usuario admin operando desde la UI).
3. **Cuarteles** — cada cuartel, asociado a su región y (opcionalmente) subsede. Incluye datos de
   contacto institucional (teléfono/email) — cargarlos desde el principio ayuda a que el Semáforo no
   marque el cuartel en rojo por "falta contacto institucional" apenas se den de alta.
4. **Usuario(s) `informatica_r4`** — al menos uno, creado directo en Supabase (sección 1.5) si es el
   primero del sistema, ya que `admin-create-user` requiere ya estar autenticado como alguien con
   permiso para crear usuarios.
5. **Usuarios principales del resto de roles** — `secretario_regional`, `director_escuela`, y al menos
   un `jefe_cuerpo_activo`/`presidente_cuartel`/`usuario_carga_cuartel` por cuartel activo, según la
   estructura real de la institución. Crearlos desde `/usuarios/nuevo` una vez que ya hay un
   `informatica_r4` operando.
6. **Roles y alcances (scopes)** — se asignan en el mismo alta de usuario (`admin-create-user`) o
   después desde `/usuarios/:id` (solo `informatica_r4`/`integrante_informatica`). Confirmar que cada
   usuario con rol de cuartel tenga su `station_id` seteado, y los roles regionales su `region_id` —
   sin esto, `my_station_ids()`/`my_region_ids()` no devuelven nada y el usuario no ve ni puede
   escribir nada de su propio alcance.
7. **Departamentos regionales** — si la institución los usa (comisión directiva, capacitación, etc.),
   cargarlos desde `/departamentos` con su coordinador (debe ser ya un usuario real) y, si corresponde,
   integrantes manuales (sin cuenta) o miembros con cuenta.
8. **Inventario Regional inicial** — el catálogo compartido de elementos prestables (`/inventario`),
   cargado por `informatica_r4`/`director_escuela`/`secretario_regional`. No hace falta cargarlo si la
   institución todavía no va a usar el módulo de préstamos.
9. **Calendario inicial** — eventos institucionales ya conocidos (reuniones fijas, vencimientos
   recurrentes) para que el módulo no arranque vacío.
10. **Documentos base** — circulares, actas, manuales institucionales ya existentes, cargados **desde
    PC** (la carga está pausada en mobile, ver sección 31.6) en las carpetas correspondientes.
11. **Personal y vehículos iniciales** — dotación y flota de cada cuartel, cargados por
    `jefe_cuerpo_activo`/`presidente_cuartel`/`usuario_carga_cuartel` de cada uno (o por
    `informatica_r4`/`secretario_regional` si se prefiere centralizarlo al principio).
12. **Contactos institucionales mínimos para el Semáforo** — confirmar que cada cuartel tenga al menos
    `phone` o `email` cargado (uno de los 3 criterios críticos de `station_compliance`, junto con tener
    personal y vehículos cargados) — sin esto, todo cuartel nuevo arranca en rojo aunque tenga el resto
    de los datos al día.

No hace falta completar los 12 puntos antes de dar acceso a nadie — es el orden recomendado para que
cada pantalla tenga de dónde elegir, no un requisito de "todo o nada". Los puntos 7-11 pueden ir
cargándose de forma incremental una vez que el sistema ya está en uso.

### 31.4 Matriz final de permisos por rol y módulo

Matriz verificada línea por línea contra el código real (route guards, lógica de rol dentro de cada
página, RLS policies) — no contra documentación de rondas anteriores, para reflejar el estado
**final** vigente. `administrativo` (rol legado) no se incluye: sigue existiendo como tipo válido en la
base por compatibilidad, pero ya no se ofrece para asignar a nadie nuevo desde ningún flujo de la UI
(migración `0043`).

**Convenciones**: is_informatica_r4() = `informatica_r4` + `integrante_informatica`. is_regional_role()
= **solo** `secretario_regional` (desde la migración `0048`; `director_escuela` ya no comparte esa
función). is_escuela_role() = `director_escuela` + `instructor`.

#### Panel

| Rol | Ver | Alcance |
|---|---|---|
| informatica_r4 / integrante_informatica | Sí | Todo el sistema |
| director_escuela / instructor / secretario_regional | Sí | Su región |
| jefe_cuerpo_activo / presidente_cuartel / secretario_comision / usuario_carga_cuartel | Sí | Su cuartel/subsede |
| invitado | Sí | Solo su cuartel |

Sin escritura — el botón "Nuevo Reporte" se muestra solo si el rol tiene acceso a Reportes (ver esa
sección). El widget de Semáforo hereda el alcance real de `stations_select_scope`.

#### Cuarteles (listado y datos generales)

| Rol | Ver | Crear | Editar | Desactivar | Alcance |
|---|---|---|---|---|---|
| informatica_r4 / integrante_informatica | Sí | Sí | Sí | Sí (cambio de estado, sin borrado físico) | Todo el sistema |
| secretario_regional | Sí | Sí | Sí | Sí | Su región |
| director_escuela / instructor | Sí | No | No | No | Su región — solo lectura |
| jefe_cuerpo_activo / presidente_cuartel / usuario_carga_cuartel | Sí | No | Sí, solo si es su propio cuartel | Sí, solo si es su propio cuartel | Su propio cuartel únicamente |
| secretario_comision | Sí | No | No | No | Solo lectura |
| invitado | Sí | No | No | No | Solo su cuartel, sin escritura |

`canEdit` se revalida contra el `station.id`/`station.region_id` real del registro abierto, no solo el
rol del usuario — evita que un rol de cuartel vea Editar/Desactivar en un cuartel ajeno visible por
lectura regional/de subsede.

#### Detalle de cuartel — Personal, Vehículos, Asistencia, Intervenciones

| Rol | Ver | Crear/Editar/Desactivar | Alcance |
|---|---|---|---|
| informatica_r4 / integrante_informatica | Sí | Sí | Todo el sistema |
| secretario_regional | Sí | Sí | Su región |
| director_escuela / instructor | Sí | No | Su región — solo lectura |
| jefe_cuerpo_activo / presidente_cuartel / usuario_carga_cuartel | Sí | Sí, solo su propio cuartel | Su propio cuartel |
| secretario_comision | Sí | No | Solo lectura |
| invitado | Sí | No | Solo su cuartel |

#### Detalle de cuartel — Historial institucional

| Rol | Ver | Crear/Editar/Eliminar | Alcance |
|---|---|---|---|
| informatica_r4 / integrante_informatica | Sí | Sí | Todo el sistema |
| secretario_regional | Sí | Sí | Su región |
| director_escuela / instructor | Sí | No | Su región — solo lectura |
| jefe_cuerpo_activo / presidente_cuartel / usuario_carga_cuartel / secretario_comision | Sí | Sí, solo su propio cuartel | Su propio cuartel |
| invitado | Sí | No | Solo su cuartel |

A diferencia de Personal/Vehículos, acá `secretario_comision` sí tiene escritura (mismo criterio que
Documentos/Carpetas).

#### Usuarios

| Rol | Ver listado | Crear | Editar | Eliminar (borrado directo) | Alcance |
|---|---|---|---|---|---|
| informatica_r4 | Sí | Sí, cualquier rol | Sí, cualquier usuario incl. otro informatica_r4 | **Sí — único rol habilitado** | Todo el sistema |
| integrante_informatica | Sí | Sí, cualquier rol | Sí, cualquier usuario EXCEPTO otro informatica_r4 | No | Todo el sistema salvo informatica_r4 |
| director_escuela | No (solo alta) | Sí, cualquier rol excepto informática | No | No | Solo alta de usuarios, sin gestión de existentes |
| jefe_cuerpo_activo | Sí, filtrado a su cuartel | Sí, solo roles de cuartel, solo para su cuartel | Sí, solo usuarios de su cuartel, nunca roles informática/regional/escuela ni roles/scope | No | Estrictamente su propio cuartel |
| resto de roles | No | No | No | No | Sin acceso |

El borrado directo de usuarios (`admin-delete-user`) es exclusivo de `informatica_r4` — ni siquiera
`integrante_informatica` puede ejecutarlo. Activar/desactivar (distinto del borrado físico) sí está
disponible para los roles habilitados a editar, dentro de sus límites.

#### Documentos (+ Carpetas, Papelera)

| Rol | Ver | Crear/Editar/Eliminar (mover a papelera) | Purgar definitivo | Alcance |
|---|---|---|---|---|
| informatica_r4 / integrante_informatica | Sí | Sí | Sí | Todo el sistema |
| secretario_regional | Sí | Sí | No | Su región |
| director_escuela / instructor | Sí | No | No | Solo lectura |
| jefe_cuerpo_activo / presidente_cuartel / usuario_carga_cuartel / secretario_comision | Sí | Sí, solo su cuartel | No | Su propio cuartel |
| invitado | Sí (según su alcance de lectura) | No | No | Solo lectura |

Cargar archivos requiere además estar en **escritorio** (bloqueado en mobile por decisión de producto,
independientemente del rol — ver sección 31.6). La carpeta "General" (sin región/cuartel propio) solo
la administra `informatica_r4`/`integrante_informatica`.

#### Inventario Regional (catálogo)

| Rol | Ver catálogo | Crear/Editar/Dar de baja ítem | Alcance |
|---|---|---|---|
| informatica_r4 / integrante_informatica / director_escuela / secretario_regional | Sí | Sí | Todo el sistema — pool regional único, sin partición por región (decisión de diseño confirmada) |
| resto de roles | Sí | No, solo puede Solicitar | Solo lectura + solicitud de préstamo |

#### Solicitudes de Préstamo

| Rol | Ver todas las solicitudes | Crear solicitud | Aprobar/Rechazar/Retirar/Devolver/Cancelar |
|---|---|---|---|
| informatica_r4 | Sí | Sí | Sí, cualquiera |
| integrante_informatica | Sí | No | No (solo lectura) |
| director_escuela / secretario_regional | Sí | Solo secretario_regional | Sí, cualquier solicitud |
| jefe_cuerpo_activo / presidente_cuartel / usuario_carga_cuartel | Sí | Sí, solo para su cuartel | Solo si es el solicitante, o responsable puntual del ítem |
| instructor / secretario_comision / invitado | Sí | No | No |

**Importante**: la lectura de solicitudes de préstamo es abierta a cualquier usuario autenticado, sin
filtro territorial en RLS (decisión de diseño documentada: todo usuario necesita poder ver el estado
del inventario prestado) — el filtro por cuartel que ve `jefe_cuerpo_activo` es solo una conveniencia
de UI, no una restricción real de datos.

#### Calendario

| Rol | Ver | Crear evento | Editar/Cancelar/Eliminar | Alcance |
|---|---|---|---|---|
| informatica_r4 / integrante_informatica | Sí | Sí | Sí, cualquier evento | Todo el sistema |
| director_escuela / instructor | Sí | Sí | Sí, solo eventos de Escuela/Capacitación | Sin restricción territorial (Escuela es regional por definición) |
| secretario_regional | Sí | Sí | Sí, eventos dentro de su región | Su región — selector bloqueado a su propia región al crear |
| jefe_cuerpo_activo / presidente_cuartel / usuario_carga_cuartel / secretario_comision | Sí | Sí | Sí, solo eventos de su cuartel | Su propio cuartel — selector bloqueado |
| invitado | Sí | No | No | Solo lectura |

#### Semáforo (Compliance)

Widget de solo lectura dentro de Panel/Cuarteles, sin acciones propias — hereda exactamente el alcance
de lectura de `stations_select_scope` para todos los roles (ver Panel).

#### Departamentos

| Rol | Ver | Crear departamento | Editar datos / gestionar miembros | Alcance |
|---|---|---|---|---|
| informatica_r4 / integrante_informatica | Sí | Sí | Sí, cualquier departamento | Todo el sistema |
| secretario_regional | Sí | No | Sí, integrantes manuales e informes de actividad de cualquier departamento | Todo el sistema (ver nota) |
| Cualquier rol que sea coordinador de un departamento | Sí | No | Sí, ese departamento (no puede cambiar el coordinador) | Ese departamento |
| Resto de roles | Sí | No | No | Solo lectura |

**Informes y actas (desde `0098`, sección 57.1):** los ven y cargan Informática, el coordinador y
los integrantes con cuenta del departamento; secretario_regional no los ve por su rol.

**Coordinador y Avales (desde `0097`, sección 56):** el coordinador de un departamento
(`departments.coordinator_profile_id`) ve y carga los avales regionales de ese departamento en
Escuela, sin rol ni asignación extra. Por eso crear y eliminar departamentos, y elegir el
coordinador, es solo de Informática también en RLS. El nombre del departamento es único (sin
distinguir mayúsculas ni espacios).

**Integrantes manuales e Informes de actividad**: además de admin y coordinador, **cualquier miembro
con cuenta** del departamento puede crear/editar (department_members no distingue roles internos —
todo-o-nada a nivel membresía), y también **cualquier `secretario_regional`**, sea o no coordinador/
miembro de ese departamento puntual (`is_regional_role()` en RLS). Eliminar un informe de actividad es
más restrictivo: solo `informatica_r4` o quien lo cargó (ni siquiera el coordinador ni `secretario_regional`
pueden borrar uno ajeno). El coordinador de un departamento siempre debe ser un usuario real con cuenta
— nunca un integrante manual.

*Resuelto (2026-08-09):* hasta la v1.0.0-beta.1, el frontend (`canLogActivity` en
`DepartamentoDetallePage.tsx`) era más estricto que el RLS: no mostraba las acciones de
integrantes manuales/informes de actividad a `secretario_regional` salvo que además coordinara o
fuera miembro del departamento, aunque el backend ya lo permitía para cualquier departamento. Se
alineó agregando `hasRole('secretario_regional')` a `canLogActivity`, sin tocar RLS (ya reflejaba
el comportamiento institucional deseado). Nunca fue un hueco de seguridad — la UI solo ocultaba una
acción que el backend ya autorizaba.

#### Reportes (incluye Reportes de Departamentos)

| Rol | Acceso a /reportes | Tipos disponibles | Alcance |
|---|---|---|---|
| informatica_r4 / integrante_informatica | Sí | Todos | Todo el sistema, selector libre |
| director_escuela / secretario_regional | Sí | Asistencias, Cursos, Consolidado Regional, General por Cuartel, Departamentos (general y específico) — **nunca Vehículos ni Intervenciones** | Regional/subsede/cuartel |
| jefe_cuerpo_activo / usuario_carga_cuartel | Sí | Asistencias, Intervenciones, Cursos, Vehículos, General por Cuartel — **sin Consolidado Regional ni Departamentos** | Solo su propio cuartel, selector bloqueado |
| Cualquier rol sin acceso que coordine un departamento | Solo el reporte "Departamento específico" | Solo ese tipo | Solo los departamentos que coordina |
| instructor / presidente_cuartel / secretario_comision / invitado (sin coordinar departamento) | No | — | Sin acceso |

*Resuelto (2026-08-09):* hasta la v1.0.0-beta.1, los selectores de región/subsede/cuartel para
`director_escuela`/`secretario_regional` no filtraban las opciones a la región propia (sí lo hacían
para los roles de solo-cuartel) — nunca fue un hueco de RLS (los datos igual salían acotados), pero
permitía elegir una región ajena en el selector aunque el reporte resultante saliera vacío/filtrado.
Se acotó `ReportesPage.tsx` para que `regions`/`subsedes`/`stations` se filtren a la región propia
(`profile.region_id`) cuando `isEscuelaRegional`, igual que ya se hacía para `isStationOnly`, con el
selector de región preseleccionado y una nota explicativa ("Solo podés generar reportes de tu propia
región").

#### Auditoría

**Vigente desde `0097` (2026-10-02, sección 56.4):**

| Rol | Acceso | Módulos visibles | Ve datos técnicos (JSON) | Alcance |
|---|---|---|---|---|
| informatica_r4 | Sí | Todos | Sí | Todo el sistema |
| **Cualquier otro rol** (incluido integrante_informatica) | **No — sin acceso** (ni menú, ni URL, ni API) | — | — | — |

La tabla de abajo es el esquema anterior, de `0062` a `0096`, y se conserva como historial:

| Rol | Acceso | Módulos visibles | Ve datos técnicos (JSON) | Alcance |
|---|---|---|---|---|
| informatica_r4 / integrante_informatica | Sí | Todos | Sí | Todo el sistema |
| director_escuela / instructor | Sí | Cursos, Calendario, Usuarios/roles de Escuela | No | Su región |
| secretario_regional | Sí | Set amplio (cuarteles, personal, vehículos, documentos, asistencia/intervenciones, calendario, cursos, departamentos, inventario) | No | Su región |
| jefe_cuerpo_activo / presidente_cuartel / secretario_comision / usuario_carga_cuartel | Sí | Set acotado (cuarteles, personal, vehículos, documentos, asistencia/intervenciones, calendario, roles/scope) | No | Su cuartel/subsede |
| **invitado** | **No — sin acceso** | — | — | — |

En ese esquema anterior, cualquier rol que coordinara o fuera miembro de un departamento sumaba los
módulos de Departamentos a su set visible, acotado a sus propios departamentos.

*Resuelto (2026-08-13):* hasta antes de la migración `0076`, `director_escuela`/`instructor`
compartían la policy RLS `audit_logs_select_regional` con `secretario_regional` vía
`is_regional_role() OR is_escuela_role()`, con una condición de "`region_id is null` deja pasar"
pensada originalmente solo para roles de autoridad regional amplia — esto le daba a cualquier
`instructor` (el rol más acotado de los tres) acceso a auditoría de **cualquier tabla sin territorio
resuelto**, incluidas acciones de informática, contradiciendo la fila de esta misma tabla ("Su
región"). Corregido separando `is_escuela_role()` en su propia policy
(`audit_logs_select_escuela`), acotada a las tablas reales de Escuela + región propia — ver sección
35.1 para el detalle completo del diagnóstico y el fix. A diferencia de las otras 3 discrepancias
frontend/RLS cerradas en la v1.0.0-beta.1 (sección 31.4, donde la UI era más estricta que el
backend), este SÍ era un hueco de seguridad real del lado del backend — el frontend ya tenía el
filtrado de módulos correcto desde antes.

#### Notificaciones

| Rol | Ver propias | Crear notificación manual | Alcance de creación |
|---|---|---|---|
| informatica_r4 | Sí | Sí | Sin restricción — cualquier alcance, incluido broadcast total |
| integrante_informatica / director_escuela / instructor / secretario_regional | Sí | Sí | Solo su propia región/subsede/cuartel, o un usuario puntual |
| resto de roles | Sí | No | — |

*Resuelto (2026-08-09):* hasta la v1.0.0-beta.1, `integrante_informatica` compartía alcance total con
`informatica_r4` (ambos usaban `is_informatica_r4()` en la policy de escritura de `notifications`),
inconsistente con el resto del sistema, donde `integrante_informatica` sí es un nivel más acotado (ver
Usuarios). Se agregó la migración `0071_notifications_scope_integrante_informatica.sql`, que reemplaza
`notifications_write_regional_escuela_scoped` (0063) por `notifications_write_scoped`: ahora
`integrante_informatica` tiene el mismo límite territorial que `secretario_regional`/
`director_escuela`/`instructor`. Frontend actualizado en paralelo en `NotificacionFormPage.tsx`
(`scopeLockedToOwnRegion` ahora depende de `hasRole('informatica_r4')`, no de `isAdmin`).

#### Ajustes

Pantalla 100% personal para todos los roles (perfil propio, contraseña propia, notificaciones push
propias). La única sección condicionada por rol es la administrativa (resumen semanal, versión/caché de
la app), exclusiva de `informatica_r4`/`integrante_informatica`.

#### Guards de ruta (resumen técnico)

| Ruta | Guard | Roles permitidos además de admin |
|---|---|---|
| Rutas de negocio generales | `ProtectedRoute` | Cualquier usuario autenticado con perfil activo (el resto vive en cada página/RLS) |
| `/reportes` | `ReportsRoute` | director_escuela, secretario_regional, jefe_cuerpo_activo, usuario_carga_cuartel |
| `/usuarios`, `/usuarios/:id` | `UserManagerRoute` | jefe_cuerpo_activo |
| `/usuarios/nuevo` | `UserCreatorRoute` | director_escuela, jefe_cuerpo_activo |

### 31.5 Checklist de prueba manual compacto (pre-producción)

Pensado para una sola pasada antes de habilitar usuarios reales — no repite el detalle exhaustivo de
otras secciones (30.5, 23.6, etc.), los referencia. Marcar con al menos un usuario de cada rol que la
institución vaya a usar en la práctica.

- [ ] **Login/logout**: iniciar sesión, cerrar sesión, volver a entrar. Confirmar que la sesión persiste
      al recargar la página.
- [ ] **Cambiar contraseña**: desde `/ajustes`, y el flujo forzado (`must_change_password`) para un
      usuario recién creado.
- [ ] **Crear usuario**: como `informatica_r4`, crear un usuario de prueba con rol y alcance.
- [ ] **Eliminar usuario como `informatica_r4`**: confirmar el flujo completo (confirmación fuerte,
      bloqueo si es el único `informatica_r4` activo, bloqueo si tiene solicitudes de préstamo propias)
      — ver checklist detallado en sección 28.6.
- [ ] **Cuarteles**: crear, editar, ver detalle, confirmar que un rol de cuartel no puede editar un
      cuartel ajeno.
- [ ] **Personal**: alta, edición, cambio de estado (licencia/baja/renuncia con motivo obligatorio).
- [ ] **Vehículos**: alta, edición, cambio de estado (mantenimiento/fuera de servicio/baja con motivo).
- [ ] **Documentos desde PC (escritorio)**: crear carpeta, cargar un archivo, editar, mover a papelera,
      restaurar, purgar (solo admin).
- [ ] **Documentos desde mobile**: confirmar que se pueden VER y DESCARGAR documentos, y que la opción
      de cargar archivos está ausente (con el texto explicativo correspondiente, no solo oculta sin
      aviso) — ver sección 31.6.
- [ ] **Calendario**: crear evento de cada tipo relevante para el rol de prueba, confirmar que el
      selector de tipo/alcance está acotado según el rol.
- [ ] **Semáforo**: confirmar que el color/porcentaje de un cuartel de prueba cambia al completar los
      criterios (contacto, personal, vehículos, asistencia/intervención/documentos recientes).
- [ ] **Inventario**: como `director_escuela`/`secretario_regional`, cargar un ítem; como rol de
      cuartel, confirmar que solo puede "Solicitar", no editar el catálogo.
- [ ] **Solicitudes de préstamo**: ciclo completo pendiente → aprobada → retirada → devuelta, y
      confirmar el recordatorio automático (sección 30.5, punto 6).
- [ ] **Departamentos**: crear departamento, asignar coordinador, agregar un integrante manual (sin
      cuenta) y un miembro con cuenta, cargar un informe de actividad.
- [ ] **Reportes**: generar al menos un PDF de cada tipo disponible para el rol de prueba, confirmar
      que el diseño institucional (logos, pie de página) se ve bien.
- [ ] **Auditoría**: confirmar el filtrado por rol (sección 30.5, punto 3) y que `invitado` no tiene
      acceso.
- [ ] **Notificaciones**: confirmar que llegan las notificaciones automáticas esperadas (sección 30.5,
      punto 4) y que no hay spam por acciones normales.
- [ ] **PWA / banner de actualización**: instalar la PWA en un dispositivo real, hacer un deploy nuevo,
      confirmar el banner (sección 30.5, punto 1) — nunca una recarga silenciosa.
- [ ] **Resumen semanal**: confirmar el toggle en Ajustes y correr `send_weekly_admin_summary()`
      manualmente al menos una vez (sección 30.5, punto 5).
- [ ] **Recordatorios de préstamos**: ciclo completo por vencer → vencido → devuelto sin más avisos
      (sección 30.5, punto 6).

### 31.6 Estado de funcionalidades pausadas, futuras y limpieza aplicada

**Pausadas (decisión de producto, no un bug):**
- **Carga de documentos desde mobile**: pausada desde 2026-08 tras varias rondas de diagnóstico que no
  lograron aislar la causa de un bug de touch/click no confiable en ciertos Android (ver sección 21).
  Ver/descargar documentos SÍ funciona en mobile. Se agregó en esta ronda un texto explicativo también
  en `DocumentosPage.tsx`/`CarpetaDetallePage.tsx` (antes el botón de carga simplemente desaparecía en
  mobile sin explicación — solo `DocumentoFormPage.tsx`, la pantalla de destino, tenía el mensaje). No
  hay planes de reactivarla hasta encontrar la causa real; si se retoma, es un diagnóstico nuevo, no un
  fix rápido.

**No implementadas / explícitamente descartadas:**
- **IA**: no hay ningún botón, texto ni flujo de IA visible en el frontend — confirmado con un
  relevamiento exhaustivo en esta ronda. Existe una Edge Function `analyze-report` (Gemini) desplegada
  en el backend, escrita en una etapa temprana del proyecto, pero **no está conectada a ningún lugar
  del frontend actual** — no se invoca desde `ReportesPage.tsx` ni desde ningún otro módulo. Queda
  documentada acá como código huérfano conocido: se puede dejar desplegada sin uso (no afecta nada) o
  eliminarse en una futura limpieza de infraestructura; no forma parte del flujo activo de SIGER4 y no
  se planea conectarla salvo decisión explícita en el futuro. El único resto en el frontend es un label
  de traducción de auditoría (`analisis_ia_reporte` en `humanize.ts`) inofensivo y no user-facing,
  mantenido solo por si existiera auditoría histórica con ese valor.

**Ya implementadas (para que quede claro que NO son "próximamente" en ningún texto del sistema):**
- Reportes PDF de Departamentos Regionales (general y por departamento) — sección 28.
- Auditoría filtrada por rol/alcance, con vista institucional/técnica — sección 29.3.
- Notificaciones sensibles inmediatas a Informática — sección 29.4.
- Resumen semanal enriquecido para Informática — sección 29.5.
- Recordatorio automático de devolución de préstamos — sección 29.6.
- Borrado directo de usuarios por `informatica_r4` — sección 28.3.
- Banner de actualización de PWA (reemplaza el auto-reload silencioso) — sección 29.2.

Un relevamiento exhaustivo de `src/pages/` en esta ronda confirmó que no queda ningún texto
"próximamente"/"en construcción"/placeholder sobre estos módulos ni sobre ningún otro.

**Limpieza aplicada en la ronda de v1.0.0-beta.1:**
- Comentario desactualizado en `AjustesPage.tsx` que todavía describía el auto-reload silencioso viejo
  de la PWA (ya reemplazado por el banner en la ronda 29) — corregido para reflejar el comportamiento
  actual.
- Texto de la sección "Versión / actualización de la app" actualizado para mencionar el banner en vez
  del reload automático.
- Inconsistencia de UX en Documentos/mobile (ver arriba) — corregida agregando el texto explicativo
  faltante.

**Cerrado en esta ronda (2026-08-09) — las 3 discrepancias frontend/RLS de la sección 31.4:**
- Departamentos: `secretario_regional` sin membresía/coordinación ahora ve las acciones de integrantes
  manuales/informes de actividad de cualquier departamento en la UI, igual que ya permitía el RLS.
- Reportes: los selectores de región/subsede/cuartel para `director_escuela`/`secretario_regional`
  ahora se acotan a la región propia, igual que ya se hacía para los roles de solo-cuartel.
- Notificaciones: `integrante_informatica` pasó a tener el mismo límite territorial que los roles
  regionales (antes compartía alcance total con `informatica_r4`) — migración `0071`.

Ver el detalle de cada fix en la nota "*Resuelto (2026-08-09)*" dentro de la sección de cada módulo en
31.4.

**Bug visual corregido en esta ronda (2026-08-09) — Dashboard en modo oscuro:**
El valor numérico de cada KPI (`.kpi-value`, usado en Panel, `CuartelDetallePage.tsx` y
`DepartamentoDetallePage.tsx`) tomaba su color de `--color-secondary`, una variable que nunca se
redefinía dentro de `:root[data-theme='dark']` en `src/styles.css` — quedaba fija en `#0f172a` (casi
negro) también en modo oscuro, sobre un fondo de KPI card (`--color-bg-card: #16213a`) también oscuro:
contraste real ~1.2:1, prácticamente ilegible. Se cambió `.kpi-value` para usar `--color-text-primary`
en su lugar (sí tiene override correcto en dark, `#f1f5f9`) — se descartó aclarar `--color-secondary`
directamente porque esa variable también se usa como **fondo** en `.btn-inverted` y `.offline-banner`
con texto blanco fijo; aclararla ahí habría roto esos dos componentes.

Adicionalmente, `--color-bg-card`/`--color-bg-card-soft` en dark tenían la jerarquía de elevación
invertida respecto al modo claro: `--color-bg-card` (fondo de `.kpi-card`/`.card-solid`, pensada para
"destacar") era **más oscura** que `--color-bg-card-soft` (fondo de `.card`, pensada para "fondirse con
la página") — 1.14:1 de contraste entre ambas y 1.17:1 contra `--color-bg-app`, así que las KPI cards
se percibían "pegadas" al fondo en vez de elevadas. Se ajustaron los valores (`--color-bg-card:
#1e2c4d`, `--color-bg-card-soft: #141d33`) para restaurar el mismo orden que el modo claro, sin tocar
ningún valor del bloque `:root` (modo claro intacto). De paso mejora el contraste de
`--color-text-muted` (usado en las etiquetas "AL DÍA"/"PARCIAL"/"DESACTUALIZADO" de "Estado de Carga
por Cuartel") de 4.28:1 a 5.10:1.

No se tocó ningún color del modo claro, ni las variables de badges/semáforo/rojo institucional en dark
(ya estaban correctamente adaptadas). El resto de las páginas que usan `.card`/`.card-solid`/`.kpi-*`
se benefician del mismo fix sin cambios adicionales, al ser tokens compartidos.

**Verificación post-fix (2026-08-12):** se repasaron las 3 discrepancias y el fix de dark mode contra
el código y las policies reales (no solo releídos) — confirmado sin hallazgos: `informatica_r4`
mantiene alcance total en Notificaciones, `integrante_informatica` ya no puede enviar broadcast total
y queda correctamente acotado a su región/subsede/cuartel (el formulario nunca ofrece ni envía un
scope vacío para roles no-`informatica_r4`); en Reportes, `secretario_regional`/`director_escuela` ven
solo su región/subsedes/cuarteles y los roles de cuartel siguen limitados al propio (selector
deshabilitado); en Departamentos, `secretario_regional` ahora ve las acciones de integrantes
manuales/informes de actividad de cualquier departamento (coincide con RLS), sin que se le hayan
sumado por error botones de `canManage` (edición del departamento, alta/baja de miembros con cuenta,
que siguen siendo exclusivos de coordinador/admin, tal como exige la policy `departments_write_coordinator_or_admin`).
De paso se limpió el fallback hardcodeado inerte de `.sw-update-banner` en `styles.css`
(`var(--color-primary-dark, #9a1f1f)` → `var(--color-primary-dark)`, la variable siempre existe y el
valor de fallback no coincidía con ninguno de los dos temas). Quedan sin tocar (mismo tipo de deuda
menor, pero en archivos fuera del alcance pedido para esta pasada) fallbacks equivalentes en
`AjustesPage.tsx`, `PapeleraDocumentosPage.tsx` y `UsuarioDetallePage.tsx`.

**Posibles mejoras futuras** (fuera de alcance de esta ronda, no implementadas):
- Reactivar la carga de documentos en mobile si se logra aislar la causa real del bug de touch/click.
- Conectar o eliminar definitivamente `analyze-report`.
- Pantalla de "novedades anteriores" que muestre el historial completo de `APP_UPDATES`, no solo la
  última.

Los fallbacks hardcodeados restantes en `AjustesPage.tsx`, `PapeleraDocumentosPage.tsx` y
`UsuarioDetallePage.tsx` mencionados arriba se limpiaron en la ronda siguiente — ver sección 32.

## 32. Limpieza técnica + detalle de notificaciones + diagnóstico de recordatorios semanales (2026-08-12)

Ronda de verificación y mejoras puntuales sobre lo cerrado en la sección 31, sin agregar módulos
grandes: limpieza de fallbacks CSS restantes, detalle completo de notificaciones largas, protección
contra solapamiento de cron en los recordatorios semanales, y una nota faltante en Ajustes.

### 32.1 Limpieza de fallbacks CSS hardcodeados

Mismo patrón que `.sw-update-banner` (sección 31.6): `var(--color-success, #16a34a)` y
`var(--color-danger, #dc2626)` en `AjustesPage.tsx`, `PapeleraDocumentosPage.tsx` y
`UsuarioDetallePage.tsx` — ambas variables siempre están definidas (`:root` y
`:root[data-theme='dark']`), así que el fallback nunca se activaba, y el de `--color-danger`
(`#dc2626`) ni siquiera coincidía con el valor real de la variable (`#d32f2f` claro / `#ef5350`
oscuro). Se quitaron los 5 fallbacks (`grep -r "var(--color-[a-z-]\+, #" src/` confirma 0 ocurrencias
restantes en todo `src/`). Sin cambio de comportamiento visual — el resultado renderizado es idéntico,
la variable siempre existió.

### 32.2 Detalle completo de notificaciones largas

**Problema**: `.list-item-title`/`.list-item-subtitle` (usadas en el listado de `/notificaciones`)
recortan a 2 líneas con `-webkit-line-clamp` — el resumen semanal admin, los recordatorios
institucionales y cualquier notificación con cuerpo largo quedaban truncados sin forma de leer el
resto.

**Fix**: nuevo componente `src/components/ui/NotificationDetailModal.tsx`, modal siguiendo el mismo
patrón ya usado por `ReasonPromptModal.tsx` (`createPortal`, cierre con Escape o click afuera). Al
tocar una notificación en `/notificaciones` se abre el modal con: título completo, mensaje completo
(`white-space: pre-wrap`, sin recorte), fecha/hora completa, badge de tipo, badge de
leída/no leída, y el alcance (región/subsede/cuartel) resuelto a nombre real — `notifications` solo
guarda IDs, así que `NotificacionesPage.tsx` ahora también trae `regions`/`subsedes`/`stations` (mismo
patrón de resolución ya usado en `ReportesPage.tsx`/`NotificacionFormPage.tsx`) para mostrar el nombre,
no el UUID crudo. Ningún dato técnico (JSON, IDs crudos) se muestra en el modal. Al abrir una
notificación no leída, se marca como leída automáticamente (mismo `markNotificationRead` ya existente,
sin duplicar lógica). El botón "Marcar leída" del listado se mantiene aparte (con
`stopPropagation` para no abrir el modal al tocarlo). Mobile-friendly: mismo `max-width: 480px` +
`padding: 24px` del contenedor que ya usa `ReasonPromptModal`, probado en el mismo breakpoint.

### 32.3 Recordatorios semanales del lunes — diagnóstico y qué se corrigió

**Causa exacta**: no se pudo determinar con certeza absoluta sin acceso directo al proyecto de
Supabase real (fuera del alcance de este entorno) — el diagnóstico completo, con las causas más
probables ordenadas y la query exacta para confirmar/descartar cada una, quedó documentado en la nueva
sección **30.4.1** ("Diagnóstico paso a paso: no llegó el recordatorio/resumen semanal"). Resumen de
las causas más probables, de mayor a menor probabilidad:
1. Falta o está desincronizada la config `siger4.project_url`/`siger4.cron_shared_secret` (la función
   SQL degrada en silencio: crea la notificación interna igual, pero nunca llama a `net.http_post` —
   solo deja un `raise warning` en los logs de Postgres, invisible para un usuario).
2. Los jobs de `pg_cron` no están activos, o no existen (confirmar con la query de la sección 30.4).
3. El job corrió pero falló — para el resumen admin, un error en cualquiera de los cálculos agregados
   (semáforo, préstamos, documentos, altas/bajas de usuario, departamentos) aborta toda la función
   ANTES de insertar ninguna notificación, indistinguible de "no llegó nada" desde la UI.
4. `pg_net` no está habilitado, o las requests quedaron encoladas sin completarse.
5. Sin `push_subscriptions` activas para el perfil esperado (el dispositivo nunca activó, o perdió, el
   push).

**Confirmado explícitamente sin desfase**: el cron `'0 15 * * 1'`/`'30 15 * * 1'` corresponde a lunes
(no hay error de día de semana en la sintaxis), y Argentina UTC-3 fijo confirma 15:00/15:30 UTC =
12:00/12:30 ART — ninguno de los dos es la causa.

**Bug real encontrado y corregido**: ni `send_weekly_reminder()` (0036) ni `send_weekly_admin_summary()`
(0067) tenían protección contra dos ejecuciones solapadas del mismo job — el mismo riesgo teórico ya
señalado (y corregido puntualmente solo para préstamos) en el propio comentario de cabecera de la
migración 0070. No es la causa de "no llegó" (los jobs corren una sola vez por semana, nada que se
solape en uso normal), pero sí sería causa de *duplicados* en un escenario de corrida colgada o disparo
manual simultáneo al del cron. Migración **0072** agrega `pg_try_advisory_xact_lock` a ambas funciones,
mismo patrón exacto que 0070 — sin cambiar ningún cálculo, filtro, ni el `cron.schedule` de ninguno de
los 2 jobs (mismo nombre/horario/body).

**Qué correr para confirmar la causa real en el proyecto de producción**: seguir el playbook de la
sección 30.4.1 en orden — son 7 pasos, cada uno acota más el punto exacto de falla.

### 32.4 Ajustes — nota agregada

Se agregó, en la tarjeta "Institucional" (visible para todos los roles, no solo informática), una nota
breve: *"La carga de documentos (Documentos → Cargar archivo) está disponible solo desde PC. Desde el
celular podés ver y descargar documentos normalmente."* — antes esta aclaración solo vivía dentro del
módulo Documentos; ahora también es visible desde el lugar donde un usuario revisaría su configuración
general.

El resto del checklist pedido para Ajustes (estado de push con sus 5 diagnósticos, botón "Probar
notificación", botón "Reactivar notificaciones push", preferencias de recordatorio semanal/resumen
admin, versión visible, botón de actualización de la app) **ya existía** de rondas anteriores — se
verificó cada punto contra el código real (`usePushNotifications.ts`, `AjustesPage.tsx`) sin encontrar
faltantes ni duplicados/confusos que limpiar.

**Decisión confirmada — notificaciones sensibles sin opt-out**: las notificaciones sensibles
(altas/bajas de usuario, cambios de rol/alcance, migración 0066) NO tienen ni tendrán un toggle de
desactivación en Ajustes — es un mecanismo de supervisión institucional para todo el equipo de
informática, no una preferencia individual; agregar un opt-out le restaría fuerza a ese control.

### 32.5 Migraciones nuevas

- `0072_weekly_reminders_advisory_lock.sql`: agrega `pg_try_advisory_xact_lock` a
  `send_weekly_reminder()` y `send_weekly_admin_summary()` (ver 32.3). No agrega tablas, columnas, ni
  cron jobs nuevos — sigue habiendo exactamente 5 jobs `siger4-*` (tabla de la sección 30.4 sin
  cambios).

## 33. Causa raíz real confirmada: `alter database` no funciona en Supabase — reemplazo por `system_settings` (2026-08-12) — migración 0073

Seguimiento directo a la sección 32.3: intentar aplicar el `alter database postgres set
siger4.project_url = ...` / `siger4.cron_shared_secret = ...` documentado desde la migración `0036`
(sección 6.3) en el SQL Editor real de Supabase falla con:

```
ERROR: 42501: permission denied to set parameter "siger4.project_url"
```

### 33.1 Causa exacta

`alter database ... set <guc> = ...` (y su equivalente `alter role ... set ...`) requiere el
privilegio `SUPERUSER` o ser dueño de la base — el rol que usa el SQL Editor de Supabase (`postgres`
en el contexto de una sesión de usuario, con permisos administrados por PostgREST/RLS, no el
`postgres` real de un servidor autoadministrado) no lo tiene. Esto **no es específico de este
proyecto**: es una limitación estructural de cualquier proyecto Supabase gestionado — no hay ningún
paso de configuración que la esquive desde el SQL Editor. El procedimiento documentado desde 0036
nunca pudo haber funcionado en un proyecto Supabase real siguiendo exactamente esos pasos; solo se
detectó al intentar aplicarlo en producción.

Consecuencia directa: `current_setting('siger4.project_url', true)`/
`current_setting('siger4.cron_shared_secret', true)` siempre devolvían `null` en las 3 funciones que
dependían de ellas (`send_weekly_reminder()`, `send_weekly_admin_summary()`, `trigger_document_purge()`)
— las notificaciones internas se creaban igual (esas funciones degradan en silencio, ver sus propios
`raise warning`), pero el push real y la purga automática de documentos nunca llegaron a dispararse en
ningún proyecto que haya seguido la documentación tal como estaba. Esto también explica, con
certeza ahora (no solo como hipótesis, a diferencia de la sección 32.3), por qué no llegó el
recordatorio del lunes: la causa #1 de la lista priorizada de 30.4.1 era la causa real.

### 33.2 Fix: `system_settings`, una tabla en vez de un GUC

Migración `0073_system_settings_config.sql`:

- **Tabla `system_settings`** (`key text primary key`, `value text`, `is_secret boolean`,
  `updated_at`, `updated_by_profile_id`) — RLS: solo `is_super_admin()` (`informatica_r4`, **no**
  `integrante_informatica` — mismo criterio ya usado para el borrado directo de usuarios, sección
  28.3) puede leer/escribir directo.
- **`get_system_setting(key)`** — `SECURITY DEFINER STABLE`, lee sin pasar por RLS (la llaman
  funciones de cron que corren como `postgres`, sin sesión de usuario real — mismo motivo por el que
  antes se usaba `current_setting(..., true)`). Deliberadamente **sin** `grant ... to authenticated`:
  si lo tuviera, cualquier usuario logueado podría leer `cron_shared_secret` en texto plano llamándola
  directo. Otra función `SECURITY DEFINER` puede invocarla igual sin ningún grant explícito (mismo
  criterio que las funciones de trigger de `0031_security_definer_execute_grants.sql`).
- **`set_system_setting(key, value, is_secret)`** — único camino soportado para escribir. Revalida
  `is_super_admin()` server-side (no confía solo en la RLS de la tabla), y audita el cambio en
  `audit_logs` — pero **nunca en texto plano si `is_secret = true`**: guarda `'[secreto: NN
  caracteres]'` en vez del valor real. No se usó el trigger genérico `audit_row_change()` (el que ya
  usa el resto de las tablas del sistema) a propósito: ese trigger hace `to_jsonb(new)`/`to_jsonb(old)`
  de la fila completa, lo que habría insertado el secreto real en `audit_logs.new_value` — exactamente
  lo que esta migración evita.
- **`project_url` viene precargado** por la propia migración (no es secreto, viaja en claro en cada
  request igual) con el valor real de este proyecto
  (`https://tuhynszatghlfohugexn.supabase.co`) — confirmar que coincide con tu proyecto si aplicás esta
  migración en un Supabase distinto.
- **`cron_shared_secret` NO viene precargado** — es secreto, no se hardcodea en el repositorio. Hay
  que configurarlo a mano después de correr la migración (ver 33.3).
- Se actualizaron las 3 funciones (`send_weekly_reminder()`, `send_weekly_admin_summary()`,
  `trigger_document_purge()`) para leer `get_system_setting('project_url')`/
  `get_system_setting('cron_shared_secret')` en vez de `current_setting('siger4.*', true)` — sin
  cambiar ningún otro cálculo, filtro, ni el `cron.schedule` de ninguno de los 3 jobs asociados. El
  resto del cuerpo de cada función es copia exacta de su versión anterior (`0072` para las dos
  semanales, `0053` para la purga).

### 33.3 Segundo problema real: `set_system_setting()` tampoco funciona desde el SQL Editor

Al intentar configurar `cron_shared_secret` siguiendo el paso 2 original de esta sección
(`select set_system_setting('cron_shared_secret', '...', true);` corrido en el SQL Editor), aparece
un segundo error, distinto al de 33.1 pero de la misma familia:

```
ERROR: P0001: Solo informatica_r4 puede modificar la configuracion del sistema.
```

...aunque el usuario real de la aplicación sí sea `informatica_r4`. **Causa**: el SQL Editor de
Supabase ejecuta las queries bajo el rol de servicio del proyecto, sin el JWT de sesión de ningún
usuario de la app — `auth.uid()` ahí es `null`. `set_system_setting()` valida `is_super_admin()`,
que depende de `current_profile_id()`, que depende de `auth.uid()` — la cadena entera resuelve a
"nadie", así que la función rechaza correctamente (es el comportamiento de seguridad esperado: nadie
sin una sesión de usuario real debería poder tocar esta tabla), pero deja sin ningún camino para
configurar el secreto la primera vez desde el SQL Editor.

**Fix definitivo (migración `0074_system_settings_ui_and_diagnostics.sql`)**: una sección nueva en
**Ajustes → Configuración del sistema** (visible únicamente para `informatica_r4`, no
`integrante_informatica` — coincide exactamente con `is_super_admin()`), donde `set_system_setting()`
se llama **bajo la sesión real del usuario logueado en el navegador** — ahí `auth.uid()` sí resuelve,
así que es el único lugar donde esto funciona. La sección permite:
- Ver/editar `project_url` (no es secreto, se puede ver el valor).
- Configurar `cron_shared_secret` (nunca se muestra el valor guardado, solo si está "Configurado" o
  "Sin configurar" — ni siquiera a `informatica_r4` se le vuelve a mostrar el secreto una vez
  guardado).
- Revisar el diagnóstico de push semanal (ver 33.4).

La migración también agrega `list_system_settings_status()` (lee el estado sin exponer nunca el valor
real de una clave secreta, sin importar quién la llame) y hace que las 3 funciones (`send_weekly_reminder()`,
`send_weekly_admin_summary()`, `trigger_document_purge()`) **avisen dentro de la app** (una notificación
visible a `informatica_r4`/`integrante_informatica`, no solo un `WARNING` en los logs de Postgres que
nadie mira) cuando corren sin `project_url`/`cron_shared_secret` configurados — con un guard de 24hs
para no repetir el aviso en cada corrida si el problema persiste sin resolverse.

### 33.4 Cómo configurar `cron_shared_secret` (paso a paso real)

1. **Correr las migraciones `0073` y `0074`** en el SQL Editor, en ese orden (`0073` crea la tabla y
   los helpers base; `0074` agrega la UI de estado seguro y los avisos in-app).
2. **Configurar el secreto de la Edge Function** primero, en una terminal con el CLI de Supabase
   autenticado contra tu proyecto:
   ```
   npx supabase secrets set CRON_SHARED_SECRET="un-valor-largo-y-aleatorio"
   ```
   Si ya tenías este secreto configurado de antes, podés reutilizar el mismo valor — no hace falta
   rotarlo.
3. **Entrar a la app como `informatica_r4`** → `/ajustes` → sección "Configuración del sistema
   (informática)":
   - Confirmar/editar `project_url` (debería mostrar ya la URL de tu proyecto, precargada por `0073`).
   - Pegar en "Secreto compartido de cron" **exactamente el mismo valor** que usaste en el paso 2, y
     guardar.
4. **Probar manualmente** (genera notificaciones/push reales — avisar antes si se prueba en
   producción):
   ```sql
   select send_weekly_reminder();
   select send_weekly_admin_summary();
   ```
   Confirmar en `/notificaciones` que ambas insertaron el contenido esperado, y que llegó el push real
   si hay `push_subscriptions` activas. Si además faltara la config, ahora aparece una notificación
   nueva explícita ("push no configurado") en vez de fallar en silencio.

No hace falta redesplegar `send-push-system`/`purge-documents` — ninguna Edge Function cambió de
código en esta ronda ni en la anterior, y los secretos se leen en cada invocación, no en el momento
del deploy.

### 33.5 Cómo verificar que quedó bien configurado

Desde la propia UI: `/ajustes` → "Configuración del sistema" muestra un badge "Configurado"/
"Sin configurar" para `cron_shared_secret`, sin exponer el valor. Alternativamente, por SQL (solo
`informatica_r4` puede correr esto, por RLS):
```sql
select key, is_secret, updated_at from system_settings where key in ('project_url', 'cron_shared_secret');
```
Deben aparecer 2 filas. **No hay ninguna forma soportada de releer el valor del secreto una vez
guardado** (ni desde la UI ni por SQL directo con el camino recomendado) — es intencional. Si
necesitás confirmar que coincide con el de la Edge Function, la única forma es volver a pegarlo en
ambos lugares.

Para confirmar que el push realmente se disparó (no solo que se creó la notificación interna), usar
el botón "Revisar últimos 7 días" de la sección "Diagnóstico de push semanal" en Ajustes, o
directamente:
```sql
select * from get_weekly_push_diagnostics('recordatorio_semanal');
select * from get_weekly_push_diagnostics('alerta_admin');
```
`push_attempted = false` en una notificación reciente confirma que el `net.http_post` nunca llegó a
completarse (config faltante, o `pg_net` caído). Ver también el playbook completo de la sección 30.4.1
para diagnosticar cualquier otro punto de la cadena.

### 33.6 Edge Functions / Vercel

Ninguna Edge Function nueva ni con cambios de código — `send-push-system`/`purge-documents` no se
tocaron, solo su secreto (paso 2 de 33.4, si hace falta configurarlo o resetearlo). Vercel: sí,
redeploy — a diferencia de la migración `0073` (100% backend), la `0074` sí agrega frontend nuevo
(`SystemSettingsSection.tsx`, sección nueva en `AjustesPage.tsx`).

### 33.7 Nota para quien ya haya intentado el `alter database` o el `select set_system_setting(...)` desde el SQL Editor sin éxito

No hace falta deshacer nada en ninguno de los dos casos: ni el `alter database`/`alter role` fallido
(33.1) ni el `set_system_setting()` rechazado por falta de sesión real (33.3) dejan ningún estado a
medias — ambos se rechazan antes de aplicar cualquier cambio. Alcanza con seguir los pasos de 33.4
(correr `0073`+`0074`, configurar el secreto de la Edge Function, y guardarlo desde Ajustes con tu
sesión real de `informatica_r4`).

## 34. Panel de Pendientes por Rol (2026-08-12) — migración 0075

### 34.1 Qué es y qué NO es

Una sección nueva en el Dashboard ("Pendientes") que le muestra a cada usuario, según su rol y
alcance, una lista corta de cosas concretas que conviene revisar o resolver — **no** es un sistema de
tareas nuevo (sin asignación manual, sin checkbox de "completado", sin tabla propia de tareas). Cada
pendiente se calcula en el momento a partir de datos que ya existen en otras tablas del sistema; no
hay ningún dato inventado ni estimado. Tocar "resolver" en un pendiente es, en los hechos, ir a la
pantalla real correspondiente (el detalle de un cuartel, una solicitud de préstamo, un evento) y
actuar ahí — el panel es un índice, no un flujo propio.

### 34.2 Fuente de datos: una sola función, `get_pending_items()`

Migración `0075_pending_items_panel.sql`: una función `SECURITY DEFINER STABLE` que arma el resultado
con `UNION ALL` de subqueries, una por tipo de pendiente. Cada subquery reutiliza los **mismos**
helpers que ya usa el resto del sistema para RLS/alcance (`is_informatica_r4()`, `is_regional_role()`,
`is_escuela_role()`, `my_station_ids()`, `my_region_ids()`, `current_profile_id()`) — el alcance de
"qué pendientes ve cada quien" nunca puede desincronizarse de lo que esa persona ya puede ver/hacer en
el resto de la app, porque no es una capa de permisos nueva y paralela, es la misma.

Cada fila devuelta tiene: `item_key` (id estable, `"<tipo>_<uuid real>"`), `title`, `description`,
`priority` (`alta`/`media`/`baja`), `module` (nombre de sección para agrupar visualmente), `link_path`
(ruta real de la app — nunca una URL inventada, se verificaron las 8 rutas usadas contra `App.tsx`), y
`sort_key` (fecha real usada para ordenar dentro de cada nivel de prioridad — nunca un valor
arbitrario).

### 34.3 Los 8 tipos de pendiente implementados

| # | Pendiente | Fuente real | Prioridad | Quién lo ve |
|---|---|---|---|---|
| 1 | Cuartel en rojo/amarillo del semáforo | `station_compliance` (vista, migración 0052) | alta (rojo) / media (amarillo) | Heredado de la propia vista (`security_invoker`) — el alcance real de `stations_select_scope` |
| 2 | Solicitud de préstamo pendiente de aprobar | `inventory_loan_requests` (`status='pendiente'`) | media | admin, `is_regional_role()`, responsable del ítem o de la solicitud |
| 3 | Préstamo por vencer (≤48hs) o vencido | `inventory_loan_requests` (`status='retirada'`) | alta (vencido) / media (por vencer) | admin, `is_regional_role()`, el cuartel solicitante (`my_station_ids()`), responsable del ítem/solicitud |
| 4 | Evento de calendario próximo (7 días) | `calendar_events` (`status='programado'`) | baja | admin ve todos; Escuela/capacitación visible para cualquiera (regional-wide por diseño); el resto según su región/cuartel |
| 5 | Documento sin archivo subido (+24hs) | `documents` (`storage_path='pending'`) | baja | solo admin (es quien puede limpiarlos, `cleanup_pending_documents`) |
| 6a | Usuario nuevo (últimos 7 días) | `profiles` | baja | solo admin |
| 6b | Cuartel sin actividad relevante (+30 días) | `station_compliance.last_relevant_update_at` | media | solo admin (mismo criterio que el resumen semanal, migración 0067) |
| 7 | Curso desactualizado (fecha pasada sin cambiar de estado) | `courses` | baja | admin + `is_escuela_role()` |
| 8 | Departamento sin informes de actividad (+30 días) | `departments` + `department_activity_reports` | baja | admin, `is_regional_role()`, coordinador o miembro de ese departamento puntual |

### 34.4 Cómo se calculan (criterios exactos)

- **Semáforo (1)**: reutiliza `station_compliance` tal cual — no se reimplementa el cálculo de
  rojo/amarillo/verde, se consulta la vista existente y se traduce cada motivo (`has_contact_info`,
  `has_personnel`, `has_vehicles`, `attendance_recent`, `interventions_recent`, `has_documents`) al
  primer motivo que falte, en el mismo orden de prioridad que ya usa la vista para decidir el color.
- **Préstamos pendientes/por vencer (2, 3)**: mismos estados (`pendiente`, `retirada`) y mismo criterio
  de destinatarios que ya usan `SolicitudPrestamoDetallePage.tsx`/`send_loan_return_reminders()`
  (migración 0068) — la ventana de "por vencer" se amplía a 48hs (contra las 24hs del recordatorio
  automático) porque este panel es una foto que alguien puede mirar en cualquier momento del día, no
  un aviso puntual.
- **Eventos próximos (4)**: ventana fija de 7 días, `status='programado'` (nunca eventos cancelados).
- **Documentos pendientes (5)**: mismo umbral de 24hs que `cleanup_pending_documents()` (migración
  0033) — evita mostrar como "pendiente" una carga que recién está en curso.
- **Usuarios nuevos (6a)**: ventana fija de 7 días sobre `profiles.created_at`, solo activos.
- **Cuarteles sin actividad (6b)**: mismo umbral de 30 días que ya usa `send_weekly_admin_summary()`
  (migración 0067) — reutiliza `station_compliance.last_relevant_update_at` en vez de duplicar el
  cálculo.
- **Cursos desactualizados (7)**: `planificado` con `start_date` ya pasada, o `en_curso` con
  `end_date` ya pasada — ambos son indicios de que falta actualizar el estado real del curso.
- **Departamentos sin actividad (8)**: mismo umbral de 30 días, sobre `department_activity_reports`
  filtrado por `department_id`.

### 34.5 Permisos y alcance (verificado contra la matriz de la sección 31.4)

| Rol | Qué ve en Pendientes |
|---|---|
| `informatica_r4` / `integrante_informatica` | Todos los tipos, sin restricción territorial — incluye los exclusivos de admin (documentos pendientes, usuarios nuevos, cuarteles sin actividad). |
| `secretario_regional` | Semáforo/eventos/departamentos de su región; préstamos de su región; sin los tipos exclusivos de admin. |
| `director_escuela` / `instructor` | Eventos de Escuela/capacitación (regional-wide) + cursos desactualizados; semáforo/eventos de su región (heredado de RLS); sin acceso a préstamos ni departamentos salvo que además sean miembro/coordinador. |
| `jefe_cuerpo_activo` / `usuario_carga_cuartel` / `presidente_cuartel` / `secretario_comision` | Semáforo/eventos de su propio cuartel; préstamos de su propio cuartel (como solicitante) o si son responsables puntuales; departamentos solo si son miembro/coordinador. |
| Miembro o coordinador de un departamento (cualquier rol) | Suma el pendiente de "departamento sin actividad" para sus propios departamentos, sin importar su rol de sistema. |
| `invitado` | Solo lo que ya puede ver por lectura (semáforo y eventos de su propio cuartel) — nunca un pendiente de aprobación/gestión, coherente con que es un rol sin escritura en ningún módulo. |

No se agregó ninguna policy de RLS nueva ni se tocó ninguna existente — `get_pending_items()` no lee
ninguna tabla directo sin pasar por su propio filtro de alcance dentro de la función (aun siendo
`SECURITY DEFINER`, que bypasea RLS, cada subquery reconstruye el mismo criterio de alcance a mano).

### 34.6 UI

Nuevo componente `src/components/PendingItemsSection.tsx`, montado en `PanelPage.tsx` (Dashboard)
entre los KPIs y "Estado de Carga por Cuartel" — es la sección más accionable del panel, así que va
arriba. Cada pendiente se muestra como una fila clickeable (mismo patrón visual que "Próximos
Eventos"/"Estado de Cuarteles" ya existentes) con: título, descripción corta, badge de módulo, y badge
de prioridad (`badge-danger`/`badge-warning`/`badge-info` para alta/media/baja, mismos colores que ya
usa el resto del sistema para semáforo/vencimientos). Tocar la fila navega directo a la pantalla real
del pendiente (`link_path`). Estado vacío: "No hay pendientes importantes." Estado de carga y de error
siguen el mismo patrón que el resto del Dashboard.

### 34.7 Notificaciones — explícitamente NO implementadas en esta ronda

Pedido explícito: "no enviar notificaciones nuevas todavía, esto es solo panel visual". No se agregó
ningún trigger, cron job, ni llamada a `notify_informatica_staff()`/`send-push` desde
`get_pending_items()` ni desde el frontend nuevo. Queda preparado para una fase futura si algún tipo
de pendiente amerita un recordatorio proactivo: como cada pendiente ya resuelve a una fila real con su
propio `item_key`/`link_path`, un cron nuevo que quisiera notificar "tenés préstamos vencidos"
reutilizaría exactamente la misma subquery del punto 3 sin duplicar el criterio — no hace falta ningún
cambio de schema para eso, solo un trigger o función nueva el día que se pida explícitamente.

### 34.8 Migración nueva y despliegue

- `0075_pending_items_panel.sql` — crea `get_pending_items()`. No agrega tablas, columnas, ni cron
  jobs. No requiere backfill (es una función derivada, sin estado propio).

Ninguna Edge Function nueva ni modificada. Vercel: sí, redeploy — frontend nuevo
(`PendingItemsSection.tsx`, `src/lib/api/pendingItems.ts`, cambio en `PanelPage.tsx`).

### 34.9 Cómo probar

1. Correr la migración `0075` y confirmar que `select * from get_pending_items();` no tira error
   logueado como cualquier usuario real (no desde el SQL Editor sin sesión — ver sección 33.3, aplica
   igual acá: sin `auth.uid()` real, `current_profile_id()` es null y ninguna condición de alcance
   matchea, así que la función corre pero devuelve 0 filas para las categorías que dependen de
   pertenencia — el semáforo y los eventos de Escuela sí pueden devolver filas igual, porque no
   dependen de `current_profile_id()`).
2. Como `informatica_r4`: entrar a `/panel`, confirmar que "Pendientes" muestra cuarteles en
   rojo/amarillo, solicitudes de préstamo pendientes, préstamos vencidos/por vencer, documentos sin
   subir, usuarios nuevos y cuarteles sin actividad — todos con badge de prioridad coherente y link
   que lleva a la pantalla real.
3. Como `jefe_cuerpo_activo`/`usuario_carga_cuartel`: confirmar que solo ve pendientes de su propio
   cuartel (semáforo, préstamos donde es solicitante o responsable, eventos de su cuartel) — nunca los
   tipos exclusivos de admin (documentos pendientes, usuarios nuevos).
4. Como `director_escuela`/`instructor`: confirmar que ve cursos desactualizados y eventos de
   Escuela/capacitación, pero no solicitudes de préstamo ni departamentos (salvo que además coordine
   uno).
5. Como miembro o coordinador de un departamento: confirmar que ve "Departamento sin actividad
   reciente" solo para SUS departamentos, no para todos.
6. Como `invitado`: confirmar que solo ve pendientes de solo-lectura (semáforo/eventos de su cuartel),
   nunca préstamos ni nada con acción de gestión.
7. Con un sistema sin ningún pendiente real (o filtrando manualmente los datos de prueba hasta que no
   quede ninguno): confirmar que aparece "No hay pendientes importantes." en vez de una sección vacía
   sin explicación.
8. Tocar un pendiente de cada tipo y confirmar que el link lleva exactamente a la pantalla esperada
   (no un 404 ni una pantalla "sin permisos").

## 35. Fix de seguridad en Auditoría + notificaciones de novedades + UX/demo (2026-08-13) — migraciones 0076-0077

Ronda de correcciones reales previa a demo institucional/carga inicial: un bug de seguridad real en
Auditoría (prioridad más alta), notificaciones internas para novedades del sistema, el scroll agresivo
que arrastraba todo el shell, el tipo de vehículo como combobox, "Actividad Reciente" reemplazada por
datos reales, y la preparación completa para demo/carga inicial.

### 35.1 Auditoría — fix de seguridad real (migración 0076)

**Reporte**: un usuario con roles `jefe_cuerpo_activo` + `instructor` podía ver auditoría de todo el
sistema, incluidas acciones de informática.

**Causa exacta**: `audit_logs_select_regional` (redefinida en la migración `0048`) combinaba
`is_regional_role() OR is_escuela_role()` con la condición `region_id is null OR region_id in
(my_region_ids())`. Esa condición "`is null` deja pasar" fue una decisión deliberada de la migración
`0014` ("logs sin region_id resuelto... quedan visibles igual para no ocultar información por una
limitación de datos"), pensada en su momento solo para `secretario_regional`/`director_escuela` — dos
roles con autoridad regional amplia real. La migración `0048` separó `is_regional_role()` de
`is_escuela_role()` (agregando `instructor` a este último) pero **nunca revalidó** si esa misma
condición laxa seguía siendo correcta para el rol nuevo, mucho más acotado.

`audit_row_change()` (el trigger genérico que resuelve `region_id`/`subsede_id`/`station_id` por
tabla) solo cubre un subconjunto de tablas en su `case` — cualquier tabla que caiga en el `else`
(`departments`, `department_members`, `system_settings`, y cualquier tabla futura que se audite sin
agregar su propio `when`) queda con `region_id = null`. Con la policy vieja, **cualquier `instructor`
veía esas filas completas, de cualquier tabla, sin importar el actor real** — exactamente "ve
auditoría de acciones del admin". `jefe_cuerpo_activo` (vía `audit_logs_select_station`, `0064`) sí
estaba correctamente acotado a su cuartel — el hueco era específicamente el lado `is_escuela_role()`
de la policy combinada (las policies de un mismo `for select` se combinan con `OR` entre sí, así que
bastaba con calificar para cualquiera de las dos condiciones).

**Corrección**: `audit_logs_select_regional` vuelve a ser exclusiva de `is_regional_role()`
(`secretario_regional`), sin cambios de comportamiento para ese rol. Nueva policy
`audit_logs_select_escuela`, exclusiva de `is_escuela_role()` (`director_escuela`/`instructor`),
acotada a **solo** las tablas reales de Escuela (`courses`, `course_stations`, `calendar_events`,
`profiles`, `user_roles` — mismo set que ya usa `ESCUELA_TABLES` en `AuditoriaPage.tsx`) y a su propia
región cuando la fila tiene territorio — nunca un `is null` genérico que se cuele a otras tablas. Los
eventos de calendario de tipo `escuela`/`capacitacion` (sin `region_id`/`station_id` por diseño, ver
`calendar_events_single_scope`) siguen visibles porque no tienen territorio que filtrar, no por una
excepción especial. El frontend (`ESCUELA_TABLES`/`JEFE_CUERPO_ACTIVO_TABLES` en `AuditoriaPage.tsx`)
**ya hacía la unión correcta de módulos por rol** — no tenía el bug, no se tocó; el problema era
exclusivamente de RLS.

**Migración**: `0076_fix_audit_logs_escuela_scope_leak.sql`.

### 35.2 Notificación interna para novedades del sistema (migración 0077)

Cuando se publica una novedad nueva en `APP_UPDATES` (`src/config/appUpdates.ts`), además del banner
ya existente (`AppUpdateBanner.tsx`, "visto" vía `localStorage` por navegador), cada usuario recibe
ahora una notificación interna persistente: **"Nueva actualización disponible. Ingresá para conocer
las novedades."**

**Cómo se evita que se repitan**: deduplicación **atómica** a nivel de base de datos — mismo patrón
exacto que `idx_push_send_log_notification_dedup` (migración `0025`). Dos columnas nuevas en
`notifications` (`type='actualizacion_sistema'`, `app_update_id text`) más un índice único parcial
`(profile_id, app_update_id) WHERE app_update_id IS NOT NULL`. El insert usa el `id` estable de la
novedad en `APP_UPDATES` — si dos pestañas del mismo usuario detectan la misma novedad al mismo
tiempo, el segundo insert viola el índice único y se descarta en silencio (código `23505`, tratado
como éxito, no como error) — nunca hay dos notificaciones de la misma novedad para el mismo usuario,
sin depender de una lectura previa con riesgo de carrera.

Se genera desde el **cliente** (`AppUpdateBanner.tsx`), no desde un trigger de Postgres: `APP_UPDATES`
sigue viviendo solo en el frontend (decisión de diseño ya documentada — no hace falta una tabla
server-side de novedades), así que no hay ninguna tabla que dispare un evento. Se dispara siempre que
existe una novedad no vista (`hasSeenAppUpdate`), independientemente de si el banner llega a mostrarse
en ese dispositivo puntual — así queda un rastro accesible desde `/notificaciones` en cualquier
sesión, a diferencia del banner (una vez por navegador).

**Al tocarla**: reabre el modal real de esa novedad puntual (no el `NotificationDetailModal`
genérico) — nuevo módulo `src/lib/appUpdateBannerControl.ts` (pub/sub, mismo patrón que
`src/lib/swUpdate.ts` para el banner de actualización de la PWA) conecta `NotificacionesPage.tsx` con
`AppUpdateBanner.tsx` (montado globalmente en `App.tsx`), usando `app_update_id` para encontrar la
novedad exacta en `APP_UPDATES` aunque ya no sea la más reciente.

**Cómo agregar una novedad nueva**: sin cambios en el procedimiento ya documentado en
`src/config/appUpdates.ts` (agregar un objeto al principio de `APP_UPDATES`, `id` único) — la
notificación interna se dispara sola, no requiere ningún paso manual adicional ni nueva migración.

**Migración**: `0077_app_update_notifications.sql`.

### 35.3 Layout / scroll agresivo

**Causa exacta**: `html`/`body` tenían `height: 100%` (una capacidad, no una restricción) sin
`overflow: hidden` propio, y `#root` tenía `min-height: 100vh` (puede crecer de más). El shell interno
(`.app-shell`, ya con `height: 100vh` + `overflow: hidden` desde una ronda anterior, sección 24.3) en
teoría nunca debía desbordar — pero nada impedía que el **documento** (no `.app-content`, el `<body>`
completo) generara su propio scroll por encima del shell, que es lo que se percibía como "header se
oculta, footer se mueve, toda la pantalla scrollea" con un scroll fuerte/el bounce nativo de iOS.

**Corrección**: `html`/`body`/`#root` ahora tienen `overflow: hidden` + `height` fijo (no `min-height`)
explícitos, y `overscroll-behavior: none` en `html`/`body` para eliminar el rubber-band/bounce que
"arrastraba" el documento — `overscroll-behavior: none` en un ancestro no bloquea el scroll normal de
los descendientes, solo evita que el scroll se propague hacia arriba cuando un hijo llega a su límite,
que es exactamente el comportamiento buscado. `.login-page` (la única pantalla que vivía fuera del
shell autenticado, con su propio `min-height: 100vh`) pasa a `height: 100%` + `overflow-y: auto`
propio, para no perder la capacidad de scrollear en pantallas chicas con contenido largo ahora que
`#root` ya no puede crecer.

Sin cambios en `.app-shell`/`.app-sidebar`/`.app-main-column`/`.app-content`/`.sidebar-nav` (ya
correctos desde la sección 24.3) — el fix es exclusivamente en el nivel de `html`/`body`/`#root`, que
antes dejaban una puerta abierta por encima de un shell interno que sí estaba bien construido.

### 35.4 Vehículos — tipo con combobox + "Otros"

`vehicles.vehicle_type` sigue siendo `text` libre en la base (sin enum, sin constraint) — el combobox
es una capa de UI pura en `VehiculoFormPage.tsx`, sin ninguna migración. Opciones institucionales
(Ambulancia, Ataque rápido, las 4 categorías de Autobomba por capacidad, Embarcaciones,
Escalante/Hidroelevador, Mat-Pel, Unidad de Rescate, Unidad de Transporte, Otros) + "Seleccionar…"
como placeholder obligatorio. Al elegir "Otros" aparece un campo de texto libre obligatorio; el valor
real que se guarda es ese texto, nunca el string sentinel "Otros" en sí.

**Compatibilidad con datos existentes**: al editar un vehículo, si el `vehicle_type` guardado coincide
exacto con una opción institucional, se preselecciona esa opción; cualquier otro valor (incluidos
todos los tipos libres cargados antes de este combo) se trata como "Otros" con el texto real
precargado — nunca se pierde ni se fuerza a encajar en una categoría que no corresponde. Reportes/PDF
(`reportGenerators.ts`) y el detalle de cuartel (`CuartelDetallePage.tsx`) solo **muestran**
`vehicle_type` como texto, nunca comparan contra un enum ni agrupan por valores fijos — sin ningún
impacto en reportes ni estadísticas existentes.

### 35.5 Detalle de Cuartel — "Actividad Reciente" reemplazada

Era un placeholder 100% estático ("Aún no hay actividad registrada... en Supabase") que nunca
consultaba ninguna tabla, sin importar qué tan activo estuviera el cuartel. Reemplazada por un feed
real combinado, sin ninguna tabla nueva:
- Últimas cargas de asistencia e intervenciones (datos que la página ya cargaba).
- Últimos eventos de Historial Institucional (idem).
- Últimos documentos cargados específicamente para ese cuartel (fetch nuevo,
  `fetchRecentDocumentsByStation`, filtra `documents.station_id`).
- Próximos eventos de Calendario de ese cuartel (fetch nuevo,
  `fetchUpcomingCalendarEventsByStation`, filtra `calendar_events.station_id`).

Ordenado por `created_at` real (fecha de carga en el sistema, no fecha del evento en sí), últimos 6.
Documentos y eventos linkean a su pantalla real (`/documentos`, `/calendario/:id`); asistencia/
intervenciones/historial se muestran inline (ya están en la misma pantalla). Estado vacío real y
específico si el cuartel genuinamente no tiene nada cargado todavía, sin mencionar "Supabase" ni
ningún detalle técnico. Se aprovechó la misma pasada para corregir el mismo tipo de texto en
`PanelPage.tsx` ("cuarteles cargados en Supabase") y `EscuelaPage.tsx` ("cursos cargados en
Supabase").

### 35.6 Preparar SIGER4 para demo / carga inicial real

#### A. Datos mínimos de demo — orden recomendado

Mismo orden ya documentado en la sección 31.3 (Regional → Subsedes → Cuarteles → usuario
`informatica_r4` → resto de usuarios → roles/scopes → Departamentos → Inventario → Calendario →
Documentos desde PC → Personal/Vehículos → contactos mínimos para el Semáforo) — sin cambios, sigue
siendo la referencia vigente para carga real. Para una demo rápida sin cargar nada a mano, ver el
punto C (script opcional).

#### B. Estados vacíos — revisados en esta ronda

Se revisaron explícitamente Panel, Cuarteles, Documentos, Inventario, Departamentos, Reportes,
Calendario, Auditoría y Pendientes: todos tienen un estado vacío específico y en español institucional
(nunca "Supabase" ni un mensaje genérico) para cuando no hay datos — confirmado sin hallazgos nuevos
salvo los dos textos corregidos en 35.5. Reportes no tiene un estado vacío tradicional porque es un
formulario de generación, no un listado — no aplica.

#### C. Script opcional de datos de demo — `supabase/seed_example.sql` (actualizado)

Ya existía un script con este propósito (de una etapa muy temprana del proyecto, cubría solo
`stations`/`vehicles`/`attendance_summaries`/`intervention_summaries`/`courses`) — se actualizó en el
mismo archivo (no se creó un tercero, para no dejar ambigüedad sobre cuál correr) para cubrir el
sistema actual completo:

- Crea **un cuartel de ejemplo completo** ("Cuartel Demo — Datos de Ejemplo", código `DEMO1`) dentro
  de la Regional 4 real, con vehículos (usando las opciones reales del combo de 35.4), personal,
  asistencia/intervenciones, Historial Institucional, un evento de Calendario próximo, un departamento
  regional con un informe de actividad, y un ítem de Inventario Regional.
- **No se ejecuta automáticamente** — es un script manual, con una Sección 0 de verificación previa
  (queries `select` para confirmar el estado antes de insertar nada) documentada en su propio
  encabezado.
- **Nunca toca usuarios reales**: no crea, edita ni borra ningún `profile`/`auth.users`/`user_roles`/
  `user_scopes`. Los campos "creado por"/"responsable" quedan en `null` donde la tabla lo permite.
- **No carga documentos reales**: `documents` requiere un archivo real en Storage, que un script SQL
  no puede generar — cargar un documento de ejemplo se sigue haciendo a mano desde la app.
  Enteramente **aditivo**: nunca hace `DELETE`/`UPDATE` de datos existentes, y correrlo dos veces no
  duplica nada (`where not exists`/`on conflict do nothing` en cada insert, con el constraint real
  verificado — `stations(region_id, code)` es el único `on conflict` usado, confirmado que existe).
- Incluye una **Sección 2 de limpieza** (comentada, para descomentar y correr a mano) que borra
  únicamente lo que el propio script insertó, identificado por nombre exacto (`DEMO1` / "Departamento
  Demo — Datos de Ejemplo") — no una limpieza general de "todo lo que parezca de prueba" (para eso
  sigue existiendo `supabase/cleanup_test_data.sql`, que exige revisión manual antes de correrse).

#### D. Checklist de presentación

**Qué mostrar primero** (orden sugerido de un recorrido de demo):
1. Login como `informatica_r4` → Dashboard: KPIs, Pendientes, Semáforo de carga, próximos eventos.
2. Cuarteles → detalle de un cuartel con datos completos (real o el `DEMO1` del script opcional):
   Personal, Vehículos, Asistencia/Intervenciones, Historial Institucional, Actividad Reciente.
3. Reportes → generar un PDF real (ej. "Reporte General por Cuartel") para mostrar el resultado
   institucional (logos, tablas, gráficos).
4. Documentos → mostrar la organización por carpetas, y aclarar explícitamente que la carga de
   archivos es solo desde PC (ver punto E).
5. Calendario → vista de mes y próximos eventos.
6. Departamentos → un departamento con miembros e informes de actividad.
7. Notificaciones → mostrar el banner/notificación de novedades del sistema (sección 35.2) y el flujo
   de préstamos si corresponde.
8. Auditoría → con un usuario `informatica_r4`, mostrar el filtrado institucional (sin JSON crudo) y,
   si hace sentido para la audiencia, activar "Ver datos técnicos" una vez para mostrar la
   trazabilidad completa.
9. Ajustes → versión visible, notificaciones push, preferencias.

**Roles recomendados para presentar**: `informatica_r4` (panorama completo) + al menos un rol
operativo real de la institución (`jefe_cuerpo_activo` o `secretario_regional`, según la audiencia)
para mostrar que el sistema se ve distinto y acotado según quién entra — es un argumento de venta
directo del diseño de permisos.

**Pruebas rápidas antes de mostrar** (5 minutos, no reemplaza el checklist completo de la sección
31.5):
- [ ] Login/logout funciona sin errores en consola.
- [ ] El Dashboard carga sin el mensaje "no pudimos cargar" (revisar RLS/conectividad si aparece).
- [ ] Generar un PDF de Reportes funciona y se ve bien.
- [ ] El banner de novedades (si hay una pendiente) se ve bien y se puede cerrar.
- [ ] Probar el scroll agresivo en un dispositivo mobile real (sección 35.3) — confirmar que el header/
      footer ya no se mueven.
- [ ] Si se usó `seed_example.sql`, confirmar que el cuartel `DEMO1` se ve completo antes de arrancar.

**Qué NO mostrar todavía**:
- Carga de documentos desde mobile — sigue pausada (sección 21, sin cambios). Si alguien pregunta,
  aclarar que ver/descargar sí funciona en mobile, solo cargar está limitado a PC por ahora.
- `analyze-report` (IA) — no existe ningún flujo de IA visible ni se debe mencionar como feature
  disponible (código huérfano, documentado en la sección 31.6, no forma parte del producto).
- Cualquier dato cargado con `seed_example.sql` como si fuera real — el nombre "(demo)"/"Datos de
  Ejemplo" en cada fila es intencional, dejarlo visible para que quede claro que es de ejemplo.

#### E. Limpieza final aplicada en esta ronda

- Corregidos los dos textos con "en Supabase" visibles al usuario (`PanelPage.tsx`,
  `EscuelaPage.tsx`) — mismo tipo de problema que "Actividad Reciente" (35.5), lenguaje técnico
  expuesto sin necesidad.
- Confirmado sin resultados: sin menciones visibles del análisis automático de reportes retirado en
  ningún texto de `src/pages/`/`src/components/` (fuera del label no-visible `analisis_ia_reporte`,
  ya documentado).
- Confirmado sin resultados: sin links muertos (`href="#"`, `to="#"`) ni botones sin función
  (`onClick={() => {}}`) en todo `src/pages/`/`src/components/`.
- Confirmado sin resultados: sin texto "próximamente"/"en construcción" en ningún componente
  user-facing (los únicos matches de `placeholder=` son atributos HTML normales de inputs vacíos, no
  features sin implementar).

### 35.7 Migraciones nuevas de esta ronda

- `0076_fix_audit_logs_escuela_scope_leak.sql` — separa `audit_logs_select_regional` (solo
  `secretario_regional`) de `audit_logs_select_escuela` (nueva, `director_escuela`/`instructor`,
  acotada a tablas de Escuela + región propia).
- `0077_app_update_notifications.sql` — agrega el valor `actualizacion_sistema` a `notification_type`,
  la columna `notifications.app_update_id`, y el índice único parcial de deduplicación.

### 35.8 Qué correr en Supabase

1. Migraciones `0076` y `0077`, en orden.
2. (Opcional, solo si se quiere datos de ejemplo para la demo) `supabase/seed_example.sql` — leer la
   Sección 0 (verificación) antes de correr la Sección 1 (carga).

Ninguna Edge Function nueva ni con cambios de código. Redeploy normal del frontend (Vercel) — hay
cambios de frontend en varias pantallas.

### 35.9 Cómo verificar el fix de Auditoría (el más crítico de esta ronda)

1. Crear (o usar) un usuario de prueba con roles `jefe_cuerpo_activo` + `instructor` a la vez.
2. Entrar a `/auditoria` con ese usuario. Confirmar que el selector de "Tabla/módulo" sigue ofreciendo
   la unión correcta (cuarteles/personal/vehículos/documentos/asistencia/intervenciones/historial/
   calendario de `jefe_cuerpo_activo`, más cursos/course_stations de Escuela) — sin cambios ahí, el
   frontend ya era correcto.
3. Sin filtrar por tabla (o filtrando por una tabla que NO esté en ninguno de los dos sets, si el
   `<select>` lo permitiera): confirmar que NO aparecen eventos de `departments`,
   `department_members`, `system_settings`, ni de ningún cuartel que no sea el propio.
4. Como `informatica_r4`, generar una acción sin territorio resuelto (ej. cambiar un valor en
   Ajustes → Configuración del sistema, sección 33) y confirmar en `/auditoria` que aparece para
   `informatica_r4` pero NO para el usuario `jefe_cuerpo_activo` + `instructor` de la prueba.
5. Confirmar que `jefe_cuerpo_activo` (sin `instructor`) sigue viendo exactamente lo mismo que antes
   (su propio cuartel) — sin regresión para ese rol solo.
6. Confirmar que `secretario_regional` sigue viendo exactamente lo mismo que antes (su región
   completa, incluidas filas sin territorio) — sin regresión, es la policy que no se tocó en
   comportamiento.

## 36. Pulido: teléfono/WhatsApp separados, fix del 409 de notifications, y layout mobile (2026-08-13) — migración 0078

Pase de correcciones puntuales encontradas al usar SIGER4 con datos reales, sobre lo agregado en las
secciones 34-35 (Panel de Pendientes, contactos clicables). Ningún módulo nuevo — solo bugs concretos.

### 36.1 Cuarteles — teléfono institucional y WhatsApp separados (migración 0078)

Problema: `stations` solo tenía un campo `phone`, y el Detalle de Cuartel generaba un botón de
WhatsApp a partir de ese mismo número. Muchos cuarteles tienen teléfono fijo (sin WhatsApp real), y
en los que sí tienen celular el número de WhatsApp puede no coincidir con el teléfono institucional
publicado — mostrar WhatsApp sobre un fijo, o asumir que ambos números son el mismo, era incorrecto.

Corrección: columna nueva `stations.whatsapp_phone` (migración `0078_station_whatsapp_phone.sql`),
independiente de `phone`. Ambas opcionales, ninguna reemplaza a la otra.

- Formulario de cuartel (`CuartelFormPage.tsx`): "Teléfono institucional" y "WhatsApp" son ahora dos
  campos separados, ambos opcionales, `type="tel"`. WhatsApp tiene una ayuda corta ("Puede ser
  distinto al teléfono fijo. Dejalo vacío si el cuartel no tiene WhatsApp.") y validación básica de
  formato reutilizando `isValidPhone` de `src/lib/contact.ts`.
- Detalle de Cuartel: `ContactLink kind="phone"` usa `station.phone` (nunca genera wa.me);
  `ContactLink kind="whatsapp"` usa `station.whatsapp_phone` y solo se renderiza si ese campo existe
  — si un cuartel no cargó WhatsApp, no aparece la fila/botón, ya no se infiere del teléfono fijo.
- Compatibilidad: `stations.phone` existente no se tocó ni se copió a `whatsapp_phone` — un teléfono
  ya cargado sigue siendo el teléfono institucional (correcto, es lo que era). `whatsapp_phone`
  arranca vacío para todos los cuarteles existentes a propósito — autocompletarlo con el teléfono
  viejo asumiría sin base que ese número tiene WhatsApp real, que es exactamente el bug que se
  corrige. Nadie pierde su teléfono cargado; WhatsApp queda pendiente de cargar solo donde corresponda.
- Sin cambios de RLS: `whatsapp_phone` es una columna más de `stations`, ya cubierta por las policies
  existentes de esa tabla (evalúan la fila completa, no columna por columna).
- Auditoría: `stations` ya está cubierta por el trigger genérico `audit_row_change()` — el cambio de
  `whatsapp_phone` queda auditado sin lógica adicional. Se agregó la traducción `whatsapp_phone:
  'WhatsApp'` en `src/lib/audit/humanize.ts` para que el diff de auditoría se lea en español.

### 36.2 Fix del 409 repetido en `POST /rest/v1/notifications` (notificaciones de novedades)

Causa: `createAppUpdateNotification()` (la función que crea la notificación interna "Nueva
actualización disponible") hacía un `insert` simple y capturaba el código de error Postgres `23505`
(violación de constraint única) como éxito silencioso a nivel de JavaScript. Eso evitaba que el error
se propagara como excepción, **pero la petición HTTP en sí seguía respondiendo 409 Conflict** —
visible en la consola del navegador como error de red, aunque el código lo manejara bien. Como el
`useEffect` de `AppUpdateBanner.tsx` (el componente que la dispara) dependía de los objetos `session`
y `profile` completos, y `onAuthStateChange` de Supabase entrega un objeto `session` **nuevo por
referencia** en cada evento (incluido `TOKEN_REFRESHED`, que ocurre solo, sin acción del usuario, cada
vez que el token expira), el efecto volvía a correr — y a intentar el insert — en cada refresh de
token, reconexión o cambio de pestaña, no solo en el login inicial. Con un usuario que ya tenía la
notificación creada, cada una de esas re-ejecuciones generaba un 409 nuevo en consola.

Corrección con dos partes:

1. **`src/lib/api/notifications.ts`** — `createAppUpdateNotification()` pasó de `insert` +
   catch(23505) a `upsert(..., { onConflict: 'profile_id,app_update_id', ignoreDuplicates: true })`.
   Esto le pide a PostgREST un `insert ... on conflict (profile_id, app_update_id) do nothing`
   (header `Prefer: resolution=ignore-duplicates`): cuando la notificación ya existe, PostgREST
   responde **201 sin filas**, no 409 — el caso esperado de "ya existe" deja de generar cualquier
   error en la consola del navegador. `ignoreDuplicates: true` significa que nunca se ejecuta un
   `UPDATE` sobre la fila existente, así que **nunca pisa `is_read`** — si la notificación ya estaba
   leída, sigue leída (no hay ninguna lógica de "revertir a no leída", ni falta hacerla).
2. **`src/components/AppUpdateBanner.tsx`** — el `useEffect` pasó a depender de `session != null` y
   `profile?.id` (valores primitivos estables) en vez de los objetos `session`/`profile` completos, y
   se agregó una `ref` (`attemptedForProfileId`) que evita reintentar el insert más de una vez por
   `profile.id` dentro del mismo montaje del componente. Con esto el efecto ya no vuelve a correr en
   cada `TOKEN_REFRESHED`/reconexión — solo en un login/logout/cambio de usuario reales.

Con ambas correcciones combinadas: la constraint única (índice `idx_notifications_app_update_dedup`,
migración 0077) sigue siendo la única fuente de verdad para "un usuario nunca recibe la misma
notificación de novedad dos veces" (nada cambió ahí, sigue siendo atómica a nivel de base) — lo que
cambió es que ya no se dispara una petición HTTP redundante en cada refresh de sesión, y en los casos
en que sí se dispara y la fila ya existe, la respuesta ya no es un error visible.

**Actualización (mismo día, ver 36.6):** el `upsert` con `onConflict`/`ignoreDuplicates` descripto
arriba generaba a su vez un **400 Bad Request** (no un 409) — PostgREST no puede resolver `on_conflict`
contra un índice único *parcial* como `idx_notifications_app_update_dedup`. Se reemplazó por una RPC
(`ensure_app_update_notification`, migración 0079) que arma el `insert ... on conflict ... where ...
do nothing` en SQL plano server-side, donde el conflict target parcial sí es válido. El diagnóstico y
la corrección del `TOKEN_REFRESHED` de este apartado (parte 2) siguen vigentes sin cambios.

Log esperable que **no** se corrigió porque no es un problema: "Launched external handler for
tel:..." al tocar un teléfono es un mensaje normal del navegador/OS al abrir la app de teléfono, no
un error de SIGER4.

### 36.3 Layout mobile — texto largo no debe romper contenedores (solución sistémica)

Problema visible: en Detalle de Cuartel mobile, un handle de Instagram o una URL larga se salía del
ancho de la card, arrastrando el layout. El mismo riesgo existe en cualquier pantalla con texto libre
del usuario (nombres, direcciones, observaciones, `contact_info`) o URLs.

En vez de un parche puntual en Instagram, se aplicó una corrección a nivel de clases base en
`src/styles.css`, para que cualquier pantalla (actual o futura) quede protegida sin tener que repetir
la regla:

- **`.card` / `.card-solid`**: `overflow-wrap: anywhere` a nivel de card — cualquier texto libre
  dentro (aunque la pantalla específica no le haya puesto una clase de texto dedicada) queda contenido.
- **`.page-title` / `.page-subtitle` / `.section-title`**: mismo `overflow-wrap: anywhere`.
- **`.list-item-title` / `.list-item-subtitle`**: ya usaban `-webkit-line-clamp` (trunca a 2 líneas),
  pero sin `overflow-wrap` una sola palabra larga sin espacios (una URL, un email) igual se salía del
  contenedor aunque el clamp "cortara" por líneas — corregido agregando `overflow-wrap: anywhere` a
  ambas.
- **`.badge`**: `max-width: 100%` + `overflow-wrap: anywhere`.
- **`.contact-link` / `.contact-value` / `.contact-list`**: `min-width: 0` + `max-width: 100%` +
  `overflow-wrap: anywhere` en el link y en su `<span>` interno — antes un email/URL largo (el caso
  `kind="auto"` con `contact_info` libre) podía desbordar su contenedor flex.
- **`.section-header`**: `gap: 12px` + `flex-shrink: 0` en el último hijo (el botón "+ Agregar"), para
  que un título largo nunca lo saque de la fila.
- **Clases utilitarias nuevas**, para usar en cualquier pantalla nueva sin repetir las reglas:
  - `.text-break` — `overflow-wrap: anywhere` + `word-break: break-word` + `min-width: 0`, para un
    texto de una sola línea que puede no tener espacios (URL/email suelto).
  - `.text-truncate` — trunca a una sola línea con "…" (`white-space: nowrap` + `text-overflow:
    ellipsis`), para filas angostas donde ni el wrap es una opción.
  - `.text-clamp-2` — mismo mecanismo que `.list-item-title`, reutilizable fuera de listas
    (descripciones/observaciones en cards o detalle).
  - `.safe-inline` — `display: inline-flex` + `max-width: 100%` + `min-width: 0`, para un link/ícono+
    texto dentro de un contenedor flex/grid.
  - `.safe-card-content` — `min-width: 0` + `max-width: 100%` + `overflow-wrap: anywhere`, para el
    wrapper directo de un bloque de texto dinámico dentro de una card (no la card completa, para no
    recortar sombras/badges que sobresalen a propósito).

Además, se revisaron y corrigieron a mano los casos de `display:flex; justifyContent:'space-between'`
donde un hijo de texto dinámico (nombre/email/dirección/título) no tenía `min-width: 0` — sin eso, un
hijo flex nunca se angosta por debajo de su contenido intrínseco, así que el texto largo empuja al
badge/botón vecino fuera de la fila en vez de truncarse/wrappear:

- `UsuariosPage.tsx` (listado: nombre + email vs. badges de estado + chevron).
- `DepartamentoDetallePage.tsx` (miembros con usuario, y integrantes manuales sin usuario, ambos vs.
  sus botones de acción).
- `CuartelesPage.tsx` (listado: nombre + dirección vs. chevron).
- `UsuarioDetallePage.tsx` (fila de alcance/scope, nombres de cuartel/subsede/región concatenados vs.
  botón "Quitar").
- `CalendarioPage.tsx` (vista día: título de evento vs. badge de estado — la vista lista ya lo tenía
  bien, ahora es consistente).
- `PanelPage.tsx` (Eventos de Hoy y Vencimientos Próximos: título de evento vs. badge de hora/fecha).
- `InventarioDetallePage.tsx` y `SolicitudPrestamoDetallePage.tsx` (header `<h1 className="page-title">`
  con el nombre del ítem vs. badge de estado).
- `AuditoriaPage.tsx` (celda "Evento" de la tabla: `max-width: 320px` + `overflow-wrap: anywhere`, y
  el `<span>` de "Motivo" en el detalle expandido de un evento).
- `NotificationDetailModal.tsx`: se agregó `maxHeight: '85vh'` + `overflowY: 'auto'` al modal, para
  que un cuerpo de notificación muy largo scrollee dentro del modal en vez de desbordar la pantalla
  (el modal ya tenía `maxWidth`/`width: 100%` correctos, faltaba la altura).

Pantallas ya revisadas y confirmadas SIN cambios necesarios (ya seguían el patrón correcto de
`min-width: 0` / `flex: 1` / clamp, o no tenían texto dinámico en riesgo): `InventarioPage.tsx`
(listado), `DepartamentosPage.tsx` (listado), `CalendarioPage.tsx` (vista lista y vista mes),
`DocumentosPage.tsx`, `NotificacionesPage.tsx`, `ReportesPage.tsx`. Las dos primeras tablas de
`AuditoriaPage.tsx` (diff de campos y listado principal) ya estaban envueltas en un contenedor con
`overflowX: 'auto'` propio — ese scroll horizontal queda contenido dentro de la tabla/card, nunca se
propaga al documento, que es el patrón aceptado para tablas anchas en mobile (no es lo mismo que "el
texto rompe la pantalla").

No se encontraron casos donde hiciera falta truncar (`.text-truncate`) en lugar de envolver — todos
los casos revisados tienen suficiente alto disponible para 1-2 líneas de wrap sin romper el layout de
la card, así que se usó `overflow-wrap`/`line-clamp` en todos, nunca truncado agresivo de una sola línea.

Confirmado por revisión de código (sin cambios de comportamiento pendientes de probar visualmente):
ningún contenedor nuevo necesita `overflow-x` propio — el shell general (`.app-shell`/`.app-content`,
sección 24.3) ya contiene el scroll horizontal del documento completo desde antes de esta ronda; esta
sección corrige el desborde *dentro* de cards individuales, no el del documento.

### 36.4 Migraciones nuevas de esta ronda

- `0078_station_whatsapp_phone.sql` — agrega `stations.whatsapp_phone` (columna nueva, nullable, sin
  copiar el valor de `phone`).
- `0079_fix_app_update_notification_rpc.sql` — RPC `ensure_app_update_notification()`, ver 36.6.

### 36.5 Qué correr en Supabase

1. Migraciones `0078` y `0079`, en orden.

Ninguna Edge Function nueva ni con cambios de código. Redeploy normal del frontend (Vercel).

### 36.6 Fix del 400 Bad Request en el upsert de notificaciones (mismo día, tras 36.2)

**Causa exacta:** el `upsert(..., { onConflict: 'profile_id,app_update_id', ignoreDuplicates: true })`
descripto en 36.2 le pide a PostgREST que arme `insert ... on conflict (profile_id, app_update_id) do
nothing`. Pero `idx_notifications_app_update_dedup` (migración 0077) es un **índice único parcial**
(`where app_update_id is not null`) — PostgREST exige que el conjunto de columnas de `on_conflict`
coincida con una constraint/índice único **sin condición `where`** para poder inferir el `ON CONFLICT`
de forma automática; contra un índice parcial no puede, y devuelve **400 Bad Request** en vez de
intentar algo potencialmente incorrecto. Esto es una limitación conocida de la capa REST de
PostgREST, no de Postgres: en SQL plano, `insert ... on conflict (profile_id, app_update_id) where
app_update_id is not null do nothing` es perfectamente válido — es exactamente lo que la RPC nueva
ejecuta server-side, evitando que PostgREST tenga que inferir nada.

**Por qué no se tocó el índice:** seguía siendo correcto y necesario para la atomicidad (dos pestañas
del mismo usuario insertando al mismo tiempo nunca generan dos filas); el problema era exclusivamente
que la capa REST no puede *usarlo* vía `on_conflict` en un `upsert` desde el cliente.

**RPC nueva** (migración `0079_fix_app_update_notification_rpc.sql`):
`ensure_app_update_notification(p_app_update_id text, p_title text, p_message text default null)`,
`security definer`, `returns table (created boolean, notification_id uuid)`.

- Resuelve `profile_id` **siempre** desde `current_profile_id()` (nunca un parámetro del cliente) —
  misma garantía que daba la policy `notifications_write_self` (0023): imposible crear una
  notificación a nombre de otro usuario.
- Sin perfil activo (`current_profile_id()` devuelve `null` — sin `profile`, o `is_active = false`):
  devuelve `created=false, notification_id=null` sin insertar **ni lanzar excepción**. El frontend
  llama esto en cada carga de sesión; un usuario sin perfil activo no debería ver el banner de
  novedades de todos modos, así que este caso no debe romper nada.
- Hace `insert ... on conflict (profile_id, app_update_id) where app_update_id is not null do nothing
  returning id` — si insertó, `created=true`; si no (ya existía), un `select` trae el `id` de la fila
  existente y devuelve `created=false`. **Nunca ejecuta un `update`** sobre la fila existente, así que
  **nunca pisa `is_read`/`read_at`** — si ya estaba leída, sigue leída.
- `grant execute ... to authenticated`, mismo patrón que el resto de las RPC `security definer` del
  proyecto (ver migración 0031).

**Cambio en frontend** (`src/lib/api/notifications.ts`): `createAppUpdateNotification()` pasó de
`supabase.from('notifications').upsert(...)` a `supabase.rpc('ensure_app_update_notification', {
p_app_update_id, p_title })`. Cambió la firma (ya no recibe `profileId` — se resuelve en el servidor),
único caller (`AppUpdateBanner.tsx`) actualizado. La `ref`/deps estables del `useEffect` de
`AppUpdateBanner.tsx` (fix de 36.2, parte 2) no se tocaron — siguen evitando disparar la llamada de
más en cada `TOKEN_REFRESHED`.

**Por qué no se volvió al patrón `insert` + `catch(23505)`:** ya se había descartado una vez en 36.2
precisamente porque, aunque el código JS trate el error como éxito, el navegador igual loguea la
petición como 409 en la pestaña Network — el mismo síntoma que se estaba corrigiendo, solo que con
otro código de estado. La RPC evita el problema de raíz: PostgREST nunca ve un conflicto, porque la
resolución de "ya existe" ocurre dentro de la función, no en la petición HTTP hacia la tabla.

QA verificado por revisión de código (los 6 casos pedidos):
1. Primera vez para un usuario → `insert` inserta, `created=true`.
2. Mismo usuario/update de nuevo → `do nothing` no inserta, cae al `select`, `created=false`, sin
   excepción, sin petición con status de error.
3. Notificación ya leída → `do nothing` nunca ejecuta `update`, `is_read`/`read_at` intactos.
4. `TOKEN_REFRESHED` → ni siquiera dispara la llamada (fix de deps de 36.2 sigue vigente); si la
   disparara, la RPC es idempotente sin error de todos modos.
5. Cambio de usuario → `profileId` cambia, la `ref` no coincide, se llama de nuevo, `current_profile_id()`
   resuelve el nuevo usuario.
6. Usuario sin perfil activo → `current_profile_id()` es `null`, la función devuelve `created=false`
   sin insertar ni lanzar excepción.

## 37. Pulido final: mensajes de error, fallbacks humanos y limpieza chica (2026-08-13)

Pasada de cierre sobre lo ya construido — sin módulos nuevos, sin migraciones. Buscada específicamente
por el usuario tras confirmar que la consola ya no mostraba errores: textos técnicos residuales,
UUIDs/ids crudos en fallbacks, y consistencia de mensajes de error.

### 37.1 Mensajes de error crudos de Postgres (`describeSupabaseError`)

`src/lib/api/errors.ts` traduce los códigos de error de Postgres a mensajes institucionales desde
hace varias rondas, pero tenía dos puntos sin cubrir:

- **`23502` (NOT NULL)**: extraía el nombre de columna de la base con una regex y lo mostraba crudo
  (ej. "Falta completar un campo obligatorio: station_id."). Corregido para pasar ese nombre por
  `FIELD_LABELS` (el mismo diccionario que ya traduce los diffs de Auditoría a español, ver
  `src/lib/audit/humanize.ts`) — ahora dice "Falta completar un campo obligatorio: Cuartel.". Si el
  campo no está en el diccionario (constraint nueva sin agregar), cae al mensaje genérico "Faltan
  completar campos obligatorios." en vez de mostrar el nombre técnico.
- **Fallback final** (código de Postgres no contemplado explícitamente): antes devolvía
  `err.message`/`err.hint` crudo, en inglés y a veces con nombres de tabla/constraint. Ahora devuelve
  siempre el `fallback` genérico institucional ("Ocurrió un error inesperado..." o el que pase cada
  pantalla) — el error real sigue disponible en la consola del navegador (Supabase lo loguea aparte),
  solo no se muestra crudo al usuario.
- Se agregó el código **`23505`** (unique violation) explícitamente: "Ya existe un registro con esos
  datos." — antes cualquier violación de constraint única no contemplada caía al fallback genérico o
  al texto crudo.

### 37.2 UUIDs / ids crudos en fallbacks de nombre

Patrón corregido en varios lugares: `algo.find(x => x.id === id)?.name ?? id` mostraba el id crudo
cuando la relación apunta a un registro borrado/inaccesible (scope huérfano, cuartel eliminado,
usuario eliminado). Cambiado a texto humano en:

- `UsuarioDetallePage.tsx` (alcances/scopes de usuario): "Cuartel no disponible" / "Subsede no
  disponible" / "Regional no disponible" en vez del UUID.
- `InventarioDetallePage.tsx`, `SolicitudPrestamoDetallePage.tsx`, `SolicitudesPrestamoPage.tsx`:
  helpers `stationName()`/`profileName()` pasaron de `'—'` genérico a "Cuartel no disponible"/"Usuario
  no disponible" — mismo criterio, mensaje más específico sobre qué faltó.
- `DepartamentoDetallePage.tsx`: `stationName()`/`subsedeName()` idem, diferenciando "Sin cuartel
  asignado" (el campo nunca se cargó) de "Cuartel no disponible" (se cargó y el registro ya no existe)
  — son casos distintos que antes compartían el mismo texto.

Revisión dirigida confirmó que **no había más casos** de este patrón en Auditoría, Notificaciones,
Documentos, Inventario, Solicitudes de préstamo, Departamentos ni Reportes — el resto de los
fallbacks ya usaba texto humano (`'—'`, `'Elemento eliminado'`, etc.), solo faltaba especificidad en
los cinco casos de arriba.

### 37.3 Texto técnico visible — confirmado, sin cambios necesarios

Único lugar con jerga técnica visible ("Supabase", "Edge Function", `CRON_SHARED_SECRET`, "SQL
Editor"): `SystemSettingsSection.tsx`, montado en Ajustes **solo para `informatica_r4`**
(`{hasRole('informatica_r4') && <SystemSettingsSection />}`, `AjustesPage.tsx`). Es el panel de
configuración técnica del sistema — la audiencia es explícitamente informática, coincide con la regla
del pedido ("solo informatica_r4 puede ver datos técnicos, y únicamente donde tenga sentido"). No se
tocó.

No se encontraron placeholders de maqueta, estados vacíos con texto técnico, errores sin pasar por
`describeSupabaseError`, ni botones de acción sin gate de permiso (`canEdit`/`isAdmin`/`canManage`/
etc. ya cubren todos los casos revisados en Inventario, Solicitudes de préstamo, Departamentos y
Documentos).

### 37.4 Mobile / layout — confirmado sin bugs nuevos

Revisión rápida de modales (`Lightbox.tsx` ya usa `maxWidth`/`maxHeight: 100%`, sin cambios
necesarios) y de la variable de outline de foco (`--color-primary-light`, usada en `.contact-link` y
en todos los `input`/`select`/`textarea` del sistema desde antes de esta ronda): en dark mode
(`#7f1d1d`) tiene contraste bajo contra los fondos oscuros de card — **detectado pero no corregido**,
porque es una decisión de diseño preexistente y consistente en toda la app (no un bug introducido en
las rondas de contacto/layout), y tocar esa variable cambiaría el outline de foco de todos los
formularios del sistema — fuera del alcance de "corregir bugs evidentes sin rediseñar" de esta pasada.
Documentado acá para una futura revisión de accesibilidad dedicada.

### 37.5 Código muerto

Revisión de `src/lib/contact.ts` (helpers de contacto agregados en rondas anteriores) y de los
archivos tocados en esta pasada: sin imports, funciones o componentes sin uso. `isValidEmail` y
`normalizePhoneForWhatsApp` solo se llaman internamente dentro de `contact.ts` (por `buildMailto`,
`buildWhatsAppUrl`, `detectContactKind`) pero siguen exportadas como utilidad pública reutilizable —
no es código muerto, es una función auxiliar con un solo consumidor interno más los externos que ya
la usan indirectamente.

### 37.6 Sin migraciones nuevas

Esta ronda es 100% frontend — ningún cambio de esquema, RLS ni RPC. Se corrigió el checklist de
migraciones del inicio de este documento (sección 0 y 31.2), que había quedado desactualizado en "77
migraciones" desde la ronda de la sección 36 — ahora dice 79 (`0001`-`0079`), sin migraciones nuevas
de esta ronda en sí.

## 38. Accesibilidad: contraste del foco en modo oscuro (2026-08-13)

Pasada chica y específica sobre el hallazgo documentado en 37.4: el outline de foco de inputs y
`ContactLink` usaba `--color-primary-light`, que en dark mode tiene contraste bajo. Solo CSS —
ninguna lógica, RLS ni migración tocada.

**Causa exacta:** `--color-primary-light` es un *tinte* del color primario, no un color de foco — su
propósito real es servir de fondo sutil de elementos (junto con `--color-primary-lighter`, usada en
badges/`.btn-secondary`). En modo claro ese tinte es `#ef9a9a` (rosa claro, contraste aceptable como
outline por casualidad). En modo oscuro, la misma variable se redefine como `#7f1d1d` — correcto para
su rol real de "fondo oscuro sutil sobre superficie oscura", pero inservible como color de foco: un
outline de 2px en `#7f1d1d` sobre `--color-bg-card` (`#1e2c4d`) o `--color-bg-card-soft` (`#141d33`)
es casi invisible, dos oscuros muy próximos en luminancia. La variable tenía dos roles incompatibles
(fondo sutil vs. indicador de foco) y solo se le había dado un valor pensado para el primero.

**Variable nueva:** `--color-focus-ring`, definida junto al resto de la paleta en `:root` y redefinida
en `:root[data-theme='dark']` — mismo patrón que toda la paleta de colores del proyecto. En modo claro
mantiene el valor que `--color-primary-light` ya tenía (`#ef9a9a`, sin cambio visual). En modo oscuro
usa `#ef5350` — el mismo rojo vivo que ya es `--color-primary` en dark mode, ya probado con buen
contraste en toda la UI (texto, íconos, bordes) — dentro de la paleta institucional, sin colores
chillones ni ajenos a la identidad visual.

**Estilos actualizados** (todos los `outline` que usaban `--color-primary-light` pasan a
`--color-focus-ring`, y se agregó `:focus-visible` a los elementos interactivos que no tenían ninguno
propio — dependían del outline nativo del navegador, inconsistente entre navegadores y sin relación
con la identidad visual):
- `.field input:focus` / `select:focus` / `textarea:focus` — ya existía, variable actualizada.
- `.contact-link:focus-visible` — ya existía, variable actualizada.
- `.btn:focus-visible` — nuevo, cubre todos los botones (`.btn-primary`, `.btn-outlined`,
  `.btn-icon`, etc., incluidos los de todos los modales: `ReasonPromptModal`, `DeleteUserConfirmModal`,
  `NotificationDetailModal`, ya que sus botones usan `.btn` sin overrides propios).
- `.sidebar-link:focus-visible` — nuevo, navegación/drawer (offset negativo para no solaparse con el
  ítem vecino en la lista vertical).
- `.link-muted:focus-visible` — nuevo, cubre "Volver a...", "+ Agregar", "Ver todos" en headers de
  sección.
- `a.card:focus-visible` / `a.card-solid:focus-visible` — nuevo, cubre las cards de listado usadas
  como `<Link>` (Cuarteles, Inventario, Documentos/Carpetas, Notificaciones — `.list-item` siempre se
  combina con `.card-solid` en el código existente, así que queda cubierto por la misma regla).

**No se tocó:** los `<Link>` de fila plana sin `className="card"`/`"list-item"` (algunos listados de
`PanelPage.tsx`/`CalendarioPage.tsx` con `style={{}}` inline) siguen con el outline nativo del
navegador — cubrirlos exigiría agregar clases en varias páginas, fuera del alcance de "pasada chica,
sin rediseñar" de este pedido; el outline nativo ya es funcional, solo no coincide con la identidad
visual. Tampoco se tocó `.search-input input { outline: none }` (input de búsqueda dentro de un
contenedor con su propio feedback visual) ni ningún otro `outline: none` — no había ninguno que
suprimiera el foco sin alternativa visual.

**Modo claro:** sin cambios visuales — `--color-focus-ring` en `:root` tiene el mismo valor que
`--color-primary-light` siempre tuvo ahí.

**Migraciones:** ninguna. **Qué correr en Supabase:** nada — 100% CSS.

## 39. Identidad visual y redacción de los reportes PDF (2026-08-13)

Corrección de textos generados automáticamente en los PDF (`src/lib/pdf/`), footer, y logo del
encabezado — sin tocar datos guardados, RLS ni IA.

### 39.1 "Cuartel Asociación..." — redacción del resumen ejecutivo

El título del PDF (`Reporte General — ${nombre}`, en `generateStationGeneralReport`) ya estaba
correcto desde antes de esta ronda. El problema real estaba en el **resumen ejecutivo**: la primera
línea armaba `` `Cuartel ${station.name} (${station.code}), subsede ${station.subsede?.name}, estado
${station.status}.` `` — como `station.name` para este cuartel ya es "Asociación Bomberos Voluntarios
Villa del Rosario" (nombre real, sin la palabra "Cuartel"), anteponer la palabra generaba "Cuartel
Asociación Bomberos Voluntarios Villa del Rosario...", una frase que suena a que "Cuartel" fuera
parte del nombre propio.

Corregido con un helper nuevo, `stationSummaryLine()` (`src/lib/pdf/reportText.ts`), que arma la
frase con etiquetas separadas por punto en vez de concatenar todo en una oración: "Cuartel: Asociación
Bomberos Voluntarios Villa del Rosario (030). Subsede: Luque. Estado: operativo." — sin inventar
datos, sin campos técnicos, y sin la ambigüedad de "Cuartel X" como si fuera un nombre compuesto.

### 39.2 "subsede Subsede Luque" — duplicación del nombre de subsede

Causa: `subsedes.name` en la base **ya incluye** la palabra "Subsede" como parte del nombre real (ej.
"Subsede Luque", "Subsede Rio Primero" — así se cargaron desde las migraciones 0001/0007, es el
nombre propio de la subsede, no se cambia). El texto del resumen anteponía otra vez la palabra
"subsede" al armar la frase, generando "subsede Subsede Luque".

Corregido con `shortSubsedeName()` (mismo archivo `reportText.ts`), que le saca el prefijo "Subsede "
al nombre SOLO cuando ya lo trae (con una regex case-insensitive), para usarlo junto a una etiqueta
que ya dice "Subsede:" — "Subsede: Luque" en vez de "Subsede: Subsede Luque". Si el nombre no trae el
prefijo, se devuelve tal cual (no rompe si en el futuro se carga una subsede con nombre distinto).
`stationSummaryLine()` ya lo usa internamente. Se aplicó además en las 4 tablas donde una columna
"Subsede" mostraba el nombre completo con el prefijo repetido visualmente bajo su propio encabezado
(reportes de Asistencias, Intervenciones, Vehículos, y el listado de cuarteles del Regional
Consolidado) — antes decía "Subsede Luque" bajo la columna "Subsede" (redundante), ahora dice "Luque".

**No se modificó ningún nombre guardado en la base** — ambos helpers son puramente de formato de
texto en el momento de generar el PDF.

### 39.3 Footer institucional del PDF

`ReportBuilder.finalize()` (pie de página, se repite en cada hoja) cambió de "Sistema creado por Dpto.
Informática y Estadística R4" a **"Datos extraídos de SIGER4"**, manteniendo el número de página
("Página X de Y") y el estilo sobrio (misma línea separadora, mismo tamaño de fuente 7.5pt, mismo
color muted). Es un cambio exclusivo de `reportBuilder.ts` — el footer institucional de la app web
(`src/components/layout/Footer.tsx`, visible al pie de cada pantalla) usa el mismo texto de siempre y
**no se tocó**, son dos componentes completamente separados.

### 39.4 Logo del cuartel en el encabezado del PDF

`ReportContext` (la config que recibe `ReportBuilder`) tiene un campo nuevo opcional
`stationLogoUrl?: string | null`. Reglas de resolución del logo de la derecha del encabezado (el
izquierdo, de Escuela, sigue fijo siempre):

1. Si el reporte pasa `stationLogoUrl` (solo `generateStationGeneralReport`, el único generador cuyo
   sujeto ES un cuartel específico) y esa URL carga correctamente con un formato soportado → logo del
   cuartel.
2. En cualquier otro caso — sin `stationLogoUrl` (reportes regional, de subsede, departamentos,
   escuela, asistencias/intervenciones/cursos/vehículos incluso si están filtrados a un cuartel entre
   varios), cuartel sin `logo_url` cargado, la carga falla (URL rota / Storage inaccesible), o el
   formato de imagen no es soportado por jsPDF → **fallback al logo institucional de Informática**,
   exactamente el comportamiento que ya existía antes de esta ronda.

**Por qué solo `cuartel_general`:** es el único reporte cuya identidad completa es "este cuartel"
(título dedicado, `needsStation: true` sin combinarse con otros alcances). Los reportes de
Asistencias/Intervenciones/Cursos/Vehículos pueden filtrarse opcionalmente a un cuartel entre varios o
incluir toda una subsede/región — no tienen un "sujeto" único al que asociarle un logo sin ambigüedad,
así que siguen usando los logos institucionales fijos sin cambios (cumple "no romper reportes
regionales, de subsede, departamentos, escuela ni inventario").

**Tipo de imagen (`jsPDF` `addImage` type):** antes se forzaba `'PNG'` fijo para los logos cargados
por URL, aunque un logo de cuartel puede subirse como PNG/JPEG/WEBP (`ImagePicker`/`storage.ts` no
restringe el formato al subir). Se agregó `detectImageFormatForPdf()` (`src/lib/pdf/assets.ts`), que
lee el prefijo real del dataURL (`data:image/png;base64,...` / `data:image/jpeg;base64,...`) en vez de
asumir. **WEBP no es soportado por jsPDF** — se trata como "logo no usable" (la función devuelve
`null`), lo que hace que el caller caiga automáticamente al fallback institucional en vez de romper el
PDF o insertar una imagen corrupta. Los logos institucionales fijos (`/public/logos/*.png`, generados
por el propio proyecto) siguen siendo siempre PNG, sin cambio de comportamiento ahí. Los gráficos de
barra (`renderBarChartToDataUrl`, siempre generados internamente vía `canvas.toDataURL('image/png')`)
no se tocaron — ahí `'PNG'` fijo sigue siendo correcto porque nunca vienen de una fuente externa.

**Fallback de carga:** `loadImageAsDataUrl` (`assets.ts`) ahora lanza si el `fetch` responde con un
status de error (antes un 404/403 de Storage silenciosamente producía un blob vacío/corrupto); el
caller (`loadRightLogo()` en `reportBuilder.ts`) ya envuelve la carga del logo de cuartel en
`.catch(() => null)`, así que cualquier falla (red, permiso de Storage, formato) resuelve al fallback
institucional sin romper la generación del PDF.

### 39.5 Reportes revisados

Los 8 tipos de reporte (`REPORT_GENERATORS` en `reportGenerators.ts`) fueron revisados uno por uno:

- **Asistencias, Intervenciones, Vehículos**: sin cambio de logo (no tienen un cuartel único como
  sujeto); corregida la columna "Subsede" de sus tablas de detalle (39.2).
- **Cursos (Escuela)**: sin cambios — no menciona cuartel/subsede en su resumen ni tablas.
- **Reporte General por Cuartel**: título ya correcto; resumen ejecutivo corregido (39.1); logo de
  cuartel conectado (39.4).
- **Regional Consolidado**: sin cambio de logo; corregida la columna "Subsede" del listado de
  cuarteles (39.2). Su resumen ejecutivo ("La regional cuenta con...") no tenía el patrón "Cuartel
  X"/"subsede Y", no necesitó cambios de redacción.
- **Departamentos — General** y **Departamento específico**: no mencionan cuartel/subsede en frases
  propensas a este bug (usan `stationName()` como valor de celda de tabla, ya con fallback humano
  desde una ronda anterior); sin cambios de logo, correcto (no son reportes de cuartel).

### 39.6 Migraciones / Supabase / Edge Functions

Ninguna migración, ningún cambio de RLS, ninguna Edge Function tocada — 100% frontend
(`src/lib/pdf/`). No hace falta correr nada en Supabase ni redesplegar funciones.

### 39.7 Logo izquierdo del PDF era institucionalmente incorrecto (mismo día)

Al pedido de 39.4 (logo de cuartel a la derecha) le seguía una duda: el logo izquierdo del PDF era
**siempre** `logo-escuela.png`, fijo, en los 8 tipos de reporte — incluidos Regional Consolidado,
Departamentos, Reporte General por Cuartel, que no tienen relación temática con la Escuela.

**Investigación:** `public/logos/README.md` confirma que `logo-escuela.png` es específicamente el
logo de la Escuela Regional de Bomberos y `logo-informatica.png` el del Dpto. Informática y
Estadística R4 — no existe ningún logo genérico de "Regional 4" o "SIGER4" en el proyecto. Revisando
dónde se usa cada uno en el resto de la app: `AppHeader.tsx` (header visible en TODA la app, no solo
Escuela) usa únicamente `logo-informatica.png` — es el logo que ya actúa como marca del sistema en
general. `Sidebar.tsx` y `EscuelaPage.tsx` usan únicamente `logo-escuela.png` — contextual a ese
módulo. En Login/Ajustes/CambiarPassword aparecen los dos juntos, como crédito institucional dual.
Esto confirma que usar Escuela fijo en todos los reportes no correspondía — debía ser Informática
(salvo en el reporte que sí es de Escuela).

**Criterio final** (confirmado con el usuario antes de aplicar, dos alternativas eran razonables):
ambos logos institucionales siguen presentes siempre en el encabezado del PDF (como en Login/Ajustes),
pero cuál va a la posición izquierda (principal) depende del tema del reporte:

- **Reporte de Cursos y Escuela** (`generateCoursesReport`, el único cuyo tema es la Escuela): Escuela
  a la izquierda, Informática a la derecha.
- **Los otros 7 reportes** (Asistencias, Intervenciones, Vehículos, Reporte General por Cuartel,
  Regional Consolidado, Departamentos General, Departamento específico): Informática a la izquierda,
  Escuela a la derecha — mismo par de logos, orden invertido.
- **Reporte General por Cuartel**: sin cambios respecto a 39.4 — el logo de cuartel sigue
  reemplazando lo que le toque a la posición derecha (que con este cambio de criterio pasa a ser
  Escuela institucionalmente, en vez de Informática) cuando existe y carga bien; mismo fallback si no.

**Implementación:** `ReportContext` (`reportBuilder.ts`) gana un campo opcional `theme?: 'default' |
'escuela'` (default: `'default'`). `init()` resuelve qué URL institucional va a la izquierda y cuál
al fallback de la derecha según el tema, antes de intentar el logo de cuartel. Solo
`generateCoursesReport` pasa `theme: 'escuela'`; los demás no necesitaron ningún cambio (heredan el
default correcto).

**No hace falta reemplazar nada en `public/logos/`** — ambos logos existentes ya son los correctos
institucionalmente, solo estaban aplicados en la posición equivocada para 7 de los 8 reportes. No se
creó ningún logo nuevo ni genérico de "Regional 4"/SIGER4: ese rol ya lo cumple `logo-informatica.png`
en el resto del sistema, y se trasladó el mismo criterio a los PDF.

Sin cambios en la app web, RLS ni migraciones — mismo alcance 100% frontend que el resto de la
sección 39.

## 40. Diagnóstico del cron semanal, Mapa Regional v1, Importador Excel v1, logo SIGER4 (2026-08-20) — migraciones 0080-0082

Tanda grande en 4 frentes independientes: diagnóstico de por qué no llegó la notificación semanal,
primera versión del Mapa Regional (cuarteles georreferenciados), primera versión del importador de
datos desde Excel/CSV, y reemplazo del logo de Escuela por el sello general de SIGER4.

### 40.1 Diagnóstico de la notificación semanal que no llegó

**No se encontró ningún bug de código en el pipeline** (`send_weekly_reminder()`/
`send_weekly_admin_summary()`, migraciones 0036→0073→0074): el advisory lock (0070/0072) está
correctamente diseñado con scope de transacción, se libera solo, y su propio autor ya documentó que
no era la causa; la zona horaria del cron (`0 15 * * 1` = lunes 15:00 UTC = lunes 12:00 ART) es
correcta y no hay corrimiento de día; la notificación interna y el push real están intencionalmente
desacoplados (el fallo de uno nunca bloquea al otro); y desde 0074, si falta `project_url`/
`cron_shared_secret` en `system_settings`, además del `raise warning` en logs de Postgres (invisible
en la práctica) se dispara una `alerta_admin` **visible dentro de la app** a `informatica_r4`/
`integrante_informatica` — con el título exacto "Recordatorio semanal: push no configurado".

**Causa más probable** (no se pudo confirmar contra la base real, no hay acceso a ella desde este
entorno): `system_settings.cron_shared_secret` nunca se terminó de configurar tras el pase de
0073/0074 a producción — es el único paso manual documentado (sección 33.4) que ninguna migración
automatiza. Sin él, `send_weekly_reminder()` crea la notificación interna igual (así que **debería
estar visible entrando a `/notificaciones`**, aunque no haya llegado como push del sistema
operativo), pero nunca dispara el `net.http_post` hacia `send-push-system` — el push real nunca sale.
Otras causas posibles, en orden de probabilidad: el job de pg_cron nunca llegó a crearse (extensiones
`pg_cron`/`pg_net` no habilitadas antes de correr 0036), el usuario puntual tiene
`weekly_reminder_enabled=false` o nunca aceptó permisos de push en el navegador (`push_subscriptions`
vacía para su perfil), o un error puntual en `send-push-system` (revisar sus secretos:
`VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`/`SUPABASE_SERVICE_ROLE_KEY`/`CRON_SHARED_SECRET`).

**Mejora de diagnóstico agregada** (migración `0080_cron_job_diagnostics.sql`): `get_weekly_push_diagnostics()`
(0074) ya podía responder "¿la notificación interna disparó el push?", pero daba por sentado que el
job de cron efectivamente había corrido — si no había filas, era indistinguible de "no había nada que
notificar esa semana". Nueva RPC `get_cron_job_diagnostics(p_job_name)`, `security definer`, restringida
a `is_informatica_r4()`, que lee `cron.job`/`cron.job_run_details` (schema de la extensión pg_cron,
solo legible por su dueño) y responde sin ambigüedad: si el job existe, si está activo, y el
resultado de sus últimas 10 corridas reales (fecha, éxito/error, mensaje).

El panel de Ajustes → Configuración del sistema (`SystemSettingsSection.tsx`) ahora muestra, al tocar
"Revisar últimos 7 días": estado del job de cron (`siger4-weekly-reminder`) primero, después el
resumen de notificaciones internas vs. push intentado/enviado (ya existía), y un **motivo probable**
calculado combinando las tres fuentes (job no programado → job desactivado → última corrida con error
→ notificación no se creó → push nunca se intentó → push intentado con error → push intentado sin
suscripciones activas → sin problemas detectados). `src/lib/api/systemSettings.ts` ganó
`fetchCronJobDiagnostics()`.

**No se duplicó nada, no se generó spam**: no se tocó la lógica de envío en sí, solo se agregó una
consulta de solo-lectura nueva. El guard `not exists (... created_at >= now() - interval '24 hours')`
que ya evitaba spamear la alerta de "push no configurado" (0074) sigue igual, sin cambios.

### 40.2 Mapa Regional v1

Pantalla nueva en `/mapa` (`src/pages/MapaRegionalPage.tsx`), enlazada en el nav como "Mapa Regional".
Muestra los cuarteles como pines sobre un mapa de OpenStreetMap (sin costo, sin API key). Cada pin,
al tocarlo, abre un popup con: nombre, código, subsede (nombre completo, no acortado — formato pedido
`030 · Subsede Luque` se usa en la lista de "sin ubicación" más abajo, no en el popup del pin), dirección
si existe, teléfono/WhatsApp/email clicables (reutiliza `ContactLink`, sin duplicar lógica de contacto),
y un link a "Ver detalle del cuartel". Filtro por subsede arriba del mapa. Los cuarteles sin
coordenadas cargadas **nunca aparecen en el mapa** (no se inventa ni estima ninguna ubicación) — se
listan aparte, debajo del mapa, en una sección "Cuarteles sin ubicación cargada", cada uno con link a
su detalle para poder cargarla.

**Librería**: `leaflet` + `react-leaflet@^4` (la v5 exige React 19; el proyecto usa React 18, así que
se fijó la v4, compatible). Sin Google Maps ni ninguna librería con costo/API key. Los pines usan un
ícono SVG propio (rojo institucional, mismo mecanismo que el resto de los íconos de la app) en vez de
los PNG por defecto de Leaflet, que requieren configurar rutas de assets a mano con Vite.

**Campos nuevos en `stations`** (migración `0081_station_coordinates.sql`): `latitude numeric(9,6)`,
`longitude numeric(9,6)`, `map_notes text` — los tres opcionales, ningún cuartel existente pierde
datos ni queda inválido. Constraints de base (`stations_latitude_range`/`stations_longitude_range`)
validan el rango (-90/90, -180/180) como garantía real, no solo del lado del formulario. Sin cambios
de RLS (columnas más de una tabla ya cubierta por sus policies existentes).

**Carga de coordenadas**: `CuartelFormPage.tsx` ganó dos campos numéricos (Latitud/Longitud) + un campo
de texto libre (Nota de ubicación, solo visible si hay coordenadas cargadas). Ambas coordenadas se
piden juntas o ninguna (una sola no ubica nada en el mapa) — si se carga solo una, el formulario
rechaza el guardado antes de llegar a la base. Sin obligar coordenadas para crear un cuartel nuevo.

**Preparado para la fase futura (puntos de inflexión / referencia territorial) — solo diseño, sin
implementar**: rutas por jurisdicción de cuartel, parques industriales, ríos, zonas de riesgo, límites
o sectores operativos, referencias estratégicas regionales. Diseño propuesto para cuando se decida
implementarlo:

- Tabla nueva `map_reference_points` (no creada en esta ronda): `id`, `type` (enum: `ruta`,
  `parque_industrial`, `rio`, `zona_riesgo`, `limite_operativo`, `referencia_estrategica`, `otro`),
  `name`, `description`, `geometry` (punto: `latitude`/`longitude`; para líneas/polígonos —rutas,
  límites— evaluar `geometry` con PostGIS si se habilita esa extensión, o una tabla de puntos
  ordenados `map_reference_point_vertices(point_id, sequence, latitude, longitude)` si no se quiere
  agregar PostGIS todavía), `region_id`/`subsede_id`/`station_id` (todos opcionales, un punto puede no
  estar asociado a ningún cuartel puntual — ej. un río que cruza varias jurisdicciones), `is_active`,
  `created_by_profile_id`, timestamps. RLS: lectura abierta a autenticados (mismo criterio que
  `stations`), escritura solo `informatica_r4`/`secretario_regional` (carga manual desde un panel
  dedicado, mencionada explícitamente en el pedido).
- Capas por tipo: en el frontend, un control de capas de Leaflet (`LayersControl` de react-leaflet)
  con un checkbox por `type`, cada una con su propio ícono/color — nunca todas visibles a la vez por
  defecto, para no saturar el mapa.
- Filtros por subsede: mismo `<select>` que ya existe en el Mapa Regional v1, extendido para filtrar
  también los puntos de referencia, no solo los cuarteles.
- Importación futura desde Excel/GeoJSON/KML: una vez que exista la tabla, el Importador Excel v1
  (sección 40.3) podría extenderse con un módulo `puntos_referencia` reutilizando el mismo motor de
  mapeo/validación — GeoJSON/KML necesitarían un parser aparte (no cubierto por `exceljs`), mencionado
  como sugerencia en el pedido, no implementado.

### 40.3 Importador de datos desde Excel/CSV v1

Pantalla nueva en `/importar` (`src/pages/ImportarDatosPage.tsx`), enlazada en el nav como "Importar
datos" (oculta solo para `invitado`, que no tiene permiso de escritura en ninguna tabla destino) y con
un acceso directo adicional desde Inventario Regional (junto al botón "Solicitudes"). Flujo completo:
elegir módulo → subir archivo → revisar/corregir mapeo de columnas → vista previa con validación fila
por fila → confirmar → resumen (creados/omitidos/errores). **El archivo nunca se guarda ni queda como
dato final** — solo se usa como fuente para completar los inserts reales; nada se toca en la base
hasta que el usuario confirma explícitamente después de ver la vista previa completa.

**Módulos soportados**: Personal, Vehículos, Asistencias, Inventario Regional — exactamente los
pedidos, sin Cursos ni Intervenciones (excluidos explícitamente).

**Librería de parseo**: se evaluó `xlsx` (SheetJS), pero tiene 2 vulnerabilidades de severidad **alta**
sin fix disponible (Prototype Pollution + ReDoS) — incompatible con el requisito de
`npm audit --audit-level=high` limpio del propio pedido. Se usó **`exceljs`** en su lugar (2
vulnerabilidades moderadas de una dependencia transitiva —`uuid`—, no bloquean `--audit-level=high`).
CSV se parsea con una función propia (sin librería extra), con detección automática de separador
(`,` vs `;`, para exportaciones de Excel en configuración regional es-AR) y soporte de comillas para
valores con el separador adentro.

**Mapeo automático de columnas** (`src/lib/import/columnMapping.ts`): normaliza cada encabezado del
archivo (minúsculas, sin tildes, espacios colapsados) y lo compara contra un diccionario de alias por
campo y por módulo — cubre exactamente los sinónimos pedidos (móvil/código/número, cuartel/station/
sede, subsede, teléfono/celular, dominio/patente, tipo/categoría, observaciones/obs, período/mes) más
variantes adicionales del mismo estilo. Primero busca coincidencia exacta normalizada; si no hay,
busca coincidencia parcial (contención de substring) como segundo intento. **El resultado del mapeo
automático siempre se muestra al usuario para revisión manual antes de poder avanzar** — nunca se
importa con un mapeo sin confirmar, y el usuario puede reasignar cualquier columna a cualquier campo
(o descartarla) desde un `<select>` por columna.

**Validación fila por fila** (`src/lib/import/validateRow.ts`): campos obligatorios por módulo, fechas
(acepta `AAAA-MM-DD` o `DD/MM/AAAA`), números, porcentajes de asistencia **sin redondear** (mismo
criterio `truncateDecimals` que el resto del sistema), categorías/estados válidos, tipo de vehículo
validado contra `VEHICLE_TYPE_OPTIONS` (la misma lista del combobox de `VehiculoFormPage.tsx`,
exportada para reutilizarla acá en vez de duplicarla), y resolución de cuartel por nombre o código
exacto (case-insensitive) contra los cuarteles que el usuario puede ver — si el archivo menciona un
cuartel fuera de su alcance, `fetchStations()` (que ya respeta RLS) ni siquiera lo trae, así que la
fila queda con "no se encontró el cuartel" en vez de filtrar datos de otro alcance. Ninguna fila
inválida se inserta — queda registrada como "omitida" con el motivo exacto.

**No hay detección de duplicados/actualización en v1**: ninguna de las 4 tablas destino
(`personnel`/`vehicles`/`attendance_summaries`/`inventory_items`) tiene una constraint única natural
para decidir "esto ya existe, actualizar en vez de crear" sin arriesgar inventar un criterio — se
documenta como limitación conocida. El enum `import_row_status` ya incluye `'actualizado'` para
cuando se defina esa clave a futuro; en v1 esa categoría siempre queda en 0.

**Permisos**: el importador **no reimplementa ninguna lógica de alcance propia** — cada fila válida
se inserta con el cliente autenticado normal (nunca `service_role`), así que la RLS ya existente de
cada tabla destino decide sola qué puede crear cada usuario según su rol/alcance real (confirmado
leyendo las policies: `attendance_write_admin_regional_station`/`personnel_write_admin_regional_station`/
`vehicles_write_admin_regional_station` ya distinguen informática/rol regional/rol de cuartel;
`inventory_items_write_regional` ya excluye a los roles de cuartel del todo). Si RLS rechaza una fila
(usuario intentando importar fuera de su alcance), queda registrada como error de esa fila puntual,
con el mensaje ya traducido por `describeSupabaseError` — nunca se "salta" el control de permisos de
ninguna forma.

**Historial por lote** (migración `0082_import_batches.sql`): tablas `import_batches` (metadatos del
lote: módulo, estado, archivo, contadores creados/actualizados/omitidos/errores, mapeo de columnas
usado, quién y cuándo) e `import_batch_rows` (resultado fila por fila, con los datos crudos originales
y el motivo si falló). RLS: cada usuario ve solo sus propios lotes (un lote es una acción personal de
carga, no un dato institucional compartido), `informatica_r4` ve todos. Cada fila creada en las tablas
destino **ya queda auditada automáticamente** por el trigger genérico `audit_row_change()` existente
(sin ningún cambio ahí) — no hace falta lógica de auditoría adicional para el importador en sí.
**No se implementó rollback/reversión de lote** (mencionado como demasiado grande para esta ronda,
documentado como fase futura junto con el resto de las sugerencias en 40.5).

**Plantillas**: sí, implementadas — un botón "Descargar plantilla de ejemplo (.csv)" por módulo,
generado en el cliente (sin librería extra) con los encabezados exactos que el mapeo automático
reconoce, para minimizar corrección manual al momento de mapear.

**Rendimiento del bundle**: `exceljs` es una dependencia pesada (~950 KB minificado) usada solo en
esta pantalla — se aplicó `React.lazy`+`Suspense` tanto a `ImportarDatosPage` como a
`MapaRegionalPage` (Leaflet también es pesada) para que ninguna de las dos infle el bundle principal
que descargan todos los usuarios en cada carga de la app.

### 40.4 Logo: `logo-escuela.png` reemplazado por el sello SIGER4

El usuario agregó `SIGER4.png` (sello general "SIGER4 · Bomberos Voluntarios", no específico de
Escuela) en la raíz del repo, con instrucción de que reemplace el logo llamado `logo-escuela.png` en
todos lados. Se confirmó explícitamente con el usuario antes de aplicar (el archivo nuevo no es
temáticamente "Escuela", y reemplazarlo debilitaba la distinción visual entre el logo de Escuela y el
de Informática que se había corregido en la sección 39.7 de reportes PDF) — se confirmó proceder de
forma literal.

Aplicado: `public/logos/logo-escuela.png` reemplazado por el contenido de `SIGER4.png` (mismo nombre
de archivo, así que **ninguna referencia en el código necesitó tocarse** — reportes PDF, Login,
Sidebar, Ajustes, CambiarPassword, EscuelaPage, favicon y manifest de la PWA ya apuntan a ese path).
Se actualizaron los textos `alt` de `<img>` que decían literalmente "Escuela Regional de Bomberos" (ya
no exacto) a "SIGER4", en `Sidebar.tsx`, `CambiarPasswordPage.tsx`, `LoginPage.tsx`, `EscuelaPage.tsx`
y `AjustesPage.tsx` — el `<h1>Escuela Regional de Bomberos</h1>` de `EscuelaPage.tsx` no se tocó
(describe el módulo Escuela en sí, no la imagen). `public/logos/README.md` actualizado con el
historial del reemplazo y una nota explícita: el `theme: 'escuela'` de `reportBuilder.ts` (sección
39.7) sigue funcionando igual a nivel de código (decide cuál logo va a la izquierda/derecha), pero la
distinción *visual* entre "logo de Escuela" y "logo de Informática" quedó debilitada hasta que se
cargue un logo específico de Escuela de nuevo bajo otro nombre de archivo, si se decide mantenerla.
`SIGER4.png` de la raíz se eliminó tras copiarlo a su ubicación final (evita el archivo duplicado en
el repo). El archivo es grande para un logo web (1.3 MB vs. los 24 KB que tenía el anterior) — no se
optimizó/comprimió en esta ronda (no hay herramienta de procesamiento de imágenes en el proyecto),
queda como mejora sugerida.

### 40.5 Sugerencias adicionales — NO implementadas, solo propuestas

Tal como pidió el usuario, quedan solo como propuesta, sin código:

- Mapa con capas territoriales completas y puntos de inflexión regionales — diseño ya en 40.2.
- Importación desde GeoJSON/KML — necesitaría un parser dedicado (no cubierto por `exceljs`).
- Exportación a Excel de datos ya existentes en el sistema (dirección inversa a la de esta ronda).
- Detección de datos faltantes / calidad de datos por cuartel (ej. extender `station_compliance` con
  un score de completitud de contacto/coordenadas/personal).
- Historial completo de importaciones con filtros (UI dedicada sobre `import_batches`, más allá del
  resumen inmediato post-importación que ya tiene `ImportarDatosPage.tsx`).
- Reversión de importación por lote (borrar en cascada lo creado por un `import_batch_id` puntual) —
  mencionado en el pedido como "no implementar si es mucho, dejar preparado": el esquema
  (`target_record_id` en `import_batch_rows`) ya deja la trazabilidad necesaria para poder construir
  esto después sin cambiar el modelo de datos, pero la función de reversión en sí no se escribió.
- Carga masiva de coordenadas (ej. un modo del Importador Excel dedicado a actualizar
  `latitude`/`longitude`/`map_notes` de cuarteles existentes en lote).
- Dashboard territorial (vista agregada combinando mapa + semáforo de cumplimiento + indicadores por
  zona).

### 40.6 Migraciones nuevas de esta ronda

- `0080_cron_job_diagnostics.sql` — RPC `get_cron_job_diagnostics()`.
- `0081_station_coordinates.sql` — `stations.latitude`/`longitude`/`map_notes` + constraints de rango.
- `0082_import_batches.sql` — tablas `import_batches`/`import_batch_rows`, tipos enum, RLS.

### 40.7 Qué correr en Supabase

1. Migraciones `0080`, `0081`, `0082`, en orden.
2. Confirmar (no es un paso nuevo, es el diagnóstico de 40.1) que `system_settings` tenga
   `project_url` y `cron_shared_secret` configurados desde Ajustes → Configuración del sistema, y
   correr "Revisar últimos 7 días" para confirmar con certeza la causa real de la notificación que no
   llegó — este documento no pudo confirmarla contra la base real.

Ninguna Edge Function nueva ni con cambios de código. Redeploy normal del frontend (Vercel) — hay
dependencias nuevas (`leaflet`, `react-leaflet`, `@types/leaflet`), así que el build de Vercel va a
instalar paquetes nuevos en este deploy.

**Actualización (2026-08-20, ver sección 41):** el Importador de Excel/CSV descripto en 40.3/40.5 se
eliminó por decisión de producto (no se iba a usar todavía) — `exceljs` ya NO es una dependencia del
proyecto. El resto de esta sección 40 (diagnóstico de cron, Mapa Regional v1, logo SIGER4) sigue
vigente sin cambios de fondo, con las correcciones de la sección 41 (CSP del mapa, optimización del
logo).

## 41. Revertir el Importador de Excel, corregir el Mapa (CSP de tiles), optimizar el logo, limpieza de seguridad del repo público (2026-08-20) — migración 0083

Pasada de corrección sobre la ronda anterior (sección 40): se decidió no usar el Importador de Excel
por ahora, el Mapa Regional cargaba sin las teselas de OpenStreetMap (CSP), el logo nuevo pesaba
demasiado, y se hizo una revisión de seguridad del repo público (es público en GitHub).

### 41.1 Importador de Excel/CSV — eliminado completamente

Decisión de producto: no sumar la complejidad del importador todavía. Se eliminó de punta a punta:

- **Frontend**: `src/pages/ImportarDatosPage.tsx` y todo `src/lib/import/` (`parseFile.ts`,
  `columnMapping.ts`, `validateRow.ts`, `runImport.ts`) borrados. Ruta `/importar` sacada de
  `App.tsx` (junto con el `lazy()`/`Suspense` que la cargaba). Ítem de nav "Importar datos" sacado de
  `navigation.ts`. Acceso directo desde Inventario Regional (botón "Importar" junto a "Solicitudes")
  sacado de `InventarioPage.tsx`. `VEHICLE_TYPE_OPTIONS` (`VehiculoFormPage.tsx`) volvió a ser privado
  del archivo — se había exportado solo para que el importador la reutilizara.
- **Tipos**: `ImportModule`/`ImportBatchStatus`/`ImportRowStatus`/`ImportBatch`/`ImportBatchRow`
  sacados de `src/types/database.ts`.
- **Dependencia**: `exceljs` desinstalado (`npm uninstall exceljs`) — ya no está en `package.json`
  ni en `package-lock.json`. Esto también hizo desaparecer las 2 vulnerabilidades moderadas que traía
  como dependencia transitiva (`uuid`): `npm audit` vuelve a estar en 0 vulnerabilidades totales, no
  solo por debajo del umbral `--audit-level=high`.
- **CSS**: no había ningún estilo específico del importador en `styles.css` (usaba solo clases
  genéricas ya existentes: `.card-solid`, `.field`, `.btn`), así que no hubo nada que limpiar ahí.

**Base de datos — SÍ se eliminaron las tablas** (el usuario confirmó que la migración 0082 ya se
había corrido en producción): migración nueva `0083_drop_import_batches.sql` hace `drop table if
exists import_batch_rows`/`import_batches` y elimina los 3 tipos enum que 0082 había creado
(`import_module`, `import_batch_status`, `import_row_status`). **No se tocó ningún dato real**:
`personnel`/`vehicles`/`attendance_summaries`/`inventory_items` (las tablas destino a las que el
importador insertaba, si llegó a usarse) no se tocan — solo se borra el historial de metadatos de
lotes en sí, que deja de tener sentido sin la función que lo generaba. El archivo `0082_import_batches.sql`
original **no se borró ni se editó** — queda en el historial de migraciones como registro de que esa
tabla existió y por qué se creó; `0083` es la reversión explícita, siguiendo el mismo criterio que el
resto de las migraciones del proyecto (nunca editar una migración ya aplicada, siempre agregar una
nueva que corrija).

### 41.2 Mapa Regional — corregido el CSP que bloqueaba las teselas de OpenStreetMap

**Causa exacta**: el CSP de `vercel.json` (`img-src 'self' data: blob: https://*.supabase.co`) no
incluía el dominio de las teselas de OpenStreetMap (`https://{s}.tile.openstreetmap.org/...`, donde
`{s}` es un subdominio dinámico `a`/`b`/`c`) — el navegador bloqueaba silenciosamente esas imágenes
por política de seguridad, dejando el mapa gris/blanco con solo el pin (SVG inline, no bloqueado) y
el popup (DOM/texto, no bloqueado) visibles. El CSS de Leaflet (`leaflet/dist/leaflet.css`) y el
`MapContainer` en sí NO eran el problema: Vite empaqueta ese CSS dentro del propio chunk de
`MapaRegionalPage` (servido desde `'self'`, confirmado en el build:
`MapaRegionalPage-*.css`), así que nunca violó `style-src`.

**Corrección**: `img-src` en `vercel.json` ahora incluye `https://*.tile.openstreetmap.org`. Sin
cambiar de proveedor de tiles (se evaluó y se descartó — OpenStreetMap sigue siendo la opción
correcta: libre, sin costo, sin API key, con atribución ya presente en el código desde la sección
40.2 y sin cambios acá). No se necesitó cambiar `connect-src` (Leaflet carga los tiles como `<img>`,
no via `fetch`/XHR).

**Resto del checklist revisado, sin encontrar más problemas**: altura/contenedor del mapa (`.card`
con `height: min(70vh, 560px)` y `overflow: hidden`) ya estaba bien desde la sección 40.2; z-index de
Leaflet ya estaba acotado (`.leaflet-pane`/`.leaflet-top`/`.leaflet-bottom`/`.leaflet-popup` en
`styles.css`) para no competir con sidebar/drawer; dark mode no tiene un bug real — el popup de
Leaflet mantiene su fondo blanco por diseño (igual que Google/Apple Maps sobre mapas oscuros), pero
el contenido interno del popup (`StationPopupContent`) usa las mismas variables CSS del tema, así que
el texto siempre es legible; `react-leaflet@4.2.1` maneja correctamente el ciclo de montaje de
StrictMode (mejora conocida sobre v3), y no se encontró ningún patrón de manejo manual de refs en
`MapaRegionalPage.tsx` que pudiera causar un remount indebido — no confirmable al 100% sin probarlo
en un navegador real, pendiente de verificación visual.

### 41.3 Logo SIGER4 — optimizado

`public/logos/logo-escuela.png`: **1.3 MB → 61 KB** (1254×1254px → 400×400px). El archivo original no
tenía canal alfa (fondo blanco sólido, confirmado con `sharp` antes de procesar) — no había
transparencia que preservar en este caso. 400×400px es más que suficiente para el uso real más
grande del archivo (18mm en reportes PDF ≈ 212px a 300dpi de impresión); en pantalla nunca se muestra
a más de 56px.

De paso, también se optimizó `public/logos/logo-informatica.png` (confirmado con el usuario antes de
tocarlo, no estaba en el pedido original pero mismo problema): **338 KB → 47 KB** (1254×1254px →
400×400px). Este sí tenía canal alfa real — se preservó la transparencia en el archivo optimizado
(verificado antes y después con `sharp`, y confirmado visualmente).

**Herramienta usada**: `sharp`, instalado temporalmente con `npm install --no-save sharp` (nunca
quedó en `package.json`/`package-lock.json`) solo para generar los dos archivos, y desinstalado
apenas terminó (`npm uninstall sharp`) — no hay ninguna herramienta de procesamiento de imágenes
como dependencia permanente del proyecto ni en el sistema (no había ImageMagick/`cwebp` disponibles).

**Ninguna referencia en el código necesitó cambiar** — ambos archivos mantuvieron el mismo nombre. El
favicon y el manifest de PWA usan un set de archivos completamente aparte (`public/icons/manifest-icon-*.png`),
no se tocaron. `public/logos/README.md` actualizado con los tamaños/pesos finales y una nota para la
próxima vez que se reemplace un logo (redimensionar a ~400×400px antes de subirlo).

### 41.4 Seguridad del repositorio público

**Configuración local del editor**: estaba trackeado un archivo de configuración local de
herramientas de desarrollo, con permisos de comandos y algunos fragmentos de rutas de la máquina
local — nada que sea una credencial, pero sin valor para el repo público. Se sacó del tracking con
`git rm --cached` (el archivo sigue en el disco local) y se excluyó para que no vuelva a subirse
(desde la sección 57.6, en `.git/info/exclude` de cada clon).

**`.env`**: nunca estuvo trackeado — ya lo cubría el `.gitignore` desde antes. `.env.example` (sí
trackeado, correcto) revisado: solo tiene placeholders (`tu-proyecto.supabase.co`, `tu-anon-key-publica`,
`tu-clave-publica-vapid`), ningún valor real.

**`supabase/` — se decidió CONSERVARLO en el repo**, analizado punto por punto:
- `supabase/migrations/*.sql`: solo esquema, RLS, funciones y datos de referencia (regiones/subsedes
  base) — nunca secretos. Necesario para que cualquiera pueda reconstruir la base desde cero
  (documentado en DEPLOYMENT.md desde el inicio del proyecto).
- `supabase/functions/*/index.ts`: revisado archivo por archivo — **todos** los secretos
  (`SUPABASE_SERVICE_ROLE_KEY`, `CRON_SHARED_SECRET`, `GEMINI_API_KEY`, claves VAPID) se leen
  exclusivamente vía `Deno.env.get(...)`, nunca hardcodeados en el código fuente. Es exactamente la
  práctica correcta — el código de una Edge Function siendo público no expone ningún secreto, porque
  los secretos viven solo como variables de entorno configuradas en Supabase (`supabase secrets set`),
  nunca en el repo. Eliminar `supabase/functions/` del repo no aportaría seguridad real (no hay nada
  sensible ahí) y sí complicaría el deploy/mantenimiento futuro de las funciones, así que no se hizo.
- **Dos scripts SQL tenían datos personales reales hardcodeados** (no credenciales, pero sí
  identificables): `supabase/create_admin_user_example.sql` tenía un UUID real de `auth.users`,
  nombre completo y email real del administrador del sistema, en vez de placeholders — a pesar de
  llamarse "example". `supabase/reset_functional_db.sql` tenía el mismo email real hardcodeado en 6
  lugares (SQL + comentarios explicativos). Ambos corregidos: reemplazados por los mismos placeholders
  que ya usaba correctamente `supabase/cleanup_test_data.sql` (`admin@tudominio.com`,
  `UUID-DEL-USUARIO-AUTH`, `Nombre Apellido`). Un UUID de `auth_user_id` y un email no son, por sí
  solos, una credencial explotable (no permiten iniciar sesión ni actuar en nombre de ese usuario sin
  la contraseña/sesión real) — pero no correspondía tenerlos hardcodeados en un repo público bajo la
  etiqueta "ejemplo".
- Sin otros archivos de backup/dump/log/captura trackeados — el `.gitignore` ya los cubre
  (`*.pdf`/`*.bak`/`*.dump`/`*.sql.gz`/`/screenshots/`/`/exports/`/`*.log`) y una búsqueda completa
  de `git ls-files` no encontró ninguno colado.

**Búsqueda de secretos reales en TODO el historial de git** (no solo el estado actual): se buscaron
patrones de JWT (`eyJ...`), asignaciones de `SUPABASE_SERVICE_ROLE_KEY`/`CRON_SHARED_SECRET`/
`VAPID_PRIVATE_KEY` con valores reales, y nombres de archivo típicos de secretos (`.pem`, `.key`,
`credentials`) en `git log --all -p` completo — **sin ningún resultado**. No se encontró ninguna clave
real commiteada en ningún momento de la historia del repo.

**No hace falta rotar ninguna clave** — la única exposición real encontrada (email/UUID de
`create_admin_user_example.sql`/`reset_functional_db.sql`) no es una credencial de acceso, así que no
hay nada que "revocar" en el sentido de una API key comprometida. **Importante**: como esos dos
archivos ya se pushearon a `main` en rondas anteriores de este mismo repo, el email/UUID reales siguen
visibles en el **historial** de git de GitHub (commits viejos) aunque el archivo actual ya esté
saneado — corregir el archivo en un commit nuevo no reescribe el pasado. Si esto importa (dato
personal identificable de quien administra el sistema, visible en un repo público), la única forma de
sacarlo del historial es reescribirlo con `git filter-repo` (recomendado sobre BFG, más mantenido) y
forzar el push — **no se hizo en esta ronda** porque es una operación destructiva e irreversible sobre
el historial compartido que requiere coordinación explícita (invalida cualquier fork/clone existente,
requiere que todos los colaboradores vuelvan a clonar). Queda como decisión pendiente del usuario,
documentada acá para que la tome con conocimiento de causa.

### 41.5 Migraciones nuevas de esta ronda

- `0083_drop_import_batches.sql` — elimina `import_batches`/`import_batch_rows` y sus 3 tipos enum.

### 41.6 Qué correr en Supabase

1. Migración `0083` (revierte 0082 — el importador ya no se usa).
2. Nada relacionado a los puntos 41.2/41.3/41.4 — son cambios de frontend/config/repo, sin tocar la
   base de datos.

### 41.7 Redeploy

Frontend (Vercel): sí, normal — hay un cambio en `vercel.json` (CSP) que necesita un deploy nuevo
para tomar efecto, además de la eliminación de `exceljs` (bundle más liviano) y los assets de logo
reemplazados. Edge Functions: ninguna tocada, sin redeploy necesario.

## 42. Mapa Regional seguía gris: connect-src del CSP, no solo img-src (2026-08-20)

El fix de la sección 41.2 (agregar OpenStreetMap a `img-src`) no alcanzó — el mapa seguía sin cargar
las teselas, con este error real de consola:

```
Connecting to 'https://a.tile.openstreetmap.org/...' violates the following Content Security Policy
directive: connect-src 'self' https://*.supabase.co wss://*.supabase.co
fetch @ sw.js
Fetch API cannot load ... Refused to connect because it violates the document's Content Security Policy
Uncaught (in promise) no-response
```

### 42.1 Causa exacta confirmada

`src/sw.ts` (Service Worker, generado por injectManifest/Workbox) tenía una regla de runtime caching
que capturaba "cualquier imagen que no sea de Supabase" (`request.destination === 'image' &&
!url.hostname.endsWith('supabase.co')`) con estrategia `CacheFirst` — eso incluía, sin querer, las
teselas de OpenStreetMap. Cuando Workbox aplica esa estrategia, es el **propio Service Worker** quien
ejecuta `fetch()` de la URL de la tesela, en su propio contexto de ejecución — y ese `fetch()` se
valida contra **`connect-src`**, no `img-src`. `img-src` solo aplica cuando el *navegador* carga un
`<img>` directamente, sin pasar por el Service Worker. Como `connect-src` no incluía el dominio de
OSM, ese `fetch()` interno de Workbox fallaba por CSP antes de llegar a la red — Workbox interpreta
un fetch que nunca completó como `no-response`, y de ahí el error en consola y el mapa gris/blanco.

### 42.2 `connect-src` en `vercel.json`

Se agregó `https://*.tile.openstreetmap.org` también a `connect-src` (además de `img-src`, que ya lo
tenía desde la sección 41.2). Ambas directivas ahora incluyen el mismo dominio.

**Sobre el wildcard**: `https://*.tile.openstreetmap.org` es válido y matchea correctamente
`a.tile.openstreetmap.org`, `b.tile.openstreetmap.org` y `c.tile.openstreetmap.org` (el `*` en CSP
matchea un único nivel de subdominio, no es recursivo — no hacía falta declarar los tres dominios
explícitos por separado). El wildcard nunca fue la causa del bug: ya funcionaba correctamente en
`img-src` desde la sección 41.2 (por eso el pin/popup ya cargaban bien, solo fallaban las teselas en
sí, que son las que pasan por el Service Worker). Se mantuvo el wildcard por ser más simple de
mantener sin perder precisión.

### 42.3 Service Worker / Workbox — regla dedicada para tiles

Aunque arreglar `connect-src` ya soluciona el bloqueo (el `fetch()` de Workbox deja de fallar), se
agregó además una ruta de Workbox **dedicada** para `*.tile.openstreetmap.org` en `src/sw.ts`,
insertada ANTES de la regla genérica de "imagen no-Supabase" (Workbox evalúa las rutas registradas en
orden y usa la primera que matchea):

```ts
registerRoute(
  ({ url }) => url.hostname.endsWith('.tile.openstreetmap.org'),
  new CacheFirst({
    cacheName: 'siger4-osm-tile-cache',
    plugins: [new ExpirationPlugin({ maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 14, purgeOnQuotaError: true })],
  }),
)
```

Por qué una ruta separada en vez de dejar que las tiles cayeran en la regla genérica existente (que
ya las hubiera cacheado igual, una vez arreglado el CSP): la regla genérica tiene
`maxEntries: 60`/30 días, pensada para un puñado de logos institucionales propios — insuficiente y
mal calibrada para el volumen real de teselas que se piden al navegar/hacer zoom sobre un mapa
(fácilmente cientos en una sesión de uso normal). La ruta nueva usa `maxEntries: 400` y expira a los
14 días (el mapa base cambia poco, pero tampoco conviene cachearlo indefinidamente), y
`purgeOnQuotaError: true` para que, si el cache de tiles se queda sin cuota de storage del navegador,
Workbox lo purgue automáticamente en vez de romper — **no precachea nada por adelantado** (sigue
siendo `CacheFirst` bajo demanda, cada tesela se cachea recién la primera vez que se pide), no ensucia
el cache de imágenes propias, y no interfiere con las rutas de Supabase (que siguen intactas: el
`hostname.endsWith('supabase.co')` de la regla de Supabase nunca matchea `tile.openstreetmap.org`, y
viceversa).

### 42.4 Resultado esperado tras el deploy

Con `connect-src` corregido, el mapa debería cargar el fondo/calles de OpenStreetMap correctamente
(no confirmable al 100% desde este entorno sin navegador real — pendiente de verificación visual del
usuario). El resto del checklist ya estaba correcto desde la sección 40.2/41.2 y no se tocó en esta
ronda: pines visibles, popup con contacto funcionando, filtro por subsede, lista de "cuarteles sin
ubicación cargada" para los que no tienen coordenadas, z-index acotado (sidebar/drawer no se ven
afectados), dark mode (el popup de Leaflet mantiene su fondo blanco por diseño de la librería —igual
que Google/Apple Maps sobre mapas oscuros— pero el contenido interno del popup usa las variables CSS
del tema, así que el texto es legible en ambos modos).

### 42.5 Actualización de PWA — pasos manuales si aplica

Como este fix toca `sw.ts` (el Service Worker en sí, no solo assets), el navegador/PWA del usuario
puede seguir sirviendo la versión vieja del Service Worker hasta que se actualice explícitamente —
mismo mecanismo ya documentado en el proyecto (`SwUpdateBanner.tsx`, sección 24 y siguientes: el SW
nuevo queda "esperando" hasta que el usuario confirma la actualización, nunca se auto-activa a mitad
de una sesión). Después de este deploy, si el mapa sigue sin cargar tiles:

1. Esperar a que Vercel termine el redeploy.
2. Si aparece el banner de actualización de la app (ícono de descarga en el header, o notificación de
   "Nueva versión disponible"), aceptarlo — eso fuerza al Service Worker nuevo a tomar control.
3. Si no aparece solo, recargar la página (F5 / pull-to-refresh) una o dos veces.
4. Si sigue sirviendo la versión vieja (mapa gris pese a los pasos anteriores): en el navegador,
   herramientas de desarrollador → Application → Service Workers → "Unregister", y recargar; o en un
   celular con la PWA instalada, cerrar la app completamente (no solo minimizar) y volver a abrirla —
   en último caso, desinstalar y reinstalar la PWA.

### 42.6 Sin cambios en lo que no correspondía tocar

No se reactivó el Importador de Excel (sigue eliminado, sección 41.1). No se tocó la carga mobile de
documentos, IA, ni RLS. No se agregaron los "puntos de inflexión" del mapa (siguen solo diseñados,
sección 40.2). Ninguna migración nueva — 100% frontend (`vercel.json` + `src/sw.ts`).

### 42.7 Qué correr en Supabase / Edge Functions

Nada — sin migraciones ni cambios de backend en esta ronda.

## 43. Puntos de inflexión / referencia territorial v1 (2026-08-20) — migración 0084

Primera versión simple de "puntos de inflexión" (rutas importantes, parques industriales, ríos,
zonas de riesgo, puntos estratégicos, referencias operativas) sobre el Mapa Regional, ya documentada
como fase futura en la sección 40.2. **Solo puntos individuales georreferenciados** — sin líneas,
polígonos, capas complejas, importación masiva ni mapas offline (ver 43.5 para el detalle de qué
queda para después).

### 43.1 Migración `0084_map_reference_points.sql`

Tabla `map_reference_points`:

```
id                     uuid primary key
name                   text not null
type                   map_reference_point_type not null  -- enum: ruta/parque_industrial/rio/zona_riesgo/punto_estrategico/otro
description            text
latitude               numeric(9,6) not null  -- obligatoria: a diferencia de stations.latitude
longitude              numeric(9,6) not null  -- (nullable), un punto de referencia sin ubicación no tiene sentido
region_id              uuid references regions      -- alcance opcional, los 3 nullable
subsede_id             uuid references subsedes
station_id             uuid references stations
is_active              boolean not null default true  -- soft-delete
created_by_profile_id  uuid references profiles
created_at / updated_at
```

Constraints de rango de coordenadas (`-90/90`, `-180/180`) como garantía real de base, mismo criterio
que `stations.latitude`/`longitude` (sección 40.2). Índices en los 3 campos de alcance. Trigger
`trg_map_reference_points_updated_at` (reutiliza `set_updated_at()`, ya existente desde 0001).

**Alcance opcional, mismo criterio que `notifications`** (0015, "alcance opcional coincidente"): si
`region_id`/`subsede_id`/`station_id` son los tres `null`, el punto es una referencia general de toda
la Regional 4, visible para cualquier autenticado. Si alguno está seteado, solo lo ven los usuarios
cuyo alcance real coincide.

### 43.2 RLS

- **Lectura** (`map_reference_points_select_scope`): `informatica_r4` ve todo; un punto sin alcance
  definido es visible para cualquier autenticado (incluido `invitado` — no tiene un helper que lo
  excluya acá, a diferencia de Auditoría, por ser un dato mucho menos sensible); un punto con alcance
  definido solo es visible para quien tenga ese mismo alcance real (`my_region_ids()`/
  `my_subsede_ids()`/`my_station_ids()`, mismos helpers que ya usa el resto del sistema) — nunca se
  muestra fuera del alcance real del usuario, tal como pedía el punto 2 del pedido.
- **Escritura** (`insert`/`update`): `informatica_r4` sin restricción. `secretario_regional` (única
  membresía real de `is_regional_role()` desde la migración 0048) solo puede crear/editar puntos
  **dentro de su propia región** — `region_id` obligatorio y coincidente con `my_region_ids()`; no
  puede dejar un punto sin alcance (eso lo haría visible a toda la app, escalando su propio alcance) ni
  tocar uno de otra región. El `update` tiene `with check` además de `using` — sin eso, un
  `secretario_regional` podría editar un punto ya dentro de su región y, en el mismo `UPDATE`,
  cambiarle `region_id` a `null` o a una región ajena (`using` solo valida la fila *antes* del cambio).
  Roles de cuartel: **sin escritura** — el pedido pedía explícitamente "lectura según alcance" para
  ellos, sin mencionar gestión.
- **Borrado físico** (`delete`): solo `informatica_r4`, mismo criterio que el resto del sistema
  (ej. borrado de usuarios) — el resto de los roles con permiso de escritura usa `is_active=false`
  (soft-delete) para sacar un punto de circulación sin perder el historial de quién lo cargó.

### 43.3 Cómo se cargan puntos

Desde `/mapa`, un botón "+ Punto de referencia" (visible solo para `informatica_r4`/
`integrante_informatica`/`secretario_regional`) abre un formulario inline en la misma pantalla — sin
pantalla/ruta nueva, coherente con "v1 simple". Campos: nombre, tipo (`<select>` con las 6 categorías),
descripción (opcional), latitud/longitud (validadas en rango -90/90 y -180/180, mismo criterio que el
formulario de coordenadas de cuartel), y alcance (`<select>`: "Toda la Regional" / región / subsede /
cuartel, con los `<select>` de región/subsede/cuartel dependientes en cascada, mismo patrón que
`CuartelFormPage.tsx`). Para `secretario_regional`, el `<select>` de alcance queda fijo en "región" y
el de región queda deshabilitado y prellenado con su propia región (`profile.region_id`) — no puede
tocarlo desde la UI, y aunque lo forzara, `handleSubmitForm` valida `regionId === profile.region_id`
antes de enviar, con la RLS como última línea de defensa real (triple capa: UI deshabilitada,
validación de frontend, RLS server-side).

Editar reutiliza el mismo formulario (botón "Editar" en el popup del punto). "Desactivar"/"Reactivar"
alterna `is_active` sin abrir el formulario. "Eliminar" (solo visible para quien tiene permiso de
escritura, pero rechazado por RLS si no es `informatica_r4`) pide confirmación (`window.confirm`) antes
del borrado físico — mismo patrón de confirmación ya usado en el resto del sistema para acciones
irreversibles.

### 43.4 Cómo se ven en el mapa

Marcador con forma **distinta** a los cuarteles (rombo en vez de gota) y **color por tipo** (`ruta`
ámbar, `parque_industrial` violeta, `rio` celeste, `zona_riesgo` rojo, `punto_estrategico` verde,
`otro` gris) — en vez de agregar 6 íconos SVG nuevos al set de la app (`Icon.tsx`) para una sola
pantalla, se diferencia con color/forma sobre el mismo mecanismo de `L.divIcon` ya usado para los
cuarteles. El popup muestra nombre, tipo, alcance (resuelto a nombre real — "Regional 4"/"Subsede
Luque"/"Cuartel Central N°1"/"Toda la Regional" según corresponda, nunca un UUID crudo) y descripción
si existe, más las acciones de gestión si el usuario tiene permiso.

**Filtro/capa "Referencias territoriales"**: checkbox arriba del mapa que muestra/oculta la capa
completa de puntos sin afectar a los cuarteles. El filtro por subsede ya existente (sección 40.2)
ahora también acota los puntos con alcance de subsede (los puntos sin alcance de subsede definido —
region-wide o sin alcance— siguen visibles bajo cualquier filtro, ya que no aplica un alcance más
angosto que no tienen). Checkbox adicional "Ver inactivos" (solo para quien puede gestionar puntos)
para poder revisar/reactivar puntos desactivados.

### 43.5 Fase futura — documentado, NO implementado en esta ronda

- Líneas de rutas y polígonos (zonas de cobertura, límites operativos como área, no solo un punto).
  Necesitaría extender el esquema con una tabla de vértices ordenados o adoptar PostGIS.
- Importación desde GeoJSON/KML — necesitaría un parser dedicado, no cubierto por ninguna dependencia
  actual del proyecto.
- Importación masiva de puntos (batch) — mismo criterio que se aplicó al Importador de Excel: no se
  reactiva ese módulo (permanece eliminado, sección 41.1) ni se construye un mecanismo equivalente
  específico para puntos de referencia.
- Zonas de cobertura por cuartel (radio de respuesta, polígonos de jurisdicción).
- Mapas offline / tiles precacheados para uso sin conexión — el cache de tiles agregado en la sección
  42.3 es solo una optimización de rendimiento de navegación normal (14 días, 400 entradas), no un
  mecanismo de "descargar el mapa para usar sin señal".

### 43.6 Qué correr en Supabase

1. Migración `0084`.

Ninguna Edge Function nueva ni tocada. Redeploy normal del frontend (Vercel).

## 44. QA por código del Mapa Regional post-puntos de referencia (2026-08-20)

Pasada de QA solo por código (sin acceso a producción/roles reales desde la
IDE) sobre `MapaRegionalPage.tsx` y lo agregado en la sección 43. Sin
migraciones nuevas -- los 4 bugs encontrados eran todos de frontend, la RLS
de 0084 ya estaba bien diseñada.

### 44.1 Bugs encontrados y corregidos

1. **Edición/creación bloqueada de más para `secretario_regional`.** El
   `<select>` de alcance (`scopeKind`) tenía `disabled={!isAdmin}`, así que
   un secretario regional nunca podía elegir "Una subsede" o "Un cuartel" --
   quedaba forzado a "Una región" siempre, aunque la RLS
   (`map_reference_points_insert_scoped`/`update_scoped`, 0084) solo exige
   que `region_id` coincida con su región, sin prohibir además acotar a
   subsede/cuartel. Se habilitó el `<select>` y se ajustó `handleSubmitForm`
   para que `region_id` se mande siempre que haya algún alcance elegido (no
   solo cuando `scopeKind === 'region'`), fijado a la región propia del
   usuario si no es admin.
2. **Botón "Eliminar" visible para roles que la RLS rechaza.** El popup de
   un punto de referencia mostraba "Eliminar" (borrado físico) a cualquiera
   con `canManagePoints` (incluye `secretario_regional`), pero
   `map_reference_points_delete_admin` solo permite el DELETE a
   informatica_r4/integrante_informatica. Un DELETE bloqueado por RLS no
   lanza error, afecta 0 filas en silencio -- el punto reaparecía tras
   recargar sin ninguna explicación. Se agregó un prop `canDelete={isAdmin}`
   a `ReferencePopupContent` y el botón ahora solo se muestra si
   corresponde.
3. **Filtro de subsede no resolvía cuarteles.** `filteredPoints` filtraba
   por `p.subsede_id === subsedeFilter`, pero un punto con alcance de
   cuartel (`station_id`) nunca tiene `subsede_id` propio seteado (son
   campos mutuamente excluyentes) -- pasaba el filtro sin importar a qué
   subsede pertenecía el cuartel. Ahora resuelve la subsede real del
   cuartel vía el array `stations` ya cargado en la página.
4. **Sin `overflow-wrap` en popups de Leaflet.** Nombre/descripción de
   puntos de referencia (y `map_notes` de cuarteles) no tienen límite de
   longitud en el form -- una palabra larga sin espacios podía desbordar el
   popup. Se agregó `overflow-wrap: anywhere` a `.leaflet-popup-content` en
   `styles.css`.

También se corrigió un comentario inexacto en `mapReferencePoints.ts` que
afirmaba que un DELETE bloqueado por RLS "lanza" error (es al revés: no
lanza, afecta 0 filas silenciosamente -- por eso el fix del punto 2 de
arriba era necesario).

### 44.2 Revisado sin encontrar problema

- CSP (`vercel.json`) y Workbox/Service Worker (`src/sw.ts`): la ruta
  dedicada para tiles de OpenStreetMap sigue registrada antes que la
  genérica, y el dominio de tiles sigue en `img-src` y `connect-src` -- sin
  cambios necesarios (fix de una ronda anterior, sección 40).
- Cobertura de roles: `canManagePoints = isAdmin || hasRole('secretario_regional')`
  y `isAdmin` (de `ADMIN_ROLES`) ya cubren `informatica_r4` +
  `integrante_informatica` + `secretario_regional` correctamente.
- RLS de `map_reference_points` (0084): políticas de select/insert/update/
  delete revisadas contra el pedido original -- correctas, incluye el
  `with check` en `update` (agregado en la ronda de la migración) que evita
  que un secretario regional reasigne `region_id` a null/otra región en el
  mismo UPDATE.
- Cuarteles sin coordenadas: `withoutCoordinates` ya los separa y lista
  aparte del mapa (no se intenta plotear lat/lng null).

### 44.3 No se pudo verificar sin producción

- Carga real de tiles en el navegador (gris/OK), dark mode real, y
  comportamiento visual en mobile -- todo esto requiere abrir la app
  desplegada.
- Comportamiento real de cada rol logueado (`secretario_regional`, roles de
  cuartel, invitado) -- la revisión fue por código/RLS, no con sesiones
  reales.
- Que el fix de "Eliminar" oculto no rompa ningún flujo E2E ya en uso.

### 44.4 Checklist manual para Axel (producción)

1. Abrir `/mapa` y confirmar que las tiles cargan (no queda gris).
2. Crear un punto de referencia nuevo (cualquier tipo) y confirmar que
   aparece en el mapa.
3. Editar ese punto (cambiar nombre/descripción/alcance) y confirmar que
   se guarda.
4. Desactivar el punto y confirmar que desaparece del mapa por defecto,
   pero reaparece con el filtro "ver inactivos" activado.
5. Probar el filtro "Referencias territoriales" (mostrar/ocultar la capa).
6. Probar el filtro por subsede con un punto de alcance "cuartel" cargado
   en un cuartel de esa subsede -- confirmar que aparece/desaparece según
   corresponda.
7. Con un usuario `secretario_regional`: crear/editar un punto eligiendo
   alcance "Una subsede" o "Un cuartel" (antes solo se podía "Una región")
   y confirmar que no puede ver el botón "Eliminar" en el popup (solo
   "Editar"/"Desactivar").
8. Con un usuario de rol de cuartel (solo lectura): confirmar que no ve
   ningún botón de gestión en los popups.
9. Probar en mobile: que el mapa tenga alto usable, que el popup con texto
   largo no desborde horizontalmente, y que el formulario de alta/edición
   sea usable en pantalla chica.

### 44.5 Qué correr en Supabase

Nada -- sin migraciones nuevas en esta ronda. Redeploy normal del frontend
(Vercel).

## 45. Estabilización Mapa Regional + limpieza general (2026-08-24)

Pasada de estabilización enfocada en dos bugs reales de código: superposición
mapa/drawer en mobile, y una revisión de seguridad/limpieza general del
estado del repo. Sin migraciones nuevas, sin cambios de RLS.

### 45.1 Carga del mapa (CSP / Workbox / tiles)

Revisado por código, sin cambios: CSP en `vercel.json` sigue permitiendo
`https://*.tile.openstreetmap.org` en `img-src` y `connect-src` (fix de la
sección 42), y `src/sw.ts` sigue con la ruta dedicada de Workbox para tiles
registrada antes de la regla genérica de imágenes. El import de
`leaflet/dist/leaflet.css` en `MapaRegionalPage.tsx` está presente y es el
origen real del bug de la sección 45.2 (ver abajo) -- no un problema en sí.
Sin nada que corregir acá.

### 45.2 Bug real: el mapa quedaba por encima del drawer mobile

**Causa exacta.** `styles.css` ya topeaba `.leaflet-pane, .leaflet-top,
.leaflet-bottom` a `z-index: 10` con un comentario explicando la intención,
pero `leaflet.css` (node_modules) define el z-index real en selectores MÁS
ESPECÍFICOS por nombre propio: `.leaflet-tile-pane` (200),
`.leaflet-marker-pane` (600), `.leaflet-tooltip-pane` (650),
`.leaflet-popup-pane` (700), `.leaflet-control` (800/1000). Estos selectores
tienen la MISMA especificidad CSS que `.leaflet-pane` (una sola clase cada
uno) -- en un empate de especificidad gana el que aparece último en el
stylesheet, y como `leaflet.css` se importa en `MapaRegionalPage.tsx`
(chunk separado, cargado después de `styles.css` global), sus reglas
ganaban. En la práctica: markers, tooltips, popups y los controles de zoom
del mapa seguían con z-index 600-1000 pese a la regla "genérica" existente,
muy por encima del backdrop (40) y el sidebar (50) del drawer mobile.

**Fix.** `styles.css` (bloque "Mapa Regional (Leaflet)") ahora topea CADA
selector propio de `leaflet.css` explícitamente (`.leaflet-tile-pane`,
`.leaflet-overlay-pane`, `.leaflet-shadow-pane`, `.leaflet-marker-pane`,
`.leaflet-tooltip-pane`, `.leaflet-popup-pane`, `.leaflet-map-pane canvas`,
`.leaflet-map-pane svg`, `.leaflet-control`, `.leaflet-zoom-box`), no solo
el genérico `.leaflet-pane`. Todos quedan en z-index 10 (popups en 15),
por debajo del header (20).

**Escala de z-index del sistema** (ya existía, documentada más explícita
ahora): contenido normal (mapa Leaflet: 10-15) < header (20) < drawer
backdrop mobile (40) < sidebar/drawer (50) < modales (60) < toasts (70).

**Mapa no clickeable con el drawer abierto.** El backdrop
(`.sidebar-drawer-backdrop.open`) ya cubría visualmente todo `.app-content`
(`position: fixed; inset: 0`) e interceptaba clicks simples para cerrar el
drawer, pero un `<MapContainer>` de Leaflet sigue montado detrás y puede
seguir respondiendo a gestos táctiles (pan/zoom) en algunos navegadores
mobile aunque esté visualmente tapado. Se agregó una clase `drawer-open` en
`<body>`, togglada por un `useEffect` en `AppShell.tsx` según el estado del
drawer, que en mobile (`max-width: 899px`) desactiva `pointer-events` en
`.leaflet-container` mientras el drawer está abierto.

**Verificado que no rompe:** desktop (el sidebar ahí no es `position:
fixed`, no compite con nada) y los popups/controles del mapa cuando el
drawer está cerrado (siguen clickeables, z-index 10/15 alcanza dentro del
`.card` contenedor acotado del mapa).

### 45.3 Puntos de referencia territorial

Revisados los 5 fixes de la sección 44 (alcance de secretario_regional,
botón Eliminar oculto para roles sin permiso RLS, filtro de subsede
resolviendo cuarteles, overflow-wrap en popups) -- todos siguen vigentes,
sin regresiones. RLS de `map_reference_points` (0084) sin cambios, sigue
correcta: `informatica_r4` gestiona todo, `secretario_regional` solo dentro
de su región (con o sin acotar a subsede/cuartel), roles de cuartel e
invitado sin escritura (solo lectura vía RLS de select).

### 45.4 Cuarteles en el mapa

Revisado sin encontrar bugs: `withCoordinates`/`withoutCoordinates` separan
correctamente cuarteles con y sin lat/lng (ninguna coordenada se inventa),
el popup de cuartel muestra código, nombre, subsede, dirección, contacto
condicional y link a detalle, el filtro por subsede funciona, y el
formulario de edición de cuartel (`CuartelFormPage.tsx`) sigue validando
"ambas coordenadas o ninguna" con rango min/max en los inputs.

### 45.5 Limpieza del importador Excel/CSV

Confirmado sin residuos: sin ruta `/importar`, sin componentes/páginas
importer-named, sin `exceljs`/`xlsx`/`sheetjs` en `package.json` ni
lockfile, migración `0083` documentada como el drop correcto de las tablas
de `0082`, y DEPLOYMENT.md (sección 41) documenta la eliminación completa.
Nada que corregir.

### 45.6 Seguridad del repo público

Revisado el estado de archivos versionados: la configuración local del editor excluida del repo, `.env.example` solo tiene
placeholders, ningún `.env` real trackeado, `service_role`/
`VAPID_PRIVATE_KEY` en las Edge Functions se leen siempre de
`Deno.env.get(...)` (nunca hardcodeados), sin emails/UUIDs reales en los
scripts SQL versionados (`create_admin_user_example.sql` y
`cleanup_test_data.sql` usan placeholders explícitos), y sin backups/dumps/
logs/capturas versionados. No se detectó ninguna credencial real en el
historial -- no se tocó el historial de git (reescribirlo sería una
decisión manual/destructiva, no aplica acá porque no hubo nada que
justificara evaluarla).

### 45.7 Logo optimizado

Revisado sin cambios: `logo-escuela.png`/`logo-informatica.png` (400×400px,
47-61 KB) siguen siendo los únicos logos institucionales, referenciados
consistentemente en Login/Sidebar/Header/Ajustes/Escuela/CambiarPassword/
reportBuilder (PDF), sin assets viejos sin uso en `public/logos/` ni
`public/icons/`.

### 45.8 Diagnóstico semanal

No tocado -- `SystemSettingsSection.tsx`/`systemSettings.ts` no dependen de
nada modificado en esta ronda (mapa, sidebar, z-index). Sin necesidad de
tocar cron ni Edge Functions.

### 45.9 Qué correr en Supabase

Nada -- sin migraciones nuevas en esta ronda. Redeploy normal del frontend
(Vercel).

## 46. Fix definitivo: mapa seguía superponiéndose al drawer mobile en producción (2026-08-24)

El fix de la sección 45.2 (topear z-index de panes Leaflet) no alcanzó en
producción real: seguía viéndose el mapa por encima/mezclado con el drawer
en celular. Investigación de causa real y fix estructural.

### 46.1 Por qué el fix anterior no alcanzó

El fix de 45.2 solo atacaba el z-index NUMÉRICO de los panes de Leaflet.
Pero `.app-sidebar` y `.sidebar-drawer-backdrop` seguían siendo
DESCENDIENTES de `.app-shell`, el mismo ancestro común que envuelve al
mapa. Un z-index solo gana dentro de su propio stacking context -- si
CUALQUIER elemento en el árbol compartido (el mapa incluido) genera un
stacking context nuevo (Leaflet aplica `transform: translate3d(...)`
inline a `.leaflet-map-pane` en cada pan/zoom, y `transform` genera
stacking context por spec), el navegador puede terminar resolviendo el
z-index del drawer DENTRO de ese contexto en vez de contra la página
entera. Es sensible al motor de render exacto (por eso "funciona en
desktop, se rompe en mobile real" y no es 100% reproducible) -- no era
solo "orden de CSS insuficiente", era la arquitectura del DOM la que dejaba
la comparación de z-index a merced de un ancestro compartido.

### 46.2 Fix estructural: portal a `document.body`

`AppShell.tsx`: en mobile (`<900px`, mismo breakpoint que el CSS),
`Sidebar` y el backdrop ahora se montan con `createPortal(...,
document.body)` -- quedan como hijos DIRECTOS de `<body>`, sin ningún
ancestro en común con el mapa. Ningún stacking context que el contenido
genere puede encerrarlos: compiten directo en la raíz del documento. En
desktop (`>=900px`) NO se usa portal -- ahí el sidebar es una columna
normal dentro del `display:flex` de `.app-shell` (sacarlo por portal
rompería el layout, dejaría de reservar espacio como columna), y tampoco
hace falta: en desktop no es `position: fixed`, no compite con nada. El
breakpoint se detecta con `window.matchMedia` + listener de `change`, así
que un resize en vivo (rotar el celular, o cambiar de ventana en
desktop) no deja el drawer atascado en el modo equivocado. Mismo patrón de
portal ya usado en los modales del proyecto (`ReasonPromptModal.tsx`,
`Lightbox.tsx`, etc.) -- no una técnica nueva en el codebase.

### 46.3 Refuerzos (cinturón de seguridad, no la defensa principal)

- **z-index con `!important` en Leaflet.** Los selectores propios de
  `leaflet.css` (`.leaflet-marker-pane`, `.leaflet-popup-pane`,
  `.leaflet-control`, etc.) tienen la misma especificidad que las reglas
  del proyecto -- en un empate gana el que se aplica último en el
  stylesheet, y eso depende de en qué chunk/orden termine cargando cada
  CSS. `!important` saca a la regla del proyecto de esa pelea de raíz.
- **`visibility: hidden` en el mapa mientras el drawer está abierto**
  (`body.drawer-open .leaflet-container`), no solo `pointer-events: none`
  (que ya estaba y no alcanzaba solo): con `visibility:hidden` el mapa
  directamente no se pinta, sin depender de que `pointer-events`/z-index
  se resuelvan bien en todos los navegadores. No desmonta el mapa (no
  pierde posición/zoom), solo lo saca del render visual.
- **Escala de z-index global subida y explícita** (antes 20/40/50/60/70,
  ahora con más margen): contenido/mapa 0-10 < header 100 < backdrop
  drawer mobile 9000 < drawer/sidebar mobile 9010 < modales 10000 <
  `AppUpdateBanner` 10010 < `SwUpdateBanner` 10020. Los 4 modales con
  portal (`ReasonPromptModal`, `Lightbox`, `NotificationDetailModal`,
  `DeleteUserConfirmModal`) subieron de `zIndex: 100` a `10000` -- con la
  escala vieja habrían quedado POR DEBAJO del nuevo z-index del drawer
  (9010), rompiendo la regla "un modal siempre gana".

### 46.4 Por qué es "definitivo" y no otro parche de z-index

La garantía real no es el número de z-index (eso es el refuerzo) sino que
el drawer/backdrop ya NO comparten ancestro con el mapa en el DOM. Un
z-index alto sin el portal seguía siendo un parche -- funcionaba mientras
ningún ancestro del árbol de contenido generara un stacking context
inesperado, que es exactamente lo que Leaflet hace al mover el mapa. Con
portal, esa precondición ya no existe: no importa qué haga Leaflet
internamente, el drawer vive en otra rama del árbol.

### 46.5 Verificado que no rompe

- **Desktop:** sidebar sigue como columna fija de la grilla (sin portal),
  mapa sigue interactivo, sin overlay raro, popups/controles de Leaflet
  funcionan igual que antes.
- **Mobile, drawer cerrado:** mapa funciona normal (pan/zoom/popups).
- **Mobile, drawer abierto:** mapa completamente inactivo y no visible
  (pointer-events + visibility), sin importar si había un popup abierto o
  los controles de zoom visibles al momento de abrir el drawer.
- **Mobile, drawer cerrado de nuevo:** mapa vuelve a responder normal (no
  se desmontó, solo se ocultó).
- Build/lint/audit sin errores nuevos (un error de ESLint `no-undef` sobre
  `MediaQueryListEvent` en el listener de `matchMedia` se corrigió
  tipando el parámetro inline en vez de depender del tipo global de lib.dom).

### 46.6 Qué correr en Supabase

Nada -- sin migraciones, sin cambios de RLS, sin Edge Functions tocadas.
Redeploy normal del frontend (Vercel).

## 47. Push server-side para TODA notificación, no solo el recordatorio semanal (2026-08-24)

Bug real reportado: la notificación interna se crea siempre (la campanita la
muestra), pero si nadie tiene la PWA abierta en el momento exacto del
insert, el push real (Web Push, el que llega con la app cerrada) nunca
sale. Causa exacta, fix, y qué quedó de la arquitectura vieja.

### 47.1 Causa exacta

El único disparador de push real para CUALQUIER notificación que no fuera
el recordatorio/resumen semanal era `NotificationPushBridge`
(`src/components/NotificationPushBridge.tsx`): un listener de Realtime que
vive en el navegador, escucha `INSERT` en `notifications`, y llama a la
Edge Function `send-push`. Si no hay ninguna pestaña con sesión abierta
escuchando ese canal en el instante del insert, nadie llama a `send-push`,
y el push real jamás sale -- aunque la fila en `notifications` exista
perfectamente y la campanita la muestre la próxima vez que alguien abra la
app. Esto afectaba a TODO lo que no fuera el cron semanal: cursos nuevos,
documentos nuevos, cambios de estado (cuartel/vehículo/personal),
asistencia/intervención cargada, préstamos (solicitud/aprobación/
vencimiento), eventos de calendario (creación y recordatorio previo),
alertas administrativas (cambio de rol/scope, alta/baja de usuario), y
cualquier notificación manual/de prueba creada desde el frontend.

`send_weekly_reminder()`/`send_weekly_admin_summary()` (0036/0067/0073) ya
eran la excepción correcta: llamaban a `pg_net` → `send-push-system`
directamente desde SQL, sin depender del frontend -- por eso eran (y
siguen siendo) el único camino que sí funcionaba con la app cerrada antes
de esta ronda.

### 47.2 Qué cambió en la arquitectura

**Migración `0085_server_side_push_dispatch.sql`**: agrega
`dispatch_notification_push()`, un trigger `AFTER INSERT ON notifications`
(security definer) que dispara `net.http_post` → `send-push-system` para
**cada notificación nueva**, sin importar su origen (trigger de Postgres,
cron, o insert directo del frontend). Lee `project_url`/`cron_shared_secret`
de `system_settings` (0073); si faltan, no bloquea el insert (la
notificación interna queda guardada igual), solo no dispara el push --
mismo criterio "fire-and-forget, nunca romper el flujo" que ya usaban
`send_weekly_reminder`/`send_weekly_admin_summary`.

`send_weekly_reminder()`/`send_weekly_admin_summary()` se simplificaron:
ya no llaman a `pg_net` manualmente (el trigger nuevo las cubre
automáticamente, porque siguen insertando en `notifications` igual que
siempre) -- evita disparar el push dos veces por el mismo insert.

**`send-push-system`** (Edge Function) se generalizó: antes solo aceptaba
`profileId` puntual (pensada nada más para el recordatorio semanal, siempre
self-scope); ahora acepta el mismo alcance completo que `send-push`
(`profileId`, o `regionId`/`subsedeId`/`stationId`), porque cualquier
notificación del sistema puede tener cualquiera de esos alcances. Sigue
autenticándose por secreto (`x-cron-secret` == `CRON_SHARED_SECRET`), nunca
por JWT de usuario -- el trigger de Postgres no tiene una sesión real que
pasar.

**`NotificationPushBridge`** (frontend) ya NO llama a `send-push`: se
redujo a lo que le corresponde a un componente que solo existe mientras hay
una pestaña abierta -- sonido interno (un beep corto) cuando llega una
notificación propia por Realtime. El filtro de Realtime ahora es
`profile_id=eq.<perfil actual>` (antes escuchaba TODO insert en
`notifications` y decidía adentro si tenía permiso de alcance masivo para
llamar a `send-push` -- ya no hace falta esa lógica, así que se sacó por
completo `PUSH_SCOPE_ROLES`/`can_send_push_scope` del lado cliente).

**`send-push`** (la función autenticada por JWT de usuario) se conserva sin
cambios funcionales, pero ya no tiene ningún llamador activo en el
frontend -- queda como infraestructura para un eventual envío push manual
iniciado por un usuario real (ej. un futuro "enviar aviso ahora" a un
alcance elegido a mano), no como parte del camino automático.

### 47.3 Deduplicación

`push_send_log` YA tenía (migración 0025, sin cambios en esta ronda) un
índice único parcial sobre `notification_id where status='ok'` -- el
primer intento que logra insertar su fila `'ok'` es el que efectivamente
envía; cualquier otro intento posterior por la misma notificación (un
reintento de `pg_net`, o si en el futuro volviera a existir también un
camino client-side) recibe `duplicate: true` y no reenvía nada. No hizo
falta un constraint nuevo -- ya cubría exactamente este caso.

### 47.4 Diagnóstico (migración `0086_push_diagnostics_own_user.sql`)

Se agregaron dos funciones para que CUALQUIER usuario (no solo
`informatica_r4`, a diferencia de `get_weekly_push_diagnostics` de 0074)
pueda ver el estado de sus propias notificaciones/push:

- `get_own_push_diagnostics(p_limit)`: últimas notificaciones propias
  cruzadas contra `push_send_log` -- si el push se intentó, con qué
  resultado, a cuántos dispositivos.
- `get_own_push_subscription_count()`: cantidad de dispositivos/
  navegadores con suscripción push activa del perfil actual.

En Ajustes → Notificaciones push se agregó:
- Botón **"Probar push server-side"** (reemplaza al viejo "Probar
  notificación"): crea una notificación real y hace polling (3 reintentos,
  800/1200/2000ms) sobre `get_own_push_diagnostics()` hasta ver que el
  trigger server-side efectivamente intentó el envío -- prueba EXACTAMENTE
  el mismo camino que usaría cualquier notificación con la PWA cerrada, no
  un atajo client-side que podría funcionar aunque el trigger estuviera
  roto (el botón viejo llamaba a `send-push` directo desde el navegador,
  lo cual no probaba nada sobre el camino server-side).
- Panel **"Ver diagnóstico de push"**: suscripciones activas + últimas
  notificaciones propias con su resultado de envío (intentado/no
  intentado, enviado a cuántos dispositivos, o el error si falló).

### 47.5 Qué revisé sin encontrar problema / no pude verificar

- RLS de `notifications`/`push_subscriptions`/`push_send_log`: sin
  cambios, todo lo de lectura normal sigue igual.
- `can_send_push_scope()`/`push_send_rate_check()`: sin cambios, siguen
  siendo la autorización de `send-push` (el camino JWT-based, hoy sin
  llamador activo pero conservado).
- No pude verificar en producción real que el push efectivamente llega al
  dispositivo con la PWA cerrada -- eso requiere una prueba manual real
  (ver checklist abajo). El diagnóstico nuevo confirma que el SERVIDOR
  intentó/logró el envío, no que el sistema operativo/navegador del
  destinatario efectivamente lo mostró (eso depende de permisos del SO,
  Do Not Disturb, etc., fuera del control de la app).

### 47.6 Qué correr en Supabase

1. Migración `0085_server_side_push_dispatch.sql`.
2. Migración `0086_push_diagnostics_own_user.sql`.

### 47.7 Edge Functions a redesplegar

- `send-push-system` (cambio de código: ahora acepta alcance completo, no
  solo `profileId`): `supabase functions deploy send-push-system --no-verify-jwt` (ver sección 6.2
  para por qué este flag es obligatorio, no opcional).
- `send-push`: sin cambios de código funcional (solo el comentario de
  cabecera), redeploy opcional.

### 47.8 Secrets que deben estar configurados

Los mismos de siempre para que el push real funcione (sin cambios, ya
documentados en la sección "Notificaciones push" más arriba):
- `system_settings.project_url` y `system_settings.cron_shared_secret`
  (configurables desde Ajustes → Configuración del sistema, solo
  `informatica_r4`).
- Secretos de la Edge Function `send-push-system`: `CRON_SHARED_SECRET`
  (mismo valor que `system_settings.cron_shared_secret`),
  `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
- Sin estos, `dispatch_notification_push()` no bloquea nada (la
  notificación interna se crea igual) pero tampoco puede disparar el push
  real -- el panel de diagnóstico de Ajustes lo va a mostrar como "push no
  intentado".

### 47.9 Checklist manual para Axel

1. **App cerrada (el caso que estaba roto)**: cerrar completamente la PWA/
   pestaña en un celular, y desde otro dispositivo/usuario generar una
   notificación que te llegue a vos (ej. un cambio de estado de tu
   cuartel, o pedirle a informática que te mande una prueba). Confirmar
   que el push llega igual con la app cerrada.
2. Ajustes → Notificaciones push → **"Probar push server-side"**: confirmar
   que muestra "Push server-side enviado a N de M dispositivo(s)" (no
   "push no intentado").
3. Ajustes → **"Ver diagnóstico de push"**: confirmar que la cantidad de
   suscripciones activas coincide con tus dispositivos reales, y que las
   últimas notificaciones muestran resultado de envío.
4. Recordatorio semanal / resumen admin: confirmar que un lunes siguen
   llegando igual que antes (arquitectura sin cambios funcionales para
   estos dos, solo se sacó la llamada duplicada a `pg_net`).
5. Notificación de calendario, préstamo, curso nuevo, documento nuevo:
   generar una de cada una y confirmar que ahora también llega como push
   real (antes de esta ronda, dependían 100% de tener la app abierta).
6. PWA instalada vs. navegador mobile vs. desktop: repetir el punto 1 en
   cada contexto.
7. Si algo no llega: revisar el panel de diagnóstico de Ajustes primero
   (dice si el servidor intentó el envío o no) antes de asumir que es un
   problema de permisos del dispositivo.

### 47.10 Qué queda pendiente

- No hay forma de confirmar automáticamente que el push llegó a mostrarse
  en el sistema operativo del destinatario (solo que el servidor lo
  envió con éxito a la suscripción registrada) -- eso requiere la prueba
  manual del punto 1 del checklist.
- `send-push` (JWT-based) queda sin usar activamente; si en el futuro se
  quiere un "enviar aviso ahora" manual desde la UI, ya está la
  infraestructura lista.

## 48. Endurecimiento de destinatarios push + diagnóstico restringido (2026-08-24)

Auditoría de seguridad sobre el dispatcher server-side de la sección 47,
pedida tras sospechar que una notificación dirigida a un usuario específico
podía llegar a todos. Resultado de la auditoría, qué se corrigió, y qué NO
se pudo confirmar como bug real (para no reportar algo que el código no
respalda).

### 48.1 Qué se auditó y qué se encontró

Revisé el trigger `dispatch_notification_push()` (0085), el payload que
manda a `send-push-system`, y la resolución de destinatarios de esa Edge
Function. La versión de la sección 47 ya tenía un guard temprano que
rechazaba con `400` un payload sin `profileId`/`regionId`/`subsedeId`/
`stationId` -- por eso, **por código, no encontré evidencia de que una
notificación con `profile_id` real pudiera terminar mandando push a todos
los perfiles**: `if (body.profileId) targetProfileIds = [body.profileId]`
ya devolvía exactamente un destinatario, sin excepción.

Lo que sí encontré y confirmé como bug real: `notify_calendar_event_created()`/
`send_calendar_event_reminders()` (migración 0051) insertan notificaciones
para eventos de tipo `escuela`/`capacitacion` con `region_id`/`subsede_id`/
`station_id` los TRES en `null` a propósito (diseño original: "Escuela es
regional-wide", pero sin asignarle una región real como sí hace `courses`).
Con el guard existente, esas notificaciones hacían que `send-push-system`
devolviera `400 Falta el alcance destino` -- **el push real nunca salía
para esos eventos** (la notificación interna se creaba y se veía en la
campanita igual). Ese es probablemente el origen real de lo que se percibió
como "push que no llega bien a destino".

También confirmé un diseño frágil, aunque no explotado en el flujo actual:
`send-push-system` confiaba en el alcance que le pasaba el PAYLOAD del
llamador (el trigger SQL), no en la fila real de `notifications` -- si
alguna vez se tocaba ese guard, o se agregaba un llamador nuevo sin
replicarlo, el broadcast sin filtro (heredado de `send-push`, migración
0025, nunca usado en la práctica porque ahí el guard es aún más estricto)
volvía a quedar alcanzable. Se corrigió de raíz, no solo el síntoma.

### 48.2 Prioridad de alcance (cómo quedó)

`send-push-system` ya NO recibe ni confía en ningún campo de alcance del
payload -- solo recibe `notificationId`, relee la fila real de
`notifications` con `service_role`, y resuelve destinatarios con prioridad
estricta y excluyente:

1. `profile_id` presente → solo ese perfil, ignora cualquier territorio.
2. si no, `station_id` presente → perfiles de ese cuartel.
3. si no, `subsede_id` presente → perfiles de los cuarteles de esa subsede.
4. si no, `region_id` presente → perfiles de esa región.
5. si ninguno está presente → **no se envía nada**, se registra en
   `push_send_log` con `status='error'` y un mensaje explícito ("sin
   alcance push válido"), nunca un fallback a "todos".

El trigger `dispatch_notification_push()` (0085) se simplificó: manda
ÚNICAMENTE `notificationId` en el payload (antes mandaba también título,
cuerpo y los 4 campos de alcance, que ya no se usan ni se confían).

### 48.3 Notificación sin alcance: qué pasa ahora

Nunca dispara broadcast. La fila interna se crea igual (sigue visible en
la campanita para quien pueda verla por RLS), pero `send-push-system`
responde con error y lo deja registrado -- distinguible en el diagnóstico
de "no había suscripciones" (otro tipo de fila, `recipients_count=0` sin
error) o de un error real de infraestructura.

### 48.4 Constraint de `notifications` (migración `0087`)

`notifications_scope_not_ambiguous` (0032) se endureció: antes solo exigía
"a lo sumo un territorio cuando `profile_id` es null" -- permitía tanto
los 4 campos en `null` como `profile_id` combinado con territorio. Ahora
exige **exactamente una** fuente de alcance (`profile_id` XOR un solo
territorial), nunca cero, nunca ambigua. Se corrigieron antes de endurecer
el constraint:

- Filas históricas sin ningún alcance (si las hubiera): `region_id` =
  Regional 4 (única región del sistema hoy). Nunca se borra ninguna
  notificación existente.
- `notify_calendar_event_created()`/`send_calendar_event_reminders()`: los
  eventos de Escuela/capacitación ahora asignan `region_id` = la región del
  perfil que creó el evento (o Regional 4 si no se puede resolver) en vez
  de dejar la notificación sin alcance.

No se agregó una feature de "broadcast global real": si en el futuro hace
falta una notificación explícitamente "para todos, sin excepción", el
criterio documentado es una columna nueva (`is_global boolean`) con su
propia autorización, no una fila sin alcance.

### 48.5 Diagnóstico de push en Ajustes: quién ve qué

- **Usuario común**: estado simple de push (activo/inactivo/denegado,
  igual que antes), botón **"Probar mi notificación"** con resultado
  binario ("llegó" / "no pudimos confirmar el envío, probá reactivar"),
  sin ningún detalle técnico. NO ve el panel de diagnóstico completo.
- **`informatica_r4`/`integrante_informatica`** (`isAdmin`): botón **"Probar
  push server-side"** con detalle técnico (cantidad enviada/destinatarios,
  error crudo si falló), y el panel **"Ver diagnóstico de push"**
  (suscripciones activas, últimas notificaciones propias con su resultado).

Las RPCs subyacentes (`get_own_push_diagnostics`/
`get_own_push_subscription_count`, migración 0086) ya estaban acotadas a
`current_profile_id()` -- ningún usuario podía ver diagnóstico de otro. El
cambio de esta ronda es de UI: ocultar el panel técnico completo a quien no
sea informática, no un cambio de qué datos expone el backend (que ya eran
correctos).

`system_settings` (`project_url`/`cron_shared_secret`) sigue visible solo
para `informatica_r4` (ni siquiera `integrante_informatica`, sin cambios --
ya estaba así desde 0074).

### 48.6 Qué correr en Supabase

1. Migración `0087_notifications_scope_strict.sql`.

(Las migraciones `0085`/`0086` de la sección 47 también deben estar
aplicadas si esta ronda se corre de forma independiente.)

### 48.7 Edge Functions a redesplegar

- `send-push-system` (cambio de código real: ya no confía en el payload):
  `supabase functions deploy send-push-system --no-verify-jwt` (ver sección 6.2).

### 48.8 Checklist manual para Axel

1. Con un usuario común: Ajustes → confirmar que el botón dice "Probar mi
   notificación" (no "server-side") y que NO aparece ningún botón/panel de
   diagnóstico técnico.
2. Con `informatica_r4`: confirmar que sigue viendo "Probar push
   server-side" + "Ver diagnóstico de push" con el detalle completo.
3. Crear/editar un evento de Escuela o Capacitación con "notificar al
   crear" activado: confirmar que ahora SÍ llega push (antes de esta
   ronda, la notificación interna se creaba pero el push real fallaba en
   silencio).
4. Crear una notificación manual dirigida a un usuario específico (desde
   Nueva Notificación): confirmar que el push llega SOLO a ese usuario, no
   a otros.
5. Repetir con alcance de región/subsede/cuartel: confirmar que llega solo
   a los usuarios de ese alcance.

## 49. Fix: suscripción push quedaba atada al perfil anterior en el mismo dispositivo (2026-08-24)

Bug real reportado: al loguear un segundo usuario en el mismo navegador/PWA
(ej. probar con `jefe_cuerpo_activo` después de haber usado
`informatica_r4` en ese dispositivo), la notificación de prueba quedaba
asociada al usuario anterior y el push real no llegaba, con el mensaje "No
pudimos confirmar el envío del push" pese a que el estado decía "Activo".

### 49.1 Causa exacta

El navegador reutiliza la MISMA `PushSubscription` (mismo `endpoint`) entre
sesiones de distintos usuarios en el mismo dispositivo -- comportamiento
normal del `PushManager` del navegador, no algo que la app controle.
`savePushSubscription()` (`src/lib/api/pushSubscriptions.ts`) hacía un
upsert DIRECTO desde el cliente:

```
supabase.from('push_subscriptions').upsert(
  { profile_id: profileId, endpoint, ... },
  { onConflict: 'endpoint' }
)
```

PostgREST traduce esto en `INSERT ... ON CONFLICT (endpoint) DO UPDATE`. Si
el endpoint ya existía con `profile_id = A` (usuario anterior) y ahora
loguea el usuario B, ese `UPDATE` queda sujeto a la policy
`push_subscriptions_update_own` (`for update using (profile_id =
current_profile_id())`). El `using` de `UPDATE` se evalúa contra la fila
**tal como está antes** del cambio -- esa fila tiene `profile_id = A`, pero
quien ejecuta la query es B, así que la condición es falsa: **RLS rechaza
el `UPDATE` en silencio, 0 filas afectadas, sin lanzar error** (mismo
patrón "delete/update bloqueado por RLS no lanza excepción" ya documentado
en otras rondas de este proyecto). El cliente nunca se enteraba: la UI
seguía mostrando "Activo" porque la fila con ese `endpoint` SÍ existía
(solo que seguía perteneciendo a A, no a B).

"Reactivar" tampoco lo arreglaba: intentaba borrar la fila vieja primero,
sujeto a la misma lógica de RLS sobre una fila ajena (también rechazado en
silencio), y como el navegador suele devolver la MISMA suscripción
existente al volver a pedir permiso, el upsert posterior volvía a fallar
por el mismo motivo. El endpoint quedaba huérfano, atado indefinidamente al
primer perfil que lo registró en ese dispositivo.

### 49.2 Qué cambió en `push_subscriptions` / migración `0088`

No se tocó el schema de RLS existente (las policies `_own` siguen
correctas para el caso normal de un usuario gestionando sus propias filas).
Se agregaron:

- **`register_my_push_subscription(endpoint, p256dh, auth, user_agent)`**
  (RPC `SECURITY DEFINER`): resuelve `profile_id` desde
  `current_profile_id()` -- nunca un parámetro que el cliente pueda mandar
  falseado -- y hace el upsert/reasignación server-side, sin pasar por la
  restricción de RLS sobre una fila que hoy pertenece a otro perfil. Si el
  endpoint ya existía atado a otro perfil, lo reasigna al actual.
- **`unregister_my_push_subscription(endpoint)`**: mismo criterio para el
  borrado -- por el mismo motivo, un delete "own" fallaría en silencio si
  el endpoint quedó atado a otro perfil.
- **`get_push_subscription_owner(endpoint)`**: self-service, devuelve a
  qué perfil pertenece HOY un endpoint dado (el propio navegador que llama
  ya conoce ese endpoint vía `pushManager.getSubscription()` -- no es
  información nueva que se le esté regalando).
- **`get_push_subscriptions_admin_diagnostics()`** /
  **`get_push_subscription_counts_by_profile()`**: diagnóstico ampliado
  (endpoint abreviado -- nunca completo --, perfil vinculado, user_agent,
  fechas, conteo por usuario) -- SOLO `informatica_r4`/
  `integrante_informatica`.
- Columna `push_subscriptions.updated_at` (no existía, la tabla original
  solo tenía `created_at`) -- distingue una fila recién revinculada de una
  vieja sin tocar.

### 49.3 Cómo se revincula una suscripción al usuario actual

`usePushNotifications` (`checkStatus`) ahora compara el `endpoint` local
del navegador contra `get_push_subscription_owner()`: si pertenece a OTRO
perfil, se revincula automáticamente y en silencio llamando a
`register_my_push_subscription()` -- el permiso del navegador ya está
concedido (no hace falta pedirlo de nuevo), así que no hay fricción real en
re-registrar el mismo endpoint para el perfil actual la primera vez que el
usuario entra a Ajustes (o hace cualquier chequeo de estado de push) tras
cambiar de sesión en el mismo dispositivo. Si por algún motivo esa
revinculación automática falla (error de red, etc.), queda el fallback
manual: el badge muestra "Suscripción de otra sesión en este dispositivo"
con un botón "Activar para este usuario" que fuerza la misma revinculación.

No se implementó revinculación al `login` en sí (fuera de Ajustes) ni un
hook global: `usePushNotifications` solo se usa en `AjustesPage` hoy --
mover esa lógica a un hook global montado en toda la app sería una
ampliación arquitectónica mayor, fuera del alcance de este fix de bug. En
la práctica, la revinculación ocurre la primera vez que el usuario entra a
Ajustes después de loguearse, lo cual cubre el caso reportado.

### 49.4 Logout / cambio de cuenta: comportamiento elegido

Se implementó la opción recomendada por el propio pedido: **no se borra la
suscripción del navegador en logout**. Al próximo login (en Ajustes), la
suscripción se revincula automáticamente al nuevo perfil. Esto evita que
cerrar sesión "rompa" el push sin querer (ej. si el mismo usuario vuelve a
loguearse), y resuelve el caso real de un dispositivo compartido/de prueba
sin pedirle al usuario que recuerde desactivar nada al salir.

### 49.5 Estado "Activo": qué significa ahora

Antes: "existe una fila en `push_subscriptions` con ese endpoint" (sin
importar de quién). Ahora, `PushDiagnosticStatus` distingue:

- **`active`**: permiso concedido, service worker listo, suscripción del
  navegador existe, Y la fila en `push_subscriptions` pertenece al perfil
  actual.
- **`other_profile`** (nuevo): la suscripción del navegador existe, la fila
  existe, pero pertenece a OTRO perfil -- estado transitorio en la práctica
  (se auto-revincula), visible solo si la revinculación automática falla.
- `stale`/`denied`/`not_subscribed`/`no_worker`: sin cambios de criterio.

### 49.6 "Probar mi notificación" / "Probar push server-side"

Sin cambios de arquitectura (ya usaba `profile.id` de `useAuth()`, que se
actualiza correctamente en cada cambio de sesión vía
`onAuthStateChange` -- no había staleness ahí, el bug era enteramente de
`push_subscriptions`). Se agregó un mensaje específico para usuario común:
si no hay suscripción activa para el perfil actual (`!push.subscribed`),
el resultado dice explícitamente "No hay dispositivo push registrado para
este usuario" en vez del genérico "no pudimos confirmar el envío".

### 49.7 `send-push-system`

Sin cambios en esta ronda (ya resolvía destinatarios solo por `profile_id`
sin mezclar perfiles, corregido en la sección 48). El fix de esta ronda es
enteramente sobre cómo se registra/revincula la fila en
`push_subscriptions`, no sobre cómo `send-push-system` la consume.

### 49.8 Qué correr en Supabase

1. Migración `0088_push_subscription_rebind.sql`.

### 49.9 Edge Functions a redesplegar

Ninguna -- el fix es enteramente RPC de Postgres + frontend.

### 49.10 Checklist manual para Axel (dos usuarios, mismo dispositivo)

**Caso A:**
1. Login como Informática (`informatica_r4`). Activar push.
2. Logout. Login como Jefe de Cuerpo Activo, mismo navegador.
3. Entrar a Ajustes (dispara la revinculación automática) y "Probar mi
   notificación".
4. Confirmar: la notificación aparece solo para Jefe, el push llega solo
   al dispositivo (ahora vinculado a Jefe), Informática no recibe nada.

**Caso B:**
1. Como Jefe, "Probar mi notificación" de nuevo. Confirmar que sigue
   funcionando (push log OK, sin mensajes de "otra sesión").

**Caso C:**
1. Logout, login de nuevo como Informática en el mismo dispositivo.
2. Entrar a Ajustes: la suscripción debe revincularse a Informática (o
   mostrar el botón "Activar para este usuario" si la revinculación
   automática no llegó a completarse).
3. Confirmar que Jefe ya no recibe push de Informática después de esto.

**Caso D:**
1. Notificación manual a un usuario específico (desde Nueva Notificación).
2. Confirmar que llega solo a ese usuario (sin cambios respecto a la
   sección 48).

## 50. Diagnóstico preciso de "push no intentado" + fix de notificaciones que no aparecían en /notificaciones (2026-08-24)

Síntoma reportado: el diagnóstico de Ajustes mostraba "push no intentado"
para varias notificaciones (prueba, recordatorio semanal, resumen semanal)
con suscripciones activas confirmadas, y algunas notificaciones ni siquiera
aparecían en `/notificaciones`. Investigación completa y fix de ambos
problemas -- resultaron ser dos causas independientes.

### 50.1 Causa exacta de "push no intentado"

`dispatch_notification_push()` (0085) solo dejaba una fila en
`push_send_log` DESPUÉS de que `send-push-system` respondiera -- y eso lo
escribe la propia Edge Function, no el trigger. Si el trigger nunca llegaba
a disparar `net.http_post` (porque `project_url`/`cron_shared_secret` no
estaban configurados en `system_settings` en ESE momento) o la llamada
quedaba sin respuesta (`pg_net` sin procesar, timeout), **no quedaba
ninguna fila en `push_send_log`**. El diagnóstico interpretaba "sin fila"
como "no intentado" sin poder decir el motivo real -- exactamente el
síntoma reportado. No se pudo determinar con certeza, sin acceso a la base
real, cuál de las causas (a-d de la sección de arriba) era la que estaba
pasando en producción en el momento del reporte -- por eso el fix es hacer
que el sistema deje rastro suficiente para que informática lo pueda ver
directamente, en vez de intentar adivinar la causa desde acá.

### 50.2 Qué cambió: `dispatch_notification_push()` deja rastro SIEMPRE

Migración `0089_push_dispatch_diagnostics.sql`:

- **`push_send_log.status`** gana dos valores nuevos, escritos por el
  TRIGGER (no por las Edge Functions): `not_attempted` (no se pudo llamar
  a `pg_net` -- falta `project_url`/`cron_shared_secret`, o la extensión
  `pg_net` no está instalada/habilitada) y `dispatched` (el trigger SÍ
  llamó a `net.http_post`, con el `request_id` guardado, pero esta fila no
  dice si `send-push-system` respondió bien -- eso lo determina la fila
  `ok`/`error` que la Edge Function inserta después).
- **`push_send_log.pg_net_request_id`** (columna nueva): el `request_id`
  que devuelve `net.http_post()`, para poder cruzarlo contra
  `net._http_response` (tabla interna de la extensión `pg_net`) y ver la
  respuesta HTTP real de esa llamada puntual.
- `dispatch_notification_push()` ahora tiene un `EXCEPTION` handler:
  antes, si `pg_net` no estaba instalado, `net.http_post` lanzaba una
  excepción que -- al no estar capturada en un trigger `AFTER INSERT` --
  revertía TODA la transacción, **incluida la notificación interna que se
  estaba insertando**. Esto significa que en ese escenario específico ni
  siquiera la notificación interna llegaba a guardarse (haría sentido con
  "algunas notificaciones no aparecen", aunque no se pudo confirmar que
  este fuera el caso real sin `pg_net` en un entorno de prueba). Ahora el
  error se captura, se registra en `push_send_log` como `not_attempted`
  con el mensaje real de Postgres, y la notificación interna se guarda
  igual.
- El índice único de deduplicación (`idx_push_send_log_notification_dedup`,
  0025) sigue aplicando solo a `status='ok'` -- las filas nuevas
  (`not_attempted`/`dispatched`) nunca compiten con la deduplicación real.

### 50.3 `get_push_infra_diagnostics()` (nueva, solo `informatica_r4`)

Consolida en una sola llamada: si `project_url`/`cron_shared_secret` están
configurados (sin exponer el valor), si la extensión `pg_net` está
instalada, cuántas llamadas a `pg_net` se registraron en los últimos 7
días, y la última respuesta HTTP real capturada (status code / error),
cruzando `push_send_log.pg_net_request_id` contra `net._http_response`.
Exige `is_super_admin()` (solo `informatica_r4`, ni siquiera
`integrante_informatica` -- mismo criterio que `project_url`/
`cron_shared_secret` en Configuración del sistema, 0074). Visible en
Ajustes → diagnóstico de push → "Infraestructura del dispatcher".

### 50.4 `get_own_push_diagnostics()`: prioriza la fila más informativa

Ahora puede haber hasta 3 filas de `push_send_log` por notificación
(`dispatched`/`not_attempted` del trigger, más `ok`/`error`/etc. de la
Edge Function). Se redefinió con un `LATERAL JOIN` que prioriza, por
notificación: resultado real (`ok`/`error`/`rate_limited`/`duplicate`) >
`dispatched` (se llamó, sin resultado conocido todavía) > `not_attempted`
(nunca se pudo llamar). `push_attempted` en el resultado sigue significando
"hay un resultado real", no solo "el trigger corrió".

### 50.5 Segundo problema: notificaciones que no aparecían en /notificaciones

Causa distinta y confirmada por código, sin relación con RLS ni con
`notifications_scope_not_ambiguous` (0087): `fetchNotificationsForProfile()`
(`src/lib/api/notifications.ts`) tenía `.limit(20)` fijo, y **se usaba
tanto para el listado completo de `/notificaciones` como para el contador
de no leídas del header** (`AppHeader.tsx`, vía
`data.filter((n) => !n.is_read).length` sobre esas mismas 20 filas). Si el
sistema generaba 20 o más notificaciones automáticas (cursos, documentos,
cambios de estado, recordatorios) más recientes que una notificación
propia, esa notificación quedaba fuera de la ventana visible -- tanto en
el listado como en el contador de la campanita, que además subestimaba el
total real de no leídas en cualquier caso con más de 20 pendientes. RLS
estaba (y sigue estando) correcta: la fila existía y era visible por
`profile_id = current_profile_id()`, simplemente nunca llegaba a pedirse
del backend.

Fix:
- `fetchNotificationsForProfile()` sube el límite por defecto de 20 a 100
  (parámetro opcional, sigue siendo un límite -- no es "traer todo", pero
  cubre el caso real reportado).
- Nueva `fetchUnreadNotificationCount()`: usa `count: 'exact', head: true`
  de PostgREST (un conteo real de Postgres, sin traer filas) en vez de
  contar sobre una página limitada. `AppHeader.tsx` la usa para el badge
  de no leídas -- ya no depende de que la notificación esté dentro de
  ninguna ventana de paginación.

### 50.6 Seguridad

- `cron_shared_secret`/`project_url` nunca se exponen en valor -- solo
  `configured: true/false` (mismo criterio que `list_system_settings_status`,
  0074).
- `get_push_infra_diagnostics()` exige `is_super_admin()` server-side, no
  solo ocultar el botón en la UI.
- `net._http_response` solo se consulta cruzada contra
  `push_send_log.pg_net_request_id` (requests que este mismo sistema
  generó), nunca toda la tabla -- evita exponer tráfico HTTP de otras
  funciones que pudieran usar `pg_net` en el mismo proyecto.
- No se tocó ninguna policy de RLS en esta ronda.

### 50.7 Qué correr en Supabase

1. Migración `0089_push_dispatch_diagnostics.sql`.
2. **Verificación de configuración (query para Axel, sin exponer el
   secreto)** -- correr en el SQL Editor como `informatica_r4` logueado en
   la app (no funciona desde el SQL Editor directo, ver 0074): desde
   Ajustes → "Ver diagnóstico de push" → "Infraestructura del
   dispatcher", confirmar que `project_url` y `cron_shared_secret`
   figuran como "configurado". Si `project_url` está configurado pero no
   apunta a `https://tuhynszatghlfohugexn.supabase.co`, corregirlo desde
   Ajustes → Configuración del sistema.
3. Si `cron_shared_secret` figura como "sin configurar", o si figura
   configurado pero `send-push-system` sigue sin responder, regenerar y
   sincronizar ambos lados:
   - En Ajustes → Configuración del sistema, guardar un `cron_shared_secret`
     nuevo (cualquier string largo y aleatorio).
   - Configurar el mismo valor exacto como secreto de la Edge Function:
     `npx supabase secrets set CRON_SHARED_SECRET="el_mismo_valor_exacto"`.
   - Ambos valores deben coincidir carácter por carácter -- un desajuste
     hace que `send-push-system` responda 401 sin dejar ningún registro
     adicional más allá de lo que ya captura `net._http_response`.

### 50.8 Edge Functions a redesplegar

Ninguna -- el fix de esta ronda es enteramente SQL (trigger + funciones de
diagnóstico) y frontend.

### 50.9 Checklist manual para Axel

1. Ajustes → "Ver diagnóstico de push" → confirmar que "Infraestructura
   del dispatcher" muestra `project_url`/`cron_shared_secret`/`pg_net`
   como corresponda -- si alguno dice "sin configurar" o "no instalada",
   seguir el punto 50.7.3 de arriba.
2. "Probar push server-side": confirmar que el resultado ya no queda en
   "todavía no intentó" de forma indefinida -- debe resolver a un
   resultado real (enviado, o error explícito) en los ~4 segundos del
   polling.
3. Si sigue en "todavía no intentó" tras la prueba: revisar en el panel
   de infraestructura si "Llamadas a pg_net" es mayor a 0 pero
   "respuestas registradas" es 0 -- indicaría que `pg_net` no está
   procesando la cola (revisar la extensión desde el Dashboard de
   Supabase) o que la respuesta tardó más que la ventana de polling
   (recargar el diagnóstico unos segundos después).
4. `/notificaciones`: confirmar que el listado ya no corta en 20
   resultados si hay más notificaciones recientes que esas -- generar
   varias notificaciones de prueba y confirmar que todas aparecen.
5. Confirmar que el número en la campanita del header coincide con la
   cantidad real de notificaciones sin leer (antes podía subestimar si
   había más de 20 pendientes).

## 51. HTTP 401 persistente en `send-push-system`: el gateway de Supabase (JWT), no `x-cron-secret` (2026-08-26) — migración 0092

Seguimiento del 401 de la sección 50: el fix de `trim()` sobre el secreto
no resolvió el problema. El síntoma clave que lo confirmó: `informatica_r4`
reseteó `CRON_SHARED_SECRET` en ambos lados (Edge Secret y
`system_settings.cron_shared_secret`), redesplegó `send-push-system`, y el
401 siguió exactamente igual. Si la causa fuera un mismatch de VALOR del
secreto, un reset prolijo de ambos lados lo habría resuelto.

### 51.1 Causa exacta

El repo **nunca tuvo `supabase/config.toml`**. Toda Edge Function que se
despliega con `supabase functions deploy <nombre>` sin el flag
`--no-verify-jwt` (y sin un `config.toml` que lo desactive por proyecto)
queda con `verify_jwt=true` -- el comportamiento por default de Supabase.
Con `verify_jwt=true`, el **gateway** de Supabase Edge Functions (una capa
delante de `Deno.serve()`, no código nuestro) exige un `Authorization:
Bearer <jwt>` válido y responde 401 él mismo si no lo encuentra --
**antes** de que el código de `send-push-system` (el `x-cron-secret`
check) llegue a ejecutarse.

`dispatch_notification_push()` (0085/0089/0090) llama a `send-push-system`
vía `net.http_post()` mandando únicamente `Content-Type` y `x-cron-secret`
-- nunca mandó ni debía mandar un JWT, porque la función está diseñada
explícitamente para no aceptar JWT de usuario (ver el comentario de
cabecera de `send-push-system/index.ts`: "NO acepta JWT de usuario... Sin
ese header (`x-cron-secret`), o si no coincide, 401 inmediato"). El
gateway, sin embargo, no sabe nada de ese diseño -- exige JWT igual, salvo
que se le indique explícitamente lo contrario en el deploy.

Cualquier despliegue anterior de `send-push-system` (todos los comandos
documentados en este archivo antes de esta sección) quedó con
`verify_jwt=true` por default. **Todos** los 401 reportados en la sección
50 y en los seguimientos posteriores son consistentes con esto.

### 51.2 Cómo se distinguió sin acceso directo a producción

`net._http_response` (tabla interna de `pg_net`) guarda el **body real**
de la respuesta HTTP, no solo el `status_code`. El body del gateway y el
body de nuestro código tienen formas completamente distintas:

- Gateway (JWT rechazado): algo como
  `{"code":401,"message":"Missing authorization header"}` (o "Invalid
  JWT", "invalid claim: missing sub claim", etc. -- siempre con la clave
  `"message"`).
- Nuestro código (`send-push-system/index.ts`, ver `jsonResponse`):
  `{"sent":0,"error":"No autorizado."}` -- nunca `"message"`, nunca
  menciona JWT.

Antes de esta migración, ni `get_push_infra_diagnostics()` (0089) ni
`test_push_dispatcher_auth()` (0090) leían esa columna (`content`) --
ambas solo tenían `status_code`/`error_msg`, insuficiente para diferenciar
las dos causas de 401.

### 51.3 Fix

**Edge Function (obligatorio para resolver el 401):**

```
supabase functions deploy send-push-system --no-verify-jwt
```

Esto es seguro -- `send-push-system` nunca dependió de la verificación de
JWT del gateway para su autorización real; esa siempre fue exclusivamente
el header `x-cron-secret` comparado contra `CRON_SHARED_SECRET` dentro del
propio código (ver `index.ts`). Desactivar `verify_jwt` a nivel de gateway
no abre ninguna puerta nueva: la función seguía (y sigue) rechazando con
401 cualquier request sin el `x-cron-secret` correcto.

**SQL (migración 0092, diagnóstico únicamente -- no cambia autorización ni
RLS):** `get_push_infra_diagnostics()` y `test_push_dispatcher_auth()`
ahora también devuelven el body real de la última respuesta HTTP
(`last_response_body`/`response_body`, truncado a 300 caracteres --
ninguno de los dos bodies posibles contiene el secreto). El diagnóstico de
Ajustes usa ese body para mostrar un mensaje distinto según el origen del
401:

- Si el body contiene `"message"`/"missing authorization"/"invalid
  jwt"/etc: "HTTP 401 del GATEWAY de Supabase... hay que redesplegar con
  `--no-verify-jwt`".
- Si no: "La Edge Function rechazó la llamada: secreto incorrecto o
  desincronizado" (el mensaje que ya existía desde la sección 50).

### 51.4 Validación esperada después del fix

1. Ajustes → "Ver diagnóstico de push" → "Probar autorización": debe
   devolver **HTTP 404** ("¡autorización correcta!"), no 401. Un 404 acá
   es el resultado ESPERADO -- la prueba usa un `notificationId` que no
   existe a propósito, así que la Edge Function llega a buscarlo (superó
   la autorización) y no lo encuentra.
2. "Probar push server-side" (con una notificación real): debe terminar
   en "push enviado a X/Y dispositivo(s)" o un error real posterior (por
   ejemplo, sin suscripciones activas) -- nunca más en 401.
3. Si el 401 persiste después de `--no-verify-jwt`: recién ahí es momento
   de sospechar de `x-cron-secret` en sí (ver sección 33.4/50 para cómo
   reconfigurarlo) -- el body de la respuesta (visible en el diagnóstico)
   lo va a confirmar sin ambigüedad.

### 51.5 Nota sobre `set_system_setting()` en el SQL Editor

Sigue sin funcionar desde ahí, y es esperado (ver sección 33.3): el SQL
Editor de Supabase corre sin el JWT de ningún usuario de la app, así que
`auth.uid()` es `null` y `is_super_admin()` da `false` aunque tu usuario
real sea `informatica_r4`. La única forma soportada de configurar
`cron_shared_secret`/`project_url` es `/ajustes` → "Configuración del
sistema", que sí corre bajo tu sesión real. No hay (ni va a haber) un
camino por SQL Editor para esto -- es la misma RLS que protege
`system_settings` de cualquier usuario autenticado que no sea
`informatica_r4`, y el SQL Editor no tiene forma de asumir esa identidad.

### 51.6 Edge Functions a redesplegar

- `send-push-system`: `supabase functions deploy send-push-system --no-verify-jwt` (el fix real de
  esta ronda).

### 51.7 Checklist manual para Axel

1. Ejecutar `npx supabase functions deploy send-push-system --no-verify-jwt` (con `--no-verify-jwt`,
   no el comando sin el flag que se usó antes).
2. Aplicar la migración `0092_push_dispatcher_gateway_vs_function_401.sql`.
3. Ajustes → "Ver diagnóstico de push" → "Probar autorización" → confirmar HTTP 404.
4. Si sigue en 401: mirar el texto "Respuesta cruda" que ahora aparece debajo del resultado --
   si menciona "message"/"authorization"/"jwt", el deploy sin `--no-verify-jwt` no se aplicó
   correctamente (confirmar en el Dashboard → Edge Functions → send-push-system → Details que
   "Verify JWT" está en OFF); si dice `{"sent":0,"error":"No autorizado."}`, recién ahí es un
   problema real de `cron_shared_secret` (sección 33.4).
5. "Probar push server-side" con una notificación real → confirmar que llega el push físico al
   dispositivo (no solo que el diagnóstico dice "enviado").

## 52. "Probar push server-side" funcionaba pero las notificaciones reales de módulos no mostraban nada en el diagnóstico (2026-08-26) — migración 0093

Síntoma reportado, ya con la infraestructura del dispatcher funcionando
(sección 51 aplicada, `--no-verify-jwt` desplegado): las notificaciones de
prueba funcionaban, pero las notificaciones reales de calendario/
préstamos/cambios de estado no mostraban confirmación de push en Ajustes,
aunque la notificación interna sí aparecía en la campanita.

### 52.1 Investigación

Se revisó, uno por uno, todo el camino real: cada función que inserta en
`notifications` (`notify_calendar_event_created`,
`send_calendar_event_reminders`, `notify_loan_request_created`,
`notify_loan_request_status_change`, `notify_document_created`,
`notify_station_status_change`, etc.), el trigger
`dispatch_notification_push()` (confirmado: corre `AFTER INSERT` sin
ningún filtro por `type`/origen, dispara para cualquier notificación) y la
resolución de destinatarios en `send-push-system` (`profile_id` >
`station_id` > `subsede_id` > `region_id`, con los joins
`profiles`/`stations`/`subsedes` correctos). **No se encontró ningún bug
de envío** -- el push real se manda igual para notificaciones con scope
territorial.

### 52.2 Causa exacta

El bug estaba en la **visibilidad del diagnóstico**, no en el envío.
`get_own_push_diagnostics()` (0086/0089) filtraba
`where n.profile_id = current_profile_id()` -- es decir, solo mostraba
notificaciones con `profile_id` puntual. El botón "Probar push
server-side" siempre crea su notificación de prueba con
`profile_id = uno mismo` (ver `AjustesPage.tsx`), así que ese camino
siempre aparecía bien en el diagnóstico. Pero **casi todas las
notificaciones reales de módulos usan scope territorial**
(`region_id`/`subsede_id`/`station_id`, `profile_id` NULL) -- calendario,
préstamos sin responsable puntual, cambios de estado de vehículos/
personal/cuarteles, etc. Esas notificaciones nunca aparecían en el panel,
sin importar si el push se había enviado correctamente o no. El síntoma
percibido ("no veo confirmación de que llegó") tenía una causa distinta a
la que parecía: no era que el push fallara, era que el diagnóstico nunca
buscaba esas filas.

### 52.3 Fix

- `get_own_push_diagnostics()`: incluye también notificaciones de scope
  territorial visibles para el usuario actual (mismo criterio que la RLS
  `notifications_select_own_or_scope`, reusado, no reinventado). Agrega
  `notification_scope` (`personal`/`cuartel`/`subsede`/`region`/
  `sin_alcance`) para que el panel muestre de dónde viene el alcance de
  cada fila.
- `get_push_infra_diagnostics()`: agrega `recent_error_count` (errores en
  toda la ventana de 7 días) y `last_response_is_historical` (true si la
  última respuesta tiene más de 15 minutos) -- antes un 401 viejo ya
  corregido (por ejemplo el de la sección 51, antes del fix de
  `--no-verify-jwt`) seguía leyéndose como si fuera el problema vigente
  hasta la próxima notificación real.
- `send-push-system`: agrega `.eq('is_active', true)` en las 3 ramas
  territoriales de resolución de destinatarios (defensiva, no la causa
  raíz de este síntoma -- un perfil dado de baja no debe seguir recibiendo
  push reales de scope territorial; el camino `profile_id` puntual no se
  filtra, puede mandarle a un perfil inactivo a propósito).
- Diagnóstico de Ajustes: cada notificación muestra su scope, y los
  errores de infraestructura distinguen explícitamente "histórico" de
  "vigente".

### 52.4 Edge Functions a redesplegar

- `send-push-system`: `supabase functions deploy send-push-system --no-verify-jwt` (cambio de
  código real -- filtro `is_active`; recordar el flag, ver sección 51).

### 52.5 Checklist manual para Axel

1. Aplicar la migración `0093_push_diagnostics_territorial_scope.sql`.
2. `npx supabase functions deploy send-push-system --no-verify-jwt`.
3. "Probar push server-side" → sigue funcionando igual que antes (no se tocó ese camino).
4. Crear un evento de Calendario con alcance de cuartel/subsede/región → confirmar que el
   diagnóstico de Ajustes ahora SÍ muestra esa notificación (con la etiqueta de scope
   correspondiente) y su resultado real de push.
5. Crear una solicitud de préstamo → mismo chequeo.
6. Notificación a un usuario específico (`profile_id` puntual, ej. aprobación/rechazo de
   préstamo) → confirmar que sigue funcionando y aparece como "personal".
7. Notificación a cuartel/subsede/región → confirmar que **solo** los usuarios de ese alcance
   reciben el push (privacidad: nunca debe llegar a usuarios fuera del alcance).
8. Con la app cerrada en el celular (no solo en segundo plano): repetir 4-6 y confirmar que el
   push físico llega igual sin la PWA abierta.

## 53. Escuela: Avales regionales por departamento interno + roles agrupados por tipo (2026-10-02) — migraciones 0094-0095

> **Actualización:** los departamentos internos de Escuela se unificaron con `departments` en la
> sección 55. El coordinador de departamento ya no usa el rol `coordinador_departamento_escuela` ni
> `school_department_members`: desde la sección 56 es `departments.coordinator_profile_id`. La
> matriz de permisos de 53.3 sigue vigente.

Dos mejoras en la misma tanda:

1. **Avales regionales**: sección nueva dentro de Escuela para cargar documentos de avales,
   organizados por **departamento interno de Escuela** (Fuego, Forestal, FASME, ...). No son los
   Departamentos Regionales del módulo `/departamentos` (tabla `departments`): es una estructura
   aparte, con permisos propios.
2. **Roles agrupados por tipo/nivel**: los roles dejan de mostrarse como una fila plana de botones.
   Ahora se agrupan (Informática, Escuela, Departamento interno de Escuela, Región, Cuartel, Otros)
   con descripción, alcance y permisos principales de cada uno.

### 53.1 Modelo de datos

> **Actualizado en la sección 55:** la tabla `school_departments` descripta acá se unificó con
> `departments` (migración `0096`). Los departamentos de Avales son los mismos de la sección
> Departamentos.

No existía infraestructura reutilizable: `documents` tiene alcance territorial (región/subsede/
cuartel/usuario) y una policy de lectura que no encaja con "solo los de tu departamento interno", y
`departments` son los Departamentos Regionales. Se crearon tablas nuevas:

| Tabla | Para qué |
|---|---|
| `school_departments` | Departamentos internos de Escuela: `name`, `slug` (inmutable, para URLs), `description`, `is_active`. No se borran: se desactivan. Inactivo = se consulta, pero no admite cargas nuevas. |
| `school_department_members` | Quién coordina qué departamento (`member_role = 'coordinador'`, `is_active`). Se escribe solo vía RPC. |
| `school_avales_documents` | Metadata de cada aval: título, descripción, observaciones, departamento, `storage_bucket`/`storage_path`, nombre original, MIME, tamaño, quién cargó (`uploaded_by_profile_id` + `uploaded_by_name`), `is_archived`/`archived_at`/`archived_by_profile_id`, `created_at`/`updated_at`. |

Se cargan los 3 departamentos iniciales (Fuego, Forestal, FASME) en la propia migración `0095`. No
hace falta crearlos a mano. Los departamentos nuevos se crean desde la app.

Roles nuevos en el enum `role_key` (migración `0094`, separada porque Postgres no deja usar un valor
de enum en la misma transacción que lo agrega):

- `coordinador_escuela` — Coordinador de Escuela.
- `secretario_escuela` — Secretario de Escuela.
- `coordinador_departamento_escuela` — Coordinador de departamento interno.

Los roles nuevos **no** se sumaron a `is_escuela_role()`: esa función da escritura sobre cursos/
calendario y lectura regional de cuarteles/perfiles/auditoría, que la matriz pedida no les da.

### 53.2 Cómo se determina cada rol (helpers SQL)

| Helper | Regla |
|---|---|
| `is_informatica_r4()` (existente) | `informatica_r4` o `integrante_informatica`, perfil activo. Ve y carga en todos los departamentos. |
| `is_super_admin()` (existente) | Solo `informatica_r4`, perfil activo. |
| `can_manage_school_avales()` | `= is_super_admin()`. Editar metadata, archivar/desarchivar, eliminar avales, administrar departamentos y coordinadores. |
| `is_school_coordinator()` | `has_role('coordinador_escuela')`. |
| `is_school_secretary()` | `has_role('secretario_escuela')`. |
| `is_school_department_coordinator(dep)` | Rol `coordinador_departamento_escuela` **y** membresía activa como coordinador de ese departamento. Ninguna de las dos sola alcanza. |
| `can_view_all_school_avales()` | Informática, coordinador o secretario de Escuela. |
| `can_view_school_avales_department(dep)` | `can_view_all_school_avales()` o coordinador activo de ese departamento. |
| `can_upload_school_avales_department(dep)` | Mismas reglas que ver, y el departamento tiene que estar activo. |
| `my_school_department_ids()` | Departamentos que coordina el usuario actual. |

Todos respetan `profiles.is_active` (vía `has_role()`/`current_profile_id()`): un usuario
desactivado pierde el acceso al instante.

**Decisión a revisar**: "Informática/admin supremo" se interpretó así: **ver y cargar** = Informática
completa (`informatica_r4` + `integrante_informatica`, igual que el resto del sistema), **editar/
archivar/eliminar y administrar departamentos** = solo `informatica_r4` (mínimo permiso). Si
`integrante_informatica` también tiene que poder administrar, se cambia `is_super_admin()` por
`is_informatica_r4()` dentro de `can_manage_school_avales()`: todas las policies del módulo pasan por
esa función (y en el frontend, `canManage` en `src/hooks/useSchoolAvalesAccess.ts`).

### 53.3 Matriz final de permisos — Avales regionales

| Rol | Ver | Cargar | Editar metadata | Archivar | Eliminar | Alcance |
|---|---|---|---|---|---|---|
| informatica_r4 | Sí (incluidos archivados) | Sí | Sí | Sí | Sí | Todos los departamentos |
| integrante_informatica | Sí | Sí | No | No | No | Todos los departamentos |
| coordinador_escuela | Sí | Sí | No | No | No | Todos los departamentos |
| secretario_escuela | Sí | Sí | No | No | No | Todos los departamentos |
| coordinador_departamento_escuela | Sí | Sí | No | No | No | Solo su(s) departamento(s) |
| Cualquier otro rol (incluidos director_escuela e instructor) | No | No | No | No | No | Sin acceso |

`director_escuela` e `instructor` no figuraban en la matriz pedida, así que quedaron sin acceso
(mínimo permiso). Si el Director tiene que ver los avales, se suma su rol en
`can_view_all_school_avales()`.

Documentos archivados: solo los ve `informatica_r4`. Para el resto desaparecen del listado y su
archivo deja de poder descargarse.

### 53.4 RLS y Storage

- **RLS** activado en las 3 tablas, policies solo `to authenticated`, y `revoke all ... from anon`.
  - `school_departments`: select por `can_view_school_avales_department(id)`; insert/update solo
    `can_manage_school_avales()`; sin delete.
  - `school_department_members`: select para Informática o la propia fila; **sin policies de
    escritura**: solo las RPC `assign_school_department_coordinator()` /
    `remove_school_department_coordinator()` (SECURITY DEFINER, exigen `can_manage_school_avales()`).
    Asignar también agrega el rol `coordinador_departamento_escuela`; quitar a alguien de su último
    departamento le quita el rol.
  - `school_avales_documents`: select = admin supremo, o no archivado + departamento visible; insert
    = puede cargar en ese departamento, a su propio nombre, sin archivar, con la ruta atada a ese
    departamento y a ese documento; update/delete = solo admin supremo.
- **Triggers de integridad**: al registrar un aval se fuerza `uploaded_by` al usuario real, se
  verifica que el archivo exista de verdad en Storage y se toman tamaño/MIME reales de la metadata
  de Storage (no del cliente). Archivo, ruta, tamaño, MIME y quién cargó son inmutables, incluso
  para el admin. Fecha y autor del archivado los fija el servidor.
- **Bucket privado `school-avales`**: 20 MB, mismos tipos MIME que `documents` (PDF, Word, Excel,
  PNG, JPG, WEBP, HEIC/HEIF). Ruta: `<department_id>/<document_id>/<archivo-sanitizado>`. Se usa el
  id del departamento (no el slug sugerido) porque es inmutable; igual, **la seguridad no depende
  del path**:
  - `school_avales_storage_select`: solo archivos con documento registrado, no archivado, de un
    departamento visible (o admin supremo). Conocer la URL o la ruta exacta no alcanza.
  - `school_avales_storage_insert`: ruta exacta y permiso de carga en ese departamento activo.
  - `school_avales_storage_delete`: admin supremo. Además, quien subió un archivo puede borrarlo
    solo si quedó sin documento (carga interrumpida), para limpiarlo.
  - Sin policy de update: ningún archivo se reemplaza ni se mueve.
- Descarga: URLs firmadas de 5 minutos.
- Flujo de carga sin filas "pending" (a diferencia de Documentos): primero se sube el archivo,
  después se registra la fila. Si el registro falla, el frontend borra el archivo recién subido.

### 53.5 Auditoría

Carga, edición de metadata, archivo/desarchivo y eliminación de avales, altas/cambios de
departamentos y asignaciones de coordinadores quedan en `audit_logs` vía `audit_row_change()`
(sin cambios en esa función). Como estas tablas no tienen territorio, se ajustó
`audit_logs_select_regional`: excluye las 3 tablas de Avales, porque su condición
"`region_id is null`" le habría mostrado a `secretario_regional` títulos y nombres de archivo que la
matriz no le da. La auditoría de Avales queda visible solo para Informática. No se audita la
descarga: no había patrón de auditoría de descargas en el sistema.

No se agregaron notificaciones.

### 53.6 Roles agrupados

Los roles son un enum de Postgres sin tabla propia, y la metadata visual ya vivía en
`ROLE_DEFINITIONS` (`src/types/roles.ts`), que tenía un campo `scope` sin uso. Se usó ese mismo
lugar en vez de una migración nueva: cada rol ahora tiene `category`, `scope` (ampliado),
`scopeLabel` y `permissions` (resumen de la matriz 31.4 y de esta sección). No cambia ningún
permiso real.

Agrupación: **Informática** (informatica_r4, integrante_informatica) · **Escuela Regional**
(director_escuela, instructor, coordinador_escuela, secretario_escuela) · **Departamento interno
de Escuela** (coordinador_departamento_escuela) · **Región** (secretario_regional) · **Cuartel**
(presidente_cuartel, jefe_cuerpo_activo, usuario_carga_cuartel, secretario_comision) · **Otros**
(invitado, y `administrativo` como rol retirado, que solo aparece si un usuario todavía lo tiene).
Subsede y Sistema no tienen roles propios: son niveles de alcance, explicados en la guía.

Dónde se ve:
- **Nuevo usuario** y **Detalle de usuario**: selector agrupado con descripción y alcance.
- **Ajustes**: los roles propios con su grupo, función y alcance.
- **`/roles`** (nueva, cualquier usuario): guía completa con niveles de alcance, roles por grupo,
  permisos principales y, para quien tiene acceso, los departamentos internos (con sus
  coordinadores, solo para Informática). Enlazada desde Usuarios, los selectores de rol y Ajustes.

Asignación de los roles nuevos: solo Informática. `admin-create-user` rechaza que `director_escuela`
cree usuarios con roles de Avales, y `admin-update-user` trata a los roles nuevos como privilegiados
(un `jefe_cuerpo_activo` no puede resetear la contraseña de un usuario de Escuela de su cuartel).

### 53.7 Rutas nuevas

| Ruta | Quién | Qué |
|---|---|---|
| `/escuela/avales` | Roles con acceso | Listado por departamento (chips con conteo), búsqueda, ver/descargar; admin supremo: editar, archivar/desarchivar, eliminar, ver archivados |
| `/escuela/avales/nuevo` | Roles con acceso, desde PC | Carga: departamento, título, descripción, observaciones, archivo |
| `/escuela/avales/:id/editar` | informatica_r4 | Editar metadata (título, descripción, observaciones, departamento) |
| `/escuela/avales/departamentos` | informatica_r4 | Crear/editar/desactivar departamentos, asignar/quitar coordinadores |
| `/roles` | Cualquier usuario | Guía de roles y permisos |

Escuela muestra pestañas **Cursos / Avales regionales** solo a quien tiene acceso; para el resto,
Escuela se ve igual que antes. Entrar por URL directa sin permiso muestra un mensaje claro, y aunque
se salteara la pantalla, la base no devuelve nada. La carga queda solo desde PC, igual que en
Documentos (sección 21); ver y descargar funciona en el celular. *(Desde la sección 56.6 la carga
funciona también desde el celular.)*

### 53.8 Qué correr en Supabase

1. SQL Editor → correr **solo** `0094_school_roles_enum.sql` y ejecutar.
2. SQL Editor → en una ejecución nueva, correr `0095_school_avales_module.sql`. Si se corre antes de
   la 0094, falla con el mensaje "Falta correr 0094...".
3. Redesplegar las Edge Functions de usuarios (sin flags nuevos):
   ```
   npx supabase functions deploy admin-create-user
   npx supabase functions deploy admin-update-user
   ```
   `admin-update-user` es necesaria por seguridad (protege a los usuarios de Escuela frente a
   `jefe_cuerpo_activo`); `admin-create-user`, para poder crear usuarios con los roles nuevos desde
   "Nuevo usuario".
4. Verificar en **Storage** que existe el bucket `school-avales` y que es **privado**.
5. Asignar roles: Coordinador/Secretario de Escuela desde `/usuarios/:id`; coordinadores de
   departamento desde Escuela → Avales regionales → Departamentos (asigna el rol solo).

Verificación previa hecha en esta tanda: las migraciones 0001-0095 se reprodujeron en un Postgres 16
local con stubs de `auth`/`storage`, y se corrieron ~70 pruebas de RLS/Storage simulando cada rol de
la matriz (todas OK). Esa réplica no incluye la Storage API real ni el Dashboard, por eso el
checklist manual sigue siendo necesario.

### 53.9 Checklist manual

Preparar usuarios de prueba: uno `informatica_r4`, uno `coordinador_escuela`, uno
`secretario_escuela`, tres coordinadores de departamento (Fuego, Forestal, FASME) y uno común (por
ejemplo `presidente_cuartel`).

- [ ] Informática ve todos los departamentos y documentos.
- [ ] Informática puede cargar en todos.
- [ ] Informática puede editar metadata.
- [ ] Informática puede archivar/desarchivar y eliminar (el archivo también desaparece de Storage).
- [ ] Coordinador de Escuela ve todos los departamentos.
- [ ] Coordinador de Escuela puede cargar en todos.
- [ ] Coordinador de Escuela no ve botones de editar/archivar/eliminar.
- [ ] Secretario de Escuela ve todos los departamentos.
- [ ] Secretario de Escuela puede cargar en todos.
- [ ] Secretario de Escuela no puede eliminar.
- [ ] Coordinador de Fuego ve solo Fuego.
- [ ] Coordinador de Forestal ve solo Forestal.
- [ ] Coordinador de FASME ve solo FASME.
- [ ] Coordinador de departamento solo puede elegir su departamento al cargar.
- [ ] Coordinador de departamento no puede editar, archivar ni eliminar.
- [ ] Usuario común no ve la pestaña Avales en Escuela.
- [ ] Usuario común que entra a `/escuela/avales` ve "No tenés permiso".
- [ ] Usuario común no puede descargar por URL directa: copiar como admin una URL firmada
      vencida (más de 5 minutos) y confirmar que falla; y probar
      `<SUPABASE_URL>/storage/v1/object/public/school-avales/<ruta>` → error (bucket privado).
- [ ] RLS bloquea desde la API: con el token de un usuario común,
      `GET <SUPABASE_URL>/rest/v1/school_avales_documents?select=*` devuelve `[]`, y
      `GET <SUPABASE_URL>/rest/v1/school_departments?select=*` devuelve `[]`.
- [ ] Departamento inactivo: desactivar FASME, confirmar que su coordinador lo sigue viendo pero no
      puede cargar; reactivarlo.
- [ ] Quitar al coordinador de FASME desde Departamentos → deja de ver Avales y pierde el rol.
- [ ] Carga funciona (PDF y una imagen) y muestra nombre, tamaño, quién cargó y fecha.
- [ ] Descarga funciona y baja con el nombre original.
- [ ] Auditoría (como Informática): aparecen la carga, la edición, el archivado y la eliminación.
      Como `secretario_regional`, no aparece nada de Avales.
- [ ] `/roles` y "Nuevo usuario" muestran los roles agrupados por tipo, con descripción y alcance.
- [ ] Como `director_escuela`, "Nuevo usuario" no ofrece los roles de Avales.

### 53.10 Observación fuera de alcance

Al reproducir las migraciones en limpio, `0093_push_diagnostics_territorial_scope.sql` falla en
`get_own_push_diagnostics(integer)` con "cannot change return type of existing function": cambia el
`RETURNS TABLE` sin `drop function if exists` previo. Si en producción se aplicó con un drop manual,
no hay nada que hacer; si no, esa función quedó en su versión anterior. No se tocó (push fuera de
alcance de esta tanda).

## 54. Sistema de diseño visual (2026-10-02)

Reestructuración completa de los estilos de la interfaz. No cambia lógica, rutas, permisos, RLS,
Edge Functions ni migraciones: solo tokens, estilos globales, componentes compartidos y el marcado
visual de las pantallas. No requiere ningún paso en Supabase; alcanza con desplegar el frontend.

### 54.1 Dirección visual

**Institucional sobria.** Superficies neutras frías, un único color de acción y el rojo
institucional reservado para la marca y los avisos puntuales.

- **Color de acción: azul institucional** (`#284f86`), tomado del azul del logo SIGER4. Antes el rojo
  era a la vez color de marca, de acción y de peligro: los botones principales se confundían con
  acciones destructivas y la interfaz completa (fondo rosado, títulos en rojo) quedaba saturada.
- **Rojo institucional** como acento acotado: contador de notificaciones, pin de cuarteles en el
  mapa. Para acciones destructivas existe un rojo de "peligro" propio, usado solo ahí.
- **Neutros fríos** para fondo, superficies, bordes y texto: el contenido es lo que destaca, no el
  marco.
- **Sin decoración**: sin gradientes, sombras solo en elementos flotantes (modales, drawer, menús),
  radios moderados (4/6/8 px), tarjetas separadas por borde.

### 54.2 Tokens

Todos los colores salen de variables CSS definidas al principio de `src/styles.css`. El modo
oscuro redefine los mismos tokens (`:root[data-theme='dark']`); ningún componente tiene estilos
propios por tema.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--color-bg-app` | `#f3f5f7` | `#0e1217` | Fondo general |
| `--color-surface` | `#ffffff` | `#151a21` | Tarjetas, header, sidebar, inputs |
| `--color-surface-subtle` | `#f7f9fb` | `#1a2029` | Encabezados de tabla, zonas secundarias |
| `--color-surface-hover` / `-pressed` | `#f0f3f6` / `#e6eaef` | `#212833` / `#283140` | Hover y pulsado |
| `--color-border` / `-strong` | `#dfe3e8` / `#c3cad3` | `#28303b` / `#3a4451` | Bordes de tarjetas y botones |
| `--color-input-border` | `#8c96a3` | `#5c6775` | Borde de campos (3:1 contra la superficie) |
| `--color-text-primary` | `#18212d` | `#e4e8ee` | Texto principal |
| `--color-text-secondary` | `#4a5566` | `#b1bac6` | Texto secundario |
| `--color-text-muted` | `#667080` | `#8f99a6` | Metadatos, ayudas |
| `--color-primary` / `-hover` | `#284f86` / `#203f6c` | `#3b67a3` / `#4774b2` | Botón principal, indicadores activos |
| `--color-primary-soft` / `-soft-text` | `#e8eef6` / `#1f3f6b` | `#1c2a3d` / `#b9cfee` | Selección, ítem activo del menú |
| `--color-link` | `#284f86` | `#93b5e2` | Links y texto de acción |
| `--color-accent` / `-fill` | `#b3261e` | `#e05a52` / `#c0392b` | Rojo institucional (marca, avisos) |
| `--color-success` / `-soft` | `#1f6e45` / `#e5f3eb` | `#5fbf8a` / `#16291f` | Estado correcto |
| `--color-warning` / `-soft` | `#8a5300` / `#fcf1d9` | `#e0a84a` / `#2d2412` | Advertencia |
| `--color-danger` / `-fill` / `-soft` | `#b42318` / `#b42318` / `#fcebea` | `#ef7b72` / `#b8352c` / `#321a1a` | Errores y acciones destructivas |
| `--color-info` / `-soft` | `#245289` / `#e7f0f9` | `#93b5e2` / `#1a2635` | Información, categorías |
| `--color-focus-ring` | `#3b6fb5` | `#7fa6dc` | Foco de teclado |
| `--color-disabled-bg` | `#eef1f4` | `#1f252e` | Campos deshabilitados |

Contraste verificado: todo par texto/fondo de la tabla cumple WCAG AA (4.5:1) en ambos temas, el
blanco sobre el botón principal y sobre el botón de peligro también, y el borde de los campos
llega a 3:1. Forma: `--radius-sm` 4px, `--radius-md` 6px, `--radius-lg` 8px. Alturas de control:
36px (30px en tamaño chico), y 40px (36px) en pantallas táctiles.

### 54.3 Componentes

| Componente | Clases | Notas |
|---|---|---|
| Botones | `.btn` + `.btn-primary`, `.btn-outlined`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`, `.btn-danger-outline`; tamaños `.btn-sm`, `.btn-icon`, `.btn-icon-sm`, `.btn-block` | Una acción principal por vista. Destructivas: `.btn-danger` solo para confirmar en un modal, `.btn-danger-outline` en listados. Los `Link` con clase `.btn` ya no se subrayan. |
| Toggles y filtros | `.chip` con `aria-pressed` | Reemplaza los pares `btn-primary`/`btn-secondary` usados como selector (alcance, estado, departamento). El estado seleccionado también se anuncia a lectores de pantalla. |
| Pestañas | `.tabs` + `.tab` / `.tab.active` | Escuela: Cursos / Avales regionales. |
| Formularios | `.field`, `.field-error`, `.field-help`, `.check-row`, `.search-input` | Inputs, selects y textareas tienen estilo base aun fuera de `.field` (filtros sueltos). Foco con anillo suave; `aria-invalid` marca error. La carga de archivos se ve como una zona con botón integrado. |
| Tarjetas | `.card`, `.card-solid`, `.kpi-card`, `.row-list` + `.row-item` | Sin sombras. `.row-list` para listas de filas dentro de un panel (Panel, Usuarios, Calendario). |
| Listados | `.list-item` y derivados | Documentos, Avales, Carpetas, Notificaciones. En mobile las acciones bajan a una fila propia. |
| Tablas | `.table-wrap` + `.data-table`, `.col-actions`, `.col-nowrap` | Encabezados claros, hover sutil, scroll horizontal dentro de su contenedor en mobile. |
| Modales | `.modal-overlay` + `.modal`, `.modal-header`, `.modal-title`, `.modal-body`, `.modal-actions` | En mobile se abren como hoja inferior con botones a ancho completo. |
| Estados | `.alert` + `-danger/-success/-warning/-info`, `.empty-state`, `.loading-state`, `.skeleton`, `.spinner` | Los errores ya no se arman a mano dentro de una tarjeta; todo "Cargando…" muestra un indicador. |
| Badges | `.badge` + `-success/-warning/-danger/-info` | Siempre con texto: el color nunca es la única señal. |
| Encabezados | `.page-header`, `.page-header-actions`, `.page-title`, `.page-subtitle`, `.section-header`, `.section-title`, `.back-link` | Títulos de sección en color de texto, no en rojo. |
| Shell | `.app-header-*`, `.header-badge`, `.sidebar-*`, `.fab`, `.fab-menu` | El botón de menú y el de cerrar el drawer ya no aparecen en escritorio. El botón flotante queda por encima del pie. |

### 54.4 Cambios de marcado en pantallas

- **Panel**: el banner rojo se reemplazó por un encabezado de página con la acción "Nuevo reporte";
  los KPI muestran un esqueleto mientras cargan; las listas usan `.row-list`.
- **Detalle de cuartel**: sin foto de portada, el encabezado ya no deja un bloque vacío de 160px.
- **Auditoría**: tablas con `.data-table`; los colores de "antes/después" salen de los tokens de
  peligro/éxito; la tabla vacía ya no muestra un recuadro sin contenido.
- **Modales** (eliminar usuario, motivo, detalle de notificación): clases del sistema; confirmar la
  eliminación de un usuario usa el botón de peligro.
- **Documentos**: el menú del botón flotante usa `.fab-menu`.
- **Avales**: filtros de departamento como chips, aviso de éxito como alerta, y el texto de "solo
  desde PC" ya no se superpone con el botón en mobile.
- **Menú lateral**: "Usuarios" ya no queda marcado como activo dentro de "Nuevo Usuario".
- Textos de 11px pasaron a 12px como mínimo.
- `theme-color` del navegador y del manifiesto PWA pasaron al azul institucional.

### 54.5 Colores fijos que se mantienen

- **Reportes PDF** (`src/lib/pdf/reportBuilder.ts`): conservan su identidad visual propia
  (sección 39). Un PDF no sigue el tema de la pantalla.
- **Mapa**: los puntos de referencia usan colores categóricos fijos en ambos temas
  (`--map-ref-*`), porque se dibujan sobre teselas que siempre son claras. Se apagaron para que no
  compitan con el resto de la interfaz, manteniéndose distinguibles entre sí.
- **Blanco sobre rellenos de color** (`--color-on-primary`, `--color-on-danger`, `--color-on-accent`)
  y los velos del visor de fotos (`--color-overlay-strong`, `--color-scrim`) son tokens con valor
  fijo a propósito.

### 54.6 Reglas para estilos nuevos

1. Usar un token, nunca un hex o `rgba()` suelto en un componente o en un `style` inline.
2. Antes de escribir estilos inline, buscar si ya existe una clase (botón, chip, alerta, fila,
   tabla, modal). Inline queda para ajustes de layout puntuales (márgenes, anchos).
3. Un solo `.btn-primary` por vista; el resto `.btn-outlined` o `.btn-ghost`.
4. Selectores de opción: `.chip` con `aria-pressed`, no botones primario/secundario.
5. Errores con `.alert-danger`, cargas con `.loading-state`, vacíos con `.empty-state`.
6. Probar en claro y oscuro, en escritorio y en mobile (390px de ancho).

### 54.7 Validación

Se revisaron con capturas automatizadas, en escritorio (1366px) y mobile (390px), en tema claro y
oscuro, las pantallas de login, panel, mapa, cuarteles y detalle, escuela, avales (listado, carga,
edición, departamentos, sin permiso, error y vista de coordinador), documentos (carpetas, detalle,
carga, papelera y estado de carga), calendario y alta de evento, notificaciones, ajustes, usuarios
(listado, alta y detalle), roles, auditoría, inventario, departamentos, reportes y los formularios
de curso y personal. También el drawer mobile, los modales y el foco de teclado. Sin desbordes
horizontales de página; la tabla de Auditoría en mobile desplaza dentro de su propio contenedor.

## 55. Departamentos únicos para Avales y logo de la Escuela (2026-10-02) — migración 0096

### 55.1 Qué se corrigió

- **Departamentos duplicados.** La migración `0095` había creado `school_departments`, una lista de
  departamentos propia de Escuela, separada de `departments` (la tabla que administra la sección
  Departamentos). Fuego, Forestal, FASME o cualquier otro departamento podían existir dos veces, con
  ids distintos, y un departamento creado en un lado no aparecía en el otro.
- **Logo de Escuela.** El módulo Escuela mostraba `public/logos/logo-escuela.png`, que desde
  2026-08-20 es el sello general de SIGER4 (ver `public/logos/README.md`), no el logo de la Escuela.

### 55.2 Modelo resultante

> **Actualización:** `school_department_members`, el rol `coordinador_departamento_escuela` y la
> pantalla Coordinadores de Avales se retiraron en la sección 56: el coordinador de Avales es el de
> la sección Departamentos.

- **Fuente única:** `departments`. Crear, renombrar, desactivar o eliminar un departamento se hace
  solo en la sección Departamentos, con sus permisos de siempre.
- `school_avales_documents.department_id` → `departments(id)`, `on delete restrict`: un
  departamento con avales no se puede eliminar, sí desactivar.
- `school_department_members.department_id` → `departments(id)`, `on delete cascade`. Sigue
  siendo la asignación de Escuela: rol `coordinador_departamento_escuela` + fila activa en esta
  tabla. Es independiente de `departments.coordinator_profile_id` (coordinador del departamento en
  la sección Departamentos), que no da acceso a Avales.
- `school_departments` se eliminó, con sus policies y triggers. Las filas históricas de
  `audit_logs` con esa tabla se conservan.
- Nueva función `list_school_avales_departments()` (security invoker): devuelve los departamentos
  que el usuario ve dentro de Avales, según `can_view_school_avales_department()`.
- `can_upload_school_avales_department()` y `assign_school_department_coordinator()` ahora leen
  `departments`. Un departamento desactivado en la sección Departamentos deja de admitir cargas.

`departments` mantiene su RLS de siempre: cualquier usuario autenticado puede leer la lista de
departamentos, igual que antes. Eso no da acceso a ningún aval: qué departamentos ve cada rol dentro
de Avales, y qué documentos y archivos puede leer o cargar, sigue saliendo de los helpers y policies
de `0095`. La matriz de permisos de la sección 53.3 no cambia.

### 55.3 Migración de datos

`0096_avales_use_system_departments.sql` funciona igual si `0095` ya estaba aplicada con datos o si
se corren `0094`, `0095` y `0096` seguidas en un proyecto nuevo. Se puede volver a correr sin efecto.

- Cada fila de `school_departments` se empareja con un departamento existente por nombre, sin
  distinguir mayúsculas ni espacios en los extremos. Si hay varios, se toma el activo más antiguo.
- Sin coincidencia, se crea en `departments` conservando el mismo id, así sus avales y
  coordinadores no cambian.
- Con coincidencia, los avales y coordinadores se reasignan al id existente. No se pierde ningún
  documento ni ninguna asignación. `updated_at` de los avales no cambia, y la reasignación queda en
  auditoría.
- La ruta del archivo en Storage no cambia: los permisos salen de `department_id`, nunca de la
  ruta, así que los archivos siguen accesibles con los mismos permisos.

Fuego, Forestal y FASME quedan en `departments` una sola vez. Si alguno ya existía en la sección
Departamentos, se reutiliza ese.

### 55.4 Pantallas

- **Escuela (todas sus pantallas):** encabezado de módulo con el logo `Logo escuela.png`
  (`alt="Logo Escuela"`), el nombre de la Escuela y las pestañas Cursos / Avales regionales. El logo
  se versiona en `src/assets/Logo escuela.png`, copia exacta del original de la raíz, que sigue
  excluido de git. Se muestra a 56px (48px en mobile), en un cuadro fijo con `object-fit: contain`:
  no se recorta, no se deforma y se ve nítido en pantallas de alta densidad.
- **Avales:** los filtros listan los departamentos de la tabla única. El filtro en la URL usa el id
  del departamento (`?departamento=<id>`), que ya no tiene slug. Los departamentos inactivos solo
  aparecen si tienen avales.
- **Coordinadores de Avales** (`/escuela/avales/coordinadores`, antes `/escuela/avales/departamentos`,
  que redirige): solo asigna y quita coordinadores de Avales. Ya no crea ni edita departamentos:
  enlaza a la sección Departamentos ("Ir a Departamentos", "Nuevo departamento", "Ver en
  Departamentos").
- **Detalle de departamento:** quien ve ese departamento en Avales tiene un acceso directo a sus
  avales. Eliminar un departamento con avales muestra un mensaje claro en lugar de fallar en
  silencio.
- Textos de roles y guía `/roles`: el rol pasa a llamarse "Coordinador de departamento (Escuela)", y
  ya no se habla de departamentos "internos" separados.

### 55.5 Qué correr

1. SQL Editor → `0096_avales_use_system_departments.sql`, después de `0094` y `0095`.
2. Sin Edge Functions nuevas ni redeploy. Sin cambios en Storage.
3. Desplegar el frontend.

### 55.6 Verificación

Se reprodujeron las migraciones en un Postgres 16 local con stubs de `auth`/`storage`:

- **Proyecto con `0095` aplicada y datos:** un "Forestal" previo en Departamentos, un departamento
  creado solo en Escuela, coordinadores y avales con archivo. 20 verificaciones de datos: sin
  duplicados, Forestal fusionado con el existente, los demás con su id original, avales y
  coordinadores conservados, `storage_path` y `updated_at` sin cambios. Segunda corrida sin efecto.
- **Proyecto nuevo** (`0094` → `0095` → `0096`): quedan Fuego, Forestal y FASME en `departments`.
- **Matriz de permisos sobre la base unificada**, 40 pruebas en total:
  - Informática y Coordinador/Secretario de Escuela ven todos los departamentos en Avales.
  - Los coordinadores de Fuego, Forestal y FASME ven solo el suyo.
  - El usuario común y anon no ven nada, ni con la ruta exacta del archivo.
  - Un departamento creado en Departamentos aparece en Avales.
  - Un departamento desactivado no admite cargas.
  - Un departamento con avales no se puede eliminar.
  - La auditoría de Avales no es visible para `secretario_regional`.

Checklist manual:

- [ ] Crear un departamento en Departamentos → aparece en Avales (Informática/Coordinador de
      Escuela) y en Coordinadores de Avales.
- [ ] "Nuevo departamento" desde Coordinadores de Avales abre el alta de la sección Departamentos.
- [ ] En Departamentos, Fuego/Forestal/FASME figuran una sola vez.
- [ ] Coordinador de Fuego / Forestal / FASME ve solo su departamento en Avales.
- [ ] Coordinador y Secretario de Escuela ven todos; Informática ve y administra todos.
- [ ] Usuario común no ve la pestaña Avales ni accede por URL o API.
- [ ] Desactivar un departamento en Departamentos → en Avales se consulta pero no admite cargas.
- [ ] Intentar eliminar un departamento con avales → mensaje claro, no se elimina.
- [ ] El logo de la Escuela se ve en Cursos, Avales, Cargar aval y Coordinadores, en claro y oscuro,
      escritorio y mobile.

## 56. Coordinador único desde Departamentos, Auditoría solo para informatica_r4 y carga desde el celular (2026-10-02) — migración 0097

### 56.1 Causa del error al asignar coordinadores desde Escuela

- **Dos fuentes para el mismo dato.** Desde `0095`, para que alguien fuera coordinador de un
  departamento en Avales hacían falta dos asignaciones de Escuela: el rol
  `coordinador_departamento_escuela` y una fila en `school_department_members`. Eran independientes
  de `departments.coordinator_profile_id`, el coordinador que muestra y edita la sección
  Departamentos. Por eso quien ya era coordinador en Departamentos no aparecía en Avales y había que
  "asignarlo de nuevo" desde Escuela → Coordinadores.
- **Error al asignar.** `0096` cambió los ids de departamento de `school_departments` a
  `departments`. Si el frontend de `0096` se publica antes de correr esa migración, la pantalla manda
  ids de `departments` a la versión de `0095` de `assign_school_department_coordinator()`. Esa
  versión los busca en `school_departments` y responde "El departamento indicado no existe.". Además,
  `list_school_avales_departments()` todavía no existe (PostgREST `PGRST202`), y la pantalla mostraba
  un error genérico.

Las dos cosas se resuelven eliminando la segunda fuente: ya no hay nada que asignar desde Escuela.
`errors.ts` ahora traduce `PGRST202`/`PGRST205`/`42883`/`42P01` a "Esta función necesita una
actualización de la base de datos que todavía no se aplicó", en vez de un error genérico.

### 56.2 Modelo resultante

- **Fuente única del coordinador:** `departments.coordinator_profile_id`, el mismo campo de la
  sección Departamentos. Quien figura ahí ve y carga los avales de ese departamento, sin rol ni
  asignación extra.
- `is_school_department_coordinator(department_id)` lee solo ese campo. `can_view_school_avales_department()`
  y `can_upload_school_avales_department()` no cambian de firma: siguen usando
  `is_school_department_coordinator()`, y por eso pasan a reconocer al coordinador de Departamentos.
  Las policies de `school_avales_documents` y de Storage (`school-avales`) no se tocaron.
- `school_department_members`: los coordinadores activos pasan a `departments.coordinator_profile_id`
  (ver 56.3) y la tabla se elimina junto con `assign_school_department_coordinator()`,
  `remove_school_department_coordinator()` y `my_school_department_ids()`.
- Rol `coordinador_departamento_escuela`: se borran todas sus asignaciones (`user_roles`) y deja de
  ofrecerse en la app. Figura como "rol retirado" solo si algún usuario lo conservara. El valor
  sigue en el enum `role_key`, porque Postgres no permite quitarlo sin recrear el tipo, pero ninguna
  función ni policy lo consulta.
- `school_departments` ya se había eliminado en `0096`.
- `list_school_avales_departments()` devuelve además `coordinator_profile_id`, `coordinator_name` e
  `is_my_department`. Es SECURITY DEFINER solo para poder leer el nombre del coordinador. El filtro
  de visibilidad sigue siendo `can_view_school_avales_department()`, y no tiene grant a `anon`.
- **departments, alta y baja solo para Informática.** La policy `for all` de `0042` dejaba que
  cualquier usuario creara un departamento nombrándose coordinador. Ahora eso le daría acceso a
  Avales, así que:
  - `insert` y `delete` quedan para `is_informatica_r4()`;
  - `update` queda para Informática o el coordinador, que no puede cambiar el coordinador (`with check`).
- **Nombres únicos:** índice `departments_name_unique_idx` sobre `lower(btrim(name))`. Si al correr
  `0097` ya hubiera nombres repetidos, el índice no se crea y la migración avisa cuáles son
  (WARNING). Hay que unificarlos a mano y volver a correrla. Las pantallas de alta y edición avisan
  antes de guardar.

La matriz de Avales no cambia:

| Quién | Ve | Carga |
|---|---|---|
| informatica_r4 / integrante_informatica | Todos los departamentos | Todos (editar, archivar y eliminar: solo informatica_r4) |
| coordinador_escuela / secretario_escuela | Todos los departamentos | Todos |
| Coordinador de un departamento (sección Departamentos) | Solo el suyo | Solo el suyo |
| Resto | Nada (ni por URL ni por API) | Nada |

### 56.3 Migración de datos (0097)

- Por cada departamento **sin** coordinador en Departamentos, el coordinador activo que tenía en
  Escuela pasa a ser su coordinador.
- Si el departamento **ya tenía** otro coordinador en Departamentos, manda Departamentos. La
  asignación de Escuela se descarta y su borrado queda en `audit_logs`. La migración informa cuántas
  asignaciones movió y cuántas descartó (NOTICE).
- `delete from school_department_members` corre antes del `drop table` para que cada fila quede
  auditada.
- El borrado del rol retirado suspende `trg_protect_super_admin_user_roles` solo durante ese
  `delete`, porque en una migración no hay sesión de usuario. Después lo vuelve a activar.
- Requiere `0096`: si falta, la migración se detiene con un mensaje claro. Se puede correr de nuevo
  sin efecto y funciona en un proyecto nuevo (`0094` → `0097` seguidas).

### 56.4 Auditoría: solo informatica_r4

- **Base:** se eliminan todas las policies de lectura de `audit_logs`, tanto las regionales, de
  subsede, de cuartel y de Escuela como la de `integrante_informatica`. Queda solo
  `audit_logs_select_super_admin` (`using (is_super_admin())`) y se revoca todo a `anon`. Con eso,
  una consulta directa a la API desde cualquier otro rol devuelve 0 filas. La escritura no cambia:
  sigue entrando por los triggers SECURITY DEFINER y `record_manual_audit_event()`.
- **Frontend:**
  - `/auditoria` usa `SuperAdminRoute`. Por URL directa, cualquier otro rol ve "No tenés acceso a
    esta sección" con un botón para volver al inicio. Antes se redirigía sin explicación.
  - El menú muestra Auditoría solo a informatica_r4.
  - El Panel muestra "Actividad reciente" solo a informatica_r4.
  - `AuditoriaPage` ya no recorta por rol ni por módulo.
- `send_weekly_admin_summary()` (cron, SECURITY DEFINER, sin grant a usuarios) sigue contando altas y
  bajas de usuarios desde `audit_logs` para el resumen semanal de Informática. Son solo totales, no
  da acceso a los registros.
- Guías: `/roles` y la matriz 31.4 dicen "Único rol con acceso a Auditoría" para informatica_r4.

### 56.5 Protección de coordinadores frente a jefe_cuerpo_activo

Antes, `admin-update-user` impedía que un `jefe_cuerpo_activo` editara a un usuario con el rol
`coordinador_departamento_escuela`. Esa protección evitaba, por ejemplo, que reseteara su
contraseña y entrara a los avales con esa cuenta. Como el rol ya no existe, la Edge Function ahora
consulta `departments.coordinator_profile_id`: quien coordina un departamento solo lo edita
Informática. `UsuarioDetallePage` aplica el mismo bloqueo en pantalla. **Requiere redeploy de
`admin-update-user`.**

### 56.6 Carga de archivos desde el celular (revierte la sección 21)

La pausa de la sección 21 se levanta: Avales, Documentos y las fotos de perfil y de cuartel se
pueden subir desde el celular.

- La causa principal que motivó la pausa ya estaba corregida: la recarga automática del service
  worker mientras el selector nativo estaba abierto (sección 19 y `vite.config.ts`, `registerType:
  'prompt'`).
- Un componente nuevo, `FilePicker`, se usa en Subir aval y Subir documento:
  - el `<input type="file">` es nativo y se abre desde un `<label>`, sin `click()` programático;
  - "Elegir archivo" usa `accept` con los MIME y extensiones admitidos;
  - "Sacar foto" usa `accept="image/*"` y `capture="environment"`, y solo aparece en pantallas
    táctiles;
  - valida tipo, tamaño y archivo vacío apenas se elige, con mensajes concretos ("pesa 21 MB y el
    máximo es 20 MB", "no es un formato admitido", HEIC con instrucciones);
  - muestra los estados: sin archivo, listo para subir, subiendo y error.
- **Si Android recarga la página** mientras el selector está abierto (falta de memoria en algunos
  equipos), el formulario se recupera solo:
  - un borrador en `sessionStorage` (`useSessionDraft`) conserva título, descripción y demás campos;
  - aparece el aviso "El celular recargó la página mientras elegías el archivo. Elegilo de nuevo
    para continuar.".
- **Fotos de perfil y de cuartel** (`ImagePicker`): misma validación inmediata. Los formatos que
  muestra salen de los tipos admitidos de cada uso; el logo de cuartel acepta además SVG.
- **Errores de Storage traducidos:** "No tenés permiso para subir o ver este archivo", "Ese tipo de
  archivo no se admite", "El archivo supera el tamaño máximo" y "No hay conexión con el servidor".
- Storage y RLS no cambiaron: siguen los mismos buckets, límites, `allowed_mime_types` y policies.
- `src/lib/device.ts` (`isMobileUserAgent`) se eliminó y ya no se usa en ningún lado.

Tipos probados desde Android/Chrome (emulado):

| Caso | Resultado |
|---|---|
| PDF desde el selector de archivos | Sube y vuelve al listado con aviso |
| JPG desde la cámara | Igual |
| ZIP (tipo no admitido) | Se rechaza al elegirlo |
| PDF de 21 MB (máximo 20 MB) | Se rechaza al elegirlo |
| Archivo de 0 bytes | Se rechaza al elegirlo |
| HEIC en Avales y Documentos | Se admite (está en `allowed_mime_types` de ambos buckets) |
| Enviar sin archivo | Error que indica qué tocar |
| "Quitar" el archivo elegido | Vuelve a "Todavía no elegiste un archivo" |
| Foto de perfil HEIC o de 6 MB | Se rechaza con instrucciones |
| Logo de cuartel SVG | Se admite |

### 56.7 Cambios de pantallas y textos

- **Escuela / Avales:**
  - ya no existe la pantalla Coordinadores: `/escuela/avales/coordinadores` y
    `/escuela/avales/departamentos` redirigen a Avales;
  - cada departamento muestra su coordinador real ("Coordinador: X (vos)");
  - Informática tiene el botón "Departamentos y coordinadores", que lleva a la sección Departamentos;
  - el botón "Subir aval" se muestra también en mobile;
  - Subir aval tiene este orden: departamento (con su coordinador), archivo, título (se completa con
    el nombre del archivo), descripción y observaciones.
- **Departamentos:**
  - título y subtítulo explican que es la única lista y que la usa Avales;
  - Informática tiene el botón "Nuevo departamento";
  - aparecen "Sin coordinador" y la marca "Tu departamento";
  - el estado vacío ofrece "Crear el primer departamento";
  - hay avisos de éxito al crear, guardar y eliminar;
  - el campo Coordinador tiene ayuda ("Es la única asignación necesaria: no hace falta darle ningún
    rol");
  - quien no tiene permiso ve una explicación en lugar de un formulario.
- **Usuarios:**
  - la ficha muestra "Departamentos que coordina", con enlace a cada uno, y el aviso "Datos
    guardados";
  - Nuevo usuario tiene cuatro secciones (Datos de la persona, Acceso, Ubicación y alcance, Roles),
    ayuda en cada una y errores que dicen en qué paso está el problema.
- **Documentos:**
  - el archivo va primero;
  - el botón dice "Subir documento" / "Subiendo archivo…";
  - al volver a la carpeta aparece "se subió correctamente";
  - la carpeta vacía ofrece "Subir el primer documento".
- **Accesos denegados:**
  - Auditoría, Reportes, Usuarios, Nuevo usuario, Avales, Nuevo departamento y Subir documento
    explican quién tiene acceso y ofrecen volver, en vez de redirigir o mostrar una página en
    blanco;
  - `GuardedRoute`, `SuperAdminRoute` y `AccessDenied` son componentes reutilizables.
- **Menú lateral:** se agrupa en Gestión, Administración y Cuenta. La Administración se muestra
  solo si hay algo para administrar.
- **Avisos de éxito tras navegar:** `useNavigationNotice` y `SuccessNotice` se reutilizan en Avales,
  Carpetas y Departamentos.
- **`/roles`:** se agrega una sección Departamentos con la explicación de la función de coordinador
  y la lista de departamentos con su coordinador (para quien tiene acceso a Avales).

### 56.8 Qué correr

1. SQL Editor → `0097_avales_coordinator_from_departments_and_audit_super_admin.sql`, después de
   `0096`. Revisar los NOTICE/WARNING: cuántas asignaciones se movieron o descartaron, y si quedaron
   nombres de departamento repetidos.
2. `supabase functions deploy admin-update-user`.
3. Desplegar el frontend **después** del paso 1: el frontend nuevo espera las columnas nuevas de
   `list_school_avales_departments()`. Si se publica antes, Avales muestra "Esta función necesita
   una actualización de la base de datos…".

Sin cambios en Storage, en push/PWA ni en las demás Edge Functions.

### 56.9 Verificación

Postgres 16 local con stubs de `auth`/`storage`, sobre la base de la sección 55 con datos sembrados,
con 38 pruebas en total:

- **Datos:**
  - Fuego y FASME pasan de Escuela a Departamentos;
  - Forestal conserva el coordinador que ya tenía en Departamentos;
  - no queda nadie con el rol retirado;
  - el descarte queda en auditoría.
- **Avales:**
  - el coordinador de Forestal en Departamentos, sin ningún rol de Escuela, ve y carga solo Forestal,
    incluido su archivo en Storage;
  - cambiar el coordinador en Departamentos le quita el acceso al anterior y se lo da al nuevo;
  - Coordinador y Secretario de Escuela ven todos;
  - el usuario común no ve nada.
- **Departamentos:**
  - un usuario común no puede crear un departamento nombrándose coordinador;
  - el coordinador no puede cederlo;
  - `integrante_informatica` sí crea, y lo creado aparece en Avales;
  - "  FUEGO " se rechaza por repetido.
- **Auditoría:**
  - informatica_r4 la ve;
  - `integrante_informatica`, `secretario_regional`, Coordinador y Secretario de Escuela, un
    coordinador de departamento, un jefe y un usuario común ven 0 filas;
  - `anon` recibe "permission denied".
- **Corridas de la migración:**
  - la segunda corrida no tiene efecto;
  - en un proyecto nuevo funciona;
  - con nombres repetidos avisa y no falla.

Capturas automáticas (escritorio 1366 px y mobile 390 px, claro y oscuro, backend simulado):
168 pantallas, sin errores de página ni scroll horizontal. La carga desde mobile se probó con los
casos de 56.6.

Checklist manual:

- [ ] Asignar un coordinador a Fuego en Departamentos → ese usuario ve Escuela → Avales → Fuego y
      puede subir un aval, sin ningún paso más.
- [ ] Cambiar el coordinador de Fuego → el anterior deja de ver Avales.
- [ ] Coordinador y Secretario de Escuela ven y cargan en todos; Informática ve y administra todos.
- [ ] Usuario común: sin pestaña Avales; por URL ve el mensaje de acceso denegado.
- [ ] Crear "fuego" en Departamentos con "Fuego" existente → aviso de repetido.
- [ ] `/auditoria` con integrante_informatica, secretario_regional, Escuela, coordinador, jefe y
      usuario común → "No tenés acceso a esta sección"; sin ítem en el menú.
- [ ] Jefe de Cuerpo Activo no puede editar a un usuario de su cuartel que coordina un departamento.
- [ ] Desde un Android real (Chrome y, si se usa, el navegador de Xiaomi): subir un aval en PDF,
      otro sacando una foto, y un documento; elegir un archivo de más de 20 MB → mensaje claro.
- [ ] Foto de perfil desde el celular (galería y cámara).
- [ ] Logo de la Escuela en Cursos, Avales y Subir aval, en claro y oscuro, escritorio y mobile.

### 56.10 Riesgos y pendientes

- **Android real.** La carga se probó en Chrome con emulación de Android (input nativo, `capture`,
  validaciones y envío completo), no en un equipo físico. Antes de anunciarlo hay que hacer la
  prueba del checklist en un Android real, sobre todo en Xiaomi/MIUI (sección 21.1). Si se repitiera
  la pérdida de archivo, ahora queda a la vista: el aviso de recarga y el borrador recuperado.
- **Orden de despliegue:** primero `0097`, después el frontend (56.8).
- **Nombres repetidos previos:** si `0097` avisa repetidos, el índice único no existe hasta
  unificarlos y volver a correrla.
- El valor `coordinador_departamento_escuela` sigue en el enum `role_key` (sin uso).

## 57. Informes y actas en Departamentos, "Regional", Inicio por rol, header, login y seguridad del repositorio (2026-10-03) — migración 0098

### 57.1 Informes y actas en Departamentos

Hasta acá un departamento solo podía **registrar actividad** (`department_activity_reports`, 0061):
tipo, fecha, horas y asistentes, para estadísticas. Eso deja constancia de que hubo una reunión, pero
no guarda el acta ni el respaldo. Ahora cada departamento tiene además **informes y actas**:

- **Redactar informe:** el texto se escribe en SIGER4. Se le pueden sumar fotos, videos o archivos.
- **Cargar informe o acta:** se sube el documento que ya existe (PDF, Word, Excel o una foto del
  papel), con fotos o videos de respaldo y un resumen opcional.
- Cada informe tiene tipo, título, fecha del informe o de la actividad, texto, observaciones,
  autor, adjuntos, archivado y fechas de alta y edición. Los tipos son: Acta de reunión, Informe
  operativo, Informe administrativo, Registro fotográfico, Documentación adjunta y Otro.

**Dónde está:**

| Pantalla | Qué hay |
|---|---|
| Departamentos | Botón **Nuevo informe** (Cargar informe o acta / Redactar informe) y "Últimos informes" de los departamentos que el usuario puede ver |
| Detalle de un departamento | Botón **Nuevo** (Cargar informe o acta / Redactar informe / Registrar actividad) y la sección **Informes y actas**, primera en la página, con filtro por tipo y "Mostrar archivados" |
| Detalle de un informe (`/departamentos/informes/:id`) | Texto, observaciones, documentos (Ver / Descargar con el nombre original), fotos en miniatura, videos con reproductor; Editar, Archivar y Eliminar según permiso |
| Formulario (`/departamentos/informes/nuevo?modo=cargar\|redactar`) | Se puede pasar de un modo al otro sin perder lo escrito. Si queda un solo departamento posible, viene elegido |
| Inicio | Acceso rápido "Cargar informe" para quien puede cargar |

El registro de actividad sigue igual y pasa a llamarse **Registrar actividad** en todas las
pantallas, para no confundirlo con los informes.

**Archivos** (bucket privado `department-reports`, ruta
`<department_id>/<report_id>/<file_id>/<nombre-sanitizado>`):

| Tipo | Formatos | Máximo |
|---|---|---|
| Documentos | PDF, Word (doc/docx), Excel (xls/xlsx) | 20 MB |
| Fotos | JPG, PNG, WEBP, HEIC/HEIF | 20 MB |
| Videos | MP4, MOV, WEBM, 3GP | 50 MB |

- Hasta 10 archivos por informe.
- El tipo y el tamaño se validan al elegir el archivo y de nuevo en el bucket (`allowed_mime_types` y
  `file_size_limit`). El tamaño y el MIME reales los toma la base de la metadata de Storage.
- La descarga usa una URL firmada de 10 minutos con el nombre original del archivo.
- 50 MB es también el límite de subida por defecto de un proyecto Supabase. Si se baja en Project
  Settings → Storage, hay que bajar `DEPARTMENT_REPORT_VIDEO_MAX_BYTES` (`src/lib/api/storage.ts`) y
  el `file_size_limit` del bucket.

**Desde el celular:**

- "Elegir archivos" (varios a la vez), "Sacar foto" (cámara trasera) y "Grabar video" (los dos
  últimos solo en pantallas táctiles), con inputs nativos activados por `<label>`.
- **Progreso real:** cada archivo se sube con `XMLHttpRequest` al mismo endpoint de Storage que
  usa supabase-js, porque `fetch` no informa progreso. La pantalla muestra el porcentaje total, el
  estado de cada archivo y "Subiendo archivos (2 de 3)".
- Si Android recarga la página con el selector abierto, se recuperan los textos escritos y se avisa
  que hay que volver a elegir los archivos.
- **Si falla una parte:**
  - si un archivo no sube, el informe se guarda igual y el detalle avisa cuáles faltan, para
    agregarlos desde Editar;
  - si en "Cargar" no sube ninguno y no hay texto, el informe se descarta y el formulario queda para
    reintentar.

**Permisos** (RLS + policies de Storage; la pantalla solo refleja lo mismo):

| Quién | Ver y descargar | Cargar | Editar, archivar, adjuntos | Eliminar |
|---|---|---|---|---|
| informatica_r4 | Todos | Todos (activos) | Todos | Todos |
| integrante_informatica | Todos | Todos (activos) | Todos | Solo los propios |
| Coordinador del departamento | Su departamento | Su departamento | Su departamento | Solo los propios |
| Integrante con cuenta (`department_members`) | Su departamento | Su departamento | Solo los propios | Solo los propios |
| Resto (incluido secretario_regional) | Nada (ni URL, ni API, ni Storage) | — | — | — |

Decisiones de mínimo permiso:

- **secretario_regional** no ve informes por su rol, aunque sí sigue registrando actividad en
  cualquier departamento (0061). Los informes pueden tener actas, nombres y fotos de personas. Si
  tiene que verlos, el coordinador lo suma como integrante del departamento.
- **El coordinador archiva, no elimina,** los informes ajenos. Eliminar es de quien lo cargó o de
  informatica_r4.
- Un **departamento inactivo** se consulta, pero no admite informes nuevos.
- Un **departamento con informes** no se puede eliminar (`on delete restrict`, igual que con avales),
  y la pantalla lo explica.
- Por URL directa sin permiso, el detalle muestra "No encontramos el informe" y explica quién tiene
  acceso. La base no devuelve el informe, ni sus adjuntos, ni los archivos.

**Otros detalles:**

- Auditoría: `department_reports` y `department_report_files` quedan auditadas. Solo las lee
  informatica_r4 (0097).
- **CSP:** se agregó `media-src 'self' blob: https://*.supabase.co` en `vercel.json`. Sin eso, el
  navegador bloqueaba en producción la reproducción de videos con URL firmada de Storage. Las fotos
  ya estaban permitidas por `img-src`.

### 57.2 "Regional" en lugar de "Región"

El nivel institucional se llama **Regional**. Se corrigieron todos los textos visibles:

- etiquetas "Regional" en los formularios de cuartel, curso, inventario, usuario, alcance, mapa y
  auditoría;
- "Seleccionar Regional" en carpetas, documentos, eventos, notificaciones e inventario;
- errores ("Elegí la Regional destino");
- la guía de roles: categoría "Regional", nivel de alcance "Regional", "Su Regional",
  "todas las Regionales";
- Reportes, Mapa Regional, Ajustes y el texto del PDF consolidado.

Los nombres técnicos (`region_id`, `scope_type = 'region'`, tablas) no cambian. Donde "regional" es
adjetivo ("departamentos regionales", "Escuela Regional") se dejó como estaba.

### 57.3 Inicio (pantalla al ingresar)

El Panel pasa a ser **Inicio**, ordenado por lo que necesita cada rol:

1. **Saludo**, fecha y los roles del usuario, incluido "Coordinador de Fuego" si coordina un
   departamento.
2. **Requiere atención:** los pendientes por rol de siempre (0075). Si no hay, dice "Todo al día".
3. **Accesos rápidos según el rol:**
   - Avales regionales y Cargar informe, si tiene acceso;
   - Subir documento, si puede cargar, o Documentos, si no;
   - Calendario y Notificaciones, con el número de no leídas;
   - Generar reporte, Usuarios y Cuarteles, según permiso.
4. **Notificaciones sin leer:** las últimas 3.
5. **Hoy, Próximos eventos y Vencimientos próximos.**
6. **Estado de la Regional** (cuarteles, asistencia, intervenciones, cursos, vehículos y carga por
   cuartel), solo para roles con alcance territorial: Informática, Secretario Regional, Director de
   Escuela, roles de cuartel e invitado. Para Escuela o la coordinación de un departamento era
   ruido.
7. **Actividad reciente,** solo para informatica_r4.

En el menú, "Panel" pasa a llamarse "Inicio". La ruta `/panel` no cambia.

### 57.4 Header

- El logo del header y el de la barra lateral llevan al **Inicio** (`aria-label="Ir al inicio"`).
- La foto o avatar, en el header y en la barra lateral, lleva directo a **Mi perfil y ajustes**
  (`aria-label="Ir a mi perfil"`). No había menú de usuario que romper. "Cerrar sesión" sigue en la
  barra lateral.
- Son enlaces reales: funcionan con mouse, touch y teclado (Tab + Enter), con foco visible.

### 57.5 Login, gestor de contraseñas y passkeys

**Login:**

- Botón para ver u ocultar la contraseña (`aria-pressed`) y aviso de Bloq Mayús.
- `autocomplete="username"` y `"current-password"`, con `name` en ambos campos, para que el gestor
  del navegador detecte, guarde y complete el acceso.
- Opción "Recordar mi email en este dispositivo": guarda **solo el email** en `localStorage`
  (`siger4:remembered-email`). Se puede desmarcar.
- Errores claros: email o contraseña incorrectos, demasiados intentos, cuenta desactivada, sin
  conexión.
- Texto de ayuda para quien olvidó la contraseña (la restablece Informática).

**Contraseñas:** la app **no guarda contraseñas en ningún lado**: ni localStorage, ni sessionStorage,
ni IndexedDB, ni la base. Después de ingresar se ofrece guardar el acceso en el gestor del navegador
(Credential Management API, `navigator.credentials.store`). Lo guarda y cifra el navegador, con
confirmación del usuario. En el celular, ese gestor completa la contraseña con huella o rostro: es
la vía de "biometría" disponible hoy, sin configuración adicional.

**Passkeys:** implementadas, pero **apagadas por defecto**. Supabase Auth (`@supabase/supabase-js`
2.110) trae `signInWithPasskey()` y `registerPasskey()` como **función experimental**. Con
`VITE_PASSKEYS_ENABLED=true`:

- el login muestra "Ingresar con huella, rostro o PIN";
- Mi perfil y ajustes muestra "Ingreso con huella o rostro", para registrar el dispositivo y quitar
  dispositivos registrados.

Es WebAuthn estándar: la clave privada queda en el dispositivo y el servidor guarda solo la clave
pública. Antes de activarlas hace falta:

1. Habilitar passkeys en el proyecto de Supabase Auth (función experimental: depende de que el
   proyecto la ofrezca).
2. Configurar el dominio de producción como Site URL / URL permitida, para que el Relying Party de
   WebAuthn coincida con el dominio donde corre SIGER4.
3. Poner `VITE_PASSKEYS_ENABLED=true` en Vercel y redesplegar.
4. Probar el alta desde Ajustes y el ingreso, en Android, iPhone y escritorio.

Si el servidor no lo soporta, el login muestra un mensaje claro y sigue el ingreso con contraseña.
No se probó contra un servidor real, porque requiere el paso 1.

### 57.6 Seguridad del repositorio público

Se revisaron los 263 archivos versionados y el historial completo: 278 commits, con las
diferencias de cada uno.

**Sin secretos.** No se encontraron:

- claves privadas (PEM/SSH);
- tokens JWT (ni `service_role` ni anon);
- claves de API de terceros;
- `VAPID_PRIVATE_KEY`, `CRON_SHARED_SECRET`, `JWT_SECRET` ni `SUPABASE_SERVICE_ROLE_KEY` con
  valores reales. Los valores de `CRON_SHARED_SECRET` en este documento son de ejemplo.

`.env` nunca se versionó; `.env.example` solo tiene valores de ejemplo. Las Edge Functions leen
todos sus secretos con `Deno.env.get`.

**No hay secretos que rotar.**

**Público por diseño:**

- **URL del proyecto Supabase,** en las secciones 33 y 50 y en `0073`, donde se inserta como dato funcional. Viaja
  en cada bundle del frontend igual que la anon key, y la seguridad depende de RLS, no de ocultarla.
- **Email institucional** del Dpto. de Informática como `VAPID_SUBJECT` de push.

**Datos personales en el historial:** el email personal del desarrollador figura en commits viejos
(scripts SQL de 2026-07, limpiados después) y como autor de los commits. No es un secreto. Para no
seguir publicándolo, se puede usar el email `noreply` de GitHub como autor de los próximos commits.
No se reescribió el historial.

**Cambios:**

- `.gitignore` ignora toda variante `.env.*` (salvo `.env.example`), archivos de claves (`*.pem`,
  `*.key`, `*.p8`, `*.p12`, `*.pfx`), `.vercel` y `supabase/.branches`.
- La configuración local del editor se excluye en `.git/info/exclude` de cada clon (no se versiona).
- `.env.example` suma `VITE_PASSKEYS_ENABLED=false`.

**Recomendado:** activar en GitHub *Secret scanning* y *Push protection* (Settings → Code security),
para que un secreto subido por error se bloquee o avise al instante.

### 57.7 Otras mejoras de UX

- **Botones flotantes:** "Nuevo evento", "Nuevo usuario", "Nuevo curso", "Nuevo cuartel",
  "Nuevo elemento", "Nueva notificación" y "Subir documento" muestran su texto en escritorio. En el
  celular siguen redondos, solo con el ícono.
- **Títulos más directos:** "Usuarios", "Cuarteles" y "Reportes", con subtítulos que dicen qué se
  puede hacer.
- **Estados vacíos con acción:** Calendario ("Cargar un evento"), Escuela ("Cargar el primer
  curso"), informes, Notificaciones y búsquedas sin resultado.
- **Registrar actividad:** acceso denegado explicado y aviso al guardar.
- **Detalle de departamento:** acceso denegado explicado; el mensaje al intentar eliminar uno con
  avales o informes lo dice.
- **Avisos tras navegar:** pueden ser de éxito o de resultado parcial (`noticeTone`).

### 57.8 Qué correr

1. SQL Editor → `0098_department_reports.sql`, después de `0097`. Crea las tablas, los helpers, el
   bucket `department-reports` y sus policies. Se puede correr de nuevo sin efecto.
2. Desplegar el frontend. Incluye `vercel.json` con el nuevo `media-src`.
3. Opcional: passkeys (57.5). Por defecto quedan apagadas y no hace falta configurar ninguna
   variable nueva.

Sin cambios en Edge Functions, push ni PWA.

### 57.9 Verificación

- **0098 en Postgres 16 local** (stubs de `auth` y `storage`), sobre la base de 0097 con datos:
  42 pruebas, 0 fallas.
  - El coordinador carga en su departamento y no en otro, y el autor lo fija la base.
  - Los adjuntos toman tamaño, MIME y tipo reales. Se rechazan rutas con otro departamento, una
    carpeta de adjunto ya usada o un id que no coincide.
  - El integrante ve, lee archivos y carga, pero no edita ni borra lo ajeno.
  - No ven nada ni leen archivos con la ruta exacta: usuario común, coordinador de otro
    departamento, secretario_regional y Coordinador de Escuela.
  - Informática ve todo. integrante_informatica carga, pero no elimina lo ajeno.
  - El coordinador archiva, pero no elimina lo ajeno; no se puede mover un informe de
    departamento; el autor elimina el suyo.
  - Al dejar de ser integrante se pierde el acceso. Un departamento con informes no se elimina.
  - anon no tiene acceso y todo queda auditado.
  - La segunda corrida no tiene efecto y funciona en un proyecto nuevo.
- **Flujos en navegador** (Chrome; Android emulado y escritorio; backend simulado): 33 pruebas, 0
  fallas.
  - Informe solo texto, acta PDF con foto de cámara, tres fotos (una HEIC) y Word con video, con
    progreso visible.
  - Validaciones de archivo faltante, tipo no admitido, PDF de 21 MB, video de 51 MB, archivo vacío
    y título faltante.
  - Header con logo, foto y teclado.
  - Login: ver y ocultar contraseña, autocomplete, email recordado, contraseña incorrecta, y
    verificación de que la contraseña no queda en el almacenamiento del navegador.
- **Capturas:** escritorio y mobile, claro y oscuro, incluidos los Inicio de Informática, Escuela,
  coordinador de departamento, jefe y usuario común.

Checklist manual:

- [ ] Correr `0098` y confirmar que el bucket `department-reports` es privado.
- [ ] Coordinador: Nuevo → Cargar informe o acta → PDF desde el celular → aparece en "Informes y
      actas" y se descarga con su nombre.
- [ ] Redactar un informe de texto con dos fotos sacadas con la cámara.
- [ ] Subir un video corto y reproducirlo en el detalle, en producción (confirma el `media-src`).
- [ ] Usuario común: en el departamento ve el aviso de acceso; por URL a un informe ve "No
      encontramos el informe".
- [ ] Integrante con cuenta: ve y carga; no elimina informes ajenos.
- [ ] Informática ve los informes de todos los departamentos.
- [ ] Inicio con cada rol: accesos que correspondan y "Estado de la Regional" solo para roles
      territoriales.
- [ ] Logo → Inicio; foto → Mi perfil; en celular y con teclado.
- [ ] Login en celular: ver contraseña, el navegador ofrece guardarla, "Recordar mi email".
- [ ] Textos: ninguna pantalla dice "Región" para el nivel institucional.

### 57.10 Riesgos y pendientes

- **Carga en Android físico:** se probó con emulación de Chrome Android, no en un equipo real.
  Mismo pendiente que en 56.10, ahora también para fotos y videos.
- **Videos grandes con conexión lenta:** la subida no se reanuda si se corta, hay que reintentar el
  archivo. Para videos de más de 50 MB haría falta subida resumible (TUS) y un plan de Supabase que
  la admita.
- **HEIC:** se sube y descarga bien, pero la mayoría de los navegadores fuera de Safari no muestran
  la miniatura (se ve un ícono con el nombre).
- **Passkeys:** listas pero apagadas, hasta habilitarlas y probarlas en el proyecto (57.5).
- **Rol de Secretario Regional sobre los informes:** si institucionalmente tiene que ver todos los
  informes, se puede sumar `is_regional_role()` a `can_view_department_reports()` en una migración
  nueva.

## 58. Préstamos de Inventario, versión y Novedades, identidad azul y refuerzo de funciones internas (2026-10-03) — versión 1.4.0, migraciones 0099-0100

### 58.1 Inventario: por qué no se podía solicitar ningún elemento

La base sí permitía las solicitudes. Se reprodujo en Postgres con cada rol: los roles de cuartel
solicitan para su cuartel, Informática y el Secretario Regional para cualquier cuartel, y Escuela
queda bloqueada. El problema estaba en la pantalla, en tres puntos:

1. **Cuentas sin cuartel propio.** `SolicitudPrestamoFormPage` armaba el cuartel solicitante
   solo con `profile.station_id` o un alcance de cuartel. Informática y el Secretario Regional no
   tienen cuartel propio y veían "Tu perfil no tiene un cuartel asignado" en **todos** los
   elementos. La policy de 0057 los habilita a solicitar en nombre de un cuartel, pero la pantalla
   nunca ofrecía elegirlo.
2. **Errores de la base ocultos.** Ver 58.2: cualquier rechazo, por ejemplo "El elemento no está
   disponible" o un permiso, se mostraba como un error genérico, sin decir por qué.
3. **Carga sin fin en el detalle.** `InventarioDetallePage` hacía `setLoading(false)` solo si las
   cinco consultas salían bien. Si una fallaba, la pantalla quedaba en "Cargando elemento…" y el
   botón "Solicitar" nunca aparecía.

Además había un hueco de reglas: **no existía control de disponibilidad.** Cada elemento es una
unidad, pero un elemento entregado a un cuartel seguía figurando "Disponible" y otro cuartel podía
pedirlo, o se podían aprobar dos préstamos a la vez.

### 58.2 Errores de la base en toda la app

`describeSupabaseError()` reconocía los errores de la base con `instanceof PostgrestError`, pero
supabase-js devuelve esos errores como **objeto plano** (`{ code, message, details, hint }`): solo
son instancia de la clase con `.throwOnError()`. Ningún código se reconocía, y todo terminaba en el
mensaje genérico de cada pantalla, en cualquier módulo:

- permisos (`42501`);
- motivos de los triggers (`P0001`);
- "falta una actualización de la base" (`PGRST202`);
- registros duplicados o vinculados.

Ahora se reconocen por su forma (`isPostgrestError`), también los errores de red. Hay un helper
`postgrestCode(err)` para las pantallas que necesitan el código; `DepartamentoFormPage` tenía el
mismo problema con `23505`.

### 58.3 Qué cambió en Inventario

**Base** (`0099_inventory_loan_availability.sql`):

- No se puede crear una solicitud si el elemento tiene un **préstamo activo** (solicitud aprobada o
  retirada, sin devolver). Mensaje: "El elemento ya está prestado a Las Varillas: no se puede
  solicitar hasta que se devuelva."
- Un cuartel no puede tener **dos solicitudes pendientes** del mismo elemento.
- No se puede **aprobar ni registrar el retiro** de una solicitud si el elemento ya tiene otro
  préstamo activo.
- Mensajes nuevos para baja, mantenimiento y no disponible.
- Las policies de 0057 (quién solicita y quién gestiona) no cambian.

**Pantallas:**

- **Formulario de solicitud:**
  - campo "Cuartel que lo solicita". Para un rol de cuartel viene elegido; si tiene más de un
    cuartel, elige. Informática elige entre todos los cuarteles y el Secretario Regional entre los
    de su Regional;
  - si el elemento está prestado, reservado, en mantenimiento o de baja, lo explica en lugar de
    mostrar el formulario;
  - avisa si ese cuartel ya tiene una solicitud pendiente;
  - no deja poner una devolución anterior a hoy;
  - al enviar, abre la solicitud con el aviso "Solicitud enviada…".
- **Sin permiso:** quien no puede solicitar ve qué roles pueden hacerlo, en el detalle y por URL.
- **Detalle del elemento:**
  - tarjeta de disponibilidad: "Disponible para pedir prestado", "Prestado a X hasta el …",
    "Reservado para X" o el motivo del estado;
  - "Tu cuartel ya lo pidió" con enlace a la solicitud;
  - botón "Solicitar préstamo";
  - el badge muestra "Prestado" o "Reservado".
- **Lista del Inventario:** marca "Prestado" o "Reservado".
- **Solicitudes:**
  - filtro **Mis solicitudes**, encendido por defecto salvo para quien gestiona préstamos;
  - estado vacío con acción;
  - en cada solicitud, una línea que explica qué significa su estado y qué sigue.

**Quién puede qué (sin cambios):**

| Acción | Quién |
|---|---|
| Solicitar | Jefe de Cuerpo Activo, Presidente y usuario de carga (para su cuartel); Secretario Regional e Informática (en nombre de un cuartel) |
| Aprobar, rechazar, registrar retiro y devolución | Informática, Director de Escuela, Secretario Regional y el responsable del elemento |
| Cancelar | Quien la pidió o quien la gestiona, mientras esté pendiente o aprobada |
| Ver el estado | Todos los usuarios con sesión |

### 58.4 Versión y Novedades

**Antes:** la versión visible ("SIGER4 v1.0.0-beta.1") salía de `package.json`, que no se
actualizaba desde agosto, y la última novedad era del 09/08.

**Ahora la única fuente es `src/config/appUpdates.ts`:**

- **Versión actual** = la de la primera entrada (hoy **1.4.0**, 3 de octubre de 2026).
- Cada entrada tiene versión, fecha, título, resumen y una lista de cambios. Cada cambio tiene tipo
  (Nuevo, Mejora o Corrección), módulo afectado y un texto para usuarios.
- Se cargaron las versiones reales desde agosto: 0.9.0, 1.0.0-beta.1, 1.1.0, 1.2.0, 1.3.0 y 1.4.0.

**Dónde lo ven los usuarios:**

- **Novedades** (`/novedades`, en el menú, sección Cuenta): versión actual y el historial completo,
  agrupado en Nuevo, Mejoras y Correcciones.
- **Pie de cada pantalla:** "v1.4.0", que lleva a Novedades. En el login se muestra solo el número.
- **Mi perfil y ajustes:** "SIGER4 1.4.0 · actualizado el … · Ver novedades".
- **Aviso al ingresar:** la novedad nueva se muestra una vez, con "Ver todas las novedades" (ver
  sección 22), y queda como notificación.

No muestra datos técnicos. El hash de build sigue solo en el bloque de diagnóstico de Informática.

**Cómo publicar una versión** (antes del commit y el deploy):

1. Agregar una entrada **al principio** de `APP_UPDATES`:
   - `id` nuevo y único (`AAAA-MM-DD-slug`);
   - `version`: MAYOR.MENOR.PARCHE. MENOR para funciones o mejoras visibles, PARCHE para
     correcciones;
   - `date`, `title`, `summary`;
   - `changes`: `{ type, module, text }`, en lenguaje de usuario.
2. Poner la misma versión en `version` de `package.json`. Si no coinciden, el build lo avisa con un
   WARNING (no lo frena).
3. Commit y deploy. No hace falta migración.

### 58.5 Modo claro con identidad azul

Tokens nuevos con valor propio en cada tema; el modo oscuro no cambia:

| Token | Claro | Oscuro |
|---|---|---|
| `--color-header-bg` / `-fg` | `#284f86` / blanco | superficie / texto (igual que antes) |
| `--color-sidebar-bg` | `#f1f5fb` (tinte azul muy suave) | superficie |
| `--color-sidebar-active-bg` / `-fg` | `#284f86` / blanco | `--color-primary-soft` (igual que antes) |
| `--color-sidebar-hover` | `#e2eaf5` | `--color-surface-hover` |

- **Encabezado:** azul institucional con título e íconos en blanco. Contraste 8.2:1, AAA.
- **Foco en el encabezado:** blanco. El anillo azul daba 1.6:1 sobre el azul.
- **Badge de notificaciones:** borde blanco para separarlo del fondo.
- **Menú lateral:**
  - tinte azul suave;
  - ítem activo en azul sólido con texto blanco (8.2:1);
  - texto 6.9:1 y títulos de sección 4.6:1 (AA).
- **Login:** borde superior azul en la tarjeta.
- Las pestañas, botones primarios y enlaces ya usaban el mismo azul.
- En el celular, el menú desplegable usa los mismos estilos.

### 58.6 Auditoría solo para informatica_r4 (confirmado) y funciones internas

**Auditoría** quedó confirmada en la base sobre las migraciones hasta 0100:

- `audit_logs` tiene una sola policy de lectura, `is_super_admin()`;
- informatica_r4 la ve;
- `integrante_informatica`, Secretario Regional, Coordinador de Escuela, coordinador de
  departamento y usuario común ven 0 filas;
- `anon` recibe "permission denied";
- en pantalla, `/auditoria` usa `SuperAdminRoute` y el menú solo la muestra a informatica_r4.

Al revisar qué funciones leen `audit_logs`, apareció un problema más amplio. Supabase da EXECUTE a
`anon` y `authenticated` sobre cada función nueva, y el `revoke ... from public` de 0066-0085 no
quita esos permisos. Cualquiera con la anon key, aun sin iniciar sesión, podía llamar por la API a:

- `notify_informatica_staff(título, texto)`: avisos con texto arbitrario, y push, a todo
  Informática;
- `send_weekly_admin_summary()`, `send_weekly_reminder()`, `send_loan_return_reminders()` y
  `send_calendar_event_reminders()`: reenviar los avisos programados;
- `trigger_document_purge()`: disparar la purga de la papelera fuera de horario.

Ninguna devolvía datos, pero permitían enviar avisos falsos o masivos. La migración
`0100_restrict_internal_functions.sql`:

- les quita EXECUTE a `anon` y `authenticated`. Las siguen ejecutando pg_cron (como `postgres`),
  otras funciones SECURITY DEFINER y las Edge Functions (con `service_role`);
- deja `notify_admin_delete_user()`, que la Edge Function `admin-delete-user` llama con la sesión
  del administrador, pero ahora valida que quien la llama sea de Informática.

### 58.7 Qué correr

1. SQL Editor → `0099_inventory_loan_availability.sql` y `0100_restrict_internal_functions.sql`,
   en ese orden y después de 0098. Las dos se pueden volver a correr sin efecto.
2. Desplegar el frontend.

Sin variables de entorno nuevas. Sin cambios en Edge Functions, push ni PWA.

### 58.8 Verificación

- **Postgres 16 local:**
  - 0099: solicitudes por rol, disponibilidad, aprobación y devolución, y Auditoría: 26 pruebas,
    0 fallas.
  - 0100: funciones internas sin EXECUTE para usuarios ni anon, Informática sigue avisando
    eliminaciones y el resumen semanal sigue corriendo desde el cron: 15 pruebas, 0 fallas.
  - Ambas se pueden volver a correr y funcionan en un proyecto nuevo.
- **Navegador** (Chrome; escritorio y Android emulado; backend simulado): 25 pruebas, 0 fallas.
  - Informática solicita eligiendo el cuartel. El Jefe de Cuerpo Activo solicita desde el celular
    con su cuartel ya elegido y la ve en "Mis solicitudes".
  - Elemento prestado: detalle, badge y formulario. Solicitud pendiente propia.
  - Sin permiso, en el detalle y por URL. El motivo real de un rechazo de la base.
  - Aviso de novedad, página Novedades y versión del pie.
  - Colores del encabezado y del menú en claro, oscuro sin cambios, y foco visible.
- **Regresión:** las pruebas de la sección 57 (33) y del menú "Nuevo" (8) siguen pasando. Capturas
  de todas las pantallas en claro y oscuro, escritorio y celular.

### 58.9 Checklist en dispositivo físico (pendiente de hacer en producción)

Lo de arriba se probó con emulación. Antes de dar por cerrada la versión, hacer esto en un
**Android real** (Chrome y, si se usa, el navegador de Xiaomi) y repetirlo en una computadora:

- [ ] Ingresar. El navegador ofrece guardar la contraseña y la completa después con huella o
      rostro.
- [ ] Inicio en el celular: se lee bien, los accesos rápidos responden y no hay scroll horizontal.
- [ ] Departamentos → Cargar informe o acta → **PDF** desde Archivos → se sube y se abre.
- [ ] Mismo informe → **Sacar foto** con la cámara → miniatura visible en el detalle.
- [ ] **Grabar video** corto (menos de 50 MB) → se reproduce en el detalle.
- [ ] **Descargar** el PDF del informe → se guarda con el nombre original.
- [ ] Inventario → un elemento disponible → **Solicitar préstamo** → aviso "Solicitud enviada" →
      aparece en "Mis solicitudes" como Pendiente.
- [ ] Como responsable (o Informática) → **Aprobar** la solicitud → el elemento figura
      "Reservado" → otro cuartel no lo puede pedir.
- [ ] Registrar retiro y devolución → el elemento vuelve a "Disponible".
- [ ] Novedades: el aviso de la versión 1.4.0 aparece una vez; el pie dice v1.4.0 y lleva a
      Novedades.
- [ ] Modo claro: encabezado azul y menú con tinte. Modo oscuro: igual que antes. Probar en las dos
      pantallas: Inicio, Inventario y un formulario.
- [ ] Usuario común, integrante de Informática y Secretario Regional: Auditoría no aparece en el
      menú y por URL muestra el acceso denegado.

### 58.10 Riesgos y pendientes

- **Préstamos activos duplicados de antes de 0099:** si ya hubiera dos préstamos activos del mismo
  elemento, la migración no los toca. El próximo intento de aprobar otro lo frena. Se pueden
  revisar en Solicitudes, filtrando por "Aprobada" o "Retirada".
- **Mensajes más específicos:** con el arreglo de 58.2, varias pantallas pasan a mostrar el motivo
  real de un rechazo en lugar del genérico. Es el comportamiento buscado, pero conviene mirarlo en
  el uso diario.
- **Física:** el checklist de 58.9 sigue pendiente en un equipo real.

## 59. Búsqueda global, Centro de ayuda, notificaciones internas y tareas en Inicio (2026-10-05) — versión 1.5.0, migraciones 0101-0102

### 59.1 Búsqueda global

**Dónde aparece:**

- **Escritorio:** botón "Buscar en SIGER4" en el encabezado de todas las pantallas, con el atajo
  **Ctrl+K** (⌘K en Mac).
- **Celular** (menos de 900 px): ícono de lupa en el encabezado. La búsqueda ocupa la pantalla
  completa.
- **Inicio:** campo "Buscar en SIGER4…" arriba de las tareas. Abre la misma búsqueda.

**Cómo funciona** (`src/components/GlobalSearch.tsx` y `src/lib/api/globalSearch.ts`):

- Busca a partir de **2 letras**, 300 ms después de la última tecla. Si llega una respuesta vieja
  después de una nueva, se descarta.
- Cada módulo es una consulta corta (`ilike` sobre título y una o dos columnas más) con **límite**:
  4 resultados por módulo en "Todo", 20 cuando se filtra un módulo. Los módulos se consultan en
  paralelo; si uno falla, los demás se muestran igual con el aviso "No pudimos buscar en: …".
- El texto se limpia antes de consultar: se quitan los comodines y separadores de PostgREST
  (`% _ , ( ) . : * ;`, barra invertida y comillas) y se corta en 60 caracteres.
- Cada resultado muestra tipo, título, un subtítulo corto y se abre con clic, toque o Enter. Los
  grupos tienen "Ver más en X →" y hay chips para filtrar por módulo.
- Teclado: ↑ ↓ para moverse, Enter para abrir, Esc para cerrar. El campo es un combobox accesible
  (`aria-activedescendant`).
- **Estados:** sin texto (qué se puede buscar y enlace a Ayuda), buscando, sin resultados (con
  sugerencias y "Buscar en todo" si había un filtro), error solo si fallaron todos los módulos
  remotos.

**Módulos y qué se muestra:**

| Módulo | Busca en | Muestra | Abre |
|---|---|---|---|
| Usuarios | nombre, email | nombre, jerarquía, email, "Inactivo" | `/usuarios/:id` |
| Cuarteles | nombre, código, dirección | nombre, código, dirección | `/cuarteles/:id` |
| Departamentos | nombre, descripción | nombre, descripción | `/departamentos/:id` |
| Informes y actas | título, texto | departamento, tipo, fecha | `/departamentos/informes/:id` |
| Documentos | título, categoría | categoría, fecha | carpeta del documento |
| Avales | título, descripción | departamento, fecha | Avales, filtrado por su departamento |
| Inventario | nombre, descripción | disponibilidad | `/inventario/:id` |
| Solicitudes de préstamo | elementos encontrados | cuartel, estado, fecha | `/inventario/solicitudes/:id` |
| Cursos | título, categoría | categoría, fecha | `/escuela` |
| Calendario | título, descripción | fecha | `/calendario/:id` |
| Notificaciones | título, texto | tipo, fecha | `/notificaciones` |
| Ayuda | contenido local | resumen | `/ayuda#articulo` |

No se muestran teléfonos, DNI, direcciones personales, rutas de archivos ni datos técnicos.

**Permisos.** Si el usuario no puede abrir algo, el resultado no aparece:

- **La RLS de cada tabla** filtra todas las consultas: se busca con la sesión del usuario, como
  en las pantallas de cada módulo. No hay funciones nuevas ni SECURITY DEFINER para buscar.
- **Además, en la pantalla** se saltean los módulos que el rol no puede abrir, para no mostrar
  resultados que lleven a "sin permiso":
  - **Usuarios:** solo Informática y el Jefe de Cuerpo Activo. El Jefe ve solo su cuartel, sin
    roles regionales, de Escuela ni coordinadores (las mismas reglas que la pantalla Usuarios).
  - **Informes y actas:** solo quien ve informes de algún departamento (Informática, coordinador o
    integrante). La RLS deja solo los de sus departamentos.
  - **Avales:** solo quien entra a Avales (Informática, Escuela o coordinadores de departamento).
    No se buscan los archivados.
  - **Documentos:** sin los de la papelera ni las subidas sin terminar.
  - **Notificaciones:** desde la vista `my_notifications` (59.3): solo las propias y los avisos de
    su cuartel, Regional o Escuela.
  - **Ayuda:** solo los artículos de su rol (59.2).

**Limitación conocida:** en los módulos de la base la búsqueda **no ignora tildes**: "prestamo" no
encuentra "préstamo". El mensaje de "sin resultados" sugiere probar con o sin tildes. La Ayuda sí
ignora tildes, porque se busca en el navegador. Para la base haría falta la extensión `unaccent` e
índices; se dejó para más adelante.

### 59.2 Centro de ayuda

Ruta `/ayuda`, en el menú (sección Cuenta, ícono de ayuda) y en los resultados de la búsqueda.

**Organización** (`src/pages/AyudaPage.tsx`):

- Buscador propio que ignora tildes y mayúsculas, y busca también en los pasos.
- Chips por sección: Primeros pasos, Inventario y préstamos, Departamentos, Escuela, Documentos,
  Tu cuenta, Administración y Preguntas frecuentes.
- Cada artículo es un desplegable con un resumen de una línea, **pasos numerados** y botones que
  llevan a la pantalla real ("Ir a Inventario", "Ver mis solicitudes", …).
- `/ayuda#id` abre ese artículo y lo lleva a la vista; así enlaza la búsqueda global.
- Si no hay coincidencias, ofrece buscar en todo SIGER4. Al pie, a quién pedir ayuda.

**Contenido** (`src/config/helpContent.ts`):

| Sección | Artículos |
|---|---|
| Primeros pasos | Cómo usar el Inicio · Buscar en SIGER4 · Ver y ordenar tus notificaciones · Recibir avisos en el celular (push) · Ver qué cambió en SIGER4 (Novedades) |
| Inventario y préstamos | Pedir un elemento prestado · Ver el estado de mis solicitudes · Aprobar y registrar préstamos |
| Departamentos | Cargar un informe o un acta · Redactar un informe en SIGER4 |
| Escuela | Subir un aval regional · Cursos de la Escuela |
| Documentos | Subir un documento |
| Tu cuenta | Cambiar mi contraseña o mi foto · Qué hacer si no tengo permiso · Qué significa cada rol |
| Administración | Crear un usuario y darle acceso · Asignar el coordinador de un departamento · Revisar la auditoría |
| Preguntas frecuentes | No veo una sección del menú · Olvidé mi contraseña · No puedo subir un archivo desde el celular · No me deja pedir un elemento · No veo los informes de un departamento |

**Por rol.** Cada artículo tiene un público (`audience`) y `canSeeHelpArticle()` decide si se
muestra: por ejemplo, "Aprobar y registrar préstamos" solo a quien gestiona préstamos, "Crear un
usuario" a quien puede crear usuarios (Informática, Jefe de Cuerpo Activo y Director de Escuela), "Asignar el coordinador" a Informática y "Revisar
la auditoría" solo a informatica_r4. Es solo para no mostrar ayuda que no sirve: los permisos
reales siguen en la RLS y en las rutas.

**Cómo editarla:** agregar o cambiar objetos en `HELP_ARTICLES` (id único, sección, público,
título, resumen, pasos o respuesta, enlaces y palabras clave). No hace falta migración.

### 59.3 Notificaciones internas

**Problemas encontrados:**

1. **Los avisos masivos no se podían marcar como leídos.** Los avisos a un cuartel, una Regional o
   la Escuela son una sola fila con `profile_id` nulo. La policy de UPDATE solo permite tocar las
   propias, así que para un usuario común quedaban **sin leer para siempre** en el contador.
2. **Informática marcaba como leído para todos.** Informática sí podía actualizar esas filas: al
   marcarlas, desaparecían como no leídas para toda la Regional.
3. **La bandeja de Informática mostraba avisos personales de otros usuarios**, porque su policy de
   lectura ve todas las filas.
4. **Los informes de departamento no avisaban** a nadie.

**Base** (`0101_notification_type_department_report.sql` y `0102_notification_reads_and_links.sql`):

- Tipo nuevo `informe_departamento` (0101; un valor de enum tiene que confirmarse antes de usarse,
  por eso va en su propia migración).
- Columna `notifications.link_path`: ruta interna opcional al elemento relacionado. Un `check` solo
  acepta rutas que empiezan con `/`, sin dominio ni esquema, de hasta 300 caracteres.
- Tabla `notification_reads (notification_id, profile_id, read_at)`: la lectura de un aviso masivo
  **por usuario**. RLS: cada uno ve y crea solo las suyas, y solo para avisos masivos que puede ver.
  Sin permisos para `anon`.
- Vista `my_notifications` (`security_invoker`): las notificaciones propias más los avisos masivos
  que la RLS deja ver, con `is_read` calculado por usuario. La bandeja, el contador, el Inicio y la
  búsqueda leen de acá. Informática ya no ve los avisos personales de otros en su bandeja.
- Función `mark_notifications_read(p_ids uuid[] default null)` (security invoker): marca las
  indicadas, o todas si `p_ids` es nulo. Personales: `is_read = true`. Masivas: fila en
  `notification_reads` (sin duplicar). Devuelve cuántas cambió.
- Trigger `trg_notify_department_report_created` en `department_reports`: al cargar un informe o
  acta avisa al coordinador y a los integrantes activos del departamento, salvo a quien lo cargó.
  Es una notificación **personal** por persona, con `link_path` al informe. El push sale como
  cualquier otra notificación, por el envío que ya existe.

No cambian los triggers existentes, las Edge Functions, el push ni la PWA. Las filas viejas siguen
funcionando: sin `link_path`, el botón "Abrir" lleva a la pantalla del módulo según el tipo.

**Pantalla** (`/notificaciones`):

- Filtros de estado: **Todas · No leídas (n) · Importantes**.
- Filtros de módulo, solo los que tienen avisos: Sistema, Escuela, Inventario, Documentos,
  Calendario, Cuarteles y Departamentos.
- **Importantes:** préstamos solicitados, aprobados, por vencer y vencidos, asistencia pendiente y
  alertas de Informática. Llevan el badge "Importante".
- Cada aviso muestra ícono del módulo, título, texto, tipo, **origen** ("Para vos", cuartel,
  subsede o Regional) y hace cuánto llegó. Los no leídos tienen borde y título destacados.
- Acciones: **Abrir** (marca como leído y va al elemento), **Leída** y **Marcar todas como
  leídas**. Tocar el aviso abre el detalle, que también tiene "Abrir".
- Estados vacíos por filtro: "Estás al día…", "No hay avisos importantes", etc., con "Ver todas".
- En el celular los filtros de módulo se desplazan de costado y las acciones quedan al pie de cada
  aviso.

**Contador del encabezado:** se actualiza al cambiar de pantalla, al volver a la pestaña y apenas
se marca algo como leído (evento `siger4:notifications-changed`), sin esperar al siguiente
intervalo.

### 59.4 Tareas y pendientes en Inicio

La sección "Tareas y pendientes" (`src/components/TasksSection.tsx`) reemplaza a la lista de
pendientes y a "Notificaciones sin leer". Junta:

- los pendientes del servidor (`get_pending_items()`, sin cambios: cuarteles, asistencia,
  documentos, usuarios, Escuela, calendario);
- **préstamos:** "Retirá X" (aprobada para tu cuartel, urgente), "Entregar X" (para quien gestiona:
  aprobada sin retiro), "Tu solicitud de X espera respuesta" (o "N solicitudes tuyas…");
- **Escuela:** "N avales nuevos esta semana", para quien entra a Avales;
- **Departamentos:** "N informes nuevos en tus departamentos" (Informática: "en Departamentos"),
  cargados por otros en los últimos 7 días;
- **notificaciones sin leer**, con su título real; si alguna es importante, el grupo sube de
  prioridad.

Se agrupan por módulo con su cantidad, ordenadas por urgencia (alta, media, baja), con hasta 3
tareas por grupo y "Ver N más →". Arriba se ve el total y cuántas son urgentes. Sin pendientes:
"Todo al día". Si fallan los datos, un aviso no bloqueante.

| Rol | Qué ve |
|---|---|
| Informática | Revisión (cuarteles sin datos, asistencia, papelera, usuarios), préstamos para entregar, avales e informes nuevos, avisos |
| Gestión de préstamos (Secretario Regional, Director de Escuela, responsable del elemento) | Solicitudes para aprobar (servidor), préstamos aprobados para entregar |
| Coordinador de Escuela | Avales nuevos, pendientes de Escuela, avisos |
| Coordinador o integrante de departamento | Informes nuevos en sus departamentos, avales nuevos (coordinador), avisos de informes |
| Usuario común / cuartel | Qué retirar, solicitudes en espera, pendientes de su cuartel, notificaciones sin leer, próximos eventos (bloque "Hoy" y "Próximos eventos") |

Todo pasa por la RLS: una tarea nunca lleva a algo que el usuario no pueda abrir.

### 59.5 Otros ajustes

- **Menú lateral:** con muchos ítems (Informática) el menú scrollea y el ítem activo podía quedar
  fuera de vista, por ejemplo Ayuda o Novedades. Ahora se centra al cambiar de pantalla; se mueve
  solo el menú, no la página.
- Ícono nuevo `help`.
- Versión **1.5.0** en `appUpdates.ts` y `package.json`.

### 59.6 Qué correr

1. SQL Editor → `0101_notification_type_department_report.sql`, **sola**, y esperar a que termine.
2. SQL Editor → `0102_notification_reads_and_links.sql`. Si se corre sin 0101, se detiene con un
   mensaje que lo explica y no cambia nada.
3. Desplegar el frontend.

Van después de 0100. Las dos se pueden volver a correr sin efecto y funcionan en un proyecto
nuevo. **El frontend nuevo necesita 0102:** la bandeja, el contador y la búsqueda leen de
`my_notifications`. Correr las migraciones antes de desplegar.

Sin variables de entorno nuevas. Sin cambios en Edge Functions, push ni PWA.

### 59.7 Verificación

- **Postgres 16 local:**
  - 0102: lectura por usuario de avisos masivos (un usuario no marca para otro, Informática no
    marca para todos), vista sin avisos personales ajenos, marcar todas sin duplicar, `link_path`
    rechaza `javascript:` y enlaces externos, aviso de informe al coordinador y no al autor ni a
    nadie fuera del departamento, sin acceso para `anon`: 20 pruebas, 0 fallas. Se puede volver
    a correr; en un proyecto nuevo corre completa; sin 0101 se detiene.
  - Las pruebas de 0098 (informes, 42), 0099 (26) y 0100 (15) siguen pasando con el trigger nuevo.
- **Navegador** (Chrome; escritorio y Android emulado; backend simulado): 51 pruebas, 0 fallas.
  - Búsqueda: Informática encuentra usuarios, informes, elementos y solicitudes; el usuario común
    no ve Usuarios ni Informes; el coordinador de Fuego encuentra los informes de Fuego y no los de
    otro departamento; filtro por módulo, teclado, sin resultados y celular a pantalla completa.
  - Ayuda: el usuario común no ve Administración; Informática sí; Escuela ve Avales; los enlaces
    llevan a la pantalla real; `/ayuda#id` abre el artículo; el buscador ignora tildes.
  - Notificaciones: contador igual a la bandeja, sin avisos personales ajenos, filtros Importantes
    e Inventario, "Leída" baja el contador, "Marcar todas" lo deja en 0, estado vacío y "Abrir" va
    al informe.
  - Inicio: usuario común (Retirá, solicitud en espera, avisos, lo urgente primero), Informática
    (Entregar, pendientes del servidor), Coordinador de Escuela (avales), coordinador de Fuego
    (aviso del informe) y sin pendientes ("Todo al día").
  - Menú: el ítem activo queda a la vista en escritorio y celular.
- **Regresión:** pruebas de las secciones 57 (33), 58 (26) y del menú "Nuevo" (8). Capturas en
  claro y oscuro, escritorio y celular.

### 59.8 Checklist en dispositivo físico

- [ ] Celular: lupa del encabezado → buscar un elemento del Inventario → abrirlo.
- [ ] Computadora: Ctrl+K → buscar un usuario (como Informática) y un informe (como coordinador).
- [ ] Usuario común: buscar el nombre de un compañero → no aparece Usuarios.
- [ ] Ayuda en el celular: abrir "Pedir un elemento prestado" → "Ir a Inventario".
- [ ] Cargar un informe en un departamento → el coordinador recibe la notificación (y el push, si
      lo tiene activo) → "Abrir" lleva al informe.
- [ ] Un aviso para toda la Regional: marcarlo como leído con un usuario → sigue sin leer para otro.
- [ ] "Marcar todas como leídas" → el número de la campana pasa a 0 sin recargar.
- [ ] Inicio con un préstamo aprobado para el cuartel → aparece "Retirá …" arriba de todo.

### 59.9 Riesgos y pendientes

- **Tildes en la búsqueda** (59.1): limitación conocida en los módulos de la base.
- **Crecimiento de `notification_reads`:** una fila por usuario y aviso masivo leído. Se borra sola
  si se borra el aviso (`on delete cascade`). Con el volumen actual no es un problema; si crece, se
  puede purgar junto con las notificaciones viejas.
- **Avisos viejos sin `link_path`:** "Abrir" lleva a la pantalla del módulo, no al elemento exacto.
  Los triggers existentes no se cambiaron para no tocar el envío de push; se puede sumar
  `link_path` en cada uno más adelante.
- **Búsqueda de usuarios para el Jefe de Cuerpo Activo:** el filtro de roles privilegiados se
  aplica en la pantalla, igual que en Usuarios. La RLS ya limita qué perfiles puede leer.

## 60. Roles por división: rol, división y alcance (2026-10-05) — versión 1.6.0, migración 0103

### 60.1 Modelo encontrado

**Rol + alcance ya existía**, repartido en fuentes únicas que se mantienen:

| Qué | Dónde vive | Para qué |
|---|---|---|
| Rol (qué puede hacer) | `user_roles` (enum `role_key`) | `has_role()`, `is_informatica_r4()`, `is_regional_role()`… |
| Cuartel y Regional del perfil | `profiles.station_id`, `profiles.region_id` | `my_station_ids()`, `my_region_ids()` |
| Alcance adicional | `user_scopes` (sistema, Regional, subsede, cuartel, Escuela) | Las mismas funciones, más `my_subsede_ids()` |
| Coordinador de departamento | `departments.coordinator_profile_id` (uno por departamento) | Avales (0097), informes (0098) |
| Integrante de departamento | `department_members` | Informes (0098) |

**Decisión:** no se creó ninguna tabla ni rol nuevo.
- La división de cada rol sale de esas fuentes. Duplicarlas en una columna `scope` de `user_roles` habría obligado a reescribir todos los helpers y la RLS.
- "Coordinador de departamento" e "Integrante de departamento" son **roles de división**: se asignan eligiendo departamentos, no son valores de `role_key`.
- La correspondencia rol → división está en `src/types/roles.ts` (`roleDivisionNeed()`, `DEPARTMENT_ROLE_DEFINITIONS`) y en los helpers SQL de 0103.

### 60.2 Problemas encontrados

1. **Departamentos legibles por cualquier usuario.**
   - Tablas afectadas: `departments`, `department_members`, `department_manual_members` (con teléfonos y emails de contacto) y `department_activity_reports`.
   - Tenían `select` para cualquier autenticado: un integrante de Fuego, o cualquier usuario de cuartel, podía leer por la API los integrantes, contactos y actividad de FASME.
2. **Calendario sin alcance.** `calendar_events` tenía `select` para cualquier autenticado: cada cuartel veía los eventos de todos los demás.
3. **Historial institucional sin alcance.** `station_history_events` era legible por cualquiera, aunque `stations` sí estaba filtrada.
4. **Ficha del departamento rota.** La lista de integrantes hacía join con `profiles`, que está limitado por cuartel. Un coordinador que no es de Informática recibía `profile = null` para los integrantes de otros cuarteles y la pantalla fallaba.
5. **Alta de usuario incoherente.** El alcance (paso 3) y los roles (paso 4) eran independientes. Se podía crear, por ejemplo, un Secretario Regional con alcance de cuartel, o un Jefe de Cuerpo Activo sin cuartel.
6. **No se veía "rol + división".** La ficha mostraba roles y alcances por separado, en términos técnicos.

### 60.3 Migración 0103 (`0103_role_divisions_and_scopes.sql`)

**Helpers nuevos:**

| Función | Devuelve |
|---|---|
| `is_department_member_or_coordinator(dep)` | Coordinador o integrante del departamento. |
| `my_department_ids()` | Departamentos que coordina o integra el usuario. |
| `can_view_department(dep)` | Informática, Secretario Regional, Director de Escuela (los mismos que generan los reportes de Departamentos), o su coordinador e integrantes. |
| `can_work_in_department(dep)` | Cargar eventos: Informática, Secretario Regional, coordinador o integrantes. |
| `can_notify_department(dep)` | Avisar a todo el departamento: Informática, Secretario Regional o su coordinador. |
| `my_effective_region_ids()` | Las Regionales propias más las de sus cuarteles y subsedes. Sirve para usuarios sin `region_id` en el perfil, como los que crea un Jefe de Cuerpo Activo. |

**RLS:**

- **`departments`, `department_members`, `department_manual_members`, `department_activity_reports`:** se leen con `can_view_department()`. Cada uno sigue viendo sus propias filas de integración. Las policies de escritura no cambian.
- **`department_reports` y adjuntos (0098):** sin cambios. Los ven el coordinador, los integrantes e Informática. Storage sigue cerrado por departamento.
- **`calendar_events`:**
  - Columna nueva `department_id`.
  - Lectura, con sesión de un perfil activo:
    - eventos de su cuartel, su subsede y su Regional;
    - Escuela y capacitación, para toda la Regional;
    - los de sus departamentos.
  - Roles regionales y de Escuela: todos los eventos de su Regional. Informática: todos.
  - Barrera restrictiva: un evento de departamento no se abre por ninguna otra regla (por ejemplo, la de Escuela para capacitaciones).
  - Un evento de departamento no lleva Regional, subsede ni cuartel (`calendar_events_single_scope` actualizado).
  - Lo carga cualquier integrante o el coordinador (con el departamento activo). Lo editan o borran quien lo cargó, el coordinador, el Secretario Regional o Informática.
  - El autor lo completa la base (`trg_calendar_events_set_creator`): el formulario nunca lo enviaba.
- **`station_history_events`:** se lee con el mismo alcance que el cuartel (`exists` sobre `stations`, que aplica `stations_select_scope`).

**Funciones nuevas** (`authenticated`, sin `anon`):

| Función | Qué hace |
|---|---|
| `list_visible_departments()` | Departamentos visibles con nombre del coordinador, cantidad de integrantes y la relación del usuario (`coordinador`, `integrante` o null). |
| `department_member_directory(dep)` | Integrantes con nombre, jerarquía, contacto y cuartel, para quien puede ver el departamento. Vacío para el resto. |
| `notify_department(dep, tipo, título, texto)` | Aviso a todo el departamento. Ver el detalle abajo. |
| `coordinating_profile_ids(ids)` | Cuáles de esos perfiles coordinan un departamento. Ver el detalle abajo. |

`notify_department()`:
- crea una notificación **personal** por integrante activo y coordinador, salvo quien envía, con enlace al departamento;
- solo acepta los tipos de aviso manual (rechaza los internos);
- rechaza departamentos inactivos;
- el push sale por el envío existente.

`coordinating_profile_ids()`:
- solo responde por perfiles de los cuarteles de quien pregunta, o para Informática;
- la usan las pantallas del Jefe de Cuerpo Activo, que no gestiona coordinadores.
- `admin-update-user` lo sigue validando con `service_role`, sin cambios.

**Avisos automáticos:**
- `notify_calendar_event_created()` y `send_calendar_event_reminders()`: un evento de departamento avisa solo a su coordinador e integrantes, con enlace al evento. **Nunca a la Regional.** El resto sigue igual.
- `get_pending_items()`:
  - los eventos de departamento aparecen solo para su gente (también para Informática, que no es pendiente suyo);
  - para Informática, nuevos pendientes: "Rol de cuartel sin cuartel", "Rol regional sin Regional" y "Departamento sin coordinador".

### 60.4 Roles por división

| Rol | División | Cómo se asigna | Qué ve |
|---|---|---|---|
| Informática R4 / Integrante de Informática | Todo el sistema | Rol | Todo. Auditoría solo informatica_r4 |
| Secretario Regional | Su Regional | Rol + Regional | Cuarteles y departamentos de la Regional |
| Director de Escuela / Instructor | Escuela Regional de su Regional | Rol + Regional | Escuela y lectura regional; el Director ve todos los departamentos (reportes) |
| Coordinador / Secretario de Escuela | Toda la Escuela | Rol | Avales de todos los departamentos |
| Roles de cuartel (Jefe, Presidente, carga, Secretario de Comisión, invitado) | Su cuartel | Rol + cuartel | Su cuartel (y su subsede si tiene ese alcance) |
| Coordinador de departamento | Uno o más departamentos | Elegir departamentos | Solo los suyos: datos, integrantes, informes, eventos, avisos y avales |
| Integrante de departamento | Uno o más departamentos | Elegir departamentos | Solo los suyos: integrantes, informes y eventos |

Los roles de departamento se suman a un rol del sistema: por ejemplo, "Usuario de carga · Cuartel Río Primero" e "Integrante · Fuego".

### 60.5 Cómo se asignan

- **Alta de usuario:**
  1. Datos.
  2. Acceso.
  3. **Roles.** Agrupados por tipo, cada uno con lo que permite. Para Informática, también los **departamentos**: No, Integrante o Coordinador por departamento, con aviso si reemplaza al coordinador actual.
  4. **Dónde aplica.**
     - Pide el cuartel o la Regional según los roles elegidos y no deja crear un rol de cuartel sin cuartel.
     - El alcance que se envía a `admin-create-user` sale de los roles: el más amplio manda.
     - Muestra una vista previa **"Así va a quedar"** con cada rol y su división.
  - Subsedes y alcances extra: desde la ficha, como antes. La Edge Function no cambió.
- **Ficha de usuario (Informática):** sección **Departamentos** con el mismo selector y "Guardar departamentos". Reemplaza a la lista de solo lectura "Departamentos que coordina".
- **Departamentos:** el coordinador sigue asignándose también en la ficha del departamento. Los integrantes los suma Informática o el coordinador.

### 60.6 Cómo se muestran

- **Ficha de usuario** (Informática): "Roles y dónde aplican".
  - Por ejemplo: "Jefe de Cuerpo Activo · Cuartel Villa del Rosario", "Coordinador de departamento · Fuego".
  - Los roles sin su división se marcan: "Falta asignar el cuartel".
- **Mi perfil y ajustes:** "Tus roles y dónde aplican".
- **Roles y permisos:**
  - "Tus roles";
  - ejemplos de rol + división;
  - en cada rol, su División y su Alcance;
  - grupo **Departamentos** con los dos roles de división.
- **Inicio:** el saludo suma "Coordinador de Fuego" e "Integrante de Forestal".

### 60.7 Inicio

- Quien coordina o integra un departamento ve **"Tu departamento"**:
  - nombre y relación ("Coordinás" o "Integrás");
  - integrantes y coordinador;
  - últimos 3 informes y actas, y próximos 3 eventos;
  - acciones: Cargar informe, Nuevo evento y Avisar al departamento (solo el coordinador).
- Con varios departamentos: **chips** para elegir, primero los que coordina. La elección se recuerda en el navegador.
- En el celular, las dos columnas se apilan.
- Los pendientes del servidor incluyen los eventos próximos de sus departamentos.

### 60.8 Búsqueda, notificaciones, documentos y eventos

- **Búsqueda:**
  - Departamentos y Calendario respetan la nueva RLS: un integrante de Fuego no encuentra FASME ni sus eventos.
  - Los nombres para los subtítulos se cachean por usuario. Antes la caché se compartía si otra persona iniciaba sesión en la misma pestaña.
  - Para Escuela suma los departamentos de Avales.
  - El filtro del Jefe para no mostrar coordinadores usa `coordinating_profile_ids()`.
- **Notificaciones:**
  - Destino **Departamento** en "Nueva notificación" para el coordinador (su único destino si no tiene otro permiso), el Secretario Regional e Informática.
  - Al enviar, vuelve al departamento con "Aviso enviado a N personas de Fuego".
  - En la bandeja, el origen dice "Departamento Fuego".
  - Los avisos de eventos e informes de un departamento no le llegan a otro.
- **Eventos:**
  - "¿De qué es el evento?": General o De un departamento.
  - Desde el departamento o el Inicio llega preseleccionado.
  - El calendario muestra "Departamento Fuego" y suma filtros "Mis departamentos" y uno por departamento.
- **Documentos:**
  - Los documentos de un departamento son sus **informes y actas con adjuntos** (0098). Ya están cerrados por departamento en la base y en Storage.
  - No se creó un segundo sistema de documentos por departamento.
  - Documentos sigue con su alcance territorial (Regional, subsede, cuartel), sin cambios.
- **Menú:** "Departamentos" solo aparece a quien tiene departamentos o visión regional. Por URL directa, un departamento ajeno muestra "No podés ver este departamento".

### 60.9 Qué correr

1. SQL Editor → `0103_role_divisions_and_scopes.sql` (después de 0102). Se puede volver a correr. Si falta 0102, se detiene con un mensaje.
2. Desplegar el frontend. **Correr la migración antes:** el frontend llama a `list_visible_departments()` y `department_member_directory()`.

Sin variables de entorno nuevas. Sin cambios en Edge Functions, push ni PWA.

### 60.10 Verificación

- **Postgres 16 local, 0103:** 79 pruebas, 0 fallas.
  - Coordinador de Fuego ve solo Fuego.
  - Integrante de Fuego ve Fuego y no FASME: ni sus integrantes sin usuario con contacto, ni su actividad, ni por nombre ni por id.
  - Coordinador de Forestal que además integra Fuego ve los dos y distingue su relación.
  - Usuario de cuartel sin departamentos no ve ninguno.
  - Coordinador y Secretario de Escuela siguen viendo los avales de todos.
  - Director, Secretario Regional e Informática ven todos los departamentos. El Director sigue sin ver informes (0098 sin cambios).
  - Directorio de integrantes de otro cuartel.
  - Eventos de departamento:
    - alta por coordinador e integrante;
    - un integrante no carga en otro departamento ni borra el evento del coordinador, pero edita el suyo;
    - un Instructor no ve ni edita una capacitación de Fuego;
    - el Director los ve pero no los carga;
    - un usuario de cuartel no carga;
    - un evento de departamento no acepta cuartel.
  - Alcance territorial del calendario por cuartel, Regional (también sin Regional en el perfil) y Secretario Regional.
  - Avisos y recordatorios de eventos solo al departamento.
  - Aviso al departamento: coordinador sí, integrante no, otro departamento no, tipo interno no, departamento inactivo no.
  - Historial por cuartel.
  - Pendientes.
  - `coordinating_profile_ids()` acotada al cuartel.
  - Auditoría solo informatica_r4.
  - Sin sesión: nada.
  - Se puede volver a correr, funciona en un proyecto nuevo y se detiene sin 0102.
- **Regresión SQL:** 0098 (42), 0099 (26), 0100 (15) y 0102 (20) siguen pasando con 0103.
- **Navegador** (Chrome; escritorio y Android emulado; backend simulado): 65 pruebas, 0 fallas.
  - Menú, lista y URL directa de Departamentos por rol.
  - Ficha con integrantes de otros cuarteles, eventos y menú según el rol.
  - Inicio de un integrante (celular) y de alguien con dos departamentos: selector, cambio de contenido y recordar la elección.
  - Calendario por rol y con filtro por departamento; alta de un evento de departamento.
  - Aviso al departamento desde el coordinador y su origen en la bandeja.
  - Búsqueda por rol.
  - Alta de usuario: cuartel obligatorio, vista previa, alcance derivado, departamentos y celular.
  - Ficha de usuario: resumen, editor y reemplazo de coordinador.
  - Mi perfil y guía de roles.
- **Regresión en navegador:** secciones 57 (33), 58 (26), 59 (47), menú "Nuevo" (8) y menú lateral (4). Capturas en claro y oscuro.

### 60.11 Checklist en producción

- [ ] Correr 0103 y entrar como un integrante de un departamento: en el menú aparece Departamentos con el suyo solo.
- [ ] Como usuario de cuartel sin departamentos: Departamentos no aparece y la URL de un departamento muestra "No podés ver este departamento".
- [ ] Como coordinador: "Aviso al departamento" → les llega a los integrantes (y el push al celular), no a otro departamento.
- [ ] Evento de departamento con "Notificar al crear" → lo reciben solo los integrantes.
- [ ] Calendario como usuario de cuartel: no aparecen eventos de otros cuarteles; sí los de la Regional y la Escuela.
- [ ] Alta de usuario con rol de cuartel: pide el cuartel; con departamentos, quedan asignados.
- [ ] Revisar en el Inicio de Informática los pendientes "Rol de cuartel sin cuartel" y "Departamento sin coordinador" y corregirlos.

### 60.12 Riesgos y decisiones

- **Cambio de visibilidad.** Los usuarios de cuartel que no integran ningún departamento dejan de ver la sección Departamentos, y cada cuartel deja de ver los eventos de los demás. Es lo pedido, pero conviene avisarlo.
- **Inventario y cursos siguen siendo regionales.**
  - El Inventario Regional es compartido entre cuarteles: la disponibilidad tiene que verse para pedir.
  - La oferta de la Escuela es para todos.
  - No cambiaron.
- **Coordinador y Secretario de Escuela no ven Departamentos.** Sus departamentos los ven en Avales.
- **Un solo alcance en el alta.** `admin-create-user` recibe un alcance; el cuartel y la Regional del perfil completan el resto. Subsedes y cuarteles extra se agregan desde la ficha.
- **Codificación con psql en Windows.** 0103 empieza con `set client_encoding = 'UTF8'` para que los textos con tildes no se guarden mal si se corre con psql desde una consola de Windows. En el SQL Editor no cambia nada.

## 61. Resumen de asistencia y avisos automáticos de cuartel (2026-10-06) — versión 1.6.1, migración 0104

### 61.1 Causa del error "El valor ingresado no es válido para el estado actual del registro"

Ese mensaje era la traducción genérica del código `23514` (violación de un CHECK). El CHECK que fallaba **no era de la asistencia**:

- Al dar de alta un resumen, el trigger `notify_attendance_created()` crea un aviso para el cuartel. Lo creaba con `region_id`, `subsede_id` **y** `station_id` a la vez.
- Desde 0087, `notifications_scope_not_ambiguous` exige **exactamente un** alcance por aviso. El aviso violaba el check y la base rechazaba todo el alta del resumen.
- Pasaba en el celular y en la computadora, para cualquier rol, desde que se corrió 0087.

El mismo defecto tenían otros cuatro avisos automáticos, que también fallaban desde 0087:

| Acción | Trigger |
|---|---|
| Alta de resumen de intervenciones | `notify_intervention_created()` |
| Cambio de estado del cuartel | `notify_station_status_change()` |
| Cambio de estado de un integrante | `notify_personnel_status_change()` |
| Cambio de estado de un vehículo | `notify_vehicle_status_change()` |

Se reprodujeron los cinco en Postgres 16 antes de corregirlos.

### 61.2 Corrección (migración `0104_attendance_summaries_and_station_notices.sql`)

**Avisos:** los cinco se rehacen con **un solo alcance, el cuartel**, y enlace a la ficha del cuartel.
- Es el mismo destino que ya elegía el envío de push para avisos con varios alcances (prioridad perfil > cuartel > subsede > Regional, 0087), así que el push llega a las mismas personas.
- En la campana los ven el cuartel, quienes tienen alcance sobre su subsede e Informática.

**Resumen de asistencia:**
- `total_members` y `present_average` dejan de ser obligatorios.
- Columna nueva `observations` (opcional, hasta 1000 caracteres).
- Trigger `trg_attendance_summaries_before_write`:
  - completa la **dotación** al dar de alta: `stations.personnel_count`, que la base ya calcula con el personal en estado "activo". Si el cuartel no tiene personal cargado queda vacía, no en 0;
  - no deja cargar a mano la dotación ni el promedio; en una edición conserva los valores que ya tenía;
  - valida con mensajes claros, que la pantalla muestra tal cual:
    - "La tasa de asistencia tiene que estar entre 0 y 100."
    - "La fecha de fin tiene que ser igual o posterior a la de inicio."
    - "El período no puede empezar en el futuro."
    - "Ya hay un resumen de asistencia de este cuartel del 01/09/2026 al 30/09/2026, que se superpone con este período. Editá ese resumen o elegí otras fechas."
  - la superposición se controla al dar de alta y al cambiar el período o el cuartel. Los resúmenes viejos que ya se superponían se pueden seguir editando.
- **RLS sin cambios:** cargan Informática (cualquier cuartel), el Secretario Regional (cuarteles de su Regional) y el Presidente, el Jefe de Cuerpo Activo y el usuario de carga (solo su cuartel).

### 61.3 Total de miembros y promedio de presentes

- **Total de miembros → Dotación.** No varía mes a mes: sale del Personal del cuartel. El formulario lo muestra como dato informativo ("Dotación: 28 integrantes activos. Sale del Personal del cuartel"). En cada resumen nuevo queda la dotación del momento del alta.
- **Promedio de presentes → no se pide ni se calcula.** No hay asistencia diaria por persona para calcularlo, y derivarlo de la tasa por la dotación no agregaría información real.
- **Resúmenes anteriores:** conservan el total y el promedio que se cargaron a mano. Se siguen viendo en la ficha del cuartel ("Dotación: 30 · promedio 24 presentes") y en los reportes.

### 61.4 Pantallas

**Formulario** (`/cuarteles/:id/asistencia/nueva` y `/asistencia/:id/editar`):
- El encabezado dice "Asistencia": en el celular ya no se corta. El título completo va en la página, con el cuartel.
- Campos: período (con atajos "Mes pasado", sugerido, y "Este mes"), tasa de asistencia y observaciones.
- La tasa acepta coma o punto y abre el teclado numérico del celular.
- Validación junto a cada campo antes de enviar: tasa entre 0 y 100, hasta dos decimales, fechas, período futuro.
- Al guardar vuelve al cuartel con "Resumen de asistencia del 01/09/2026 al 30/09/2026 guardado."
- Sin permiso, explica quién puede cargar.

**Ficha del cuartel:** cada resumen muestra fechas DD/MM/AAAA, la tasa, la dotación, las observaciones y, en los viejos, el promedio.

**Reportes** (Asistencias y General por cuartel):
- La columna "Miembros" pasa a "Dotación".
- "Presentes prom." aparece solo si algún resumen del reporte lo tiene.
- Los valores vacíos se muestran como "—".

**Errores de la base** (`src/lib/api/errors.ts`):
- Los CHECK conocidos y los rechazos de permisos por tabla tienen mensaje propio, por ejemplo "No tenés permiso para cargar asistencia de este cuartel."
- Un CHECK desconocido ya no dice "estado actual del registro", sino "Algún dato no cumple las reglas del sistema…".

### 61.5 Qué correr

1. SQL Editor → `0104_attendance_summaries_and_station_notices.sql` (después de 0102). Se puede volver a correr.
2. Desplegar el frontend.

Sin cambios en Edge Functions, push ni PWA.

### 61.6 Verificación

- **Postgres 16 local, 0104:** 30 pruebas, 0 fallas.
  - Alta con 72,3 y dotación tomada del personal activo (no la que manda la pantalla).
  - Aviso con un solo alcance, visible solo en su cuartel.
  - Tasa negativa o mayor a 100, fechas invertidas, período futuro, período repetido y superpuesto, período contiguo aceptado.
  - Permisos: otro cuartel e Instructor rechazados; Secretario Regional e Informática aceptados.
  - Histórico conservado al editar; la dotación no se pisa a mano.
  - Los cuatro avisos de cuartel restantes ya no fallan.
  - Se puede volver a correr y funciona en un proyecto nuevo.
- **Regresión SQL:** 0098, 0099, 0100, 0102 y 0103 siguen pasando.
- **Navegador** (Chrome; escritorio y Android emulado; backend simulado): 33 pruebas, 0 fallas.
  - Alta desde el celular con "72,3", sin los campos manuales y sin scroll horizontal.
  - Validaciones junto a cada campo.
  - Mensajes de la base: período repetido, sin permiso, aviso automático.
  - Sin permiso en la pantalla.
  - Histórico en la ficha y en la edición.
  - Los dos reportes generados con resúmenes viejos y nuevos.
- **Regresión en navegador:** secciones 57, 58, 59 y 60, menú "Nuevo" y menú lateral.

### 61.7 Checklist en producción

- [ ] Correr 0104 y cargar un resumen de asistencia desde el celular: se guarda y el cuartel recibe el aviso.
- [ ] Cargar un resumen de intervenciones y cambiar el estado de un vehículo: ya no dan error.
- [ ] Intentar cargar el mismo período dos veces: muestra el mensaje del período repetido.
- [ ] Generar el Reporte de Asistencias: resúmenes viejos con su total y promedio, nuevos con su dotación.

## 62. Roles de departamento y avisos de departamento (2026-10-06) — versión 1.7.0, migraciones 0105-0106

### 62.1 Qué faltaba

1. **Faltaban roles asignables para quien trabaja en un departamento.**
   - Al crear un usuario el sistema exige un rol, pero "coordinador" e "integrante" eran solo asignaciones en `departments` y `department_members`.
   - Para dar de alta a alguien que solo trabaja en un departamento había que ponerle un rol de relleno.
2. **Faltaban avisos de departamento.**
   - Había avisos de informe nuevo (0102), eventos y avisos manuales (0103).
   - No había avisos de informe archivado o editado, actividad registrada, "te sumaron", "ahora coordinás" ni aval nuevo.
   - Los avisos no mostraban de qué departamento venían.

### 62.2 Modelo

| Qué | Dónde |
|---|---|
| Rol (qué puede hacer) | `user_roles`: **`coordinador_departamento`** (Coordinador de Departamento) y **`miembro_departamento`** (Miembro de Departamento), en el grupo **Regional** |
| Departamento (dónde) | `departments.coordinator_profile_id` y `department_members`, sin cambios ni tablas nuevas |
| Acceso | **rol Y departamento**. Informática ve todo, como antes. |

Rol y departamento se mantienen sincronizados en la base (`sync_department_roles()`):

- **Al asignar a alguien** como coordinador (desde la ficha del usuario, el alta o la ficha del departamento) o al sumarlo como miembro (también si lo suma el coordinador), recibe el rol.
- **Al sacarlo de su último departamento,** se le quita el rol, salvo que sea su único rol. En ese caso queda en los pendientes de Informática.
- **Si se le quita el rol a mano,** deja de ver el departamento aunque siga figurando en él. Queda en los pendientes de Informática como "Figura en un departamento sin su rol".
- **Los usuarios Informática R4 no se tocan:** ven todo y sus roles solo los cambia otro Informática R4.

### 62.3 Migraciones

- **`0105_department_role_keys.sql`** (va **sola**: Postgres no deja usar un valor nuevo de un enum en la misma transacción): agrega `coordinador_departamento` y `miembro_departamento` a `role_key`, y `aviso_departamento` a `notification_type`.
- **`0106_department_roles_and_notices.sql`:**
  - **Helpers:**
    - nuevos con rol + departamento: `coordinates_department()` e `is_department_member()`;
    - rehechos: `is_department_member_or_coordinator()`, `my_department_ids()`, `can_notify_department()`, `can_view_department_reports()`, `can_manage_department_report()` (informes, adjuntos y Storage) e `is_school_department_coordinator()` (avales). `list_visible_departments()` calcula la relación con el rol.
  - **Policies:** las que daban acceso solo por figurar en el departamento pasan a usar los helpers: edición del departamento, miembros, integrantes sin usuario, actividad y edición o borrado de eventos de departamento.
  - **Sincronización:** triggers en `departments` y `department_members`, y carga de los roles de quienes ya coordinan o integran un departamento.
  - **Origen:** `notifications.department_id` (solo informativo). La vista `my_notifications` lo expone y se completa en los avisos ya enviados.
  - **Avisos**, solo al coordinador y a los miembros con su rol, activos (`department_recipient_ids()`, interna). Ver 62.5.
  - **Pendientes de Informática:** "Rol de departamento sin departamento" y "Figura en un departamento sin su rol". Los departamentos sin actividad usan `my_department_ids()`.

Ambas se pueden volver a correr. 0106 se detiene si falta 0105 o 0103, y funciona en un proyecto nuevo.

### 62.4 Funciones de usuarios (Edge Functions)

`admin-create-user` y `admin-update-user` validan los roles contra una lista fija. Sin agregar los nuevos, el alta respondería "Rol inválido.". Cambio mínimo, sin tocar su lógica:

- los dos roles en `RoleKey`/`ALL_ROLES`;
- en el alta, solo Informática puede asignarlos, porque sus departamentos los asigna Informática;
- en la edición, el Jefe de Cuerpo Activo no gestiona usuarios con esos roles, igual que con los de Avales.

**Hay que desplegarlas**, igual que en las secciones 5 y 6:

```bash
supabase functions deploy admin-create-user
supabase functions deploy admin-update-user
```

Si el alta se intenta sin desplegarlas, la pantalla lo explica en lugar de mostrar "Rol inválido.".

### 62.5 Avisos de departamento

| Hecho | A quién | Enlace |
|---|---|---|
| Informe o acta nuevo | Coordinador y miembros, menos quien lo cargó | Informe |
| Informe archivado o restaurado | Coordinador y miembros, menos quien lo hizo | Informe |
| Alguien edita tu informe | Solo el autor | Informe |
| Actividad registrada | Coordinador y miembros, menos quien la cargó | Departamento |
| Evento nuevo y recordatorio (0103) | Coordinador y miembros | Evento |
| Te sumaron a un departamento | El nuevo miembro, y su coordinador ("Nuevo miembro en …") | Departamento |
| Ahora coordinás un departamento | El nuevo coordinador | Departamento |
| Aval nuevo del departamento | Su coordinador (los miembros no ven avales) | Avales del departamento |
| Aviso manual al departamento | Coordinador y miembros, menos quien lo envía | Departamento |

**Cómo se evita que lleguen a otro departamento:**
- Todos son avisos **personales** (`profile_id`), uno por destinatario, y los destinatarios salen de `department_recipient_ids()`: el coordinador y los miembros de **ese** departamento con su rol, activos.
- Ningún aviso de departamento usa un alcance de Regional, subsede o cuartel.
- El push sale por el envío existente, una vez por aviso personal: no se duplica ni llega a otros.

**En pantalla:**
- origen "Departamento Fuego";
- filtro **Departamentos** para cualquier aviso que venga de un departamento;
- tipo nuevo "Aviso de departamento";
- lectura por usuario (0102);
- "Abrir" lleva al elemento.

En el aviso manual a un departamento, "Aviso de departamento" es el tipo sugerido.

### 62.6 Usuarios

**Alta:**
- Los dos roles aparecen en el grupo Regional, solo para Informática.
- Al marcar "Coordinador de Departamento" aparece **"Departamentos que coordina"**, y al marcar "Miembro de Departamento", **"Departamentos de los que es miembro"**. Se elige uno o más, con aviso si reemplaza a un coordinador.
- No deja guardar el rol sin departamento: lo dice junto a la lista y arriba del botón.
- Un usuario solo departamental pide la Regional y queda con alcance Regional.
- Vista previa "Coordinador de Departamento · Fuego".

**Ficha:**
- "Roles y dónde aplican" muestra "Coordinador de Departamento · Fuego", "Miembro de Departamento · FASME" y las inconsistencias ("Fuego: falta el rol, no tiene acceso").
- Los roles de departamento se ven en el selector, pero no se tildan sueltos: se asignan en la sección **Departamentos** (No, Miembro o Coordinador por departamento).
- Al guardar se recargan los roles.
- No deja sacar a alguien de todos sus departamentos si es su único rol.

**Guía de roles y Ayuda:** los dos roles figuran en el grupo Regional con División "Se asigna con uno o más departamentos". El artículo de administración pasa a "Asignar Coordinador o Miembro de Departamento".

### 62.7 Inicio y búsqueda

- **Inicio** (coordinador o miembro):
  - **"Pendientes y avisos"** del departamento elegido: sus pendientes del servidor (sin actividad reciente, eventos próximos) y sus avisos sin leer. Si no hay, "Todo al día en Fuego".
  - Más accesos: Ver informes, Ver eventos y Ver miembros, que llevan a esa sección de la ficha.
  - El saludo dice "Coordinador de Fuego · Miembro de Forestal", no el nombre genérico del rol.
- **Búsqueda:** sin cambios de código. Respeta rol + departamento porque los informes, eventos y departamentos se leen con la RLS. Un miembro de Fuego encuentra el acta de Fuego, uno de Forestal no; Informática encuentra todo.

### 62.8 Qué correr (en este orden)

1. SQL Editor → `0104_attendance_summaries_and_station_notices.sql` (sección 61), si no se corrió.
2. SQL Editor → `0105_department_role_keys.sql`, **sola**, y esperar a que termine.
3. SQL Editor → `0106_department_roles_and_notices.sql`.
4. `supabase functions deploy admin-create-user` y `supabase functions deploy admin-update-user`.
5. Desplegar el frontend. **Después de 0106:** el frontend nuevo toma el acceso a un departamento del rol, y sin la carga de roles de 0106 los coordinadores y miembros actuales no verían su departamento en la pantalla.

Sin cambios en push ni PWA.

### 62.9 Verificación

- **Postgres 16 local, 0106:** 48 pruebas, 0 fallas.
  - Roles cargados a quienes ya estaban en departamentos.
  - Sincronización: asignar coordinador o miembro agrega el rol; el coordinador anterior pierde el rol si tiene otro; si es su único rol, lo conserva; Informática R4 no se toca.
  - Permisos: Coordinador de Fuego ve Fuego y no Forestal; Miembro de Fuego ve Fuego y no FASME; Coordinador de Forestal y Miembro de Fuego ve los dos y distingue su relación; un rol sin departamento no ve ninguno; Informática ve todos.
  - Informes: un miembro de Forestal carga en Forestal y no en Fuego.
  - Avisos: informe nuevo, edición al autor, archivo, actividad, evento, aviso manual con "Aviso de departamento", te sumaron, nuevo miembro, ahora coordinás, aval al coordinador y no a los miembros. Ninguno a Forestal desde Fuego.
  - Origen en la bandeja y lectura por usuario.
  - Sin el rol: no ve el departamento, ni sus informes, ni sus avales, ni recibe sus avisos.
  - Pendientes de Informática.
  - Se puede volver a correr, funciona en un proyecto nuevo y se detiene sin 0105.
- **Regresión SQL:** 0098 (42), 0099 (26), 0100 (15), 0102 (20), 0103 (79) y 0104 (30) siguen pasando con el acceso por rol + departamento.
- **Navegador** (Chrome; escritorio y Android emulado; backend simulado): 40 pruebas, 0 fallas.
  - Alta de Coordinador + Fuego (bloqueo sin departamento, reemplazo, Regional, alcance, asignación).
  - Alta de Miembro + Forestal.
  - Ficha: roles bloqueados, único rol, cambio de departamento, dos departamentos, sin rol.
  - Usuario sin el rol: menú, URL y búsqueda.
  - Avisos con origen, filtro Departamentos, abrir el informe, aviso manual, otros departamentos.
  - Inicio con pendientes y avisos, "Todo al día", "Ver miembros".
  - Búsqueda por departamento en celular y escritorio.
  - Guía de roles.
- **Regresión en navegador:** secciones 57 (33), 58 (26), 59 (47), 60 (65, con el acceso por rol), 61 (33), menú "Nuevo" (8) y menú lateral (4).

### 62.10 Checklist en producción

- [ ] Correr 0105, 0106, desplegar las dos funciones y el frontend.
- [ ] Ficha de un coordinador existente: aparece "Coordinador de Departamento · su departamento".
- [ ] Crear un usuario con Miembro de Departamento + Forestal (sin otro rol): entra, ve solo Forestal y su Inicio muestra Forestal.
- [ ] Intentar crearlo sin departamento: no deja guardar.
- [ ] Cargar un informe en Fuego: llega el aviso (y el push) al coordinador y miembros de Fuego, no a Forestal.
- [ ] Marcarlo como leído con un miembro: sigue sin leer para el coordinador.
- [ ] Revisar los pendientes de Informática "Rol de departamento sin departamento" y "Figura en un departamento sin su rol".

### 62.11 Riesgos y decisiones

- **El acceso ahora pide el rol.** La carga de 0106 se los da a todos los que ya estaban asignados. Si alguien pierde el rol a mano, deja de ver su departamento (es lo pedido: el rol define qué puede hacer).
- **Avisos al Dpto. de Informática por cambios de rol.** Al sumar miembros, la base asigna el rol y el aviso existente de "Cambio de rol de usuario" les llega a Informática, como con cualquier asignación de rol.
- **Edición de informes:** se avisa solo al autor cuando lo edita otra persona, para no llenar de avisos al departamento.
- **Adjuntos:** sumar un archivo a un informe no genera un aviso aparte: lo cubre el aviso del informe.

## 63. Modo departamento: menú, Inicio y datos solo de lo que el rol usa (2026-10-06) — versión 1.8.0, migración 0107

### 63.1 Qué pasaba

1. **Quien solo era Coordinador o Miembro de Departamento veía el sistema entero.**
   - El menú tenía Cuarteles, Mapa, Escuela, Documentos e Inventario, y el Inicio traía accesos, eventos y estado de la Regional que no son de su trabajo.
   - Esas pantallas abrían vacías o con datos de la Regional.
2. **La base le entregaba datos de módulos que su rol no usa.** Medido con un usuario cuyo único rol es Miembro de Departamento, antes de 0107 leía por la API:
   - documentos y carpetas Regionales (el perfil lleva la Regional);
   - cursos e inventario completo (esas tablas las lee cualquier usuario con sesión);
   - eventos Regionales y los de Escuela;
   - los avisos generales de esos módulos.
3. **Los pendientes del Inicio mostraban cuarteles ajenos, a todos los roles.**
   - `get_pending_items()` es `SECURITY DEFINER`: lee la vista `station_compliance` con los permisos de quien creó la función, no con los de quien consulta. El comentario original daba por hecho lo contrario.
   - Resultado: cualquier usuario recibía los cuarteles en rojo o amarillo de **toda** la base, con el nombre del cuartel y un enlace que no podía abrir.

### 63.2 Qué es el modo departamento

Es la persona con **al menos un rol de departamento y ningún otro**. La pantalla lo calcula con `isDepartmentOnly` (`src/lib/moduleAccess.ts`) y la base con `is_department_only()` (0107): son el mismo criterio.

- **Con otro rol más** (Informática, Escuela, un cuartel…) **no hay modo departamento:** los permisos se suman y todo sigue como antes. Un perfil inactivo tampoco.
- Quien no tiene ningún rol no entra en el modo (queda como estaba).

| Módulo | Solo roles de departamento | Con otro rol |
|---|---|---|
| Inicio | Departamental | Inicio general y, además, el panel de su departamento |
| Departamentos | "Mi departamento" / "Mis departamentos" | "Departamentos" |
| Calendario | Solo eventos de su departamento | Como siempre |
| Notificaciones, Ayuda, Novedades, Mi perfil | Sí | Sí |
| Avales | Solo el **coordinador**, para su departamento: desde su Inicio y su ficha. No están en el menú | Como siempre |
| Roles y permisos | Página informativa: abre por URL y desde el perfil y la Ayuda, no está en el menú | En el menú |
| Cuarteles, Mapa, Escuela (cursos), Documentos, Inventario | No | Como siempre |
| Reportes, Usuarios, Nuevo usuario, Auditoría | No (ya eran de otros roles) | Como siempre |

### 63.3 Pantalla

- **Menú** (`navigation.ts`): cada ítem declara su módulo. Se muestran solo los que el modo abre y los que ya correspondían por rol.
  - Con un departamento el ítem dice **"Mi departamento"** y abre directo su ficha; "Atrás" vuelve a donde estaba, no a la lista.
  - Con varios dice **"Mis departamentos"** y muestra la lista.
- **URL directa** (`ModuleRoute`): cuarteles, mapa, Escuela, Documentos e Inventario muestran **"No tenés permiso para ver esta sección"**, qué hacer y "Volver al inicio".
  - Es el mismo aviso de Reportes, Usuarios y Auditoría. Su título por defecto pasó de "No tenés acceso…" a "No tenés permiso…".
  - Un Miembro que entra a Avales ve "No tenés permiso para ver Avales regionales" y vuelve al inicio, no a Escuela.
- **Inicio** (`DepartmentHome`): saludo con su rol y departamento ("Coordinador de Fuego"), y el panel del departamento con:
  - pendientes y avisos, o "Todo al día en Fuego";
  - últimos informes y próximos eventos;
  - acciones: cargar informe, nuevo evento, ver informes, eventos y miembros, y avisar al departamento (solo el coordinador);
  - selector si está en más de un departamento.
  - Abajo, accesos rápidos solo a lo que abre: Notificaciones, Calendario, Avales regionales (coordinador) y "Qué puedo hacer".
  - Sin estado de la Regional, tareas de otros módulos, eventos Regionales ni actividad reciente.
  - Si todavía no tiene departamento, lo dice y lleva a la Ayuda.
  - No consulta cuarteles, documentos, inventario ni cursos.
- **Búsqueda:** solo departamento, informes y actas, eventos de su departamento, avales (coordinador), notificaciones, Ayuda y Novedades. Los módulos cerrados ni se consultan.
  - **Novedades** pasó a ser un módulo de la búsqueda para todos los roles.
- **Ayuda:**
  - artículos de inicio, búsqueda y avisos propios del modo departamento;
  - nuevos: **"Ver mi departamento"**, **"Ver y descargar informes y actas"**, **"Qué puedo hacer con mi rol"** y **"Qué hacer si no veo una sección"**;
  - cada artículo declara su módulo: la ayuda de Inventario, Escuela y Documentos no se muestra a quien no los usa.
- **Notificaciones:** los avisos de su departamento con su origen. "Abrir" solo aparece si el destino es de su rol: sin botón que termine en un aviso de permiso. Los avisos generales con enlace a un módulo cerrado no se muestran.
- **Calendario:** solo los eventos de su departamento, con los tipos de un evento de departamento y un selector de departamento solo si tiene más de uno.

### 63.4 Base: `0107_department_only_mode.sql`

- **`is_department_only()`:** rol de departamento y ningún otro rol (`current_profile_id()` es null si el perfil está inactivo). Disponible también para `anon`: las políticas la evalúan en cualquier consulta y para quien no inició sesión devuelve `false`.
- **Políticas restrictivas de lectura** (se suman con AND a las que ya existen: solo pueden cerrar, **nunca abrir** ni relajar):
  - cuarteles y lo que cuelga de un cuartel: `stations`, `vehicles`, `vehicle_status_history`, `personnel`, `personnel_status_history`, `attendance_summaries`, `intervention_summaries`, `station_history_events`;
  - Documentos: `documents`, `document_versions`, `document_folders` y los archivos del bucket `documents`;
  - Escuela: `courses`, `course_stations`;
  - Inventario: `inventory_items`, `inventory_item_history`, `inventory_loan_requests`;
  - el mapa: `map_reference_points`.
- **Calendario:** `calendar_events` solo devuelve eventos de departamento (las reglas de Escuela y de la Regional los abrían).
- **Notificaciones:** se siguen recibiendo todas las dirigidas a la persona (incluidos los avisos de su departamento, que son personales) y los avisos generales sin enlace o con enlace a un módulo abierto.
  - Se cierran los avisos generales con enlace a un módulo cerrado: un curso nuevo, una circular, un préstamo, un evento regional.
  - Un aviso manual a toda la Regional sin enlace sigue llegando.
- **`get_pending_items()`:** tres cambios.
  - **Cuarteles:** el semáforo se filtra con el alcance real de cada persona, con el mismo criterio que `stations_select_scope`: Informática todos; roles regionales y de Escuela, los de su Regional; el resto, su cuartel y su subsede.
  - **Préstamos y eventos:** en modo departamento no se devuelven (ni siquiera si lo marcaron responsable de un elemento). Sí los eventos y pendientes de sus departamentos.
  - El resto de las secciones no cambia.
- **No se toca:** departamentos, miembros, informes, adjuntos y sus archivos, avales, el perfil, los roles, las Regionales y las subsedes (datos de referencia), ni la escritura de ninguna tabla.
- Se puede volver a correr y funciona en un proyecto nuevo. No agrega tablas ni datos.

### 63.5 Qué correr

1. SQL Editor → `0107_department_only_mode.sql` (requiere 0103 a 0106).
2. Desplegar el frontend.

El orden no rompe nada: el frontend nuevo no depende de 0107, y con 0107 puesta y el frontend anterior, el modo departamento recibe vacío en los módulos cerrados.

Sin funciones para desplegar y sin cambios en push ni PWA.

### 63.6 Verificación

- **Postgres 16 local, 0107:** 88 pruebas, 0 fallas. Cada usuario se mide con las políticas de 0107 y sin ellas:
  - para Informática, Presidente de cuartel, Escuela, Secretario Regional y para quien combina Coordinador con un rol de cuartel **no hay ninguna diferencia** en ninguna tabla;
  - quien solo es Coordinador o Miembro de Departamento recibe 0 filas de cuarteles, vehículos, personal, asistencia, intervenciones, documentos, carpetas, versiones, archivos, cursos, inventario y mapa, y solo los eventos de su departamento;
  - lo suyo no cambia: sus departamentos, miembros, informes, adjuntos, avales (el coordinador, no el miembro) y las Regionales y subsedes;
  - notificaciones: sus avisos personales y los generales abiertos; no los de Escuela, Documentos ni evento regional;
  - quien tiene rol de departamento y ningún departamento no ve ninguno, y un perfil inactivo no cuenta como modo departamento;
  - Storage: el archivo de un informe de Fuego lo leen su coordinador, sus miembros e Informática; no el coordinador de otro departamento (FASME) ni quien tiene el rol sin departamento; 0107 no cambia nada ahí. Los archivos de Documentos quedan cerrados para el modo departamento;
  - sin sesión (`anon`) ninguna política falla por la función;
  - pendientes: cada rol recibe solo los cuarteles que su RLS le deja ver (Informática 2; el Presidente, el suyo); en modo departamento, ningún cuartel ni préstamo y solo el evento de su departamento.
- **Regresión SQL:** 0098 (42), 0099 (26), 0100 (15), 0102 (20), 0103 (79), 0104 (30) y 0106 (48) siguen pasando con 0107 aplicada. También se aplicó dos veces en la misma base y sobre una base nueva.
- **Navegador** (Chrome; escritorio y Android emulado; backend simulado que además aplica lo de 0107): 127 pruebas, 0 fallas.
  - **Coordinador y Miembro:** menú reducido; Inicio departamental sin widgets globales; "Todo al día"; acceso de cada enlace visible del menú y del Inicio comprobado uno por uno; URL directa a 15 pantallas cerradas con "No tenés permiso"; sus pantallas abren; el Miembro sin acciones de gestión ni Avales; otro departamento no se puede ver.
  - **Varios departamentos:** selector, "Mis departamentos", y "Mi departamento" que abre directo y vuelve atrás al Inicio.
  - **Búsqueda:** Fuego encuentra Fuego y no Forestal, sin consultar inventario, documentos, cursos ni cuarteles; Informática encuentra todo; Novedades se busca para todos.
  - **Notificaciones:** origen, filtro, "Abrir" solo a destinos permitidos, avisos generales de módulos cerrados fuera.
  - **Ayuda:** las guías de cada rol y ninguna de módulos cerrados.
  - **Roles combinados:** Informática + Miembro, Escuela + Miembro, Coordinador + cuartel y Jefe conservan lo de sus roles; los demás menús no cambian.
  - **Celular:** menú reducido, Inicio, búsqueda, notificaciones, aviso de permiso sin scroll horizontal, y carga de un acta con foto de la cámara.
  - **Perfil, Roles y Novedades:** muestran "Coordinador de Departamento · Fuego", abren sin pedir cuarteles, y una novedad encontrada con la lupa abre esa versión.
- **Regresión en navegador:** secciones 57 (33), 58 (26; ahora con la versión 1.8.0), 59 (47 y 4), 60 (65), 61 (33), 62 (40) y menú (8).
- **Build, lint y audit:** el build compila; lint sin errores y con las mismas 8 advertencias de antes; audit sin vulnerabilidades.

### 63.7 Checklist en producción

- [ ] Correr 0107 y desplegar el frontend.
- [ ] Entrar con un usuario que solo sea Coordinador de Departamento: el menú tiene Inicio, Calendario, Mi departamento, Notificaciones, Mi perfil y ajustes, Ayuda y Novedades. El Inicio muestra su departamento y no el estado de la Regional.
- [ ] Con ese usuario, abrir a mano `/documentos`, `/inventario`, `/cuarteles` y `/escuela`: cada una dice "No tenés permiso para ver esta sección".
- [ ] Con un usuario solo Miembro de Departamento: mismo menú, sin "Avisar al departamento" ni Avales, y "Todo al día" si no hay pendientes.
- [ ] Un usuario con Coordinador de Departamento **y** un rol de cuartel: sigue viendo Cuarteles, Documentos e Inventario además de su departamento.
- [ ] Un Presidente de cuartel: ya no recibe en sus pendientes los cuarteles de otras Regionales o subsedes; sí el suyo.
- [ ] Buscar "fuego" con el Coordinador de Fuego: encuentra su departamento y no Forestal. Buscar un elemento del inventario: sin resultados.
- [ ] Cargar un informe desde el celular con ese usuario.

### 63.8 Riesgos y decisiones

- **Quien tiene un solo rol de departamento pasa a ver mucho menos.** Es lo pedido. Si alguien necesita Documentos, Inventario u otro módulo, se le asigna el rol que corresponde: los permisos se suman. Los usuarios que ya tenían otro rol además del de departamento no cambian.
- **Los avisos generales manuales siguen llegando al modo departamento** si no llevan enlace (por ejemplo un aviso a toda la Regional escrito a mano). Se descartan los automáticos que apuntan a un módulo cerrado. El tipo del aviso (por ejemplo "Circular nueva") no alcanza para distinguirlos, porque el formulario manual usa esos mismos tipos.
- **El calendario del modo departamento solo muestra eventos de su departamento.** Los eventos Regionales y de Escuela no se ven. Si más adelante conviene mostrarlos, es un cambio en la política de `calendar_events` y en la pantalla.
- **Avales sí, Escuela no.** El coordinador de un departamento sigue subiendo y viendo los avales de su departamento (ya era su función desde 0097), por el Inicio y la ficha. Cursos no.
- **Roles y permisos queda abierto por URL** aunque no esté en el menú del modo departamento: es solo informativo y se llega desde el perfil y la Ayuda.
- **La corrección de `get_pending_items()` cambia lo que ven otros roles:** los pendientes de cuarteles ahora son solo los de su alcance. Antes veían todos los cuarteles de la base, con un enlace que no podían abrir. Informática ve todos, como antes. El criterio es el mismo de `stations_select_scope`; se verificó rol por rol contra la RLS real.
- **Quien no tiene ningún rol no entra en el modo departamento** y queda como estaba.

## 64. Aviso de novedades usable en el celular y contacto directo con Informática (2026-10-07) — versión 1.9.0

Sin migración, sin funciones para desplegar y sin cambios en permisos, RLS, push ni PWA. Solo el frontend.

### 64.1 Qué pasaba

1. **El aviso de novedades al ingresar no se podía usar en el celular.**
   - Era una tarjeta fija, pegada al borde inferior de la pantalla, **sin altura máxima ni desplazamiento interno**, con la lista completa de cambios de la versión (la 1.8.0 traía 8, de dos a cuatro renglones cada uno).
   - En una pantalla chica la tarjeta era más alta que la pantalla. Como estaba anclada abajo, crecía hacia arriba: el título y la **X** quedaban fuera de la pantalla, y al ser fija no se podía desplazar (deslizar movía la página de atrás). No quedaba claro cómo cerrarlo.
2. **Ayuda decía "escribile a Informática" sin dar cómo.** Quien olvidó la contraseña ni siquiera llega a Ayuda, que está detrás del ingreso.

### 64.2 Aviso de novedades

La tarjeta se reparte en tres partes:

| Parte | Qué hace |
|---|---|
| Encabezado fijo | Etiqueta de la versión y la **X** (40 px) arriba a la derecha |
| Cuerpo | Es lo único que se desplaza, con sombras arriba y abajo cuando hay más texto |
| Pie fijo | **"Entendido"** y **"Ver todas las novedades"**, siempre a la vista |

- **Altura máxima según la pantalla:** `100dvh` menos el margen (con `100vh` de respaldo para navegadores viejos), que sigue a la barra del navegador del celular y respeta las muescas. En escritorio, hasta 560 px. Nunca se sale de la pantalla.
- **Pantallas bajas** (celular de costado): los botones pasan a una fila para dejar lugar al texto.
- **Es un resumen, no el historial de la versión.** Muestra hasta **3 puntos**:
  - los `highlights` de la novedad (frases cortas escritas para el aviso), o
  - si no los tiene (versiones anteriores), sus primeros cambios, cortados a 3 renglones.
  - Si la versión tiene más cambios: "Esta versión trae N cambios en total: los ves todos en Novedades".
  - **Novedades** (`/novedades`) sigue mostrando todas las versiones con todos sus cambios, sin cambios.
- **Cómo se publica una novedad:** a la entrada de `src/config/appUpdates.ts` se le agrega `highlights` (2 o 3 frases de hasta unos 90 caracteres). Está explicado en el encabezado del archivo.
- **Cerrar:** la X, "Entendido", la tecla Escape, o "Ver todas las novedades" (que además abre Novedades). Todos lo dejan como visto, igual que antes: no vuelve a aparecer en ese navegador.
- **Sigue sin bloquear** la pantalla de atrás (decisión anterior).
- **Teclado y lectores de pantalla:**
  - al abrirse, el foco entra al aviso, y vuelve adonde estaba al cerrarlo;
  - Tab recorre la X, el texto (se desplaza con las flechas), "Entendido" y "Ver todas", y después sigue a la aplicación: no queda atrapado;
  - Escape solo lo cierra si el foco está adentro, para no pisar a la búsqueda;
  - tiene título y descripción asociados.
- Reabrir una versión vieja tocando su notificación también muestra el resumen.
- **Fecha:** se leía "7 De Octubre De 2026" por una regla vieja de mayúsculas; ahora dice "7 de octubre de 2026".

### 64.3 Contacto con Informática y Estadística

**Una sola fuente:** `src/config/support.ts` (nombre, email, WhatsApp y armado de los enlaces) y el componente `SupportContact`. Para cambiar un dato de contacto se toca solo ese archivo.

- **Email:** `mailto:dptoinformaticayestadisticar4@gmail.com`, con asunto "Consulta sobre SIGER4" y el mensaje en el cuerpo. Abre el programa de correo del dispositivo.
- **WhatsApp:** `https://wa.me/5493573467529?text=…`. El número se toma como celular de Argentina (`3573467529`) y se le agrega el `+549` con el mismo helper que ya usan los contactos de cuarteles (`lib/contact.ts`). Se abre en otra pestaña, sin pasarle la página a WhatsApp (`noopener`). En el celular abre la aplicación si está instalada.
- **Mensaje precargado:** `Hola soy [nombre] y tengo una duda/problema con SIGER4`.
  - El nombre es el nombre completo del perfil, con espacios y saltos de línea normalizados y hasta 60 caracteres (se corta por caracteres completos, no por mitad de un emoji).
  - Sin nombre (o en blanco, o sin sesión): `Hola soy usuario de SIGER4 y tengo una duda/problema con SIGER4`.
  - Se codifica con `encodeURIComponent` (tildes, `/`, comillas, `&`, `<`).
  - **No lleva nada más:** ni el email de la persona, ni su rol, cuartel, identificadores, sesión o datos técnicos.

**Dónde está:**

| Lugar | Cómo |
|---|---|
| **Ayuda** | Tarjeta "¿Necesitás ayuda?" al final: botones **"Enviar email"** y **"Contactar por WhatsApp"** y los datos a la vista (email y número). Un toque largo selecciona el dato entero para copiarlo. Reemplaza al texto suelto de antes |
| Respuestas de Ayuda que mandan a Informática | Los mismos dos botones al final: "Qué hacer si no tengo permiso", "No veo una sección del menú" (y su versión del modo departamento), "Olvidé mi contraseña" y "No veo un departamento o sus informes". Se marcan con `contact: true` en `helpContent.ts` |
| Pantallas "No tenés permiso" | El componente común `AccessDenied` suma los dos botones. Cubre Reportes, Usuarios, Auditoría, Avales, los módulos cerrados del modo departamento y el departamento que no se puede ver |
| Ingreso | Los dos botones debajo de "¿Olvidaste la contraseña…?". Es el único lugar al que llega quien no puede entrar. Sin sesión se usa el mensaje sin nombre |

**Lo que no se tocó:** los textos sueltos de otras pantallas ("pedile a Informática…") siguen siendo texto: no se convirtió cada pantalla en soporte técnico. Quien los lee tiene el contacto en Ayuda y en cualquier pantalla de permiso.

### 64.4 Qué correr

Nada en la base: sin migración. Desplegar el frontend (con Vercel, el push a `main`).

### 64.5 Verificación

- **Navegador** (Chrome; backend simulado; escritorio y Android emulado): 207 pruebas, 0 fallas.
  - **Aviso:** pantalla chica (320×568), Android (360×640), de costado (640×360) y escritorio (1366×860), cada una en **modo claro y oscuro**.
    - Entra completo, con la X arriba a la derecha y "Entendido" y "Ver todas" a la vista.
    - Nada los tapa (se comprueba qué elemento queda arriba en cada botón), sin desborde horizontal.
    - Contraste legible (mínimo 4,5:1) y fecha bien escrita.
  - **Mucho texto** (25 cambios largos más un resumen enorme, en las cuatro pantallas): la tarjeta sigue entrando, el cuerpo se desplaza hasta el final, la X y "Entendido" siguen a la vista y la pantalla de atrás no se mueve.
  - **Cerrar:** con la X, con "Entendido" y con Escape queda como visto y **no reaparece al volver a ingresar**. "Ver todas las novedades" abre la página completa con las 12 versiones.
  - **Teclado:** el foco entra al aviso, Tab recorre X → texto → Entendido → Ver todas y sigue a la aplicación, Enter en la X lo cierra, Escape de la búsqueda no lo cierra.
  - **Reabrir una versión vieja** desde Notificaciones: 3 puntos y "8 cambios en total", dentro de la pantalla.
  - **Contacto:** el email es un `mailto:`; WhatsApp abre `wa.me/5493573467529` con el mensaje (se comprobó la URL que realmente se abre); nombre real, sin nombre, en blanco, con saltos de línea y comillas, y de 80 emojis (se corta a 60). Privacidad: el mensaje no contiene el email personal, el rol, identificadores ni datos técnicos.
  - **Celular de 320 px, claro y oscuro:** la tarjeta de Ayuda sin scroll horizontal, botones del ancho de la tarjeta y el email partido en la arroba.
  - **Otras pantallas:** respuestas de Ayuda con contacto (y sin él donde no corresponde), pantalla de permiso con el nombre de quien está logueado, ingreso en 320 px y escritorio, claro y oscuro.
- **Regresión en navegador:** se repitieron las secciones 57 a 63 (33, 26, 51, 65, 33, 40, 127 y menú 8) y siguen sin fallas. La 58 ahora espera la versión 1.9.0.
- **Build, lint y audit:** el build compila; lint sin errores y con las mismas 8 advertencias de antes; audit sin vulnerabilidades.
- **No se probó** en un celular real con WhatsApp y un programa de correo instalados (queda en el checklist).

### 64.6 Checklist en producción

- [ ] Después del deploy, ingresar con el celular: el aviso de la 1.9.0 entra completo, muestra 2 puntos, se desplaza si hace falta y se cierra con la X. Al volver a ingresar no reaparece.
- [ ] Ayuda → "Enviar email": abre el programa de correo con la dirección del Dpto., el asunto y el mensaje con tu nombre.
- [ ] Ayuda → "Contactar por WhatsApp": abre el chat con el número del Dpto. y el mensaje con tu nombre.
- [ ] Entrar por URL a una sección sin permiso (por ejemplo `/auditoria` con un usuario común): aparece "No tenés permiso" con los dos botones.
- [ ] Cerrar sesión: en el ingreso aparecen los dos botones debajo de "¿Olvidaste la contraseña…?".

### 64.7 Riesgos y decisiones

- **El aviso no bloquea la pantalla de atrás** (como antes): en el celular tapa la parte de abajo hasta cerrarlo. Si más adelante conviene un fondo oscurecido que se cierre al tocar afuera, es un cambio de estilo y de un manejador de toque.
- **WhatsApp sin la aplicación instalada** abre WhatsApp Web o la página de `wa.me`. **El email** necesita un programa de correo configurado en el dispositivo; por eso la dirección queda a la vista para copiarla.
- **El número se toma como celular de Argentina** sin 0 ni 15. Si el Dpto. cambia de número, se cambia en `src/config/support.ts`.
- **El contacto en el ingreso es nuevo** y no estaba pedido; es una línea en `LoginPage.tsx` (y se puede sacar sin tocar nada más).
- **El texto de cada punto del aviso se corta a 3 renglones.** Si una versión tiene un punto largo, el resto se lee en Novedades. Para controlar qué se ve, la novedad lleva `highlights`.

## 65. Dotación actual del cuartel por categorías y lenguaje institucional (2026-10-07) — versión 1.10.0, migración 0108

Una migración (0108) y el frontend. Sin Edge Functions, sin push ni PWA, sin cambios en roles y sin relajar ninguna política existente: la RLS nueva es solo de la tabla nueva.

### 65.1 Qué faltaba

1. **Cargar la dotación era cargar nombres.** La "dotación" de un cuartel salía de contar el personal activo de un registro nominal (`personnel`), de modo que para tener el número había que dar de alta a cada persona. Para gestión y reportes alcanza con saber cuántos integrantes hay en cada categoría.
2. **Textos con distinto tono.** Había "Informática R4", "Escribile a…", "Contactá a un administrador", "No tenés permisos", "Error al cargar…", "No se encontró…", y "Personal" y "Dotación" para lo mismo.

### 65.2 Dotación actual del cuartel

Una **ficha por cuartel, editable**, con cantidades por categoría. No es una carga mensual ni anual: se actualiza cuando cambia la dotación real.

| Grupo | Categorías |
|---|---|
| Aspirantes | Aspirantes menores · Aspirantes mayores |
| Bomberos | Bomberos Nivel 1 · Nivel 2 · Nivel 3 · Nivel 4 |
| Reserva y cuerpo auxiliar | Personal en reserva · Cuerpo auxiliar |

**Categorías que no se agregaron** (para no inventar): cadetes, oficiales, suboficiales y comisión directiva. Los oficiales y suboficiales son jerarquías dentro de los niveles (contarlos aparte duplicaría gente) y la comisión directiva no es dotación operativa. Si hace falta alguna, es una columna más y una fila más en `src/lib/staffing.ts`.

**Tabla `station_staffing`** (una fila por cuartel, `station_id` como clave primaria):

- Ocho columnas enteras, `not null default 0`, con una regla de 0 a 9999 cada una (`station_staffing_counts_range`).
- **`total` es una columna calculada por la base** (suma de las ocho): no se puede escribir, ni a mano ni desde la API.
- `updated_at`, `updated_by_profile_id` y `updated_by_name` los completa **la base**, siempre (un disparador antes de escribir): lo que mande el cliente se ignora. La dotación no se puede pasar a otro cuartel.

**Una sola cifra de dotación (sin duplicar fuentes de verdad).** `stations.personnel_count` sigue siendo *el* número que usan Asistencia, tarjetas, Inicio y reportes. Lo completa la base:

| Situación del cuartel | `personnel_count` |
|---|---|
| Cargó la dotación por categorías | La suma de las categorías (`station_staffing.total`) |
| Todavía no la cargó | El personal activo del registro nominal, como hasta ahora |

- **Los cuarteles existentes conservan su número** hasta que carguen la dotación. No se calcula ni se inventa nada.
- Con la dotación cargada, dar de alta, de baja o pasar a licencia a alguien del registro nominal **no la pisa**.
- Si se borra la fila de dotación, vuelve el conteo nominal.
- Pasar gente de una categoría a otra (mismo total) no genera un cambio en el cuartel ni en su auditoría.
- El registro nominal **sigue existiendo y ahora es opcional** (la ficha lo dice: "no hace falta cargar nombres").
- Función auxiliar `station_dotation_total(uuid)`: sin permisos para la API (solo la usan los disparadores).

### 65.3 Permisos

Los **mismos que la carga de personal** (0027). No se relajó nada.

| Rol | Carga | Ve |
|---|---|---|
| Informática (y su integrante) | Cualquier cuartel | Todas |
| Secretario Regional | Cuarteles de su Regional | Los de su Regional |
| Presidente, Jefe de Cuerpo Activo, usuario de carga | **Solo su cuartel** | Su cuartel (y su subsede) |
| Roles de Escuela | No | Solo si tienen un cuartel en su alcance |
| Modo departamento (0107) | No | No: una política restrictiva (`not is_department_only()`) cierra la tabla |
| Sin sesión | No | No |

Lo comprobado en la base, con usuarios de cada rol: quien no tiene permiso recibe `42501` al guardar; el Presidente y el usuario de carga no pueden guardar en **otro cuartel**; un Miembro o Coordinador de Departamento no guarda ni lee, aunque tenga un cuartel asignado; `anon` ve 0 filas.

La pantalla refleja la regla (quien no edita ve la dotación sin controles), pero la que decide es la base.

### 65.4 Pantallas

- **Ficha del cuartel → "Dotación actual"** (ancla `#dotacion`). Quien puede editar ve una tarjeta con las ocho categorías, el total en vivo y el botón **Guardar dotación**. Quien no, ve la lista de solo lectura y quiénes la actualizan.
- **Cantidad con botones − y +** (`NumberStepper`, reutilizable):
  - teclado numérico en el celular (`inputmode="numeric"`, `pattern="[0-9]*"`) y texto de 16 px (el celular no hace zoom);
  - **solo enteros desde 0**: una letra, un signo o un punto se descarta y se avisa ("Solo números enteros, desde 0."); no baja de 0 ni pasa de 9999; un campo vacío vuelve a 0;
  - flechas arriba/abajo suman o restan 1, RePág/AvPág 10; botones de 44 px o más;
  - **el total no se escribe**: se calcula mientras se carga ("(antes N)" si hay cambios sin guardar).
- **Estados:** cargando, error al cargar (con "Reintentar"), guardando (los controles se bloquean), guardado ("Dotación guardada. Total: N."), error al guardar (lo cargado no se pierde), sin permiso (mensaje claro), sin dotación cargada todavía, y "Cargá al menos una categoría antes de guardar" si se guarda en blanco. Muestra **fecha y quién actualizó**.
- **Asistencia:** ya no hay "total de miembros". El resumen toma la dotación del cuartel al darlo de alta y la **guarda como dato histórico** (`attendance_summaries.total_members`, 0104): si la dotación cambia después, los resúmenes anteriores no se modifican. Si el cuartel no cargó su dotación, el formulario lo avisa y lleva a la ficha ("Cargar la dotación", directo a la tarjeta).
- **Lista de cuarteles, ficha, Inicio:** dicen **Dotación** y **Móviles**. Inicio suma "Dotación total" de la Regional.
- **Reportes (PDF):**
  - *Reporte del cuartel:* "Dotación" en el resumen y cuadro "Dotación actual" por categoría.
  - *Regional consolidado:* columna Dotación por cuartel y cuadro "Dotación por categoría" con los totales.
  - *Asistencias:* aclara que la dotación es la que tenía el cuartel al cargar cada resumen, no la actual.
- **Ayuda:** sección "Cuarteles y dotación" con "Qué es la dotación del cuartel" (para todos) y "Cargar la dotación del cuartel" (solo para quien la edita). Se encuentran con el buscador de Ayuda; en modo departamento no se muestran.
- **Tareas pendientes de Inicio** (`get_pending_items()`): el texto ahora dice "Falta cargar la dotación actual del cuartel." (antes "personal activo") y "Falta cargar los móviles del cuartel.", y el enlace de "falta la dotación" lleva directo a `#dotacion`. Se cambia el texto partiendo de la definición que está en la base (la migración no copia la función), conserva `SECURITY DEFINER` y `search_path`, y si ya está cambiado no hace nada.

### 65.5 Lenguaje institucional

**Criterios**

- Se habla como una herramienta interna del Cuerpo: **Cuartel, Regional, Departamento, Dotación, Aspirantes, Bomberos, Reserva, Cuerpo Auxiliar, Informática y Estadística, Acta, Informe, Asistencia, Personal, Novedades, Permisos, Rol, Alcance**.
- Siempre **"Regional"**, nunca "Región" en pantalla (en el código quedan comentarios que usan la palabra; no se ven).
- **"Móviles"** para los vehículos del cuartel (en las tarjetas y Inicio).
- Frases cortas, en voseo, que dicen qué pasó y qué hacer. Sin jerga técnica ni errores crudos.
- **Una sola derivación para consultas: "Consultá a Informática y Estadística"** (con los botones de contacto de la sección 64 donde hay lugar).

**Textos corregidos (por tipo)**

| Antes | Ahora |
|---|---|
| "No tenés permisos para cargar …" | "No tenés permiso para cargar … con tu rol actual." |
| Título de pantalla sin permiso | "No tenés permiso para acceder a esta sección con tu rol actual" |
| "Escribile al Dpto. de Informática y Estadística R4…" / "Contactá a un administrador" / "Pedile a Informática R4…" | "Consultá a Informática y Estadística…" |
| "Error al cargar …" | "No pudimos cargar …. Reintentá en unos segundos." |
| "No se encontró …" | "No encontramos …" |
| "No pudimos determinar tu cuartel asignado. Contactá a un administrador." | "No pudimos identificar tu cuartel. Consultá a Informática y Estadística." |
| Error genérico de la base | "No pudimos completar la acción. Intentá de nuevo; si sigue fallando, consultá a Informática y Estadística." |
| Cuartel: "Personal" (tarjeta, ficha, Inicio) | "Dotación" |
| Motivos del semáforo: "Falta cargar personal activo", "Faltan cargar vehículos" | "Falta cargar la dotación", "Faltan cargar los móviles" |
| Pantalla de personal | "Nuevo integrante" / "Editar integrante" / "Registro de personal", con la aclaración de que la dotación se carga en la ficha, sin nombres |

Alcanza a: pantalla sin permiso, ingreso y recuperación de contraseña, rutas de módulo y de Avales, Inicio y modo departamento, formularios (cuarteles, personal, intervenciones, vehículos, historial, calendario, notificaciones, cursos, documentos, inventario, préstamos, avales, departamentos, usuarios), listas y detalles, Auditoría, Ayuda, errores de la API, reportes PDF, y los motivos del semáforo.

**Lo que no se tocó**

- El nombre del rol **"Informática R4"** en descripciones de roles, porque es el nombre del rol.
- La etiqueta de auditoría `personnel_count` ("Cantidad de personal"): es la misma columna que usa `intervention_summaries` (personal que intervino).

### 65.6 Qué correr

1. **Supabase → SQL Editor:** ejecutar `0108_station_staffing.sql` completo. Es idempotente (se puede repetir). Debe haberse corrido antes `0107` (y las anteriores, si todavía faltaran).
2. **Verificar** que quedó aplicada (devuelve una fila por migración, `aplicada` o `FALTA`):

```sql
select nombre,
       case when aplicada then 'aplicada' else 'FALTA' end as estado
from (values
  ('0103 roles por división',               exists (select 1 from pg_proc where proname = 'list_visible_departments')),
  ('0104 resumen de asistencia',            exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'attendance_summaries' and column_name = 'observations')),
  ('0105 roles de departamento (valores)',  exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'role_key' and e.enumlabel = 'coordinador_departamento')),
  ('0106 roles y avisos de departamento',   exists (select 1 from pg_proc where proname = 'sync_department_roles')),
  ('0107 modo departamento',                exists (select 1 from pg_proc where proname = 'is_department_only')),
  ('0108 dotación del cuartel',             to_regclass('public.station_staffing') is not null and exists (select 1 from pg_proc where proname = 'station_dotation_total'))
) as m(nombre, aplicada)
order by nombre;
```

3. **Frontend:** Vercel despliega solo con el push a `main`. Conviene correr la migración **antes** de abrir la ficha nueva: sin la tabla, la tarjeta de dotación muestra un aviso de error con "Reintentar" (el resto de la ficha funciona).
4. **No hay** Edge Functions que desplegar ni variables nuevas.

### 65.7 Verificación

- **Base de datos** (PostgreSQL 16 local; migraciones 0001 a 0108 en una base armada de cero y en otra con datos): **49 pruebas, 0 fallas** en el test de 0108.
  - **Cuenta y reglas:** el total es la suma de las 8 categorías; negativos y más de 9999 se rechazan (`23514`); el total no se puede escribir; una fila por cuartel; no se puede pasar a otro cuartel ni a uno inexistente; todo arranca en 0.
  - **Una sola cifra:** sin dotación por categorías cuenta el personal activo; con ella, su total; sumar, dar de baja o pasar a licencia en el registro nominal no la pisa; borrarla vuelve al conteo nominal; mover gente de una categoría a otra (mismo total) no toca el cuartel ni su auditoría; cambiar el total sí queda en la auditoría del cuartel.
  - **Asistencia:** el resumen toma la dotación del cuartel; uno nuevo toma la nueva y **el viejo conserva la que tenía**, incluso si se lo edita.
  - **Permisos** (usuarios de cada rol, con la base real): el Presidente y el usuario de carga guardan en su cuartel y **no en otro** (`42501`); el Secretario Regional guarda en su Regional; Informática en cualquiera; Escuela y modo departamento no guardan; ven todas Informática y el Secretario Regional, y solo la suya el Presidente y el usuario de carga; Escuela y modo departamento ven 0; sin sesión, 0. Sin la política restrictiva, un Miembro con cuartel asignado la vería: es lo que cierra.
  - **Autor y fecha:** quien guarda queda como autor aunque el cliente mande otro; el nombre sale del perfil.
  - **Funciones internas:** `station_dotation_total()` no se puede llamar desde la API.
  - **Tareas pendientes:** el texto dice "Falta cargar la dotación actual del cuartel.", el enlace lleva a `#dotacion` y vuelve al enlace común cuando la dotación está cargada; ya no hay "personal activo".
  - **Idempotencia:** la migración se volvió a correr dos veces en cada base sin errores.
  - **Regresión de la base:** los tests de 0098, 0099, 0100, 0102, 0103, 0104, 0106 y 0107 (42, 26, 15, 20, 79, 30, 48 y 88 pruebas) siguen sin fallas.
- **Navegador** (Chrome; backend simulado con la RLS de la dotación emulada por rol; escritorio y Android emulado): **151 pruebas, 0 fallas.**
  - **Controles:** son 8, en 3 grupos y en orden; teclado numérico y 16 px; botones − y + (el − se deshabilita en 0, el + en 9999); flechas y RePág/AvPág; **letras, signos y negativos no entran** (queda el aviso); más de 9999 se frena; vacío vuelve a 0.
  - **Carga:** las 8 categorías con total en vivo (45), sin campo de total ni de nombres; "(antes N)" y "Descartar cambios"; guardar envía **solo el cuartel y las 8 cantidades**; queda la fecha y el autor; la ficha y la lista de cuarteles muestran el total nuevo; al volver a entrar están las cantidades.
  - **Estados:** cargando, guardando (botón y controles bloqueados), guardado, error al guardar (no se pierde lo cargado), error al cargar (con "Reintentar" y el resto de la ficha funcionando), guardar en blanco.
  - **Permisos en la pantalla** (14 casos): Informática, su integrante, Secretario Regional, Jefe, Presidente y los usuarios de carga editan **solo donde corresponde**; en otro cuartel, Escuela y los demás la ven sin controles. Perder el rol entre que se abre y se guarda: la base rechaza y la pantalla dice "No tenés permiso para cargar la dotación de este cuartel con tu rol actual", sin guardar nada. Modo departamento: pantalla de permiso y **ni se consulta la tabla**.
  - **Asistencia:** muestra la dotación (45) y que sale del cuartel; **no hay campo de total**; sin dotación avisa y el enlace "Cargar la dotación" abre la ficha **con la tarjeta a la vista**; guardar el resumen funciona.
  - **Reportes:** se generan los PDF del cuartel, del Regional consolidado y de Asistencias; nombran la dotación y piden la tabla a la base. **Inicio:** "Dotación total" suma la de todos los cuarteles y las tarjetas dicen Dotación y Móviles.
  - **Ayuda:** las dos guías según el rol (la de carga solo para quien edita; nada en modo departamento) y la búsqueda de "dotación".
  - **Lenguaje:** 18 pantallas, con un Administrador y un Presidente, sin "Región", "Escribile al", "No tenés permisos", "Error al cargar", "No se encontró" ni "Contactá a…"; las pantallas sin permiso y los errores de carga dicen lo nuevo.
  - **Celular** (320×568, 360×640 y 1366×860, claro y oscuro): sin desborde, botones de 44 px o más, 9999 se lee completo, contraste de al menos 4,5:1.
- **Regresión en navegador:** se repitieron las secciones 57 a 64 (33, 26, 51, 65, 33, 40, 127 y 207, y el menú 8) y siguen sin fallas. Hubo que actualizar aserciones que esperaban textos cambiados a propósito (versión 1.10.0, "Consultá a Informática y Estadística", "con tu rol actual", "Sale de la dotación actual del cuartel").
- **Build, lint y audit:** el build compila; lint sin errores y con las mismas 8 advertencias de antes; audit sin vulnerabilidades.
- **No se probó** en un celular real (teclado numérico) ni con la migración corrida sobre la base de producción: lo primero queda en el checklist y lo segundo es el paso 1 de "Qué correr".

### 65.8 Checklist en producción

- [ ] Correr la migración 0108 y la consulta de verificación: las seis filas dicen `aplicada`.
- [ ] Con un usuario de carga de un cuartel: Cuarteles → su cuartel → "Dotación actual": se ven los botones − y +, el total cambia mientras se carga y "Guardar dotación" lo guarda con tu nombre y la fecha.
- [ ] En el celular (Android): al tocar una cantidad se abre el **teclado numérico**; los botones se tocan cómodos.
- [ ] En la lista de cuarteles y en la ficha, la dotación cambia al total cargado.
- [ ] Con un Presidente de otro cuartel: ve la dotación sin controles y no puede guardarla.
- [ ] Asistencia → nuevo resumen: aparece "Dotación: N integrantes" sin campo para cargarla. Los resúmenes anteriores conservan su dotación.
- [ ] Reportes → "Reporte General por Cuartel" y "Regional consolidado": el PDF trae la dotación por categoría.
- [ ] Inicio: "Dotación total" suma la de todos los cuarteles; un cuartel sin dotación aparece en Tareas con "Falta cargar la dotación actual del cuartel." y el enlace lo lleva a la tarjeta.
- [ ] Ayuda → "Cuarteles y dotación": se leen las dos guías (la de carga, solo con rol de carga).

### 65.9 Riesgos y decisiones

- **El número de dotación cambia de significado para un cuartel que carga sus categorías:** antes era "personal activo del registro nominal"; ahora incluye también aspirantes, personal en reserva y cuerpo auxiliar. Es lo que se pidió, pero los resúmenes de Asistencia nuevos del cuartel van a mostrar un total mayor que los anteriores. Los anteriores no se tocan.
- **Cero a propósito:** una fila con todas las categorías en 0 vale dotación 0 (no vuelve al conteo nominal). Para volver al conteo nominal hay que borrar la fila (hoy, desde la base).
- **No hay historial de la dotación por categoría.** La ficha guarda solo la última actualización (fecha y quién). El cambio del total sí queda en la auditoría del cuartel (`stations.personnel_count`). Si se necesita la evolución mes a mes, es una tabla de historial aparte; no se hizo para no duplicar datos que nadie pidió.
- **Regional por `is_regional_role()`:** la regla de escritura es la misma que la de personal (0027). Si se quisiera restringir a un solo rol de Regional, se cambia ahí y en la política.
- **El registro nominal queda como está:** sigue sirviendo para quien quiera llevar nombres y alimenta la dotación de los cuarteles que todavía no cargaron sus categorías.
- **Intervenciones** conserva su propio campo "personal que intervino" (otra cosa: quiénes salieron al servicio).
- **No se probó** en un celular real: el teclado numérico se verifica por atributos (`inputmode`, `pattern`) y en un Android emulado, pero queda en el checklist.
