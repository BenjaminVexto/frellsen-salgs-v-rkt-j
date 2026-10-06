CREATE OR REPLACE FUNCTION public.maskiner_ret_afdeling()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n integer;
BEGIN
  -- Maskinens afdeling = den afdeling, hvor lev. kundenr. findes som lokation.
  -- Findes det i maskinens nuværende afdeling, beholdes den. Findes det i præcis
  -- én anden afdeling, flyttes maskinen dertil. Ellers røres den ikke.
  WITH kand AS (
    SELECT m.id, min(l.afdeling_nr) AS afd, count(DISTINCT l.afdeling_nr) AS n
    FROM public.machines m
    JOIN public.locations l ON l.visma_delivery_no = m.lev_kundenr
    WHERE m.lev_kundenr IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.locations l2
                      WHERE l2.afdeling_nr = m.afdeling_nr AND l2.visma_delivery_no = m.lev_kundenr)
    GROUP BY m.id
  )
  UPDATE public.machines m SET afdeling_nr = k.afd
  FROM kand k WHERE k.id = m.id AND k.n = 1 AND m.afdeling_nr IS DISTINCT FROM k.afd;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.maskiner_ret_afdeling() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.maskiner_ret_afdeling() TO service_role;