## Mål

På Dashboard (`/dashboard`) skal de to kort:
- "Nuværende kunder – aftaler udløber"
- "Potentielle emner – konkurrentaftaler udløber"

kun vise virksomheder, hvor `companies.assigned_to = den aktuelle bruger`.
Admin ser fortsat alt (samme princip som Min Portefølje).

I dag henter `expiringDocsQuery` i `dashboard.tsx` alle udløbsdokumenter og
alle konkurrentaftaler uden at filtrere på sælger — derfor ser sælgeren også
virksomheder, der hører til kolleger.

## Ændring

Fil: `src/routes/_authenticated/dashboard.tsx`

1. Hent rolle fra `useAuth()` (allerede tilgængelig) — `isAdmin = auth.role === "admin"`.
2. I `expiringDocsQuery`:
   - For ikke-admin: hent først `companies.id` hvor `assigned_to = userId`
     (pagineret som i `portfolio.functions.ts`, så vi ikke rammer 1000-loftet),
     og tilføj `.in("company_id", ids)` på begge underforespørgsler
     (`company_documents` og `competitor_assignments`).
   - Hvis brugeren ingen tildelte virksomheder har, returnér tomme lister
     uden at kalde de to forespørgsler.
   - For admin: ingen ekstra filtrering (uændret adfærd).
3. Tilføj `isAdmin` til `queryKey`, så cache er korrekt pr. rolle.

Ingen ændringer i UI, ingen ændringer i `portfolio.functions.ts`
(Min Portefølje er allerede korrekt scoped), ingen migrations.

## Teknisk note

- Filtrering sker klient-side i samme query — RLS forhindrer ikke læsning på
  tværs af sælgere på disse tabeller i dag, så vi laver eksplicit
  sælger-scope i forespørgslen som i `portfolio.functions.ts`.
- Vi bevarer `.slice(0, 10)` cap pr. liste.
