-- FieldFlow · CRM de contactos, productos libres, caja diaria y stock diario. Cambios aditivos.
alter table servicios add column precio integer not null default 0;

create table contactos (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  nombre text not null,
  correo text,
  telefono text,
  empresa text,
  etapa text not null default 'nuevo',
  origen text,
  valor integer not null default 0,
  cliente_id uuid references clientes(id) on delete set null,
  notas text,
  proxima_accion text,
  proxima_fecha text,
  ultimo_contacto_en timestamptz,
  creado_en timestamptz not null,
  actualizado_en timestamptz not null
);
create index idx_contactos_negocio on contactos (negocio_id, etapa);
create index idx_contactos_cliente on contactos (cliente_id);

create table contacto_historial (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  contacto_id uuid not null references contactos(id) on delete cascade,
  tipo text not null,
  asunto text,
  cuerpo text,
  creado_en timestamptz not null
);
create index idx_historial_contacto on contacto_historial (contacto_id, creado_en);

-- Productos libres: cualquier cosa que el negocio controle (empanadas, bultos, reses, litros…).
create table productos (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  nombre text not null,
  unidad text not null default 'unidad',
  precio integer not null default 0,
  stock_minimo numeric not null default 0,
  activo integer not null default 1,
  creado_en timestamptz not null
);
create index idx_productos_negocio on productos (negocio_id, activo);

-- Un registro por día y negocio: cada día es independiente (apertura y cierre propios).
create table caja_dias (
  negocio_id uuid not null references negocios(id) on delete cascade,
  dia text not null,
  apertura integer not null default 0,
  cierre_real integer,
  cerrado_en timestamptz,
  nota text,
  primary key (negocio_id, dia)
);

create table caja_movimientos (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  dia text not null,
  tipo text not null,
  medio text not null default 'efectivo',
  concepto text,
  monto integer not null,
  creado_en timestamptz not null
);
create index idx_caja_mov_dia on caja_movimientos (negocio_id, dia);

create table stock_movimientos (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  dia text not null,
  producto_id uuid not null references productos(id) on delete cascade,
  tipo text not null,
  cantidad numeric not null,
  nota text,
  creado_en timestamptz not null
);
create index idx_stock_mov_dia on stock_movimientos (negocio_id, dia);
create index idx_stock_mov_prod on stock_movimientos (producto_id, dia);

-- Conteo físico al cerrar el día.
create table stock_conteos (
  negocio_id uuid not null references negocios(id) on delete cascade,
  dia text not null,
  producto_id uuid not null references productos(id) on delete cascade,
  cantidad numeric not null,
  primary key (negocio_id, dia, producto_id)
);
