import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, RefreshCw, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
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

/** Sammenfoldet boks nederst på Oversigt. Briefingen laves kun, når sælgeren selv trykker. */
export function AiBriefingSektion({ state }: { state: BriefingState }) {
  const { briefing, generating, loadingStep } = state;
  const [aaben, setAaben] = useState(false);

  return (
    <Card className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={() => setAaben((v) => !v)}
        className="w-full px-5 py-3 flex items-center justify-between gap-2 text-left hover:bg-accent/40"
      >
        <span className="font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> AI-briefing
        </span>
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          {briefing ? `Seneste ${format(new Date(briefing.created_at), "d. MMM yyyy", { locale: da })}` : "Ingen endnu"}
          {aaben ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
      {aaben && (
        <div className="px-5 pb-5 border-t pt-3 space-y-3">
          {generating ? (
            <div className="space-y-2">
              {loadingSteps.map((step, i) => (
                <div
                  key={step}
                  className={
                    "flex items-center gap-2 text-sm " +
                    (i < loadingStep ? "text-muted-foreground" : i === loadingStep ? "text-foreground font-medium" : "text-muted-foreground/50")
                  }
                >
                  {i < loadingStep ? (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  ) : i === loadingStep ? (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  ) : (
                    <span className="h-4 w-4 rounded-full border border-current inline-block" />
                  )}
                  {step}
                </div>
              ))}
            </div>
          ) : (
            <>
              {briefing && (
                <>
                  <p className="text-xs text-muted-foreground">
                    Genereret: {format(new Date(briefing.created_at), "d. MMM yyyy, HH:mm", { locale: da })}
                  </p>
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">{briefing.text}</p>
                </>
              )}
              <Button size="sm" variant={briefing ? "outline" : "default"} onClick={state.generate}>
                {briefing ? <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                {briefing ? "Lav ny briefing" : "Lav briefing"}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
