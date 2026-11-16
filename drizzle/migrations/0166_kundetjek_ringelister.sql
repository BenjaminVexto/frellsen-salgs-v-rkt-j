CREATE UNIQUE INDEX IF NOT EXISTS contact_list_assignments_liste_firma_uq ON public.contact_list_assignments(contact_list_id, company_id);
ALTER TABLE public.contact_list_assignments ADD COLUMN IF NOT EXISTS tilfoejet_af_ringer boolean NOT NULL DEFAULT false;
ALTER TABLE public.contact_list_assignments ADD COLUMN IF NOT EXISTS tilfoejet_agent_code text;

CREATE TABLE public.kundetjek_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  agent_code text,
  contact_list_id uuid,
  cvr text,
  p_nummer text,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX kundetjek_log_user_tid ON public.kundetjek_log(user_id, created_at);
GRANT SELECT ON public.kundetjek_log TO authenticated;
GRANT ALL ON public.kundetjek_log TO service_role;
ALTER TABLE public.kundetjek_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY kundetjek_log_admin_read ON public.kundetjek_log FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY tm_spaerret ON public.kundetjek_log AS RESTRICTIVE FOR ALL TO public USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));

CREATE OR REPLACE FUNCTION public._cvr_match_crm_intern(cvr_rows jsonb)
 RETURNS TABLE(cvr text, match_type text, sikker boolean, score real, company_id uuid, company_name text, kundenr text, ikke_kontakt boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  WITH inp AS MATERIALIZED (
    SELECT r->>'cvr' AS cvr,
           COALESCE(ARRAY(SELECT jsonb_array_elements_text(COALESCE(r->'pnumre','[]'::jsonb))), '{}'::text[]) AS pnr,
           public.addr_n_vej(r->>'address') AS v,
           public.addr_n_husnr(r->>'address') AS h,
           NULLIF(regexp_replace(COALESCE(r->>'zip',''), '\D', '', 'g'), '') AS zip,
           right(regexp_replace(COALESCE(r->>'phone',''), '\D', '', 'g'), 8) AS tel,
           public.navn_norm(r->>'name') AS nn,
           public.navn_ord(r->>'name') AS ord,
           public.navn_norm(r->>'city') AS byn
    FROM jsonb_array_elements(cvr_rows) r
    WHERE r->>'cvr' ~ '^\d{8}$'
  ),
  comp AS MATERIALIZED (
    SELECT c.id, c.name, c.visma_id,
           NULLIF(upper(regexp_replace(COALESCE(c.cvr,''), '^\s*DK|[\s-]', '', 'gi')), '') AS ncvr,
           upper(regexp_replace(COALESCE(c.parent_cvr,''), '^\s*DK|[\s-]', '', 'gi')) AS npcvr,
           right(regexp_replace(COALESCE(c.phone,''), '\D', '', 'g'), 8) AS tel,
           c.address, NULLIF(regexp_replace(COALESCE(c.zip,''), '\D', '', 'g'), '') AS zip
    FROM public.companies c
  ),
  utencvr AS MATERIALIZED (SELECT * FROM comp WHERE ncvr IS NULL),
  sikre AS (
    SELECT i.cvr, 1 AS pri, 'cvr'::text AS t, c.id AS cid, c.visma_id::text AS knr
      FROM inp i JOIN comp c ON c.ncvr = i.cvr
    UNION ALL
    SELECT i.cvr, 2, 'parent_cvr', c.id, c.visma_id::text
      FROM inp i JOIN comp c ON c.npcvr = i.cvr
    UNION ALL
    SELECT i.cvr, 3, 'penhed', l.company_id, l.visma_delivery_no::text
      FROM inp i JOIN public.location_pnr_link k ON k.p_nummer = ANY(i.pnr) AND k.kilde IN ('auto','manuel')
      JOIN public.locations l ON l.id = k.location_id
    UNION ALL
    SELECT i.cvr, 3, 'penhed_indirekte', k.company_id, NULL::text
      FROM inp i JOIN public.location_pnr_link k ON k.p_nummer = ANY(i.pnr) AND k.kilde = 'indirekte'
  ),
  lok AS MATERIALIZED (
    SELECT l.company_id, l.visma_delivery_no::text AS knr, l.zip_norm::text AS zip, l.address,
           right(regexp_replace(COALESCE(l.phone,''), '\D', '', 'g'), 8) AS tel
    FROM public.locations l JOIN utencvr u ON u.id = l.company_id
  ),
  lok_adr AS MATERIALIZED (
    SELECT l.company_id, l.knr, l.zip, public.addr_n_vej(l.address) AS v, public.addr_n_husnr(l.address) AS h
    FROM lok l WHERE l.zip IN (SELECT i.zip FROM inp i WHERE i.zip IS NOT NULL)
    UNION ALL
    SELECT u.id, u.visma_id::text, u.zip, public.addr_n_vej(u.address), public.addr_n_husnr(u.address)
    FROM utencvr u WHERE u.zip IN (SELECT i.zip FROM inp i WHERE i.zip IS NOT NULL)
  ),
  tel_k AS MATERIALIZED (
    SELECT l.company_id, l.knr, l.tel FROM lok l WHERE length(l.tel) = 8
    UNION ALL
    SELECT u.id, u.visma_id::text, u.tel FROM utencvr u WHERE length(u.tel) = 8
  ),
  kand AS (
    SELECT i.cvr, a.company_id AS cid, a.knr, true AS adr, false AS tlf
      FROM inp i JOIN lok_adr a ON a.zip = i.zip AND a.v = i.v AND a.h = i.h
     WHERE i.v IS NOT NULL AND i.h IS NOT NULL
    UNION ALL
    SELECT i.cvr, t.company_id, t.knr, false, true
      FROM inp i JOIN tel_k t ON t.tel = i.tel WHERE length(i.tel) = 8
  ),
  par AS (
    SELECT k.cvr, k.cid, max(k.knr) AS knr, bool_or(k.adr) AS adr, bool_or(k.tlf) AS tlf
    FROM kand k GROUP BY k.cvr, k.cid
  ),
  vurd AS (
    SELECT p.*, similarity(
             btrim(replace(' '||i.nn||' ', ' '||COALESCE(NULLIF(i.byn,''),'#')||' ', ' ')),
             btrim(replace(' '||public.navn_norm(u.name)||' ', ' '||COALESCE(NULLIF(i.byn,''),'#')||' ', ' '))) AS sc,
           EXISTS (
             SELECT 1 FROM unnest(i.ord) w
             WHERE w = ANY(public.navn_ord(u.name))
               AND w <> COALESCE(i.byn,'') AND position(w IN COALESCE(i.v,'')) = 0
           ) AS faelles
    FROM par p JOIN inp i ON i.cvr = p.cvr JOIN utencvr u ON u.id = p.cid
  ),
  usikre AS (
    SELECT v.cvr, v.cid, v.knr, v.sc,
      CASE
        WHEN v.adr AND (v.sc >= 0.4 OR v.faelles) THEN 4
        WHEN v.adr AND v.tlf THEN 5
        WHEN v.tlf AND (v.sc >= 0.4 OR v.faelles) THEN 6
        WHEN v.adr THEN 7
        ELSE 8 END AS pri
    FROM vurd v
  ),
  alle AS (
    SELECT s.cvr, s.pri, s.t, s.cid, s.knr, NULL::real AS sc FROM sikre s
    UNION ALL
    SELECT u.cvr, u.pri, NULL::text, u.cid, u.knr, u.sc FROM usikre u
  )
  SELECT DISTINCT ON (a.cvr) a.cvr,
    COALESCE(a.t, (ARRAY['cvr','parent_cvr','penhed','adresse_navn','adresse_telefon','telefon_navn','adresse','telefon'])[a.pri]),
    a.pri <= 6, a.sc, a.cid, co.name, a.knr, COALESCE(co.ikke_kontakt, false)
  FROM alle a JOIN public.companies co ON co.id = a.cid
  ORDER BY a.cvr, a.pri, (a.t = 'penhed_indirekte'), a.sc DESC NULLS LAST, (a.knr IS NULL);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public._cvr_match_crm_intern(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._cvr_match_crm_intern(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.cvr_match_crm(cvr_rows jsonb)
 RETURNS TABLE(cvr text, match_type text, sikker boolean, score real, company_id uuid, company_name text, kundenr text, ikke_kontakt boolean)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Ingen adgang';
  END IF;
  RETURN QUERY SELECT * FROM public._cvr_match_crm_intern(cvr_rows);
END;
$function$;

-- Intern: status pr. række uden rolletjek og uden log
CREATE OR REPLACE FUNCTION public._kundetjek_vurder(cvr_rows jsonb)
 RETURNS TABLE(cvr text, p_nummer text, status text, saelger_navn text, liste_navn text, company_id uuid, er_nyt_emne boolean, sikker boolean)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH inp AS (
    SELECT r->>'cvr' AS cvr, NULLIF(r->>'p_number','') AS pnr FROM jsonb_array_elements(cvr_rows) r
  ), m AS (SELECT * FROM public._cvr_match_crm_intern(cvr_rows))
  SELECT i.cvr, i.pnr,
    CASE
      WHEN m.company_id IS NULL THEN 'ikke_kunde'
      WHEN m.ikke_kontakt THEN 'ikke_kontakt'
      WHEN c.customer_type IN ('aktiv_kunde','sovende_kunde','servicekunde','tidligere_kunde') AND m.sikker THEN 'kunde'
      WHEN c.customer_type IN ('aktiv_kunde','sovende_kunde','servicekunde','tidligere_kunde') THEN 'mulig_kunde'
      WHEN lst.name IS NOT NULL THEN 'paa_ringeliste'
      ELSE 'ikke_kunde' END,
    CASE WHEN c.customer_type IN ('aktiv_kunde','sovende_kunde','servicekunde','tidligere_kunde') AND NOT m.ikke_kontakt
      THEN (SELECT p.full_name FROM public.profiles p WHERE p.id = c.assigned_to) END,
    CASE WHEN NOT COALESCE(m.ikke_kontakt,false) AND c.customer_type = 'nyt_emne' THEN lst.name END,
    m.company_id, c.customer_type = 'nyt_emne', m.sikker
  FROM inp i
  LEFT JOIN m ON m.cvr = i.cvr
  LEFT JOIN public.companies c ON c.id = m.company_id
  LEFT JOIN LATERAL (
    SELECT l.name FROM public.contact_list_assignments a JOIN public.contact_lists l ON l.id = a.contact_list_id AND l.is_active
    WHERE a.company_id = c.id ORDER BY l.created_at DESC LIMIT 1
  ) lst ON c.customer_type = 'nyt_emne'
$function$;
REVOKE EXECUTE ON FUNCTION public._kundetjek_vurder(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kundetjek_vurder(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public._kundetjek_adgang(_user uuid, _list uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT _user IS NOT NULL AND (public.is_admin(_user)
    OR EXISTS (SELECT 1 FROM public.kontaktliste_ringer WHERE contact_list_id = _list AND user_id = _user))
$function$;
REVOKE EXECUTE ON FUNCTION public._kundetjek_adgang(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._kundetjek_adgang(uuid, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.kundetjek_status(_user uuid, _list uuid, cvr_rows jsonb, _agent_code text DEFAULT NULL)
 RETURNS TABLE(cvr text, p_nummer text, status text, saelger_navn text, liste_navn text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n int := jsonb_array_length(COALESCE(cvr_rows,'[]'::jsonb)); brugt int;
BEGIN
  IF NOT public._kundetjek_adgang(_user, _list) THEN RAISE EXCEPTION 'Ingen adgang' USING ERRCODE='42501'; END IF;
  IF n > 20 THEN RAISE EXCEPTION 'Højst 20 rækker pr. kundetjek'; END IF;
  SELECT count(*) INTO brugt FROM public.kundetjek_log k WHERE k.user_id = _user AND k.created_at > now() - interval '24 hours';
  IF brugt + n > 300 THEN RAISE EXCEPTION 'Dagsgrænse for kundetjek nået'; END IF;
  RETURN QUERY
  WITH v AS MATERIALIZED (SELECT * FROM public._kundetjek_vurder(cvr_rows)),
  lg AS (INSERT INTO public.kundetjek_log(user_id, agent_code, contact_list_id, cvr, p_nummer, status)
         SELECT _user, _agent_code, _list, v.cvr, v.p_nummer, v.status FROM v RETURNING 1)
  SELECT v.cvr, v.p_nummer, v.status, v.saelger_navn, v.liste_navn FROM v, (SELECT count(*) FROM lg) x;
END $function$;
REVOKE EXECUTE ON FUNCTION public.kundetjek_status(uuid, uuid, jsonb, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kundetjek_status(uuid, uuid, jsonb, text) TO service_role;

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
  IF v.company_id IS NOT NULL AND v.er_nyt_emne AND v.sikker THEN
    cid := v.company_id;
  ELSE
    INSERT INTO public.companies(cvr, name, address, zip, city, municipality, phone, email, website, industry, main_branch_text, employees,
      customer_type, sources, source_created_by, source_updated_at)
    VALUES (_row->>'cvr', _row->>'name', _row->>'address', _row->>'zip', _row->>'city', _row->>'municipality', _row->>'phone',
      _row->>'email', _row->>'website', _row->>'industry', _row->>'industry', NULLIF(_row->>'employees','')::int,
      'nyt_emne', ARRAY['cvr'], _user, now())
    RETURNING id INTO cid;
  END IF;
  SELECT a.assigned_to INTO saelger FROM public.contact_list_assignments a
   WHERE a.contact_list_id = _list AND a.assigned_to IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1;
  INSERT INTO public.contact_list_assignments(contact_list_id, company_id, assigned_to, status, tilfoejet_af_ringer, tilfoejet_agent_code)
  VALUES (_list, cid, saelger, 'ny', true, _agent_code)
  ON CONFLICT (contact_list_id, company_id) DO NOTHING;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Ligger allerede på listen'; END IF;
  RETURN jsonb_build_object('ok', true, 'navn', _row->>'name', '_cid', cid);
END $function$;
REVOKE EXECUTE ON FUNCTION public.tm_tilfoej_emne(uuid, uuid, jsonb, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tm_tilfoej_emne(uuid, uuid, jsonb, text) TO service_role;

CREATE OR REPLACE FUNCTION public.tm_virksomheder(_list uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.tm_er_ringer(_list) OR public.is_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Ingen adgang til listen' USING ERRCODE = '42501';
  END IF;
  RETURN jsonb_build_object(
    'liste', (SELECT jsonb_build_object('id', l.id, 'navn', l.name, 'manus', coalesce(l.purpose, l.description),
       'moede_saelger', (SELECT p.full_name FROM public.profiles p WHERE p.id = l.moede_saelger_user_id),
       'moede_modtager', l.moede_modtager) FROM public.contact_lists l WHERE l.id = _list),
    'virksomheder', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'assignment_id', a.id, 'status', a.status, 'status_aarsag', a.status_aarsag, 'antal_forsoeg', a.antal_forsoeg, 'next_followup_date', a.next_followup_date,
      'tilfoejet_af_ringer', a.tilfoejet_af_ringer, 'tilfoejet_agent_code', a.tilfoejet_agent_code, 'tilfoejet_at', a.created_at,
      'company_id', c.id, 'navn', c.name, 'cvr', c.cvr, 'adresse', c.address, 'postnr', c.zip, 'by', c.city,
      'telefon', c.phone, 'email', c.email, 'hjemmeside', c.website, 'branche', coalesce(c.main_branch_text, c.industry), 'ansatte', c.employees,
      'moede_saelger', (SELECT p.full_name FROM public.profiles p WHERE p.id = public.tm_moede_saelger(_list, c.id)),
      'kontakter', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', k.id, 'navn', k.name, 'titel', k.title, 'telefon', k.phone, 'email', k.email) ORDER BY k.is_primary DESC NULLS LAST, k.name), '[]'::jsonb) FROM public.contacts k WHERE k.company_id = c.id),
      'opkald', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'at', o.created_at, 'agent_code', o.agent_code, 'udfald', o.udfald, 'aarsag', o.aarsag, 'note', o.note, 'ring_igen_at', o.ring_igen_at, 'moede_at', o.moede_at, 'bruger', (SELECT p.full_name FROM public.profiles p WHERE p.id = o.user_id)) ORDER BY o.created_at DESC, o.id DESC), '[]'::jsonb) FROM public.kontaktliste_opkald o WHERE o.contact_list_id = _list AND o.company_id = c.id)
    ) ORDER BY a.tilfoejet_af_ringer DESC, a.created_at DESC), '[]'::jsonb)
    FROM public.contact_list_assignments a JOIN public.companies c ON c.id = a.company_id
    WHERE a.contact_list_id = _list AND NOT c.ikke_kontakt));
END $function$;