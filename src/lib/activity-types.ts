import {
  Phone,
  MapPin,
  Mail,
  FileText,
  Users,
  PhoneMissed,
  CalendarCheck,
  MessageSquare,
  type LucideIcon,
} from "lucide-react";

export type ActivityTypeKey =
  | "telefonopkald"
  | "besøg"
  | "email"
  | "tilbud_sendt"
  | "møde"
  | "ikke_truffet"
  | "opfølgning_aftalt"
  | "andet";

export type ActivityTypeDef = {
  key: ActivityTypeKey;
  label: string;
  Icon: LucideIcon;
  /** Tailwind text color class (semantic where possible) */
  color: string;
  /** Tailwind background tint class */
  bg: string;
};

export const ACTIVITY_TYPES: ActivityTypeDef[] = [
  { key: "telefonopkald", label: "Telefonopkald", Icon: Phone, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-500/10" },
  { key: "besøg", label: "Besøg", Icon: MapPin, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-500/10" },
  { key: "email", label: "Email", Icon: Mail, color: "text-muted-foreground", bg: "bg-muted" },
  { key: "tilbud_sendt", label: "Tilbud sendt", Icon: FileText, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-500/10" },
  { key: "møde", label: "Møde", Icon: Users, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-500/10" },
  { key: "ikke_truffet", label: "Ikke truffet", Icon: PhoneMissed, color: "text-destructive", bg: "bg-destructive/10" },
  { key: "opfølgning_aftalt", label: "Opfølgning aftalt", Icon: CalendarCheck, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-500/10" },
  { key: "andet", label: "Andet", Icon: MessageSquare, color: "text-muted-foreground", bg: "bg-muted" },
];

export function getActivityType(key: string | null | undefined): ActivityTypeDef | null {
  if (!key) return null;
  return ACTIVITY_TYPES.find((t) => t.key === key) ?? null;
}

/** Fallback labels for legacy activity_type values that still exist in DB. */
const LEGACY_LABEL: Record<string, string> = {
  opkald: "Opkald",
  linkedin: "LinkedIn",
  teams_møde: "Teams-møde",
  opfølgning: "Opfølgning",
  intern_note: "Intern note",
};

export function labelFor(key: string | null | undefined): string {
  if (!key) return "Aktivitet";
  return getActivityType(key)?.label ?? LEGACY_LABEL[key] ?? key;
}
