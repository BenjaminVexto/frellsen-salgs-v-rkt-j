ALTER TABLE public.competitor_assignments
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_dato date NOT NULL DEFAULT current_date,
  ADD COLUMN IF NOT EXISTS afsluttet_dato date;

UPDATE public.competitor_assignments ca SET
  location_id = (SELECT l.id FROM public.locations l WHERE l.company_id = ca.company_id
                 ORDER BY l.is_primary DESC, l.er_hovedkonto DESC, l.created_at LIMIT 1),
  start_dato = ca.created_at::date
WHERE ca.location_id IS NULL;

ALTER TABLE public.competitor_assignments DROP CONSTRAINT IF EXISTS competitor_assignments_company_id_competitor_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS competitor_assignments_aktiv_pr_lokation
  ON public.competitor_assignments (location_id) WHERE afsluttet_dato IS NULL AND location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_competitor_assignments_location ON public.competitor_assignments (location_id);

CREATE OR REPLACE FUNCTION public.competitor_assignment_ny()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.location_id IS NULL THEN
    SELECT l.id INTO NEW.location_id FROM public.locations l WHERE l.company_id = NEW.company_id
    ORDER BY l.is_primary DESC, l.er_hovedkonto DESC, l.created_at LIMIT 1;
  END IF;
  IF NEW.afsluttet_dato IS NULL AND NEW.location_id IS NOT NULL THEN
    UPDATE public.competitor_assignments
       SET afsluttet_dato = current_date, updated_at = now()
     WHERE location_id = NEW.location_id AND afsluttet_dato IS NULL AND id <> NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_competitor_assignment_ny ON public.competitor_assignments;
CREATE TRIGGER trg_competitor_assignment_ny BEFORE INSERT ON public.competitor_assignments
  FOR EACH ROW EXECUTE FUNCTION public.competitor_assignment_ny();

COMMENT ON COLUMN public.competitor_assignments.afsluttet_dato IS 'Sat når en nyere aftale registreres på samme lokation. Afsluttede aftaler bevares som historik.';