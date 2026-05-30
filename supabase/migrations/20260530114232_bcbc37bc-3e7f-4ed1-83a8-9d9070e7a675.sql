
ALTER TABLE public.import_batches
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'companies',
  ADD COLUMN IF NOT EXISTS item_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS payload jsonb;

ALTER TABLE public.import_batches
  DROP CONSTRAINT IF EXISTS import_batches_kind_check;
ALTER TABLE public.import_batches
  ADD CONSTRAINT import_batches_kind_check
  CHECK (kind IN ('companies','maskindata','agreement'));

UPDATE public.import_batches
SET item_count = company_count
WHERE item_count = 0 AND company_count > 0;
