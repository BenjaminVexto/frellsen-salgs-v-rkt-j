CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id bigserial PRIMARY KEY,
  import_batch_id uuid NOT NULL,
  firma_nr text,
  kilde_afdeling_nr int,
  afdeling_nr int NOT NULL,
  ordre_nr text,
  faktura_dato date NOT NULL,
  period date GENERATED ALWAYS AS (date_trunc('month', faktura_dato::timestamp)::date) STORED,
  visma_delivery_no text NOT NULL,
  kunde_navn text,
  kundeprisgruppe_1 text,
  kundeprisgruppe_2 text,
  varenr text,
  varetekst text,
  antal numeric,
  varegruppe_1 text,
  varegruppe_2 text,
  nettovaegt numeric,
  kostpris numeric,
  enhedspris numeric,
  beloeb numeric,
  db numeric,
  dg numeric,
  initialer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_lines_afd_dato ON public.invoice_lines(afdeling_nr, faktura_dato);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_afd_period ON public.invoice_lines(afdeling_nr, period);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_lev_afd_period ON public.invoice_lines(visma_delivery_no, afdeling_nr, period);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_varenr_period ON public.invoice_lines(varenr, period);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_batch ON public.invoice_lines(import_batch_id);

GRANT SELECT ON public.invoice_lines TO authenticated;
GRANT ALL ON public.invoice_lines TO service_role;

ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin og salgssupport kan laese fakturalinjer" ON public.invoice_lines;
CREATE POLICY "Admin og salgssupport kan laese fakturalinjer"
  ON public.invoice_lines FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'salgssupport'));

ALTER TABLE public.invoice_import_jobs
  ADD COLUMN IF NOT EXISTS lines_batch_id uuid,
  ADD COLUMN IF NOT EXISTS total_lines integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saved_lines integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lines_deleted integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prune_month_idx integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lines_date_from date,
  ADD COLUMN IF NOT EXISTS lines_date_to date,
  ADD COLUMN IF NOT EXISTS lines_afdelinger integer[];

CREATE OR REPLACE FUNCTION public.prune_invoice_lines_month(
  _batch_id uuid,
  _afdelinger integer[],
  _from date,
  _to date,
  _month_start date
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from date := greatest(_from, _month_start);
  v_to date := least(_to, (_month_start + interval '1 month' - interval '1 day')::date);
  v_deleted integer := 0;
BEGIN
  IF v_from > v_to THEN
    RETURN 0;
  END IF;
  DELETE FROM public.invoice_lines
  WHERE afdeling_nr = ANY(_afdelinger)
    AND faktura_dato BETWEEN v_from AND v_to
    AND import_batch_id <> _batch_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_invoice_lines_month(uuid, integer[], date, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.prune_invoice_lines_month(uuid, integer[], date, date, date) TO service_role;