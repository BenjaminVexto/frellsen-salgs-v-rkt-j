import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "search_companies",
  title: "Søg virksomheder",
  description:
    "Søg virksomheder efter navn eller by. Returnerer op til 20 matches med id, navn, by og branche. Kun virksomheder den loggede bruger har adgang til (RLS).",
  inputSchema: {
    query: z.string().trim().min(1).describe("Søgetekst (navn eller by)."),
    limit: z.number().int().min(1).max(50).optional().describe("Maks antal resultater (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const max = limit ?? 20;
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, city, industry, customer_type, last_purchase_date")
      .or(`name.ilike.%${query}%,city.ilike.%${query}%`)
      .limit(max);
    if (error) {
      return { content: [{ type: "text", text: `Fejl: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { results: data ?? [] },
    };
  },
});
