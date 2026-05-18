-- Enum for institution type
DO $$ BEGIN
  CREATE TYPE public.institution_type AS ENUM ('børnehave','skole','plejecenter','kommune','region','stat','andet_offentligt');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ean_number text,
  ADD COLUMN IF NOT EXISTS parent_cvr text,
  ADD COLUMN IF NOT EXISTS institution_type public.institution_type,
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- Unique when filled (Postgres treats NULLs as distinct in UNIQUE)
CREATE UNIQUE INDEX IF NOT EXISTS companies_ean_number_key
  ON public.companies (ean_number)
  WHERE ean_number IS NOT NULL;

-- Helpful index for name+zip soft match
CREATE INDEX IF NOT EXISTS companies_name_zip_idx
  ON public.companies (lower(name), zip);

CREATE INDEX IF NOT EXISTS companies_is_public_idx ON public.companies (is_public);