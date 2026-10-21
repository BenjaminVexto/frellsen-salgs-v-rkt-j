
CREATE TABLE public.udstyr_lok_maaned (
  lev text NOT NULL,
  maaned date NOT NULL,
  leje numeric NOT NULL DEFAULT 0,
  belastning numeric NOT NULL DEFAULT 0,
  service_ind numeric NOT NULL DEFAULT 0,
  aftale_kost numeric NOT NULL DEFAULT 0,
  montoer numeric NOT NULL DEFAULT 0,
  reservedele numeric NOT NULL DEFAULT 0,
  patroner numeric NOT NULL DEFAULT 0,
  varer_db numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (lev, maaned)
);
CREATE TABLE public.udstyr_leje_type_maaned (
  lev text NOT NULL, maaned date NOT NULL, maskintype text NOT NULL, leje numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (lev, maaned, maskintype)
);
CREATE TABLE public.udstyr_refresh_ko (maaned date PRIMARY KEY, tilfoejet_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE public.udstyr_indstilling (noegle text PRIMARY KEY, vaerdi numeric NOT NULL, opdateret_at timestamptz NOT NULL DEFAULT now());

GRANT SELECT ON public.udstyr_lok_maaned, public.udstyr_leje_type_maaned, public.udstyr_refresh_ko TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.udstyr_indstilling TO authenticated;
GRANT ALL ON public.udstyr_lok_maaned, public.udstyr_leje_type_maaned, public.udstyr_refresh_ko, public.udstyr_indstilling TO service_role;

ALTER TABLE public.udstyr_lok_maaned ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.udstyr_leje_type_maaned ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.udstyr_refresh_ko ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.udstyr_indstilling ENABLE ROW LEVEL SECURITY;

CREATE POLICY admin_laes ON public.udstyr_lok_maaned FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY admin_laes ON public.udstyr_leje_type_maaned FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY admin_laes ON public.udstyr_refresh_ko FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY alle_laes ON public.udstyr_indstilling FOR SELECT TO authenticated USING (true);
CREATE POLICY admin_skriv ON public.udstyr_indstilling FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY tm_spaerret ON public.udstyr_lok_maaned AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));
CREATE POLICY tm_spaerret ON public.udstyr_leje_type_maaned AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));
CREATE POLICY tm_spaerret ON public.udstyr_refresh_ko AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));
CREATE POLICY tm_spaerret ON public.udstyr_indstilling AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));

-- Maskintype fra tekst (maskinbeskrivelse eller varetekst)
CREATE OR REPLACE FUNCTION public.udstyr_type_tekst(_t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN _t ~* 'wittenborg' THEN 'Wittenborg'
    WHEN _t ~* 'rex' THEN 'Rex-Royal'
    WHEN _t ~* 'animo' THEN 'Animo'
    WHEN _t ~* 'brita' THEN 'Brita-filtre'
    WHEN _t ~* '(bravilor|bonamat|bolero|bunn|grindmaster)' THEN 'Bravilor/Bonamat og bryggere'
    WHEN _t ~* '(espresso|krea|kalerm|gaggia|profitec|futurmat|visacrem|vivace|obel)' THEN 'Espresso'
    WHEN _t ~* '(vandkøl|waterking|niagara|h2o-my|jclass|aquality)' THEN 'Vandkøler'
    ELSE 'Andet' END
$$;

CREATE OR REPLACE FUNCTION public.udstyr_type_leje(_bonusklasse text, _varetekst text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(_bonusklasse,''))
    WHEN 'wittenborg' THEN 'Wittenborg' WHEN 'rex' THEN 'Rex-Royal' WHEN 'animo' THEN 'Animo'
    WHEN 'kalerm' THEN 'Espresso' WHEN 'espresso' THEN 'Espresso'
    ELSE public.udstyr_type_tekst(_varetekst) END
$$;

CREATE OR REPLACE FUNCTION public.udstyr_refresh_maaned(_m date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM udstyr_lok_maaned WHERE maaned = _m;
  DELETE FROM udstyr_leje_type_maaned WHERE maaned = _m;
  INSERT INTO udstyr_lok_maaned (lev, maaned, leje, belastning, service_ind, aftale_kost, montoer, reservedele, patroner, varer_db)
  SELECT visma_delivery_no, _m,
    sum(beloeb) FILTER (WHERE varegruppe_1='16' AND varegruppe_2='80' AND varenr<>'70000'),
    sum(db) FILTER (WHERE varenr='70000'),
    sum(beloeb) FILTER (WHERE varegruppe_1='16' AND varegruppe_2='82' AND varenr<>'70000'),
    sum(beloeb-db) FILTER (WHERE varegruppe_1='16' AND varegruppe_2='82' AND varenr<>'70000'),
    sum(db) FILTER (WHERE varegruppe_1='16' AND varegruppe_2='83'),
    sum(db) FILTER (WHERE varegruppe_1='18'),
    sum(db) FILTER (WHERE varegruppe_1='17'),
    sum(db) FILTER (WHERE coalesce(varegruppe_1,'') NOT IN ('16','17','18') AND varenr<>'70000')
  FROM invoice_lines WHERE afdeling_nr=11 AND period=_m AND visma_delivery_no IS NOT NULL
  GROUP BY visma_delivery_no;
  UPDATE udstyr_lok_maaned SET leje=coalesce(leje,0) WHERE false;
  INSERT INTO udstyr_leje_type_maaned (lev, maaned, maskintype, leje)
  SELECT i.visma_delivery_no, _m, udstyr_type_leje(p.bonusklasse, i.varetekst), sum(i.beloeb)
  FROM invoice_lines i LEFT JOIN products p ON p.varenr=i.varenr
  WHERE i.afdeling_nr=11 AND i.period=_m AND i.varegruppe_1='16' AND i.varegruppe_2='80' AND i.varenr<>'70000' AND i.visma_delivery_no IS NOT NULL
  GROUP BY 1,2,3;
END $$;
REVOKE ALL ON FUNCTION public.udstyr_refresh_maaned(date) FROM PUBLIC, anon, authenticated;
