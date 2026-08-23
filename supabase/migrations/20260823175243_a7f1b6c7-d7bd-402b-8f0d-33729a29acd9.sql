-- =========================================================
-- Migration: CVR-blockliste, offentlig-kunde-klassifikator,
-- adressenormalisering, cvr_penheder-tabel + sync-kø
-- =========================================================

-- 1) Blokliste for egne CVR-numre
create table if not exists public.cvr_blocklist (
  cvr text primary key,
  reason text,
  created_at timestamptz not null default now()
);
grant select on public.cvr_blocklist to authenticated;
grant all on public.cvr_blocklist to service_role;
alter table public.cvr_blocklist enable row level security;
create policy "cvr_blocklist_read" on public.cvr_blocklist
  for select to authenticated using (true);
insert into public.cvr_blocklist (cvr, reason)
values ('25340604','Frellsens egne selskaber')
on conflict (cvr) do nothing;

-- 2) Klassifikator for offentlige kunder
create or replace function public.is_offentlig_kunde(
  _name text, _main_branch_code text, _is_public boolean,
  _institution_type public.institution_type
) returns boolean language sql immutable
set search_path = public as $$
  select coalesce(_is_public, false)
      or _institution_type is not null
      or left(coalesce(_main_branch_code,''), 2) = '84'
      or coalesce(_name,'') ~* '(kommune|\mregion\M|regionshospital|\mSKAT\M|politi|ministeri|styrelse|universitet|gymnasium|folkeskole|\mskole\M|skolen\M|hospital|sygehus|forsvar|departement|plejecenter|plejehjem|børnehus|børnehave|vuggestue|daginstitution|sundhedshus|jobcenter|rådhus|beredskab|kriminalforsorg)'
$$;

-- 3) Adressenormalisering (IMMUTABLE — bruges i indexes)
create or replace function public.addr_base(_addr text)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(
    split_part(replace(replace(lower(coalesce(_addr,'')),'é','e'),'è','e'), ',', 1),
    '\s+', ' ', 'g'))
$$;

create or replace function public.addr_vej(_addr text)
returns text language sql immutable set search_path = public as $$
  select nullif(btrim(regexp_replace(
    public.addr_base(_addr),
    '\s+\d+\s*[a-zæøå]?(\s*-\s*\d+\s*[a-zæøå]?)?$', '')), '')
$$;

create or replace function public.addr_husnr(_addr text)
returns text language sql immutable set search_path = public as $$
  select nullif(array_to_string(
    regexp_match(public.addr_base(_addr),
      '(\d+)\s*([a-zæøå]?)(?:\s*-\s*\d+[a-zæøå]?)?$'), ''), '')
$$;

-- 4) Tabel til CVR-produktionsenheder
create table if not exists public.cvr_penheder (
  p_number text primary key,
  cvr text not null,
  name text,
  address text,
  zip text,
  city text,
  branch_code text,
  status text,
  is_active boolean not null default true,
  synced_at timestamptz not null default now()
);
grant select on public.cvr_penheder to authenticated;
grant all on public.cvr_penheder to service_role;
alter table public.cvr_penheder enable row level security;
create policy "cvr_penheder_read" on public.cvr_penheder
  for select to authenticated using (true);

create index if not exists cvr_penheder_cvr_idx
  on public.cvr_penheder (cvr) where is_active;
create index if not exists cvr_penheder_match_idx
  on public.cvr_penheder (zip, public.addr_vej(address), public.addr_husnr(address));

create index if not exists locations_addr_match_idx
  on public.locations (zip, public.addr_vej(address), public.addr_husnr(address));

-- 5) Kø-tabel til synkronisering (samme mønster som cvr_enrichment_jobs)
create table if not exists public.cvr_penhed_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  cvrs text[] not null,
  status text not null default 'pending',
  attempts int not null default 0,
  synced_count int,
  last_error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
grant select, insert, update, delete on public.cvr_penhed_sync_jobs to authenticated;
grant all on public.cvr_penhed_sync_jobs to service_role;
alter table public.cvr_penhed_sync_jobs enable row level security;
create policy "penhed_jobs_admin" on public.cvr_penhed_sync_jobs
  for all to authenticated using (public.is_admin(auth.uid()));
create index if not exists penhed_jobs_pending_idx
  on public.cvr_penhed_sync_jobs (status, created_at);
