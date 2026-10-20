DO $$ DECLARE f text; BEGIN
 f:=pg_get_functiondef('public.bonus_maskin_grundlag(uuid,date,date)'::regprocedure);
 f:=replace(f,'LANGUAGE plpgsql','LANGUAGE sql'); EXECUTE f;
END $$;
-- Monthly totals keep their existing SQL and consume cached basis through bonus_maskin_grundlag.
-- Internal refresh must not be callable anonymously through SECURITY DEFINER.
REVOKE ALL ON FUNCTION public.bonus_maskin_genberegn() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bonus_maskin_genberegn() TO service_role;