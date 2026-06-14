import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useViewAs } from "@/contexts/view-as-context";
import { useQueryClient } from "@tanstack/react-query";

export function ViewAsBanner() {
  const { isImpersonating, viewAsName, clearViewAs } = useViewAs();
  const qc = useQueryClient();
  if (!isImpersonating) return null;

  return (
    <div className="sticky top-0 z-40 bg-amber-500 text-amber-950 border-b border-amber-700 shadow-sm">
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <Eye className="h-4 w-4 shrink-0" />
          <span className="truncate">
            Du ser som <strong>{viewAsName}</strong> — read-only. Handlinger der ændrer data er deaktiveret.
          </span>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="bg-white/80 hover:bg-white text-amber-950 border-amber-700 shrink-0"
          onClick={() => {
            clearViewAs();
            // Force refetch of all seller-scoped queries
            void qc.invalidateQueries();
          }}
        >
          <X className="h-4 w-4 mr-1" /> Tilbage til admin
        </Button>
      </div>
    </div>
  );
}
