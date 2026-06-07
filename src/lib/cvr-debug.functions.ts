import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const CVR_ES_URL =
  "http://distribution.virk.dk/cvr-permanent/virksomhed/_search";

export const cvrDebugRaw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ cvr: z.string().regex(/^\d{8}$/, "CVR skal være 8 cifre") }).parse(input),
  )
  .handler(async ({ data }) => {
    const user = process.env.CVR_USERNAME;
    const pass = process.env.CVR_PASSWORD;
    if (!user || !pass) {
      return { success: false as const, error: "CONFIG_ERROR: CVR_USERNAME/CVR_PASSWORD mangler" };
    }
    const auth = Buffer.from(`${user}:${pass}`).toString("base64");
    const payload = {
      query: { term: { "Vrvirksomhed.cvrNummer": data.cvr } },
      size: 1,
    };
    try {
      const res = await fetch(CVR_ES_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      let json: any = null;
      try {
        json = JSON.parse(text);
      } catch {
        json = { raw: text };
      }
      return {
        success: true as const,
        status: res.status,
        payload,
        response: json,
      };
    } catch (e: any) {
      return { success: false as const, error: e?.message ?? "NETWORK_ERROR" };
    }
  });
