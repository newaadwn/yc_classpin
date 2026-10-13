-- AI question intake: preserve every original before location inference.
create table private.question_intake_receipts (
  question_id uuid primary key references public.questions(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  payload jsonb not null
);
revoke all on private.question_intake_receipts from public, anon, authenticated;
alter table private.question_intake_receipts enable row level security;

create or replace function public.receive_question(
  request_id uuid, target_lecture_id uuid, target_slide_id uuid,
  question_text text, question_category text, question_marker text,
  target_x double precision default null, target_y double precision default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  course uuid;
  version uuid;
  anchor uuid;
  payload jsonb;
  receipt private.question_intake_receipts%rowtype;
begin
  if not (select private.is_participant()) or request_id is null then
    raise exception 'participant required' using errcode = '42501';
  end if;
  if question_text is null or char_length(btrim(question_text)) not between 1 and 300
    or question_marker is null or question_marker not in ('pin','question','smile','idea')
    or (target_x is null) <> (target_y is null)
    or (target_x is not null and not (target_x between 0 and 1 and target_y between 0 and 1)) then
    raise exception 'invalid question' using errcode = '22023';
  end if;
  payload := jsonb_build_array(target_lecture_id,target_slide_id,question_text,question_category,question_marker,target_x,target_y);
  -- Serialize retries of a single UUID, not all submissions in the lecture.
  perform pg_advisory_xact_lock(hashtextextended(request_id::text, 0));
  select * into receipt from private.question_intake_receipts where question_id=request_id;
  if found then
    if receipt.author_id is distinct from (select auth.uid()) or receipt.payload is distinct from payload then
      raise exception 'request ID already used' using errcode = '22023';
    end if;
    return request_id;
  end if;
  select l.course_id, s.material_version_id into course, version
  from public.lectures l join public.materials m on m.lecture_id=l.id and m.course_id=l.course_id
  join public.material_versions mv on mv.material_id=m.id
  join public.slides s on s.material_version_id=mv.id
  where l.id=target_lecture_id and l.status='live' and s.id=target_slide_id;
  if course is null or not coalesce(private.question_category_enabled(target_lecture_id,question_category),false) then
    raise exception 'lecture, slide or category unavailable' using errcode = '42501';
  end if;
  if target_x is not null then
    insert into public.region_anchors(slide_id,material_version_id,kind,coords,created_by)
    values(target_slide_id,version,'point',jsonb_build_object('x',target_x,'y',target_y),'user') returning id into anchor;
  end if;
  insert into public.questions(id,course_id,lecture_id,slide_id,region_id,author_id,is_anonymous,category,marker,raw_text,status,occurred_in)
  values(request_id,course,target_lecture_id,target_slide_id,anchor,(select auth.uid()),true,question_category,question_marker,question_text,'unanswered','live');
  insert into private.question_intake_receipts values(request_id,(select auth.uid()),payload);
  return request_id;
end;
$$;
revoke all on function public.receive_question(uuid,uuid,uuid,text,text,text,double precision,double precision) from public, anon;
grant execute on function public.receive_question(uuid,uuid,uuid,text,text,text,double precision,double precision) to authenticated;
