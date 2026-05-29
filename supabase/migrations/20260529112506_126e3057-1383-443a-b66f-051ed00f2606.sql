ALTER TABLE public.competitors
  ADD COLUMN IF NOT EXISTS notes_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes_updated_by uuid REFERENCES public.profiles(id);