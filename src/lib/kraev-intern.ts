import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * requireSupabaseAuth + afvisning af telemarketing-brugere (eksternt bureau).
 * Bruges på ALLE serverfunktioner, også dem med service role.
 */
export const kraevIntern = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { data, error } = await context.supabase.rpc("er_telemarketing");
    if (error) throw new Error("Adgangstjek fejlede");
    if (data === true) throw new Error("Ingen adgang");
    return next();
  });
