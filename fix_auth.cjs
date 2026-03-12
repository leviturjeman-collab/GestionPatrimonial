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
          try { console.log('   Result:', JSON.parse(data).length ? JSON.parse(data) : '(empty)'); } catch(e) {}
          resolve(data);
        } else {
          console.error(`❌ ${label} (${res.statusCode}): ${data.slice(0, 400)}`);
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
  // 1. Check current state
  await runQuery(`SELECT id, email, encrypted_password IS NOT NULL as has_pw, email_confirmed_at IS NOT NULL as confirmed FROM auth.users WHERE id = '${DEMO_USER_ID}';`, 'Check user');
  
  await runQuery(`SELECT id, provider, identity_data->>'email' as email FROM auth.identities WHERE user_id = '${DEMO_USER_ID}';`, 'Check identities');

  // 2. Fix: ensure identity exists
  await runQuery(`
    INSERT INTO auth.identities (
      id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
    ) VALUES (
      '${DEMO_USER_ID}',
      '${DEMO_USER_ID}',
      'demo@gestpatrimonio.com',
      'email',
      jsonb_build_object('sub', '${DEMO_USER_ID}', 'email', 'demo@gestpatrimonio.com', 'email_verified', true, 'phone_verified', false),
      NOW(),
      NOW(),
      NOW()
    ) ON CONFLICT (provider, provider_id) DO NOTHING;
  `, 'Fix: create identity');

  // 3. Fix: ensure password is properly set
  await runQuery(`
    UPDATE auth.users SET
      encrypted_password = crypt('Demo123!', gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
      is_sso_user = FALSE,
      raw_app_meta_data = '{"provider": "email", "providers": ["email"]}'::jsonb,
      raw_user_meta_data = '{"full_name": "Propietario"}'::jsonb,
      updated_at = NOW()
    WHERE id = '${DEMO_USER_ID}';
  `, 'Fix: update user meta');

  // 4. Test sign-in
  console.log('\n🔑 Testing sign-in...');
  const signInResult = await new Promise((resolve, reject) => {
    const body = JSON.stringify({ email: 'demo@gestpatrimonio.com', password: 'Demo123!' });
    const options = {
      hostname: `${PROJECT_ID}.supabase.co`,
      path: '/auth/v1/token?grant_type=password',
      method: 'POST',
      headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vaHF4Y3VobmxzbWVueXd5d2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDgwMzIsImV4cCI6MjA4ODkyNDAzMn0._OA5-z_H0VxgyQD66QYJji4rpnT-DAYilNfinJ1VxAg',
        'Content-Type': 'application/json',
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const p = JSON.parse(data);
          console.log(`✅ Sign-in OK! User: ${p.user?.email}, Token: ${p.access_token?.slice(0,20)}...`);
          resolve(data);
        } else {
          console.error(`❌ Sign-in FAILED (${res.statusCode}): ${data.slice(0, 300)}`);
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
})();
