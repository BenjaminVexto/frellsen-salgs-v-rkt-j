CREATE TABLE public.import_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type text NOT NULL CHECK (import_type IN ('aktoer','faktura','maskiner','prismatrix')),
  status text NOT NULL CHECK (status IN ('ok','fejl')),
  filename text,
  fejl text,
  created_by uuid,
  kilde_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX import_log_kilde_uniq ON public.import_log (kilde_id) WHERE kilde_id IS NOT NULL;
CREATE INDEX import_log_type_idx ON public.import_log (import_type, status, created_at DESC);
GRANT SELECT ON public.import_log TO authenticated;
GRANT ALL ON public.import_log TO service_role;
ALTER TABLE public.import_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins læser importlog" ON public.import_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public._import_type_label(_t text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _t WHEN 'aktoer' THEN 'Aktør' WHEN 'faktura' THEN 'Faktura Journal'
    WHEN 'maskiner' THEN 'Maskinliste + Wittenborg' WHEN 'prismatrix' THEN 'Prismatrix' ELSE _t END $$;

CREATE OR REPLACE FUNCTION public._import_log_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'fejl' THEN
    INSERT INTO public.notifications (recipient_id, sender_id, message, notification_type)
    SELECT r, NEW.created_by,
      'Import fejlede: ' || public._import_type_label(NEW.import_type)
      || ' · ' || coalesce(NEW.filename, 'ukendt fil')
      || ' · ' || to_char(NEW.created_at AT TIME ZONE 'Europe/Copenhagen', 'DD-MM-YYYY "kl." HH24:MI')
      || ' – ' || left(coalesce(NEW.fejl, 'ukendt fejl'), 200),
      'import_fejl'
    FROM (SELECT NEW.created_by AS r WHERE NEW.created_by IS NOT NULL
          UNION SELECT user_id FROM public.user_roles WHERE role = 'admin') x;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER import_log_notify AFTER INSERT ON public.import_log
  FOR EACH ROW EXECUTE FUNCTION public._import_log_notify();

CREATE OR REPLACE FUNCTION public.log_import(_type text, _status text, _filename text, _fejl text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Kun admin'; END IF;
  INSERT INTO public.import_log (import_type, status, filename, fejl, created_by)
  VALUES (_type, _status, _filename, left(_fejl, 500), auth.uid());
END $$;
GRANT EXECUTE ON FUNCTION public.log_import(text,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public._invoice_job_log() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IN ('completed','failed') AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO public.import_log (import_type, status, filename, fejl, created_by, kilde_id, created_at)
    VALUES ('faktura', CASE WHEN NEW.status = 'completed' THEN 'ok' ELSE 'fejl' END,
      NEW.payload->>'filename', coalesce(NEW.error_message, NEW.last_error), NEW.user_id, NEW.id, now())
    ON CONFLICT (kilde_id) WHERE kilde_id IS NOT NULL DO UPDATE
      SET status = EXCLUDED.status, fejl = EXCLUDED.fejl, created_at = EXCLUDED.created_at;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER invoice_job_log AFTER INSERT OR UPDATE OF status ON public.invoice_import_jobs
  FOR EACH ROW EXECUTE FUNCTION public._invoice_job_log();

ALTER TABLE public.import_log DISABLE TRIGGER import_log_notify;
INSERT INTO public.import_log (import_type, status, filename, fejl, created_by, kilde_id, created_at)
SELECT 'faktura', CASE WHEN status='completed' THEN 'ok' ELSE 'fejl' END, payload->>'filename',
  coalesce(error_message, last_error), user_id, id, coalesce(finished_at, updated_at, created_at)
FROM public.invoice_import_jobs WHERE status IN ('completed','failed');
INSERT INTO public.import_log (import_type, status, filename, created_by, kilde_id, created_at)
SELECT 'aktoer', 'ok', filename, created_by, id, created_at
FROM public.import_batches WHERE coalesce(kind,'companies') = 'companies';
ALTER TABLE public.import_log ENABLE TRIGGER import_log_notify;

CREATE OR REPLACE FUNCTION public.import_status()
RETURNS TABLE (import_type text, ok_at timestamptz, ok_navn text, ok_fil text, fejl_at timestamptz, fejl_tekst text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.t, ok.created_at, p.full_name, ok.filename, f.created_at, f.fejl
  FROM unnest(ARRAY['aktoer','faktura','maskiner','prismatrix']) t(t)
  LEFT JOIN LATERAL (SELECT * FROM import_log l WHERE l.import_type=t.t AND l.status='ok' ORDER BY created_at DESC LIMIT 1) ok ON true
  LEFT JOIN LATERAL (SELECT * FROM import_log l WHERE l.import_type=t.t AND l.status='fejl' ORDER BY created_at DESC LIMIT 1) f ON true
  LEFT JOIN profiles p ON p.id = ok.created_by
  WHERE public.has_role(auth.uid(), 'admin')
$$;
GRANT EXECUTE ON FUNCTION public.import_status() TO authenticated;