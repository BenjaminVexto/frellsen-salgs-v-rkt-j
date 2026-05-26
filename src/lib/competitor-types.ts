import { Shield, Cpu, ShoppingCart, Leaf, type LucideIcon } from "lucide-react";
import svaervaegterenImg from "@/assets/arketyper/svaervaegteren.png";
import teknikerenImg from "@/assets/arketyper/teknikeren.png";
import koebmandenImg from "@/assets/arketyper/koebmanden.png";
import hipsterenImg from "@/assets/arketyper/hipsteren.png";

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

export const COMPETITOR_TYPE_IMAGE: Record<CompetitorTypeKey, string> = {
  svaervaegteren: svaervaegterenImg,
  teknikeren: teknikerenImg,
  koebmanden: koebmandenImg,
  hipsteren: hipsterenImg,
};

export const COMPETITOR_TYPE_BADGE: Record<CompetitorTypeKey, string> = {
  svaervaegteren:
    "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300 border-slate-200 dark:border-slate-800",
  teknikeren:
    "bg-stone-100 text-stone-700 dark:bg-stone-900 dark:text-stone-300 border-stone-200 dark:border-stone-800",
  koebmanden:
    "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-emerald-100 dark:border-emerald-900",
  hipsteren:
    "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-100 dark:border-amber-900",
};

// Bruges som top-border på arketype-kort og sektion-streger
export const COMPETITOR_TYPE_BORDER: Record<CompetitorTypeKey, string> = {
  svaervaegteren: "bg-slate-600",
  teknikeren: "bg-stone-600",
  koebmanden: "bg-emerald-700",
  hipsteren: "bg-amber-700",
};

// Tekstfarve til arketype-overskrifter og pitch
export const COMPETITOR_TYPE_TEXT: Record<CompetitorTypeKey, string> = {
  svaervaegteren: "text-slate-700 dark:text-slate-300",
  teknikeren: "text-stone-700 dark:text-stone-300",
  koebmanden: "text-emerald-800 dark:text-emerald-300",
  hipsteren: "text-amber-800 dark:text-amber-300",
};

// Lys baggrundsboks til arketype-info i højre panel
export const COMPETITOR_TYPE_PANEL: Record<CompetitorTypeKey, string> = {
  svaervaegteren:
    "bg-slate-50 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800",
  teknikeren:
    "bg-stone-50 dark:bg-stone-950/40 border-stone-200 dark:border-stone-800",
  koebmanden:
    "bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900",
  hipsteren:
    "bg-amber-50/60 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900",
};

// Ikon-baggrund i arketype-kort
export const COMPETITOR_TYPE_ICON_BG: Record<CompetitorTypeKey, string> = {
  svaervaegteren: "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300",
  teknikeren: "bg-stone-100 text-stone-700 dark:bg-stone-900 dark:text-stone-300",
  koebmanden: "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  hipsteren: "bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export const COMPETITOR_TYPE_ORDER: CompetitorTypeKey[] = [
  "svaervaegteren",
  "teknikeren",
  "koebmanden",
  "hipsteren",
];
