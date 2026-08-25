-- Pega esto en Supabase: Dashboard -> SQL Editor -> New query -> Run
-- Es seguro volver a correr este archivo completo si ya corriste una
-- versión anterior: usa "if not exists" / "or replace" / "if exists" en
-- todos lados.

create table if not exists registros (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  nombre text not null,
  telefono text not null,
  marca text not null default '',
  modelo text not null default '',
  tipo_auto text not null check (tipo_auto in ('chico', 'troca')),
  precio integer not null,
  turno integer,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'listo'))
);

-- Por si vienes de una versión anterior del schema sin estas columnas:
alter table registros add column if not exists marca text not null default '';
alter table registros add column if not exists modelo text not null default '';
alter table registros add column if not exists turno integer;

alter table registros enable row level security;

-- ---------- Registro público ----------
--
-- La página pública YA NO inserta directo a la tabla ni la lee. En vez de
-- eso llama a esta función (RPC) que:
--   1. calcula el "turno" del día (se reinicia solo cada medianoche),
--   2. inserta el registro,
--   3. cuenta cuántos autos EN ESPERA hay antes que el suyo,
-- y regresa solo esos 2 números (nunca nombres/teléfonos de otras personas).
--
-- Al ser "security definer" no necesita ninguna política de INSERT/SELECT
-- para el rol "anon" sobre la tabla — por eso quitamos esas políticas si
-- existían de una versión anterior.
drop policy if exists "insertar registros publicos" on registros;
drop policy if exists "leer registros publicos" on registros;

create or replace function registrar_lavado(
  p_nombre text,
  p_telefono text,
  p_tipo_auto text,
  p_precio integer,
  p_marca text,
  p_modelo text
)
returns table(turno integer, carros_adelante integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_turno integer;
  v_created_at timestamptz;
  v_adelante integer;
begin
  select coalesce(max(r.turno), 0) + 1 into v_turno
  from registros r
  where r.created_at >= date_trunc('day', now());

  insert into registros (nombre, telefono, tipo_auto, precio, marca, modelo, turno)
  values (p_nombre, p_telefono, p_tipo_auto, p_precio, p_marca, p_modelo, v_turno)
  returning registros.created_at into v_created_at;

  select count(*) into v_adelante
  from registros r
  where r.estado = 'pendiente' and r.created_at < v_created_at;

  return query select v_turno, v_adelante;
end;
$$;

revoke all on function registrar_lavado(text, text, text, integer, text, text) from public;
grant execute on function registrar_lavado(text, text, text, integer, text, text) to anon;

-- ---------- Panel de administración ----------
--
-- /admin.html inicia sesión con Supabase Auth (rol "authenticated"), así
-- que solo un admin logueado puede ver los datos completos y cambiar el
-- estado de un registro. El rol "anon" (la key pública del sitio) no puede
-- leer la tabla directo, así nunca se exponen nombres/teléfonos por API.
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

-- Permite el botón "Reiniciar todos los registros" (zona de peligro) del
-- panel: borra todas las filas. Solo un admin logueado puede hacerlo, y en
-- el panel se pide escribir una palabra de confirmación antes de llamarlo.
drop policy if exists "admin borrar registros" on registros;
create policy "admin borrar registros"
on registros for delete
to authenticated
using (true);

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

-- Ya no se usa (versión anterior mostraba conteos en vivo en la página
-- pública); se limpia por si la corriste antes.
drop view if exists registros_stats;
