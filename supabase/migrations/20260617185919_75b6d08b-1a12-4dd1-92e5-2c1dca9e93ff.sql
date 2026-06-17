ALTER TABLE public._product_master_import_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._product_master_import_log FROM anon, authenticated;
GRANT ALL ON public._product_master_import_log TO service_role;
CREATE POLICY "Admins can read import log"
  ON public._product_master_import_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));