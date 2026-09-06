import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { ArrowRight, Cog, Database, FileSpreadsheet, FileText, Loader2, Receipt, Search, Tag } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/import/")({
  component: ImportValgSide,
});

type Valg = {
  to: "/admin/import/visma" | "/admin/import/cvr" | "/admin/import/anden" | "/admin/import/maskiner" | "/admin/import/aftale-emner" | "/admin/import/faktura" | "/admin/import/prismatrix";
  icon: React.ComponentType<{ className?: string }>;
  emoji: string;
  title: string;
  description: string;
  hint: string;
  raekkefoelge?: number;
};

const VISMA_VALG: Valg[] = [
  {
    to: "/admin/import/visma",
    icon: FileSpreadsheet,
    emoji: "📊",
    title: "Aktør (debitorliste)",
    raekkefoelge: 1,
    description:
      "Importér kundekartotek direkte fra Visma ERP. Alle kolonner auto-mappet. Upload din CSV-eksport fra Visma.",
    hint: "Brug dette når du eksporterer debitorliste fra Visma",
  },
  {
    to: "/admin/import/faktura",
    icon: Receipt,
    emoji: "💰",
    title: "Faktura Journal",
    raekkefoelge: 2,
    description:
      "Importér rå fakturajournal fra Visma. Aggregeres automatisk pr. lev.nr. × måned × produktgruppe. Idempotent: kør samme periode flere gange uden dubletter.",
    hint: "Brug dette til at opdatere salgstal og top-varer pr. lokation",
  },
  {
    to: "/admin/import/maskiner",
    icon: Cog,
    emoji: "⚙️",
    title: "Maskinliste + Wittenborg SN-liste",
    raekkefoelge: 3,
    description:
      "Importér Maskinlisten og Wittenborg SN-listen til de separate tabeller machines og machine_enrichment (joinet på serienr). Rækkefølge-uafhængig.",
    hint: "Brug dette til at synkronisere det rå maskinregister med Wittenborg-data",
  },
  {
    to: "/admin/import/prismatrix",
    icon: Tag,
    emoji: "🏷️",
    title: "Prismatrix",
    raekkefoelge: 4,
    description:
      "Importér prismatrix til agreement_pricing. Header findes automatisk via ankerfelter, og en afledt rabat_kategori (Hele bønner, VAC kaffe, Instant, Maskiner, Tilbehør, Øvrige) beregnes pr. række.",
    hint: "Brug dette til at synkronisere kundepriser og rabatlinjer",
  },
];

const OEVRIGE_VALG: Valg[] = [
  {
    to: "/admin/import/cvr",
    icon: Search,
    emoji: "🔍",
    title: "Søg nye emner i CVR-registret",
    description:
      "Find nye potentielle kunder direkte i CVR-registret. Filtrer på kommune, branche og virksomhedsform. Ingen fil nødvendig.",
    hint: "Brug dette til at finde nye emner",
  },
  {
    to: "/admin/import/aftale-emner",
    icon: FileText,
    emoji: "📋",
    title: "Aftale-emner (CVR-liste)",
    description:
      "Importér en CVR-liste fra en aftalepartner (fx Dansk Erhverv). Eksisterende virksomheder matches, nye oprettes og alle tildeles en ny kontaktliste.",
    hint: "Brug dette når en aftale leverer en liste af medlemmer/emner",
  },
  {
    to: "/admin/import/anden",
    icon: Database,
    emoji: "📁",
    title: "Anden fil (manuel mapping) — kun ad hoc",
    description:
      "Kun til ad hoc Excel-lister, messekontakter og andre engangs-kilder. Du matcher selv kolonnerne. Aktør-data fra Visma SKAL køres via Visma-import (xlsx) — ellers risikerer du encoding-fejl og manglende datoer.",
    hint: "Brug IKKE til aktør-eksport fra Visma — brug Visma-import",
  },
];

function ImportValgSide() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!auth.loading && auth.role !== "admin") {
      toast.error("Kun administratorer har adgang til import");
      navigate({ to: "/dashboard" });
    }
  }, [auth.loading, auth.role, navigate]);

  if (auth.loading || auth.role !== "admin") {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="px-4 md:px-8 py-8 max-w-4xl mx-auto pb-24 md:pb-8">
      <h1 className="text-2xl md:text-3xl font-semibold mb-2">Importér virksomheder</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Vælg hvilken type import du vil starte. Hver type har sit eget flow.
      </p>

      <div className="space-y-8">
        <section>
          <h2 className="text-sm font-medium mb-3">Visma-eksporter — kør i rækkefølge</h2>
          <div className="space-y-4">
            {[...VISMA_VALG]
              .sort((a, b) => (a.raekkefoelge ?? 0) - (b.raekkefoelge ?? 0))
              .map((v) => (
                <ValgKort key={v.to} valg={v} />
              ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-medium mb-3">Øvrige kilder — ad hoc</h2>
          <div className="space-y-4">
            {OEVRIGE_VALG.map((v) => (
              <ValgKort key={v.to} valg={v} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
