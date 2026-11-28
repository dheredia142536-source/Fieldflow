-- FieldFlow · enlace público de cada negocio (sin cuenta de Meta) y visitantes del bot. Cambios aditivos.
alter table negocios add column slug text;
create unique index idx_negocios_slug on negocios (slug);

-- Visitante que llega por el enlace: se registra al instante y da su nombre y teléfono dentro del chat.
alter table clientes add column origen text;
alter table clientes add column contacto_tel text;      -- teléfono que escribió el visitante (no verificado)
alter table clientes add column acepto_datos_en timestamptz;
