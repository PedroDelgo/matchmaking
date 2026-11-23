begin;
-- The migration operator needs SET ROLE for the local proof. Client roles never
-- receive this membership. A dedicated server login is provisioned separately.
do $$ begin
  execute format('grant matchmaking_command to %I', current_user);
end $$;
commit;
