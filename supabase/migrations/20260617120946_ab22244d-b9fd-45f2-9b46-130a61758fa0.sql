ALTER TABLE public.quote_lines
  ADD COLUMN IF NOT EXISTS nettopris_enhed_snapshot numeric;

-- Genberegn KUN for kladder (ikke frosne / sendte tilbud).
UPDATE public.quote_lines ql
   SET nettopris_enhed_snapshot = GREATEST(
         0::numeric,
         ql.listepris_snapshot * (1 - COALESCE(ql.rabat_pct_snapshot,0)/100.0)
           - COALESCE(ql.rabat_kr_snapshot, 0)
       ),
       nettopris_snapshot = GREATEST(
         0::numeric,
         ql.listepris_snapshot * (1 - COALESCE(ql.rabat_pct_snapshot,0)/100.0)
           - COALESCE(ql.rabat_kr_snapshot, 0)
       ) * COALESCE(ql.antal, 1)
  FROM public.quotes q
 WHERE q.id = ql.quote_id
   AND q.frozen_at IS NULL;