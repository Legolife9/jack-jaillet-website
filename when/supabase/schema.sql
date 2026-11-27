-- WhenUFree (jackjaillet.com/when/): group availability polls.
-- Lives in the same Supabase project as Signature Studio and shares its Google sign-in,
-- so one account (and Signature Studio's delete_my_account) covers both tools.
--
-- The two tables are closed to the API. Every read and write goes through the
-- security-definer functions below, which check one of:
--   * the poll's admin token (shown once to the organizer, stored here only as a SHA-256 hash)
--   * a response's edit token (kept in that person's browser, also stored as a hash)
--   * the signed-in account (auth.uid()) that owns the poll or the response
-- Passwords (an optional poll password, an optional per-person password) are bcrypt hashes.
-- Expected problems come back as {"error": "<code>"}; bad input raises an exception whose
-- message starts with "wyf: " and is safe to show.
--
-- Slots are stored as epoch minutes (minutes since 1970-01-01 UTC), so answers stay put when
-- the organizer edits the poll and every viewer can see the grid in their own time zone.
-- Polls are deleted 90 days after their last activity (and never before 30 days after their last date).

create table public.wyf_events (
  id text primary key check (id ~ '^[A-Za-z0-9]{10}$'),
  admin_hash text not null,
  owner uuid references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  details text not null default '' check (char_length(details) <= 1000),
  mode text not null check (mode in ('dates', 'week')),
  days date[] not null check (cardinality(days) between 1 and 62),
  start_min int not null check (start_min between 0 and 1425),
  end_min int not null check (end_min between 15 and 1440),
  step int not null check (step in (15, 30, 60)),
  tz text not null check (char_length(tz) between 1 and 64),
  day_hours jsonb not null default '{}'::jsonb, -- days with their own window: {"YYYY-MM-DD": [start_min, end_min]}
  pass_hash text,
  required uuid[] not null default '{}',
  final_start int,
  final_end int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint wyf_window check (end_min > start_min),
  constraint wyf_final check ((final_start is null) = (final_end is null) and (final_end is null or final_end > final_start))
);
create index wyf_events_owner on public.wyf_events (owner) where owner is not null;
create index wyf_events_expires on public.wyf_events (expires_at);

create table public.wyf_responses (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.wyf_events (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  note text not null default '' check (char_length(note) <= 200),
  pass_hash text,
  token_hashes text[] not null default '{}',
  avail int[] not null default '{}',
  maybe int[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wyf_slots_size check (cardinality(avail) <= 3000 and cardinality(maybe) <= 3000 and cardinality(token_hashes) <= 10)
);
create unique index wyf_responses_name on public.wyf_responses (event_id, lower(name));
create unique index wyf_responses_account on public.wyf_responses (event_id, user_id) where user_id is not null;
create index wyf_responses_user on public.wyf_responses (user_id) where user_id is not null;

alter table public.wyf_events enable row level security;
alter table public.wyf_responses enable row level security;
revoke all on public.wyf_events, public.wyf_responses from anon, authenticated;

-- ---------- private helpers (not callable from the API) ----------

create or replace function public.wyf__rand(n int) returns text language sql volatile set search_path = '' as $$
  -- letters and digits without the easily confused ones (0 O 1 l I)
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789', (get_byte(b, i) % 57) + 1, 1), '' order by i)
  from (select extensions.gen_random_bytes(n) as b) r, generate_series(0, n - 1) as i;
$$;

create or replace function public.wyf__hash(t text) returns text language sql immutable set search_path = '' as $$
  select encode(extensions.digest(t, 'sha256'), 'hex');
$$;

create or replace function public.wyf__pw_ok(pw text, h text) returns boolean language sql stable set search_path = '' as $$
  select h is not null and coalesce(pw, '') <> '' and extensions.crypt(pw, h) = h;
$$;

create or replace function public.wyf__pw(pw text) returns text language plpgsql volatile set search_path = '' as $$
begin
  if coalesce(pw, '') = '' then return null; end if;
  if char_length(pw) > 72 then raise exception 'wyf: Passwords can be up to 72 characters.'; end if;
  return extensions.crypt(pw, extensions.gen_salt('bf', 8));
end; $$;

create or replace function public.wyf__expiry(d date[]) returns timestamptz language sql stable set search_path = '' as $$
  select greatest(now() + interval '90 days', ((select max(x) from unnest(d) x) + 30)::timestamptz);
$$;

create or replace function public.wyf__is_admin(e public.wyf_events, tok text) returns boolean language sql stable set search_path = '' as $$
  select (e.owner is not null and e.owner = auth.uid())
      or (coalesce(tok, '') <> '' and e.admin_hash = public.wyf__hash(tok));
$$;

-- checks a poll's settings and returns them cleaned up; raises a readable error otherwise
create or replace function public.wyf__settings(p jsonb,
  out title text, out details text, out mode text, out days date[],
  out start_min int, out end_min int, out step int, out tz text, out hours jsonb)
language plpgsql stable set search_path = '' as $$
declare hk text; hv jsonb; hd date; hs int; he int; total int;
begin
  title := btrim(regexp_replace(coalesce(p ->> 'title', ''), '\s+', ' ', 'g'));
  details := btrim(coalesce(p ->> 'details', ''));
  mode := coalesce(p ->> 'mode', 'dates');
  tz := coalesce(nullif(p ->> 'tz', ''), 'UTC');
  begin
    select array_agg(distinct x::date order by x::date) into days
    from jsonb_array_elements_text(coalesce(p -> 'days', '[]'::jsonb)) x;
    start_min := (p ->> 'start')::int;
    end_min := (p ->> 'end')::int;
    step := coalesce((p ->> 'step')::int, 30);
  exception when others then
    raise exception 'wyf: Some of the poll settings are not valid.';
  end;
  if title = '' then raise exception 'wyf: Give the poll a name.'; end if;
  if char_length(title) > 120 then raise exception 'wyf: Keep the name under 120 characters.'; end if;
  if char_length(details) > 1000 then raise exception 'wyf: Keep the description under 1,000 characters.'; end if;
  if mode not in ('dates', 'week') then raise exception 'wyf: Some of the poll settings are not valid.'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = tz) then raise exception 'wyf: That time zone is not recognised.'; end if;
  if days is null or cardinality(days) = 0 then raise exception 'wyf: Pick at least one day.'; end if;
  if cardinality(days) > 62 then raise exception 'wyf: Pick up to 62 days.'; end if;
  if mode = 'week' and cardinality(days) > 7 then raise exception 'wyf: Some of the poll settings are not valid.'; end if;
  if step not in (15, 30, 60) then raise exception 'wyf: Some of the poll settings are not valid.'; end if;
  if start_min is null or end_min is null or start_min < 0 or end_min > 1440 or end_min <= start_min
     or start_min % step <> 0 or end_min % step <> 0 then
    raise exception 'wyf: The end time has to be after the start time.';
  end if;
  -- days with their own times; entries for days not in the poll, or the same as the general window, are dropped
  hours := '{}'::jsonb;
  if p ? 'hours' and jsonb_typeof(p -> 'hours') = 'object' then
    for hk, hv in select * from jsonb_each(p -> 'hours') loop
      -- only exact YYYY-MM-DD keys, so one day can't be listed twice under different spellings
      if hk !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'wyf: Some of the poll settings are not valid.'; end if;
      begin
        hd := hk::date;
        hs := (hv ->> 0)::int;
        he := (hv ->> 1)::int;
      exception when others then
        raise exception 'wyf: Some of the poll settings are not valid.';
      end;
      continue when not (hd = any(days));
      if jsonb_typeof(hv) <> 'array' then raise exception 'wyf: Some of the poll settings are not valid.'; end if;
      if jsonb_array_length(hv) <> 2 or hs is null or he is null
         or hs < 0 or he > 1440 or he <= hs or hs % step <> 0 or he % step <> 0 then
        raise exception 'wyf: Each day''s end time has to be after its start time.';
      end if;
      continue when hs = start_min and he = end_min;
      hours := hours || jsonb_build_object(to_char(hd, 'YYYY-MM-DD'), jsonb_build_array(hs, he));
    end loop;
  end if;
  -- count the slots from what will actually be stored
  select coalesce(sum(case when hours ? to_char(d, 'YYYY-MM-DD')
                           then ((hours -> to_char(d, 'YYYY-MM-DD') ->> 1)::int - (hours -> to_char(d, 'YYYY-MM-DD') ->> 0)::int) / step
                           else (end_min - start_min) / step end), 0)
    into total from unnest(days) d;
  if total > 2000 then
    raise exception 'wyf: That is too many time slots. Pick fewer days, a shorter window, or longer slots.';
  end if;
end; $$;

-- everything a viewer gets: the poll plus every response (never any hashes)
create or replace function public.wyf__view(e public.wyf_events, admin boolean) returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', e.id, 'title', e.title, 'details', e.details, 'mode', e.mode, 'days', to_jsonb(e.days),
    'start', e.start_min, 'end', e.end_min, 'step', e.step, 'tz', e.tz, 'hours', e.day_hours,
    'locked', e.pass_hash is not null, 'required', to_jsonb(e.required),
    'final', case when e.final_start is null then null else jsonb_build_array(e.final_start, e.final_end) end,
    'created', e.created_at, 'updated', e.updated_at, 'expires', e.expires_at,
    'admin', admin, 'owned', e.owner is not null and e.owner = auth.uid(), 'has_owner', e.owner is not null,
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'name', r.name, 'note', r.note, 'avail', to_jsonb(r.avail), 'maybe', to_jsonb(r.maybe),
        'protected', r.pass_hash is not null, 'account', r.user_id is not null,
        'mine', r.user_id is not null and r.user_id = auth.uid(),
        'created', r.created_at, 'updated', r.updated_at) order by r.created_at)
      from public.wyf_responses r where r.event_id = e.id), '[]'::jsonb));
$$;

revoke all on function public.wyf__rand(int), public.wyf__hash(text), public.wyf__pw_ok(text, text), public.wyf__pw(text),
  public.wyf__expiry(date[]), public.wyf__is_admin(public.wyf_events, text), public.wyf__settings(jsonb),
  public.wyf__view(public.wyf_events, boolean) from public, anon, authenticated;

-- ---------- the API ----------

-- make a poll; the admin token comes back once and is never stored in plain text
create or replace function public.wyf_create_event(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare s record; new_id text; tok text := public.wyf__rand(24);
begin
  delete from public.wyf_events where expires_at < now(); -- housekeeping: expired polls go
  select * into s from public.wyf__settings(p);
  loop
    new_id := public.wyf__rand(10);
    exit when not exists (select 1 from public.wyf_events where id = new_id);
  end loop;
  insert into public.wyf_events (id, admin_hash, owner, title, details, mode, days, start_min, end_min, step, tz, day_hours, pass_hash, expires_at)
  values (new_id, public.wyf__hash(tok), auth.uid(), s.title, s.details, s.mode, s.days, s.start_min, s.end_min, s.step, s.tz, s.hours,
          public.wyf__pw(p ->> 'password'), public.wyf__expiry(s.days));
  return jsonb_build_object('id', new_id, 'admin', tok);
end; $$;

-- open a poll; an invite-only poll needs its password unless you organize it or already answered with your account
create or replace function public.wyf_get_event(p_id text, p_admin text default null, p_password text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.wyf_events; adm boolean;
begin
  select * into e from public.wyf_events where id = p_id;
  if not found or e.expires_at < now() then return jsonb_build_object('error', 'not_found'); end if;
  adm := public.wyf__is_admin(e, p_admin);
  if e.pass_hash is not null and not adm
     and not exists (select 1 from public.wyf_responses r where r.event_id = e.id and r.user_id = auth.uid())
     and not public.wyf__pw_ok(p_password, e.pass_hash) then
    return jsonb_build_object('error', 'password', 'id', e.id, 'tried', coalesce(p_password, '') <> '');
  end if;
  return public.wyf__view(e, adm);
end; $$;

-- add yourself to a poll (or come back to your own row) and get an edit token for this browser
create or replace function public.wyf_join(p_id text, p_name text, p_password text default null, p_event_password text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  e public.wyf_events; r public.wyf_responses; uid uuid := auth.uid();
  nm text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  tok text := public.wyf__rand(24); h text;
begin
  h := public.wyf__hash(tok);
  select * into e from public.wyf_events where id = p_id;
  if not found or e.expires_at < now() then return jsonb_build_object('error', 'not_found'); end if;
  if e.pass_hash is not null and not (uid is not null and e.owner = uid) and not public.wyf__pw_ok(p_event_password, e.pass_hash) then
    return jsonb_build_object('error', 'password');
  end if;
  -- signed in and already answered: that row is yours, whatever name you type
  if uid is not null then
    select * into r from public.wyf_responses where event_id = e.id and user_id = uid;
    if found then return jsonb_build_object('rid', r.id, 'name', r.name); end if;
  end if;
  if nm = '' or char_length(nm) > 60 then raise exception 'wyf: Type your name (up to 60 characters).'; end if;
  select * into r from public.wyf_responses where event_id = e.id and lower(name) = lower(nm) for update;
  if found then
    if r.pass_hash is not null then
      if not public.wyf__pw_ok(p_password, r.pass_hash) then
        return jsonb_build_object('error', case when coalesce(p_password, '') = '' then 'name_protected' else 'wrong_password' end);
      end if;
    elsif r.user_id is not null then
      return jsonb_build_object('error', 'name_account');
    else
      return jsonb_build_object('error', 'name_taken');
    end if;
    -- right password: this browser gets its own token too (the newest ten are kept)
    update public.wyf_responses set token_hashes = (array_append(token_hashes, h))[greatest(1, cardinality(token_hashes) - 8):]
    where id = r.id;
  else
    if e.final_start is not null then return jsonb_build_object('error', 'closed'); end if;
    if (select count(*) from public.wyf_responses where event_id = e.id) >= 300 then return jsonb_build_object('error', 'full'); end if;
    insert into public.wyf_responses (event_id, user_id, name, pass_hash, token_hashes)
    values (e.id, uid, nm, public.wyf__pw(p_password), array[h]) returning * into r;
  end if;
  update public.wyf_events set expires_at = greatest(expires_at, public.wyf__expiry(days)) where id = e.id;
  return jsonb_build_object('rid', r.id, 'token', tok, 'name', r.name);
end; $$;

-- save your availability and note
create or replace function public.wyf_save(p_id text, p_rid uuid, p_token text, p_avail int[], p_maybe int[], p_note text default '') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.wyf_responses; e public.wyf_events; uid uuid := auth.uid(); a int[]; m int[]; n text := btrim(coalesce(p_note, ''));
begin
  select * into r from public.wyf_responses where id = p_rid and event_id = p_id for update;
  if not found then return jsonb_build_object('error', 'gone'); end if;
  if not ((uid is not null and r.user_id = uid) or (coalesce(p_token, '') <> '' and public.wyf__hash(p_token) = any (r.token_hashes))) then
    return jsonb_build_object('error', 'denied');
  end if;
  select * into e from public.wyf_events where id = p_id;
  if e.final_start is not null then return jsonb_build_object('error', 'closed'); end if;
  if cardinality(coalesce(p_avail, '{}')) > 3000 or cardinality(coalesce(p_maybe, '{}')) > 3000 then
    raise exception 'wyf: Too many time slots in one answer.';
  end if;
  if char_length(n) > 200 then raise exception 'wyf: Keep your note under 200 characters.'; end if;
  a := array(select distinct x from unnest(coalesce(p_avail, '{}')) x where x is not null order by x);
  m := array(select distinct x from unnest(coalesce(p_maybe, '{}')) x where x is not null and not x = any (a) order by x);
  update public.wyf_responses set avail = a, maybe = m, note = n, updated_at = now() where id = r.id;
  update public.wyf_events set expires_at = greatest(expires_at, public.wyf__expiry(days)) where id = e.id;
  return jsonb_build_object('ok', true, 'updated', now());
end; $$;

-- organizer changes: settings, poll password, required people, final time
create or replace function public.wyf_update_event(p_id text, p_admin text, p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.wyf_events; s record; cur jsonb; f jsonb;
begin
  select * into e from public.wyf_events where id = p_id for update;
  if not found then return jsonb_build_object('error', 'not_found'); end if;
  if not public.wyf__is_admin(e, p_admin) then return jsonb_build_object('error', 'denied'); end if;
  if p ?| array['title', 'details', 'mode', 'days', 'start', 'end', 'step', 'tz', 'hours'] then
    cur := jsonb_build_object('title', e.title, 'details', e.details, 'mode', e.mode, 'days', to_jsonb(e.days),
                              'start', e.start_min, 'end', e.end_min, 'step', e.step, 'tz', e.tz, 'hours', e.day_hours);
    select * into s from public.wyf__settings(cur || (p - 'password' - 'required' - 'final'));
    update public.wyf_events set title = s.title, details = s.details, mode = s.mode, days = s.days, start_min = s.start_min,
      end_min = s.end_min, step = s.step, tz = s.tz, day_hours = s.hours, updated_at = now(), expires_at = greatest(expires_at, public.wyf__expiry(s.days))
    where id = e.id;
  end if;
  if p ? 'password' then
    update public.wyf_events set pass_hash = public.wyf__pw(p ->> 'password'), updated_at = now() where id = e.id;
  end if;
  if p ? 'required' then
    update public.wyf_events set required = array(
      select r.id from public.wyf_responses r
      where r.event_id = e.id and r.id::text in (select jsonb_array_elements_text(coalesce(p -> 'required', '[]'::jsonb))))
    where id = e.id;
  end if;
  if p ? 'final' then
    f := p -> 'final';
    if f is null or jsonb_typeof(f) = 'null' then
      update public.wyf_events set final_start = null, final_end = null, updated_at = now() where id = e.id;
    else
      begin
        if jsonb_typeof(f) <> 'array' or (f ->> 1)::int <= (f ->> 0)::int or (f ->> 1)::int - (f ->> 0)::int > 1440 then
          raise exception 'bad';
        end if;
        update public.wyf_events set final_start = (f ->> 0)::int, final_end = (f ->> 1)::int, updated_at = now() where id = e.id;
      exception when others then
        raise exception 'wyf: Pick an end time after the start time, within one day.';
      end;
    end if;
  end if;
  select * into e from public.wyf_events where id = p_id;
  return public.wyf__view(e, true);
end; $$;

-- take a response off a poll: the organizer can remove anyone, people can remove themselves
create or replace function public.wyf_remove_response(p_id text, p_rid uuid, p_admin text default null, p_token text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.wyf_events; r public.wyf_responses; uid uuid := auth.uid();
begin
  select * into e from public.wyf_events where id = p_id;
  select * into r from public.wyf_responses where id = p_rid and event_id = p_id;
  if e.id is null or r.id is null then return jsonb_build_object('error', 'gone'); end if;
  if not (public.wyf__is_admin(e, p_admin)
          or (uid is not null and r.user_id = uid)
          or (coalesce(p_token, '') <> '' and public.wyf__hash(p_token) = any (r.token_hashes))) then
    return jsonb_build_object('error', 'denied');
  end if;
  delete from public.wyf_responses where id = r.id;
  update public.wyf_events set required = array_remove(required, r.id) where id = e.id;
  return jsonb_build_object('ok', true);
end; $$;

create or replace function public.wyf_delete_event(p_id text, p_admin text default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare e public.wyf_events;
begin
  select * into e from public.wyf_events where id = p_id;
  if not found then return jsonb_build_object('ok', true); end if;
  if not public.wyf__is_admin(e, p_admin) then return jsonb_build_object('error', 'denied'); end if;
  delete from public.wyf_events where id = e.id;
  return jsonb_build_object('ok', true);
end; $$;

-- the signed-in person's polls: the ones they organize and the ones they answered
create or replace function public.wyf_my_polls() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(x order by x ->> 'activity' desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', e.id, 'title', e.title, 'mode', e.mode, 'days', to_jsonb(e.days), 'tz', e.tz,
      'organizer', coalesce(e.owner = auth.uid(), false),
      'rid', (select r.id from public.wyf_responses r where r.event_id = e.id and r.user_id = auth.uid()),
      'count', (select count(*) from public.wyf_responses r where r.event_id = e.id),
      'final', e.final_start is not null,
      'activity', greatest(e.updated_at, (select max(r.updated_at) from public.wyf_responses r where r.event_id = e.id))) as x
    from public.wyf_events e
    where auth.uid() is not null and e.expires_at >= now()
      and (e.owner = auth.uid() or exists (select 1 from public.wyf_responses r where r.event_id = e.id and r.user_id = auth.uid()))
  ) q;
$$;

-- response counts for polls this browser knows about (no titles: the browser keeps its own copy)
create or replace function public.wyf_poll_status(p_ids text[]) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id,
    'count', (select count(*) from public.wyf_responses r where r.event_id = e.id),
    'final', e.final_start is not null,
    'activity', greatest(e.updated_at, (select max(r.updated_at) from public.wyf_responses r where r.event_id = e.id)))), '[]'::jsonb)
  from public.wyf_events e
  where e.id = any (p_ids[1:50]) and e.expires_at >= now();
$$;

-- after signing in, move the polls this browser made or answered into the account
create or replace function public.wyf_claim(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); x jsonb; n int := 0; k int;
begin
  if uid is null then return jsonb_build_object('error', 'signed_out'); end if;
  for x in select * from jsonb_array_elements(coalesce(p -> 'admin', '[]'::jsonb)) limit 100 loop
    update public.wyf_events set owner = uid
    where id = x ->> 'id' and owner is null and admin_hash = public.wyf__hash(coalesce(x ->> 'token', ''));
    get diagnostics k = row_count; n := n + k;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p -> 'responses', '[]'::jsonb)) limit 100 loop
    begin
      update public.wyf_responses set user_id = uid
      where id = (x ->> 'rid')::uuid and event_id = x ->> 'id' and user_id is null
        and public.wyf__hash(coalesce(x ->> 'token', '')) = any (token_hashes)
        and not exists (select 1 from public.wyf_responses o where o.event_id = x ->> 'id' and o.user_id = uid);
      get diagnostics k = row_count; n := n + k;
    exception when others then null; -- a malformed entry is skipped, not fatal
    end;
  end loop;
  return jsonb_build_object('claimed', n);
end; $$;

revoke all on function public.wyf_create_event(jsonb), public.wyf_get_event(text, text, text),
  public.wyf_join(text, text, text, text), public.wyf_save(text, uuid, text, int[], int[], text),
  public.wyf_update_event(text, text, jsonb), public.wyf_remove_response(text, uuid, text, text),
  public.wyf_delete_event(text, text), public.wyf_my_polls(), public.wyf_poll_status(text[]), public.wyf_claim(jsonb)
  from public;
grant execute on function public.wyf_create_event(jsonb), public.wyf_get_event(text, text, text),
  public.wyf_join(text, text, text, text), public.wyf_save(text, uuid, text, int[], int[], text),
  public.wyf_update_event(text, text, jsonb), public.wyf_remove_response(text, uuid, text, text),
  public.wyf_delete_event(text, text), public.wyf_my_polls(), public.wyf_poll_status(text[]), public.wyf_claim(jsonb)
  to anon, authenticated;
-- these two only mean anything to a signed-in account
revoke execute on function public.wyf_my_polls(), public.wyf_claim(jsonb) from anon;
