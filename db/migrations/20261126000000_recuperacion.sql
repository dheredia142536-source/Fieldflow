-- Recuperación de contraseña: código de 6 dígitos enviado por correo (Brevo).
create table recuperaciones (
  id uuid primary key,
  correo text unique not null,
  codigo_hash text not null,
  expira_en timestamptz not null,
  intentos integer not null default 0,
  reenvios integer not null default 0,
  ultimo_envio_en timestamptz not null,
  ip_hash text,
  creado_en timestamptz not null
);
