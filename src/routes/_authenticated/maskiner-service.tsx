import { createFileRoute } from "@tanstack/react-router";
import { MaskinerService } from "@/components/udstyr/maskiner-service";

export const Route = createFileRoute("/_authenticated/maskiner-service")({
  component: MaskinerService,
  head: () => ({
    meta: [
      { title: "Maskiner & Service — Frellsen" },
      { name: "description", content: "Frellsen-udstyr, leje, maskinbelastning og serviceaftaler pr. lokation." },
      { property: "og:title", content: "Maskiner & Service — Frellsen" },
      { property: "og:description", content: "Hvad tjener vi på udstyr og service – og hvor skal der handles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});
