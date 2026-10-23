-- Modtagerlinks og åbningssporing for PDF-tilbud (erstatter GetAccept)

CREATE TABLE public.quote_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
  navn text NOT NULL,
  email text NOT NULL,
  token text NOT NULL UNIQUE DEFAULT translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_'),
  created_at timestamptz NOT NULL DEFAULT now(),
  sendt_at timestamptz,
  foerst_aabnet_at timestamptz,
  seneste_aabnet_at timestamptz,
  antal_aabninger integer NOT NULL DEFAULT 0,
  downloadet_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quote_recipients TO authenticated;
GRANT ALL ON public.quote_recipients TO service_role;
ALTER TABLE public.quote_recipients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Se modtagere for synlige tilbud" ON public.quote_recipients FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND public.can_view_company(auth.uid(), q.company_id)));
CREATE POLICY "Administrer modtagere for tilgængelige tilbud" ON public.quote_recipients FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND (public.can_access_company(auth.uid(), q.company_id) OR public.is_admin(auth.uid()))));
CREATE POLICY "Opdatér modtagere for tilgængelige tilbud" ON public.quote_recipients FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND (public.can_access_company(auth.uid(), q.company_id) OR public.is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND (public.can_access_company(auth.uid(), q.company_id) OR public.is_admin(auth.uid()))));
CREATE POLICY "Slet modtagere for tilgængelige tilbud" ON public.quote_recipients FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.quotes q WHERE q.id = quote_id AND (public.can_access_company(auth.uid(), q.company_id) OR public.is_admin(auth.uid()))));
CREATE POLICY tm_spaerret ON public.quote_recipients AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));

CREATE TABLE public.quote_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.quote_recipients(id) ON DELETE CASCADE,
  event text NOT NULL CHECK (event IN ('aabnet', 'downloadet')),
  at timestamptz NOT NULL DEFAULT now(),
  user_agent text
);
GRANT SELECT ON public.quote_events TO authenticated;
GRANT ALL ON public.quote_events TO service_role;
ALTER TABLE public.quote_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Se events for synlige tilbud" ON public.quote_events FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.quote_recipients r
    JOIN public.quotes q ON q.id = r.quote_id
    WHERE r.id = recipient_id AND public.can_view_company(auth.uid(), q.company_id)
  ));
CREATE POLICY tm_spaerret ON public.quote_events AS RESTRICTIVE FOR ALL TO authenticated
  USING (NOT (SELECT public.er_telemarketing())) WITH CHECK (NOT (SELECT public.er_telemarketing()));

CREATE INDEX idx_quote_recipients_quote ON public.quote_recipients (quote_id);
CREATE INDEX idx_quote_recipients_token ON public.quote_recipients (token);
CREATE INDEX idx_quote_events_recipient ON public.quote_events (recipient_id);

-- Offentlig opslag via token (uden login). Returnerer kun det den offentlige tilbudsside viser.
CREATE OR REPLACE FUNCTION public.quote_recipient_by_token(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  r record;
  q record;
  v_seller_name text;
  v_seller_email text;
BEGIN
  SELECT * INTO r FROM quote_recipients WHERE token = _token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO q FROM quotes WHERE id = r.quote_id;
  IF q.pdf_path IS NULL THEN RETURN NULL; END IF;
  SELECT full_name INTO v_seller_name FROM profiles WHERE id = q.created_by;
  SELECT email INTO v_seller_email FROM auth.users WHERE id = q.created_by;
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

-- Sporing af åbning/download via token. Ved første åbning af tilbuddet:
-- status -> under_opfølgning og notifikation til sælgeren (created_by).
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
    IF v_first_open AND q.status = 'sendt' THEN
      UPDATE quotes SET status = 'under_opfølgning' WHERE id = q.id;
      INSERT INTO notifications (recipient_id, sender_id, company_id, message, notification_type)
      VALUES (
        q.created_by,
        q.created_by,
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