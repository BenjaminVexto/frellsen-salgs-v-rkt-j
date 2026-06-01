
-- 1) Backfill: hver virksomhed uden lokation får én primær lokation med virksomhedens adresse
INSERT INTO public.locations (company_id, visma_delivery_no, address, zip, city, phone, email, contact_person, is_primary)
SELECT
  c.id,
  COALESCE(NULLIF(c.visma_delivery_id, ''), NULLIF(c.visma_id, '')),
  c.address,
  c.zip,
  c.city,
  c.phone,
  c.email,
  c.contact_person,
  true
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.locations l WHERE l.company_id = c.id);

-- 2) Trigger: nye virksomheder får automatisk en primær lokation
CREATE OR REPLACE FUNCTION public.ensure_primary_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.locations (company_id, visma_delivery_no, address, zip, city, phone, email, contact_person, is_primary)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(NEW.visma_delivery_id, ''), NULLIF(NEW.visma_id, '')),
    NEW.address,
    NEW.zip,
    NEW.city,
    NEW.phone,
    NEW.email,
    NEW.contact_person,
    true
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_ensure_primary_location ON public.companies;
CREATE TRIGGER trg_companies_ensure_primary_location
AFTER INSERT ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.ensure_primary_location();
