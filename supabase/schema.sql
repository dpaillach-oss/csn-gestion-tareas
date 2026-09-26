-- ============================================================================
-- GESTIÓN DE TAREAS – CSN Gestión de Activos Inmobiliarios SPA
-- Base de datos centralizada en la nube (Supabase / PostgreSQL)
--
-- INSTRUCCIONES
--   1. Ingrese a https://supabase.com y cree un proyecto gratuito.
--   2. Abra "SQL Editor" y pegue este archivo completo; ejecútelo (Run).
--   3. En "Project Settings → API" copie:
--        · Project URL        → Configuración → Sincronización → Dirección del proyecto
--        · anon public key    → Configuración → Sincronización → Clave pública
--   4. (Opcional) Cree un usuario en "Authentication → Users" y use su correo y
--      contraseña para que sólo los usuarios autorizados accedan a los datos.
--   5. En la aplicación pulse "Probar conexión" y luego "Sincronizar ahora".
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tabla única de registros (comunidades, tareas, avances, archivos, usuarios,
-- historial y configuración). Cada fila es un registro sincronizable, lo que
-- permite resolver conflictos registro por registro con marcas de tiempo.
-- ---------------------------------------------------------------------------
create table if not exists public.csn_registros (
  id          text primary key,              -- identificador del registro
  coleccion   text not null,                 -- comunidades | tareas | avances | archivos | usuarios | historial | config
  datos       jsonb not null,                -- contenido completo del registro
  ts          bigint not null default 0,     -- marca de tiempo de la última modificación (epoch ms)
  actualizado timestamptz not null default now()
);

create index if not exists csn_registros_ts_idx  on public.csn_registros (ts);
create index if not exists csn_registros_col_idx on public.csn_registros (coleccion);

-- ---------------------------------------------------------------------------
-- Seguridad a nivel de fila (RLS)
-- ---------------------------------------------------------------------------
alter table public.csn_registros enable row level security;

-- Variante A (RECOMENDADA): sólo usuarios autenticados acceden a los datos.
drop policy if exists "csn_leer_autenticados" on public.csn_registros;
create policy "csn_leer_autenticados" on public.csn_registros
  for select to authenticated using (true);

drop policy if exists "csn_insertar_autenticados" on public.csn_registros;
create policy "csn_insertar_autenticados" on public.csn_registros
  for insert to authenticated with check (true);

drop policy if exists "csn_actualizar_autenticados" on public.csn_registros;
create policy "csn_actualizar_autenticados" on public.csn_registros
  for update to authenticated using (true) with check (true);

drop policy if exists "csn_eliminar_autenticados" on public.csn_registros;
create policy "csn_eliminar_autenticados" on public.csn_registros
  for delete to authenticated using (true);

-- Variante B (sólo si NO se usará autenticación de usuarios):
-- permite el acceso con la clave pública "anon". Úsela únicamente mientras
-- prueba el sistema; en producción prefiera la Variante A.
--
-- drop policy if exists "csn_anon_todo" on public.csn_registros;
-- create policy "csn_anon_todo" on public.csn_registros
--   for all to anon using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Mantención opcional: elimina registros borrados (marca _deleted) antiguos.
-- ---------------------------------------------------------------------------
-- delete from public.csn_registros
--  where (datos->>'_deleted')::boolean is true
--    and ts < (extract(epoch from now()) * 1000 - 30 * 86400000)::bigint;
