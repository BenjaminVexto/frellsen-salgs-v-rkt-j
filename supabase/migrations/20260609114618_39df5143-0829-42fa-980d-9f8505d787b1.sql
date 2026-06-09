
CREATE TYPE public.company_relation_type AS ENUM ('forsynes_af', 'leverer_til', 'maskiner_paa', 'efterfoelger');
CREATE TYPE public.relation_suggestion_status AS ENUM ('pending', 'confirmed', 'rejected');

CREATE TABLE public.company_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  to_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  relation_type public.company_relation_type NOT NULL,
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_company_id, to_company_id, relation_type),
  CHECK (from_company_id <> to_company_id)
);
CREATE INDEX company_relations_from_idx ON public.company_relations(from_company_id);
CREATE INDEX company_relations_to_idx ON public.company_relations(to_company_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_relations TO authenticated;
GRANT ALL ON public.company_relations TO service_role;
ALTER TABLE public.company_relations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read relations" ON public.company_relations FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert relations" ON public.company_relations FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update relations" ON public.company_relations FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete relations" ON public.company_relations FOR DELETE TO authenticated USING (true);

CREATE TABLE public.company_relation_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  to_visma_id text NOT NULL,
  to_company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  source_text text,
  status public.relation_suggestion_status NOT NULL DEFAULT 'pending',
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (from_company_id, to_visma_id)
);
CREATE INDEX company_relation_suggestions_from_idx ON public.company_relation_suggestions(from_company_id);
CREATE INDEX company_relation_suggestions_status_idx ON public.company_relation_suggestions(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_relation_suggestions TO authenticated;
GRANT ALL ON public.company_relation_suggestions TO service_role;
ALTER TABLE public.company_relation_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read suggestions" ON public.company_relation_suggestions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert suggestions" ON public.company_relation_suggestions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "auth update suggestions" ON public.company_relation_suggestions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete suggestions" ON public.company_relation_suggestions FOR DELETE TO authenticated USING (true);
