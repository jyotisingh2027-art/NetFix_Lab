-- NetFixLab: November 2026 course update
-- Lessons now have permanent ids. Part 1 is the new comic issues (ids 13, 14, 15, free);
-- Part 2 keeps ids 8 to 12 (paid). The old Part 1 lessons (ids 1 to 7) were removed from the site;
-- their old progress rows are kept but no longer shown.
-- Run this once in Supabase: SQL Editor -> New query -> paste -> Run.

-- 1. Accept lesson ids 1 to 200 (was 1 to 12)
alter table public.lesson_progress drop constraint if exists lesson_progress_lesson_check;
alter table public.lesson_progress add constraint lesson_progress_lesson_check check (lesson between 1 and 200);
alter table public.lesson_events drop constraint if exists lesson_events_lesson_check;
alter table public.lesson_events add constraint lesson_events_lesson_check check (lesson between 1 and 200);

-- 2. Which lessons are free. Add an id here when you make a new lesson free.
create or replace function public.is_free_lesson(p_lesson int)
returns boolean
language sql
immutable
set search_path = ''
as $$ select p_lesson in (13, 14, 15, 16, 17) $$;

-- 3. Save progress: free lessons for everyone signed in, the rest only after payment
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
  if p_lesson is null or p_lesson < 1 or p_lesson > 200 then
    raise exception 'Invalid lesson';
  end if;
  if p_action not in ('opened', 'quiz_wrong', 'quiz_passed', 'completed') then
    raise exception 'Invalid action';
  end if;
  if not public.is_free_lesson(p_lesson) and not exists (
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

-- 4. Anonymous course events: accept the new ids
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
  if p_lesson is not null and (p_lesson < 1 or p_lesson > 200) then
    return;
  end if;
  insert into public.lesson_events (visitor_id, user_id, lesson, event)
  values (p_visitor, auth.uid(), p_lesson, p_event);
exception
  when check_violation then
    return;
end;
$$;

grant execute on function public.record_progress(int, text)     to authenticated;
grant execute on function public.track_event(text, int, text)   to anon, authenticated;
