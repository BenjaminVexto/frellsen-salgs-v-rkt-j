
- Målepunkter, portefølje og bonus læser salg fra sales_kunde_maaned/company_mp_info, som holdes ajour af triggere på sales_monthly og companies — så tallene er hurtige og aldrig skal genberegnes manuelt.
- Store serverfunktionssvar (portefølje) sendes som én JSON-streng, fordi TanStack Start begrænser antal serialiseringsposter pr. svar.
