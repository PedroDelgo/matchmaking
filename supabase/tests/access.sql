-- Structural assertions; executed on real PostgreSQL by the disposable DB runner.
do $$
declare item text;
begin
  foreach item in array array['profiles','tournaments','tournament_members','participants','rounds','matches'] loop
    if not (select relrowsecurity from pg_class where oid=('public.'||item)::regclass) then
      raise exception 'RLS missing: %',item;
    end if;
    if has_table_privilege('authenticated','public.'||item,'INSERT,UPDATE,DELETE,TRUNCATE') or
       has_table_privilege('anon','public.'||item,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'Unsafe client grants: %',item;
    end if;
  end loop;
  if has_function_privilege('anon','matchmaking_private.can_read_tournament(uuid)','EXECUTE') then
    raise exception 'Definer executable by anon';
  end if;
  if has_column_privilege('matchmaking_command','public.tournaments','owner_user_id','UPDATE') or
     has_table_privilege('matchmaking_command','public.tournament_members','INSERT,UPDATE,DELETE') then
    raise exception 'Command role can change access';
  end if;
end $$;
