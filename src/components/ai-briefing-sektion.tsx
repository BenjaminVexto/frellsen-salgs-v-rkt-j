import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { da } from "date-fns/locale";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { generateCompanyBriefing } from "@/lib/admin-companies.functions";

const loadingSteps = [
  "Henter intern data...",
  "Søger online...",
  "Genererer briefing...",
];

type Briefing = { text: string; created_at: string } | null;

export type BriefingState = {
  briefing: Briefing;
  generating: boolean;
  loadingStep: number;
  generate: () => void;
};

/** Deles mellem kortet på Oversigt og knappen i Handlinger-panelet. */
export function useCompanyBriefing(companyId: string): BriefingState {
  const [briefing, setBriefing] = useState<Briefing>(null);
  const [generating, setGenerating] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const generateFn = useServerFn(generateCompanyBriefing);

  useEffect(() => {
    let cancelled = false;
    setBriefing(null);
    supabase
      .from("company_briefings")
      .select("briefing_text, created_at")
      .eq("company_id", companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        setBriefing({ text: data.briefing_text, created_at: data.created_at });
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    if (!generating) {
      setLoadingStep(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, loadingSteps.length - 1));
    }, 2000);
    return () => clearInterval(interval);
  }, [generating]);

  async function generate() {
    setGenerating(true);
    try {
      const res = await generateFn({ data: { company_id: companyId } });
      setBriefing({ text: res.briefing, created_at: res.created_at });
      toast.success("Briefing genereret");
    } catch (e) {
      toast.error("Kunne ikke generere: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setGenerating(false);
    }
  }

  return { briefing, generating, loadingStep, generate };
}

/** Knappen i Handlinger-panelet, når der endnu ikke findes en briefing. */
export function AiBriefingKnap({ state }: { state: BriefingState }) {
  return (
    <Button
      variant="outline"
      className="w-full justify-start"
      disabled={state.generating}
      onClick={state.generate}
    >
      {state.generating ? (
        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4 mr-2" />
      )}
      Generér briefing
    </Button>
  );
}

export function AiBriefingSektion({ state }: { state: BriefingState }) {
  const { briefing, generating, loadingStep } = state;
  const [briefingExpanded, setBriefingExpanded] = useState(false);

  // Intet at vise, før en briefing findes eller er under generering.
  if (!briefing && !generating) return null;

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <h2 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> AI Briefing
        </h2>
        {briefing && !generating && (
          <Button size="sm" variant="outline" onClick={state.generate}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Generér ny
          </Button>
        )}
      </div>

      {generating ? (
        <div className="space-y-2">
          {loadingSteps.map((step, i) => {
            const done = i < loadingStep;
            const active = i === loadingStep;
            return (
              <div
                key={step}
                className={
                  "flex items-center gap-2 text-sm " +
                  (done
                    ? "text-muted-foreground"
                    : active
                      ? "text-foreground font-medium"
                      : "text-muted-foreground/50")
                }
              >
                {done ? (
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                ) : active ? (
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-current inline-block" />
                )}
                {step}
              </div>
            );
          })}
        </div>
      ) : briefing ? (
        <>
          <p className="text-xs text-muted-foreground mb-3">
            Genereret: {format(new Date(briefing.created_at), "d. MMM yyyy, HH:mm", { locale: da })}
          </p>
          <div className="border-t pt-3">
            <div className="relative">
              <div className={briefingExpanded ? "" : "max-h-12 overflow-hidden relative"}>
                {!briefingExpanded && (
                  <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent pointer-events-none z-10" />
                )}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{briefing.text}</p>
              </div>
              <button
                onClick={() => setBriefingExpanded((b) => !b)}
                className="text-xs text-primary hover:underline mt-1 block"
              >
                {briefingExpanded ? "Skjul ↑" : "Vis hele briefingen ↓"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </Card>
  );
}
