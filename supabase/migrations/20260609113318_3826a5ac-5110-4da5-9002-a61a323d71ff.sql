
CREATE TABLE public.churn_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('lost_competitor','lost_tender','closed','paused')),
  competitor_id uuid REFERENCES public.competitors(id) ON DELETE SET NULL,
  expected_date date,
  snooze_until date,
  snooze_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  notes text,
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.churn_dismissals TO authenticated;
GRANT ALL ON public.churn_dismissals TO service_role;

ALTER TABLE public.churn_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Se churn_dismissals for tilgængelige virksomheder"
ON public.churn_dismissals FOR SELECT TO authenticated
USING (public.can_access_company(auth.uid(), company_id));

CREATE POLICY "Opret churn_dismissals for tilgængelige virksomheder"
ON public.churn_dismissals FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND public.can_access_company(auth.uid(), company_id));

CREATE POLICY "Opdater egne churn_dismissals eller admin"
ON public.churn_dismissals FOR UPDATE TO authenticated
USING (created_by = auth.uid() OR public.is_admin(auth.uid()))
WITH CHECK (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "Slet egne churn_dismissals eller admin"
ON public.churn_dismissals FOR DELETE TO authenticated
USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

CREATE INDEX idx_churn_dismissals_company ON public.churn_dismissals(company_id);
CREATE INDEX idx_churn_dismissals_snooze ON public.churn_dismissals(snooze_user_id, snooze_until) WHERE reason = 'paused';

CREATE TRIGGER churn_dismissals_touch_updated_at
BEFORE UPDATE ON public.churn_dismissals
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
