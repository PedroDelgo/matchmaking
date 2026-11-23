-- Only for the fresh, disposable database created by backend/test/run-database.ts.
-- Auth catalog shim supplies auth.uid semantics; it does not simulate transactions.
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
