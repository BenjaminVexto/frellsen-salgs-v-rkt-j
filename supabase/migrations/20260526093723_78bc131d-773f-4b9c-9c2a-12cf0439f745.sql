
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS title text;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS is_primary boolean NOT NULL DEFAULT false;

-- Unique index så ON CONFLICT (company_id, location_id, name) virker for rækker med location_id
CREATE UNIQUE INDEX IF NOT EXISTS contacts_company_location_name_uniq
  ON public.contacts (company_id, location_id, name)
  WHERE location_id IS NOT NULL;

-- Sørg for at RLS er enabled
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Fjern eksisterende restriktive policies så vi kan erstatte med åben adgang
DROP POLICY IF EXISTS "Se kontakter for tilgængelige virksomheder" ON public.contacts;
DROP POLICY IF EXISTS "Redigér kontakter for tilgængelige virksomheder" ON public.contacts;
DROP POLICY IF EXISTS "Alle autentificerede styrer kontakter" ON public.contacts;

CREATE POLICY "Alle autentificerede kan læse og skrive contacts"
  ON public.contacts FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
