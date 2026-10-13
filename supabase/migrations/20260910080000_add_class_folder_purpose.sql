alter table public.session_folders
add column purpose text not null default 'qa';

alter table public.session_folders
add constraint session_folders_purpose_check
check (purpose in ('qa', 'feedback', 'education', 'brainstorming', 'other'));

-- 기존 owner RLS와 authenticated grant가 새 열에도 그대로 적용된다.
notify pgrst, 'reload schema';
