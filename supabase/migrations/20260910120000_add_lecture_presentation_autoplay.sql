alter table public.lectures
add column if not exists presentation_autoplay boolean not null default false;

comment on column public.lectures.presentation_autoplay is
'Whether the live presentation advances slides automatically.';
