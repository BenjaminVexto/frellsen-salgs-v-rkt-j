CREATE OR REPLACE FUNCTION public.er_crm_bruger()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()) $$;
REVOKE EXECUTE ON FUNCTION public.er_crm_bruger() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.er_crm_bruger() TO authenticated, service_role;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname, qual, with_check FROM pg_policies WHERE schemaname='public' AND (tablename, policyname) IN (
    ('afdeling_alias','afdeling_alias_select_authenticated'),('cvr_penheder','cvr_penheder_read'),
    ('katalog_indstilling','Alle læser katalogindstilling'),('penhed_forslag_afvist','Fortryd afvisning'),
    ('competitors','Alle kan læse konkurrenter'),('penhed_handling_log','Laes P-enhed log'),
    ('materialer','Indloggede læser materialer'),('produktgruppe_navn','Alle kan laese afdelingsnavne'),
    ('penhed_ikke_relevant','Laes ikke relevante'),('profiles','Alle kan se profiler'),
    ('maskine_placering_log','Alle ser placeringslog'),('maskine_placering','Alle ser placering'),
    ('cvr_blocklist','cvr_blocklist_read'),('fald_indstilling','Alle læser faldgrænser'),
    ('agreements','agreements_read'),('cvr_enhed','cvr_enhed_read'),
    ('produkt_underkategori','alle autentificerede kan laese underkategorier'),('products','Indloggede kan se produkter'),
    ('afdeling','Alle indloggede kan se afdelinger'),('kundeprisgruppe_sektor','Authenticated can read kundeprisgruppe_sektor'),
    ('produktgruppe_rolle','produktgruppe_rolle_read'),('postnummer_region','Alle kan se postnummer_region'),
    ('location_equipment_units','Alle ser equipment-enheder'),('udstyr_indstilling','alle_laes'))
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO authenticated USING (public.er_crm_bruger())', r.policyname, r.tablename);
    IF r.with_check IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (public.er_crm_bruger())', r.policyname, r.tablename);
    END IF;
  END LOOP;
END $$;