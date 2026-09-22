create or replace function public.can_view_company(_user_id uuid, _company_id uuid)
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select _user_id is not null and _company_id is not null and exists (
    select 1 from public.companies c
    where c.id = _company_id
      and c.afdeling_nr = any ((select public.my_afdelinger())::int[])
  )
$$;

grant execute on function public.can_view_company(uuid, uuid) to anon, authenticated, service_role;

-- Drop existing SELECT policies (names contain non-ASCII; drop dynamically)
do $do$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and cmd = 'SELECT'
      and tablename in ('activities','contacts','sales_opportunities','company_documents',
        'company_briefings','competitor_assignments','machine_agreement_status','quotes',
        'quote_lines','company_relations','company_relation_suggestions','machine_enrichment',
        'sales_top_products')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public' and cmd = 'INSERT' and tablename = 'activities'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end
$do$;

create policy "Se aktiviteter i egne afdelinger" on public.activities
for select using (public.can_view_company(auth.uid(), company_id));

create policy "Opret aktiviteter i egne afdelinger" on public.activities
for insert with check (created_by = auth.uid() and public.can_view_company(auth.uid(), company_id));

create policy "Se kontakter i egne afdelinger" on public.contacts
for select using (public.can_view_company(auth.uid(), company_id));

create policy "Se salgsmuligheder i egne afdelinger" on public.sales_opportunities
for select using (public.can_view_company(auth.uid(), company_id) or assigned_to = auth.uid() or public.is_admin(auth.uid()));

create policy "Laes dokumenter i egne afdelinger" on public.company_documents
for select using (public.can_view_company(auth.uid(), company_id));

create policy "Se briefings i egne afdelinger" on public.company_briefings
for select using (public.can_view_company(auth.uid(), company_id));

create policy "Se konkurrentaftaler i egne afdelinger" on public.competitor_assignments
for select using (public.can_view_company(auth.uid(), company_id));

create policy "Se maskinaftale-status i egne afdelinger" on public.machine_agreement_status
for select using (public.can_view_company(auth.uid(), company_id));

create policy "Se tilbud i egne afdelinger" on public.quotes
for select using (public.can_view_company(auth.uid(), company_id));

create policy "Laes quote_lines i egne afdelinger" on public.quote_lines
for select using (exists (
  select 1 from public.quotes q
  where q.id = quote_lines.quote_id and public.can_view_company(auth.uid(), q.company_id)
));

create policy "auth read relations" on public.company_relations
for select using (public.can_view_company(auth.uid(), from_company_id) or public.can_view_company(auth.uid(), to_company_id));

create policy "auth read suggestions" on public.company_relation_suggestions
for select using (public.can_view_company(auth.uid(), from_company_id) or public.can_view_company(auth.uid(), to_company_id));

create policy "Users can read accessible machine_enrichment" on public.machine_enrichment
for select using (
  public.is_admin(auth.uid())
  or public.has_role(auth.uid(), 'salgssupport'::app_role)
  or exists (
    select 1 from public.location_equipment_units u
    join public.locations l on l.id = u.location_id
    where u.serial_no = machine_enrichment.serienr
      and l.company_id is not null
      and public.can_view_company(auth.uid(), l.company_id)
  )
);

create policy "Users can view accessible sales_top_products" on public.sales_top_products
for select using (
  case
    when location_id is null then afdeling_nr = any ((select public.my_afdelinger())::int[])
    else exists (
      select 1 from public.locations l
      where l.id = sales_top_products.location_id
        and case
              when l.company_id is null then sales_top_products.afdeling_nr = any ((select public.my_afdelinger())::int[])
              else public.can_view_company(auth.uid(), l.company_id)
            end
    )
  end
);
