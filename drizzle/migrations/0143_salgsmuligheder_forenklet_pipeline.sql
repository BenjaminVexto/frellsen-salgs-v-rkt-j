CREATE TYPE public.opportunity_status_v2 AS ENUM ('moede_booket','tilbud_sendt','vundet','tabt');
CREATE TYPE public.moede_udfald AS ENUM ('afholdt','aflyst','no_show','flyttet');
CREATE TYPE public.tabt_aarsag AS ENUM ('pris','konkurrent','ikke_relevant','timing','andet');

ALTER TABLE public.sales_opportunities
  ADD COLUMN status_v2 public.opportunity_status_v2 NOT NULL DEFAULT 'moede_booket',
  ADD COLUMN kontaktliste_opkald_id uuid REFERENCES public.kontaktliste_opkald(id),
  ADD COLUMN moede_at timestamptz,
  ADD COLUMN moede_udfald public.moede_udfald,
  ADD COLUMN quote_id uuid REFERENCES public.quotes(id),
  ADD COLUMN tabt_aarsag public.tabt_aarsag;
CREATE UNIQUE INDEX sales_opportunities_opkald_uniq ON public.sales_opportunities(kontaktliste_opkald_id) WHERE kontaktliste_opkald_id IS NOT NULL;

COMMENT ON COLUMN public.sales_opportunities.status IS 'DEPRECATED: replaced by status_v2 (forenklet pipeline)';
COMMENT ON COLUMN public.sales_opportunities.probability IS 'DEPRECATED: fjernet fra UI, pipeline forenklet';
COMMENT ON COLUMN public.sales_opportunities.expected_close_date IS 'DEPRECATED: fjernet fra UI, pipeline forenklet';

CREATE OR REPLACE FUNCTION public._opkald_til_salgsmulighed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.udfald = 'moede_booket' THEN
    INSERT INTO public.sales_opportunities (company_id, assigned_to, name, status_v2, moede_at, kontaktliste_opkald_id, kilde, created_by)
    SELECT NEW.company_id, NEW.moede_saelger_user_id, c.name, 'moede_booket', NEW.moede_at, NEW.id,
           CASE WHEN NEW.rolle = 'telemarketing' THEN 'boost' ELSE 'egen' END, NEW.user_id
    FROM public.companies c WHERE c.id = NEW.company_id
    ON CONFLICT (kontaktliste_opkald_id) WHERE kontaktliste_opkald_id IS NOT NULL
    DO UPDATE SET moede_at = EXCLUDED.moede_at, assigned_to = EXCLUDED.assigned_to, updated_at = now();
    IF NEW.activity_id IS NOT NULL THEN
      UPDATE public.activities a
      SET activity_type = 'møde',
          opportunity_id = (SELECT id FROM public.sales_opportunities WHERE kontaktliste_opkald_id = NEW.id)
      WHERE a.id = NEW.activity_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER opkald_til_salgsmulighed
AFTER INSERT OR UPDATE OF udfald, moede_at, moede_saelger_user_id ON public.kontaktliste_opkald
FOR EACH ROW EXECUTE FUNCTION public._opkald_til_salgsmulighed();

CREATE OR REPLACE FUNCTION public._quote_sendt_til_salgsmulighed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'sendt' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'sendt') THEN
    UPDATE public.sales_opportunities
    SET quote_id = NEW.id, status_v2 = 'tilbud_sendt', estimated_value = NEW.estimated_value, updated_at = now()
    WHERE company_id = NEW.company_id AND status_v2 = 'moede_booket' AND quote_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER quote_sendt_til_salgsmulighed
AFTER INSERT OR UPDATE OF status ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public._quote_sendt_til_salgsmulighed();

DROP POLICY "Se salgsmuligheder i egne afdelinger" ON public.sales_opportunities;
CREATE POLICY "Se egne salgsmuligheder" ON public.sales_opportunities
FOR SELECT TO authenticated
USING (assigned_to = auth.uid() OR public.is_admin(auth.uid()));