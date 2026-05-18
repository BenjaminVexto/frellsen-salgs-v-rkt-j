-- Filter templates table
CREATE TABLE public.filter_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  filter_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.filter_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin styrer filter_templates"
ON public.filter_templates
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

-- Add purpose/instruction to contact_lists (admin note for sellers)
ALTER TABLE public.contact_lists
  ADD COLUMN IF NOT EXISTS purpose TEXT;