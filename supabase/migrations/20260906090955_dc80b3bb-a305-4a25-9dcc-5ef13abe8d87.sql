ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS te_type text,
  ADD COLUMN IF NOT EXISTS te_type_manuel boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_te_type_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_te_type_check CHECK (
    te_type IS NULL OR te_type IN ('sort','groen','hvid','oolong','rooibos','urte','frugt','matcha','chai','ukendt')
  );

CREATE OR REPLACE FUNCTION public.derive_te_type(_beskrivelse text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  t text := lower(coalesce(_beskrivelse, ''));
BEGIN
  IF t ~ '(rooibos|roibos)' THEN RETURN 'rooibos'; END IF;
  IF t ~ '(hvid te|pai mu tan|white tea|hvid paklum|silver needle)' THEN RETURN 'hvid'; END IF;
  IF t ~ 'oolong' THEN RETURN 'oolong'; END IF;
  IF t ~ 'matcha' THEN RETURN 'matcha'; END IF;
  IF t ~ '(grøn|sencha|gunpowder|jasmin|bancha|chun mee)' THEN RETURN 'groen'; END IF;
  IF t ~ '(urte|kamille|pebermynte|hibiscus|yerba mate|chai|lakrids)' THEN RETURN 'urte'; END IF;
  IF t ~ '(ceylon|assam|darjeeling|keemun|yunnan|earl grey|lapsang|pekoe|panyong|kenya|sort te)' THEN RETURN 'sort'; END IF;
  IF t ~ '(frugt|bær|abricos|kvæde|citron|lemon|appelsin|tranebær|havtorn|pære|æble)' THEN RETURN 'frugt'; END IF;
  RETURN 'ukendt';
END;
$$;

CREATE OR REPLACE FUNCTION public.classify_te_types()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.products p
     SET te_type = public.derive_te_type(p.beskrivelse),
         updated_at = now()
   WHERE p.kategori = 'te'
     AND p.te_type_manuel = false
     AND coalesce(p.te_type, '') IS DISTINCT FROM public.derive_te_type(p.beskrivelse);
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.classify_te_types() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.classify_te_types() TO service_role;

SELECT public.classify_te_types();