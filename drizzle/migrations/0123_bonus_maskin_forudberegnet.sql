CREATE TABLE public.bonus_maskin_maaned (user_id uuid NOT NULL, maaned date NOT NULL, grundlag jsonb NOT NULL DEFAULT '[]', detaljer jsonb NOT NULL DEFAULT '[]', opdateret_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,maaned));
GRANT SELECT ON public.bonus_maskin_maaned TO authenticated;
GRANT ALL ON public.bonus_maskin_maaned TO service_role;
ALTER TABLE public.bonus_maskin_maaned ENABLE ROW LEVEL SECURITY;
CREATE POLICY bonus_maskin_maaned_laes ON public.bonus_maskin_maaned FOR SELECT TO authenticated USING (public.maalepunkt_adgang(user_id));
CREATE POLICY tm_spaerret ON public.bonus_maskin_maaned AS RESTRICTIVE FOR ALL TO authenticated USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));
DO $setup$ DECLARE f text; cols text; BEGIN
 f := pg_get_functiondef('public.bonus_maskin_grundlag(uuid,date,date)'::regprocedure);
 EXECUTE replace(f,'FUNCTION public.bonus_maskin_grundlag(','FUNCTION public._bonus_maskin_beregn(');
 cols := pg_get_function_result('public.bonus_maskin_grundlag(uuid,date,date)'::regprocedure);
 EXECUTE 'CREATE TYPE public.bonus_maskin_grundlag_row AS (' || substring(cols FROM 7 FOR length(cols)-7) || ')';
 cols := pg_get_function_result('public.bonus_maskin_detaljer(uuid,date,date)'::regprocedure);
 EXECUTE 'CREATE TYPE public.bonus_maskin_detalje_row AS (' || substring(cols FROM 7 FOR length(cols)-7) || ')';
END $setup$;
REVOKE ALL ON FUNCTION public._bonus_maskin_beregn(uuid,date,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._bonus_maskin_beregn(uuid,date,date) TO service_role;
CREATE FUNCTION public._bonus_maskin_refresh(_saelger uuid, _maaned date) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE m date := date_trunc('month',_maaned)::date; g jsonb; d jsonb;
BEGIN
 SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]') INTO g FROM public._bonus_maskin_beregn(_saelger,m,m) x;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.faktura_dato),'[]') INTO d FROM (
 SELECT r.company_id,r.navn,r.by,r.model,r.maerke,r.kilde,r.brugt,r.antal,r.faktura_dato,r.beloeb,r.serienr,r.bonusklasse,r.udeladt,r.aarsag,r.status,r.vurdering,r.brugt_kilde,r.forgaenger_serienr,r.forgaenger_dato,r.godkendt,
 CASE WHEN r.status <> 'bonus' THEN 0::numeric WHEN r.brugt THEN coalesce(o.bonus_brugt,0) ELSE CASE r.bonusklasse WHEN 'wittenborg' THEN coalesce(o.bonus_wittenborg,0) WHEN 'animo' THEN coalesce(o.bonus_animo,0) WHEN 'rex' THEN coalesce(o.bonus_rex,0) WHEN 'kalerm' THEN coalesce(o.bonus_kalerm,0) WHEN 'espresso' THEN coalesce(o.bonus_espresso,0) ELSE 0 END END AS sats,r.maaned
 FROM jsonb_populate_recordset(NULL::public.bonus_maskin_grundlag_row,g) r
 LEFT JOIN LATERAL (SELECT b.* FROM public.bonus_ordning b WHERE b.user_id=_saelger AND b.gyldig_fra<=r.maaned AND (b.gyldig_til IS NULL OR b.gyldig_til>=r.maaned) ORDER BY b.gyldig_fra DESC LIMIT 1) o ON true
 WHERE ((r.kategori='privat' AND coalesce(o.maskin_privat,false)) OR (r.kategori='offentlig' AND coalesce(o.maskin_offentlig,false))) AND ((r.kilde='salg' AND coalesce(o.maskin_salg,false)) OR (r.kilde='leje' AND coalesce(o.maskin_leje,false))) AND (NOT r.brugt OR coalesce(o.maskin_brugt,false))
 ) x;
 INSERT INTO public.bonus_maskin_maaned(user_id,maaned,grundlag,detaljer) VALUES (_saelger,m,g,d) ON CONFLICT(user_id,maaned) DO UPDATE SET grundlag=excluded.grundlag,detaljer=excluded.detaljer,opdateret_at=now();
END $$;
REVOKE ALL ON FUNCTION public._bonus_maskin_refresh(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._bonus_maskin_refresh(uuid,date) TO service_role;
CREATE FUNCTION public.bonus_maskin_genberegn() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='0' AS $$
DECLARE k record; n integer:=0; old_claim text := current_setting('request.jwt.claim.sub',true); adm uuid;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin'; END IF;
 SELECT r.user_id INTO adm FROM public.user_roles r WHERE r.role='admin' LIMIT 1;
 IF adm IS NULL THEN RAISE EXCEPTION 'Ingen administrator til vedligeholdelse'; END IF;
 PERFORM set_config('request.jwt.claim.sub',adm::text,true);
 FOR k IN SELECT DISTINCT o.user_id,m::date AS maaned FROM public.bonus_ordning o CROSS JOIN LATERAL generate_series(date_trunc('month',o.gyldig_fra),date_trunc('month',least(coalesce(o.gyldig_til,current_date),current_date)),interval '1 month') m UNION SELECT user_id,maaned FROM public.bonus_maskin_maaned LOOP
 PERFORM public._bonus_maskin_refresh(k.user_id,k.maaned); n:=n+1;
 END LOOP;
 PERFORM set_config('request.jwt.claim.sub',coalesce(old_claim,''),true); RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.bonus_maskin_genberegn() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bonus_maskin_genberegn() TO authenticated,service_role;
DO $readers$ DECLARE f text; header text; BEGIN
 f:=pg_get_functiondef('public.bonus_maskin_grundlag(uuid,date,date)'::regprocedure); header:=substring(f FROM 1 FOR position('AS $function$' IN f)-1);
 EXECUTE header || $body$AS $function$
 SELECT r.* FROM public.bonus_maskin_maaned c CROSS JOIN LATERAL jsonb_populate_recordset(NULL::public.bonus_maskin_grundlag_row,c.grundlag) r WHERE c.user_id=_saelger AND c.maaned BETWEEN date_trunc('month',_fra)::date AND date_trunc('month',_til)::date AND public.maalepunkt_adgang(_saelger)
 $function$;$body$;
 f:=pg_get_functiondef('public.bonus_maskin_detaljer(uuid,date,date)'::regprocedure); header:=substring(f FROM 1 FOR position('AS $function$' IN f)-1);
 EXECUTE header || $body$AS $function$
 BEGIN
 IF NOT public.maalepunkt_adgang(_saelger) THEN RAISE EXCEPTION 'Ingen adgang til denne bonusopgørelse'; END IF;
 RETURN QUERY SELECT r.* FROM (SELECT c.maaned,c.detaljer FROM public.bonus_maskin_maaned c WHERE c.user_id=_saelger UNION ALL SELECT l.maaned,'[]'::jsonb FROM public.bonus_laas l WHERE l.user_id=_saelger AND NOT EXISTS(SELECT 1 FROM public.bonus_maskin_maaned c WHERE c.user_id=l.user_id AND c.maaned=l.maaned)) c
 LEFT JOIN public.bonus_laas l ON l.user_id=_saelger AND l.maaned=c.maaned
 CROSS JOIN LATERAL jsonb_populate_recordset(NULL::public.bonus_maskin_detalje_row,CASE WHEN l.user_id IS NOT NULL THEN l.maskiner ELSE c.detaljer END) r
 WHERE c.maaned BETWEEN date_trunc('month',_fra)::date AND date_trunc('month',_til)::date ORDER BY r.faktura_dato;
 END $function$;$body$;
END $readers$;
CREATE FUNCTION public.bonus_maskin_afregning(_maaned date) RETURNS TABLE(user_id uuid,navn text,raekker jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin'; END IF;
 RETURN QUERY SELECT s.user_id,s.navn,CASE WHEN l.user_id IS NOT NULL THEN l.maskiner ELSE coalesce(c.detaljer,'[]'::jsonb) END FROM public.bonus_afregning_saelgere(_maaned) s LEFT JOIN public.bonus_maskin_maaned c ON c.user_id=s.user_id AND c.maaned=date_trunc('month',_maaned)::date LEFT JOIN public.bonus_laas l ON l.user_id=s.user_id AND l.maaned=date_trunc('month',_maaned)::date;
END $$;
REVOKE ALL ON FUNCTION public.bonus_maskin_afregning(date) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.bonus_maskin_afregning(date) TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.bonus_maskin_advarsler(_maaned date) RETURNS TABLE(user_id uuid,navn text,uklassificeret integer,til_vurdering integer) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Kun admin'; END IF;
 RETURN QUERY SELECT s.user_id,s.navn,count(*) FILTER(WHERE r.bonusklasse IS NULL AND r.status='vurdering')::int,count(*) FILTER(WHERE r.bonusklasse IS NOT NULL AND r.status='vurdering')::int FROM public.bonus_maskin_afregning(_maaned) s LEFT JOIN LATERAL jsonb_populate_recordset(NULL::public.bonus_maskin_detalje_row,s.raekker) r ON true GROUP BY s.user_id,s.navn;
END $$;
-- Additive backfill preserves complete current seller/month rows. Auth is set locally for the existing access-checked calculator.
DO $backfill$ DECLARE adm uuid; k record; BEGIN
 SELECT user_id INTO adm FROM public.user_roles WHERE role='admin' LIMIT 1;
 PERFORM set_config('request.jwt.claim.sub',adm::text,true);
 FOR k IN SELECT DISTINCT o.user_id,m::date AS maaned FROM public.bonus_ordning o CROSS JOIN LATERAL generate_series(date_trunc('month',o.gyldig_fra),date_trunc('month',least(coalesce(o.gyldig_til,current_date),current_date)),interval '1 month') m LOOP PERFORM public._bonus_maskin_refresh(k.user_id,k.maaned); END LOOP;
END $backfill$;