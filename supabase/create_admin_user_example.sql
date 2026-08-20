-- SIGER4 - Ejemplo: crear el perfil y rol para el primer usuario administrador
-- (Dpto. de Informatica y Estadistica R4)
--
-- 1. Reemplazar 'UUID-DEL-USUARIO-AUTH' por el "User UID" de Authentication -> Users.
-- 2. Reemplazar el email y nombre por los reales.
-- 3. Ejecutar en el SQL Editor de Supabase.

insert into profiles (auth_user_id, full_name, email, region_id)
values (
  'UUID-DEL-USUARIO-AUTH',
  'Nombre Apellido',
  'admin@tudominio.com',
  (select id from regions where code = 'R4')
);

insert into user_roles (profile_id, role)
values (
  (select id from profiles where email = 'admin@tudominio.com'),
  'informatica_r4'
);
