const https = require('https');

const PROJECT_ID = 'nohqxcuhnlsmenywywfl';
const TOKEN = 'sbp_f22d8a1550a3b0db65b012820406c4b125fca889';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vaHF4Y3VobmxzbWVueXd5d2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDgwMzIsImV4cCI6MjA4ODkyNDAzMn0._OA5-z_H0VxgyQD66QYJji4rpnT-DAYilNfinJ1VxAg';
const OLD_USER_ID = '702dda83-031a-4df7-b0cf-b5e4b99c03b5';

function runQuery(sql, label) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${PROJECT_ID}/database/query`,
      method: 'POST',
      headers: { 'apikey': TOKEN, 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) { console.log(`✅ ${label}`); resolve(data); }
        else { console.error(`❌ ${label} (${res.statusCode}): ${data.slice(0, 300)}`); reject(new Error(data)); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function httpReq(hostname, path, method, headers, body) {
  return new Promise((resolve, reject) => {
    const opts = { hostname, path, method, headers: { ...headers, 'Content-Type': 'application/json' } };
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  // Step 1: Create a NEW proper user via Supabase Auth signup (different email to avoid conflict)
  console.log('1. Creating fresh user via Auth API...');
  const signup = await httpReq(
    `${PROJECT_ID}.supabase.co`, '/auth/v1/signup', 'POST',
    { 'apikey': ANON_KEY },
    JSON.stringify({ email: 'propietario@gestpatrimonio.com', password: 'Demo123!', data: { full_name: 'Propietario' } })
  );
  console.log(`   Signup status: ${signup.status}`);
  
  let newUserId;
  try {
    const p = JSON.parse(signup.data);
    newUserId = p.user?.id || p.id;
    console.log(`   New user ID: ${newUserId}`);
  } catch(e) {
    console.log(`   Response: ${signup.data.slice(0, 300)}`);
  }

  if (!newUserId) {
    console.log('\n   Signup may have failed or user exists. Trying sign-in...');
    const signin = await httpReq(
      `${PROJECT_ID}.supabase.co`, '/auth/v1/token?grant_type=password', 'POST',
      { 'apikey': ANON_KEY },
      JSON.stringify({ email: 'propietario@gestpatrimonio.com', password: 'Demo123!' })
    );
    try {
      const p = JSON.parse(signin.data);
      newUserId = p.user?.id;
      console.log(`   Existing user ID: ${newUserId}`);
    } catch(e) {}
  }

  if (!newUserId) {
    console.error('❌ Cannot create user. Exiting.');
    process.exit(1);
  }

  // Step 2: Confirm email
  await runQuery(`UPDATE auth.users SET email_confirmed_at = NOW() WHERE id = '${newUserId}' AND email_confirmed_at IS NULL;`, 'Confirm email');

  // Step 3: Create profile
  await runQuery(`
    INSERT INTO patrimonio_profiles (id, full_name, base_currency, default_country, expertise_level)
    VALUES ('${newUserId}', 'Propietario', 'GBP', 'GB', 'pro')
    ON CONFLICT (id) DO UPDATE SET full_name = 'Propietario', base_currency = 'GBP';
  `, 'Create/update profile');

  // Step 4: Reassign all assets from old user to new user
  await runQuery(`UPDATE patrimonio_valuation_snapshots SET user_id = '${newUserId}' WHERE user_id = '${OLD_USER_ID}';`, 'Reassign snapshots');
  await runQuery(`UPDATE patrimonio_debt_facilities SET user_id = '${newUserId}' WHERE user_id = '${OLD_USER_ID}';`, 'Reassign debt');
  await runQuery(`UPDATE patrimonio_dcf_models SET user_id = '${newUserId}' WHERE user_id = '${OLD_USER_ID}';`, 'Reassign DCF');
  await runQuery(`UPDATE patrimonio_comparables SET user_id = '${newUserId}' WHERE user_id = '${OLD_USER_ID}';`, 'Reassign comparables');
  await runQuery(`UPDATE patrimonio_scenarios SET user_id = '${newUserId}' WHERE user_id = '${OLD_USER_ID}';`, 'Reassign scenarios');
  await runQuery(`UPDATE patrimonio_assets SET user_id = '${newUserId}' WHERE user_id = '${OLD_USER_ID}';`, 'Reassign assets');

  // Step 5: Verify sign-in and count
  console.log('\n3. Testing sign-in...');
  const signIn = await httpReq(
    `${PROJECT_ID}.supabase.co`, '/auth/v1/token?grant_type=password', 'POST',
    { 'apikey': ANON_KEY },
    JSON.stringify({ email: 'propietario@gestpatrimonio.com', password: 'Demo123!' })
  );
  if (signIn.status < 300) {
    const t = JSON.parse(signIn.data);
    console.log(`✅ Sign-in OK! User: ${t.user?.email}, ID: ${t.user?.id}`);
  } else {
    console.error(`❌ Sign-in FAILED (${signIn.status}): ${signIn.data.slice(0, 300)}`);
  }

  // Count assets
  const count = await runQuery(`SELECT COUNT(*) as cnt FROM patrimonio_assets WHERE user_id = '${newUserId}';`, 'Asset count');
  try { console.log('   Assets:', JSON.parse(count)); } catch(e) {}

  console.log(`\n📋 UPDATE AuthContext.tsx:\n   DEMO_EMAIL = 'propietario@gestpatrimonio.com'\n   DEMO_PASSWORD = 'Demo123!'`);
})();
