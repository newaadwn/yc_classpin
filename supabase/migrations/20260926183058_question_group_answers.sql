-- Execute as the caller: existing question/answer owner RLS remains authoritative.
create or replace function public.answer_question_group(question_snapshot jsonb, answer_body text)
returns uuid[] language plpgsql security invoker set search_path='' as $$
declare
  item record;
  q public.questions%rowtype;
  previous public.answers%rowtype;
  anchor jsonb;
  ids uuid[] := '{}';
  lecture uuid;
  replay_count integer := 0;
  total integer;
begin
  if auth.uid() is null or jsonb_typeof(question_snapshot) is distinct from 'array'
    or answer_body is null or char_length(btrim(answer_body)) not between 1 and 2000 then
    raise exception 'invalid group answer' using errcode='22023';
  end if;
  total := jsonb_array_length(question_snapshot);
  if total not between 1 and 1000 or
    (select count(distinct value->>'id') from jsonb_array_elements(question_snapshot)) <> total or
    (select count(distinct value->>'answer_id') from jsonb_array_elements(question_snapshot)) <> total then
    raise exception 'invalid answer targets' using errcode='22023';
  end if;
  -- Stable lock ordering also serializes retries and overlapping group answers.
  for item in select * from jsonb_to_recordset(question_snapshot)
    as x(id uuid,answer_id uuid,text text,slide_id uuid,x double precision,y double precision) order by id loop
    select * into q from public.questions where id=item.id for update;
    if not found or not exists(select 1 from public.courses c where c.id=q.course_id and c.owner_id=auth.uid()) then
      raise exception 'owner required' using errcode='42501';
    end if;
    if lecture is not null and lecture <> q.lecture_id then
      raise exception 'one lecture required' using errcode='22023';
    end if;
    lecture := q.lecture_id;
    -- move_own_question_pin locks this same question before updating its anchor.
    -- Anchor RLS is SELECT-only for owners; do not request an UPDATE lock there.
    select coords into anchor from public.region_anchors where id=q.region_id;
    if q.raw_text is distinct from item.text or q.slide_id is distinct from item.slide_id
      or (anchor->>'x')::double precision is distinct from item.x
      or (anchor->>'y')::double precision is distinct from item.y then
      raise exception 'questions changed; review group again' using errcode='22023';
    end if;
    select * into previous from public.answers where id=item.answer_id;
    if found then
      if previous.question_id<>q.id or previous.author_id<>auth.uid()
        or previous.body<>btrim(answer_body) or previous.visibility<>'participants' then
        raise exception 'answer request already used' using errcode='22023';
      end if;
      replay_count := replay_count+1;
    elsif q.status<>'unanswered' then
      raise exception 'question already handled; review group again' using errcode='22023';
    end if;
    ids := array_append(ids,q.id);
  end loop;
  if replay_count=total then return ids; end if;
  if replay_count<>0 then raise exception 'inconsistent retry targets' using errcode='22023'; end if;
  insert into public.answers(id,question_id,author_id,body,visibility)
    select x.answer_id,x.id,auth.uid(),btrim(answer_body),'participants'
    from jsonb_to_recordset(question_snapshot) as x(id uuid,answer_id uuid);
  return ids;
end;
$$;
revoke all on function public.answer_question_group(jsonb,text) from public,anon;
grant execute on function public.answer_question_group(jsonb,text) to authenticated;
