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
  name: "list_my_recent_activities",
  title: "Mine seneste aktiviteter",
  description:
    "Liste over den loggede brugers seneste registrerede aktiviteter (opkald, besøg, mails, m.m.) på tværs af virksomheder.",
  inputSchema: {
    limit: z.number().int().min(1).max(50).optional().describe("Maks antal (default 20)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("activities")
      .select("id, company_id, activity_type, note, created_at, next_action, next_followup_date, companies(name)")
      .eq("created_by", ctx.getUserId()!)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (error) {
      return { content: [{ type: "text", text: `Fejl: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { activities: data ?? [] },
    };
  },
});
