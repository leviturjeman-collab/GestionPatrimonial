const fs = require('fs');
const https = require('https');

const PROJECT_ID = 'nohqxcuhnlsmenywywfl';
const TOKEN = 'sbp_f22d8a1550a3b0db65b012820406c4b125fca889';

// Split migration into logical chunks
const chunks = [
  // 1. Extensions + Profiles
  `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
  CREATE TABLE IF NOT EXISTS patrimonio_profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT,
    base_currency TEXT NOT NULL DEFAULT 'EUR',
    default_country TEXT NOT NULL DEFAULT 'ES',
    expertise_level TEXT NOT NULL DEFAULT 'easy' CHECK (expertise_level IN ('easy','intermediate','pro')),
    global_assumptions JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE patrimonio_profiles ENABLE ROW LEVEL SECURITY;
  DO $$ BEGIN
    CREATE POLICY "prof_sel" ON patrimonio_profiles FOR SELECT USING (auth.uid() = id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE POLICY "prof_upd" ON patrimonio_profiles FOR UPDATE USING (auth.uid() = id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE POLICY "prof_ins" ON patrimonio_profiles FOR INSERT WITH CHECK (auth.uid() = id);
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // 2. Country Presets
  `CREATE TABLE IF NOT EXISTS patrimonio_country_presets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    country_code TEXT NOT NULL,
    country_name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'EUR',
    risk_free_rate NUMERIC NOT NULL DEFAULT 0.03,
    equity_risk_premium NUMERIC NOT NULL DEFAULT 0.06,
    country_risk_premium NUMERIC NOT NULL DEFAULT 0.01,
    expected_inflation NUMERIC NOT NULL DEFAULT 0.02,
    fx_vs_base NUMERIC NOT NULL DEFAULT 1.0,
    effective_tax_rate NUMERIC NOT NULL DEFAULT 0.25,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE patrimonio_country_presets ENABLE ROW LEVEL SECURITY;
  DO $$ BEGIN CREATE POLICY "cp_sel" ON patrimonio_country_presets FOR SELECT USING (is_default = TRUE OR user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "cp_ins" ON patrimonio_country_presets FOR INSERT WITH CHECK (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "cp_upd" ON patrimonio_country_presets FOR UPDATE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "cp_del" ON patrimonio_country_presets FOR DELETE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // 3. Assets
  `CREATE TABLE IF NOT EXISTS patrimonio_assets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('real_estate','restaurant','watch','car','other')),
    subcategory TEXT,
    country_operating TEXT NOT NULL DEFAULT 'ES',
    country_fiscal TEXT,
    currency TEXT NOT NULL DEFAULT 'EUR',
    ownership_pct NUMERIC NOT NULL DEFAULT 100,
    ownership_type TEXT NOT NULL DEFAULT 'personal' CHECK (ownership_type IN ('personal','company','co_ownership')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','for_sale','sold','retired')),
    purchase_date DATE,
    purchase_cost NUMERIC,
    preferred_valuation_method TEXT NOT NULL DEFAULT 'dcf' CHECK (preferred_valuation_method IN ('dcf','comps','cost','manual')),
    liquidity_level TEXT NOT NULL DEFAULT 'medium' CHECK (liquidity_level IN ('high','medium','low')),
    liquidity_days_est INTEGER,
    tags TEXT[] NOT NULL DEFAULT '{}',
    notes TEXT,
    sector_data JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_patrimonio_assets_user ON patrimonio_assets(user_id);
  CREATE INDEX IF NOT EXISTS idx_patrimonio_assets_category ON patrimonio_assets(category);
  ALTER TABLE patrimonio_assets ENABLE ROW LEVEL SECURITY;
  DO $$ BEGIN CREATE POLICY "assets_sel" ON patrimonio_assets FOR SELECT USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "assets_ins" ON patrimonio_assets FOR INSERT WITH CHECK (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "assets_upd" ON patrimonio_assets FOR UPDATE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "assets_del" ON patrimonio_assets FOR DELETE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // 4. Debt + Snapshots
  `CREATE TABLE IF NOT EXISTS patrimonio_debt_facilities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES patrimonio_assets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    lender TEXT,
    debt_type TEXT NOT NULL DEFAULT 'mortgage',
    outstanding_principal NUMERIC NOT NULL DEFAULT 0,
    annual_interest_rate NUMERIC NOT NULL DEFAULT 0,
    annual_payment NUMERIC NOT NULL DEFAULT 0,
    maturity_date DATE,
    currency TEXT NOT NULL DEFAULT 'EUR',
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE patrimonio_debt_facilities ENABLE ROW LEVEL SECURITY;
  DO $$ BEGIN CREATE POLICY "debt_sel" ON patrimonio_debt_facilities FOR SELECT USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "debt_ins" ON patrimonio_debt_facilities FOR INSERT WITH CHECK (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "debt_upd" ON patrimonio_debt_facilities FOR UPDATE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "debt_del" ON patrimonio_debt_facilities FOR DELETE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE TABLE IF NOT EXISTS patrimonio_valuation_snapshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES patrimonio_assets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
    value_low NUMERIC,
    value_base NUMERIC NOT NULL,
    value_high NUMERIC,
    method_used TEXT NOT NULL DEFAULT 'dcf',
    confidence_score TEXT NOT NULL DEFAULT 'medium' CHECK (confidence_score IN ('high','medium','low')),
    drivers TEXT[] NOT NULL DEFAULT '{}',
    explanation TEXT,
    assumptions_metadata JSONB NOT NULL DEFAULT '{}',
    engine_version TEXT NOT NULL DEFAULT 'v1',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS idx_patrimonio_snapshots_asset ON patrimonio_valuation_snapshots(asset_id);
  ALTER TABLE patrimonio_valuation_snapshots ENABLE ROW LEVEL SECURITY;
  DO $$ BEGIN CREATE POLICY "snap_sel" ON patrimonio_valuation_snapshots FOR SELECT USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "snap_ins" ON patrimonio_valuation_snapshots FOR INSERT WITH CHECK (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "snap_upd" ON patrimonio_valuation_snapshots FOR UPDATE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "snap_del" ON patrimonio_valuation_snapshots FOR DELETE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // 5. DCF + Comparables + Scenarios
  `CREATE TABLE IF NOT EXISTS patrimonio_dcf_models (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES patrimonio_assets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mode TEXT NOT NULL DEFAULT 'easy' CHECK (mode IN ('easy','pro')),
    horizon_years INTEGER NOT NULL DEFAULT 5,
    revenue_year1 NUMERIC, revenue_growth_rate NUMERIC, ebitda_margin NUMERIC,
    capex_pct NUMERIC, tax_rate NUMERIC, wacc NUMERIC, terminal_growth_rate NUMERIC,
    fcf_type TEXT NOT NULL DEFAULT 'fcff' CHECK (fcf_type IN ('fcff','fcfe')),
    risk_free_rate NUMERIC, equity_risk_premium NUMERIC, country_risk_premium NUMERIC,
    beta NUMERIC, debt_ratio NUMERIC, cost_of_debt NUMERIC, inflation_rate NUMERIC,
    fx_rate NUMERIC NOT NULL DEFAULT 1.0,
    terminal_method TEXT NOT NULL DEFAULT 'gordon' CHECK (terminal_method IN ('gordon','exit_multiple')),
    exit_multiple NUMERIC,
    full_inputs JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE patrimonio_dcf_models ENABLE ROW LEVEL SECURITY;
  DO $$ BEGIN CREATE POLICY "dcf_sel" ON patrimonio_dcf_models FOR SELECT USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "dcf_ins" ON patrimonio_dcf_models FOR INSERT WITH CHECK (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "dcf_upd" ON patrimonio_dcf_models FOR UPDATE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "dcf_del" ON patrimonio_dcf_models FOR DELETE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE TABLE IF NOT EXISTS patrimonio_comparables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES patrimonio_assets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    sale_price NUMERIC, sale_date DATE, metric_value NUMERIC, metric_type TEXT, source TEXT, notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE patrimonio_comparables ENABLE ROW LEVEL SECURITY;
  DO $$ BEGIN CREATE POLICY "comp_sel" ON patrimonio_comparables FOR SELECT USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "comp_ins" ON patrimonio_comparables FOR INSERT WITH CHECK (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "comp_upd" ON patrimonio_comparables FOR UPDATE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "comp_del" ON patrimonio_comparables FOR DELETE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  CREATE TABLE IF NOT EXISTS patrimonio_scenarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    asset_id UUID NOT NULL REFERENCES patrimonio_assets(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    scenario_type TEXT NOT NULL DEFAULT 'base' CHECK (scenario_type IN ('conservative','base','optimistic')),
    horizon_years INTEGER NOT NULL DEFAULT 5,
    assumptions JSONB NOT NULL DEFAULT '{}',
    projected_values JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  ALTER TABLE patrimonio_scenarios ENABLE ROW LEVEL SECURITY;
  DO $$ BEGIN CREATE POLICY "scen_sel" ON patrimonio_scenarios FOR SELECT USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "scen_ins" ON patrimonio_scenarios FOR INSERT WITH CHECK (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "scen_upd" ON patrimonio_scenarios FOR UPDATE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE POLICY "scen_del" ON patrimonio_scenarios FOR DELETE USING (user_id = auth.uid()); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`,

  // 6. Trigger + Seed
  `CREATE OR REPLACE FUNCTION handle_new_user()
  RETURNS TRIGGER AS $$
  BEGIN
    INSERT INTO patrimonio_profiles (id, full_name)
    VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql SECURITY DEFINER;
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

  INSERT INTO patrimonio_country_presets (country_code, country_name, currency, risk_free_rate, equity_risk_premium, country_risk_premium, expected_inflation, fx_vs_base, effective_tax_rate, is_default) VALUES
    ('ES','España','EUR',0.035,0.065,0.012,0.025,1.0,0.25,TRUE),
    ('GB','Reino Unido','GBP',0.04,0.055,0.005,0.02,1.16,0.25,TRUE),
    ('US','Estados Unidos','USD',0.045,0.05,0.0,0.022,0.92,0.21,TRUE),
    ('DE','Alemania','EUR',0.025,0.06,0.005,0.02,1.0,0.30,TRUE),
    ('FR','Francia','EUR',0.03,0.065,0.008,0.022,1.0,0.25,TRUE),
    ('CH','Suiza','CHF',0.015,0.05,0.0,0.012,0.96,0.15,TRUE)
  ON CONFLICT DO NOTHING;`
];

async function runQuery(sql, label) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_ID}/database/query`,
      method: 'POST',
      headers: {
        'apikey': TOKEN,
        'Authorization': `Bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ ${label} — OK (${res.statusCode})`);
          resolve(data);
        } else {
          console.error(`❌ ${label} — FAILED (${res.statusCode}): ${data.slice(0, 200)}`);
          reject(new Error(data));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

(async () => {
  const labels = ['Profiles', 'Country Presets', 'Assets', 'Debt + Snapshots', 'DCF + Comparables + Scenarios', 'Trigger + Seed'];
  for (let i = 0; i < chunks.length; i++) {
    try {
      await runQuery(chunks[i], labels[i]);
    } catch (e) {
      console.error(`Failed at chunk ${i}: ${e.message.slice(0, 200)}`);
      process.exit(1);
    }
  }
  console.log('\n🎉 All tables created successfully!');
})();
