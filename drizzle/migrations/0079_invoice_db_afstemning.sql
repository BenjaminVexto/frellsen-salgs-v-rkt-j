ALTER TABLE public.invoice_lines ADD COLUMN IF NOT EXISTS db_kilde text NOT NULL DEFAULT 'linje';
COMMENT ON COLUMN public.invoice_lines.db_kilde IS 'linje = DB fra Visma-linjen; udledt_subtotal = DB 0 sat til beløb ud fra kundens summeringslinje; uafklaret = summering kunne ikke afstemmes';

CREATE TABLE public.invoice_db_afstemning (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL,
  visma_delivery_no text NOT NULL,
  periode_fra date,
  periode_til date,
  beloeb numeric,
  db_summering numeric,
  db_linjer_foer numeric,
  db_linjer_efter numeric,
  udfald text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.invoice_db_afstemning (job_id);
GRANT SELECT ON public.invoice_db_afstemning TO authenticated;
GRANT ALL ON public.invoice_db_afstemning TO service_role;
ALTER TABLE public.invoice_db_afstemning ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin læser DB-afstemning" ON public.invoice_db_afstemning FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));