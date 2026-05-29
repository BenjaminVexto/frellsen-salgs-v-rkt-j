import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/aftaler/$id")({
  component: AftaleDetailPlaceholder,
});

function AftaleDetailPlaceholder() {
  const { id } = Route.useParams();
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link to="/aftaler" className="text-sm text-muted-foreground hover:underline">
        ← Aftaler
      </Link>
      <div className="mt-6 text-center py-16">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
        <h1 className="text-xl font-semibold mb-2">Aftaledetaljer</h1>
        <p className="text-sm text-muted-foreground mb-1">
          Aftaleside kommer i næste trin.
        </p>
        <p className="text-xs text-muted-foreground mb-4">ID: {id}</p>
        <Button asChild variant="outline">
          <Link to="/aftaler">Tilbage til aftaler</Link>
        </Button>
      </div>
    </div>
  );
}
