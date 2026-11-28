-- FieldFlow · Terrenos (compra y venta) y Ganado. Cambios aditivos.

-- Terrenos: fichas para vender o buscar comprar, con fotos, características, documentos e interesados.
create table terrenos (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  titulo text not null,
  operacion text not null default 'venta',      -- venta | compra
  estado text not null default 'disponible',    -- disponible | negociacion | cerrado
  uso text,                                     -- agricola | ganadero | mixto | forestal | lote | otro
  departamento text,
  municipio text,
  vereda text,
  direccion text,
  lat double precision,
  lng double precision,
  area_ha double precision not null default 0,
  precio bigint not null default 0,
  negociable integer not null default 1,
  descripcion text,
  caracteristicas text,                         -- JSON: lista de claves (agua, luz, vía…)
  documentos text,                              -- JSON: lista de documentos que ya se tienen
  contacto_nombre text,
  contacto_tel text,
  notas text,
  creado_en timestamptz not null,
  actualizado_en timestamptz not null
);
create index idx_terrenos_negocio on terrenos (negocio_id, estado);

create table terreno_fotos (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  terreno_id uuid not null references terrenos(id) on delete cascade,
  orden integer not null default 0,
  grande text not null,
  mini text not null,
  creado_en timestamptz not null
);
create index idx_terreno_fotos on terreno_fotos (terreno_id, orden);

create table terreno_interesados (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  terreno_id uuid not null references terrenos(id) on delete cascade,
  nombre text not null,
  telefono text,
  oferta bigint not null default 0,
  estado text not null default 'nuevo',         -- nuevo | visita | oferta | descartado
  nota text,
  creado_en timestamptz not null
);
create index idx_terreno_interesados on terreno_interesados (terreno_id, creado_en);

-- Ganado: un registro por animal y un historial de eventos (peso, sanidad, reproducción, leche, venta…).
create table animales (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  arete text,
  nombre text,
  sexo text not null default 'hembra',          -- hembra | macho
  raza text,
  nacimiento text,
  categoria text,                               -- ternero | ternera | novillo | novilla | vaca | toro | buey
  estado text not null default 'activo',        -- activo | vendido | muerto
  lote text,
  madre text,
  padre text,
  peso_actual double precision,
  peso_en text,
  compra_fecha text,
  compra_precio bigint not null default 0,
  foto text,
  notas text,
  creado_en timestamptz not null,
  actualizado_en timestamptz not null
);
create index idx_animales_negocio on animales (negocio_id, estado);

create table ganado_eventos (
  id uuid primary key,
  negocio_id uuid not null references negocios(id) on delete cascade,
  animal_id uuid references animales(id) on delete cascade,
  tipo text not null,                           -- peso | vacuna | desparasitacion | tratamiento | monta | diagnostico | parto | leche | venta | muerte | nota
  fecha text not null,
  valor double precision,
  producto text,
  detalle text,
  proxima_fecha text,
  extra text,                                   -- JSON con datos propios del tipo
  creado_en timestamptz not null
);
create index idx_ganado_eventos_animal on ganado_eventos (animal_id, fecha);
create index idx_ganado_eventos_tipo on ganado_eventos (negocio_id, tipo, fecha);
