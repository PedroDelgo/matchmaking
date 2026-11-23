begin;

create schema if not exists matchmaking_private;
revoke all on schema matchmaking_private from public, anon, authenticated;

-- NOLOGIN: a separate server login may be granted this role by an operator.
do $$ begin
  if not exists (select 1 from pg_roles where rolname='matchmaking_command') then
    create role matchmaking_command nologin noinherit nosuperuser nobypassrls;
  end if;
  if exists (select 1 from pg_roles where rolname='matchmaking_command' and
      (rolsuper or rolbypassrls or rolcanlogin or rolinherit)) then
    raise exception 'Unsafe existing matchmaking_command role';
  end if;
end $$;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete restrict,
  nickname text not null check (length(btrim(nickname)) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  domain_id text not null check (length(domain_id) between 1 and 200),
  owner_user_id uuid not null references public.profiles(user_id) on delete restrict,
  name text not null check (length(btrim(name)) between 1 and 80),
  modality text not null check (length(btrim(modality)) between 1 and 80),
  capacity smallint not null check (capacity in (4,8,16)),
  status text not null check (status in ('draft','active','completed')),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  schema_version integer not null default 1 check (schema_version = 1),
  rules_version integer not null default 1 check (rules_version = 1),
  draw_order text[] not null default '{}',
  champion_id text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check ((status = 'completed') = (champion_id is not null)),
  check ((status = 'completed') = (completed_at is not null)),
  check ((status = 'draft' and cardinality(draw_order) = 0) or
         (status <> 'draft' and cardinality(draw_order) = capacity))
);
create table public.tournament_members (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete restrict,
  role text not null check (role in ('participant','viewer')),
  created_at timestamptz not null default now(),
  primary key (tournament_id,user_id)
);
create index members_user_access on public.tournament_members(user_id,tournament_id);
create index tournaments_owner_access on public.tournaments(owner_user_id);
create table public.participants (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  domain_id text not null check (length(domain_id) between 1 and 200),
  display_name text not null check (length(btrim(display_name)) between 1 and 80),
  position_index smallint not null check (position_index between 0 and 15),
  profile_id text,
  created_at timestamptz not null default now(),
  primary key (tournament_id,domain_id),
  unique (tournament_id,position_index)
);
-- profile_id preserves a domain association; it never grants remote authority.
create table public.rounds (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  domain_id text not null check (length(domain_id) between 1 and 200),
  round_index smallint not null check (round_index between 0 and 3),
  label text not null check (length(label) between 1 and 80),
  status text not null check (status in ('waiting','active','completed')),
  primary key (tournament_id,domain_id),
  unique (tournament_id,round_index)
);
create table public.matches (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  domain_id text not null check (length(domain_id) between 1 and 200),
  round_index smallint not null,
  position_index smallint not null check (position_index between 0 and 7),
  participant1_id text,
  participant2_id text,
  score1 bigint check (score1 between 0 and 9007199254740991),
  score2 bigint check (score2 between 0 and 9007199254740991),
  winner_id text,
  status text not null check (status in ('waiting','ready','completed')),
  next_match_id text,
  primary key (tournament_id,domain_id),
  unique (tournament_id,round_index,position_index),
  foreign key (tournament_id,round_index) references public.rounds(tournament_id,round_index),
  foreign key (tournament_id,participant1_id) references public.participants(tournament_id,domain_id),
  foreign key (tournament_id,participant2_id) references public.participants(tournament_id,domain_id),
  foreign key (tournament_id,winner_id) references public.participants(tournament_id,domain_id),
  foreign key (tournament_id,next_match_id) references public.matches(tournament_id,domain_id) deferrable initially deferred,
  check (participant1_id is null or participant2_id is null or participant1_id <> participant2_id),
  check (next_match_id is null or next_match_id <> domain_id),
  check ((status = 'completed' and participant1_id is not null and participant2_id is not null
          and score1 is not null and score2 is not null and winner_id is not null
          and winner_id in (participant1_id,participant2_id)) or
         (status = 'ready' and participant1_id is not null and participant2_id is not null
          and score1 is null and score2 is null and winner_id is null) or
         (status = 'waiting' and (participant1_id is null or participant2_id is null)
          and score1 is null and score2 is null and winner_id is null))
);
alter table public.tournaments add constraint champion_same_tournament
  foreign key (id,champion_id) references public.participants(tournament_id,domain_id) deferrable initially deferred;

create table matchmaking_private.tournament_events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  actor_id uuid not null references public.profiles(user_id),
  command_id uuid not null,
  revision bigint not null check (revision > 0),
  type text not null check (type in ('record_result','correct_result')),
  rules_version integer not null check (rules_version = 1),
  details jsonb not null,
  created_at timestamptz not null default now(),
  unique (tournament_id,revision)
);
create table matchmaking_private.command_receipts (
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  actor_id uuid not null references public.profiles(user_id),
  command_id uuid not null,
  command_version integer not null check (command_version = 1),
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  revision bigint not null check (revision > 0),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (tournament_id,actor_id,command_id),
  foreign key (tournament_id,revision) references matchmaking_private.tournament_events(tournament_id,revision)
);
-- response is an immutable historical receipt, never read as the canonical state.
commit;
