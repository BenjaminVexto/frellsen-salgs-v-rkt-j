DROP POLICY IF EXISTS "Se aktiviteter for tilgængelige virksomheder" ON public.activities;
CREATE POLICY "Alle indloggede brugere kan se aktiviteter"
  ON public.activities FOR SELECT
  TO authenticated
  USING (true);