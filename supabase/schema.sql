-- Pega esto en Supabase: Dashboard -> SQL Editor -> New query -> Run
-- (Si ya corriste una versión anterior de este archivo, puedes volver a
-- correr este completo: usa "if not exists" / "or replace" / "if exists"
-- en todos lados, así que es seguro re-ejecutarlo.)

create table if not exists registros (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null,
  telefono text not null,
  tipo_auto text not null check (tipo_auto in ('chico', 'troca')),
  precio integer not null,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'listo'))
);

alter table registros enable row level security;

-- Permite que la página pública (rol anon) inserte registros nuevos.
drop policy if exists "insertar registros publicos" on registros;
create policy "insertar registros publicos"
on registros for insert
to anon
with check (true);

-- IMPORTANTE: el rol "anon" NO tiene permiso de leer la tabla directo.
-- Si le diéramos SELECT abierto, cualquier persona con la anon key
-- (que es pública, vive en config.js) podría pedir por API el nombre y
-- teléfono de todos tus clientes. En vez de eso, la página pública lee un
-- "view" con solo los conteos agregados (sin nombres ni teléfonos):
drop policy if exists "leer registros publicos" on registros;

create or replace view registros_stats as
select
  count(*) filter (where estado = 'pendiente') as en_espera,
  count(*) filter (
    where estado = 'listo' and created_at >= date_trunc('day', now())
  ) as atendidos_hoy
from registros;

grant select on registros_stats to anon;

-- El panel de administración (/admin.html) inicia sesión con Supabase Auth
-- (rol "authenticated"), así que solo un admin logueado puede ver los datos
-- completos y cambiar el estado de un registro.
drop policy if exists "admin leer registros" on registros;
create policy "admin leer registros"
on registros for select
to authenticated
using (true);

drop policy if exists "admin actualizar estado" on registros;
create policy "admin actualizar estado"
on registros for update
to authenticated
using (true)
with check (true);

-- Activa Realtime en la tabla para que el panel de admin se actualice solo
-- cuando entra un registro nuevo o cambia de estado.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'registros'
  ) then
    alter publication supabase_realtime add table registros;
  end if;
end $$;
