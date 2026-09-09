REVOKE ALL ON FUNCTION public.bonus_maskin_grundlag(uuid, date, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.bonus_pr_maaned(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bonus_db_detaljer(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.bonus_maskin_detaljer(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bonus_pr_maaned(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bonus_db_detaljer(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bonus_maskin_detaljer(uuid, date, date) TO authenticated;