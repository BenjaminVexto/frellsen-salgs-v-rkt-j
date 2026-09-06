create or replace function public.tick_invoice_import(_url text, _apikey text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _has_work boolean;
begin
  select exists (
    select 1 from public.invoice_import_jobs
    where
      (
        status not in ('completed','failed','cancelled')
        and coalesce(phase,'') <> 'done'
      )
      or (
        status not in ('completed','failed','cancelled')
        and coalesce(updated_at, created_at) < now() - interval '30 minutes'
      )
  ) into _has_work;
  if not _has_work then
    return false;
  end if;
  perform net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type','application/json','apikey',_apikey),
    body := '{}'::jsonb
  );
  return true;
end;
$$;

create or replace function public.tick_cvr_enrichment(_url text, _apikey text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _has_work boolean;
begin
  select exists (
    select 1 from public.cvr_enrichment_jobs
    where
      status not in ('done','failed','cancelled')
      or (
        status not in ('done','failed','cancelled')
        and coalesce(started_at, created_at) < now() - interval '30 minutes'
      )
  ) into _has_work;
  if not _has_work then
    return false;
  end if;
  perform net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type','application/json','apikey',_apikey),
    body := '{}'::jsonb
  );
  return true;
end;
$$;

create or replace function public.tick_penhed_sync(_url text, _apikey text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  _has_work boolean;
begin
  select exists (
    select 1 from public.cvr_penhed_sync_jobs
    where
      status not in ('done','failed','cancelled')
      or (
        status not in ('done','failed','cancelled')
        and coalesce(started_at, created_at) < now() - interval '30 minutes'
      )
  ) into _has_work;
  if not _has_work then
    return false;
  end if;
  perform net.http_post(
    url := _url,
    headers := jsonb_build_object('Content-Type','application/json','apikey',_apikey),
    body := '{}'::jsonb
  );
  return true;
end;
$$;

revoke all on function public.tick_invoice_import(text, text) from public, anon, authenticated;
revoke all on function public.tick_cvr_enrichment(text, text) from public, anon, authenticated;
revoke all on function public.tick_penhed_sync(text, text) from public, anon, authenticated;