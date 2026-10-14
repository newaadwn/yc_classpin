create table private.question_group_actions (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  applied_at timestamptz not null,
  undone boolean not null default false
);
alter table private.question_group_actions enable row level security;
revoke all on private.question_group_actions from public,anon,authenticated;

create function public.complete_question_group(action_id uuid, question_snapshot jsonb)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare
  item record;
  q public.questions%rowtype;
  anchor jsonb;
  ids uuid[] := '{}';
  saved private.question_group_actions%rowtype;
  stamp timestamptz := clock_timestamp();
begin
  if auth.uid() is null or action_id is null or jsonb_typeof(question_snapshot) <> 'array'
    or jsonb_array_length(question_snapshot) not between 1 and 1000 then
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
    select coords into anchor from public.region_anchors where id=q.region_id;
    if q.status <> 'unanswered' or q.raw_text is distinct from item.text or q.slide_id is distinct from item.slide_id
      or (anchor->>'x')::double precision is distinct from item.x or (anchor->>'y')::double precision is distinct from item.y then
      raise exception 'questions changed; review group again' using errcode='40001';
    end if;
    ids := array_append(ids,q.id);
  end loop;
  update public.questions set status='resolved',updated_at=stamp where id=any(ids);
  insert into private.question_group_actions(id,owner_id,snapshot,applied_at) values(action_id,auth.uid(),question_snapshot,stamp);
  return ids;
end;
$$;

create function public.undo_question_group(action_id uuid)
returns uuid[] language plpgsql security definer set search_path='' as $$
declare saved private.question_group_actions%rowtype; q public.questions%rowtype; ids uuid[];
begin
  select * into saved from private.question_group_actions where id=action_id and owner_id=auth.uid() for update;
  if not found then raise exception 'owner required' using errcode='42501'; end if;
  ids := array(select (value->>'id')::uuid from jsonb_array_elements(saved.snapshot));
  if saved.undone then return ids; end if;
  for q in select * from public.questions where id=any(ids) order by id for update loop
    if not private.course_owned(q.course_id) or q.status<>'resolved' or q.updated_at is distinct from saved.applied_at then
      raise exception 'questions changed; cannot undo' using errcode='40001';
    end if;
  end loop;
  if (select count(*) from public.questions where id=any(ids)) <> cardinality(ids) then
    raise exception 'questions removed; cannot undo' using errcode='40001';
  end if;
  update public.questions set status='unanswered',updated_at=clock_timestamp() where id=any(ids);
  update private.question_group_actions set undone=true where id=action_id;
  return ids;
end;
$$;
revoke all on function public.complete_question_group(uuid,jsonb) from public,anon;
revoke all on function public.undo_question_group(uuid) from public,anon;
grant execute on function public.complete_question_group(uuid,jsonb) to authenticated;
grant execute on function public.undo_question_group(uuid) to authenticated;
