-- Kø-tabel til CVR-berigelse
CREATE TABLE public.cvr_enrichment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_ids uuid[] NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  enriched_count int,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  CONSTRAINT cvr_enrichment_jobs_status_check
    CHECK (status IN ('pending','processing','done','failed'))
);

GRANT SELECT ON public.cvr_enrichment_jobs TO authenticated;
GRANT ALL ON public.cvr_enrichment_jobs TO service_role;

ALTER TABLE public.cvr_enrichment_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ser enrichment-jobs"
  ON public.cvr_enrichment_jobs
  FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX cvr_enrichment_jobs_status_created_idx
  ON public.cvr_enrichment_jobs (status, created_at)
  WHERE status IN ('pending','processing');

-- Unique index: én virksomhed pr. (navn, Visma-kundenr)
CREATE UNIQUE INDEX companies_name_kundenr_unique
  ON public.companies (lower(name), visma_id)
  WHERE visma_id IS NOT NULL AND visma_id <> '';