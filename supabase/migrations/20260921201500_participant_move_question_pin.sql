-- 참여자는 라이브 강의에서 아직 답변되지 않은 자기 질문의 PIN 위치만 옮길 수 있다.
-- 작성자·강의·자료 버전은 바꾸지 않으며, 같은 자료 버전 안의 슬라이드로만 이동한다.
-- questions.slide_id/region_id 와 region_anchors 는 column privilege·RLS 로 직접 수정이
-- 막혀 있으므로, 검증을 모두 통과한 경우에만 이 함수가 좌표와 슬라이드를 함께 바꾼다.
create or replace function public.move_own_question_pin(
  target_question_id uuid,
  target_slide_id uuid,
  target_x double precision,
  target_y double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  question_row public.questions%rowtype;
  current_version uuid;
  target_version uuid;
  anchor_id uuid;
begin
  if not (select private.is_participant()) then
    raise exception 'participant required' using errcode = '42501';
  end if;
  if target_x is null or target_y is null
    or not (target_x between 0 and 1 and target_y between 0 and 1) then
    raise exception 'pin coordinates must be normalized' using errcode = '22023';
  end if;

  select q.* into question_row
  from public.questions q
  where q.id = target_question_id
    and q.author_id = (select auth.uid())
    and q.status = 'unanswered'
  for update;
  if not found then
    raise exception 'question is not movable' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.lectures l
    where l.id = question_row.lecture_id
      and l.course_id = question_row.course_id
      and l.status = 'live'
  ) then
    raise exception 'lecture is not live' using errcode = '42501';
  end if;

  select s.material_version_id into current_version from public.slides s where s.id = question_row.slide_id;
  select s.material_version_id into target_version from public.slides s where s.id = target_slide_id;
  if target_version is null or target_version is distinct from current_version then
    raise exception 'target slide is outside the question material' using errcode = '22023';
  end if;

  if question_row.region_id is not null then
    update public.region_anchors
    set slide_id = target_slide_id,
        coords = jsonb_build_object('x', target_x, 'y', target_y)
    where id = question_row.region_id
      and kind = 'point'
      and created_by = 'user'
    returning id into anchor_id;
    if anchor_id is null then
      raise exception 'only participant point pins can move' using errcode = '42501';
    end if;
  else
    insert into public.region_anchors (slide_id, material_version_id, kind, coords, created_by)
    values (target_slide_id, target_version, 'point', jsonb_build_object('x', target_x, 'y', target_y), 'user')
    returning id into anchor_id;
  end if;

  update public.questions
  set slide_id = target_slide_id,
      region_id = anchor_id,
      updated_at = now()
  where id = question_row.id;
end;
$$;

revoke all on function public.move_own_question_pin(uuid, uuid, double precision, double precision) from public, anon;
grant execute on function public.move_own_question_pin(uuid, uuid, double precision, double precision) to authenticated;

comment on function public.move_own_question_pin(uuid, uuid, double precision, double precision) is
'Participants move the point PIN of their own unanswered question within the same live material version.';
