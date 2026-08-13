-- SIGER4 - Telefono institucional y WhatsApp separados en cuarteles
--
-- Problema: stations solo tenia un unico campo "phone", y el frontend
-- ofrecia un boton de WhatsApp generado a partir de ese mismo numero. Muchos
-- cuarteles tienen telefono FIJO (sin WhatsApp real), y en los que si tienen
-- celular, el numero de WhatsApp puede no coincidir con el telefono
-- institucional publicado. Mostrar un boton de WhatsApp sobre un fijo, o
-- asumiendo que son el mismo numero, es incorrecto.
--
-- Solucion: columna nueva whatsapp_phone, independiente de phone. Ambas
-- opcionales, ninguna reemplaza a la otra.
--
-- Compatibilidad: stations.phone existente NO se toca ni se copia a
-- whatsapp_phone -- un telefono ya cargado sigue siendo el telefono
-- institucional (correcto, es lo que era). whatsapp_phone arranca vacio
-- para todos los cuarteles existentes; autocompletarlo con el telefono
-- viejo asumiria sin base que ese numero tiene WhatsApp, que es exactamente
-- el bug que se esta corrigiendo -- se deja en blanco a proposito, para que
-- alguien lo cargue solo si corresponde.

alter table stations
  add column if not exists whatsapp_phone text;

comment on column stations.whatsapp_phone is 'Numero de WhatsApp del cuartel, independiente de phone (telefono institucional). Puede ser el mismo numero, distinto, o no existir. Null si no se cargo -- en ese caso el detalle de cuartel no debe mostrar boton de WhatsApp.';
