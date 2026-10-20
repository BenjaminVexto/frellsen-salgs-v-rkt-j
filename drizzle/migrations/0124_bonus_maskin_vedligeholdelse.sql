-- lovable-cron-fallback-reviewed: queue wakes on enqueue; minute retries are armed only while pending keys exist and unscheduled after drain. Import completion also drains directly.
CREATE TABLE public.bonus_maskin_refresh_ko (user_id uuid NOT NULL, maaned date NOT NULL, oprettet_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,maaned));
GRANT SELECT ON public.bonus_maskin_refresh_ko TO authenticated;
GRANT ALL ON public.bonus_maskin_refresh_ko TO service_role;
ALTER TABLE public.bonus_maskin_refresh_ko ENABLE ROW LEVEL SECURITY;
CREATE POLICY bonus_refresh_admin ON public.bonus_maskin_refresh_ko FOR SELECT TO authenticated USING(public.is_admin(auth.uid()));
CREATE POLICY tm_spaerret ON public.bonus_maskin_refresh_ko AS RESTRICTIVE FOR ALL TO authenticated USING(NOT (SELECT public.er_telemarketing())) WITH CHECK(NOT (SELECT public.er_telemarketing()));
CREATE FUNCTION public._bonus_maskin_source_changed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE rows jsonb:='[]'; sn text[]; lev text[]; orders text[];
BEGIN
 IF TG_OP<>'DELETE' THEN EXECUTE 'SELECT coalesce(jsonb_agg(to_jsonb(n)),''[]''::jsonb) FROM new_rows n' INTO rows; END IF;
 IF TG_OP<>'INSERT' THEN EXECUTE 'SELECT $1 || coalesce(jsonb_agg(to_jsonb(o)),''[]''::jsonb) FROM old_rows o' INTO rows USING rows; END IF;
 IF jsonb_array_length(rows)=0 THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME='invoice_lines' THEN
 SELECT array_agg(DISTINCT r->>'ordre_nr'),array_agg(DISTINCT r->>'visma_delivery_no') INTO orders,lev FROM jsonb_array_elements(rows) r WHERE r->>'afdeling_nr'='11' AND r->>'varegruppe_1'='16';
 IF orders IS NULL AND lev IS NULL THEN RETURN NULL; END IF;
 SELECT array_agg(DISTINCT btrim(split_part(il.varetekst,':',2))) INTO sn FROM public.invoice_lines il WHERE il.afdeling_nr=11 AND il.ordre_nr=ANY(orders) AND il.varegruppe_2='83' AND il.varetekst ILIKE 'serienr%';
 SELECT coalesce(sn,'{}') || coalesce(array_agg(DISTINCT btrim(split_part(r->>'varetekst',':',2))),'{}') INTO sn FROM jsonb_array_elements(rows) r WHERE r->>'varegruppe_2'='83';
 ELSIF TG_TABLE_NAME IN ('machines','maskin_haendelser') THEN
 SELECT array_agg(DISTINCT r->>'serienr'),array_agg(DISTINCT r->>'lev_kundenr') INTO sn,lev FROM jsonb_array_elements(rows) r;
 ELSE
 INSERT INTO public.bonus_maskin_refresh_ko(user_id,maaned) SELECT user_id,maaned FROM public.bonus_maskin_maaned ON CONFLICT DO NOTHING;
 INSERT INTO public.bonus_maskin_refresh_ko(user_id,maaned)
 SELECT DISTINCT o.user_id,m::date FROM public.bonus_ordning o CROSS JOIN LATERAL generate_series(date_trunc('month',o.gyldig_fra),date_trunc('month',least(coalesce(o.gyldig_til,current_date),current_date)),interval '1 month') m ON CONFLICT DO NOTHING;
 RETURN NULL;
 END IF;
 INSERT INTO public.bonus_maskin_refresh_ko(user_id,maaned)
 SELECT DISTINCT c.user_id,c.maaned FROM public.bonus_maskin_maaned c CROSS JOIN LATERAL jsonb_populate_recordset(NULL::public.bonus_maskin_grundlag_row,c.grundlag) g WHERE g.serienr=ANY(sn) OR g.lev_kundenr=ANY(lev) ON CONFLICT DO NOTHING;
 INSERT INTO public.bonus_maskin_refresh_ko(user_id,maaned)
 SELECT DISTINCT o.user_id,date_trunc('month',d)::date FROM (
 SELECT h.serienr,h.lev_kundenr,h.company_id,h.kobt_dato,h.lease_leje_dato FROM public.maskin_haendelser h WHERE h.serienr=ANY(sn) OR h.lev_kundenr=ANY(lev)
 UNION ALL SELECT m.serienr,m.lev_kundenr,NULL::uuid,m.kobt_dato,m.lease_leje_dato FROM public.machines m WHERE m.afdeling_nr=11 AND (m.serienr=ANY(sn) OR m.lev_kundenr=ANY(lev))
 ) e LEFT JOIN public.locations l ON l.visma_delivery_no=e.lev_kundenr AND l.afdeling_nr=11 LEFT JOIN public.companies c ON c.id=coalesce(e.company_id,l.company_id)
 JOIN public.bonus_ordning o ON o.user_id=CASE WHEN l.id IS NOT NULL THEN l.saelger_user_id ELSE c.assigned_to END
 CROSS JOIN LATERAL (VALUES(e.kobt_dato),(e.lease_leje_dato)) v(d)
 WHERE d IS NOT NULL AND d<=current_date AND date_trunc('month',d)::date>=date_trunc('month',o.gyldig_fra)::date AND (o.gyldig_til IS NULL OR date_trunc('month',d)::date<=o.gyldig_til) ON CONFLICT DO NOTHING;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._bonus_maskin_source_changed() FROM PUBLIC,anon,authenticated;
DO $triggers$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['invoice_lines','machines','maskin_haendelser','products','locations','companies','bonus_ordning'] LOOP
 EXECUTE format('CREATE TRIGGER bonus_cache_insert AFTER INSERT ON public.%I REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public._bonus_maskin_source_changed()',t);
 EXECUTE format('CREATE TRIGGER bonus_cache_update AFTER UPDATE ON public.%I REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public._bonus_maskin_source_changed()',t);
 EXECUTE format('CREATE TRIGGER bonus_cache_delete AFTER DELETE ON public.%I REFERENCING OLD TABLE AS old_rows FOR EACH STATEMENT EXECUTE FUNCTION public._bonus_maskin_source_changed()',t);
 END LOOP;
END $triggers$;
CREATE FUNCTION public.bonus_maskin_opdater_ko(_maks integer DEFAULT 100) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE k record; n integer:=0; adm uuid; old_claim text:=current_setting('request.jwt.claim.sub',true);
BEGIN
 IF auth.uid() IS NOT NULL AND auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('bonus-maskin-ko'));
 SELECT user_id INTO adm FROM public.user_roles WHERE role='admin' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',adm::text,true);
 FOR k IN SELECT q.* FROM public.bonus_maskin_refresh_ko q ORDER BY q.oprettet_at LIMIT greatest(1,_maks) FOR UPDATE SKIP LOCKED LOOP
 PERFORM public._bonus_maskin_refresh(k.user_id,k.maaned);
 DELETE FROM public.bonus_maskin_refresh_ko WHERE user_id=k.user_id AND maaned=k.maaned; n:=n+1;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM public.bonus_maskin_refresh_ko) THEN PERFORM cron.unschedule(j.jobid) FROM cron.job j WHERE j.jobname='bonus-maskin-refresh'; END IF;
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_claim,''),true); RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bonus_maskin_opdater_ko(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bonus_maskin_opdater_ko(integer) TO authenticated,service_role;
CREATE FUNCTION public._bonus_maskin_wake() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.bonus_maskin_refresh_ko) THEN
 PERFORM pg_advisory_xact_lock(hashtext('bonus-maskin-ko'));
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='bonus-maskin-refresh') THEN PERFORM cron.schedule('bonus-maskin-refresh','* * * * *','SELECT public.bonus_maskin_opdater_ko(20)'); END IF;
 END IF; RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._bonus_maskin_wake() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER bonus_maskin_wake AFTER INSERT ON public.bonus_maskin_refresh_ko FOR EACH STATEMENT EXECUTE FUNCTION public._bonus_maskin_wake();
CREATE FUNCTION public._bonus_maskin_vurdering_refresh() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.bonus_maskin_vurdering;
BEGIN
 r:=CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
 PERFORM public._bonus_maskin_refresh(r.user_id,r.maaned);
 IF TG_OP='UPDATE' AND (OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.maaned IS DISTINCT FROM NEW.maaned) THEN PERFORM public._bonus_maskin_refresh(OLD.user_id,OLD.maaned); END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public._bonus_maskin_vurdering_refresh() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER bonus_maskin_vurdering_refresh AFTER INSERT OR UPDATE OR DELETE ON public.bonus_maskin_vurdering FOR EACH ROW EXECUTE FUNCTION public._bonus_maskin_vurdering_refresh();