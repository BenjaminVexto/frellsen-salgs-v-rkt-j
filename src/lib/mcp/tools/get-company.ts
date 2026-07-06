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
  name: "get_company",
  title: "Hent virksomhed",
  description:
    "Hent detaljer om én virksomhed via id: stamdata, kontaktpersoner og senest registrerede aktiviteter.",
  inputSchema: {
    company_id: z.string().uuid().describe("UUID på virksomheden."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ company_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const [companyRes, contactsRes, activitiesRes] = await Promise.all([
      supabase
        .from("companies")
        .select(
          "id, name, city, industry, customer_type, customer_segment_1, customer_segment_2, last_purchase_date, sources",
        )
        .eq("id", company_id)
        .maybeSingle(),
      supabase
        .from("contacts")
        .select("id, name, title, email, phone")
        .eq("company_id", company_id)
        .limit(20),
      supabase
        .from("activities")
        .select("id, activity_type, note, created_at, next_action, next_followup_date")
        .eq("company_id", company_id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    if (companyRes.error) {
      return { content: [{ type: "text", text: `Fejl: ${companyRes.error.message}` }], isError: true };
    }
    if (!companyRes.data) {
      return { content: [{ type: "text", text: "Virksomhed ikke fundet" }], isError: true };
    }
    const payload = {
      company: companyRes.data,
      contacts: contactsRes.data ?? [],
      recent_activities: activitiesRes.data ?? [],
    };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
