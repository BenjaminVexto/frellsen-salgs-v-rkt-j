import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Execute the actual migration functions in isolated PostgreSQL, never production.
const db = new PGlite();
const oldId = "09609d43-c738-46af-ba39-c293026a024f";
const newId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
const locationId = "1c77d26f-c54f-4efc-8bc6-aed08e48b325";
const old21 = "4b534bb1-b4f4-4145-86bd-4aee8c281f67";
const new21 = "27d1a3ab-8ea6-4959-b7ed-ea748378d980";
const location21 = "eabce020-acd5-4ab0-9a35-0696271dde77";

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE companies (id uuid PRIMARY KEY, visma_id text, visma_delivery_id text, afdeling_nr int, name text, address text, zip text, city text, phone text, email text, contact_person text);
    CREATE TABLE locations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id uuid REFERENCES companies(id), afdeling_nr int DEFAULT 11, visma_delivery_no text, address text, zip text, city text, phone text, email text, contact_person text, is_primary boolean);
    CREATE UNIQUE INDEX delivery_department ON locations(visma_delivery_no, afdeling_nr);
    CREATE UNIQUE INDEX primary_company ON locations(company_id) WHERE is_primary;
    CREATE TABLE activities (id int PRIMARY KEY, location_id uuid REFERENCES locations(id), company_id uuid REFERENCES companies(id));
    CREATE TABLE contacts (LIKE activities INCLUDING ALL);
    CREATE TABLE sales_monthly (LIKE activities INCLUDING ALL);
    CREATE TABLE machines (id int PRIMARY KEY, location_id uuid REFERENCES locations(id));
    INSERT INTO companies(id,visma_id,afdeling_nr,name) VALUES ('${oldId}','1784600',11,'AFLD'),('${old21}','7158100',21,'Frederiksberg Chokolade');
    INSERT INTO locations(id,company_id,afdeling_nr,visma_delivery_no,is_primary) VALUES ('${locationId}','${oldId}',11,'1784602',true),('${location21}','${old21}',21,'7158101',true);
    INSERT INTO activities VALUES (1,'${locationId}','${oldId}');
    INSERT INTO contacts VALUES (1,'${locationId}','${oldId}');
    INSERT INTO sales_monthly VALUES (1,'${locationId}','${oldId}');
    INSERT INTO machines VALUES (1,'${locationId}');
  `);
  await db.exec(readFileSync(new URL("../../drizzle/migrations/0159_aktoer_bevar_lokation_ved_ny_fakturakunde.sql", import.meta.url), "utf8"));
  await db.exec(`CREATE TRIGGER ensure_location AFTER INSERT ON companies FOR EACH ROW EXECUTE FUNCTION ensure_primary_location();`);
}, 30000);
afterAll(async () => { await db.close(); });

describe("Aktør: flyt eksisterende leveringsadresse", () => {
  it("opretter ny fakturakunde 1784602 uden en ny lokation i afd. 11", async () => {
    await db.exec(`INSERT INTO companies(id,visma_id,visma_delivery_id,afdeling_nr,name) VALUES ('${newId}','1784602','1784602',11,'Ny AFLD');`);
    expect((await db.query("SELECT count(*)::int n FROM locations WHERE visma_delivery_no='1784602' AND afdeling_nr=11")).rows).toEqual([{ n: 1 }]);
  });
  it("flytter 1784602 fra 1784600 og bevarer ID, maskiner og tilknyttet historik", async () => {
    await db.query("SELECT import_flyt_lokation($1,$2)", [locationId, newId]);
    expect((await db.query("SELECT id,company_id FROM locations WHERE id=$1", [locationId])).rows).toEqual([{ id: locationId, company_id: newId }]);
    for (const table of ["activities", "contacts", "sales_monthly"]) {
      expect((await db.query(`SELECT location_id,company_id FROM ${table} WHERE id=1`)).rows).toEqual([{ location_id: locationId, company_id: newId }]);
    }
    expect((await db.query("SELECT location_id FROM machines WHERE id=1")).rows).toEqual([{ location_id: locationId }]);
  });
  it("beholder den gamle virksomhed uden lokationer", async () => {
    expect((await db.query("SELECT id FROM companies WHERE id=$1", [oldId])).rows).toEqual([{ id: oldId }]);
    expect((await db.query("SELECT count(*)::int n FROM locations WHERE company_id=$1", [oldId])).rows).toEqual([{ n: 0 }]);
  });
  it("flytter 7158101 fra 7158100 i afd. 21 uden at flytte afd. 11", async () => {
    await db.exec(`INSERT INTO companies(id,visma_id,visma_delivery_id,afdeling_nr,name) VALUES ('${new21}','7158101','7158101',21,'Chokolade'),('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb','7158101','7158101',11,'Anden afdeling');`);
    await db.query("SELECT import_flyt_lokation($1,$2)", [location21, new21]);
    expect((await db.query("SELECT id,company_id FROM locations WHERE afdeling_nr=21 AND visma_delivery_no='7158101'")).rows).toEqual([{ id: location21, company_id: new21 }]);
    expect((await db.query("SELECT company_id FROM locations WHERE afdeling_nr=11 AND visma_delivery_no='7158101'")).rows).toEqual([{ company_id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb" }]);
  });
  it("gentagen import er idempotent og kryds-afdelingsflytning afvises", async () => {
    expect((await db.query("SELECT import_flyt_lokation($1,$2) result", [location21, new21])).rows).toEqual([{ result: null }]);
    await expect(db.query("SELECT import_flyt_lokation($1,$2)", [location21, newId])).rejects.toThrow("Afdeling matcher ikke");
    expect((await db.query("SELECT company_id FROM locations WHERE id=$1", [location21])).rows).toEqual([{ company_id: new21 }]);
  });
  it("caller og interne brugere kan ikke kalde den privilegerede flyttefunktion direkte", async () => {
    expect((await db.query("SELECT has_function_privilege('anon','import_flyt_lokation(uuid,uuid)','EXECUTE') a, has_function_privilege('authenticated','import_flyt_lokation(uuid,uuid)','EXECUTE') b, has_function_privilege('service_role','import_flyt_lokation(uuid,uuid)','EXECUTE') c")).rows).toEqual([{ a: false, b: false, c: true }]);
  });
});