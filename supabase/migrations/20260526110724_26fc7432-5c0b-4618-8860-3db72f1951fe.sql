
ALTER TABLE public.competitors
  ADD COLUMN IF NOT EXISTS competitor_type text
    CHECK (competitor_type IN ('svaervaegteren','teknikeren','koebmanden','hipsteren')),
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS employee_count integer,
  ADD COLUMN IF NOT EXISTS equipment_brands text[],
  ADD COLUMN IF NOT EXISTS identifying_question text,
  ADD COLUMN IF NOT EXISTS frellsen_counter text;

INSERT INTO public.competitors
  (name, competitor_type, city, employee_count, equipment_brands, notes)
VALUES
  ('Bentax','koebmanden','Svenstrup J',80, ARRAY['Kalerm','Thermoplan'],NULL),
  ('BlackBird Coffee','koebmanden','Herlev',47, ARRAY['Jura','Kalerm'],NULL),
  ('BKI Foods','svaervaegteren','Højbjerg',280, ARRAY['Animo','Egro','Evoca','WMF'],NULL),
  ('Bønnen','koebmanden','Holbæk',22, ARRAY['Etna','Evoca','WMF'],NULL),
  ('Cafeu','koebmanden','Esbjerg',21, ARRAY['I pilot (Kina)'],NULL),
  ('Coffee by Storm','teknikeren','Herlev',23, ARRAY['Eversys'],NULL),
  ('Clever Coffee','hipsteren','Odder',13, ARRAY['Caye (Kina)'],NULL),
  ('Culligan','svaervaegteren','Aarhus N',48, ARRAY['Animo','Evoca'],NULL),
  ('DBC Coffee','koebmanden','Greve',20, ARRAY['Animo','Egro'],NULL),
  ('JDE Professional','svaervaegteren','Middelfart',235, ARRAY['Evoca','Franke','Schaerer'],NULL),
  ('Freehand','svaervaegteren','Odense',49, ARRAY['Animo','Crem','Etna','Franke','Jura','Melitta','Schaerer'],NULL),
  ('Kaffe Koncept','koebmanden','Otterup',7, ARRAY['Evoca'],NULL),
  ('Kaffe Imperiet','koebmanden','København S',9, ARRAY['Evoca','Jura'],NULL),
  ('Kaiser Kaffe','koebmanden','Kolding',9, ARRAY['Jetinno (Kina)'],NULL),
  ('Kaffemøllen','koebmanden','Køge',6, ARRAY['Bianchi','HLF'],NULL),
  ('Lavazza (Merrild)','svaervaegteren','Fredericia',90, ARRAY['Lavazza','Bravilor'],NULL),
  ('Meny Kaffe','koebmanden','Franchise',NULL, ARRAY['Animo','Evoca','Jura'],NULL),
  ('Selecta','svaervaegteren','Brøndby',30, ARRAY['De Jong','Evoca','Franke'],NULL),
  ('Peter Larsen','svaervaegteren','Viborg',55, ARRAY['Bianchi','HLF'],NULL),
  ('Slow','hipsteren','København V',11, ARRAY[]::text[],'Brands ukendt'),
  ('Stellini Kaffe','koebmanden','Taastrup',28, ARRAY['Aequator','De Jong','Jura','Schaerer','WMF'],NULL),
  ('Yellow Bird Coffee','hipsteren','Hvidovre',37, ARRAY[]::text[],'Brands ukendt'),
  ('YellowBeard','koebmanden','Gentofte',19, ARRAY['Franke','Yunio (Kina)','La Cimbali'],NULL),
  ('Ønsk','hipsteren','København V',11, ARRAY['Eversys','Crem','Jura','Kalerm (Kina)'],NULL)
ON CONFLICT (name) DO UPDATE SET
  competitor_type = EXCLUDED.competitor_type,
  city = EXCLUDED.city,
  employee_count = EXCLUDED.employee_count,
  equipment_brands = EXCLUDED.equipment_brands,
  notes = COALESCE(EXCLUDED.notes, public.competitors.notes);
