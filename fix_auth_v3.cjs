const https = require('https');

const PROJECT_ID = 'nohqxcuhnlsmenywywfl';
const TOKEN = 'sbp_f22d8a1550a3b0db65b012820406c4b125fca889';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vaHF4Y3VobmxzbWVueXd5d2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDgwMzIsImV4cCI6MjA4ODkyNDAzMn0._OA5-z_H0VxgyQD66QYJji4rpnT-DAYilNfinJ1VxAg';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vaHF4Y3VobmxzbWVueXd5d2ZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM0ODAzMiwiZXhwIjoyMDg4OTI0MDMyfQ.V1iFOHXcNpUcTLjrktPyWUqDy6ySG3g9rrXcpmUpm9o';
const OLD_USER_ID = '702dda83-031a-4df7-b0cf-b5e4b99c03b5';

function httpReq(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const opts = { hostname, path, method, headers: { ...headers, 'Content-Type': 'application/json' } };
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, data: d }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function runQuery(sql, label) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const opts = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_ID}/database/query`,
      method: 'POST',
      headers: { 'apikey': TOKEN, 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) { console.log('✅', label); resolve(d); }
        else { console.error('❌', label, res.statusCode, d.slice(0, 300)); resolve(null); }
      });
    });
    req.on('error', e => { console.error('ERR', label, e.message); resolve(null); });
    req.write(body);
    req.end();
  });
}

(async () => {
  // Step 1: Restore the profiles FK so the trigger works
  console.log('--- Restore FK + fix trigger ---');
  await runQuery(`
    ALTER TABLE patrimonio_profiles 
    DROP CONSTRAINT IF EXISTS patrimonio_profiles_id_fkey;
    ALTER TABLE patrimonio_profiles 
    ADD CONSTRAINT patrimonio_profiles_id_fkey 
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
  `, 'Restore profiles FK');

  // Make sure the trigger function handles errors gracefully
  await runQuery(`
    CREATE OR REPLACE FUNCTION handle_new_user()
    RETURNS TRIGGER AS $$
    BEGIN
      INSERT INTO patrimonio_profiles (id, full_name)
      VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name')
      ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
  `, 'Fix trigger function');

  // Step 2: Create user via GoTrue admin
  console.log('\n--- Create user via GoTrue ---');
  const createRes = await httpReq(
    `${PROJECT_ID}.supabase.co`, '/auth/v1/admin/users', 'POST',
    { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
    JSON.stringify({
      email: 'propietario@gestpatrimonio.com',
      password: 'Demo123!',
      email_confirm: true,
      user_metadata: { full_name: 'Propietario' }
    })
  );
  console.log('   Create status:', createRes.status);

  let newUserId;
  try {
    const p = JSON.parse(createRes.data);
    newUserId = p.id;
    console.log('   User:', p.email, '→', newUserId);
  } catch(e) {
    console.log('   Response:', createRes.data.slice(0, 500));
  }

  if (!newUserId) {
    console.error('❌ Still failing. Exiting.');
    process.exit(1);
  }

  // Step 3: Reassign assets
  console.log('\n--- Reassign data ---');
  // Restore other FKs first
  await runQuery(`ALTER TABLE patrimonio_assets DROP CONSTRAINT IF EXISTS patrimonio_assets_user_id_fkey; ALTER TABLE patrimonio_assets ADD CONSTRAINT patrimonio_assets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;`, 'Restore FK assets');
  await runQuery(`ALTER TABLE patrimonio_valuation_snapshots DROP CONSTRAINT IF EXISTS patrimonio_valuation_snapshots_user_id_fkey; ALTER TABLE patrimonio_valuation_snapshots ADD CONSTRAINT patrimonio_valuation_snapshots_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;`, 'Restore FK snapshots');
  
  await runQuery(`UPDATE patrimonio_valuation_snapshots SET user_id = '${newUserId}' WHERE user_id = '${OLD_USER_ID}';`, 'Reassign snapshots');
  await runQuery(`UPDATE patrimonio_assets SET user_id = '${newUserId}' WHERE user_id = '${OLD_USER_ID}';`, 'Reassign assets');
  
  // Update profile
  await runQuery(`UPDATE patrimonio_profiles SET base_currency = 'GBP', default_country = 'GB', expertise_level = 'pro' WHERE id = '${newUserId}';`, 'Update profile');

  // Restore remaining FKs
  await runQuery(`ALTER TABLE patrimonio_debt_facilities DROP CONSTRAINT IF EXISTS patrimonio_debt_facilities_user_id_fkey; ALTER TABLE patrimonio_debt_facilities ADD CONSTRAINT patrimonio_debt_facilities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;`, 'FK debt');
  await runQuery(`ALTER TABLE patrimonio_dcf_models DROP CONSTRAINT IF EXISTS patrimonio_dcf_models_user_id_fkey; ALTER TABLE patrimonio_dcf_models ADD CONSTRAINT patrimonio_dcf_models_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;`, 'FK DCF');
  await runQuery(`ALTER TABLE patrimonio_comparables DROP CONSTRAINT IF EXISTS patrimonio_comparables_user_id_fkey; ALTER TABLE patrimonio_comparables ADD CONSTRAINT patrimonio_comparables_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;`, 'FK comp');
  await runQuery(`ALTER TABLE patrimonio_scenarios DROP CONSTRAINT IF EXISTS patrimonio_scenarios_user_id_fkey; ALTER TABLE patrimonio_scenarios ADD CONSTRAINT patrimonio_scenarios_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;`, 'FK scen');
  await runQuery(`ALTER TABLE patrimonio_country_presets DROP CONSTRAINT IF EXISTS patrimonio_country_presets_user_id_fkey; ALTER TABLE patrimonio_country_presets ADD CONSTRAINT patrimonio_country_presets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;`, 'FK presets');

  // Step 4: Test sign-in
  console.log('\n--- Test sign-in ---');
  const signIn = await httpReq(
    `${PROJECT_ID}.supabase.co`, '/auth/v1/token?grant_type=password', 'POST',
    { 'apikey': ANON_KEY },
    JSON.stringify({ email: 'propietario@gestpatrimonio.com', password: 'Demo123!' })
  );
  if (signIn.status < 300) {
    const t = JSON.parse(signIn.data);
    console.log(`\n✅ SIGN-IN WORKS! ${t.user?.email} (${t.user?.id})`);
  } else {
    console.error(`❌ ${signIn.status}: ${signIn.data.slice(0, 200)}`);
  }

  const cnt = await runQuery(`SELECT COUNT(*) as n FROM patrimonio_assets WHERE user_id = '${newUserId}';`, 'Count');
  try { console.log('   Assets:', JSON.parse(cnt)); } catch(e) {}
})();
