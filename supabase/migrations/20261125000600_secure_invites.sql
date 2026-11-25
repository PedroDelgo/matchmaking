begin;

-- Membership is authority; a legacy profile_id/name never binds a player.
alter table public.tournament_members add column participant_id text;
alter table public.tournament_members add constraint member_participant_same_tournament
  foreign key(tournament_id,participant_id) references public.participants(tournament_id,domain_id)
  on delete set null (participant_id);
alter table public.tournament_members add constraint viewer_has_no_competitive_slot
  check(role='participant' or participant_id is null);
create unique index member_competitive_identity on public.tournament_members(tournament_id,participant_id)
  where participant_id is not null;

create table matchmaking_private.tournament_invites (
  id uuid primary key,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  created_by uuid not null references public.profiles(user_id),
  access_role text not null check(access_role in ('participant','viewer')),
  token_digest text not null unique check(token_digest ~ '^[a-f0-9]{64}$'),
  code_digest text not null unique check(code_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  max_uses integer not null check(max_uses between 1 and 100),
  use_count integer not null default 0 check(use_count between 0 and max_uses),
  revoked_at timestamptz,
  check(expires_at>created_at)
);
create index invites_tournament_created on matchmaking_private.tournament_invites(tournament_id,created_at desc);
create table matchmaking_private.invite_receipts (
  actor_id uuid not null references public.profiles(user_id),
  command_id uuid not null,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  payload_hash text not null check(payload_hash ~ '^[a-f0-9]{64}$'),
  response jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key(actor_id,command_id)
);
create table matchmaking_private.invite_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  actor_id uuid not null references public.profiles(user_id),
  command_id uuid not null,
  type text not null check(type in ('create_invite','revoke_invite','accept_invite','remove_member')),
  details jsonb not null,
  created_at timestamptz not null default clock_timestamp()
);
create table matchmaking_private.invite_rate_limits (
  bucket text primary key check(bucket ~ '^[a-f0-9]{64}$'),
  attempts integer not null check(attempts>0),
  resets_at timestamptz not null
);

alter table matchmaking_private.tournament_invites enable row level security;
alter table matchmaking_private.invite_receipts enable row level security;
alter table matchmaking_private.invite_events enable row level security;
alter table matchmaking_private.invite_rate_limits enable row level security;
revoke all on matchmaking_private.tournament_invites,matchmaking_private.invite_receipts,
  matchmaking_private.invite_events,matchmaking_private.invite_rate_limits from public,anon,authenticated,service_role;
grant select,insert on matchmaking_private.tournament_invites,matchmaking_private.invite_receipts,
  matchmaking_private.invite_events to matchmaking_command;
grant update(use_count,revoked_at) on matchmaking_private.tournament_invites to matchmaking_command;
grant select,insert,update,delete on matchmaking_private.invite_rate_limits to matchmaking_command;
create policy command_invites on matchmaking_private.tournament_invites to matchmaking_command using(true) with check(true);
create policy command_invite_receipts on matchmaking_private.invite_receipts to matchmaking_command using(true) with check(true);
create policy command_invite_events on matchmaking_private.invite_events to matchmaking_command using(true) with check(true);
create policy command_invite_limits on matchmaking_private.invite_rate_limits to matchmaking_command using(true) with check(true);
grant insert,delete on public.tournament_members to matchmaking_command;
grant update(role,participant_id) on public.tournament_members to matchmaking_command;
create policy command_members_insert on public.tournament_members for insert to matchmaking_command with check(true);
create policy command_members_update on public.tournament_members for update to matchmaking_command using(true) with check(true);
create policy command_members_delete on public.tournament_members for delete to matchmaking_command using(true);

alter table matchmaking_private.tournament_events drop constraint tournament_events_type_check;
alter table matchmaking_private.tournament_events add constraint tournament_events_type_check check(type in
  ('create_tournament','import_tournament','add_participant','remove_participant','draw_bracket','record_result','correct_result','accept_invite'));

-- Guests use authenticated, never the PostgreSQL anon role. Only self profile READ
-- and explicit tournament membership are intended for them; nickname editing is permanent-account only.
create policy profile_permanent_update on public.profiles as restrictive for update to authenticated
  using ((coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'is_anonymous') is distinct from 'true')
  with check ((coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb->>'is_anonymous') is distinct from 'true');

-- Defense against a forged/misclassified service actor. No Auth table grant is given to the service.
create function matchmaking_private.require_recoverable_owner()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from auth.users u where u.id=new.owner_user_id and u.is_anonymous is not true) then
    raise exception 'Recoverable owner required' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function matchmaking_private.require_recoverable_owner() from public,anon,authenticated,service_role;
create trigger recoverable_tournament_owner before insert or update of owner_user_id on public.tournaments
  for each row execute function matchmaking_private.require_recoverable_owner();
commit;
