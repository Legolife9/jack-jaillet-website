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
-- person_signature(token) and person_update(token, values) are security-definer functions callable
-- by anon; see the project's migrations for their bodies (same as in the Supabase dashboard).
