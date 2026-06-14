
ALTER TABLE public.machine_enrichment
  ADD COLUMN IF NOT EXISTS binding_ophor date,
  ADD COLUMN IF NOT EXISTS beregnet_slutdato date,
  ADD COLUMN IF NOT EXISTS handlingsdato date,
  ADD COLUMN IF NOT EXISTS handlingsdato_raw text;

CREATE INDEX IF NOT EXISTS machine_enrichment_binding_ophor_idx
  ON public.machine_enrichment (binding_ophor);
CREATE INDEX IF NOT EXISTS machine_enrichment_handlingsdato_idx
  ON public.machine_enrichment (handlingsdato);
