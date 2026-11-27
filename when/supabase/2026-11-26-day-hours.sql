-- WhenUFree: days with their own times (2026-11-26).
-- Run once in the Supabase SQL editor (or as a migration) on the project that already has schema.sql.
-- Safe to run on live data: it adds one column with a default and replaces four functions.
-- wyf__settings gets a new output column, so it's dropped and made again.

alter table public.wyf_events add column if not exists day_hours jsonb not null default '{}'::jsonb;

drop function if exists public.wyf__settings(jsonb);

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
  total := cardinality(days) * ((end_min - start_min) / step);
  if p ? 'hours' and jsonb_typeof(p -> 'hours') = 'object' then
    for hk, hv in select * from jsonb_each(p -> 'hours') loop
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
      total := total + (he - hs) / step - (end_min - start_min) / step;
    end loop;
  end if;
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

revoke all on function public.wyf__settings(jsonb), public.wyf__view(public.wyf_events, boolean) from public, anon, authenticated;
