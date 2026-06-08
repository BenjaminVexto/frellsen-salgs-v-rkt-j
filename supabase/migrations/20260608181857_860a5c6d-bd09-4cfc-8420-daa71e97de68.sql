
CREATE TABLE public.sales_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NULL REFERENCES public.locations(id) ON DELETE SET NULL,
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  visma_delivery_no text NOT NULL,
  period date NOT NULL,
  product_group_1 text NOT NULL,
  revenue numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 0,
  contribution numeric NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_monthly_unique UNIQUE (visma_delivery_no, period, product_group_1)
);

CREATE INDEX sales_monthly_company_period_idx ON public.sales_monthly (company_id, period);
CREATE INDEX sales_monthly_location_period_idx ON public.sales_monthly (location_id, period);
CREATE INDEX sales_monthly_delivery_idx ON public.sales_monthly (visma_delivery_no);

GRANT SELECT ON public.sales_monthly TO authenticated;
GRANT ALL ON public.sales_monthly TO service_role;

ALTER TABLE public.sales_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accessible sales_monthly"
ON public.sales_monthly FOR SELECT
TO authenticated
USING (company_id IS NULL OR public.can_access_company(auth.uid(), company_id));


CREATE TABLE public.sales_top_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  visma_delivery_no text NOT NULL,
  varenr text NOT NULL,
  description text NULL,
  revenue numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_top_products_unique UNIQUE (visma_delivery_no, varenr)
);

CREATE INDEX sales_top_products_location_idx ON public.sales_top_products (location_id);
CREATE INDEX sales_top_products_delivery_idx ON public.sales_top_products (visma_delivery_no);

GRANT SELECT ON public.sales_top_products TO authenticated;
GRANT ALL ON public.sales_top_products TO service_role;

ALTER TABLE public.sales_top_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view accessible sales_top_products"
ON public.sales_top_products FOR SELECT
TO authenticated
USING (
  location_id IS NULL OR EXISTS (
    SELECT 1 FROM public.locations l
    WHERE l.id = sales_top_products.location_id
      AND (l.company_id IS NULL OR public.can_access_company(auth.uid(), l.company_id))
  )
);
