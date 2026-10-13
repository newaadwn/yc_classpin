-- Action snapshots contain question text: delete them with their lecture.
alter table private.question_group_actions add column lecture_id uuid references public.lectures(id) on delete cascade;
update private.question_group_actions a set lecture_id=q.lecture_id
from public.questions q where q.id=(a.snapshot->0->>'id')::uuid;

create or replace function public.complete_question_group(action_id uuid, question_snapshot jsonb)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare
  item record;
  q public.questions%rowtype;
  anchor jsonb;
  ids uuid[] := '{}';
  saved private.question_group_actions%rowtype;
  lecture uuid;
  stamp timestamptz := clock_timestamp();
begin
  if auth.uid() is null or action_id is null or question_snapshot is null
    or jsonb_typeof(question_snapshot) <> 'array' or jsonb_array_length(question_snapshot) not between 1 and 1000 then
    raise exception 'invalid group action' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(action_id::text,1));
  select * into saved from private.question_group_actions where id=action_id;
  if found then
    if saved.owner_id is distinct from auth.uid() or saved.snapshot is distinct from question_snapshot or saved.undone then
      raise exception 'action ID already used' using errcode='22023';
    end if;
    return array(select (value->>'id')::uuid from jsonb_array_elements(saved.snapshot));
  end if;
  for item in select * from jsonb_to_recordset(question_snapshot) as x(id uuid, text text, slide_id uuid, x double precision,y double precision) order by id loop
    select * into q from public.questions where id=item.id for update;
    if not found or not private.course_owned(q.course_id) then
      raise exception 'owner required' using errcode='42501';
    end if;
    if q.id=any(ids) or (lecture is not null and lecture<>q.lecture_id) then
      raise exception 'duplicate question or mixed lectures' using errcode='22023';
    end if;
    lecture := q.lecture_id;
    select coords into anchor from public.region_anchors where id=q.region_id;
    if q.status <> 'unanswered' or q.raw_text is distinct from item.text or q.slide_id is distinct from item.slide_id
      or (anchor->>'x')::double precision is distinct from item.x or (anchor->>'y')::double precision is distinct from item.y then
      raise exception 'questions changed; review group again' using errcode='22023';
    end if;
    ids := array_append(ids,q.id);
  end loop;
  update public.questions set status='resolved',updated_at=stamp where id=any(ids);
  insert into private.question_group_actions(id,owner_id,snapshot,applied_at,lecture_id) values(action_id,auth.uid(),question_snapshot,stamp,lecture);
  return ids;
end;
$$;
