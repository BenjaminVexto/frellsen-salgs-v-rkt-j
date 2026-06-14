
# "Se som sælger" — read-only impersonation for admins

Admins kan vælge en sælger i navn-dropdown'en og se hele appen præcis som den sælger ser den. Alle data-ændrende handlinger er skjult/deaktiverede, og en fast banner viser at man er i view-mode.

## Adgang og sikkerhedsmodel

- Funktionen er kun synlig i UI for admins.
- Server-side: hver server-funktion der respekterer en `viewAsUserId`-parameter, tjekker selv at kalderen er admin via `is_admin(auth.uid())`/`user_roles`. Sælgere kan ikke "snyde" — kalder de en serverfn med `viewAsUserId`, ignoreres feltet og deres egen `userId` bruges.
- Server-side på mutationer: serverfns der opretter/ændrer/sletter data accepterer ikke `viewAsUserId` overhovedet — de skriver altid som den faktiske, indloggede bruger. Det er den hårde garanti for "read-only".

## Client-state

Ny `ViewAsContext` (provider monteret i `_authenticated.tsx`):

- `viewAsUserId: string | null`
- `viewAsName: string | null`
- `isImpersonating: boolean` (afledt: admin + viewAsUserId != null)
- `setViewAs(id, name)` / `clearViewAs()`
- Persisteres i `sessionStorage` så et refresh ikke smider valget; ryddes ved logout.

Ny hook `useEffectiveUser()` returnerer `{ effectiveUserId, isImpersonating, isAdmin }`. Bruges alle steder hvor data hentes per sælger.

## UI-ændringer

1. **Dropdown i sidemenuen** (`_authenticated.tsx`): admin-only menupunkt "👁 Se som sælger…" åbner en `Command`-dialog (shadcn) med søgbar liste af sælgere — henter `sellerOptions` fra ny serverfn `listSellers` (admin-only, returnerer `{ id, full_name, region }`).
2. **Banner** (`ViewAsBanner` komponent): `sticky top-0 z-40` rød/orange bjælke øverst i `<main>`, vises kun når `isImpersonating`. Tekst: "👁 Du ser som **Malene Tønnersen** (read-only)" + knap "Tilbage til admin". Den ligger inde i hovedindholdsområdet så den scroller med, men er sticky øverst i scroll-containeren — altid synlig på skærmen. (Sidebar er sticky fra forrige ændring.)
3. **Mutations-gate**: ny hook `useCanMutate()` = `!isImpersonating`. Bruges i alle steder med skrivehandlinger:
   - `RegistrerAktivitetDialog`, `SkrivMailDialog`, `OpretVirksomhedDialog`, `AddRelationDialog`, `AssignToListDialog`, `DismissChurnDialog`, opret/rediger salgsmulighed, rediger aftale, slet-knapper m.fl.
   - Strategi: vis knappen som `disabled` med tooltip "Read-only — du ser som en anden sælger". Det er mere tydeligt end at skjule.
   - Et lille util-component `<MutationGate>` wrapper knapper for at undgå at duplikere tooltip-logik.

## Server-side ændringer

Mønstret findes allerede i `getMyPortfolio` (admin kan sende `sellerId`). Det skal udvides konsekvent:

1. **Ny serverfn `listSellers`** i `src/lib/admin-users.functions.ts` — admin-only, returnerer aktive sælgere.
2. **Helper `resolveEffectiveUserId(context, requestedViewAsId)`** i `src/lib/sales-utils.ts` (server-side variant):
   - Hvis `requestedViewAsId == null` → returnér `context.userId`.
   - Ellers tjek `is_admin(context.userId)`; hvis admin → returnér `requestedViewAsId`, ellers `context.userId`.
3. **Læse-serverfns** der i dag bruger `context.userId` til at scope per sælger får en `viewAsUserId?: string`-parameter og bruger helperen:
   - `src/lib/portfolio.functions.ts` (eksisterer allerede, harmoniseres til samme felt-navn).
   - `src/lib/sales.functions.ts` — relevant fns: dashboard-feeds, lister, opportunities-list, churning customers.
   - Notifikationer er personlige til admin og scopes ikke om.
4. **Mutations-serverfns** ændres IKKE. De fortsætter med `context.userId`. Hvis en frontend-bug skulle få en knap igennem, skriver serveren stadig som admin — ikke som sælgeren — så data-integritet er garanteret.

## Filer der ændres / oprettes

Nye:
- `src/contexts/view-as-context.tsx` — provider + hook.
- `src/components/view-as-banner.tsx` — sticky banner.
- `src/components/view-as-picker-dialog.tsx` — Command-dialog med sælger-søgning.
- `src/components/mutation-gate.tsx` — wrapper der disabler children + tooltip.
- `src/hooks/use-can-mutate.ts` — lille hook.

Ændres:
- `src/routes/_authenticated.tsx` — provider, dropdown-item, banner-mount.
- `src/lib/admin-users.functions.ts` — `listSellers`.
- `src/lib/sales-utils.ts` — `resolveEffectiveUserId` (server) + invalidation key helper.
- `src/lib/portfolio.functions.ts` — bruge fælles helper, sikre query-key inkluderer `viewAsUserId`.
- `src/lib/sales.functions.ts` — tilføj `viewAsUserId` til relevante læs-fns.
- Dashboard / lister / salgsstatistik / opportunities routes — videresende `viewAsUserId` fra context til serverfn-kald og inkludere det i `queryKey` så cachen ikke krydsforurener.
- Komponenter med mutations-knapper — wrap i `MutationGate` (eller pass `disabled={!canMutate}`).

## Query-cache

Alle queryKeys for sælger-scoped data udvides med `viewAsUserId` (eller `effectiveUserId`). Skift af sælger trigger derved automatisk en frisk fetch uden manuel invalidation. Ved `clearViewAs()` invalideres queries én gang for at lande tilbage på admins eget data hurtigt.

## Hvad jeg IKKE rører

- Eksisterende admin-overblik, salgsintelligens, importflader — admin's egne admin-værktøjer skal ikke "blive til sælger-værktøjer". Banneret er der, men admin-only ruter omdirigerer ikke; admin kan navigere væk og handlinger virker stadig (det er admins egne, ikke sælgerens).
  - Alternativ hvis du foretrækker: bloker admin-ruter mens impersonating. Sig til hvis det skal med.
- Edge-cases som realtime-subscriptions filtrerer pt. ikke på user_id; ingen ændring.

## Bekræft inden jeg bygger

1. Skal admin-only ruter (`/admin/*`, `/salgsintelligens`) være **tilgængelige** eller **skjulte** mens admin ser som sælger? Mit forslag: skjul dem fra sidemenuen i den tilstand, men behold rute-adgang (admin kan stadig browse direkte). Banneret minder om tilstanden.
2. Skal mutations-knapper **skjules helt** eller **vises som disabled med tooltip**? Mit forslag: disabled + tooltip — så sælgerens reelle UI er genkendeligt.
3. Skal "Mit overblik" / "Min salgsstatistik" titler skifte til fx "Malene Tønnersens overblik" mens impersonating? Mit forslag: ja, lille præfiks-tekst på siderne så det er entydigt sammen med banneret.
