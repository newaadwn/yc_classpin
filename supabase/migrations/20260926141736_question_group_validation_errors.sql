-- A stale UI snapshot is a validation failure, not a retryable serialization failure.
-- The caller must refresh/review instead of retrying the transaction automatically.
do $$
begin
  execute replace(pg_get_functiondef('public.complete_question_group(uuid,jsonb)'::regprocedure),
    'errcode=''40001''','errcode=''22023''');
  execute replace(pg_get_functiondef('public.undo_question_group(uuid)'::regprocedure),
    'errcode=''40001''','errcode=''22023''');
end;
$$;
