import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "vite";

// Read-only integration tests using the requesting user's managed preview session.
// Run only when that session is available; never create test customers in production.
const sessionJson = process.env.LOVABLE_BROWSER_SUPABASE_SESSION_JSON;
const session = sessionJson ? JSON.parse(sessionJson) : null;
const config = loadEnv("development", process.cwd(), "VITE_");
const client = createClient(config.VITE_SUPABASE_URL, config.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: session ? { Authorization: `Bearer ${session.access_token}` } : {} },
});

describe.skipIf(!session)("October 2026 bonus — live read-only regressions", () => {
  it("shared leaderboard matches payout ranks and shares seller aggregates only", async () => {
    const [board, payout] = await Promise.all([
      client.rpc("bonus_nykunde_rangliste", { _maaned: "2026-09-01" }),
      client.rpc("ny_kunde_bonus_maaned", { _fra: "2026-09-01", _til: "2026-09-01" }),
    ]);
    expect(board.error).toBeNull(); expect(payout.error).toBeNull();
    expect(board.data?.length).toBeGreaterThan(1);
    for (const r of payout.data ?? []) expect(board.data?.find((b: { saelger: string }) => b.saelger === r.saelger)).toMatchObject({ db: r.db, rang: r.rang, beloeb: r.beloeb });
    expect(Object.keys(board.data?.[0] ?? {}).sort()).toEqual(["beloeb", "db", "navn", "rang", "saelger"]);
  });
  it("anonymous callers cannot read the competition", async () => {
    const anonymous = createClient(config.VITE_SUPABASE_URL, config.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await anonymous.rpc("bonus_nykunde_rangliste", { _maaned: "2026-09-01" });
    expect(data).toBeNull(); expect(error).not.toBeNull();
  });

  it("OptiVend earns no bonus before September 2026", async () => {
    const { data, error } = await client.rpc("maskin_bonusklasse", { _type: "Animo OptiVend", _maaned: "2026-08-01" });
    expect(error).toBeNull();
    expect(data).toBe("ingen");
  });

  it("OptiVend earns Animo bonus from September 2026", async () => {
    const { data, error } = await client.rpc("maskin_bonusklasse", { _type: "Animo OptiVend", _maaned: "2026-09-01" });
    expect(error).toBeNull();
    expect(data).toBe("animo");
  });

  it("new-customer bonus starts in September, not August", async () => {
    const { data, error } = await client.rpc("ny_kunde_bonus_maaned", { _fra: "2026-08-01", _til: "2026-08-01" });
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("largest new-customer DB pays 1,000 kr.", async () => {
    const { data, error } = await client.rpc("ny_kunde_bonus_maaned", { _fra: "2026-09-01", _til: "2026-09-01" });
    expect(error).toBeNull();
    const winners = (data ?? []).filter((row: { rang: number }) => row.rang === 1);
    expect(winners.length).toBeGreaterThan(0);
    winners.forEach((row: { beloeb: number }) => expect(Number(row.beloeb)).toBe(1000));
  });

  it("second-largest new-customer DB pays 600 kr.", async () => {
    const { data, error } = await client.rpc("ny_kunde_bonus_maaned", { _fra: "2026-09-01", _til: "2026-09-01" });
    expect(error).toBeNull();
    const runnersUp = (data ?? []).filter((row: { rang: number }) => row.rang === 2);
    expect(runnersUp.length).toBeGreaterThan(0);
    runnersUp.forEach((row: { beloeb: number }) => expect(Number(row.beloeb)).toBe(600));
  });

  it.each([
    ["3d5cbb26-9ec5-4e22-b55d-d19b7013f5aa", 1.75, null, 0],
    ["c9286dea-56e9-4ec6-a119-319827386d64", 2, 2000, 2000],
    ["a26eb263-6484-49f5-8b0c-08d316eee5cc", 2, 1000, 3500],
    ["5537f3e3-7e22-4935-aedb-e91d38c7a60a", 2.88, null, 3500],
  ])("preserves the exact approved order values for %s", async (id, pct, deduction, minimum) => {
    const { data, error } = await client.from("bonus_ordning")
      .select("db_provision_pct, db_fradrag, db_bund").eq("id", id).single();
    expect(error).toBeNull();
    expect(data).toEqual({ db_provision_pct: pct, db_fradrag: deduction, db_bund: minimum });
  });
});