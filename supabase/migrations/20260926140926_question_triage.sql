-- Instructor-only per-original decisions survive recomputing display groups.
create table public.question_triage (
  question_id uuid primary key references public.questions(id) on delete cascade,
  deferred boolean not null default false,
  separate boolean not null default false
);
alter table public.question_triage enable row level security;
revoke all on public.question_triage from public, anon, authenticated;
grant select, insert, update on public.question_triage to authenticated;
create policy question_triage_owner_select on public.question_triage for select to authenticated
using (exists(select 1 from public.questions q where q.id=question_id and private.course_owned(q.course_id)));
create policy question_triage_owner_insert on public.question_triage for insert to authenticated
with check (exists(select 1 from public.questions q where q.id=question_id and private.course_owned(q.course_id)));
create policy question_triage_owner_update on public.question_triage for update to authenticated
using (exists(select 1 from public.questions q where q.id=question_id and private.course_owned(q.course_id)))
with check (exists(select 1 from public.questions q where q.id=question_id and private.course_owned(q.course_id)));
