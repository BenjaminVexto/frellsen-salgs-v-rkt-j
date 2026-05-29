UPDATE public.competitors
SET notes_updated_by = created_by,
    notes_updated_at = COALESCE(notes_updated_at, created_at)
WHERE notes IS NOT NULL
  AND notes_updated_by IS NULL
  AND created_by IS NOT NULL;