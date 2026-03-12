const https = require('https');

const PROJECT_ID = 'nohqxcuhnlsmenywywfl';
const TOKEN = 'sbp_f22d8a1550a3b0db65b012820406c4b125fca889';
const DEMO_USER_ID = '702dda83-031a-4df7-b0cf-b5e4b99c03b5';

function runQuery(sql, label) {
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
          console.log(`✅ ${label}`);
          resolve(data);
        } else {
          console.error(`❌ ${label} (${res.statusCode}): ${data.slice(0, 300)}`);
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
  // 1. Create demo user in auth.users
  await runQuery(`
    INSERT INTO auth.users (
      id, instance_id, email, encrypted_password, email_confirmed_at,
      aud, role, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token
    ) VALUES (
      '${DEMO_USER_ID}',
      '00000000-0000-0000-0000-000000000000',
      'demo@gestpatrimonio.com',
      crypt('Demo123!', gen_salt('bf')),
      NOW(),
      'authenticated',
      'authenticated',
      '{"full_name": "Propietario"}'::jsonb,
      NOW(), NOW(), '', ''
    ) ON CONFLICT (id) DO NOTHING;
  `, '1. Demo user in auth.users');

  // 2. Create profile
  await runQuery(`
    INSERT INTO patrimonio_profiles (id, full_name, base_currency, default_country, expertise_level)
    VALUES ('${DEMO_USER_ID}', 'Propietario', 'GBP', 'GB', 'pro')
    ON CONFLICT (id) DO UPDATE SET full_name = 'Propietario', base_currency = 'GBP';
  `, '2. Profile created');

  // 3. Seed Mister Noodles restaurants
  const restaurants = [
    { name: 'Mister Noodles — Madrid Centro', revenue: 720000, ebitda_margin: 0.18 },
    { name: 'Mister Noodles — Barcelona Eixample', revenue: 680000, ebitda_margin: 0.16 },
    { name: 'Mister Noodles — Valencia', revenue: 520000, ebitda_margin: 0.15 },
    { name: 'Mister Noodles — Sevilla', revenue: 480000, ebitda_margin: 0.14 },
    { name: 'Mister Noodles — Málaga', revenue: 440000, ebitda_margin: 0.13 },
    { name: 'Mister Noodles — Bilbao', revenue: 380000, ebitda_margin: 0.12 },
  ];

  for (const r of restaurants) {
    await runQuery(`
      INSERT INTO patrimonio_assets (
        user_id, name, category, country_operating, currency,
        ownership_pct, ownership_type, status, preferred_valuation_method,
        liquidity_level, sector_data
      ) VALUES (
        '${DEMO_USER_ID}', '${r.name}', 'restaurant', 'ES', 'EUR',
        100, 'company', 'active', 'dcf', 'medium',
        '{"revenues": "${r.revenue}", "ebitdaMargin": "${(r.ebitda_margin * 100).toFixed(0)}", "revenueGrowth": "8", "concept": "Asian Fast Food"}'::jsonb
      ) ON CONFLICT DO NOTHING;
    `, `3. Restaurant: ${r.name}`);
  }

  // 4. Seed Real Estate
  const properties = [
    { name: 'Piso Salamanca — Madrid', cost: 450000, rent: 24000, type: 'residential' },
    { name: 'Piso Chamberí — Madrid', cost: 380000, rent: 19200, type: 'residential' },
    { name: 'Local Comercial Gran Vía — Madrid', cost: 850000, rent: 72000, type: 'commercial' },
    { name: 'Piso Eixample — Barcelona', cost: 520000, rent: 27600, type: 'residential' },
    { name: 'Nave Industrial Vallecas — Madrid', cost: 320000, rent: 36000, type: 'industrial' },
    { name: 'Piso Malasaña — Madrid', cost: 290000, rent: 15600, type: 'residential' },
    { name: 'Local Restauración Chueca — Madrid', cost: 420000, rent: 48000, type: 'commercial' },
    { name: 'Piso Retiro — Madrid', cost: 510000, rent: 26400, type: 'residential' },
    { name: 'Garaje + Trastero Salamanca — Madrid', cost: 65000, rent: 4800, type: 'other' },
    { name: 'Piso Centro — Valencia', cost: 195000, rent: 10800, type: 'residential' },
    { name: 'Apartamento Costa del Sol', cost: 280000, rent: 18000, type: 'residential' },
  ];

  for (const p of properties) {
    await runQuery(`
      INSERT INTO patrimonio_assets (
        user_id, name, category, subcategory, country_operating, currency,
        ownership_pct, ownership_type, status, purchase_cost,
        preferred_valuation_method, liquidity_level, sector_data
      ) VALUES (
        '${DEMO_USER_ID}', '${p.name}', 'real_estate', '${p.type}', 'ES', 'EUR',
        100, 'personal', 'active', ${p.cost},
        'dcf', 'low',
        '{"grossRent": "${p.rent}", "capRate": "4.5", "propertyType": "${p.type}", "annualRent": ${p.rent}, "purchasePrice": ${p.cost}}'::jsonb
      ) ON CONFLICT DO NOTHING;
    `, `4. Property: ${p.name}`);
  }

  // 5. Create valuations for all assets
  await runQuery(`
    INSERT INTO patrimonio_valuation_snapshots (asset_id, user_id, snapshot_date, value_base, value_low, value_high, method_used, confidence_score, drivers, explanation, engine_version)
    SELECT
      a.id, a.user_id, CURRENT_DATE,
      CASE
        WHEN a.category = 'restaurant' THEN
          (COALESCE((a.sector_data->>'revenues')::numeric, 500000) * COALESCE((a.sector_data->>'ebitdaMargin')::numeric / 100, 0.15)) * 6
        WHEN a.category = 'real_estate' THEN
          COALESCE((a.sector_data->>'grossRent')::numeric, 20000) / 0.045
        ELSE COALESCE(a.purchase_cost, 100000)
      END AS value_base,
      CASE
        WHEN a.category = 'restaurant' THEN
          (COALESCE((a.sector_data->>'revenues')::numeric, 500000) * COALESCE((a.sector_data->>'ebitdaMargin')::numeric / 100, 0.15)) * 4.5
        WHEN a.category = 'real_estate' THEN
          COALESCE((a.sector_data->>'grossRent')::numeric, 20000) / 0.055
        ELSE COALESCE(a.purchase_cost, 100000) * 0.85
      END AS value_low,
      CASE
        WHEN a.category = 'restaurant' THEN
          (COALESCE((a.sector_data->>'revenues')::numeric, 500000) * COALESCE((a.sector_data->>'ebitdaMargin')::numeric / 100, 0.15)) * 8
        WHEN a.category = 'real_estate' THEN
          COALESCE((a.sector_data->>'grossRent')::numeric, 20000) / 0.035
        ELSE COALESCE(a.purchase_cost, 100000) * 1.2
      END AS value_high,
      CASE WHEN a.category = 'real_estate' THEN 'cap_rate' ELSE 'dcf' END,
      'medium',
      ARRAY['Auto-valued on seed'],
      'Valoración automática inicial basada en los datos introducidos.',
      'v1'
    FROM patrimonio_assets a
    WHERE a.user_id = '${DEMO_USER_ID}'
    AND NOT EXISTS (
      SELECT 1 FROM patrimonio_valuation_snapshots vs WHERE vs.asset_id = a.id
    );
  `, '5. Valuation snapshots for all assets');

  console.log('\n🎉 All seed data created! 6 restaurants + 11 properties + valuations.');
})();
