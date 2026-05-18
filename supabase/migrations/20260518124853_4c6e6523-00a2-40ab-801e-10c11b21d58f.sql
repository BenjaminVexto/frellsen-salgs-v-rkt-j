-- Add source tracking to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS sources text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS source_created_by uuid,
  ADD COLUMN IF NOT EXISTS source_updated_at timestamp with time zone DEFAULT now();

-- Backfill existing rows: if visma_id is set, mark as visma; ellers cvr (de fleste eksisterende er importeret fra CVR/Visma)
UPDATE public.companies
SET sources = CASE
  WHEN visma_id IS NOT NULL AND visma_id <> '' THEN ARRAY['visma']
  ELSE ARRAY['cvr']
END
WHERE sources = ARRAY[]::text[] OR sources IS NULL;

CREATE INDEX IF NOT EXISTS idx_companies_sources ON public.companies USING GIN (sources);