import { Shield, Cpu, ShoppingCart, Leaf, type LucideIcon } from "lucide-react";

export const COMPETITOR_TYPES = {
  svaervaegteren: {
    label: "Sværvægteren",
    plural: "Sværvægterne",
    color: "blue",
    tagline: "Tung · Drift · Systemer",
    offers: "Tryghed og storaftaler",
    identifying_question: "Har I en landsdækkende aftale?",
    what_drives:
      "Går meget op i rammeaftaler på landsplan, kontrakter og faste procedurer",
    frellsen_counter:
      "Vi matcher, men uden langsomt hovedkontor. Vi har stadig fleksibilitet.",
    frellsen_pitch: "Tryghed uden ventetid.",
  },
  teknikeren: {
    label: "Teknikeren",
    plural: "Teknikerne",
    color: "purple",
    tagline: "Vilde maskiner · Specs",
    offers: "Maskiner og touchskærm",
    identifying_question: "Hvilken maskine kigger I på?",
    what_drives:
      "Taler primært om kaffemaskinen; dens udseende og maskinens kapacitet",
    frellsen_counter:
      "Det er smagen som folk kan lide, ikke touchskærmen. Vi har gode maskiner, og endnu bedre kaffe.",
    frellsen_pitch: "Ingen drikker specs, de drikker kaffe.",
  },
  koebmanden: {
    label: "Købmanden",
    plural: "Købmændene",
    color: "green",
    tagline: "Løsning · Praksis · Aftaler",
    offers: "Pris og logistik",
    identifying_question: "Hvor stilles jeres kaffe ved levering?",
    what_drives: "Foruden pris er levering og stabilitet i fokus",
    frellsen_counter:
      "Vi er dygtige købmænd, men tilbyder også kaffe som medarbejderne glæder sig til.",
    frellsen_pitch: "Billigt bliver dyrt, hvis ingen vil drikke det.",
  },
  hipsteren: {
    label: "Hipsteren",
    plural: "Hipsterne",
    color: "orange",
    tagline: "ESG · Trends · Storytelling",
    offers: "Signalværdier og historier",
    identifying_question: "Er bæredygtighed vigtigst for jer?",
    what_drives:
      "Efterspørger ESG rapport og storytelling til deres medarbejdere",
    frellsen_counter:
      "Vi har masser af grøn historie, men løfter også driften på daglig basis.",
    frellsen_pitch: "Det er også kaffen, ikke kun historien.",
  },
} as const;

export type CompetitorTypeKey = keyof typeof COMPETITOR_TYPES;

export const COMPETITOR_TYPE_ICON: Record<CompetitorTypeKey, LucideIcon> = {
  svaervaegteren: Shield,
  teknikeren: Cpu,
  koebmanden: ShoppingCart,
  hipsteren: Leaf,
};

export const COMPETITOR_TYPE_BADGE: Record<CompetitorTypeKey, string> = {
  svaervaegteren:
    "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-200 dark:border-blue-900",
  teknikeren:
    "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-200 dark:border-purple-900",
  koebmanden:
    "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300 border-green-200 dark:border-green-900",
  hipsteren:
    "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300 border-orange-200 dark:border-orange-900",
};

// Bruges som top-border på arketype-kort og sektion-streger
export const COMPETITOR_TYPE_BORDER: Record<CompetitorTypeKey, string> = {
  svaervaegteren: "bg-blue-500",
  teknikeren: "bg-purple-500",
  koebmanden: "bg-green-500",
  hipsteren: "bg-orange-500",
};

// Tekstfarve til arketype-overskrifter og pitch
export const COMPETITOR_TYPE_TEXT: Record<CompetitorTypeKey, string> = {
  svaervaegteren: "text-blue-700 dark:text-blue-400",
  teknikeren: "text-purple-700 dark:text-purple-400",
  koebmanden: "text-green-700 dark:text-green-400",
  hipsteren: "text-orange-700 dark:text-orange-400",
};

// Lys baggrundsboks til arketype-info i højre panel
export const COMPETITOR_TYPE_PANEL: Record<CompetitorTypeKey, string> = {
  svaervaegteren:
    "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900",
  teknikeren:
    "bg-purple-50 dark:bg-purple-950/30 border-purple-200 dark:border-purple-900",
  koebmanden:
    "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-900",
  hipsteren:
    "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-900",
};

// Ikon-baggrund i arketype-kort
export const COMPETITOR_TYPE_ICON_BG: Record<CompetitorTypeKey, string> = {
  svaervaegteren: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  teknikeren: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  koebmanden: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  hipsteren: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
};

export const COMPETITOR_TYPE_ORDER: CompetitorTypeKey[] = [
  "svaervaegteren",
  "teknikeren",
  "koebmanden",
  "hipsteren",
];
