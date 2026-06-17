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

export const Route = createFileRoute("/api/public/quote-pdf/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token ?? "").trim();
        if (!token || token.length < 8) {
          return new Response("Invalid token", { status: 400 });
        }

        const supabase = createClient<Database>(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            auth: {
              storage: undefined,
              persistSession: false,
              autoRefreshToken: false,
            },
          },
        );

        const { data, error } = await supabase.rpc("get_public_quote", {
          _token: token,
        });
        if (error) {
          return new Response(`RPC error: ${error.message}`, { status: 500 });
        }
        if (!data) {
          return new Response("Quote not found", { status: 404 });
        }

        const { buildQuotePdf, buildPdfFilename } = await import(
          "@/lib/quote-pdf.server"
        );
        const payload = data as any;
        const bytes = await buildQuotePdf(payload);
        const filename = buildPdfFilename(payload);

        return new Response(bytes as unknown as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
            "Cache-Control": "private, no-store",
          },
        });
      },
    },
  },
});
