import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Hammer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/kontaktlister")({
  component: () => (
    <div className="px-4 md:px-8 py-8 max-w-5xl mx-auto pb-24 md:pb-8">
      <h1 className="text-2xl md:text-3xl font-semibold mb-6">Kontaktlister</h1>
      <Card className="p-8 text-center border-dashed bg-muted/40">
        <Hammer className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground">Bygges i næste iteration.</p>
      </Card>
    </div>
  ),
});
