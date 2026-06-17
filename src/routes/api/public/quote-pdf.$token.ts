/**
 * Public PDF download for frozen quotes.
 * Auth: the public token in the URL (same model as /t/$token).
 *
 * GET /api/public/quote-pdf/<token>
 * → application/pdf with Content-Disposition: attachment; filename=...
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildQuotePdf, buildPdfFilename } from "@/lib/quote-pdf-builder";

export const Route = createFileRoute("/api/public/quote-pdf/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const token = String(params.token ?? "").trim();
          if (!token || token.length < 8) {
            return new Response("Invalid token", { status: 400 });
          }
          const url = process.env.SUPABASE_URL;
          const key = process.env.SUPABASE_PUBLISHABLE_KEY;
          if (!url || !key) {
            return new Response("Missing Supabase env vars", { status: 500 });
          }
          const supabase = createClient<Database>(url, key, {
            auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
          });
          const { data, error } = await supabase.rpc("get_public_quote", { _token: token });
          if (error) return new Response(`RPC error: ${error.message}`, { status: 500 });
          if (!data) return new Response("Quote not found", { status: 404 });

          const payload = data as any;
          const bytes = await buildQuotePdf(payload);
          const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
          const filename = buildPdfFilename(payload);

          return new Response(body, {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
              "Cache-Control": "private, no-store",
            },
          });
        } catch (e: any) {
          return new Response(
            `PDF gen failed: ${e?.message ?? String(e)}\n${e?.stack ?? ""}`,
            { status: 500, headers: { "Content-Type": "text/plain" } },
          );
        }
      },
    },
  },
});
