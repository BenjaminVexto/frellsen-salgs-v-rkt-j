## Mål

Når en virksomhed (fx Centrica) har maskiner men forbrugsvarerne købes via en anden konto (fx Serwiz/kantineoperatør), skal vi kunne registrere koblingen så Centrica IKKE fejlagtigt vises som "kunde på vej væk", og så salg-fanen viser "Forbrugsvarer leveres via Serwiz". Parser foreslår — admin/sælger bekræfter type.

## 1) Database (1 migration)

**Ny tabel `company_relations`** (bekræftede relationer — fælles fakta):
- `from_company_id`, `to_company_id`, `relation_type` enum (`forsynes_af`, `leverer_til`, `maskiner_paa`, `efterfoelger`), `note`, `created_by`, `created_at`
- Unik(from, to, relation_type)
- RLS: alle authenticated kan læse; INSERT/UPDATE/DELETE for authenticated (sælgere må også oprette — fælles fakta)
- Når man opretter `forsynes_af A→B`, opret automatisk den inverse `leverer_til B→A` (i serverFn, ikke trigger)

**Ny tabel `company_relation_suggestions`** (parser-forslag, afventer bekræftelse):
- `from_company_id`, `to_visma_id` (rå kundenr fundet), `to_company_id` (matchet hvis muligt), `source_text` (rå bemærkning), `status` (`pending`/`confirmed`/`rejected`), `resolved_by`, `resolved_at`
- RLS: alle authenticated read/write
- Unik(from_company_id, to_visma_id) for at undgå dubletter

## 2) Parser (`src/lib/relation-suggestions.server.ts`)

Funktion `extractKundenrReferences(notesText, ownVismaId)` → returnerer array af unikke 6-7-cifrede kundenumre (ikke ownVismaId). Regex matcher mønstre: `\b(?:nr\.?|K-|kund(?:e)?\s*nr\.?|via|på)\s*[K\-]?\s*(\d{6,7})\b` samt løs `\b(\d{7})\b` i sætninger med "varer", "maskine", "kantine", "forbrugsvar". Returnerer matches.

**Hvor køres parser:** Tilføj en serverFn `rescanRelationSuggestions` (admin) der scanner alle `companies.visma_notes` og opretter pending suggestions. Kald den også fra CVR/Visma-importflows efter upsert (best-effort, ikke-blokerende). For nu: én admin-knap på Importhistorik eller admin/overblik. **Minimal scope:** kun den admin-knap + manuel kørsel.

## 3) ServerFns (`src/lib/relations.functions.ts`)

- `getCompanyRelations(companyId)` — returnerer både bekræftede relationer (in/out) + pending suggestions for virksomheden, med modpart navn/by/visma_id
- `confirmRelationSuggestion({suggestionId, relationType})` — opretter row i `company_relations`, opretter inverse hvis `forsynes_af`/`leverer_til`, sætter suggestion status=confirmed
- `rejectRelationSuggestion(suggestionId)` — status=rejected
- `deleteCompanyRelation(relationId)` — fjerner + inverse
- `rescanRelationSuggestions()` (admin) — kører parser over alle virksomheder, upsert nye pending forslag
- `getCompaniesSuppliedByOthers(companyIds)` — hjælper: returnerer Set af company_ids som har bekræftet `forsynes_af`

## 4) Churning-undtagelse (`src/lib/sales.functions.ts`)

I `getMyChurningCustomers`: efter candidates-listen, hent confirmed `forsynes_af` relationer for `candIds`. Fjern dem fra listen — sammen med dismissals.

## 5) UI

**Relationer-fane (`virksomheder_.$id.tsx`):** ny komponent `<ForsyningsRelationerSektion companyId />`:
- Top: "Forslag fra import" — liste af pending suggestions med "Fundet i bemærkning: '…'", dropdown for type + Bekræft/Afvis-knapper
- Under: "Forsynings-relationer" — bekræftede in/out, med link til den anden virksomhed og slet-knap
- Tom-state hvis intet

**Salg-fanen:** I `company-sales-tab.tsx`, hvis virksomheden har `forsynes_af X`, vis banner: "ℹ️ Forbrugsvarer leveres via [X] (kantineoperatør)" med link.

**Admin (kort):** I `admin.overblik.tsx` eller `admin.importhistorik.tsx` knap "Scan bemærkninger for relations-forslag" → kalder `rescanRelationSuggestions` + viser toast med antal nye forslag.

## 6) Hvad der ikke ændres

- Salgstal/gruppering uændret (kaffe bogføres fortsat på Serwiz)
- Churning grundberegning uændret — kun undtagelse for `forsynes_af`-koblede tilføjes
- Søsterselskaber/kontaktpersoner på Relationer-fanen forbliver

## Tekniske detaljer

- Parser kører IKKE ved hver page load — kun via admin-knap (senere kan integreres i import-pipelines)
- Match `to_visma_id` → `to_company_id` via `companies.visma_id` lookup når forslag oprettes; gem også når companies ændres senere (best-effort: hvis null vises forslag stadig med rå kundenr)
- Auto-opret inverse relation: `forsynes_af A→B` ⇒ også `leverer_til B→A` (samme metadata, så de altid følges ad ved sletning)
- Visma-notater allerede i `companies.visma_notes` (text-felt)