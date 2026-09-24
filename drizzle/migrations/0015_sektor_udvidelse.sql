CREATE OR REPLACE FUNCTION public.is_offentlig_kunde(_name text, _main_branch_code text, _is_public boolean, _institution_type institution_type)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  select coalesce(_is_public, false)
      or _institution_type is not null
      or left(coalesce(_main_branch_code,''), 2) = '84'
      or coalesce(_name,'') ~* '(kommune|\mregion\M|regionshospital|\mSKAT\M|politi|ministeri|styrelse|universitet|gymnasium|folkeskole|\mskole\M|skolen\M|hospital|sygehus|forsvar|departement|plejecenter|plejehjem|børnehus|børnehave|vuggestue|daginstitution|sundhedshus|jobcenter|rådhus|beredskab|kriminalforsorg|landsret|byret|domstol|trafikselskab|erhvervsskole|håndværkerskole|selvejende institution|center for hjerneskade)'
$function$;

INSERT INTO public.kundeprisgruppe_sektor (kode, sektor) VALUES ('89', 'offentlig') ON CONFLICT (kode) DO UPDATE SET sektor = EXCLUDED.sektor;