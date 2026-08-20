-- SIGER4 - Historial de importación por lote (Excel/CSV)
--
-- Objetivo: permitir cargar Personal/Vehículos/Asistencias/Inventario desde
-- un archivo .xlsx/.csv, con vista previa y confirmación explícita antes de
-- insertar nada real -- el archivo nunca es la fuente de verdad, solo un
-- medio de carga. Esta migración solo crea las TABLAS de metadatos del lote
-- (import_batches / import_batch_rows); el parseo/mapeo/inserción real
-- corre client-side (src/lib/import/), fila por fila, usando el cliente
-- autenticado normal -- así la RLS de destino (personnel/vehicles/
-- attendance_summaries/inventory_items, ya existente) decide sola qué puede
-- insertar cada usuario según su alcance, sin reimplementar esa lógica acá.
--
-- No hay ninguna Edge Function ni RPC de "importar en bloque": cada fila se
-- inserta con un insert normal a la tabla destino (mismo camino que si el
-- usuario la cargara a mano desde el formulario), y solo se registra el
-- resultado (creado/actualizado/omitido/error) en import_batch_rows. Esto
-- es deliberado -- significa que la auditoría de cada fila ya la cubre el
-- trigger genérico audit_row_change() (0004) sin ningún cambio ahí, y que
-- nunca hay una vía paralela con más privilegios que la carga manual.

create type import_module as enum ('personal', 'vehiculos', 'asistencias', 'inventario');
create type import_batch_status as enum ('previsualizado', 'confirmado', 'completado', 'cancelado');
create type import_row_status as enum ('pendiente', 'creado', 'actualizado', 'omitido', 'error');

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  module import_module not null,
  status import_batch_status not null default 'previsualizado',
  file_name text not null,
  total_rows integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  error_count integer not null default 0,
  -- Mapeo de columnas confirmado por el usuario antes de importar (ej.
  -- {"Móvil": "internal_code", "Cuartel": "station_id"}) -- se guarda tal
  -- cual para que el historial explique CÓMO se interpretó el archivo, no
  -- solo el resultado.
  column_mapping jsonb,
  created_by_profile_id uuid references profiles(id) on delete set null,
  region_id uuid references regions(id) on delete set null,
  subsede_id uuid references subsedes(id) on delete set null,
  station_id uuid references stations(id) on delete set null,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  completed_at timestamptz
);

comment on table import_batches is 'Un lote de importación desde Excel/CSV (Personal/Vehículos/Asistencias/Inventario). El archivo en sí nunca se guarda -- solo metadatos del lote (quién, cuándo, cuántas filas, resultado) y el mapeo de columnas usado, para poder explicar después qué se importó y cómo.';
comment on column import_batches.column_mapping is 'Mapeo de columnas del archivo -> campos de la tabla destino, confirmado por el usuario antes de importar. jsonb libre: {"columna del archivo": "campo destino"}.';
comment on column import_batches.region_id is 'Alcance territorial del lote, resuelto del scope del usuario que importó -- mismo criterio que se usa para filtrar Auditoría/Reportes por alcance.';

create table if not exists import_batch_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_number integer not null,
  status import_row_status not null default 'pendiente',
  -- Datos crudos de la fila tal cual venían en el archivo (antes de mapear),
  -- para poder mostrar "esto es lo que decía el Excel" si hay que revisar un
  -- error después de confirmada la importación.
  raw_data jsonb not null,
  -- id del registro real creado/actualizado en la tabla destino (personnel/
  -- vehicles/attendance_summaries/inventory_items) -- null si status es
  -- 'omitido'/'error'/'pendiente'.
  target_record_id uuid,
  error_message text,
  created_at timestamptz not null default now()
);

comment on table import_batch_rows is 'Resultado fila por fila de un lote de importación -- creado/actualizado/omitido/error, con el motivo si falló. raw_data conserva lo que decía el archivo original (antes de mapear a los campos reales) para poder auditar un error puntual sin tener que volver a abrir el Excel.';
comment on column import_batch_rows.target_record_id is 'Id de la fila real creada/actualizada en personnel/vehicles/attendance_summaries/inventory_items según el módulo del lote. Null si la fila se omitió o falló -- nunca apunta a un registro que no llegó a existir.';

create index if not exists idx_import_batch_rows_batch_id on import_batch_rows(batch_id);
create index if not exists idx_import_batches_created_by on import_batches(created_by_profile_id);

alter table import_batches enable row level security;
alter table import_batch_rows enable row level security;

-- Mismo criterio de alcance que ya rige el resto del sistema (Auditoría,
-- Reportes): informatica_r4 ve todo; el resto ve solo sus propios lotes
-- (nunca lotes de otros usuarios, ni siquiera dentro del mismo alcance --
-- un lote es una acción personal de carga, no un dato institucional
-- compartido como sí lo son los registros que termina creando).
create policy "import_batches_select_own_or_admin" on import_batches
  for select using (
    is_informatica_r4() or created_by_profile_id = current_profile_id()
  );

create policy "import_batches_insert_own" on import_batches
  for insert with check (created_by_profile_id = current_profile_id());

create policy "import_batches_update_own_or_admin" on import_batches
  for update using (
    is_informatica_r4() or created_by_profile_id = current_profile_id()
  );

create policy "import_batch_rows_select_own_or_admin" on import_batch_rows
  for select using (
    exists (
      select 1 from import_batches b
      where b.id = batch_id and (is_informatica_r4() or b.created_by_profile_id = current_profile_id())
    )
  );

create policy "import_batch_rows_insert_own" on import_batch_rows
  for insert with check (
    exists (select 1 from import_batches b where b.id = batch_id and b.created_by_profile_id = current_profile_id())
  );

create policy "import_batch_rows_update_own_or_admin" on import_batch_rows
  for update using (
    exists (
      select 1 from import_batches b
      where b.id = batch_id and (is_informatica_r4() or b.created_by_profile_id = current_profile_id())
    )
  );

comment on policy "import_batches_select_own_or_admin" on import_batches is 'Un lote de importación es una acción personal de quien la ejecutó -- solo esa persona y informatica_r4 (visión total del sistema) pueden verlo, nunca alguien más aunque comparta el mismo alcance territorial.';
