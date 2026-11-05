ALTER TABLE public.kontaktliste_opkald ADD COLUMN agent_code text CHECK (agent_code IN ('A','B','C','D','E','F','G','H'));
COMMENT ON COLUMN public.kontaktliste_opkald.agent_code IS 'Agent A–H på udfaldet; eksisterende registreringer forbliver null.';
DO $migration$
DECLARE d text;
BEGIN
 SELECT pg_get_functiondef('public.registrer_udfald(uuid,uuid,text,text,text,timestamptz,timestamptz,uuid,text,text,text)'::regprocedure) INTO d;
 d := replace(d,'public.registrer_udfald(_list uuid','public.registrer_udfald(_agent_code text, _list uuid');
 d := replace(d,'  -- Fri note:', E'  IF _agent_code IS NOT NULL AND _agent_code NOT IN (''A'',''B'',''C'',''D'',''E'',''F'',''G'',''H'') THEN RAISE EXCEPTION ''Agent skal være A–H''; END IF;\n  IF v_rolle = ''telemarketing'' AND _agent_code IS NULL THEN RAISE EXCEPTION ''Vælg agent A–H, før du gemmer''; END IF;\n  -- Fri note:');
 d := replace(d,'rolle, udfald, note)', 'rolle, udfald, note, agent_code)');
 d := replace(d,'v_rolle, ''note'', trim(_note))', 'v_rolle, ''note'', trim(_note), _agent_code)');
 d := replace(d,'moede_saelger_user_id, activity_id)', 'moede_saelger_user_id, activity_id, agent_code)');
 d := replace(d,'_contact_id, v_saelger, v_act)', '_contact_id, v_saelger, v_act, _agent_code)');
 d := replace(d, ' || E''\n'' || _note', ' || CASE WHEN _agent_code IS NOT NULL THEN '' · Agent '' || _agent_code ELSE '''' END || E''\n'' || _note');
 EXECUTE d;
 SELECT pg_get_functiondef('public._opkald_til_aktivitet()'::regprocedure) INTO d;
 d := replace(d,'  IF NEW.activity_id', E'  IF public.er_telemarketing() AND NEW.agent_code IS NULL THEN RAISE EXCEPTION ''Vælg agent A–H, før du gemmer''; END IF;\n  IF NEW.activity_id');
 d := replace(d,'public._udfald_tekst(NEW.udfald, NEW.aarsag, NEW.note),', 'public._udfald_tekst(NEW.udfald, NEW.aarsag, NEW.note) || CASE WHEN NEW.agent_code IS NOT NULL THEN '' · Agent '' || NEW.agent_code ELSE '''' END,');
 EXECUTE d;
 SELECT pg_get_functiondef('public.tm_virksomheder(uuid)'::regprocedure) INTO d;
 d := replace(d,'''udfald'', o.udfald', '''agent_code'', o.agent_code, ''udfald'', o.udfald');
 d := replace(d,'ORDER BY o.created_at DESC)', 'ORDER BY o.created_at DESC, o.id DESC)');
 EXECUTE d;
 SELECT pg_get_functiondef('public.tm_seneste_aktivitet(uuid)'::regprocedure) INTO d;
 d := replace(d,'''at'', x.udfoert_at', '''agent_code'', (SELECT o.agent_code FROM public.kontaktliste_opkald o WHERE o.contact_list_id=_list AND o.company_id=x.company_id AND o.udfald<>''note'' ORDER BY o.created_at DESC,o.id DESC LIMIT 1), ''at'', x.udfoert_at');
 EXECUTE d;
 SELECT pg_get_functiondef('public.tm_virksomhed_historik(uuid,uuid,integer)'::regprocedure) INTO d;
 d := replace(d,'''id'',e.id', '''agent_code'',(SELECT o.agent_code FROM public.kontaktliste_opkald o WHERE ''a:''||o.activity_id=e.id LIMIT 1),''id'',e.id');
 EXECUTE d;
END $migration$;
REVOKE ALL ON FUNCTION public.registrer_udfald(text,uuid,uuid,text,text,text,timestamptz,timestamptz,uuid,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.registrer_udfald(text,uuid,uuid,text,text,text,timestamptz,timestamptz,uuid,text,text,text) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.registrer_udfald(_list uuid, _company uuid, _udfald text, _aarsag text DEFAULT NULL, _note text DEFAULT NULL, _ring_igen_at timestamptz DEFAULT NULL, _moede_at timestamptz DEFAULT NULL, _contact_id uuid DEFAULT NULL, _kontakt_titel text DEFAULT NULL, _kontakt_telefon text DEFAULT NULL, _kontakt_email text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public AS $function$
SELECT public.registrer_udfald(NULL::text,_list,_company,_udfald,_aarsag,_note,_ring_igen_at,_moede_at,_contact_id,_kontakt_titel,_kontakt_telefon,_kontakt_email)
$function$;