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
  turno_trabajo text check (turno_trabajo in ('A', 'B', 'C', 'D')),
  fecha_servicio date,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'listo'))
);

-- Por si vienes de una versión anterior del schema sin estas columnas:
alter table registros add column if not exists marca text not null default '';
alter table registros add column if not exists modelo text not null default '';
alter table registros add column if not exists turno integer;
alter table registros add column if not exists fecha_servicio date;
alter table registros add column if not exists turno_trabajo text check (turno_trabajo in ('A', 'B', 'C', 'D'));

alter table registros enable row level security;

-- ---------- Días disponibles ----------
--
-- Tú controlas aquí (desde /admin) qué días vas a lavar autos y en qué
-- horario. La página pública solo deja escoger un día de esta lista — así
-- nunca se registra un auto para un día en que no vas a estar.
create table if not exists dias_disponibles (
  id uuid primary key default gen_random_uuid(),
  fecha date not null unique,
  hora_inicio time,
  hora_fin time,
  limite integer,
  created_at timestamptz not null default now()
);

-- Por si vienes de una versión anterior del schema sin esta columna:
alter table dias_disponibles add column if not exists limite integer;

alter table dias_disponibles enable row level security;

-- No tiene datos personales, así que se puede leer libremente: el sitio
-- público la necesita para mostrar las opciones de día, y el panel para
-- administrarla.
drop policy if exists "leer dias disponibles" on dias_disponibles;
create policy "leer dias disponibles"
on dias_disponibles for select
to anon, authenticated
using (true);

drop policy if exists "admin crear dias disponibles" on dias_disponibles;
create policy "admin crear dias disponibles"
on dias_disponibles for insert
to authenticated
with check (true);

drop policy if exists "admin borrar dias disponibles" on dias_disponibles;
create policy "admin borrar dias disponibles"
on dias_disponibles for delete
to authenticated
using (true);

-- La página pública ya no lee la tabla dias_disponibles directo: usa esta
-- función para de paso saber cuántos carros ya hay agendados ese día
-- (ocupados), sin exponer nombres/teléfonos de nadie — solo un conteo.
drop function if exists dias_disponibles_publico();

create or replace function dias_disponibles_publico()
returns table(fecha date, hora_inicio time, hora_fin time, limite integer, ocupados bigint)
language sql
security definer
set search_path = public
stable
as $$
  select
    d.fecha,
    d.hora_inicio,
    d.hora_fin,
    d.limite,
    (select count(*) from registros r where r.fecha_servicio = d.fecha) as ocupados
  from dias_disponibles d
  order by d.fecha asc;
$$;

revoke all on function dias_disponibles_publico() from public;
grant execute on function dias_disponibles_publico() to anon;

-- ---------- Contactos (para promociones) ----------
--
-- Guarda cada teléfono que se registra alguna vez, aparte de "registros".
-- Sobrevive aunque uses "Reiniciar todos los registros" en la zona de
-- peligro del panel — esa acción solo borra la cola/turnos, nunca esta
-- lista, para que siempre tengas a quién avisarle de promociones.
create table if not exists contactos (
  telefono text primary key,
  nombre text not null default '',
  visitas integer not null default 1,
  primera_visita timestamptz not null default now(),
  ultima_visita timestamptz not null default now()
);

alter table contactos enable row level security;

drop policy if exists "admin leer contactos" on contactos;
create policy "admin leer contactos"
on contactos for select
to authenticated
using (true);

-- ---------- Registro público ----------
--
-- La página pública YA NO inserta directo a la tabla ni la lee. En vez de
-- eso llama a esta función (RPC) que:
--   1. calcula el "turno" del día de SERVICIO elegido (empieza en 1 en
--      cada día distinto de dias_disponibles),
--   2. inserta el registro,
--   3. cuenta cuántos autos EN ESPERA hay antes que el suyo ESE mismo día,
-- y regresa solo esos 2 números (nunca nombres/teléfonos de otras personas).
--
-- Al ser "security definer" no necesita ninguna política de INSERT/SELECT
-- para el rol "anon" sobre la tabla — por eso quitamos esas políticas si
-- existían de una versión anterior.
drop policy if exists "insertar registros publicos" on registros;
drop policy if exists "leer registros publicos" on registros;

-- Se eliminan versiones anteriores (6 y 7 parámetros, sin turno_trabajo)
-- por si ya existían, para poder cambiar la firma de la función sin
-- conflicto.
drop function if exists registrar_lavado(text, text, text, integer, text, text);
drop function if exists registrar_lavado(text, text, text, integer, text, text, date);

create or replace function registrar_lavado(
  p_nombre text,
  p_telefono text,
  p_tipo_auto text,
  p_precio integer,
  p_marca text,
  p_modelo text,
  p_fecha_servicio date,
  p_turno_trabajo text
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
  v_limite integer;
  v_ocupados integer;
begin
  -- Si ese día tiene límite de carros, no dejar registrar uno más si ya
  -- se llenó el cupo.
  select limite into v_limite
  from dias_disponibles
  where fecha = p_fecha_servicio;

  if v_limite is not null then
    select count(*) into v_ocupados
    from registros r
    where r.fecha_servicio = p_fecha_servicio;

    if v_ocupados >= v_limite then
      raise exception 'CUPO_LLENO' using errcode = 'P0001';
    end if;
  end if;

  -- El turno es por día de SERVICIO (el que eligió el cliente), no por
  -- día de registro — así "turno 5" siempre significa "el 5to auto de
  -- ese día en particular", sin importar cuándo se haya registrado.
  select coalesce(max(r.turno), 0) + 1 into v_turno
  from registros r
  where r.fecha_servicio = p_fecha_servicio;

  insert into registros (nombre, telefono, tipo_auto, precio, marca, modelo, turno, fecha_servicio, turno_trabajo)
  values (p_nombre, p_telefono, p_tipo_auto, p_precio, p_marca, p_modelo, v_turno, p_fecha_servicio, p_turno_trabajo)
  returning registros.created_at into v_created_at;

  select count(*) into v_adelante
  from registros r
  where r.fecha_servicio = p_fecha_servicio
    and r.estado = 'pendiente'
    and r.created_at < v_created_at;

  -- Guardadito de contactos para promociones — sobrevive aunque luego se
  -- borren los registros desde la zona de peligro del panel.
  insert into contactos (telefono, nombre, visitas, primera_visita, ultima_visita)
  values (p_telefono, p_nombre, 1, now(), now())
  on conflict (telefono) do update
    set nombre = excluded.nombre,
        visitas = contactos.visitas + 1,
        ultima_visita = now();

  return query select v_turno, v_adelante;
end;
$$;

revoke all on function registrar_lavado(text, text, text, integer, text, text, date, text) from public;
grant execute on function registrar_lavado(text, text, text, integer, text, text, date, text) to anon;

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

-- ---------- Storage: imágenes de "gracias" para WhatsApp ----------
--
-- Cuando el panel marca un auto como listo, sube la imagen de agradecimiento
-- aquí y pega su link público dentro del mensaje de WhatsApp — así WhatsApp
-- la muestra como foto (vista previa) sin que nadie tenga que adjuntarla a
-- mano. El bucket es público (cualquiera con el link exacto puede verla,
-- igual que cualquier imagen que se comparte por WhatsApp normalmente), pero
-- solo un admin logueado puede subir imágenes nuevas.
insert into storage.buckets (id, name, public)
values ('gracias', 'gracias', true)
on conflict (id) do update set public = true;

drop policy if exists "admin subir imagenes gracias" on storage.objects;
create policy "admin subir imagenes gracias"
on storage.objects for insert
to authenticated
with check (bucket_id = 'gracias');
