CREATE TABLE public.machine_agreement_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  serienr text NOT NULL UNIQUE,
  location_id uuid REFERENCES public.locations(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('i_gang','kontaktet','afventer_kunde','fornyet','tabt')),
  note text,
  updated_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.machine_agreement_status TO authenticated;
GRANT ALL ON public.machine_agreement_status TO service_role;

ALTER TABLE public.machine_agreement_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Se maskinaftale-status for tilgængelige virksomheder"
ON public.machine_agreement_status FOR SELECT TO authenticated
USING (public.can_access_company(auth.uid(), company_id));

CREATE POLICY "Opret maskinaftale-status for tilgængelige virksomheder"
ON public.machine_agreement_status FOR INSERT TO authenticated
WITH CHECK (updated_by = auth.uid() AND public.can_access_company(auth.uid(), company_id));

CREATE POLICY "Opdater maskinaftale-status for tilgængelige virksomheder"
ON public.machine_agreement_status FOR UPDATE TO authenticated
USING (public.can_access_company(auth.uid(), company_id))
WITH CHECK (public.can_access_company(auth.uid(), company_id));

CREATE POLICY "Slet egen maskinaftale-status eller admin"
ON public.machine_agreement_status FOR DELETE TO authenticated
USING (updated_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE INDEX idx_machine_agreement_status_company ON public.machine_agreement_status(company_id);
CREATE INDEX idx_machine_agreement_status_serienr ON public.machine_agreement_status(serienr);

CREATE TRIGGER machine_agreement_status_touch_updated_at
BEFORE UPDATE ON public.machine_agreement_status
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();