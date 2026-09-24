CREATE OR REPLACE VIEW public.salgsintelligens_mersalg WITH (security_invoker = on) AS
WITH agg AS (
  SELECT s.afdeling_nr, s.cvr,
    (count(*) FILTER (WHERE s.match_status = 'none'))::integer AS potential,
    (count(*) FILTER (WHERE s.match_status <> 'none'))::integer AS daekket,
    (count(*))::integer AS penheder_total,
    (sum(s.ansatte_estimat) FILTER (WHERE s.match_status = 'none'))::integer AS ansatte_ikke_daekket,
    (sum(s.ansatte_estimat))::integer AS ansatte_total,
    max(s.ansatte_estimat) FILTER (WHERE s.match_status = 'none') AS max_ansatte_ikke_daekket,
    (count(*) FILTER (WHERE s.match_status = 'none' AND s.ansatte_estimat IS NULL))::integer AS uden_tal_ikke_daekket,
    (count(*) FILTER (WHERE s.ansatte_estimat IS NULL))::integer AS uden_tal_total
  FROM public.salgsintelligens_penhed_status s
  GROUP BY s.afdeling_nr, s.cvr
), hoved AS (
  SELECT DISTINCT ON (c.afdeling_nr, c.cvr) c.afdeling_nr, c.cvr, c.id AS company_id, c.name, c.city, c.assigned_to
  FROM public.companies c
  WHERE c.cvr IS NOT NULL AND c.customer_type = ANY (ARRAY['aktiv_kunde'::customer_type,'sovende_kunde'::customer_type])
    AND COALESCE(c.binding_status,'') <> 'intern_privat'
  ORDER BY c.afdeling_nr, c.cvr, (SELECT count(*) FROM public.locations l WHERE l.company_id = c.id) DESC, c.name
), enheder AS (
  SELECT afdeling_nr, cvr, (count(*))::integer AS antal_kundenumre
  FROM public.companies WHERE cvr IS NOT NULL GROUP BY afdeling_nr, cvr
)
SELECT a.afdeling_nr, a.cvr, a.potential, a.daekket, a.penheder_total, h.company_id, h.name, h.city, h.assigned_to,
  e.antal_kundenumre, a.ansatte_ikke_daekket, a.ansatte_total, a.max_ansatte_ikke_daekket,
  a.uden_tal_ikke_daekket, a.uden_tal_total
FROM agg a
JOIN hoved h ON h.afdeling_nr = a.afdeling_nr AND h.cvr = a.cvr
JOIN enheder e ON e.afdeling_nr = a.afdeling_nr AND e.cvr = a.cvr
WHERE a.potential > 0;