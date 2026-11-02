CREATE OR REPLACE FUNCTION public._tm_company_events(_company uuid)
RETURNS TABLE(id text, at timestamptz, type text, bruger text, user_id uuid, note text, list_id uuid, kilde text, udfald text, aarsag text, ring_igen_at timestamptz, moede_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $fn$
 SELECT 'a:'||a.id, a.udfoert_at, a.activity_type::text, p.full_name, a.created_by, a.note,
 coalesce(o.contact_list_id,cla.contact_list_id), CASE WHEN coalesce(o.contact_list_id,cla.contact_list_id) IS NOT NULL THEN 'ringeliste' ELSE 'aktivitet' END,
 o.udfald,o.aarsag,o.ring_igen_at,o.moede_at
 FROM public.activities a LEFT JOIN public.profiles p ON p.id=a.created_by
 LEFT JOIN public.kontaktliste_opkald o ON o.activity_id=a.id
 LEFT JOIN public.contact_list_assignments cla ON cla.id=a.contact_list_assignment_id
 WHERE a.company_id=_company
 UNION ALL
 SELECT 'c:'||ca.id,ca.created_at,'konkurrentaftale',p.full_name,ca.registered_by,
 concat_ws(' · ',c.name,CASE WHEN ca.contract_expires_at IS NOT NULL THEN 'udløber '||to_char(ca.contract_expires_at,'DD.MM.YYYY') END,ca.notes),
 NULL::uuid,'konkurrentaftale',NULL::text,NULL::text,NULL::timestamptz,NULL::timestamptz
 FROM public.competitor_assignments ca JOIN public.competitors c ON c.id=ca.competitor_id LEFT JOIN public.profiles p ON p.id=ca.registered_by WHERE ca.company_id=_company
 UNION ALL
 SELECT 'q:'||q.id,coalesce(q.sent_date::timestamp AT TIME ZONE 'Europe/Copenhagen',q.created_at),'tilbud_sendt',p.full_name,q.created_by,
 'Tilbud '||coalesce(q.quote_number,''),NULL::uuid,'tilbud',NULL::text,NULL::text,NULL::timestamptz,NULL::timestamptz
 FROM public.quotes q LEFT JOIN public.profiles p ON p.id=q.created_by
 WHERE q.company_id=_company AND q.status<>'kladde'
 AND NOT EXISTS(SELECT 1 FROM public.activities a WHERE a.company_id=q.company_id AND a.activity_type='tilbud_sendt' AND a.created_by=q.created_by
 AND (a.udfoert_at AT TIME ZONE 'Europe/Copenhagen')::date=coalesce(q.sent_date,(q.created_at AT TIME ZONE 'Europe/Copenhagen')::date));
$fn$;
REVOKE ALL ON FUNCTION public._tm_company_events(uuid) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tm_saelger_overblik(_list uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
 IF auth.uid() IS NULL OR (public.er_telemarketing() AND NOT public.tm_er_ringer(_list)) OR (NOT public.er_telemarketing() AND NOT (public.tm_er_ringer(_list) OR public.is_admin(auth.uid()))) THEN
 RAISE EXCEPTION 'Ingen adgang til listen' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_object_agg(c.id,jsonb_build_object(
 'seneste_saelger',(SELECT jsonb_build_object('at',e.at,'type',e.type,'bruger',e.bruger) FROM public._tm_company_events(c.id) e
 WHERE e.user_id IS NOT NULL AND e.type IN ('besøg','møde','teams_møde','tilbud_sendt','konkurrentaftale') AND e.at<=now()
 AND NOT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=e.user_id AND ur.role='telemarketing') ORDER BY e.at DESC,e.id DESC LIMIT 1),
 'aftaler',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',ca.id,'konkurrent',co.name,'udloeb',ca.contract_expires_at,'note',ca.notes) ORDER BY ca.created_at DESC),'[]'::jsonb)
 FROM public.competitor_assignments ca JOIN public.competitors co ON co.id=ca.competitor_id WHERE ca.company_id=c.id AND ca.afsluttet_dato IS NULL)
 )) FROM public.contact_list_assignments cla JOIN public.companies c ON c.id=cla.company_id WHERE cla.contact_list_id=_list AND NOT c.ikke_kontakt),'{}'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.tm_saelger_overblik(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tm_saelger_overblik(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.tm_virksomhed_historik(_list uuid,_company uuid,_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $fn$
BEGIN
 IF auth.uid() IS NULL OR (public.er_telemarketing() AND NOT public.tm_er_ringer(_list)) OR (NOT public.er_telemarketing() AND NOT (public.tm_er_ringer(_list) OR public.is_admin(auth.uid())))
 OR NOT EXISTS(SELECT 1 FROM public.contact_list_assignments cla JOIN public.companies c ON c.id=cla.company_id WHERE cla.contact_list_id=_list AND cla.company_id=_company AND NOT c.ikke_kontakt) THEN
 RAISE EXCEPTION 'Ingen adgang til virksomheden på listen' USING ERRCODE='42501'; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'at',e.at,'type',e.type,'bruger',e.bruger,'note',e.note,'denne_liste',coalesce(e.list_id=_list,false),'kilde',e.kilde,'udfald',e.udfald,'aarsag',e.aarsag,'ring_igen_at',e.ring_igen_at,'moede_at',e.moede_at) ORDER BY e.at DESC,e.id DESC)
 FROM (SELECT * FROM public._tm_company_events(_company) ORDER BY at DESC,id DESC LIMIT 50 OFFSET greatest(0,_offset)) e),'[]'::jsonb);
END $fn$;
REVOKE ALL ON FUNCTION public.tm_virksomhed_historik(uuid,uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.tm_virksomhed_historik(uuid,uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.tm_pre_request()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE p text:=coalesce(current_setting('request.path',true),'');
BEGIN
 IF p LIKE '/rpc/%' AND public.er_telemarketing() AND split_part(substr(p,6),'?',1) NOT IN ('tm_virksomheder','tm_registrer_opkald','registrer_udfald','tm_gem_kontakt','tm_er_ringer','tm_seneste_aktivitet','tm_saelger_overblik','tm_virksomhed_historik','er_telemarketing','has_role','is_admin','my_afdelinger') THEN
 RAISE EXCEPTION 'Ingen adgang' USING ERRCODE='42501'; END IF;
END $fn$;