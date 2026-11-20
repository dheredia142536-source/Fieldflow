-- FieldFlow · esquema inicial / initial schema
-- Portable: sólo tipos y sintaxis comunes a Postgres (producción) y SQLite (pruebas locales).

create table usuarios_negocio (
  id uuid primary key,
  correo text unique not null,
  nombre text,
  hash text not null,
  creado_en timestamptz not null
);

create table configuracion (
  clave text primary key,
  valor text not null
);

create table clientes (
  id uuid primary key,
  telefono text unique not null,
  nombre text,
  idioma text not null default 'es',
  notas text,
  ultimo_enlace_en timestamptz,
  creado_en timestamptz not null
);

create table servicios (
  id uuid primary key,
  nombre_es text not null,
  nombre_en text not null,
  descripcion_es text,
  descripcion_en text,
  duracion_min integer not null,
  activo integer not null default 1
);

create table recursos (
  id uuid primary key,
  nombre text not null,
  tipo text,
  activo integer not null default 1
);

create table servicio_recurso (
  servicio_id uuid not null references servicios(id) on delete cascade,
  recurso_id uuid not null references recursos(id) on delete cascade,
  primary key (servicio_id, recurso_id)
);

-- dia_semana: 0 = lunes … 6 = domingo · hora local de Bogotá "HH:MM"
create table disponibilidad (
  id uuid primary key,
  recurso_id uuid not null references recursos(id) on delete cascade,
  dia_semana integer not null,
  hora_inicio text not null,
  hora_fin text not null
);

create table citas (
  id uuid primary key,
  cliente_id uuid not null references clientes(id),
  servicio_id uuid not null references servicios(id),
  recurso_id uuid not null references recursos(id),
  inicio timestamptz not null,
  fin timestamptz not null,
  estado text not null default 'confirmada',
  notas text,
  origen text not null default 'manual',
  creado_en timestamptz not null
);

create table conversaciones (
  id uuid primary key,
  cliente_id uuid not null references clientes(id),
  atendida_por text not null default 'bot',
  necesita_atencion integer not null default 0,
  estado text,
  canal text not null default 'pwa',
  ultimo_mensaje_en timestamptz,
  creado_en timestamptz not null
);

create table mensajes (
  id uuid primary key,
  conversacion_id uuid not null references conversaciones(id) on delete cascade,
  rol text not null,
  contenido text not null,
  meta text,
  creado_en timestamptz not null
);

create table tokens_acceso (
  id uuid primary key,
  token_hash text unique not null,
  cliente_id uuid not null references clientes(id) on delete cascade,
  expira_en timestamptz not null,
  creado_en timestamptz not null
);

create table eventos_webhook (
  id text primary key,
  recibido_en timestamptz not null
);

create table uso_diario (
  dia text primary key,
  llamadas integer not null default 0
);

create index idx_citas_recurso_inicio on citas (recurso_id, inicio);
create index idx_citas_cliente on citas (cliente_id, inicio);
create index idx_mensajes_conv on mensajes (conversacion_id, creado_en);
create index idx_disp_recurso on disponibilidad (recurso_id, dia_semana);
