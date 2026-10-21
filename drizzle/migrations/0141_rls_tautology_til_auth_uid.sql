DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename, policyname FROM pg_policies
    WHERE schemaname='public' AND qual='true' AND roles='{authenticated}'
      AND tablename <> 'udstyr_indstilling'
  LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING ((SELECT auth.uid()) IS NOT NULL)', r.policyname, r.tablename);
  END LOOP;
END $$;