
CREATE TEMP TABLE company_canonical ON COMMIT DROP AS
WITH ranked AS (
  SELECT c.id, c.visma_id,
    row_number() OVER (PARTITION BY c.visma_id ORDER BY
      (EXISTS(SELECT 1 FROM public.locations l WHERE l.company_id=c.id AND l.visma_delivery_no=c.visma_id))::int DESC,
      c.created_at ASC, c.id ASC) AS rn
  FROM public.companies c WHERE c.visma_id IS NOT NULL AND btrim(c.visma_id) <> ''
)
SELECT visma_id, id AS canonical_id FROM ranked WHERE rn=1;

CREATE TEMP TABLE company_remap ON COMMIT DROP AS
SELECT c.id AS old_id, cc.canonical_id AS new_id
FROM public.companies c
JOIN company_canonical cc ON cc.visma_id = c.visma_id
WHERE c.id <> cc.canonical_id;

CREATE INDEX ON company_remap (old_id);
CREATE INDEX ON company_remap (new_id);

-- Berig canonical med manglende felter fra dubletter
WITH best AS (
  SELECT DISTINCT ON (r.new_id) r.new_id, d.*
  FROM company_remap r
  JOIN public.companies d ON d.id = r.old_id
  ORDER BY r.new_id,
    (d.cvr IS NOT NULL)::int DESC,
    (d.address IS NOT NULL)::int DESC,
    (d.city IS NOT NULL)::int DESC,
    d.created_at ASC
)
UPDATE public.companies cn SET
  cvr = COALESCE(cn.cvr, b.cvr),
  address = COALESCE(cn.address, b.address),
  zip = COALESCE(cn.zip, b.zip),
  city = COALESCE(cn.city, b.city),
  municipality = COALESCE(cn.municipality, b.municipality),
  industry = COALESCE(cn.industry, b.industry),
  employees = COALESCE(cn.employees, b.employees),
  phone = COALESCE(cn.phone, b.phone),
  email = COALESCE(cn.email, b.email),
  website = COALESCE(cn.website, b.website),
  contact_person = COALESCE(cn.contact_person, b.contact_person),
  visma_delivery_id = COALESCE(cn.visma_delivery_id, b.visma_delivery_id),
  ean_number = COALESCE(cn.ean_number, b.ean_number),
  parent_cvr = COALESCE(cn.parent_cvr, b.parent_cvr),
  institution_type = COALESCE(cn.institution_type, b.institution_type),
  is_public = COALESCE(cn.is_public, b.is_public),
  main_branch_code = COALESCE(cn.main_branch_code, b.main_branch_code),
  main_branch_text = COALESCE(cn.main_branch_text, b.main_branch_text),
  bi_branch_1_code = COALESCE(cn.bi_branch_1_code, b.bi_branch_1_code),
  bi_branch_2_code = COALESCE(cn.bi_branch_2_code, b.bi_branch_2_code),
  bi_branch_3_code = COALESCE(cn.bi_branch_3_code, b.bi_branch_3_code),
  cvr_p_enhed_count = COALESCE(cn.cvr_p_enhed_count, b.cvr_p_enhed_count),
  visma_notes = COALESCE(cn.visma_notes, b.visma_notes),
  binding_status = COALESCE(cn.binding_status, b.binding_status),
  customer_category = COALESCE(cn.customer_category, b.customer_category),
  last_purchase_date = GREATEST(cn.last_purchase_date, b.last_purchase_date),
  turnover_12m = COALESCE(cn.turnover_12m, b.turnover_12m)
FROM best b WHERE b.new_id = cn.id;

-- Drop kollisions-lokationer (samme delivery_no allerede på canonical)
DELETE FROM public.locations l USING company_remap r
WHERE l.company_id = r.old_id
  AND l.visma_delivery_no IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.locations l2
    WHERE l2.company_id = r.new_id AND l2.visma_delivery_no = l.visma_delivery_no
  );

DELETE FROM public.company_briefings cb USING company_remap r
WHERE cb.company_id = r.old_id
  AND EXISTS (SELECT 1 FROM public.company_briefings cb2 WHERE cb2.company_id = r.new_id);

DELETE FROM public.competitor_assignments ca USING company_remap r
WHERE ca.company_id = r.old_id
  AND EXISTS (
    SELECT 1 FROM public.competitor_assignments ca2
    WHERE ca2.company_id = r.new_id AND ca2.competitor_id = ca.competitor_id
  );

-- Nulstil is_primary på alle dublet-lokationer inden flytning (re-sættes nedenfor)
UPDATE public.locations l SET is_primary = false
FROM company_remap r WHERE l.company_id = r.old_id AND l.is_primary IS TRUE;

-- Re-pointer alle child-tabeller
UPDATE public.activities a SET company_id = r.new_id FROM company_remap r WHERE a.company_id = r.old_id;
UPDATE public.locations l SET company_id = r.new_id FROM company_remap r WHERE l.company_id = r.old_id;
UPDATE public.contacts c SET company_id = r.new_id FROM company_remap r WHERE c.company_id = r.old_id;
UPDATE public.company_briefings cb SET company_id = r.new_id FROM company_remap r WHERE cb.company_id = r.old_id;
UPDATE public.company_documents cd SET company_id = r.new_id FROM company_remap r WHERE cd.company_id = r.old_id;
UPDATE public.competitor_assignments ca SET company_id = r.new_id FROM company_remap r WHERE ca.company_id = r.old_id;
UPDATE public.contact_list_assignments cla SET company_id = r.new_id FROM company_remap r WHERE cla.company_id = r.old_id;
UPDATE public.notifications n SET company_id = r.new_id FROM company_remap r WHERE n.company_id = r.old_id;
UPDATE public.quotes q SET company_id = r.new_id FROM company_remap r WHERE q.company_id = r.old_id;
UPDATE public.sales_monthly sm SET company_id = r.new_id FROM company_remap r WHERE sm.company_id = r.old_id;
UPDATE public.sales_opportunities so SET company_id = r.new_id FROM company_remap r WHERE so.company_id = r.old_id;

-- Slet dublet-virksomheder
DELETE FROM public.companies c USING company_remap r WHERE c.id = r.old_id;

-- Markér korrekt primær-lokation: visma_delivery_no = virksomhedens visma_id
-- (først nulstil eksisterende på berørte virksomheder, så vi undgår to primære)
UPDATE public.locations l SET is_primary = false
FROM public.companies c
WHERE l.company_id = c.id
  AND c.visma_id IS NOT NULL AND btrim(c.visma_id) <> ''
  AND EXISTS (SELECT 1 FROM public.locations l2 WHERE l2.company_id = c.id AND l2.visma_delivery_no = c.visma_id)
  AND l.visma_delivery_no IS DISTINCT FROM c.visma_id
  AND l.is_primary IS TRUE;

UPDATE public.locations l SET is_primary = true
FROM public.companies c
WHERE l.company_id = c.id
  AND c.visma_id IS NOT NULL AND btrim(c.visma_id) <> ''
  AND l.visma_delivery_no = c.visma_id
  AND (l.is_primary IS DISTINCT FROM true);

CREATE UNIQUE INDEX IF NOT EXISTS companies_visma_id_unique
  ON public.companies (visma_id)
  WHERE visma_id IS NOT NULL AND btrim(visma_id) <> '';
