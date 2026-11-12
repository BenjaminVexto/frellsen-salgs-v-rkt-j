CREATE OR REPLACE FUNCTION public.ensure_primary_location()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE delivery text := COALESCE(NULLIF(NEW.visma_delivery_id, ''), NULLIF(NEW.visma_id, ''));
BEGIN
  -- An existing delivery address is moved by the importer, never duplicated here.
  IF delivery IS NOT NULL AND EXISTS (SELECT 1 FROM public.locations WHERE visma_delivery_no = delivery AND afdeling_nr = COALESCE(NEW.afdeling_nr, 11)) THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.locations (company_id, afdeling_nr, visma_delivery_no, address, zip, city, phone, email, contact_person, is_primary)
  VALUES (NEW.id, COALESCE(NEW.afdeling_nr, 11), delivery, NEW.address, NEW.zip, NEW.city, NEW.phone, NEW.email, NEW.contact_person, true);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.import_flyt_lokation(_location_id uuid, _company_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE l public.locations; c public.companies; old_no text;
BEGIN
  SELECT * INTO STRICT l FROM public.locations WHERE id = _location_id FOR UPDATE;
  SELECT * INTO STRICT c FROM public.companies WHERE id = _company_id;
  IF l.afdeling_nr IS DISTINCT FROM c.afdeling_nr THEN RAISE EXCEPTION 'Afdeling matcher ikke'; END IF;
  IF l.company_id = c.id THEN RETURN NULL; END IF;
  SELECT COALESCE(visma_id, name) INTO old_no FROM public.companies WHERE id = l.company_id;
  UPDATE public.locations SET company_id = c.id, is_primary = false WHERE id = l.id;
  UPDATE public.activities SET company_id = c.id WHERE location_id = l.id AND company_id IS DISTINCT FROM c.id;
  UPDATE public.contacts SET company_id = c.id WHERE location_id = l.id AND company_id IS DISTINCT FROM c.id;
  UPDATE public.sales_monthly SET company_id = c.id WHERE location_id = l.id AND company_id IS DISTINCT FROM c.id;
  RETURN 'Lokation flyttet: ' || l.visma_delivery_no || ' fra ' || old_no || ' til ' || COALESCE(c.visma_id, c.name);
END;
$function$;
REVOKE ALL ON FUNCTION public.import_flyt_lokation(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.import_flyt_lokation(uuid, uuid) TO service_role;