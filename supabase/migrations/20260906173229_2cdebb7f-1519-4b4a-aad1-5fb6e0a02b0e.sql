ALTER TABLE public.activities
  ADD CONSTRAINT activities_created_by_profiles_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE NO ACTION;