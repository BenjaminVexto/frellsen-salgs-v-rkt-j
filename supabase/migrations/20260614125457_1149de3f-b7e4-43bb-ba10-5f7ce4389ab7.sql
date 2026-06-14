-- Genberegn rabat_kategori med udvidet match og pg2='0'-fallback til pg3.
WITH src AS (
  SELECT
    id,
    NULLIF(NULLIF(trim(COALESCE(produktprisgruppe3,'')),''),'0') AS pg3,
    NULLIF(NULLIF(trim(COALESCE(produktprisgruppe2,'')),''),'0') AS pg2,
    COALESCE(beskrivelse,'') AS besk,
    COALESCE(produktprisgruppe2,'') || ' ' || COALESCE(produktprisgruppe3,'') AS codestr
  FROM public.agreement_pricing
),
classified AS (
  SELECT
    id,
    CASE
      -- pg3
      WHEN pg3 ~* '(^|[[:space:]\-_/(),.\[\]])h\.?b($|[[:space:]\-_/(),.\[\]0-9])' THEN 'Hele bønner'
      WHEN pg3 ~* '(^|[[:space:]\-_/(),.\[\]])vac($|[[:space:]\-_/(),.\[\]0-9])' THEN 'VAC kaffe'
      WHEN pg3 ~* '(^|[[:space:]\-_/(),.\[\]])instant($|[[:space:]\-_/(),.\[\]0-9])' THEN 'Instant'
      WHEN pg3 ~* '(^|[[:space:]\-_/(),.\[\]])(chokolade|flødeboller)($|[[:space:]\-_/(),.\[\]])' THEN 'Chokolade'
      WHEN pg3 ~* '(^|[[:space:]\-_/(),.\[\]])te($|[[:space:]\-_/(),.\[\]])' THEN 'Te'
      -- pg2
      WHEN pg2 ~* '(^|[[:space:]\-_/(),.\[\]])h\.?b($|[[:space:]\-_/(),.\[\]0-9])' THEN 'Hele bønner'
      WHEN pg2 ~* '(^|[[:space:]\-_/(),.\[\]])vac($|[[:space:]\-_/(),.\[\]0-9])' THEN 'VAC kaffe'
      WHEN pg2 ~* '(^|[[:space:]\-_/(),.\[\]])instant($|[[:space:]\-_/(),.\[\]0-9])' THEN 'Instant'
      WHEN pg2 ~* '(^|[[:space:]\-_/(),.\[\]])(chokolade|flødeboller)($|[[:space:]\-_/(),.\[\]])' THEN 'Chokolade'
      WHEN pg2 ~* '(^|[[:space:]\-_/(),.\[\]])te($|[[:space:]\-_/(),.\[\]])' THEN 'Te'
      -- beskrivelse
      WHEN besk ~* '(^|[[:space:]\-_/(),.\[\]])h\.?b($|[[:space:]\-_/(),.\[\]0-9])' THEN 'Hele bønner'
      WHEN besk ~* '(^|[[:space:]\-_/(),.\[\]])vac($|[[:space:]\-_/(),.\[\]0-9])' THEN 'VAC kaffe'
      WHEN besk ~* '(^|[[:space:]\-_/(),.\[\]])instant($|[[:space:]\-_/(),.\[\]0-9])' THEN 'Instant'
      WHEN besk ~* '(^|[[:space:]\-_/(),.\[\]])(chokolade|flødeboller)($|[[:space:]\-_/(),.\[\]])' THEN 'Chokolade'
      WHEN besk ~* '(^|[[:space:]\-_/(),.\[\]])te($|[[:space:]\-_/(),.\[\]])' THEN 'Te'
      -- produktgruppe-kode
      WHEN codestr ~ '(^|\D)78(\D|$)' THEN 'Maskiner'
      WHEN codestr ~ '(^|\D)79(\D|$)' THEN 'Tilbehør'
      ELSE 'Øvrige'
    END AS new_kat
  FROM src
)
UPDATE public.agreement_pricing ap
SET rabat_kategori = c.new_kat
FROM classified c
WHERE ap.id = c.id
  AND ap.rabat_kategori IS DISTINCT FROM c.new_kat;