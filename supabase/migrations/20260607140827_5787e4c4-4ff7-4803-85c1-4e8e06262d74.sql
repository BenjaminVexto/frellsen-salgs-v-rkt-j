DROP POLICY IF EXISTS "Se lokationer for tilgængelige virksomheder" ON public.locations;
CREATE POLICY "Alle indloggede brugere kan se lokationer"
  ON public.locations FOR SELECT
  TO authenticated
  USING (true);