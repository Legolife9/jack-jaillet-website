-- Signature Studio company sharing (apply after schema.sql).
-- Owners share a company with people by email. Each person gets their own permissions,
-- and every permission is checked here on the server, not only in the page.
-- Nothing is shared until the invited person accepts, so nobody can push a company into a stranger's library.
create table public.company_members (
  company_owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company_id text not null,
  email text not null check (email = lower(email) and position('@' in email) > 1 and char_length(email) <= 320),
  can_view_people boolean not null default true,
  can_edit_people boolean not null default false,
  can_edit_design boolean not null default false,
  can_edit_brand boolean not null default false,
  accepted boolean not null default false, -- set only by the invited person, through accept_shared_company
  created_at timestamptz not null default now(),
  primary key (company_owner, company_id, email),
  foreign key (company_owner, company_id) references public.companies (user_id, id) on delete cascade,
  constraint edit_people_needs_view check (not can_edit_people or can_view_people)
);
alter table public.company_members enable row level security;
revoke all on public.company_members from anon;

create or replace function public.my_email() returns text language sql stable set search_path = '' as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create policy "owner manages members" on public.company_members for all to authenticated
  using ((select auth.uid()) = company_owner) with check ((select auth.uid()) = company_owner);
create policy "people see their own invites" on public.company_members for select to authenticated
  using (email = (select public.my_email()));

-- an owner can't mark an invite accepted (or move an accepted one to another email); only the invited person can accept
create or replace function public.company_members_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.accepted and new.email is distinct from public.my_email() then new.accepted := false; end if;
  elsif (new.company_owner, new.company_id, new.email) is distinct from (old.company_owner, old.company_id, old.email) then
    new.accepted := false;
  elsif new.accepted and not old.accepted and new.email is distinct from public.my_email() then
    new.accepted := false;
  end if;
  return new;
end; $$;
create trigger company_members_guard before insert or update on public.company_members
  for each row execute function public.company_members_guard();

-- invites waiting for me: which company, and who sent it
create or replace function public.pending_shares()
returns table (owner uuid, owner_email text, id text, name text)
language sql stable security definer set search_path = '' as $$
  select c.user_id, u.email::text, c.id, coalesce(c.data ->> 'name', '')
  from public.company_members m
  join public.companies c on c.user_id = m.company_owner and c.id = m.company_id
  join auth.users u on u.id = c.user_id
  where m.email = public.my_email() and not m.accepted and m.company_owner <> auth.uid();
$$;

create or replace function public.accept_shared_company(p_owner uuid, p_id text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.company_members set accepted = true where company_owner = p_owner and company_id = p_id and email = public.my_email();
  if not found then raise exception 'This invite is no longer there.'; end if;
end; $$;

create or replace function public.shared_companies()
returns table (owner uuid, owner_email text, id text, data jsonb, updated_at bigint,
               can_view_people boolean, can_edit_people boolean, can_edit_design boolean, can_edit_brand boolean)
language sql stable security definer set search_path = '' as $$
  select c.user_id, u.email::text, c.id, c.data, c.updated_at,
         m.can_view_people, m.can_edit_people, m.can_edit_design, m.can_edit_brand
  from public.company_members m
  join public.companies c on c.user_id = m.company_owner and c.id = m.company_id
  join auth.users u on u.id = c.user_id
  where m.email = public.my_email() and m.accepted and m.company_owner <> auth.uid();
$$;

-- without "see employees" the people list is removed here, so it never reaches the browser
create or replace function public.shared_signatures()
returns table (owner uuid, id text, name text, company_id text, state jsonb, updated_at bigint)
language sql stable security definer set search_path = '' as $$
  select s.user_id, s.id, s.name, s.company_id,
         case when m.can_view_people then s.state
              else jsonb_set(s.state, '{team}', jsonb_build_object('fields', coalesce(s.state #> '{team,fields}', '[]'::jsonb), 'people', '[]'::jsonb, 'active', null)) end,
         s.updated_at
  from public.company_members m
  join public.signatures s on s.user_id = m.company_owner and s.company_id = m.company_id
  where m.email = public.my_email() and m.accepted and m.company_owner <> auth.uid() and s.company_id <> '';
$$;

create or replace function public.member_perms(p_owner uuid, p_company text)
returns public.company_members language sql stable security definer set search_path = '' as $$
  select * from public.company_members
  where company_owner = p_owner and company_id = p_company and email = public.my_email() and accepted;
$$;

-- p_prev is the updated_at the editor loaded; if the row changed since, the save is refused instead of overwriting it
create or replace function public.save_shared_signature(p_owner uuid, p_id text, p_name text, p_state jsonb, p_prev bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare s public.signatures; m public.company_members; st jsonb; ts bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into s from public.signatures where user_id = p_owner and id = p_id for update;
  if s is null then raise exception 'not found'; end if;
  if p_prev is not null and s.updated_at <> p_prev then raise exception 'changed elsewhere'; end if;
  m := public.member_perms(p_owner, s.company_id);
  if m is null or not m.can_edit_design then raise exception 'You can view this signature but not change its design'; end if;
  st := jsonb_set(p_state, '{companyId}', to_jsonb(s.company_id));
  if not m.can_edit_people then st := jsonb_set(st, '{team}', coalesce(s.state -> 'team', '{}'::jsonb)); end if;
  update public.signatures set state = st, name = left(coalesce(p_name, s.name), 300), updated_at = ts where user_id = p_owner and id = p_id;
  return ts;
end; $$;

create or replace function public.save_shared_team(p_owner uuid, p_id text, p_team jsonb, p_prev bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare s public.signatures; m public.company_members; ts bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  select * into s from public.signatures where user_id = p_owner and id = p_id for update;
  if s is null then raise exception 'not found'; end if;
  if p_prev is not null and s.updated_at <> p_prev then raise exception 'changed elsewhere'; end if;
  m := public.member_perms(p_owner, s.company_id);
  if m is null or not m.can_edit_people then raise exception 'You can view this signature but not change its people'; end if;
  if jsonb_typeof(p_team) <> 'object' then raise exception 'bad people list'; end if;
  update public.signatures set state = jsonb_set(state, '{team}', p_team), updated_at = ts where user_id = p_owner and id = p_id;
  return ts;
end; $$;

create or replace function public.save_shared_company(p_owner uuid, p_id text, p_data jsonb, p_prev bigint default null)
returns bigint language plpgsql security definer set search_path = '' as $$
declare m public.company_members; cur bigint; ts bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  m := public.member_perms(p_owner, p_id);
  if m is null or not m.can_edit_brand then raise exception 'You can view this company but not change its brand kit'; end if;
  if jsonb_typeof(p_data) <> 'object' then raise exception 'bad company data'; end if;
  select updated_at into cur from public.companies where user_id = p_owner and id = p_id for update;
  if p_prev is not null and cur is distinct from p_prev then raise exception 'changed elsewhere'; end if;
  update public.companies set data = p_data, updated_at = ts where user_id = p_owner and id = p_id;
  return ts;
end; $$;

create or replace function public.leave_shared_company(p_owner uuid, p_id text)
returns void language sql security definer set search_path = '' as $$
  delete from public.company_members where company_owner = p_owner and company_id = p_id and email = public.my_email();
$$;

revoke all on function public.shared_companies(), public.shared_signatures(), public.member_perms(uuid, text),
  public.save_shared_signature(uuid, text, text, jsonb, bigint), public.save_shared_team(uuid, text, jsonb, bigint),
  public.save_shared_company(uuid, text, jsonb, bigint), public.leave_shared_company(uuid, text), public.my_email(),
  public.pending_shares(), public.accept_shared_company(uuid, text), public.company_members_guard() from public, anon;
revoke execute on function public.member_perms(uuid, text) from authenticated; -- helper for the save_* functions only
grant execute on function public.shared_companies(), public.shared_signatures(),
  public.save_shared_signature(uuid, text, text, jsonb, bigint), public.save_shared_team(uuid, text, jsonb, bigint),
  public.save_shared_company(uuid, text, jsonb, bigint), public.leave_shared_company(uuid, text), public.my_email(),
  public.pending_shares(), public.accept_shared_company(uuid, text) to authenticated;
