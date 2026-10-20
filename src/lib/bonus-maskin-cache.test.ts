import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const session = sessionJson ? JSON.parse(sessionJson) : null;
const env = loadEnv("development", process.cwd(), "VITE_");
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} },
});

describe.skipIf(!session)("September 2026 machine cache regression", () => {
  const expected = [
    ["Anders Mohr", 6, 2500, 0], ["Claus Wolsing", 13, 7250, 4],
    ["Jes Højgaard", 7, 3750, 1], ["Mads Lund", 4, 2750, 1],
    ["Malene Tønnesen", 6, 0, 0], ["Ole Reher", 6, 3000, 0],
  ] as const;
  for (const [name, count, payout, reviews] of expected) {
    it(`${name} retains machine count, payout and pending reviews`, async () => {
      const { data: all, error } = await client.rpc("bonus_maskin_afregning", { _maaned: "2026-09-01" });
      expect(error).toBeNull();
      const sellers = all as { user_id: string; navn: string; raekker: unknown }[] | null;
      const seller = sellers?.find((s) => s.navn === name);
      expect(seller).toBeDefined();
      if (!seller) throw new Error("Missing seller");
      const { data: monthly, error: monthlyError } = await client.rpc("bonus_pr_maaned", {
        _saelger: seller.user_id, _fra: "2026-09-01", _til: "2026-09-01",
      });
      expect(monthlyError).toBeNull();
      const rows = seller.raekker as { status: string; antal: number; sats: number }[];
      expect(rows.filter((r) => r.status === "bonus").reduce((sum, r) => sum + Number(r.antal), 0)).toBe(count);
      expect(Number(monthly?.[0]?.maskinbonus)).toBe(payout);
      expect(rows.filter((r) => r.status === "vurdering")).toHaveLength(reviews);
    });
  }
  it("September remains unlocked", async () => {
    const { data, error } = await client.from("bonus_laas").select("user_id").eq("maaned", "2026-09-01");
    expect(error).toBeNull(); expect(data).toEqual([]);
  });
});