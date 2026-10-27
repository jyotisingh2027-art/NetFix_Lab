-- NetFixLab payments setup (run once in Supabase SQL Editor, after schema.sql).
-- Lets the payment webhook (Cloudflare Worker, using the Supabase secret key)
-- record purchases and unlock the course. The website itself still cannot.

grant select, update on public.profiles to service_role;
grant select, insert, update on public.purchases to service_role;

-- Find an account by email (fallback when a payment arrives without the account ID).
-- Only the server (secret key) may call it.
create or replace function public.user_id_for_email(p_email text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from auth.users
  where lower(email) = lower(trim(p_email)) and deleted_at is null
  limit 1;
$$;
revoke all on function public.user_id_for_email(text) from public, anon, authenticated;
grant execute on function public.user_id_for_email(text) to service_role;
