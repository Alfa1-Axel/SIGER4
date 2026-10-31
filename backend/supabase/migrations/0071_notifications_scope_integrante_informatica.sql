-- SIGER4 - Notificaciones: acotar integrante_informatica al alcance regional
--
-- Discrepancia frontend/RLS detectada en el relevamiento de la v1.0.0-beta.1
-- (documentada en DEPLOYMENT.md seccion 31.4/31.6): notifications_write_regional_escuela_scoped
-- (migracion 0063) usaba is_informatica_r4(), que agrupa informatica_r4 e
-- integrante_informatica -- ambos quedaban con alcance total (cualquier
-- region/subsede/cuartel/usuario, incluido broadcast total sin scope). El
-- resto del sistema (Usuarios, borrado directo) SI distingue a
-- integrante_informatica como un nivel mas acotado que informatica_r4 (ver
-- migracion 0065), asi que dejar a integrante_informatica con broadcast
-- total en Notificaciones era inconsistente con esa distincion ya existente
-- en otros modulos.
--
-- Regla nueva (decision confirmada, 2026-08-09): informatica_r4 mantiene
-- alcance total. integrante_informatica pasa a tener el MISMO limite
-- territorial que secretario_regional/director_escuela/instructor: solo
-- puede notificar dentro de su propia region/subsede/cuartel, o a un
-- profile puntual. Un envio "a todos" sin ningun scope (region_id/
-- subsede_id/station_id/profile_id todos null) sigue reservado
-- exclusivamente a informatica_r4.

drop policy if exists "notifications_write_regional_escuela_scoped" on notifications;

create policy "notifications_write_scoped" on notifications
  for insert with check (
    has_role('informatica_r4')
    or (
      (has_role('integrante_informatica') or is_regional_role() or is_escuela_role())
      and (
        -- Notificacion a un usuario puntual: no requiere acotar region/subsede/cuartel.
        profile_id is not null
        or (region_id is not null and region_id in (select my_region_ids()))
        or (subsede_id is not null and subsede_id in (select my_subsede_ids()))
        or (station_id is not null and station_id in (select my_station_ids()))
        or (station_id is not null and station_id in (select id from stations where region_id in (select my_region_ids())))
        or (station_id is not null and station_id in (select id from stations where subsede_id in (select my_subsede_ids())))
      )
    )
  );

comment on policy "notifications_write_scoped" on notifications is 'Crear notificaciones: informatica_r4 sin restriccion. integrante_informatica/secretario_regional/director_escuela/instructor solo dentro de su propia region/subsede/cuartel, o a un usuario puntual (profile_id). Reemplaza a notifications_write_regional_escuela_scoped (0063), que agrupaba a integrante_informatica con informatica_r4 via is_informatica_r4() y le daba alcance total sin querer.';
