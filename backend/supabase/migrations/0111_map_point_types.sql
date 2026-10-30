-- SIGER4 - Mapa Regional: dos categorías nuevas de punto (v1.14.0)
--
-- Lugares relevantes (industrias, escuelas, depósitos, locales) y puntos de
-- abastecimiento (hidrantes, reservas, cisternas) conviven con las
-- referencias territoriales que ya existen (0084) en la misma tabla
-- map_reference_points: un lugar es un punto del mapa con una ficha, no un
-- registro aparte. Esta migración solo agrega los dos valores al tipo.
--
-- Va en un archivo propio porque un valor nuevo de un enum no se puede usar
-- en la misma transacción que lo crea (el SQL Editor corre cada ejecución
-- como una transacción). La 0114 y la 0115 ya los usan.
--
-- Es idempotente: si los valores ya existen, no hace nada. No toca datos.

alter type map_reference_point_type add value if not exists 'lugar_relevante';
alter type map_reference_point_type add value if not exists 'abastecimiento';
