CREATE FUNCTION public._bonus_maskin_afsluttet_maaned() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE m date:=(date_trunc('month',current_date)-interval '1 month')::date;
BEGIN
 INSERT INTO public.bonus_maskin_refresh_ko(user_id,maaned) SELECT DISTINCT o.user_id,m FROM public.bonus_ordning o WHERE o.gyldig_fra<=m AND (o.gyldig_til IS NULL OR o.gyldig_til>=m) ON CONFLICT DO NOTHING;
 PERFORM public.bonus_maskin_opdater_ko(1000);
END $$;
REVOKE ALL ON FUNCTION public._bonus_maskin_afsluttet_maaned() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public._bonus_maskin_afsluttet_maaned() TO service_role;
SELECT cron.schedule('bonus-maskin-maanedsskifte','5 0 1 * *','SELECT public._bonus_maskin_afsluttet_maaned()');