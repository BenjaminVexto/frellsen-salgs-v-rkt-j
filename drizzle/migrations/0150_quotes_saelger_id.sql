ALTER TABLE public.quotes ADD COLUMN saelger_id uuid REFERENCES public.profiles(id);

-- Backfill: tilbud med koblet salgsmulighed får salgsmulighedens ansvarlige sælger.
UPDATE public.quotes q
SET saelger_id = so.assigned_to
FROM public.sales_opportunities so
WHERE so.quote_id = q.id
  AND so.assigned_to IS NOT NULL
  AND q.saelger_id IS NULL;

-- Offentlig side: sælger = saelger_id med fallback til created_by.
CREATE OR REPLACE FUNCTION public.quote_recipient_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r record;
  q record;
  v_seller_id uuid;
  v_seller_name text;
  v_seller_email text;
BEGIN
  SELECT * INTO r FROM quote_recipients WHERE token = _token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO q FROM quotes WHERE id = r.quote_id;
  IF q.pdf_path IS NULL THEN RETURN NULL; END IF;
  v_seller_id := coalesce(q.saelger_id, q.created_by);
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = v_seller_id;
  SELECT email INTO v_seller_email FROM auth.users WHERE id = v_seller_id;
  RETURN jsonb_build_object(
    'recipient_navn', r.navn,
    'quote_number', q.quote_number,
    'company_name', (SELECT name FROM companies WHERE id = q.company_id),
    'expiry_date', q.expiry_date,
    'sent_date', q.sent_date,
    'seller_name', v_seller_name,
    'seller_email', v_seller_email
  );
END
$function$;
REVOKE ALL ON FUNCTION public.quote_recipient_by_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_recipient_by_token(text) TO anon, authenticated;

-- Sporing: notifikation går til saelger_id med fallback til created_by.
CREATE OR REPLACE FUNCTION public.quote_track_event(_token text, _event text, _user_agent text DEFAULT NULL)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r record;
  q record;
  v_first_open boolean;
  v_seller_id uuid;
BEGIN
  IF _event NOT IN ('aabnet', 'downloadet') THEN RETURN false; END IF;
  SELECT * INTO r FROM quote_recipients WHERE token = _token;
  IF NOT FOUND THEN RETURN false; END IF;

  IF _event = 'aabnet' THEN
    SELECT NOT EXISTS (
      SELECT 1 FROM quote_events e
      JOIN quote_recipients rr ON rr.id = e.recipient_id
      WHERE rr.quote_id = r.quote_id AND e.event = 'aabnet'
    ) INTO v_first_open;
  ELSE
    v_first_open := false;
  END IF;

  INSERT INTO quote_events (recipient_id, event, user_agent)
  VALUES (r.id, _event, left(coalesce(_user_agent, ''), 500));

  IF _event = 'aabnet' THEN
    UPDATE quote_recipients
    SET antal_aabninger = antal_aabninger + 1,
        foerst_aabnet_at = coalesce(foerst_aabnet_at, now()),
        seneste_aabnet_at = now()
    WHERE id = r.id;

    SELECT * INTO q FROM quotes WHERE id = r.quote_id;
    v_seller_id := coalesce(q.saelger_id, q.created_by);
    IF v_first_open AND q.status = 'sendt' THEN
      UPDATE quotes SET status = 'under_opfølgning' WHERE id = q.id;
      INSERT INTO notifications (recipient_id, sender_id, company_id, message, notification_type)
      VALUES (
        v_seller_id,
        v_seller_id,
        q.company_id,
        (SELECT name FROM companies WHERE id = q.company_id) || ' har åbnet tilbud ' || coalesce(q.quote_number, ''),
        'quote_aabnet'
      );
    END IF;
  ELSE
    UPDATE quote_recipients
    SET downloadet_at = coalesce(downloadet_at, now())
    WHERE id = r.id;
  END IF;

  RETURN true;
END
$function$;
REVOKE ALL ON FUNCTION public.quote_track_event(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_track_event(text, text, text) TO anon, authenticated;