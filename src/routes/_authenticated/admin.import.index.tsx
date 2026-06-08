import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { ArrowRight, Database, FileSpreadsheet, FileText, Loader2, Receipt, Search, Wrench } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/import/")({
  component: ImportValgSide,
});

type Valg = {
  to: "/admin/import/visma" | "/admin/import/cvr" | "/admin/import/anden" | "/admin/import/maskindata" | "/admin/import/aftale-emner" | "/admin/import/faktura";
  icon: React.ComponentType<{ className?: string }>;
  emoji: string;
  title: string;
  description: string;
  hint: string;
};

const VALG: Valg[] = [
  {
    to: "/admin/import/visma",
    icon: FileSpreadsheet,
    emoji: "📊",
    title: "Visma-import",
    description:
      "Importér kundekartotek direkte fra Visma ERP. Alle kolonner auto-mappet. Upload din CSV-eksport fra Visma.",
    hint: "Brug dette når du eksporterer debitorliste fra Visma",
  },
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
    to: "/admin/import/anden",
    icon: Database,
    emoji: "📁",
    title: "Anden fil (manuel mapping)",
    description:
      "Importér fra en hvilken som helst CSV-fil. Du matcher selv kolonnerne til systemets felter.",
    hint: "Brug dette til Excel-lister, messekontakter eller andre kilder",
  },
  {
    to: "/admin/import/maskindata",
    icon: Wrench,
    emoji: "🔧",
    title: "Maskindata (Visma)",
    description:
      "Opdatér udstyrsoverblik på lokationer fra rå Visma-udtræk. Upload leje/udlån og/eller serviceaftaler.",
    hint: "Brug dette til at synkronisere maskinpark og aftaletyper pr. lokation",
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

      <div className="space-y-4">
        {VALG.map((v) => {
          const Icon = v.icon;
          return (
            <Link key={v.to} to={v.to} className="block group">
              <Card className="p-6 transition hover:border-primary hover:shadow-md cursor-pointer">
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-2xl">
                    {v.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-lg mb-1 flex items-center gap-2">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      {v.title}
                    </h2>
                    <p className="text-sm text-muted-foreground mb-2">{v.description}</p>
                    <p className="text-xs text-muted-foreground">→ {v.hint}</p>
                  </div>
                  <div className="text-primary font-medium text-sm shrink-0 inline-flex items-center gap-1 group-hover:translate-x-1 transition">
                    Vælg <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
