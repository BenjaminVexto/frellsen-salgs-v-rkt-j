CREATE TABLE public.distrikter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  navn text NOT NULL,
  saelger_user_id uuid NULL,
  daekkes_af_user_id uuid NULL,
  landsdel text NULL CHECK (landsdel IN ('Øst','Vest')),
  farve text NOT NULL DEFAULT '#888888',
  sort int NOT NULL DEFAULT 0,
  aktiv boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distrikter TO authenticated;
GRANT ALL ON public.distrikter TO service_role;
ALTER TABLE public.distrikter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin alt distrikter" ON public.distrikter FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.distrikt_flade (
  flade int PRIMARY KEY REFERENCES public.postnummer_flader(flade),
  distrikt_id uuid NOT NULL REFERENCES public.distrikter(id),
  opdateret_af uuid NULL,
  opdateret_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distrikt_flade TO authenticated;
GRANT ALL ON public.distrikt_flade TO service_role;
ALTER TABLE public.distrikt_flade ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin alt distrikt_flade" ON public.distrikt_flade FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.distrikt_flade_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flade int NOT NULL,
  fra_distrikt_id uuid NULL,
  til_distrikt_id uuid NULL,
  udfoert_af uuid NULL,
  udfoert_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.distrikt_flade_log TO authenticated;
GRANT ALL ON public.distrikt_flade_log TO service_role;
ALTER TABLE public.distrikt_flade_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin læs log" ON public.distrikt_flade_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin skriv log" ON public.distrikt_flade_log FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.salgskort_indstilling (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  kam_kpg3 text[] NOT NULL DEFAULT '{40,30,35,15}',
  opdateret_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.salgskort_indstilling TO authenticated;
GRANT ALL ON public.salgskort_indstilling TO service_role;
ALTER TABLE public.salgskort_indstilling ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin læs indst" ON public.salgskort_indstilling FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admin ret indst" ON public.salgskort_indstilling FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
INSERT INTO public.salgskort_indstilling (id) VALUES (1);

-- Log hver ændring automatisk
CREATE OR REPLACE FUNCTION public._distrikt_flade_log() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO distrikt_flade_log(flade, fra_distrikt_id, til_distrikt_id, udfoert_af) VALUES (OLD.flade, OLD.distrikt_id, NULL, auth.uid());
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.distrikt_id IS NOT DISTINCT FROM NEW.distrikt_id THEN RETURN NEW; END IF;
  INSERT INTO distrikt_flade_log(flade, fra_distrikt_id, til_distrikt_id, udfoert_af)
  VALUES (NEW.flade, CASE WHEN TG_OP='UPDATE' THEN OLD.distrikt_id END, NEW.distrikt_id, auth.uid());
  RETURN NEW;
END $$;
CREATE TRIGGER trg_distrikt_flade_log AFTER INSERT OR UPDATE OR DELETE ON public.distrikt_flade
  FOR EACH ROW EXECUTE FUNCTION public._distrikt_flade_log();