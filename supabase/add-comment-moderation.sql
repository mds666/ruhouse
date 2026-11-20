-- ============================================================
-- Rubbish House — comment reporting and moderation
--
-- Run after schema.sql (or add-delete.sql) has been installed.
-- Safe to run more than once.
-- ============================================================

alter table public.rh_comments
  add column if not exists status text not null default 'published',
  add column if not exists is_immune boolean not null default false;

alter table public.rh_comments
  drop constraint if exists rh_comments_status_check;

alter table public.rh_comments
  add constraint rh_comments_status_check
  check (status in ('published', 'pending', 'rejected'));

create index if not exists rh_comments_status_idx
  on public.rh_comments (status, is_hidden, created_at desc);

create table if not exists public.rh_comment_reports (
  comment_id uuid not null references public.rh_comments(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, reporter_id)
);

create index if not exists rh_comment_reports_created_idx
  on public.rh_comment_reports (created_at desc);

alter table public.rh_comment_reports enable row level security;
revoke all on table public.rh_comment_reports from anon, authenticated;

drop function if exists public.rh_list_comments(uuid);

create or replace function public.rh_list_comments(p_post_id uuid)
returns table (
  id uuid,
  author_label text,
  content text,
  created_at timestamptz,
  is_mine boolean,
  can_report boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recent as (
    select
      c.id,
      c.author_label,
      c.content,
      c.created_at,
      c.user_id,
      c.is_immune
    from public.rh_comments c
    join public.rh_posts p on p.id = c.post_id
    where c.post_id = p_post_id
      and c.is_hidden = false
      and c.status = 'published'
      and p.is_hidden = false
      and p.status = 'approved'
    order by c.created_at desc
    limit 200
  )
  select
    r.id,
    r.author_label,
    r.content,
    r.created_at,
    (r.user_id is not null and r.user_id = auth.uid()) as is_mine,
    (not r.is_immune and r.user_id is distinct from auth.uid()) as can_report
  from recent r
  order by r.created_at asc;
$$;

create or replace function public.rh_report_comment(p_comment_id uuid)
returns table (id uuid, comments_count integer)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_post_id uuid;
  v_author_id uuid;
  v_is_immune boolean;
  v_is_hidden boolean;
  v_status text;
  v_inserted integer := 0;
  v_count integer;
begin
  if v_user is null then
    raise exception '请先完成匿名身份初始化。' using errcode = '42501';
  end if;

  select c.post_id, c.user_id, c.is_immune, c.is_hidden, c.status
    into v_post_id, v_author_id, v_is_immune, v_is_hidden, v_status
  from public.rh_comments c
  join public.rh_posts p on p.id = c.post_id
  where c.id = p_comment_id
    and p.status = 'approved'
    and p.is_hidden = false;

  if v_post_id is null then
    raise exception '这条评论不存在或已经下架。' using errcode = 'P0002';
  end if;

  if v_author_id = v_user then
    raise exception '不能举报自己的评论。' using errcode = '42501';
  end if;

  if v_is_immune then
    raise exception '这条评论已通过管理员审核，不能再举报。' using errcode = '42501';
  end if;

  if v_is_hidden or v_status <> 'published' then
    raise exception '这条评论已经下架，正在等待管理员审核。' using errcode = 'P0002';
  end if;

  insert into public.rh_comment_reports (comment_id, reporter_id)
  values (p_comment_id, v_user)
  on conflict (comment_id, reporter_id) do nothing;

  get diagnostics v_inserted = row_count;

  if v_inserted = 0 then
    raise exception '你已经举报过这条评论。' using errcode = '23505';
  end if;

  update public.rh_comments as c
  set is_hidden = true,
      status = 'pending'
  where c.id = p_comment_id;

  update public.rh_posts as p
  set comments_count = greatest(p.comments_count - 1, 0)
  where p.id = v_post_id
  returning p.comments_count into v_count;

  return query select p_comment_id, coalesce(v_count, 0);
end;
$$;

create or replace function public.rh_admin_list_reported_comments()
returns table (
  id uuid,
  post_id uuid,
  post_title text,
  author_label text,
  content text,
  created_at timestamptz,
  report_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.rh_is_admin() then
    raise exception '需要管理员权限。' using errcode = '42501';
  end if;

  return query
  select
    c.id,
    c.post_id,
    p.title,
    c.author_label,
    c.content,
    c.created_at,
    (select count(*)::integer from public.rh_comment_reports r where r.comment_id = c.id)
  from public.rh_comments c
  join public.rh_posts p on p.id = c.post_id
  where c.status = 'pending'
    and c.is_hidden = true
    and p.is_hidden = false
  order by c.created_at asc;
end;
$$;

create or replace function public.rh_admin_review_comment(
  p_comment_id uuid,
  p_decision text
)
returns table (id uuid, status text, is_immune boolean)
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_post_id uuid;
  v_is_hidden boolean;
  v_status text;
begin
  if not public.rh_is_admin() then
    raise exception '需要管理员权限。' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('approved', 'rejected') then
    raise exception '只能通过或拒绝。' using errcode = '22023';
  end if;

  select c.post_id, c.is_hidden, c.status
    into v_post_id, v_is_hidden, v_status
  from public.rh_comments c
  where c.id = p_comment_id;

  if v_post_id is null or v_status <> 'pending' or not v_is_hidden then
    raise exception '这条评论不在待审核队列中。' using errcode = 'P0002';
  end if;

  if p_decision = 'approved' then
    update public.rh_comments as c
    set is_hidden = false,
        status = 'published',
        is_immune = true
    where c.id = p_comment_id;

    update public.rh_posts as p
    set comments_count = p.comments_count + 1
    where p.id = v_post_id;
  else
    update public.rh_comments as c
    set is_hidden = true,
        status = 'rejected',
        is_immune = false
    where c.id = p_comment_id;
  end if;

  return query
  select c.id, c.status, c.is_immune
  from public.rh_comments c
  where c.id = p_comment_id;
end;
$$;

revoke all on function public.rh_list_comments(uuid) from public;
revoke all on function public.rh_report_comment(uuid) from public;
revoke all on function public.rh_admin_list_reported_comments() from public;
revoke all on function public.rh_admin_review_comment(uuid, text) from public;

grant execute on function public.rh_list_comments(uuid) to anon, authenticated;
grant execute on function public.rh_report_comment(uuid) to authenticated;
grant execute on function public.rh_admin_list_reported_comments() to authenticated;
grant execute on function public.rh_admin_review_comment(uuid, text) to authenticated;

-- Expected: the three new functions.
select proname
from pg_proc
where proname in (
  'rh_list_comments',
  'rh_report_comment',
  'rh_admin_list_reported_comments',
  'rh_admin_review_comment'
)
order by proname;
