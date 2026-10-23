CREATE OR REPLACE FUNCTION public._aktivitet_til_salgsmulighed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tid timestamptz := coalesce(NEW.udfoert_at, NEW.created_at);
BEGIN
  IF NEW.activity_type NOT IN ('besøg','møde','teams_møde','tilbud_sendt') THEN RETURN NEW; END IF;
  IF NEW.contact_list_assignment_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.kontaktliste_opkald o WHERE o.activity_id = NEW.id) THEN RETURN NEW; END IF;
  IF NEW.activity_type = 'tilbud_sendt' THEN
    UPDATE public.sales_opportunities
       SET status_v2 = 'tilbud_sendt', moede_udfald = coalesce(moede_udfald, 'afholdt'), updated_at = now()
     WHERE company_id = NEW.company_id AND status_v2 = 'moede_booket';
  ELSE
    UPDATE public.sales_opportunities
       SET moede_udfald = 'afholdt', updated_at = now()
     WHERE company_id = NEW.company_id AND status_v2 = 'moede_booket' AND moede_udfald IS NULL
       AND moede_at IS NOT NULL
       AND (v_tid AT TIME ZONE 'Europe/Copenhagen')::date >= (moede_at AT TIME ZONE 'Europe/Copenhagen')::date;
  END IF;
  RETURN NEW;
END $$;

-- AFTER INSERT: kontaktliste-aktiviteter oprettes i BEFORE-trigger på opkaldet, men activity_id sættes først på opkaldet; derfor tjekkes også contact_list_assignment_id + matchende opkald senere i samme statement ikke muligt — vi ignorerer derfor alle med contact_list_assignment_id der kobles via opkald nedenfor i backfill, og live springer vi over hvis aktiviteten kommer fra opkaldstriggeren (pg_trigger_depth > 1).
CREATE OR REPLACE FUNCTION public._aktivitet_til_salgsmulighed_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF pg_trigger_depth() > 1 AND NEW.contact_list_assignment_id IS NOT NULL THEN RETURN NEW; END IF;
  RETURN public._aktivitet_til_salgsmulighed_kald(NEW);
END $$;
DROP FUNCTION public._aktivitet_til_salgsmulighed_trg();

CREATE OR REPLACE FUNCTION public._aktivitet_til_salgsmulighed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tid timestamptz := coalesce(NEW.udfoert_at, NEW.created_at);
BEGIN
  IF NEW.activity_type NOT IN ('besøg','møde','teams_møde','tilbud_sendt') THEN RETURN NEW; END IF;
  -- Kontaktliste-aktiviteter (oprettet af opkaldstriggeren eller registrer_udfald) flytter ikke salgsmuligheder
  IF NEW.contact_list_assignment_id IS NOT NULL AND (pg_trigger_depth() > 1
     OR current_query() ILIKE '%registrer_udfald%'
     OR EXISTS (SELECT 1 FROM public.kontaktliste_opkald o WHERE o.activity_id = NEW.id)) THEN RETURN NEW; END IF;
  IF NEW.activity_type = 'tilbud_sendt' THEN
    UPDATE public.sales_opportunities
       SET status_v2 = 'tilbud_sendt', moede_udfald = coalesce(moede_udfald, 'afholdt'), updated_at = now()
     WHERE company_id = NEW.company_id AND status_v2 = 'moede_booket';
  ELSE
    UPDATE public.sales_opportunities
       SET moede_udfald = 'afholdt', updated_at = now()
     WHERE company_id = NEW.company_id AND status_v2 = 'moede_booket' AND moede_udfald IS NULL
       AND moede_at IS NOT NULL
       AND (v_tid AT TIME ZONE 'Europe/Copenhagen')::date >= (moede_at AT TIME ZONE 'Europe/Copenhagen')::date;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER aktivitet_til_salgsmulighed AFTER INSERT ON public.activities
FOR EACH ROW EXECUTE FUNCTION public._aktivitet_til_salgsmulighed();

-- Backfill
UPDATE public.sales_opportunities s
   SET status_v2 = 'tilbud_sendt', moede_udfald = coalesce(s.moede_udfald, 'afholdt'), updated_at = now()
 WHERE s.status_v2 = 'moede_booket'
   AND EXISTS (SELECT 1 FROM public.activities a WHERE a.company_id = s.company_id AND a.activity_type = 'tilbud_sendt'
               AND NOT EXISTS (SELECT 1 FROM public.kontaktliste_opkald o WHERE o.activity_id = a.id));
UPDATE public.sales_opportunities s
   SET moede_udfald = 'afholdt', updated_at = now()
 WHERE s.status_v2 = 'moede_booket' AND s.moede_udfald IS NULL AND s.moede_at IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.activities a WHERE a.company_id = s.company_id AND a.activity_type IN ('besøg','møde','teams_møde')
               AND (coalesce(a.udfoert_at, a.created_at) AT TIME ZONE 'Europe/Copenhagen')::date >= (s.moede_at AT TIME ZONE 'Europe/Copenhagen')::date
               AND NOT EXISTS (SELECT 1 FROM public.kontaktliste_opkald o WHERE o.activity_id = a.id));

CREATE OR REPLACE FUNCTION public.tm_seneste_aktivitet(_list uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tm boolean := public.er_telemarketing();
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Ikke logget ind' USING ERRCODE = '42501'; END IF;
  IF v_tm AND NOT public.tm_er_ringer(_list) THEN RAISE EXCEPTION 'Ingen adgang' USING ERRCODE = '42501'; END IF;
  RETURN coalesce((
    SELECT jsonb_object_agg(x.company_id, jsonb_build_object('at', x.udfoert_at, 'bruger', x.bruger, 'type', x.activity_type,
      'note', CASE WHEN NOT v_tm OR x.activity_type IN ('opkald','telefonopkald','ikke_truffet','møde','teams_møde','opfølgning_aftalt') THEN x.note END))
    FROM (
      SELECT DISTINCT ON (a.company_id) a.company_id, a.udfoert_at, p.full_name AS bruger, a.note, a.activity_type
      FROM public.contact_list_assignments cla
      JOIN public.activities a ON a.company_id = cla.company_id
      LEFT JOIN public.profiles p ON p.id = a.created_by
      WHERE cla.contact_list_id = _list
      ORDER BY a.company_id, a.udfoert_at DESC, a.created_at DESC
    ) x), '{}'::jsonb);
END $$;