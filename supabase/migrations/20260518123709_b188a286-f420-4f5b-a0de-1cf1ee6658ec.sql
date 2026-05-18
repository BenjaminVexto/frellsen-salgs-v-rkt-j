-- 1. Add Visma + segmentation fields to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS created_in_visma date,
  ADD COLUMN IF NOT EXISTS customer_segment_1 text,
  ADD COLUMN IF NOT EXISTS customer_segment_2 text,
  ADD COLUMN IF NOT EXISTS customer_segment_3 text,
  ADD COLUMN IF NOT EXISTS visma_delivery_id text,
  ADD COLUMN IF NOT EXISTS contact_person text;

-- 2. Add salesperson_no to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS salesperson_no text;

CREATE INDEX IF NOT EXISTS idx_profiles_salesperson_no ON public.profiles(salesperson_no);

-- 3. Function + trigger to auto-derive customer_type from last_purchase_date
CREATE OR REPLACE FUNCTION public.derive_customer_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.last_purchase_date IS NULL THEN
    NEW.customer_type := 'nyt_emne'::customer_type;
  ELSIF NEW.last_purchase_date >= (CURRENT_DATE - INTERVAL '6 months') THEN
    NEW.customer_type := 'aktiv_kunde'::customer_type;
  ELSIF NEW.last_purchase_date >= (CURRENT_DATE - INTERVAL '18 months') THEN
    NEW.customer_type := 'sovende_kunde'::customer_type;
  ELSE
    NEW.customer_type := 'tidligere_kunde'::customer_type;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_companies_derive_customer_type ON public.companies;
CREATE TRIGGER trg_companies_derive_customer_type
BEFORE INSERT OR UPDATE OF last_purchase_date ON public.companies
FOR EACH ROW
EXECUTE FUNCTION public.derive_customer_type();

-- Recompute customer_type for existing rows
UPDATE public.companies
SET customer_type = CASE
  WHEN last_purchase_date IS NULL THEN 'nyt_emne'::customer_type
  WHEN last_purchase_date >= (CURRENT_DATE - INTERVAL '6 months') THEN 'aktiv_kunde'::customer_type
  WHEN last_purchase_date >= (CURRENT_DATE - INTERVAL '18 months') THEN 'sovende_kunde'::customer_type
  ELSE 'tidligere_kunde'::customer_type
END;