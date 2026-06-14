-- Genberegn rabat_kategori med forbedret HB/VAC/Instant-match i beskrivelse.
-- Prioritet: produktprisgruppe3 → produktprisgruppe2 → beskrivelse, derefter kode 78/79.
WITH recomputed AS (
  SELECT
    id,
    CASE
      -- pg3
      WHEN produktprisgruppe3 ~* '(^|[[:space:]\-_/(),.])h\.?b($|[[:space:]\-_/(),.0-9])' THEN 'Hele bønner'
      WHEN produktprisgruppe3 ~* '(^|[[:space:]\-_/(),.])vac($|[[:space:]\-_/(),.0-9])' THEN 'VAC kaffe'
      WHEN produktprisgruppe3 ~* '(^|[[:space:]\-_/(),.])instant($|[[:space:]\-_/(),.0-9])' THEN 'Instant'
      -- pg2
      WHEN produktprisgruppe2 ~* '(^|[[:space:]\-_/(),.])h\.?b($|[[:space:]\-_/(),.0-9])' THEN 'Hele bønner'
      WHEN produktprisgruppe2 ~* '(^|[[:space:]\-_/(),.])vac($|[[:space:]\-_/(),.0-9])' THEN 'VAC kaffe'
      WHEN produktprisgruppe2 ~* '(^|[[:space:]\-_/(),.])instant($|[[:space:]\-_/(),.0-9])' THEN 'Instant'
      -- beskrivelse
      WHEN beskrivelse ~* '(^|[[:space:]\-_/(),.])h\.?b($|[[:space:]\-_/(),.0-9])' THEN 'Hele bønner'
      WHEN beskrivelse ~* '(^|[[:space:]\-_/(),.])vac($|[[:space:]\-_/(),.0-9])' THEN 'VAC kaffe'
      WHEN beskrivelse ~* '(^|[[:space:]\-_/(),.])instant($|[[:space:]\-_/(),.0-9])' THEN 'Instant'
      -- produktgruppe-kode 78 / 79
      WHEN (COALESCE(produktprisgruppe2,'') || ' ' || COALESCE(produktprisgruppe3,'')) ~ '(^|\D)78(\D|$)' THEN 'Maskiner'
      WHEN (COALESCE(produktprisgruppe2,'') || ' ' || COALESCE(produktprisgruppe3,'')) ~ '(^|\D)79(\D|$)' THEN 'Tilbehør'
      ELSE 'Øvrige'
    END AS new_kat
  FROM public.agreement_pricing
)
UPDATE public.agreement_pricing ap
SET rabat_kategori = r.new_kat
FROM recomputed r
WHERE ap.id = r.id
  AND ap.rabat_kategori IS DISTINCT FROM r.new_kat;