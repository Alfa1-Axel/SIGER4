-- SIGER4 - Coordenadas de cuartel, para el Mapa Regional v1
--
-- Campos nuevos, todos opcionales -- ningun cuartel existente pierde datos
-- ni queda invalido por no tener coordenadas cargadas. El Mapa Regional
-- (frontend) debe distinguir visualmente los cuarteles con coordenadas
-- reales de los que no, y NUNCA inventar/estimar una ubicacion para los que
-- no la tienen.
--
-- Rango valido de latitud/longitud validado tanto en el formulario (cliente)
-- como acá (constraint de base, la garantia real) -- un check constraint
-- en vez de confiar solo en la UI evita que un insert directo (script,
-- importacion futura) deje coordenadas fuera de rango.

alter table stations
  add column if not exists latitude numeric(9, 6),
  add column if not exists longitude numeric(9, 6),
  add column if not exists map_notes text;

comment on column stations.latitude is 'Latitud del cuartel (WGS84, grados decimales), para el Mapa Regional. Null si no se cargó -- nunca se infiere ni se estima.';
comment on column stations.longitude is 'Longitud del cuartel (WGS84, grados decimales), para el Mapa Regional. Null si no se cargó -- nunca se infiere ni se estima.';
comment on column stations.map_notes is 'Nota/observación libre de ubicación para el Mapa Regional (ej. "acceso por calle lateral", "sin cartel visible desde la ruta"). Opcional.';

alter table stations
  add constraint stations_latitude_range check (latitude is null or (latitude >= -90 and latitude <= 90)),
  add constraint stations_longitude_range check (longitude is null or (longitude >= -180 and longitude <= 180));

comment on constraint stations_latitude_range on stations is 'Rango válido de latitud WGS84. Mismo rango validado en el formulario (CuartelFormPage.tsx) -- esta es la garantía real a nivel de base, contra inserts directos que no pasen por la UI.';
comment on constraint stations_longitude_range on stations is 'Rango válido de longitud WGS84. Mismo rango validado en el formulario (CuartelFormPage.tsx) -- esta es la garantía real a nivel de base, contra inserts directos que no pasen por la UI.';
