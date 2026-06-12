## Mål

1. Alle brugere kan selv skifte deres password (mens de er logget ind).
2. Brugere der har glemt deres password kan nulstille det via mail-link fra login-siden.
3. Admin ser **ikke** passwords (umuligt — Supabase gemmer kun bcrypt-hash. Dette er en hård sikkerhedsgrænse, ikke et Lovable-valg).

## Hvad der bygges

### 1. Selvbetjening: skift password (logget ind)
Ny side `/profil/password`:
- Felter: Nyt password, Bekræft nyt password.
- Validering: min. 8 tegn, de to felter skal matche.
- Knapper: "Skift adgangskode" + "Annuller".
- Kald `supabase.auth.updateUser({ password })`.
- Toast ved success/fejl.
- Link til siden tilføjes i top-nav user-menuen ("Skift adgangskode").

### 2. "Glemt password?" på login
- Tilføj link "Glemt adgangskode?" under login-formularen på `/login`.
- Ny side `/glemt-password`:
  - Mail-felt + knap "Send nulstillingsmail".
  - Kald `supabase.auth.resetPasswordForEmail(email, { redirectTo: '${origin}/reset-password' })`.
  - Viser bekræftelse: "Hvis kontoen findes, har vi sendt en mail."
- Ny side `/reset-password` (offentlig, ikke bag auth-gate):
  - Læser recovery-session fra URL'en automatisk (Supabase håndterer dette via `onAuthStateChange` event `PASSWORD_RECOVERY`).
  - Viser nyt-password-formular → `supabase.auth.updateUser({ password })`.
  - Efter success: redirect til `/dashboard`.

### 3. Hvad sker der med mailen?
Supabase Auth sender automatisk standard reset-password-mail via Lovable Cloud — virker uden ekstra opsætning. Mailen kommer fra en `noreply@...lovable...`-adresse med standard-tekst på engelsk.

**Hvis I vil have mail fra `@frellsen.dk` med dansk tekst og logo**, kræver det et email-domæne (DNS-records på frellsen.dk) + branding af auth-templates. Det er et separat, valgfrit skridt jeg kan tage bagefter — sig til.

### 4. Hvad Admin **kan** (og ikke kan)
- **Kan ikke:** se klartekst-passwords. Hverken nu eller efter denne ændring. Passwords er hashed.
- **Kan i dag (uændret):** oprette brugere, ændre rolle/region (admin/brugere-siden).
- **Bygges ikke nu:** admin-knap til at sende reset-mail / sætte midlertidigt password (jf. svar "ingen admin-knap"). Hvis en bruger ikke kan logge ind, bruger de selv "Glemt adgangskode?"-flowet.

## Sikkerhed
- Reset-password-siden er offentlig (skal være — brugeren er ikke logget ind endnu), men kræver gyldig recovery-token fra mail-linket. Uden token kan siden ikke ændre password.
- `/profil/password` ligger under `_authenticated`.
- Ingen ændring af RLS, tabeller eller server-funktioner.

## Tekniske detaljer
- Filer der oprettes:
  - `src/routes/_authenticated/profil.password.tsx`
  - `src/routes/glemt-password.tsx`
  - `src/routes/reset-password.tsx`
- Filer der ændres:
  - `src/routes/login.tsx` (tilføj "Glemt adgangskode?"-link)
  - Top-nav komponenten (tilføj "Skift adgangskode"-link i bruger-menuen)
- Ingen migrationer, ingen secrets.
