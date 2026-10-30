CREATE POLICY "Admin læser materialefiler" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'materialer' AND public.is_admin(auth.uid()));
CREATE OR REPLACE FUNCTION public.materiale_foerste_klik(_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _u public.katalog_udsendelser; _m public.materialer;
BEGIN
  UPDATE public.katalog_udsendelser SET aabnet_at = COALESCE(aabnet_at, now()) WHERE id = _id AND status = 'sendt' RETURNING * INTO _u;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO _m FROM public.materialer WHERE id = _u.materiale_id AND aktiv;
  IF FOUND THEN
    IF _m.type = 'pdf' THEN RETURN jsonb_build_object('pdf_materiale', _m.id); END IF;
    RETURN jsonb_build_object('url', _m.url);
  END IF;
  RETURN jsonb_build_object('url', _u.katalog_url);
END;
$$;