TRUNCATE TABLE
  public.activities,
  public.notifications,
  public.quotes,
  public.sales_opportunities,
  public.competitor_assignments,
  public.contact_list_assignments,
  public.contact_lists,
  public.filter_templates,
  public.company_documents,
  public.contacts,
  public.locations,
  public.import_batches,
  public.companies
RESTART IDENTITY CASCADE;