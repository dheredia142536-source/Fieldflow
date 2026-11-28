-- Segunda limpieza: teléfonos que usaba el simulador de WhatsApp por defecto (no estaban en la primera lista).
delete from contacto_historial where contacto_id in (
  select id from contactos where telefono in ('573001112233', '573009998877', '573001110003', '573001110004', '573001110005') or cliente_id in (select id from clientes where telefono in ('573001112233', '573009998877', '573001110003', '573001110004', '573001110005')));
delete from contactos where telefono in ('573001112233', '573009998877', '573001110003', '573001110004', '573001110005') or cliente_id in (select id from clientes where telefono in ('573001112233', '573009998877', '573001110003', '573001110004', '573001110005'));
delete from mensajes where conversacion_id in (select id from conversaciones where cliente_id in (select id from clientes where telefono in ('573001112233', '573009998877', '573001110003', '573001110004', '573001110005')));
delete from conversaciones where cliente_id in (select id from clientes where telefono in ('573001112233', '573009998877', '573001110003', '573001110004', '573001110005'));
delete from tokens_acceso where cliente_id in (select id from clientes where telefono in ('573001112233', '573009998877', '573001110003', '573001110004', '573001110005'));
delete from citas where cliente_id in (select id from clientes where telefono in ('573001112233', '573009998877', '573001110003', '573001110004', '573001110005'));
delete from clientes where telefono in ('573001112233', '573009998877', '573001110003', '573001110004', '573001110005');
