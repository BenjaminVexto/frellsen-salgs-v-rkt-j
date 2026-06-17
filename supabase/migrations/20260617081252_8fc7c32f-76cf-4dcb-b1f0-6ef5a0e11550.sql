
CREATE UNIQUE INDEX IF NOT EXISTS quotes_quote_number_uidx
  ON public.quotes (quote_number)
  WHERE quote_number IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_quote_draft(
  _company_id uuid,
  _delivery_location_id uuid DEFAULT NULL,
  _pricing_mode text DEFAULT 'purchase'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_year int  := (extract(year from now())::int) % 100;
  v_next int;
  v_num  text;
  v_id   uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.can_access_company(v_uid, _company_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF COALESCE(_pricing_mode,'purchase') NOT IN ('purchase','lease','both') THEN
    RAISE EXCEPTION 'Invalid pricing_mode';
  END IF;

  -- Næste løbenummer for indeværende år
  SELECT COALESCE(MAX( (split_part(quote_number,'-',2))::int ), 0) + 1
    INTO v_next
    FROM public.quotes
   WHERE quote_number ~ ('^' || v_year || '-[0-9]+$');

  v_num := v_year || '-' || lpad(v_next::text, 4, '0');

  INSERT INTO public.quotes(
    company_id, created_by, quote_number, status, pricing_mode, delivery_location_id
  ) VALUES (
    _company_id, v_uid, v_num, 'kladde'::quote_status,
    COALESCE(_pricing_mode,'purchase'), _delivery_location_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.create_quote_draft(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_quote_draft(uuid,uuid,text) TO authenticated;

-- get_quote_floor_discount findes allerede; sørg for at den kan kaldes via RPC
GRANT EXECUTE ON FUNCTION public.get_quote_floor_discount(uuid,text) TO authenticated;
