CREATE TABLE public.sales_monthly_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id uuid NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  visma_delivery_no text NOT NULL,
  period date NOT NULL,
  varenr text NOT NULL,
  description text NULL,
  revenue numeric NOT NULL DEFAULT 0,
  quantity numeric NOT NULL DEFAULT 0,
  contribution numeric NOT NULL DEFAULT 0,
  product_group_1 text NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_monthly_products_unique UNIQUE (visma_delivery_no, period, varenr)
);
CREATE INDEX sales_monthly_products_delivery_period_idx ON public.sales_monthly_products (visma_delivery_no, period);
CREATE INDEX sales_monthly_products_location_idx ON public.sales_monthly_products (location_id);
GRANT SELECT ON public.sales_monthly_products TO authenticated;
GRANT ALL ON public.sales_monthly_products TO service_role;
ALTER TABLE public.sales_monthly_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view accessible sales_monthly_products"
  ON public.sales_monthly_products
  FOR SELECT
  USING (
    (location_id IS NULL) OR EXISTS (
      SELECT 1 FROM public.locations l
      WHERE l.id = sales_monthly_products.location_id
        AND (l.company_id IS NULL OR can_access_company(auth.uid(), l.company_id))
    )
  );