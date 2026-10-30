-- SIGER4 - Agregar 'subsede' al enum scope_type
--
-- ADD VALUE es seguro como sentencia standalone (a diferencia de la baja de un
-- valor de enum, que requiere el patron rename-recreate usado en
-- 0008_role_key_simplify.sql). Este archivo NO debe contener ningun otro
-- statement que use el valor 'subsede' en la misma transaccion: Postgres no
-- permite usar un valor de enum recien agregado dentro de la transaccion que lo
-- agrego. Todo lo que dependa de 'subsede' va en 0010_user_scopes_subsede.sql.

alter type scope_type add value if not exists 'subsede';
