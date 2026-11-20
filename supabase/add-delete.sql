-- ============================================================
-- Rubbish House — add delete permissions
--
-- Run this after the main schema.sql has already been installed.
-- It only adds the two delete functions, their permissions, and the
-- admin Storage delete policy. Existing posts are not touched.
-- ============================================================

create or replace function public.rh_delete_my_post(p_post_id uuid)
returns table (id uuid)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception '请先完成匿名身份初始化。' using errcode = '42501';
  end if;

  update public.rh_posts as p
  set is_hidden = true
  where p.id = p_post_id
    and p.user_id = v_user
    and p.is_hidden = false
  returning p.id into v_id;

  if v_id is null then
    raise exception '这条房间记录不存在，或不属于当前匿名身份。' using errcode = 'P0002';
  end if;

  return query select v_id;
end;
$$;

create or replace function public.rh_admin_delete_post(p_post_id uuid)
returns table (id uuid)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not public.rh_is_admin() then
    raise exception '需要管理员权限。' using errcode = '42501';
  end if;

  update public.rh_posts as p
  set is_hidden = true
  where p.id = p_post_id
    and p.is_hidden = false
  returning p.id into v_id;

  if v_id is null then
    raise exception '这条房间记录不存在。' using errcode = 'P0002';
  end if;

  return query select v_id;
end;
$$;

revoke all on function public.rh_delete_my_post(uuid) from public;
revoke all on function public.rh_admin_delete_post(uuid) from public;

grant execute on function public.rh_delete_my_post(uuid) to authenticated;
grant execute on function public.rh_admin_delete_post(uuid) to authenticated;

drop policy if exists "rh_room_photos_admin_delete" on storage.objects;
create policy "rh_room_photos_admin_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'room-photos'
  and public.rh_is_admin()
);

-- Expected: two function rows.
select proname
from pg_proc
where proname in ('rh_delete_my_post', 'rh_admin_delete_post');
