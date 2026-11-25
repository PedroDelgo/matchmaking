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
  if not has_column_privilege('authenticated','public.profiles','nickname','UPDATE') or
     has_column_privilege('authenticated','public.profiles','user_id','UPDATE') or
     has_column_privilege('authenticated','public.profiles','created_at','UPDATE') or
     has_column_privilege('authenticated','public.profiles','updated_at','UPDATE') or
     has_table_privilege('authenticated','public.profiles','INSERT,DELETE') then
    raise exception 'Unsafe profile write grants';
  end if;
  if has_function_privilege('authenticated','matchmaking_private.create_auth_profile()','EXECUTE') or
     has_function_privilege('anon','matchmaking_private.create_auth_profile()','EXECUTE') or
     has_function_privilege('authenticated','matchmaking_private.validate_profile_write()','EXECUTE') then
    raise exception 'Profile trigger directly executable by client';
  end if;
  if has_column_privilege('matchmaking_command','public.tournaments','owner_user_id','UPDATE') or
     has_table_privilege('matchmaking_command','public.tournament_members','TRUNCATE') then
    raise exception 'Unsafe ownership/access grants';
  end if;
  foreach item in array array['participant_ids','operation_receipts','tournament_imports','tournament_events','command_receipts','invite_receipts','invite_events'] loop
    if not (select relrowsecurity from pg_class where oid=('matchmaking_private.'||item)::regclass) or
       has_table_privilege('authenticated','matchmaking_private.'||item,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or
       has_table_privilege('anon','matchmaking_private.'||item,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or
       has_table_privilege('service_role','matchmaking_private.'||item,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or
       has_table_privilege('matchmaking_command','matchmaking_private.'||item,'UPDATE,DELETE,TRUNCATE') then
      raise exception 'Unsafe private metadata grants or RLS: %',item;
    end if;
  end loop;
  foreach item in array array['tournament_invites','invite_rate_limits'] loop
    if not (select relrowsecurity from pg_class where oid=('matchmaking_private.'||item)::regclass) or
       has_table_privilege('authenticated','matchmaking_private.'||item,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or
       has_table_privilege('anon','matchmaking_private.'||item,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or
       has_table_privilege('service_role','matchmaking_private.'||item,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'Unsafe invitation grants/RLS: %',item;
    end if;
  end loop;
  if has_column_privilege('matchmaking_command','matchmaking_private.tournament_invites','token_digest','UPDATE') or
     has_column_privilege('matchmaking_command','matchmaking_private.tournament_invites','code_digest','UPDATE') or
     has_function_privilege('authenticated','matchmaking_private.require_recoverable_owner()','EXECUTE') then
    raise exception 'Unsafe invitation/owner trigger grants';
  end if;
end $$;
