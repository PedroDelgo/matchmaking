begin;
alter table matchmaking_private.tournament_events drop constraint tournament_events_type_check;
alter table matchmaking_private.tournament_events add constraint tournament_events_type_check
  check (type in ('create_tournament','import_tournament','add_participant','remove_participant','draw_bracket','record_result','correct_result'));
create index tournaments_owner_page on public.tournaments(owner_user_id,updated_at desc,id desc);

-- Permanent reservation: removing a participant never frees their textual ID.
create table matchmaking_private.participant_ids (
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  domain_id text not null check (length(domain_id) between 1 and 200),
  primary key (tournament_id,domain_id)
);
insert into matchmaking_private.participant_ids select tournament_id,domain_id from public.participants;
create table matchmaking_private.operation_receipts (
  actor_id uuid not null references public.profiles(user_id),
  command_id uuid not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id,command_id)
);
create table matchmaking_private.tournament_imports (
  actor_id uuid not null references public.profiles(user_id),
  installation_id uuid not null,
  import_id uuid not null,
  snapshot_hash text not null check (snapshot_hash ~ '^[a-f0-9]{64}$'),
  tournament_id uuid not null references public.tournaments(id) on delete restrict,
  state text not null default 'confirmed' check (state = 'confirmed'),
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id,installation_id,import_id)
);
alter table matchmaking_private.participant_ids enable row level security;
alter table matchmaking_private.operation_receipts enable row level security;
alter table matchmaking_private.tournament_imports enable row level security;
revoke all on matchmaking_private.participant_ids,matchmaking_private.operation_receipts,matchmaking_private.tournament_imports
  from public,anon,authenticated,service_role;
grant select,insert on matchmaking_private.participant_ids,matchmaking_private.operation_receipts,matchmaking_private.tournament_imports to matchmaking_command;
create policy command_participant_ids on matchmaking_private.participant_ids to matchmaking_command using (true) with check (true);
create policy command_operations on matchmaking_private.operation_receipts to matchmaking_command using (true) with check (true);
create policy command_imports on matchmaking_private.tournament_imports to matchmaking_command using (true) with check (true);

-- Only the server role constructs aggregates. Ownership is immutable after INSERT.
grant insert (id,domain_id,owner_user_id,name,modality,capacity,status,revision,draw_order,champion_id,created_at,started_at,completed_at)
  on public.tournaments to matchmaking_command;
grant update (started_at,draw_order) on public.tournaments to matchmaking_command;
grant insert on public.participants,public.rounds,public.matches to matchmaking_command;
grant delete on public.participants to matchmaking_command;
grant update (position_index) on public.participants to matchmaking_command;
create policy command_participant_insert on public.participants for insert to matchmaking_command with check (true);
create policy command_participant_delete on public.participants for delete to matchmaking_command using (true);
create policy command_participant_update on public.participants for update to matchmaking_command using (true) with check (true);
commit;
