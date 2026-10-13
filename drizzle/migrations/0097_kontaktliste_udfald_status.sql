ALTER TYPE public.assignment_status ADD VALUE IF NOT EXISTS 'forsoegt';
ALTER TYPE public.assignment_status ADD VALUE IF NOT EXISTS 'ring_igen';
ALTER TYPE public.assignment_status ADD VALUE IF NOT EXISTS 'forkert_nummer';
ALTER TYPE public.assignment_status ADD VALUE IF NOT EXISTS 'ikke_interesseret';
ALTER TYPE public.assignment_status ADD VALUE IF NOT EXISTS 'oensker_ikke_kontakt';
ALTER TYPE public.assignment_status ADD VALUE IF NOT EXISTS 'tilbud_oensket';
ALTER TYPE public.assignment_status ADD VALUE IF NOT EXISTS 'ikke_opnaaet';
COMMENT ON TYPE public.assignment_status IS 'Kontaktliste-status. DEPRECATED values (not used by contact lists anymore): skal_kontaktes, kontaktet, talt_med, tilbud_sendt, ikke_relevant, senere_emne, vundet, tabt.';

ALTER TABLE public.contact_list_assignments ADD COLUMN IF NOT EXISTS status_aarsag text;
ALTER TABLE public.contact_list_assignments ADD COLUMN IF NOT EXISTS antal_forsoeg integer NOT NULL DEFAULT 0;

ALTER TABLE public.kontaktliste_opkald ADD COLUMN IF NOT EXISTS rolle text;
ALTER TABLE public.kontaktliste_opkald DROP CONSTRAINT IF EXISTS kontaktliste_opkald_udfald_check;
ALTER TABLE public.kontaktliste_opkald ADD CONSTRAINT kontaktliste_opkald_udfald_check CHECK (udfald = ANY (ARRAY['ingen_svar','ring_igen','forkert_nummer','ikke_interesseret','oensker_ikke_kontakt','tilbud_oensket','moede_booket','ikke_opnaaet']));

CREATE POLICY "Bruger ser egne registreringer" ON public.kontaktliste_opkald FOR SELECT TO authenticated
  USING (user_id = auth.uid());