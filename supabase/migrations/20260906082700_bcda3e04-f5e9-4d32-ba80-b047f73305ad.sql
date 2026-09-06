ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS visma_enhed text;
ALTER TABLE public.locations ADD COLUMN IF NOT EXISTS visma_enhed text;

UPDATE public.companies
SET visma_enhed = NULLIF(btrim((regexp_match(visma_notes, 'Adresselinje 1:[ \t]*([^\r\n]*)'))[1]), '')
WHERE visma_notes IS NOT NULL
  AND visma_notes ~ 'Adresselinje 1:';