CREATE OR REPLACE FUNCTION public.get_public_quote(_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote quotes%ROWTYPE;
  v_company companies%ROWTYPE;
  v_location locations%ROWTYPE;
  v_lines jsonb;
BEGIN
  IF _token IS NULL OR length(_token) < 8 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_quote FROM public.quotes
   WHERE public_token = _token
     AND status = 'sendt'::quote_status
     AND frozen_at IS NOT NULL
   LIMIT 1;

  IF v_quote.id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_company FROM public.companies WHERE id = v_quote.company_id;
  IF v_quote.delivery_location_id IS NOT NULL THEN
    SELECT * INTO v_location FROM public.locations WHERE id = v_quote.delivery_location_id;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY l.sort_order, l.created_at), '[]'::jsonb)
    INTO v_lines
    FROM public.quote_lines l
   WHERE l.quote_id = v_quote.id;

  RETURN jsonb_build_object(
    'quote', jsonb_build_object(
      'id', v_quote.id,
      'quote_number', v_quote.quote_number,
      'status', v_quote.status,
      'pricing_mode', v_quote.pricing_mode,
      'sent_date', v_quote.sent_date,
      'expiry_date', v_quote.expiry_date,
      'frozen_at', v_quote.frozen_at,
      'notes', v_quote.notes
    ),
    'company', jsonb_build_object(
      'name', v_company.name,
      'address', v_company.address,
      'zip', v_company.zip,
      'city', v_company.city,
      'contact_person', v_company.contact_person,
      'cvr', v_company.cvr
    ),
    'location', CASE WHEN v_location.id IS NULL THEN NULL ELSE jsonb_build_object(
      'address', v_location.address,
      'zip', v_location.zip,
      'city', v_location.city,
      'contact_person', v_location.contact_person,
      'phone', v_location.phone,
      'email', v_location.email
    ) END,
    'lines', v_lines
  );
END $$;

REVOKE ALL ON FUNCTION public.get_public_quote(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_quote(text) TO anon, authenticated;