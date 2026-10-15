-- Signature Studio accounts schema (Supabase / Postgres). Apply once to a new project.
create table public.signatures (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  name text not null default '' check (char_length(name) <= 300),
  company_id text not null default '' check (char_length(company_id) <= 64),
  state jsonb not null,
  updated_at bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint signature_size check (octet_length(state::text) <= 400000)
);
create table public.companies (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null check (char_length(id) between 1 and 64),
  data jsonb not null,
  updated_at bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, id),
  constraint company_size check (octet_length(data::text) <= 50000)
);
alter table public.signatures enable row level security;
alter table public.companies enable row level security;
create policy "own signatures: read" on public.signatures for select to authenticated using ((select auth.uid()) = user_id);
create policy "own signatures: add" on public.signatures for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own signatures: change" on public.signatures for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own signatures: delete" on public.signatures for delete to authenticated using ((select auth.uid()) = user_id);
create policy "own companies: read" on public.companies for select to authenticated using ((select auth.uid()) = user_id);
create policy "own companies: add" on public.companies for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own companies: change" on public.companies for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own companies: delete" on public.companies for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.signatures, public.companies from anon;
-- lets a signed-in person delete their own account (and, by cascade, their rows)
create or replace function public.delete_my_account() returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = auth.uid();
end; $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
