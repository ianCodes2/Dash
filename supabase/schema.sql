-- Northstar / MyDashboard
-- Supabase setup for a private, PIN-protected shared workspace.
--
-- Run this once in the Supabase SQL editor:
-- https://supabase.com/dashboard/project/zgcemyiufqprjawsijsb/sql/new
--
-- The browser never gets direct table access. It can only call the
-- functions below. The PIN is checked inside Postgres with bcrypt.
--
-- Forgot the PIN? Run this in the SQL editor, then open the app:
--   update public.northstar_workspace
--      set pin_hash = crypt('new-pin-here', gen_salt('bf', 11)),
--          failed_attempts = 0,
--          locked_until = null
--    where id = 1;
--   delete from public.northstar_sessions;

begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.northstar_workspace (
  id smallint primary key default 1 check (id = 1),
  pin_hash text not null,
  data jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.northstar_sessions (
  token_hash text primary key,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists northstar_sessions_expires_idx
  on public.northstar_sessions (expires_at);

alter table public.northstar_workspace enable row level security;
alter table public.northstar_sessions enable row level security;

revoke all on table public.northstar_workspace from anon, authenticated;
revoke all on table public.northstar_sessions from anon, authenticated;

-- Is this workspace configured yet?
create or replace function public.northstar_status()
returns jsonb
language sql
security definer
set search_path = public, extensions
as $$
  select jsonb_build_object(
    'configured', exists (select 1 from public.northstar_workspace where id = 1)
  );
$$;

-- First-run setup. Only works while the workspace table is empty.
create or replace function public.northstar_setup_workspace(p_pin text, p_data jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token text;
  v_expires timestamptz := now() + interval '12 hours';
  v_revision integer;
begin
  if p_pin is null or p_pin !~ '^[0-9]{6,12}$' then
    return jsonb_build_object('error', 'invalid_pin_format');
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return jsonb_build_object('error', 'invalid_data');
  end if;

  if octet_length(p_data::text) > 5 * 1024 * 1024 then
    return jsonb_build_object('error', 'invalid_data');
  end if;

  if exists (select 1 from public.northstar_workspace where id = 1) then
    return jsonb_build_object('error', 'already_configured');
  end if;

  insert into public.northstar_workspace (id, pin_hash, data, revision)
  values (1, crypt(p_pin, gen_salt('bf', 11)), p_data, 1)
  on conflict (id) do nothing
  returning revision into v_revision;

  if v_revision is null then
    return jsonb_build_object('error', 'already_configured');
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.northstar_sessions (token_hash, expires_at)
  values (md5(v_token), v_expires);

  return jsonb_build_object(
    'token', v_token,
    'expires_at', v_expires,
    'data', p_data,
    'revision', v_revision,
    'updated_at', now()
  );
end;
$$;

-- Check a PIN and start a session.
create or replace function public.northstar_unlock(p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ws public.northstar_workspace%rowtype;
  v_token text;
  v_expires timestamptz := now() + interval '12 hours';
  v_failed integer;
begin
  select * into v_ws
  from public.northstar_workspace
  where id = 1
  for update;

  if not found then
    return jsonb_build_object('error', 'not_configured');
  end if;

  if v_ws.locked_until is not null and v_ws.locked_until > now() then
    return jsonb_build_object('error', 'locked', 'locked_until', v_ws.locked_until);
  end if;

  if p_pin is not null and crypt(p_pin, v_ws.pin_hash) = v_ws.pin_hash then
    update public.northstar_workspace
       set failed_attempts = 0,
           locked_until = null
     where id = 1;

    delete from public.northstar_sessions where expires_at < now();

    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

    insert into public.northstar_sessions (token_hash, expires_at)
    values (md5(v_token), v_expires);

    return jsonb_build_object(
      'token', v_token,
      'expires_at', v_expires,
      'data', v_ws.data,
      'revision', v_ws.revision,
      'updated_at', v_ws.updated_at
    );
  end if;

  v_failed := v_ws.failed_attempts + 1;

  if v_failed >= 8 then
    update public.northstar_workspace
       set failed_attempts = 0,
           locked_until = now() + interval '10 minutes'
     where id = 1;

    perform pg_sleep(0.2);
    return jsonb_build_object('error', 'locked', 'locked_until', now() + interval '10 minutes');
  end if;

  update public.northstar_workspace
     set failed_attempts = v_failed,
         locked_until = null
   where id = 1;

  perform pg_sleep(0.2);
  return jsonb_build_object('error', 'invalid_pin', 'attempts_remaining', 8 - v_failed);
end;
$$;

-- Fetch the workspace with a valid session token.
create or replace function public.northstar_load(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_session public.northstar_sessions%rowtype;
  v_ws public.northstar_workspace%rowtype;
  v_expires timestamptz;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('error', 'session_expired');
  end if;

  select * into v_session
  from public.northstar_sessions
  where token_hash = md5(p_token)
    and expires_at > now();

  if not found then
    return jsonb_build_object('error', 'session_expired');
  end if;

  -- Sliding window: every successful read keeps the device signed in
  -- for another 12 hours.
  update public.northstar_sessions
     set last_seen_at = now(),
         expires_at = now() + interval '12 hours'
   where token_hash = md5(p_token)
   returning expires_at into v_expires;

  select * into v_ws
  from public.northstar_workspace
  where id = 1;

  if not found then
    return jsonb_build_object('error', 'not_configured');
  end if;

  return jsonb_build_object(
    'data', v_ws.data,
    'revision', v_ws.revision,
    'updated_at', v_ws.updated_at,
    'expires_at', v_expires
  );
end;
$$;

-- Save with optimistic concurrency. A stale revision is rejected.
create or replace function public.northstar_save(
  p_token text,
  p_data jsonb,
  p_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ws public.northstar_workspace%rowtype;
  v_new_revision integer;
  v_updated_at timestamptz;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('error', 'session_expired');
  end if;

  if not exists (
    select 1
    from public.northstar_sessions
    where token_hash = md5(p_token)
      and expires_at > now()
  ) then
    return jsonb_build_object('error', 'session_expired');
  end if;

  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    return jsonb_build_object('error', 'invalid_data');
  end if;

  if octet_length(p_data::text) > 5 * 1024 * 1024 then
    return jsonb_build_object('error', 'invalid_data');
  end if;

  if p_revision is null or p_revision < 1 then
    return jsonb_build_object('error', 'invalid_revision');
  end if;

  update public.northstar_workspace
     set data = p_data,
         revision = revision + 1,
         updated_at = now()
   where id = 1
     and revision = p_revision
  returning revision, updated_at into v_new_revision, v_updated_at;

  if v_new_revision is null then
    select * into v_ws
    from public.northstar_workspace
    where id = 1;

    if not found then
      return jsonb_build_object('error', 'not_configured');
    end if;

    return jsonb_build_object(
      'error', 'conflict',
      'revision', v_ws.revision,
      'updated_at', v_ws.updated_at
    );
  end if;

  update public.northstar_sessions
     set last_seen_at = now(),
         expires_at = now() + interval '12 hours'
   where token_hash = md5(p_token);

  return jsonb_build_object(
    'ok', true,
    'revision', v_new_revision,
    'updated_at', v_updated_at
  );
end;
$$;

-- Change the PIN. Signs out other devices.
create or replace function public.northstar_change_pin(
  p_token text,
  p_current_pin text,
  p_new_pin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_ws public.northstar_workspace%rowtype;
  v_failed integer;
begin
  if p_token is null or length(p_token) < 32 then
    return jsonb_build_object('error', 'session_expired');
  end if;

  if not exists (
    select 1
    from public.northstar_sessions
    where token_hash = md5(p_token)
      and expires_at > now()
  ) then
    return jsonb_build_object('error', 'session_expired');
  end if;

  if p_new_pin is null or p_new_pin !~ '^[0-9]{6,12}$' then
    return jsonb_build_object('error', 'invalid_pin_format');
  end if;

  select * into v_ws
  from public.northstar_workspace
  where id = 1
  for update;

  if not found then
    return jsonb_build_object('error', 'not_configured');
  end if;

  if v_ws.locked_until is not null and v_ws.locked_until > now() then
    return jsonb_build_object('error', 'locked', 'locked_until', v_ws.locked_until);
  end if;

  if p_current_pin is null or crypt(p_current_pin, v_ws.pin_hash) <> v_ws.pin_hash then
    v_failed := v_ws.failed_attempts + 1;

    if v_failed >= 8 then
      update public.northstar_workspace
         set failed_attempts = 0,
             locked_until = now() + interval '10 minutes'
       where id = 1;

      perform pg_sleep(0.2);
      return jsonb_build_object('error', 'locked', 'locked_until', now() + interval '10 minutes');
    end if;

    update public.northstar_workspace
       set failed_attempts = v_failed
     where id = 1;

    perform pg_sleep(0.2);
    return jsonb_build_object('error', 'invalid_pin', 'attempts_remaining', 8 - v_failed);
  end if;

  update public.northstar_workspace
     set pin_hash = crypt(p_new_pin, gen_salt('bf', 11)),
         failed_attempts = 0,
         locked_until = null
   where id = 1;

  delete from public.northstar_sessions
  where token_hash <> md5(p_token);

  update public.northstar_sessions
     set last_seen_at = now(),
         expires_at = now() + interval '12 hours'
   where token_hash = md5(p_token);

  return jsonb_build_object('ok', true);
end;
$$;

-- End this session.
create or replace function public.northstar_sign_out(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if p_token is not null and length(p_token) >= 32 then
    delete from public.northstar_sessions where token_hash = md5(p_token);
  end if;

  return jsonb_build_object('ok', true);
end;
$$;

-- Only the RPCs are callable by the public browser key.
revoke all on function public.northstar_status() from public;
revoke all on function public.northstar_setup_workspace(text, jsonb) from public;
revoke all on function public.northstar_unlock(text) from public;
revoke all on function public.northstar_load(text) from public;
revoke all on function public.northstar_save(text, jsonb, integer) from public;
revoke all on function public.northstar_change_pin(text, text, text) from public;
revoke all on function public.northstar_sign_out(text) from public;

grant execute on function public.northstar_status() to anon;
grant execute on function public.northstar_setup_workspace(text, jsonb) to anon;
grant execute on function public.northstar_unlock(text) to anon;
grant execute on function public.northstar_load(text) to anon;
grant execute on function public.northstar_save(text, jsonb, integer) to anon;
grant execute on function public.northstar_change_pin(text, text, text) to anon;
grant execute on function public.northstar_sign_out(text) to anon;

-- Ask PostgREST to pick up the new functions immediately.
notify pgrst, 'reload schema';

commit;
