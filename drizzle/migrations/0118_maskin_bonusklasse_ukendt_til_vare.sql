-- Ukendte maskintyper giver NULL, så varens bonusklasse bruges; uden den er maskinen uklassificeret.
CREATE OR REPLACE FUNCTION public.maskin_bonusklasse(_type text, _maaned date)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $$
  SELECT CASE
    WHEN nullif(btrim(coalesce(_type, '')), '') IS NULL THEN NULL
    WHEN _type ~* 'optivend|bonamat|bolero|jclass|h2omy|niagara|futurmat' THEN 'ingen'
    WHEN _type ~* 'kalerm' THEN 'kalerm'
    WHEN _type ~* 'profitec|espresso' THEN 'espresso'
    WHEN _type ~* 'animo|optibean|optime' THEN 'animo'
    WHEN _type ~* 'rex' THEN 'rex'
    WHEN _type ~* '^gaggia g300|wittenborg|^(w100|95|9100|9000)' THEN 'wittenborg'
    ELSE NULL
  END
$$;