/**
 * Kontrakter for hvilke kolonner hver Visma-eksport skal indeholde.
 * Rent deklarativt — ingen parsing- eller importlogik her.
 */
export type ImportKontrakt = {
  id: string;
  titel: string;
  vismaRapport: string;
  raekkefoelge: number;
  afhaengerAf: string | null;
  kolonneRaekkefoelgeBetyder: boolean;
  paakraevede: string[];
  anbefalede: string[];
};

export const IMPORT_KONTRAKTER: Record<string, ImportKontrakt> = {
  aktoer: {
    id: "aktoer",
    titel: "Aktør (debitorliste)",
    vismaRapport: "Aktør",
    raekkefoelge: 1,
    afhaengerAf: null,
    kolonneRaekkefoelgeBetyder: false,
    paakraevede: [
      "Firma",
      "Afd",
      "Selskab",
      "Fakt. kunde",
      "Lev. kund",
      "Navn",
      "Sælger",
      "Sidste Varekøb",
      "Oprettet dato",
      "Kundeprisgruppe 3",
      "CVR nr.",
      "Landnr.",
      "Kreditspærre",
    ],
    anbefalede: [
      "Kundeprisgruppe 1",
      "Kundeprisgruppe 2",
      "Postnr.",
      "By",
      "Adresselinje 1",
      "Adresselinje 2",
      "Telefonnr.1",
      "E-mailadresse",
      "Ref person",
      "EAN nr.",
      "Bem. Intern",
      "Rute",
    ],
  },
  faktura: {
    id: "faktura",
    titel: "Faktura Journal",
    vismaRapport: "Faktura Journal",
    raekkefoelge: 2,
    afhaengerAf: "Aktør (debitorliste)",
    kolonneRaekkefoelgeBetyder: true,
    paakraevede: [
      "Firma",
      "Afdeling",
      "Ordrenr.",
      "Fakturadato",
      "Lev. kunde (Kundenr.)",
      "Varenr.",
      "Varetekst (Beskrivelse)",
      "Antal",
      "Varegruppe 1 (Produktprisgruppe 1)",
      "Varegruppe 2 (Produktprisgruppe 2)",
      "Nettovægt",
      "Listepris (Pris kr)",
      "Pris efter rabat",
      "Beløb",
      "DB",
      "DG% (Dækningsgrad)",
      "Initialer (Oprettet af bruger)",
    ],
    anbefalede: [],
  },
  maskiner: {
    id: "maskiner",
    titel: "Maskinliste + Wittenborg SN-liste",
    vismaRapport: "Maskinliste",
    raekkefoelge: 3,
    afhaengerAf: "Aktør (debitorliste)",
    kolonneRaekkefoelgeBetyder: false,
    paakraevede: [],
    anbefalede: [],
  },
  prismatrix: {
    id: "prismatrix",
    titel: "Prismatrix",
    vismaRapport: "Prismatrix",
    raekkefoelge: 4,
    afhaengerAf: "Aktør (debitorliste)",
    kolonneRaekkefoelgeBetyder: false,
    paakraevede: [],
    anbefalede: [],
  },
};
