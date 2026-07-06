import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchCompaniesTool from "./tools/search-companies";
import getCompanyTool from "./tools/get-company";
import listMyActivitiesTool from "./tools/list-my-activities";
import createActivityTool from "./tools/create-activity-note";

// The OAuth issuer MUST be the direct Supabase host — the published proxy form
// is rewritten to `.lovable.cloud`, which mcp-js rejects. Read the ref via the
// Vite-inlined literal (available at both build time and runtime after publish).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "frellsen-salgsoversigt-mcp",
  title: "Frellsen Salgsoversigt",
  version: "0.1.0",
  instructions:
    "Værktøjer til Frellsen Salgsoversigt (dansk CRM for Frellsen Kaffe). Brug `search_companies` til at finde kunder, `get_company` for detaljer inkl. kontakter og seneste aktiviteter, `list_my_recent_activities` for din egen log, og `create_activity` til at registrere opkald/besøg/mails/noter.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchCompaniesTool, getCompanyTool, listMyActivitiesTool, createActivityTool],
});
