ALTER TABLE public.sales_top_products
  ADD COLUMN IF NOT EXISTS product_group_1 text,
  ADD COLUMN IF NOT EXISTS contribution numeric NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS sales_top_products_group_idx
  ON public.sales_top_products (product_group_1);