
ALTER TABLE public.machines
  ADD COLUMN IF NOT EXISTS record_status text NOT NULL DEFAULT 'aktiv',
  ADD COLUMN IF NOT EXISTS last_seen_import timestamptz,
  ADD COLUMN IF NOT EXISTS udgaaet_dato timestamptz;

ALTER TABLE public.machine_enrichment
  ADD COLUMN IF NOT EXISTS record_status text NOT NULL DEFAULT 'aktiv',
  ADD COLUMN IF NOT EXISTS last_seen_import timestamptz,
  ADD COLUMN IF NOT EXISTS udgaaet_dato timestamptz;

CREATE INDEX IF NOT EXISTS machines_record_status_idx ON public.machines(record_status);
CREATE INDEX IF NOT EXISTS machine_enrichment_record_status_idx ON public.machine_enrichment(record_status);
