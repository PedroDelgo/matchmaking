begin;
create function matchmaking_private.can_read_tournament(target uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.tournaments t where t.id = target
    and (t.owner_user_id = (select auth.uid()) or exists (
      select 1 from public.tournament_members m
      where m.tournament_id = t.id and m.user_id = (select auth.uid())
    )))
$$;
revoke all on function matchmaking_private.can_read_tournament(uuid) from public, anon, authenticated;
grant usage on schema matchmaking_private to authenticated, matchmaking_command;
grant execute on function matchmaking_private.can_read_tournament(uuid) to authenticated;

revoke all on public.profiles, public.tournaments, public.tournament_members,
  public.participants, public.rounds, public.matches from public, anon, authenticated, service_role;
revoke all on all tables in schema matchmaking_private from public, anon, authenticated, service_role;
alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_members enable row level security;
alter table public.participants enable row level security;
alter table public.rounds enable row level security;
alter table public.matches enable row level security;
alter table matchmaking_private.tournament_events enable row level security;
alter table matchmaking_private.command_receipts enable row level security;

grant select on public.profiles, public.tournaments, public.tournament_members,
  public.participants, public.rounds, public.matches to authenticated;
create policy profile_self_read on public.profiles for select to authenticated using (user_id = (select auth.uid()));
create policy tournament_member_read on public.tournaments for select to authenticated
  using (matchmaking_private.can_read_tournament(id));
create policy membership_read on public.tournament_members for select to authenticated
  using (matchmaking_private.can_read_tournament(tournament_id));
create policy participant_read on public.participants for select to authenticated
  using (matchmaking_private.can_read_tournament(tournament_id));
create policy round_read on public.rounds for select to authenticated
  using (matchmaking_private.can_read_tournament(tournament_id));
create policy match_read on public.matches for select to authenticated
  using (matchmaking_private.can_read_tournament(tournament_id));

-- The command service performs resource authorization after locking the row.
-- This role cannot provision members, change ownership or construct a bracket.
grant usage on schema public to matchmaking_command;
grant select on public.tournaments, public.tournament_members, public.participants,
  public.rounds, public.matches to matchmaking_command;
grant update (status,revision,champion_id,completed_at,updated_at) on public.tournaments to matchmaking_command;
grant update (participant1_id,participant2_id,score1,score2,winner_id,status) on public.matches to matchmaking_command;
grant update (status) on public.rounds to matchmaking_command;
grant select,insert on matchmaking_private.tournament_events, matchmaking_private.command_receipts to matchmaking_command;
create policy command_tournament on public.tournaments to matchmaking_command using (true) with check (true);
create policy command_members on public.tournament_members for select to matchmaking_command using (true);
create policy command_participants on public.participants for select to matchmaking_command using (true);
create policy command_rounds on public.rounds to matchmaking_command using (true) with check (true);
create policy command_matches on public.matches to matchmaking_command using (true) with check (true);
create policy command_events on matchmaking_private.tournament_events to matchmaking_command using (true) with check (true);
create policy command_receipts on matchmaking_private.command_receipts to matchmaking_command using (true) with check (true);

-- No public RPC mutates a tournament. No PUBLIC execution on the only definer.
commit;
