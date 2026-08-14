# Registrér aktivitet direkte ved oprettelse af virksomhed

## Hvorfor noten forsvinder i dag

Note-feltet i "Opret virksomhed" forsøger at gemme en aktivitet med typen `note` og et felt `activity_date`. Ingen af de to findes i databasen (typerne er bl.a. telefonopkald, besøg, email, møde, ikke truffet, opfølgning aftalt, andet — og datoen sættes automatisk). Gemningen fejler derfor hver gang, og teksten ender ingen steder. Kun en lille gul advarsel bliver vist, som er nem at overse.

## Forslag

Erstat det løse note-felt med en rigtig "Registrér aktivitet"-blok nederst i opret-dialogen, så første kontakt bliver dokumenteret som en aktivitet på samme måde som alle andre besøg og opkald:

1. **Aktivitetstype** — samme ikon-knapper som i den normale "Registrér aktivitet"-dialog (Telefonopkald, Besøg, Email, Møde, Ikke truffet, Opfølgning aftalt, Andet). Forvalgt: Telefonopkald.
2. **Note** — samme tekstfelt som i dag, men nu knyttet til den valgte type.
3. **Færdig / næste skridt** — to valg:
   - *Færdig hos kunden* (ingen opfølgning) — aktiviteten gemmes uden opfølgningsdato.
   - *Følg op* — vælg dato (hurtigvalg: i morgen / 1 uge / 1 måned / egen dato) + kort tekst til "næste handling".
4. Hele blokken er frivillig. Er der ingen type/note valgt, oprettes virksomheden som nu — men uden fejlbesked.
5. Fejler aktiviteten alligevel, vises en tydelig fejl (ikke en let overset advarsel), og virksomheden er stadig oprettet.

Efter gem: samme flow som i dag — man lander på virksomhedskortet, hvor aktiviteten nu er synlig i aktivitetslisten, og eventuel opfølgning tæller med i "Mit overblik".

## Teknisk

- Fil: `src/components/opret-virksomhed-dialog.tsx`.
- Genbrug `ACTIVITY_TYPES` fra `src/lib/activity-types.ts` til type-vælgeren, så ikoner/farver matcher resten af appen.
- Ret insert i `activities` til: `company_id`, `created_by`, `activity_type` (gyldig enum-værdi), `note`, `next_action`, `next_followup_date`. Fjern `activity_date` og typen `note`.
- Ingen database-ændringer nødvendige; tabellen `activities` har allerede alle felter.
- Ingen ændring i det eksisterende CVR-søge-trin.

## Bemærkning: eksisterende byggefejl

Uafhængigt af ovenstående fejler typetjekket lige nu på 5 steder, fordi `/login`-ruten kræver en `next`-søgeparameter, mens `_authenticated.tsx`, `glemt-password.tsx` og `index.tsx` linker/navigerer til `/login` uden den. Rettes som første skridt ved at gøre `next` valgfri i `validateSearch` i `src/routes/login.tsx` (og læse den med fallback til tom streng).
