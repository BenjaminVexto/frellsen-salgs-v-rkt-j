INSERT INTO public.sales_opportunities (company_id, assigned_to, name, status_v2, moede_at, moede_udfald, kontaktliste_opkald_id, kilde, created_by)
SELECT k.company_id, k.moede_saelger_user_id, c.name,
  CASE WHEN k.note ILIKE '%tilbud sendt%' THEN 'tilbud_sendt'::public.opportunity_status_v2 ELSE 'moede_booket'::public.opportunity_status_v2 END,
  k.moede_at,
  CASE WHEN k.note ILIKE '%tilbud sendt%' THEN 'afholdt'::public.moede_udfald END,
  k.id,
  CASE WHEN k.rolle = 'telemarketing' THEN 'boost' ELSE 'egen' END,
  k.user_id
FROM public.kontaktliste_opkald k
JOIN public.companies c ON c.id = k.company_id
WHERE k.udfald = 'moede_booket'
ON CONFLICT (kontaktliste_opkald_id) WHERE kontaktliste_opkald_id IS NOT NULL DO NOTHING;

UPDATE public.activities a
SET opportunity_id = s.id, activity_type = 'møde'
FROM public.kontaktliste_opkald k
JOIN public.sales_opportunities s ON s.kontaktliste_opkald_id = k.id
WHERE k.activity_id = a.id AND k.udfald = 'moede_booket';