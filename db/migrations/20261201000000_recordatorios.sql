-- FieldFlow · recordatorios de cita por correo. Cambios aditivos.
alter table clientes add column correo text;             -- correo del cliente (opcional) para recordarle su cita
alter table citas add column recordatorio_en timestamptz; -- cuándo se le envió el recordatorio (evita repetirlo)
create index idx_citas_inicio on citas (negocio_id, inicio);
