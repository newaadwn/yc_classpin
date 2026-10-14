alter table public.session_folders
add column purpose_label text;

-- 직접 입력한 카테고리 이름은 `other` 목적에서만, 공백을 제거한 1~40자로만 저장한다.
alter table public.session_folders
add constraint session_folders_purpose_label_check
check (
  purpose_label is null
  or (purpose = 'other' and char_length(btrim(purpose_label)) between 1 and 40)
);

-- 기존 owner RLS와 authenticated grant가 새 열에도 그대로 적용된다.
notify pgrst, 'reload schema';
