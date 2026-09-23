ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS bonusklasse text,
  ADD COLUMN IF NOT EXISTS bonusklasse_manuel boolean NOT NULL DEFAULT false;

ALTER TABLE public.products
  ADD CONSTRAINT products_bonusklasse_check
  CHECK (bonusklasse IS NULL OR bonusklasse IN ('wittenborg','animo','rex','ingen'));

CREATE INDEX IF NOT EXISTS products_bonusklasse_idx ON public.products (bonusklasse);
CREATE INDEX IF NOT EXISTS products_pg1_idx ON public.products (produktprisgruppe_1);