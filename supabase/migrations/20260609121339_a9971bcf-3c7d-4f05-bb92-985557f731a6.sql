-- Idempotency safety net: remove existing duplicates then add unique constraint
DELETE FROM public.company_relations a
USING public.company_relations b
WHERE a.ctid < b.ctid
  AND a.from_company_id = b.from_company_id
  AND a.to_company_id = b.to_company_id
  AND a.relation_type = b.relation_type;

ALTER TABLE public.company_relations
  ADD CONSTRAINT company_relations_unique_triple
  UNIQUE (from_company_id, to_company_id, relation_type);