
CREATE TABLE public.invoice_import_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  total_monthly integer NOT NULL DEFAULT 0,
  total_top integer NOT NULL DEFAULT 0,
  saved_monthly integer NOT NULL DEFAULT 0,
  saved_top integer NOT NULL DEFAULT 0,
  locations_matched integer NOT NULL DEFAULT 0,
  unmatched_delivery_nos jsonb NOT NULL DEFAULT '[]'::jsonb,
  payload jsonb NOT NULL,
  top_deleted boolean NOT NULL DEFAULT false,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.invoice_import_jobs TO authenticated;
GRANT ALL ON public.invoice_import_jobs TO service_role;

ALTER TABLE public.invoice_import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view invoice import jobs"
  ON public.invoice_import_jobs FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "Admins can insert invoice import jobs"
  ON public.invoice_import_jobs FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin(auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Admins can update invoice import jobs"
  ON public.invoice_import_jobs FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER touch_invoice_import_jobs_updated
  BEFORE UPDATE ON public.invoice_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX idx_invoice_import_jobs_user_status ON public.invoice_import_jobs(user_id, status, created_at DESC);
