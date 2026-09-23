# Ret timeout i Min salgsstatistik

## Ændring
- Start kun den tunge porteføljeberegning, når fanen **Portefølje** faktisk er valgt.
- Undgå at Målepunkter og den skjulte Portefølje-fane belaster databasen samtidigt ved første visning.
- Bevar alle eksisterende tal, filtre og adgangsregler.

## Kontrol
- Åbn Min salgsstatistik på Målepunkter og bekræft, at porteføljekaldet ikke starter.
- Vælg Portefølje og bekræft, at data indlæses uden timeout eller blank side.
- Kontrollér den aktuelle bygge- og runtime-status.

## Teknisk
Den eksisterende forespørgsel styres med fanens aktive tilstand. Ingen tabeller, policies eller beregningsregler ændres.
