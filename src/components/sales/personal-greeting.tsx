import { format } from "date-fns";
import { da } from "date-fns/locale";

function greetingPrefix(): string {
  const h = new Date().getHours();
  if (h < 10) return "Godmorgen";
  if (h < 17) return "Goddag";
  return "Godaften";
}

export function PersonalGreeting({ firstName, followupsToday }: { firstName: string | null; followupsToday: number }) {
  return (
    <header className="mb-6 md:mb-8">
      <h1 className="text-2xl md:text-3xl font-semibold text-foreground">
        {greetingPrefix()}{firstName ? `, ${firstName}` : ""}
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        {format(new Date(), "EEEE d. MMMM yyyy", { locale: da })} ·{" "}
        {followupsToday > 0
          ? `${followupsToday} ${followupsToday === 1 ? "opfølgning" : "opfølgninger"} i dag`
          : "Ingen opfølgninger i dag"}
      </p>
    </header>
  );
}
