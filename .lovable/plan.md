# Undersøgelse: aftaletype 2 og "Midlertidig udlån" (kun læsning)

## 1. Aftaletyper i aktive serviceregister-rækker

| Kilde | Aftaletype | Antal |
|---|---|---|
| m/service | 1 [Serviceaftale] | 3.204 |
| m/service | 4 [Lejeaftale] | 1.780 |
| m/service | 0 | 77 |
| u/serviceaftale | 0 | 2.670 |
| u/serviceaftale | 4 [Lejeaftale] | 166 |
| u/serviceaftale | 2 [Lejeaftale - betaler filter] | 116 |
| u/serviceaftale | 1 [Serviceaftale] | 6 |

## 2. Kode 2 (116 rækker, alle i u/serviceaftale)
- Lejedato udfyldt: 33 · binding: 0 · købt dato: 2 · "Midlertidig udl": 0
- Maskintyper: Bonamat 10 l (59), Bonamat 5 l (50), Animo OptiVend 11s TS (4), Bonamat 20 l (2), Bunn ICBA (1)
- I maskinregistret: 101 af 116 findes der — 4 [Udlån] 68, 3 [Leje / Leasing] 28, 5 [Leje u/b] 5; 15 findes ikke

## 3. Eksempler på kode 2
| Serienr. | Maskine | Kunde | Lejedato | Reservedele | Status |
|---|---|---|---|---|---|
| 020000284755 | Bonamat 10 l | Danish Crown A/S | 2003-03-20 | 3 [Aftale u/Filter] | Filterskift |
| 020000866128 | Bonamat 5 l | Scanpharm A/S | – | 3 [Aftale u/Filter] | Filterskift |
| 1YE11922 | Animo OptiVend 11s TS | Linak A/S | 2022-07-04 | 2 [Aftale uden Reservedele] | Registrering af serienr. |
| 0200017422678 | Bonamat 10 l | Odsherred Kommune | – | 3 [Aftale u/Filter] | Registrering af serienr. |
| 020001604977 | Bonamat 5 l | Cafe Tulipanen | – | 3 [Aftale u/Filter] | Filterskift |
| 020001437138 | Bonamat 5 l | Nordsjællands Hospital | – | 3 [Aftale u/Filter] | Filterskift |
| 020001688910 | Bonamat 10 l | Den Danske Filmskole | – | 3 [Aftale u/Filter] | Filterskift |
| 020000349701 | Bonamat 5 l | Linak A/S | – | 3 [Aftale u/Filter] | Registrering af serienr. |
| 031960092335 | Bonamat 5 l | Linak A/S | – | 3 [Aftale u/Filter] | Registrering af serienr. |
| 020002168873 | Bonamat 10 l | Randers HK A/S | – | 3 [Aftale u/Filter] | Filterskift |

Ingen af de 116 har binding eller købt dato udfyldt (kun 2 har købt dato).

## 4. "Midlertidig udl" i reservedele-feltet: 0 rækker
Det gemte reservedele-felt indeholder kun aftalekoder ("1 [Aftale m/Alt u/b]", "5 [Alt på regning]" osv.). Klostercafeens Bolero Turbo-maskiner (020001390924, 020002534207) har "1 [Aftale m/Alt u/b (83,17,18)]". "Midlertidigt udlån" findes kun i maskinregistrets udlånstype "6 [Midlertidigt udlån]" (57 maskiner). Klostercafeens Boleroer findes ikke i maskinregistret.
Udlån-reglen, der allerede er sat i drift, rammer derfor ingen rækker med de data, vi har i dag.

## Konklusion
Kode 2 ligner Frellsen-ejet lejeudstyr: det er næsten kun Bonamat-bryggere, og 87 % ligger i maskinregistret som Udlån eller Leje/Leasing. Kun 15 er ukendte der. Med den nuværende regel bliver de kundeejede, og det passer dårligt.

## Forslag (kræver godkendelse)
1. Kode 2 behandles som kode 4: med binding → Leje m/binding, uden binding → Leje u/binding. Alle 116 bliver dermed Leje u/binding.
2. Udlån: vis mig gerne en skærmdump af Klostercafeen-rækken i Excel-filen, så jeg kan se, hvilken kolonne "Midlertidig udl…" står i. Den kolonne bliver sandsynligvis ikke indlæst i dag. Derefter tilføjer jeg den til indlæsningen og retter reglen.
3. Testene opdateres, så kode 2 tæller som leje.
