// Mapping af danske kommuner: navn -> kommunekode (4-cifret string)
// Bruges af CVR Elasticsearch (Vrvirksomhed.beliggenhedskommune.kommuneKode)
export const KOMMUNE_KODER: Record<string, string> = {
  "København": "0101", "Frederiksberg": "0147", "Ballerup": "0151", "Brøndby": "0153",
  "Dragør": "0155", "Gentofte": "0157", "Gladsaxe": "0159", "Glostrup": "0161",
  "Herlev": "0163", "Albertslund": "0165", "Hvidovre": "0167", "Høje-Taastrup": "0169",
  "Lyngby-Taarbæk": "0173", "Rødovre": "0175", "Ishøj": "0183", "Tårnby": "0185",
  "Vallensbæk": "0187", "Furesø": "0190", "Allerød": "0201", "Fredensborg": "0210",
  "Helsingør": "0217", "Hillerød": "0219", "Hørsholm": "0223", "Rudersdal": "0230",
  "Egedal": "0240", "Frederikssund": "0250", "Greve": "0253", "Køge": "0259",
  "Halsnæs": "0260", "Roskilde": "0265", "Solrød": "0269", "Gribskov": "0270",
  "Odsherred": "0306", "Holbæk": "0316", "Faxe": "0320", "Kalundborg": "0326",
  "Ringsted": "0329", "Slagelse": "0330", "Stevns": "0336", "Sorø": "0340",
  "Lejre": "0350", "Lolland": "0360", "Næstved": "0370", "Guldborgsund": "0376",
  "Vordingborg": "0390", "Bornholm": "0400", "Christiansø": "0411",
  "Middelfart": "0410", "Assens": "0420", "Faaborg-Midtfyn": "0430", "Kerteminde": "0440",
  "Nyborg": "0450", "Odense": "0461", "Svendborg": "0479", "Nordfyns": "0480",
  "Langeland": "0482", "Ærø": "0492",
  "Haderslev": "0510", "Billund": "0530", "Sønderborg": "0540", "Tønder": "0550",
  "Esbjerg": "0561", "Fanø": "0563", "Varde": "0573", "Vejen": "0575", "Aabenraa": "0580",
  "Fredericia": "0607", "Horsens": "0615", "Kolding": "0621", "Vejle": "0630",
  "Herning": "0657", "Holstebro": "0661", "Lemvig": "0665", "Struer": "0671",
  "Syddjurs": "0706", "Norddjurs": "0707", "Favrskov": "0710", "Odder": "0727",
  "Randers": "0730", "Silkeborg": "0740", "Samsø": "0741", "Skanderborg": "0746",
  "Aarhus": "0751", "Århus": "0751", "Ikast-Brande": "0756", "Ringkøbing-Skjern": "0760",
  "Hedensted": "0766", "Morsø": "0773", "Skive": "0779", "Thisted": "0787", "Viborg": "0791",
  "Brønderslev": "0810", "Frederikshavn": "0813", "Vesthimmerlands": "0820",
  "Læsø": "0825", "Rebild": "0840", "Mariagerfjord": "0846", "Jammerbugt": "0849",
  "Aalborg": "0851", "Ålborg": "0851", "Hjørring": "0860",
};

export function resolveKommuneKode(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{3,4}$/.test(trimmed)) return trimmed.padStart(4, "0");
  // Prøv eksakt match, derefter case-insensitive
  if (KOMMUNE_KODER[trimmed]) return KOMMUNE_KODER[trimmed];
  const lower = trimmed.toLowerCase();
  for (const [name, code] of Object.entries(KOMMUNE_KODER)) {
    if (name.toLowerCase() === lower) return code;
  }
  return null;
}

// Regioner -> kommunekoder
const NORD = ["0773","0787","0810","0813","0820","0825","0840","0846","0849","0851","0860"];
const MIDT = ["0615","0657","0661","0665","0671","0706","0707","0710","0727","0730","0740","0741","0746","0751","0756","0760","0766","0779","0791"];
export const REGION_KOMMUNER: Record<string, string[]> = {
  Nordjylland: NORD,
  Midtjylland: MIDT,
  Syddanmark: ["0410","0420","0430","0440","0450","0461","0479","0480","0482","0492","0510","0530","0540","0550","0561","0563","0573","0575","0580","0607","0621","0630"],
  Sjælland: ["0253","0259","0265","0269","0306","0316","0320","0326","0329","0330","0336","0340","0350","0360","0370","0376","0390"],
  Hovedstaden: ["0101","0147","0151","0153","0155","0157","0159","0161","0163","0165","0167","0169","0173","0175","0183","0185","0187","0190","0201","0210","0217","0219","0223","0230","0240","0250","0260","0270","0400","0411"],
};
