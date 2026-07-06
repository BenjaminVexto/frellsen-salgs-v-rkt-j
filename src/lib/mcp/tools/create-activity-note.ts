import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const ACTIVITY_TYPES = [
  "telefonopkald",
  "besøg",
  "email",
  "tilbud_sendt",
  "møde",
  "ikke_truffet",
  "opfølgning_aftalt",
  "andet",
] as const;

export default defineTool({
  name: "create_activity",
  title: "Registrér aktivitet",
  description:
    "Opret en aktivitet (opkald, besøg, email, note, m.m.) på en virksomhed. Aktiviteten registreres på den loggede bruger.",
  inputSchema: {
    company_id: z.string().uuid().describe("UUID på virksomheden."),
    activity_type: z.enum(ACTIVITY_TYPES).describe("Aktivitetstype."),
    note: z.string().trim().min(1).describe("Notetekst."),
    next_action: z.string().optional().describe("Aftalt næste handling (fri tekst)."),
    next_followup_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Dato for næste opfølgning (YYYY-MM-DD)."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (
    { company_id, activity_type, note, next_action, next_followup_date },
    ctx,
  ) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("activities")
      .insert({
        company_id,
        activity_type,
        note,
        next_action: next_action ?? null,
        next_followup_date: next_followup_date ?? null,
        created_by: ctx.getUserId()!,
      })
      .select("id, company_id, activity_type, created_at")
      .single();
    if (error) {
      return { content: [{ type: "text", text: `Fejl: ${error.message}` }], isError: true };
    }
    return {
      content: [{ type: "text", text: `Aktivitet oprettet (id ${data.id})` }],
      structuredContent: { activity: data },
    };
  },
});
