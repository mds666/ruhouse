-- ============================================================
-- Rubbish House — create/register the first admin
--
-- Step 1. In Supabase Dashboard:
--   Authentication → Users → Add user
--   Enter an email + password for the admin.
--   If the form offers "Auto Confirm User", enable it.
--
-- Step 2. Replace the email below and run this file in SQL Editor.
-- ============================================================

insert into public.rh_admins (user_id, email)
select id, email
from auth.users
where lower(email) = lower('YOUR_ADMIN_EMAIL@example.com')
on conflict (user_id) do update set email = excluded.email;

-- Expected: 1 row inserted / updated.
-- If this returns 0 rows, the Auth user does not exist yet.
-- Check Authentication → Users, then try again.

select a.user_id, a.email, a.created_at
from public.rh_admins a
order by a.created_at;
