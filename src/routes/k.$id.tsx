import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { materialeFilUrl } from "@/lib/materiale-url";

export const Route = createFileRoute("/k/$id")({
  head: () => ({ meta: [
    { title: "Materiale — Frellsen Kaffe" },
    { name: "description", content: "Åbn materiale fra Frellsen Kaffe." },
    { property: "og:title", content: "Materiale — Frellsen Kaffe" },
    { property: "og:description", content: "Åbn materiale fra Frellsen Kaffe." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  server: { handlers: { GET: async ({ params }) => {
    const id = z.uuid().safeParse(params.id);
    if (!id.success) return new Response("Katalog-linket er ikke gyldigt", { status: 404 });
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const url = process.env["SUPABASE_URL"];
    if (!key || !url) return new Response("Kataloget kunne ikke åbnes", { status: 503 });
    const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    } });
    const { data, error } = await db.rpc("materiale_foerste_klik", { _id: id.data });
    if (error) return new Response("Materialet kunne ikke åbnes", { status: 503 });
    const r = (data ?? {}) as { url?: string; pdf_materiale?: string };
    const maal = r.pdf_materiale ? materialeFilUrl(r.pdf_materiale, "pdf") : r.url;
    if (typeof maal !== "string" || !/^https?:\/\//.test(maal)) return new Response("Linket er ikke gyldigt", { status: 404 });
    return new Response(null, { status: 302, headers: { Location: maal, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } } },
});