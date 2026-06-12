-- ---------------------------------------------------------
-- Ejecuta este SQL en el SQL Editor de Supabase
-- ---------------------------------------------------------

-- 1. Habilitar pgvector
create extension if not exists vector;


-- 2. Tabla de documentos (RAG)
create table documentos (
  id         bigserial primary key,
  contenido  text not null,
  url_origen text not null,
  embedding  vector(1024)  -- dimension de voyage-3
);

create index on documentos using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);


-- 3. Cuenta mock
create table cuenta (
  id     bigserial primary key,
  nombre text not null,
  email  text not null
);

insert into cuenta (nombre, email) values
  ('Martin Iglesias', 'martin.iglesias21@gmail.com');


-- 4. Eventos mock
create table eventos (
  id        bigserial primary key,
  nombre    text    not null,
  fecha     date    not null,
  precio    numeric not null,
  capacidad int     not null,
  vendidos  int     not null default 0,
  estado    text    not null default 'activo'
);

insert into eventos (nombre, fecha, precio, capacidad, vendidos, estado) values
  ('Festival de Verano 2026', '2026-02-15', 5000, 1000, 620, 'activo'),
  ('Noche de Jazz & Blues',   '2026-02-22', 3500, 500,  340, 'activo'),
  ('Congreso Tech 2026',      '2026-03-10', 8000, 300,  185, 'activo'),
  ('Show de Comedia',         '2025-11-20', 2500, 200,  200, 'finalizado');


-- 5. Ventas mock
create table ventas (
  id        bigserial primary key,
  evento_id bigint references eventos(id),
  comprador text    not null,
  monto     numeric not null,
  fecha     date    not null,
  estado    text    not null default 'confirmada'
);

insert into ventas (evento_id, comprador, monto, fecha, estado) values
  (1, 'Maria Garcia',     5000,  '2026-01-10', 'confirmada'),
  (1, 'Carlos Lopez',     10000, '2026-01-11', 'confirmada'),
  (1, 'Ana Martinez',     5000,  '2026-01-12', 'confirmada'),
  (1, 'Diego Fernandez',  5000,  '2026-01-13', 'confirmada'),
  (1, 'Laura Sanchez',    10000, '2026-01-14', 'confirmada'),
  (2, 'Martin Rodriguez', 3500,  '2026-01-10', 'confirmada'),
  (2, 'Sofia Gonzalez',   7000,  '2026-01-11', 'confirmada'),
  (2, 'Pablo Torres',     3500,  '2026-01-12', 'confirmada'),
  (3, 'Valeria Ruiz',     8000,  '2026-01-15', 'confirmada'),
  (3, 'Nicolas Perez',    16000, '2026-01-16', 'confirmada'),
  (4, 'Camila Diaz',      2500,  '2025-10-01', 'confirmada'),
  (4, 'Rodrigo Morales',  5000,  '2025-10-02', 'confirmada');


-- 6. Funcion RPC para busqueda por similitud vectorial
create or replace function buscar_documentos(
  query_embedding vector(1024),
  match_count     int default 4
)
returns table (
  id         bigint,
  contenido  text,
  url_origen text,
  similarity float
)
language sql stable
as $$
  select
    id,
    contenido,
    url_origen,
    1 - (embedding <=> query_embedding) as similarity
  from documentos
  order by embedding <=> query_embedding
  limit match_count;
$$;
