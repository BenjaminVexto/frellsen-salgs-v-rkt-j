
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('admin', 'saelger');
CREATE TYPE public.customer_type AS ENUM ('nyt_emne', 'aktiv_kunde', 'sovende_kunde', 'tidligere_kunde');
CREATE TYPE public.assignment_status AS ENUM ('ny','skal_kontaktes','kontaktet','talt_med','møde_booket','tilbud_sendt','ikke_relevant','senere_emne','vundet','tabt');
CREATE TYPE public.priority_level AS ENUM ('høj','middel','lav');
CREATE TYPE public.opportunity_status AS ENUM ('ny','behovsafdækning','møde_demo','tilbud_under_udarbejdelse','tilbud_sendt','opfølgning','vundet','tabt','sat_på_pause');
CREATE TYPE public.activity_type AS ENUM ('opkald','email','linkedin','besøg','møde','teams_møde','tilbud_sendt','opfølgning','intern_note');
CREATE TYPE public.quote_status AS ENUM ('kladde','sendt','under_opfølgning','accepteret','afvist','udløbet');

-- PROFILES
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL DEFAULT '',
  region TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- USER ROLES (separat tabel for sikkerhed)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

-- has_role security definer function
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user_id, 'admin') $$;

CREATE OR REPLACE FUNCTION public.get_user_region(_user_id UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT region FROM public.profiles WHERE id = _user_id $$;

-- COMPANIES
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cvr TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  zip TEXT,
  city TEXT,
  municipality TEXT,
  industry TEXT,
  employees INTEGER,
  phone TEXT,
  email TEXT,
  website TEXT,
  customer_type customer_type NOT NULL DEFAULT 'nyt_emne',
  visma_id TEXT,
  turnover_12m NUMERIC,
  last_purchase_date DATE,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_companies_municipality ON public.companies(municipality);
CREATE INDEX idx_companies_customer_type ON public.companies(customer_type);

-- CONTACTS
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  phone TEXT,
  email TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_contacts_company ON public.contacts(company_id);

-- CONTACT LISTS
CREATE TABLE public.contact_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true
);

-- CONTACT LIST ASSIGNMENTS
CREATE TABLE public.contact_list_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_list_id UUID NOT NULL REFERENCES public.contact_lists(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status assignment_status NOT NULL DEFAULT 'ny',
  priority priority_level NOT NULL DEFAULT 'middel',
  next_followup_date DATE,
  next_action_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_cla_assigned ON public.contact_list_assignments(assigned_to);
CREATE INDEX idx_cla_company ON public.contact_list_assignments(company_id);
CREATE INDEX idx_cla_followup ON public.contact_list_assignments(next_followup_date);

-- SALES OPPORTUNITIES
CREATE TABLE public.sales_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  opportunity_type TEXT,
  status opportunity_status NOT NULL DEFAULT 'ny',
  estimated_value NUMERIC,
  probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  expected_close_date DATE,
  next_action TEXT,
  next_followup_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_opp_assigned ON public.sales_opportunities(assigned_to);
CREATE INDEX idx_opp_status ON public.sales_opportunities(status);

-- ACTIVITIES
CREATE TABLE public.activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.sales_opportunities(id) ON DELETE SET NULL,
  contact_list_assignment_id UUID REFERENCES public.contact_list_assignments(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  activity_type activity_type NOT NULL,
  note TEXT,
  next_action TEXT,
  next_followup_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_activities_company ON public.activities(company_id);
CREATE INDEX idx_activities_creator ON public.activities(created_by);

-- QUOTES
CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.sales_opportunities(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  quote_number TEXT,
  status quote_status NOT NULL DEFAULT 'kladde',
  estimated_value NUMERIC,
  sent_date DATE,
  expiry_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER trg_cla_updated BEFORE UPDATE ON public.contact_list_assignments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_opp_updated BEFORE UPDATE ON public.sales_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  -- Default role: saelger (admin promoveres manuelt)
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'saelger');
  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ====================
-- RLS
-- ====================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_list_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Alle kan se profiler" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Bruger opdaterer egen profil" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Admin opdaterer alle profiler" ON public.profiles FOR UPDATE TO authenticated USING (public.is_admin(auth.uid()));

-- USER_ROLES
CREATE POLICY "Bruger ser egne roller" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Admin styrer roller" ON public.user_roles FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- Helper: kan brugeren se virksomheden?
CREATE OR REPLACE FUNCTION public.can_access_company(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_admin(_user_id)
    OR EXISTS (SELECT 1 FROM public.contact_list_assignments WHERE company_id = _company_id AND assigned_to = _user_id)
    OR EXISTS (SELECT 1 FROM public.sales_opportunities WHERE company_id = _company_id AND assigned_to = _user_id)
    OR EXISTS (
      SELECT 1 FROM public.companies c
      WHERE c.id = _company_id
        AND c.municipality IS NOT NULL
        AND c.municipality = public.get_user_region(_user_id)
    )
$$;

-- COMPANIES
CREATE POLICY "Adgang til virksomheder" ON public.companies FOR SELECT TO authenticated
  USING (public.can_access_company(auth.uid(), id));
CREATE POLICY "Admin styrer virksomheder" ON public.companies FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- CONTACTS
CREATE POLICY "Se kontakter for tilg\u00e6ngelige virksomheder" ON public.contacts FOR SELECT TO authenticated
  USING (public.can_access_company(auth.uid(), company_id));
CREATE POLICY "Redig\u00e9r kontakter for tilg\u00e6ngelige virksomheder" ON public.contacts FOR ALL TO authenticated
  USING (public.can_access_company(auth.uid(), company_id))
  WITH CHECK (public.can_access_company(auth.uid(), company_id));

-- CONTACT_LISTS
CREATE POLICY "Se kontaktlister man har tildelinger i" ON public.contact_lists FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.contact_list_assignments WHERE contact_list_id = id AND assigned_to = auth.uid())
  );
CREATE POLICY "Admin styrer kontaktlister" ON public.contact_lists FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- CONTACT_LIST_ASSIGNMENTS
CREATE POLICY "Se egne tildelinger" ON public.contact_list_assignments FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Opdater egne tildelinger" ON public.contact_list_assignments FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Admin styrer tildelinger" ON public.contact_list_assignments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

-- SALES_OPPORTUNITIES
CREATE POLICY "Se egne salgsmuligheder" ON public.sales_opportunities FOR SELECT TO authenticated
  USING (assigned_to = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Opret salgsmulighed for tilg\u00e6ngelig virksomhed" ON public.sales_opportunities FOR INSERT TO authenticated
  WITH CHECK (
    (assigned_to = auth.uid() AND public.can_access_company(auth.uid(), company_id))
    OR public.is_admin(auth.uid())
  );
CREATE POLICY "Opdater egne salgsmuligheder" ON public.sales_opportunities FOR UPDATE TO authenticated
  USING (assigned_to = auth.uid() OR public.is_admin(auth.uid()));
CREATE POLICY "Admin sletter salgsmuligheder" ON public.sales_opportunities FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- ACTIVITIES
CREATE POLICY "Se aktiviteter for tilg\u00e6ngelige virksomheder" ON public.activities FOR SELECT TO authenticated
  USING (public.can_access_company(auth.uid(), company_id));
CREATE POLICY "Opret aktiviteter for tilg\u00e6ngelige virksomheder" ON public.activities FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_access_company(auth.uid(), company_id));
CREATE POLICY "Opdater egne aktiviteter" ON public.activities FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));

-- QUOTES
CREATE POLICY "Se tilbud for tilg\u00e6ngelige virksomheder" ON public.quotes FOR SELECT TO authenticated
  USING (public.can_access_company(auth.uid(), company_id));
CREATE POLICY "Opret tilbud for tilg\u00e6ngelige virksomheder" ON public.quotes FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid() AND public.can_access_company(auth.uid(), company_id));
CREATE POLICY "Opdater egne tilbud" ON public.quotes FOR UPDATE TO authenticated
  USING (created_by = auth.uid() OR public.is_admin(auth.uid()));
