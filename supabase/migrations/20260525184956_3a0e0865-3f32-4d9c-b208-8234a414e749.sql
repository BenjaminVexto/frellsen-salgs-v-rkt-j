ALTER TABLE public.locations
  ADD CONSTRAINT locations_company_delivery_unique
  UNIQUE (company_id, visma_delivery_no);