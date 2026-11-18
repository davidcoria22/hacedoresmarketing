-- Tablas del panel de Hacedores. Se ejecuta una vez en Supabase (SQL Editor); se puede repetir sin error.
-- RLS queda activado SIN políticas: la clave anónima no puede leer nada. Solo el servidor, con la llave de servicio.

create table if not exists ajustes (
  agente text primary key,
  valores jsonb not null default '{}'::jsonb,
  actualizado timestamptz not null default now()
);

create table if not exists usuarios (
  email text primary key check (email = lower(email)),
  nombre text not null default '',
  rol text not null default '',
  activo boolean not null default true,
  creado timestamptz,
  por text not null default ''
);

create table if not exists roles (
  nombre text primary key,
  permisos text[] not null default '{}',
  descripcion text not null default '',
  actualizado timestamptz not null default now()
);

create table if not exists anuncios (
  id text primary key,
  nombre text not null default '',
  palabras text[] not null default '{}',
  mensaje text not null default '',
  seguimiento text not null default '',
  actualizado timestamptz not null default now()
);

create table if not exists pendientes (
  id text primary key,
  telefono text not null default '',
  vence timestamptz not null,
  estado text not null default 'pendiente',
  detalle text not null default '',
  creado timestamptz not null default now(),
  tipo text not null default 'primero',
  anuncio text not null default ''
);
create index if not exists pendientes_estado_vence on pendientes (estado, vence);

create table if not exists mensajes (
  seq bigserial primary key,
  clave text not null unique,           -- el id de Meta o, si no tiene, un hash del mensaje: evita guardar dos veces el aviso repetido
  fecha timestamptz not null default now(),
  red text not null default '',
  nombre text not null default '',
  telefono text not null default '',    -- enmascarado
  tipo text not null default '',
  texto text not null default '',
  origen text not null default '',
  respuesta text not null default '',
  id text not null default '',
  direccion text not null default 'entrada',
  contacto text not null default '',    -- número completo de WhatsApp: nunca sale del servidor
  ref text not null default '',         -- referencia corta de la conversación
  media jsonb,
  autor text not null default ''
);
create index if not exists mensajes_fecha on mensajes (fecha);
create index if not exists mensajes_ref on mensajes (ref);
create index if not exists mensajes_contacto on mensajes (contacto);

alter table ajustes enable row level security;
alter table usuarios enable row level security;
alter table roles enable row level security;
alter table anuncios enable row level security;
alter table pendientes enable row level security;
alter table mensajes enable row level security;
