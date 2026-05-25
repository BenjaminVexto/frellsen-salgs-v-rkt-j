import { Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useImportRunner } from "@/lib/import-runner";
import { Progress } from "@/components/ui/progress";

export function GlobalImportIndicator() {
  const runner = useImportRunner();
  if (!runner.running && !runner.finishedAt) return null;
  // Auto-hide finished state after a short window (handled by user navigating back).
  if (!runner.running && runner.finishedAt && Date.now() - runner.finishedAt > 60_000) {
    return null;
  }

  const target =
    runner.kind === "visma"
      ? "/admin/import/visma"
      : runner.kind === "anden"
      ? "/admin/import/anden"
      : "/admin/import";

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 rounded-lg border border-border bg-card shadow-lg p-3">
      <div className="flex items-center gap-2 mb-2">
        {runner.running ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : (
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
        )}
        <div className="text-sm font-medium">
          {runner.running ? "Import kører…" : "Import færdig"}
        </div>
        <Link
          to={target}
          className="ml-auto text-xs text-primary hover:underline"
        >
          Vis
        </Link>
      </div>
      <Progress value={runner.progress} className="mb-1" />
      <div className="text-xs text-muted-foreground truncate">
        {runner.label || `${runner.progress}%`}
      </div>
    </div>
  );
}
