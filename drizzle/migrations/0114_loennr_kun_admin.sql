CREATE OR REPLACE FUNCTION public._loennr_kun_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.loennr IS DISTINCT FROM OLD.loennr AND auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Kun admin kan ændre lønnummer';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER profiles_loennr_kun_admin BEFORE UPDATE OF loennr ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public._loennr_kun_admin();