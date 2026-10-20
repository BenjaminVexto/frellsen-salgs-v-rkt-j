CREATE OR REPLACE FUNCTION public._bonus_regulering_aaben()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE r public.bonus_regulering;
BEGIN
  r := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  IF EXISTS (SELECT 1 FROM public.bonus_laas l WHERE l.maaned = r.udbetalingsmaaned AND l.user_id = r.user_id) THEN
    RAISE EXCEPTION 'Måneden er låst – reguleringer kan ikke ændres';
  END IF;
  IF TG_OP = 'INSERT' THEN NEW.udbetalingsmaaned := date_trunc('month', NEW.udbetalingsmaaned)::date; END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $function$;