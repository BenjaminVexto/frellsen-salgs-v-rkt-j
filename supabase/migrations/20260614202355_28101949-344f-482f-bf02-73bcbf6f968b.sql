ALTER TABLE public.agreement_pricing
  ADD COLUMN IF NOT EXISTS kundeprisgruppe1 text,
  ADD COLUMN IF NOT EXISTS fak_kundenr text;

CREATE INDEX IF NOT EXISTS agreement_pricing_kundeprisgruppe1_idx
  ON public.agreement_pricing (kundeprisgruppe1);

CREATE INDEX IF NOT EXISTS agreement_pricing_fak_kundenr_idx
  ON public.agreement_pricing (fak_kundenr);