
-- Aftaletype-klassifikation (offentlig/erhverv/ski/ukendt) med admin-overstyring
DO $$ BEGIN
  CREATE TYPE public.agreement_type AS ENUM ('offentlig', 'erhverv', 'ski', 'ukendt');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.agreements
  ADD COLUMN IF NOT EXISTS aftale_type public.agreement_type NOT NULL DEFAULT 'ukendt',
  ADD COLUMN IF NOT EXISTS aftale_type_manuel boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.derive_agreement_type(_name text)
RETURNS public.agreement_type
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _name IS NULL OR btrim(_name) = '' THEN 'ukendt'::public.agreement_type
    WHEN _name ~* '(\m(SKI|T-SKI)\M|rammeaftale|f[æa]llesindk[øo]b|samk[øo]b|kommuneindk[øo]b)'
      THEN 'ski'::public.agreement_type
    WHEN _name ~* '(kommune|region(shospital)?|\mSKAT\M|politi|\mADST\M|ministeri|styrelse|universitet|gymnasium|folkeskole|hospital|sygehus|forsvar|departement)'
      THEN 'offentlig'::public.agreement_type
    ELSE 'erhverv'::public.agreement_type
  END
$$;

CREATE OR REPLACE FUNCTION public.agreements_auto_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.aftale_type_manuel THEN
    RETURN NEW;
  END IF;
  NEW.aftale_type := public.derive_agreement_type(NEW.name);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_agreements_auto_type ON public.agreements;
CREATE TRIGGER trg_agreements_auto_type
  BEFORE INSERT OR UPDATE OF name, aftale_type_manuel ON public.agreements
  FOR EACH ROW EXECUTE FUNCTION public.agreements_auto_type();

-- Backfill eksisterende aftaler hvor admin ikke har overstyret
UPDATE public.agreements
SET aftale_type = public.derive_agreement_type(name)
WHERE aftale_type_manuel = false;
