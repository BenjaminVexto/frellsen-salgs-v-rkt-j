# Analyse: fald okt 2025 → okt 2026 (afd. 11, forbrugsvarer) — kun læsning

## Konklusion
- Tallene stemmer 1:1 med Målepunkter, og oktober 2026 er fuldt indlæst (seneste fakturadato 30.10.2026, 22 fakturadage mod 23 sidste år).
- **Udbudskunder:** Det største enkeltfald er en datafejl. Regionslageret (3290300, Glostrup) og Center for Økonomi (3350946, Brøndby) har samme CVR (29190623, Region Hovedstaden). Lageret skiftede kundenummer og adresse i juli 2026. Lagt sammen er de gået fra 1.576 til 1.305 t.kr. (−271 i stedet for −1.576). Resten af faldet er bredt, og kr./kg falder fra 58,2 til 50,3 (−14 %), mens kg kun falder 6 %.
- **Forhandlingskunder:** Faldet på −1.189 t.kr. består af tabte −1.110, nye +572, op +2.311 og ned −2.963. Hovedårsagen er altså fald hos eksisterende kunder, ikke tabte kunder. Der er 915 reelt tabte kunder med 10,95 mio. kr. i 12-måneders omsætning, mest små kunder (893 under 50 t.kr.). Den største er Madservice Lions Parken (971 t.kr., sidste køb okt 2025).
- **Sæson:** Oktober 2025 var den højeste måned i hele 2025 for begge kategorier. Aug–okt-faldet er mindre: −10 % for Forhandlingskunder og −6 % for Udbudskunder.

## 1. Afstemning
| | okt 2025 | okt 2026 |
|---|---|---|
| Omsætning Forhandlingskunder | 9.137 | 7.948 |
| Omsætning Udbudskunder | 8.206 | 6.669 |
| Aktive Forhandlingskunder | 3.006 | 2.514 |
| Aktive Udbudskunder | 3.620 | 3.640 |
| Fakturalinjer (afd. 11) | 35.337 | 34.363 |
| Fakturadage | 23 | 22 (sidste 30.10) |

## 2. Samme kunde under nyt nummer
Matchet på fælles leveringsadresse, navn, "afløst af" og, kun for forhandlingskunder, CVR.
| | Tabte | heraf samme kunde | Nye | heraf samme kunde |
|---|---|---|---|---|
| Forhandlingskunder | 984 | 69 (navn 26, adresse 24, CVR 19) | 492 | 49 |
| Udbudskunder | 974 | højst 401 (adresse 364, navn 37) | 994 | højst 337 |

- **Udbudskunder:** De 401 er et loft. Mange institutioner deler én adresse, fx ét hospital, så én tabt konto matcher mange nye. Et eksempel på et ægte nummerskift er Tårnby Kommune (3155500 → 3275400).
- **CVR blev ikke brugt for udbudskunder,** fordi én kommune eller region har ét CVR. Det betyder, at Regionslageret → Center for Økonomi ikke blev fanget automatisk. Jeg har rettet det manuelt nedenfor.
- **Aktør-importen i dag** har endnu ikke flyttet noget. Den første flytning sker ved næste import.

## 3. Tabte forhandlingskunder (efter rettelse): 915
Omsætning aug–okt 2025: 3.290 t.kr. 12 mdr. frem til okt 2025: 10.952 t.kr.

| Sælger | Antal | 12 mdr. (t.kr.) | aug–okt 25 |
|---|---|---|---|
| Ole Reher | 343 | 4.655 | 1.302 |
| Mads Lund | 174 | 2.341 | 678 |
| Malene Tønnesen | 156 | 1.426 | 479 |
| Jes Højgaard | 88 | 1.023 | 337 |
| Claus Wolsing | 105 | 771 | 252 |
| (ingen) | 16 | 460 | 142 |
| Anders Mohr | 33 | 276 | 100 |

| Størrelse (12 mdr.) | Antal | t.kr. |
|---|---|---|
| under 10 t.kr. | 629 | 2.624 |
| 10–50 t.kr. | 264 | 5.244 |
| 50–100 t.kr. | 14 | 966 |
| 100–250 t.kr. | 6 | 825 |
| over 250 t.kr. | 2 | 1.293 |

| Segment | Antal | t.kr. |
|---|---|---|
| 45 Offentlige aftalekunder | 529 | 6.703 |
| 25 Firmakunder | 292 | 3.349 |
| 20 HoReCa | 44 | 286 |
| 35 Indkøbsforeninger | 23 | 271 |
| Øvrige | 27 | 344 |

Top 30 (t.kr. = 12 mdr. frem til okt 2025; "udstyr" = enheder registreret hos os; W = Wittenborg-serienr.):
| Kunde | Kundenr. | By | Sælger | Sidste køb | t.kr. | Udstyr/W/service |
|---|---|---|---|---|---|---|
| Madservice Lions Parken | 3294602 | Nørresundby | Ole Reher | 2025-10 | 971 | 0 |
| Danmarks Nationalbank | 2999600 | København K | Mads Lund | 2026-03 | 322 | 0 |
| Sampension Administrationsselskab | 3030000 | Hellerup | Jes Højgaard | 2026-06 | 174 | 9/5/service |
| Styrelsen for International … | 3008400 | Valby | Mads Lund | 2025-12 | 145 | 4/4 |
| Filadelfia | 1965900 | Dianalund | Jes Højgaard | 2026-05 | 142 | 3/3 |
| Bilkiosk ApS (kreditspærret) | 3017301 | Kastrup | Mads Lund | 2026-03 | 132 | 0 |
| Worldwide Flight Services | 3194600 | Kastrup | Mads Lund | 2026-01 | 122 | 0 |
| Mascot International | 3230200 | Engesvang | Ole Reher | 2025-09 | 110 | 0 |
| DANSAC | 3241500 | Fredensborg | Jes Højgaard | 2025-12 | 95 | 0 |
| LUK/Friplejehjemmet Skovbakkehjemmet | 3160300 | Odder | (ingen) | 2025-10 | 90 | 0 |
| Asylcenter Holstebro | 2457900 | Holstebro | Ole Reher | 2026-03 | 86 | 6/6 |
| Plejehjemmet Ørbygård | 2610242 | Rødovre | Mads Lund | 2026-01 | 84 | 0 |
| Den Selvejende Institution | 2115400 | Bagsværd | Jes Højgaard | 2026-06 | 83 | 3/2/service |
| Rådhuskantine – Thisted | 2866200 | Thisted | Ole Reher | 2026-04 | 75 | 1/1 |
| LUK/Grønttorvets Friplejehjem | 3129500 | Valby | (ingen) | 2025-10 | 65 | 0 |
| Odder Rådhus | 2866000 | Odder | Malene Tønnesen | 2026-07 | 59 | 10/5 |
| Rødovre Jobcenter + øk team | 2610113 | Rødovre | Mads Lund | 2026-01 | 59 | 3/3 |
| Ældrecentret Broparken | 2610271 | Rødovre | Mads Lund | 2025-12 | 56 | 0 |
| Hjørring Rådhus | 2818200 | Hjørring | Ole Reher | 2026-04 | 55 | 0 |
| H C Andersens Museum Cafe | 3223000 | Odense C | Anders Mohr | 2026-04 | 55 | 0 |
| Collectia | 2172300 | Brøndby | Claus Wolsing | 2026-03 | 54 | 1/1 |
| Ejendomsservice | 1881800 | Samsø | Malene Tønnesen | 2026-07 | 52 | 12/8 |
| Ældrecentret Kristianlyst | 1348701 | Thisted | Ole Reher | 2026-01 | 50 | 0 |
| Plejehjemmet Engskrænten | 2610150 | Rødovre | Mads Lund | 2026-01 | 49 | 0 |
| Vendelbocentret | 2820263 | Sindal | Ole Reher | 2026-03 | 47 | 0 |
| LUK/Konditoriet by Bager | 3262800 | Køge | (ingen) | 2025-12 | 46 | 0 |
| Hjemmeplejen Hjørring Kommune | 2821000 | Hjørring | Ole Reher | 2026-04 | 46 | 0 |
| Køkkenområdet Hjørring Kommune | 2820219 | Hjørring | Ole Reher | 2026-04 | 45 | 0 |
| Plejecenter Højgaarden | 1966600 | Farsø | Ole Reher | 2026-04 | 45 | 0 |
| DLF Seeds | 1109900 | Roskilde | Claus Wolsing | 2026-02 | 45 | 0 |

Mønstre i data:
- 23 af de 30 har intet udstyr registreret hos os. Kun 2 har en serviceaftale.
- Flere Rødovre- og Hjørring-enheder stopper samtidig (jan og apr 2026).
- 3 konti er markeret "LUK" (lukket).

## 4. Bro for forhandlingskunder (t.kr.)
| | okt 25 → okt 26 | aug–okt 25 → 26 |
|---|---|---|
| Start | 9.137 | 25.637 |
| Tabte | −1.110 (583 kunder) | −3.291 |
| Nye | +572 (253) | +1.561 |
| Op | +2.311 (1.414) | +3.408 |
| Ned | −2.963 (879) | −4.244 |
| Slut | 7.948 | 23.071 |

Top 20 faldende (okt 25 → okt 26, t.kr.; i alt −589):
| Kunde | Kundenr. | okt 25 | okt 26 | Δ | 12 mdr. før → nu |
|---|---|---|---|---|---|
| ISS Facility Services | 3156300 | 283 | 154 | −129 | 3.302 → 2.008 |
| Erhvervsstyrelsen | 1753800 | 48 | 2 | −46 | 141 → 109 |
| Metro Service | 1615700 | 87 | 52 | −35 | 395 → 825 |
| FUJIFILM Diosynth | 3185500 | 127 | 94 | −32 | 1.060 → 1.166 |
| ATP | 2113500 | 130 | 99 | −32 | 1.100 → 1.095 |
| Unicom Nordic | 3243300 | 34 | 8 | −26 | 264 → 171 |
| Danmarks Statistik | 1739200 | 48 | 23 | −25 | 302 → 311 |
| Pindstrup Fonden | 1732200 | 25 | 0 | −25 | 135 → 84 |
| Strandhøjen Friplejehjem | 3294500 | 26 | 1 | −24 | 93 → 16 |
| EG Danmark | 1432100 | 48 | 25 | −23 | 366 → 325 |
| BEC A.M.B.A | 3045300 | 53 | 31 | −22 | 113 → 263 |
| Compass Group Danmark | 3001300 | 78 | 57 | −21 | 1.165 → 601 |
| Meyers Contract Catering | 1770000 | 80 | 59 | −21 | 745 → 681 |
| Terma | 2869800 | 97 | 76 | −21 | 723 → 942 |
| Vallensbæk Rådhus | 1556900 | 19 | 0 | −19 | 83 → 97 |
| Danish Crown | 2325237 | 43 | 24 | −19 | 246 → 313 |
| Langsøhus | 2802500 | 18 | 0 | −18 | 121 → 114 |
| BEC A.M.B.A | 3045302 | 17 | 0 | −17 | 32 → 56 |
| Sundhed og Omsorg Vitapark | 2241600 | 17 | 0 | −17 | 126 → 93 |
| Danish Crown | 2325200 | 66 | 49 | −17 | 510 → 499 |

Mange kunder i listen ligger stabilt eller højere over 12 mdr. Deres fald gælder altså kun selve oktober. Over 12 mdr. falder især ISS (−1,3 mio.) og Compass (−0,56 mio.).

## 5. Bro for udbudskunder (t.kr.)
Her er Regionslageret og Center for Økonomi lagt sammen som én kunde.
| | okt 25 → okt 26 | aug–okt 25 → 26 (ca.) |
|---|---|---|
| Start | 8.206 | 20.339 |
| Tabte | −390 (310) | −1.066 |
| Nye | +478 | +1.287 |
| Op | +1.611 | +2.440 |
| Ned | −3.237 | −3.962 |
| Slut | 6.669 | 19.087 |

Uden sammenlægningen ville broen vise ned −4.542 og nye +1.783 for okt.

Top 20 faldende (okt, t.kr.):
| Kunde | Kundenr. | okt 25 | okt 26 | Δ | 12 mdr. før → nu |
|---|---|---|---|---|---|
| Regionslageret, nu Center for Økonomi 3350946 | 3290300 | 1.576 | 1.305 (samlet) | −271 | 12.188 → 9.126 + C.f.Ø. |
| Region Nordjylland AUH-lager | 3290966 | 196 | 68 | −128 | 1.244 → 1.210 |
| Region Midtjylland | 3290700 | 395 | 336 | −58 | 3.679 → 3.938 |
| Region Sjælland (Regnskabskontoret) | 3129900 | 88 | 35 | −54 | 595 → 655 |
| Nordjysk Mad I/S | 3290924 | 28 | 0 | −28 | 128 → 128 |
| Regionshuset Kantine | 3290502 | 25 | 0 | −25 | 65 → 148 |
| RS Køkken Holbæk | 3290100 | 77 | 52 | −25 | 706 → 743 |
| Nykøbing F Sygehus Centraldepot | 1923002 | 52 | 29 | −23 | 110 → 43 |
| Rådhuset | 2770300 | 26 | 4 | −22 | 112 → 107 |
| Sygehus Lillebælt | 2698100 | 56 | 34 | −22 | 488 → 478 |
| Næstved Rådhus | 1686100 | 39 | 21 | −19 | 174 → 197 |
| RS Køkken Slagelse | 3290105 | 98 | 79 | −18 | 1.013 → 1.075 |
| Plejecenter Kastaniely | 1504100 | 17 | 0 | −17 | 54 → 19 |
| Hørsholm Ny Rådhus | 3040901 | 17 | 0 | −17 | 78 → 106 |
| Rådhuskantinen | 2141100 | 22 | 6 | −17 | 111 → 110 |
| Sygehus Lillebælt, Vejle | 3290507 | 38 | 22 | −16 | 465 → 508 |
| Hjemmeplejen | 3374000 | 22 | 5 | −16 | 23 → 129 |
| Niels Ebbesen Skolen | 2230200 | 16 | 0 | −16 | 35 → 20 |
| Rørmosecentret | 2587373 | 15 | 0 | −15 | 43 → 36 |
| Administrationsbygning i Ringe | 1570171 | 24 | 9 | −15 | 232 → 172 |

Data viser ingen tabt stor aftale ud over lagerflytningen. Udenfor Regionslageret summerer resten af top 20 til cirka −550 t.kr., og der er 1.409 kunder i "ned". Faldet er altså bredt.

Pris og mængde:
| | okt 25 | okt 26 | aug–okt 25 | aug–okt 26 |
|---|---|---|---|---|
| Udbud kg | 140.996 | 132.489 | 306.037 | 322.196 |
| Udbud kr./kg | 58,2 | 50,3 | 66,5 | 59,2 |
| Forhandling kg | 168.908 | 162.660 | 350.109 | 325.563 |
| Forhandling kr./kg | 54,1 | 48,9 | 73,2 | 70,9 |

- **Udbud:** Over tre måneder er mængden steget 5 %, men kr./kg er faldet 11 %. Faldet skyldes altså pris eller produktsammensætning, ikke mængde.
- **Forhandling:** Mængden er faldet 7 %, og kr./kg er faldet 3 %.
- kg er her nettovægt på alle forbrugsvarer. Det er ikke rent kaffe-kg.

## 6. Sæson og engangskøb
Omsætning pr. måned (t.kr., forbrugsvarer):
| | okt 24 | aug 25 | sep 25 | okt 25 | nov 25 | aug 26 | sep 26 | okt 26 |
|---|---|---|---|---|---|---|---|---|
| Udbud | 3.835 | 5.115 | 7.018 | **8.206** | 7.406 | 5.429 | 6.989 | 6.669 |
| Forhandling | 7.793 | 7.637 | 8.863 | **9.137** | 9.058 | 7.214 | 7.909 | 7.948 |

- **Oktober 2025 var højere end alle andre måneder i 2025.** For udbud skyldes 1.576 t.kr. alene Regionslageret, og okt 2024 lå på 3.835.
- **Forhandling:** Den største kunde i okt 2025 var ISS med 283 t.kr. Der er ingen enkeltordre, der forklarer niveauet.
- **Kontrol aug–okt:** Forhandling −10 % (25.637 → 23.071), Udbud −6 % (20.339 → 19.087).

## Forbehold
- Kategorien Forhandlingskunder indeholder også segment 45 Offentlige aftalekunder. 529 af de 915 tabte kunder ligger i det segment.
- "Tabt" betyder ingen køb af forbrugsvarer i aug–okt 2026. Sidste køb kan godt ligge efter okt 2025.
