-- Signature Studio personal links (apply after schema.sql). One private link per person on a team
-- signature: the link shows only that person's signature (no account) and, if allowed, lets them
-- update their own details. Links are 64 random hex characters.
create table public.person_links (
  token text primary key default (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sig_id text not null,
  person_id text not null check (char_length(person_id) between 1 and 64),
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  unique (owner, sig_id, person_id),
  foreign key (owner, sig_id) references public.signatures (user_id, id) on delete cascade
);
alter table public.person_links enable row level security;
revoke all on public.person_links from anon;
create policy "owner manages person links" on public.person_links for all to authenticated
  using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);

-- what the link shows: the signature with only this person on its team (callable without an account)
create or replace function public.person_signature(p_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare l public.person_links; s public.signatures; person jsonb; st jsonb;
begin
  if p_token is null or char_length(p_token) <> 64 then raise exception 'This link is not valid.'; end if;
  select * into l from public.person_links where token = p_token;
  if l is null then raise exception 'This link is not valid any more. Ask whoever sent it for a new one.'; end if;
  select * into s from public.signatures where user_id = l.owner and id = l.sig_id;
  select p into person from jsonb_array_elements(coalesce(s.state #> '{team,people}', '[]'::jsonb)) p where p ->> 'id' = l.person_id;
  if person is null then raise exception 'This person is no longer on the signature. Ask whoever sent the link for a new one.'; end if;
  st := jsonb_set(s.state, '{team}', jsonb_build_object('fields', coalesce(s.state #> '{team,fields}', '[]'::jsonb), 'people', jsonb_build_array(person), 'active', l.person_id));
  return jsonb_build_object('name', s.name, 'state', st, 'can_edit', l.can_edit, 'updated_at', s.updated_at);
end; $$;

-- a person fixing their own details through the link: only fields the signature has, 500 characters each,
-- photo links must be https; bumps updated_at so an editor that is open elsewhere sees the change
create or replace function public.person_update(p_token text, p_values jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare l public.person_links; s public.signatures; fields jsonb; people jsonb; idx int; k text; v text; clean jsonb := '{}'::jsonb; ftype text;
begin
  select * into l from public.person_links where token = p_token;
  if l is null or char_length(coalesce(p_token, '')) <> 64 then raise exception 'This link is not valid.'; end if;
  if not l.can_edit then raise exception 'This link can only view the signature.'; end if;
  if jsonb_typeof(p_values) <> 'object' then raise exception 'bad details'; end if;
  select * into s from public.signatures where user_id = l.owner and id = l.sig_id for update;
  fields := coalesce(s.state #> '{team,fields}', '[]'::jsonb);
  people := coalesce(s.state #> '{team,people}', '[]'::jsonb);
  select i - 1 into idx from jsonb_array_elements(people) with ordinality as t(p, i) where p ->> 'id' = l.person_id;
  if idx is null then raise exception 'This person is no longer on the signature.'; end if;
  for k, v in select key, value from jsonb_each_text(p_values) loop
    select f ->> 'type' into ftype from jsonb_array_elements(fields) f where f ->> 'key' = k;
    if not found then continue; end if; -- only fields the signature actually has
    v := left(btrim(coalesce(v, '')), 500);
    if ftype = 'image' and v <> '' and v !~* '^https://' then raise exception 'Photo links must start with https://'; end if;
    clean := clean || jsonb_build_object(k, v);
  end loop;
  update public.signatures
     set state = jsonb_set(state, array['team', 'people', idx::text, 'values'], coalesce(state #> array['team', 'people', idx::text, 'values'], '{}'::jsonb) || clean),
         updated_at = (extract(epoch from now()) * 1000)::bigint
   where user_id = l.owner and id = l.sig_id;
end; $$;

revoke all on function public.person_signature(text), public.person_update(text, jsonb) from public;
grant execute on function public.person_signature(text), public.person_update(text, jsonb) to anon, authenticated;
