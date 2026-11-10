CREATE OR REPLACE FUNCTION public.kundestatus(_last_cons date, _last_any date, _has_eq boolean, _ref date DEFAULT NULL::date)
RETURNS public.customer_type LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
WITH r AS (SELECT coalesce(date_trunc('month', _ref)::date, (date_trunc('month', current_date) - interval '1 month')::date) AS ref)
SELECT CASE
 WHEN _last_cons IS NOT NULL AND date_trunc('month', _last_cons) >= r.ref - interval '5 months' THEN 'aktiv_kunde'::public.customer_type
 WHEN _last_cons IS NOT NULL AND date_trunc('month', _last_cons) >= r.ref - interval '11 months' THEN 'sovende_kunde'::public.customer_type
 WHEN coalesce(_has_eq, false) AND _last_any IS NOT NULL AND date_trunc('month', _last_any) >= r.ref - interval '11 months' THEN 'servicekunde'::public.customer_type
 WHEN _last_any IS NULL AND _last_cons IS NULL AND NOT coalesce(_has_eq, false) THEN 'nyt_emne'::public.customer_type
 ELSE 'tidligere_kunde'::public.customer_type END FROM r
$function$;
CREATE OR REPLACE FUNCTION public.kundestatus_dage(_last_cons date, _last_any date, _has_eq boolean, _har_visma boolean, _ref date DEFAULT CURRENT_DATE)
RETURNS public.customer_type LANGUAGE sql STABLE SET search_path TO 'public' AS $function$
SELECT CASE
 WHEN _last_cons IS NOT NULL AND _last_cons >= (_ref - interval '6 months')::date THEN 'aktiv_kunde'::public.customer_type
 WHEN _last_cons IS NOT NULL AND _last_cons >= _ref - 365 THEN 'sovende_kunde'::public.customer_type
 WHEN coalesce(_has_eq, false) AND _last_any IS NOT NULL AND _last_any >= _ref - 365 THEN 'servicekunde'::public.customer_type
 WHEN NOT coalesce(_har_visma, false) AND _last_any IS NULL AND _last_cons IS NULL THEN 'nyt_emne'::public.customer_type
 ELSE 'tidligere_kunde'::public.customer_type END
$function$;
CREATE OR REPLACE FUNCTION public.rytme_graense_dage(_koebsmaaneder integer, _interval numeric)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $function$
 SELECT CASE WHEN coalesce(_koebsmaaneder,0) >= 3 AND _interval IS NOT NULL
 THEN greatest(180, round(1.5 * _interval * 30.44)::int) ELSE 180 END
$function$;
-- Reserve at least six calendar months in both department and company rhythm status.
-- Preserve every other statement, existing privileges, and trend rules.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef('public.kunde_rytme_genberegn(uuid[])'::regprocedure) INTO definition;
 IF position('public.rytme_graense_dage(ry.n, ry.iv)' IN definition) = 0 THEN
  RAISE EXCEPTION 'Expected rhythm status calls not found';
 END IF;
 definition := replace(definition, 'public.rytme_graense_dage(ry.n, ry.iv)', 'greatest(public.rytme_graense_dage(ry.n, ry.iv), _ref - (_ref - interval ''6 months'')::date)');
 EXECUTE definition;
END $migration$;