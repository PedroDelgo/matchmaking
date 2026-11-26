begin;

-- The durable watermark is independent of competitive revision and feed retention.
create table matchmaking_private.tournament_sync_heads (
  tournament_id uuid primary key references public.tournaments(id) on delete cascade,
  sequence bigint not null default 0 check(sequence between 0 and 9007199254740991)
);
insert into matchmaking_private.tournament_sync_heads(tournament_id)
  select id from public.tournaments;
alter table matchmaking_private.tournament_sync_heads enable row level security;
revoke all on matchmaking_private.tournament_sync_heads from public,anon,authenticated,service_role,matchmaking_command;
grant select on matchmaking_private.tournament_sync_heads to matchmaking_command;
create policy command_sync_head_read on matchmaking_private.tournament_sync_heads
  for select to matchmaking_command using(true);

-- Notifications contain no names, scores, command payloads or invitation secrets.
create table public.tournament_signals (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  sequence bigint not null check(sequence between 1 and 9007199254740991),
  signal_version smallint not null default 1 check(signal_version=1),
  category text not null check(category in ('competitive','access','access_revoked')),
  revision bigint check(revision between 1 and 9007199254740991),
  recipient_user_id uuid references public.profiles(user_id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key(tournament_id,sequence),
  check((category='access_revoked')=(recipient_user_id is not null)),
  check((category='competitive')=(revision is not null))
);
create index tournament_signal_recipient on public.tournament_signals(recipient_user_id,tournament_id)
  where recipient_user_id is not null;
alter table public.tournament_signals enable row level security;
revoke all on public.tournament_signals from public,anon,authenticated,service_role,matchmaking_command;
grant select on public.tournament_signals to authenticated;
create policy signal_authorized_read on public.tournament_signals
  for select to authenticated using(
    (recipient_user_id is null and matchmaking_private.can_read_tournament(tournament_id)) or
    (category='access_revoked' and recipient_user_id=(select auth.uid()))
  );

create function matchmaking_private.emit_tournament_signal(
  target uuid, kind text, competitive_revision bigint default null, recipient uuid default null
) returns void language plpgsql security definer set search_path='' as $$
declare next_sequence bigint;
begin
  -- Also serializes privileged administrative writes. Cascade deletion has no root.
  perform 1 from public.tournaments where id=target for update;
  if not found then return; end if;
  insert into matchmaking_private.tournament_sync_heads(tournament_id,sequence)
    values(target,1) on conflict(tournament_id) do update
      set sequence=tournament_sync_heads.sequence+1
    returning sequence into next_sequence;
  insert into public.tournament_signals(tournament_id,sequence,category,revision,recipient_user_id)
    values(target,next_sequence,kind,competitive_revision,recipient);
  -- At most 256 rows per tournament; the watermark survives pruning. This feed is
  -- not an event history. A reconnect always reconciles through the authorized API.
  delete from public.tournament_signals
    where tournament_id=target and sequence<=next_sequence-256;
end $$;
revoke all on function matchmaking_private.emit_tournament_signal(uuid,text,bigint,uuid)
  from public,anon,authenticated,service_role,matchmaking_command;

create function matchmaking_private.signal_competitive_commit()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  perform matchmaking_private.emit_tournament_signal(new.tournament_id,'competitive',new.revision);
  return new;
end $$;
revoke all on function matchmaking_private.signal_competitive_commit()
  from public,anon,authenticated,service_role,matchmaking_command;
create trigger signal_competitive_commit after insert on matchmaking_private.tournament_events
  for each row execute function matchmaking_private.signal_competitive_commit();

create function matchmaking_private.signal_membership_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
  if tg_op='UPDATE' and new.role is not distinct from old.role and
    new.participant_id is not distinct from old.participant_id then return new; end if;
  if tg_op='DELETE' then target:=old.tournament_id; else target:=new.tournament_id; end if;
  perform 1 from public.tournaments where id=target for update;
  if not found then
    if tg_op='DELETE' then return old; else return new; end if;
  end if;
  if tg_op='DELETE' then
    -- Still readable by the removed person after common tournament RLS turns false.
    perform matchmaking_private.emit_tournament_signal(target,'access_revoked',null,old.user_id);
  end if;
  perform matchmaking_private.emit_tournament_signal(target,'access');
  if tg_op='DELETE' then return old; else return new; end if;
end $$;
revoke all on function matchmaking_private.signal_membership_change()
  from public,anon,authenticated,service_role,matchmaking_command;
create trigger signal_membership_change after insert or update or delete on public.tournament_members
  for each row execute function matchmaking_private.signal_membership_change();

create function matchmaking_private.signal_invitation_change()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and new.revoked_at is not distinct from old.revoked_at and
    new.use_count is not distinct from old.use_count and
    new.expires_at is not distinct from old.expires_at and
    new.max_uses is not distinct from old.max_uses and
    new.access_role is not distinct from old.access_role then return new; end if;
  perform 1 from public.tournaments where id=new.tournament_id for update;
  if found then
    perform matchmaking_private.emit_tournament_signal(new.tournament_id,'access');
  end if;
  return new;
end $$;
revoke all on function matchmaking_private.signal_invitation_change()
  from public,anon,authenticated,service_role,matchmaking_command;
create trigger signal_invitation_change after insert or update on matchmaking_private.tournament_invites
  for each row execute function matchmaking_private.signal_invitation_change();

-- DELETE events cannot be protected by Postgres Changes RLS. The publication is
-- therefore deliberately dedicated and INSERT-only, including for malicious
-- clients subscribing to '*'/DELETE. Refuse to change an unrelated publication.
do $$
begin
  if exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime' and puballtables) or
    exists(select 1 from pg_catalog.pg_publication_namespace pn join pg_catalog.pg_publication p on p.oid=pn.pnpubid
      where p.pubname='supabase_realtime') or
    exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and
      (schemaname<>'public' or tablename<>'tournament_signals')) then
    raise exception 'supabase_realtime must be dedicated to tournament_signals; unrelated publication preserved';
  end if;
  if not exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime with(publish='insert');
  else
    alter publication supabase_realtime set(publish='insert');
  end if;
  if not exists(select 1 from pg_catalog.pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='tournament_signals') then
    alter publication supabase_realtime add table public.tournament_signals;
  end if;
end $$;

-- The managed Realtime schema is absent in the disposable domain-test database.
-- Leave its ownership/RLS/grants intact; authorize only our private topic format.
do $$
begin
  if pg_catalog.to_regclass('realtime.messages') is not null then
    if pg_catalog.to_regprocedure('realtime.topic()') is null then
      raise exception 'Realtime topic authorization function unavailable';
    end if;
    create policy tournament_private_receive on realtime.messages for select to authenticated
      using(case when (select realtime.topic()) ~ '^tournament:[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$'
        then matchmaking_private.can_read_tournament(pg_catalog.substr((select realtime.topic()),12)::uuid)
        else false end);
  end if;
end $$;

commit;
