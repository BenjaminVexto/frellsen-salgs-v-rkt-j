-- Run through the database query tool. All writes are rolled back.
BEGIN;
SELECT set_config('request.jwt.claim.sub','0ee22ee0-3cf8-4c14-b4b0-9c4d1ab66daf',true);
DO $$ DECLARE before_rows jsonb; after_rows jsonb; BEGIN
 SELECT detaljer INTO before_rows FROM public.bonus_maskin_maaned WHERE user_id='ae780e09-79d4-45b4-abda-9dd6040138cd' AND maaned='2026-09-01';
 INSERT INTO public.bonus_maskin_vurdering(user_id,maaned,serienr,ny_brugt,aarsag) VALUES ('ae780e09-79d4-45b4-abda-9dd6040138cd','2026-09-01','50220383','brugt','Rollback test');
 SELECT detaljer INTO after_rows FROM public.bonus_maskin_maaned WHERE user_id='ae780e09-79d4-45b4-abda-9dd6040138cd' AND maaned='2026-09-01';
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(after_rows) r WHERE r->>'serienr'='50220383' AND r->>'sats'='250' AND r->>'brugt_kilde'='admin') THEN RAISE EXCEPTION 'Assessment refresh failed'; END IF;
 DELETE FROM public.bonus_maskin_vurdering WHERE user_id='ae780e09-79d4-45b4-abda-9dd6040138cd' AND maaned='2026-09-01' AND serienr='50220383';
 SELECT detaljer INTO after_rows FROM public.bonus_maskin_maaned WHERE user_id='ae780e09-79d4-45b4-abda-9dd6040138cd' AND maaned='2026-09-01';
 IF before_rows IS DISTINCT FROM after_rows THEN RAISE EXCEPTION 'Delete refresh failed'; END IF;
 UPDATE public.maskin_haendelser SET maskin_type=maskin_type WHERE serienr='50220383';
 IF NOT EXISTS(SELECT 1 FROM public.bonus_maskin_refresh_ko WHERE user_id='ae780e09-79d4-45b4-abda-9dd6040138cd' AND maaned='2026-09-01') THEN RAISE EXCEPTION 'Source refresh not queued'; END IF;
 PERFORM public.bonus_maskin_opdater_ko(1000);
 IF EXISTS(SELECT 1 FROM public.bonus_maskin_refresh_ko) THEN RAISE EXCEPTION 'Queue not drained'; END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='bonus-maskin-refresh') THEN RAISE EXCEPTION 'Retries not disarmed'; END IF;
END $$;
ROLLBACK;