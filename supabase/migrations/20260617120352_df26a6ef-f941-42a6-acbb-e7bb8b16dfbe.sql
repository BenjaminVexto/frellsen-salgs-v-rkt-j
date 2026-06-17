CREATE OR REPLACE FUNCTION public.send_quote(_quote_id uuid)
 RETURNS TABLE(public_token text, frozen_at timestamp with time zone, expiry_date date, status text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_frozen timestamptz;
  v_token text;
  v_expiry date;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT q.company_id, q.frozen_at INTO v_company_id, v_frozen
    FROM public.quotes q WHERE q.id = _quote_id;
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'Tilbud findes ikke'; END IF;
  IF NOT public.can_access_company(v_uid, v_company_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF v_frozen IS NOT NULL THEN RAISE EXCEPTION 'Tilbuddet er allerede sendt'; END IF;

  LOOP
    v_token := replace(replace(replace(encode(extensions.gen_random_bytes(18), 'base64'), '+','-'), '/','_'), '=', '');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.quotes q WHERE q.public_token = v_token);
  END LOOP;

  UPDATE public.quotes q
     SET status = 'sendt'::quote_status,
         frozen_at = now(),
         sent_date = CURRENT_DATE,
         expiry_date = COALESCE(q.expiry_date, CURRENT_DATE + INTERVAL '30 days'),
         public_token = v_token
   WHERE q.id = _quote_id
   RETURNING q.frozen_at, q.expiry_date, q.status::text
        INTO v_frozen, v_expiry, v_status;

  public_token := v_token;
  frozen_at    := v_frozen;
  expiry_date  := v_expiry;
  status       := v_status;
  RETURN NEXT;
END $function$;