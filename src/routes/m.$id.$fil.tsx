import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Offentlig filadgang til markedsføringsmaterialer (forsidebillede og PDF) via materialets UUID.
export const Route = createFileRoute("/m/$id/$fil")({
  head: () => ({ meta: [
    { title: "Materiale — Frellsen Kaffe" },
    { name: "description", content: "Materiale fra Frellsen Kaffe." },
    { property: "og:title", content: "Materiale — Frellsen Kaffe" },
    { property: "og:description", content: "Materiale fra Frellsen Kaffe." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  server: { handlers: { GET: async ({ params }) => {
    const id = z.uuid().safeParse(params.id);
    if (!id.success || (params.fil !== "forside" && params.fil !== "pdf")) return new Response("Ikke fundet", { status: 404 });
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: m } = await supabaseAdmin.from("materialer").select("pdf_path, forside_billede_path, titel").eq("id", id.data).maybeSingle();
    const path = params.fil === "pdf" ? m?.pdf_path : m?.forside_billede_path;
    if (!m || !path || /^https?:\/\//.test(path)) return new Response("Ikke fundet", { status: 404 });
    const { data: fil, error } = await supabaseAdmin.storage.from("materialer").download(path);
    if (error || !fil) return new Response("Ikke fundet", { status: 404 });
    const type = params.fil === "pdf" ? "application/pdf" : /\.png$/i.test(path) ? "image/png" : "image/jpeg";
    const headers: Record<string, string> = { "Content-Type": type, "Cache-Control": "public, max-age=3600" };
    if (params.fil === "pdf") headers["Content-Disposition"] = `inline; filename="${m.titel.replace(/[^\wæøåÆØÅ .-]/g, "")}.pdf"`;
    return new Response(fil, { headers });
  } } },
});
