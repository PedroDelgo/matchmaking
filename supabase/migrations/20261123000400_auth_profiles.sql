begin;

-- Existing nicknames remain untouched. Validation applies to new writes only.
alter table public.profiles
  add column updated_at timestamptz not null default now();

create function matchmaking_private.validate_profile_write()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Reject controls before whitespace normalization, including bidi/zero-width
  -- controls. PostgreSQL text cannot contain U+0000.
  if new.nickname is null or new.nickname ~
    U&'[\0001-\001F\007F-\009F\00AD\200B-\200F\202A-\202E\2060-\206F\FEFF]'
  then
    raise exception 'Invalid nickname' using errcode = '23514';
  end if;
  -- Explicit ECMAScript whitespace set avoids dependence on the DB locale.
  new.nickname := pg_catalog.btrim(pg_catalog.regexp_replace(new.nickname,
    U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000]+', ' ', 'g'));
  if pg_catalog.char_length(new.nickname) not between 2 and 40 then
    raise exception 'Invalid nickname' using errcode = '23514';
  end if;
  new.updated_at := pg_catalog.clock_timestamp();
  return new;
end
$$;
revoke all on function matchmaking_private.validate_profile_write()
  from public, anon, authenticated, service_role;
create trigger validate_profile_write
  before insert or update on public.profiles
  for each row execute function matchmaking_private.validate_profile_write();

-- The Auth hook creates a neutral profile; user metadata and local IDs cannot
-- choose ownership, privileges or nickname through this privileged path.
create function matchmaking_private.create_auth_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(user_id,nickname)
  values(new.id,'Competidor') on conflict (user_id) do nothing;
  return new;
end
$$;
revoke all on function matchmaking_private.create_auth_profile()
  from public, anon, authenticated, service_role;
create trigger create_matchmaking_profile
  after insert on auth.users
  for each row execute function matchmaking_private.create_auth_profile();

-- Covers preexisting Auth accounts, without replacing any existing profile.
insert into public.profiles(user_id,nickname)
select id,'Competidor' from auth.users on conflict (user_id) do nothing;

-- Profiles are provisioned only by Auth; clients may change one field of self.
grant update(nickname) on public.profiles to authenticated;
create policy profile_self_update on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

commit;
