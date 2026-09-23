ALTER TABLE public.machine_enrichment
  ADD COLUMN IF NOT EXISTS kilde text NOT NULL DEFAULT 'sn';

ALTER TABLE public.machine_enrichment
  ADD CONSTRAINT machine_enrichment_kilde_check CHECK (kilde IN ('sn', 'uden_sn'));

CREATE INDEX IF NOT EXISTS machine_enrichment_kilde_idx ON public.machine_enrichment (kilde);