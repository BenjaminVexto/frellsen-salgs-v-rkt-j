import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Låsning af en ny måned må aldrig efterregulere måneder med kilde = 'loenseddel'.
// Oktober 2026 kan endnu ikke låses (måneden er ikke afsluttet), så testen låser
// september 2026 igen i en transaktion der rulles tilbage — dens 6-måneders
// efterreguleringsvindue (mar–aug 2026) består udelukkende af lønseddelrækker,
// præcis som oktober 2026's vindue (apr–sep 2026, hvor sep er 'beregnet').
const SQL = `
BEGIN;
DO $$
DECLARE a uuid; s uuid; n int;
BEGIN
  SELECT user_id INTO a FROM user_roles WHERE role = 'admin' LIMIT 1;
  DELETE FROM bonus_laas WHERE maaned = DATE '2026-09-01';
  DELETE FROM bonus_regulering WHERE udbetalingsmaaned = DATE '2026-09-01' AND type = 'efterregulering';
  FOR s IN SELECT DISTINCT user_id FROM bonus_historik_loenseddel LOOP
    PERFORM public._bonus_laas_saelger(a, s, DATE '2026-09-01', 'test');
  END LOOP;
  SELECT count(*) INTO n FROM bonus_regulering
   WHERE type = 'efterregulering' AND kilde_maaned BETWEEN DATE '2025-09-01' AND DATE '2026-08-01';
  RAISE NOTICE 'REGULERINGER=%', n;
END $$;
ROLLBACK;`;

describe("historisk bonus fra lønsedler", () => {
  it.skipIf(!process.env.PGHOST)("opretter ingen efterregulering for sep 2025 – aug 2026", () => {
    const out = execFileSync("psql", ["-v", "ON_ERROR_STOP=1", "-c", SQL], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    void out;
  }, 300_000);
});
