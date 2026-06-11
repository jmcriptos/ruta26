-- OPCIONAL: copia completa antes de cerrar permisos.
--
-- Solo crea datos; no borra ni modifica page_views. La copia queda en un
-- esquema privado que no se expone por la API pública de Supabase.
-- Si ya existe una copia con este nombre, la consulta falla sin sobrescribirla.

begin;

create schema if not exists private;
create table private.page_views_backup_20260611 as
select * from public.page_views;

do $$
declare
  original_count bigint;
  backup_count bigint;
begin
  select count(*) into original_count from public.page_views;
  select count(*) into backup_count from private.page_views_backup_20260611;
  if original_count <> backup_count then
    raise exception 'La copia no coincide: original %, backup %', original_count, backup_count;
  end if;
end
$$;

commit;

select
  (select count(*) from public.page_views) as filas_original,
  (select count(*) from private.page_views_backup_20260611) as filas_backup;
