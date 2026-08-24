CREATE OR REPLACE FUNCTION public.latest_forbrug_snapshot_periode()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT max(h.snapshot_periode)
  FROM public.forbrug_signal_historik h
$$;

REVOKE ALL ON FUNCTION public.latest_forbrug_snapshot_periode() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.latest_forbrug_snapshot_periode() TO authenticated, service_role;

DROP POLICY IF EXISTS "fsh_read" ON public.forbrug_signal_historik;
CREATE POLICY "fsh_read" ON public.forbrug_signal_historik
FOR SELECT TO authenticated
USING (
  afdeling_nr IS NOT NULL
  AND afdeling_nr = ANY ((SELECT public.my_afdelinger())::int[])
  AND (
    (SELECT public.has_role(auth.uid(), 'admin'::public.app_role))
    OR (SELECT public.has_role(auth.uid(), 'salgssupport'::public.app_role))
    OR (
      company_id IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.companies c
        WHERE c.id = forbrug_signal_historik.company_id
          AND c.assigned_to = auth.uid()
      )
    )
  )
);

CREATE OR REPLACE VIEW public.forbrug_signal_seneste
WITH (security_invoker = on) AS
SELECT h.*
FROM public.forbrug_signal_historik h
WHERE h.snapshot_periode = public.latest_forbrug_snapshot_periode();

REVOKE ALL ON public.forbrug_signal_seneste FROM anon;
GRANT SELECT ON public.forbrug_signal_seneste TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS fsh_snapshot_niveau_afdeling_idx
ON public.forbrug_signal_historik (snapshot_periode DESC, niveau, afdeling_nr);

ANALYZE public.forbrug_signal_historik;
ANALYZE public.companies;