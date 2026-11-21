-- FieldFlow · varios negocios (multi-tenant) + registro con verificación por correo.
-- ATENCIÓN: reconstruye las tablas del negocio (el esquema inicial era de un solo negocio).
-- Se ejecuta ANTES del lanzamiento: borra los datos de prueba. Después de esta migración,
-- cada cambio de esquema debe ser aditivo.

drop table if exists mensajes;
drop table if exists tokens_acceso;
drop table if exists conversaciones;
drop table if exists citas;
drop table if exists disponibilidad;
drop table if exists servicio_recurso;
drop table if exists servicios;
drop table if exists recursos;
drop table if exists clientes;
drop table if exists configuracion;
drop table if exists usuarios_negocio;

create table negocios (
  id uuid primary key,
  nombre text not null,
  tipo text,
  departamento text,
  municipio text,
  telefono text,
  fines text,
  idioma text not null default 'es',
  principal integer not null default 0,
  acepto_terminos_en timestamptz,
  creado_en timestamptz not null
);

create table usuarios_negocio (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  correo text unique not null,
  nombre text,
  telefono text,
  hash text not null,
  verificado_en timestamptz,
  creado_en timestamptz not null
);

-- Registros que esperan el código del correo. La cuenta se crea sólo al verificar.
create table registros_pendientes (
  id uuid primary key,
  correo text unique not null,
  datos text not null,
  hash text not null,
  codigo_hash text not null,
  expira_en timestamptz not null,
  intentos integer not null default 0,
  reenvios integer not null default 0,
  ultimo_envio_en timestamptz not null,
  ip_hash text,
  creado_en timestamptz not null
);

create table configuracion (
  negocio_id uuid not null references negocios(id) on delete cascade,
  clave text not null,
  valor text not null,
  primary key (negocio_id, clave)
);

create table clientes (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  telefono text not null,
  nombre text,
  idioma text not null default 'es',
  notas text,
  ultimo_enlace_en timestamptz,
  creado_en timestamptz not null,
  unique (negocio_id, telefono)
);

create table servicios (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  nombre_es text not null,
  nombre_en text not null,
  descripcion_es text,
  descripcion_en text,
  duracion_min integer not null,
  activo integer not null default 1
);

create table recursos (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
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
  negocio_id uuid not null references negocios(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
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
  negocio_id uuid not null references negocios(id) on delete cascade,
  cliente_id uuid not null references clientes(id) on delete cascade,
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

create index idx_citas_recurso_inicio on citas (recurso_id, inicio);
create index idx_citas_negocio_inicio on citas (negocio_id, inicio);
create index idx_citas_cliente on citas (cliente_id, inicio);
create index idx_mensajes_conv on mensajes (conversacion_id, creado_en);
create index idx_disp_recurso on disponibilidad (recurso_id, dia_semana);
create index idx_conv_negocio on conversaciones (negocio_id, ultimo_mensaje_en);
create index idx_servicios_negocio on servicios (negocio_id);
create index idx_recursos_negocio on recursos (negocio_id);
create index idx_usuarios_negocio on usuarios_negocio (negocio_id);
