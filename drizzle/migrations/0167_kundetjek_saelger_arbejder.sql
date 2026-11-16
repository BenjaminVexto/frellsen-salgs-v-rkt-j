CREATE OR REPLACE FUNCTION public._kundetjek_firmaer(_ids uuid[])
 RETURNS TABLE(company_id uuid, status text, saelger_navn text, liste_navn text, liste_ids uuid[])
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH c AS (SELECT * FROM public.companies WHERE id = ANY(_ids)),
  b AS (
    SELECT c.id, c.zip, c.assigned_to, c.ikke_kontakt, c.customer_type,
      c.customer_type IN ('aktiv_kunde','sovende_kunde','servicekunde','tidligere_kunde') AS er_kunde,
      (SELECT o.assigned_to FROM public.sales_opportunities o
        WHERE o.company_id = c.id AND COALESCE(o.status_v2::text, o.status::text) NOT IN ('vundet','tabt')
        ORDER BY o.updated_at DESC NULLS LAST LIMIT 1) AS opp_ejer,
      EXISTS (SELECT 1 FROM public.sales_opportunities o
        WHERE o.company_id = c.id AND COALESCE(o.status_v2::text, o.status::text) NOT IN ('vundet','tabt')) AS har_opp,
      (SELECT a.created_by FROM public.activities a
        WHERE a.company_id = c.id AND a.udfoert_at > now() - interval '90 days'
          AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = a.created_by AND r.role = 'telemarketing')
        ORDER BY a.udfoert_at DESC LIMIT 1) AS akt_ejer,
      EXISTS (SELECT 1 FROM public.activities a
        WHERE a.company_id = c.id AND a.udfoert_at > now() - interval '90 days'
          AND NOT EXISTS (SELECT 1 FROM public.user_roles r WHERE r.user_id = a.created_by AND r.role = 'telemarketing')) AS har_akt,
      (SELECT array_agg(l.id ORDER BY l.created_at DESC) FROM public.contact_list_assignments x
        JOIN public.contact_lists l ON l.id = x.contact_list_id AND l.is_active WHERE x.company_id = c.id) AS lister
    FROM c
  ),
  s AS (
    SELECT b.*,
      CASE WHEN b.ikke_kontakt THEN 'ikke_kontakt'
           WHEN b.er_kunde THEN 'kunde'
           WHEN b.customer_type = 'nyt_emne' AND (b.har_opp OR b.har_akt) THEN 'saelger_arbejder'
           WHEN b.customer_type = 'nyt_emne' AND b.lister IS NOT NULL THEN 'paa_ringeliste'
           ELSE 'ikke_kunde' END AS st
    FROM b
  )
  SELECT s.id, s.st,
    CASE WHEN s.st IN ('kunde','saelger_arbejder') THEN (
      SELECT p.full_name FROM public.profiles p WHERE p.id = COALESCE(
        CASE WHEN s.st = 'saelger_arbejder' THEN COALESCE(s.opp_ejer, s.akt_ejer) END,
        s.assigned_to,
        (SELECT d.saelger_user_id FROM public._distrikt_saelger(s.zip) d LIMIT 1)))
    END,
    CASE WHEN s.st = 'paa_ringeliste' THEN (SELECT l.name FROM public.contact_lists l WHERE l.id = s.lister[1]) END,
    CASE WHEN s.customer_type = 'nyt_emne' THEN COALESCE(s.lister, '{}') ELSE '{}' END
  FROM s
$function$;
REVOKE EXECUTE ON FUNCTION public._kundetjek_firmaer(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kundetjek_firmaer(uuid[]) TO service_role;

CREATE OR REPLACE FUNCTION public._kundetjek_vurder(cvr_rows jsonb)
 RETURNS TABLE(cvr text, p_nummer text, status text, saelger_navn text, liste_navn text, company_id uuid, er_nyt_emne boolean, sikker boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH inp AS (
    SELECT r->>'cvr' AS cvr, NULLIF(r->>'p_number','') AS pnr FROM jsonb_array_elements(cvr_rows) r
  ), m AS MATERIALIZED (SELECT * FROM public._cvr_match_crm_intern(cvr_rows)),
  f AS MATERIALIZED (SELECT * FROM public._kundetjek_firmaer(ARRAY(SELECT m.company_id FROM m)))
  SELECT i.cvr, i.pnr,
    CASE WHEN m.company_id IS NULL THEN 'ikke_kunde'
         WHEN f.status = 'kunde' AND NOT m.sikker THEN 'mulig_kunde'
         ELSE f.status END,
    f.saelger_navn, f.liste_navn, m.company_id,
    c.customer_type = 'nyt_emne', m.sikker
  FROM inp i
  LEFT JOIN m ON m.cvr = i.cvr
  LEFT JOIN f ON f.company_id = m.company_id
  LEFT JOIN public.companies c ON c.id = m.company_id
$function$;

CREATE OR REPLACE FUNCTION public.tm_tilfoej_emne(_user uuid, _list uuid, _row jsonb, _agent_code text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v record; cid uuid; saelger uuid; n int;
BEGIN
  IF NOT public._kundetjek_adgang(_user, _list) THEN RAISE EXCEPTION 'Ingen adgang' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contact_lists WHERE id = _list AND is_active) THEN RAISE EXCEPTION 'Listen er ikke aktiv'; END IF;
  IF _agent_code IS NOT NULL AND _agent_code !~ '^[A-H]$' THEN RAISE EXCEPTION 'Ugyldig agentkode'; END IF;
  IF COALESCE(_row->>'cvr','') !~ '^\d{8}$' OR COALESCE(_row->>'name','') = '' THEN RAISE EXCEPTION 'Ugyldige data'; END IF;
  SELECT * INTO v FROM public._kundetjek_vurder(jsonb_build_array(_row)) LIMIT 1;
  IF v.status <> 'ikke_kunde' THEN RAISE EXCEPTION 'Virksomheden kan ikke tilføjes (%)', v.status; END IF;
  SELECT a.assigned_to INTO saelger FROM public.contact_list_assignments a
   WHERE a.contact_list_id = _list AND a.assigned_to IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
  IF v.company_id IS NOT NULL AND v.er_nyt_emne AND v.sikker THEN
    cid := v.company_id;
  ELSE
    INSERT INTO public.companies(cvr, name, address, zip, city, municipality, phone, email, website, industry, main_branch_text, employees,
      customer_type, sources, source_created_by, source_updated_at, assigned_to)
    VALUES (_row->>'cvr', _row->>'name', _row->>'address', _row->>'zip', _row->>'city', _row->>'municipality', _row->>'phone',
      _row->>'email', _row->>'website', _row->>'industry', _row->>'industry', NULLIF(_row->>'employees','')::int,
      'nyt_emne', ARRAY['cvr'], _user, now(), saelger)
    RETURNING id INTO cid;
  END IF;
  INSERT INTO public.contact_list_assignments(contact_list_id, company_id, assigned_to, status, tilfoejet_af_ringer, tilfoejet_agent_code)
  VALUES (_list, cid, saelger, 'ny', true, _agent_code)
  ON CONFLICT (contact_list_id, company_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Ligger allerede på listen'; END IF;
  RETURN jsonb_build_object('ok', true, 'navn', _row->>'name', '_cid', cid);
END $function$;