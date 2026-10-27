-- NetFixLab database setup
-- Run once in Supabase: SQL Editor -> New query -> paste all of this -> Run.
-- Safe to re-run: it only creates what is missing and replaces the functions.
--
-- Design:
--   * The website only READS a learner's own profile, progress and purchases.
--   * Every write goes through the small functions at the bottom, which check
--     who is calling and what they are allowed to do.
--   * Nobody can unlock the paid lessons from the browser. Only the payment
--     webhook (server side, using the secret key) can set profiles.unlocked.
--   * Guest tracking (visitors, lesson_events) is anonymous: a random browser
--     ID, no names, emails or IP addresses. Only you can read it, here in the
--     dashboard.

-------------------------------------------------------------------------------
-- 1. Tables
-------------------------------------------------------------------------------

-- One row per learner. Created automatically when someone signs up.
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  unlocked    boolean not null default false,   -- paid for lessons 4-12
  unlocked_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per learner per lesson they have opened.
create table if not exists public.lesson_progress (
  user_id         uuid not null references auth.users (id) on delete cascade,
  lesson          smallint not null check (lesson between 1 and 12),
  first_opened_at timestamptz not null default now(),
  completed_at    timestamptz,
  quiz_attempts   integer not null default 0,
  quiz_passed     boolean not null default false,
  primary key (user_id, lesson)
);

-- One row per payment. Written only by the Dodo Payments webhook.
create table if not exists public.purchases (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users (id) on delete set null,
  dodo_payment_id text not null unique,
  amount_cents    integer not null,
  currency        text not null,
  status          text not null check (status in ('succeeded', 'refunded', 'failed')),
  created_at      timestamptz not null default now()
);
create index if not exists purchases_user_id_idx on public.purchases (user_id);

-- Messages from the Contact form. Only readable in this dashboard.
create table if not exists public.contact_messages (
  id         bigint generated always as identity primary key,
  name       text not null,
  email      text not null,
  message    text not null,
  user_id    uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- One row per browser (anonymous). Linked to an account if they sign up.
create table if not exists public.visitors (
  visitor_id    text primary key check (visitor_id ~ '^v_[a-z0-9]{12,40}$'),
  first_seen_at timestamptz not null default now(),
  source        text,          -- google, linkedin, direct, ...
  device        text check (device in ('mobile', 'desktop')),
  user_id       uuid references auth.users (id) on delete set null
);
create index if not exists visitors_user_id_idx on public.visitors (user_id);

-- One row per action, for guests and members alike.
create table if not exists public.lesson_events (
  id         bigint generated always as identity primary key,
  visitor_id text not null,
  user_id    uuid references auth.users (id) on delete set null,
  lesson     smallint check (lesson between 1 and 12),
  event      text not null check (event in (
               'cover_viewed', 'comic_opened', 'quiz_wrong', 'quiz_passed',
               'lesson_completed', 'paywall_viewed', 'signed_up', 'checkout_started')),
  created_at timestamptz not null default now()
);
create index if not exists lesson_events_created_idx on public.lesson_events (created_at);
create index if not exists lesson_events_visitor_idx on public.lesson_events (visitor_id);

-------------------------------------------------------------------------------
-- 2. Row Level Security: the website can only read the signed-in learner's
--    own rows. Tables without a policy (contact_messages, visitors,
--    lesson_events) cannot be read or written from the website at all; the
--    functions below write to them.
-------------------------------------------------------------------------------

alter table public.profiles         enable row level security;
alter table public.lesson_progress  enable row level security;
alter table public.purchases        enable row level security;
alter table public.contact_messages enable row level security;
alter table public.visitors         enable row level security;
alter table public.lesson_events    enable row level security;

drop policy if exists "Read own profile" on public.profiles;
create policy "Read own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);

drop policy if exists "Read own progress" on public.lesson_progress;
create policy "Read own progress" on public.lesson_progress
  for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Read own purchases" on public.purchases;
create policy "Read own purchases" on public.purchases
  for select to authenticated using ((select auth.uid()) = user_id);

-- Table access for the website (signed-in learners): read only.
revoke all on public.profiles, public.lesson_progress, public.purchases,
              public.contact_messages, public.visitors, public.lesson_events
  from anon, authenticated;
grant select on public.profiles, public.lesson_progress, public.purchases to authenticated;

-------------------------------------------------------------------------------
-- 3. Create a profile automatically for every new account
-------------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name',
                  new.raw_user_meta_data ->> 'name',
                  split_part(new.email, '@', 1)), 80)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-------------------------------------------------------------------------------
-- 4. Functions the website calls (each checks the caller)
-------------------------------------------------------------------------------

-- Record lesson progress for the signed-in learner.
-- p_action: 'opened' | 'quiz_wrong' | 'quiz_passed' | 'completed'
-- Lessons 4-12 are only recorded for learners who have paid.
create or replace function public.record_progress(p_lesson int, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'Not signed in';
  end if;
  if p_lesson is null or p_lesson < 1 or p_lesson > 12 then
    raise exception 'Invalid lesson';
  end if;
  if p_action not in ('opened', 'quiz_wrong', 'quiz_passed', 'completed') then
    raise exception 'Invalid action';
  end if;
  if p_lesson > 3 and not exists (
       select 1 from public.profiles where id = uid and unlocked) then
    raise exception 'Lesson locked';
  end if;

  insert into public.lesson_progress (user_id, lesson)
  values (uid, p_lesson)
  on conflict (user_id, lesson) do nothing;

  update public.lesson_progress set
    quiz_attempts = quiz_attempts + case when p_action in ('quiz_wrong', 'quiz_passed') then 1 else 0 end,
    quiz_passed   = quiz_passed or p_action = 'quiz_passed',
    completed_at  = case when p_action = 'completed' then coalesce(completed_at, now()) else completed_at end
  where user_id = uid and lesson = p_lesson;
end;
$$;

-- Change the signed-in learner's display name.
create or replace function public.set_my_name(p_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if p_name is null or length(trim(p_name)) < 2 or length(p_name) > 80 then
    raise exception 'Invalid name';
  end if;
  update public.profiles set full_name = trim(p_name), updated_at = now()
  where id = auth.uid();
end;
$$;

-- Register an anonymous browser, and link it to the account once signed in.
create or replace function public.track_visit(p_visitor text, p_source text, p_device text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_visitor is null or p_visitor !~ '^v_[a-z0-9]{12,40}$' then
    return;
  end if;
  insert into public.visitors (visitor_id, source, device)
  values (
    p_visitor,
    left(nullif(lower(trim(p_source)), ''), 40),
    case when p_device in ('mobile', 'desktop') then p_device end
  )
  on conflict (visitor_id) do nothing;

  if auth.uid() is not null then
    update public.visitors set user_id = auth.uid()
    where visitor_id = p_visitor and user_id is null;
  end if;
end;
$$;

-- Record one course event (guest or member).
create or replace function public.track_event(p_visitor text, p_lesson int, p_event text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_visitor is null or p_visitor !~ '^v_[a-z0-9]{12,40}$' then
    return;
  end if;
  if p_lesson is not null and (p_lesson < 1 or p_lesson > 12) then
    return;
  end if;
  insert into public.lesson_events (visitor_id, user_id, lesson, event)
  values (p_visitor, auth.uid(), p_lesson, p_event);
exception
  when check_violation then
    return;   -- ignore unknown event names instead of failing the page
end;
$$;

-- Save a Contact form message.
create or replace function public.send_contact(p_name text, p_email text, p_message text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_name is null or length(trim(p_name)) < 2 or length(p_name) > 80 then
    raise exception 'Invalid name';
  end if;
  if p_email is null or p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then
    raise exception 'Invalid email';
  end if;
  if p_message is null or length(trim(p_message)) < 5 or length(p_message) > 4000 then
    raise exception 'Invalid message';
  end if;
  insert into public.contact_messages (name, email, message, user_id)
  values (trim(p_name), lower(trim(p_email)), trim(p_message), auth.uid());
end;
$$;

-- Who may call which function.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.record_progress(int, text)      from public;
revoke all on function public.set_my_name(text)               from public;
revoke all on function public.track_visit(text, text, text)   from public;
revoke all on function public.track_event(text, int, text)    from public;
revoke all on function public.send_contact(text, text, text)  from public;

grant execute on function public.record_progress(int, text)     to authenticated;
grant execute on function public.set_my_name(text)              to authenticated;
grant execute on function public.track_visit(text, text, text)  to anon, authenticated;
grant execute on function public.track_event(text, int, text)   to anon, authenticated;
grant execute on function public.send_contact(text, text, text) to anon, authenticated;

-- Used by the "Forgot your password?" page: is this email registered?
create or replace function public.email_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users
    where lower(email) = lower(trim(p_email)) and deleted_at is null
  );
$$;
revoke all on function public.email_registered(text) from public;
grant execute on function public.email_registered(text) to anon, authenticated;

-------------------------------------------------------------------------------
-- 5. Payments (also in payments.sql)
-------------------------------------------------------------------------------

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
