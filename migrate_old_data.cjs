const https = require('https');

const OLD_PROJECT = 'pjwucakxqubrvbuzvidn';
const OLD_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBqd3VjYWt4cXVicnZidXp2aWRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMDY2MDAsImV4cCI6MjA4NTg4MjYwMH0.9QMp2cWnnFlis8hKUJyoJkbt2nNp4N8b7GtPSwDr5UQ';

const NEW_PROJECT = 'nohqxcuhnlsmenywywfl';
const MGMT_TOKEN = 'sbp_f22d8a1550a3b0db65b012820406c4b125fca889';
const DEMO_USER_ID = '702dda83-031a-4df7-b0cf-b5e4b99c03b5';

function fetchFromOld(table) {
  return new Promise((resolve, reject) => {
    const url = `https://${OLD_PROJECT}.supabase.co/rest/v1/${table}?select=*&user_id=eq.${DEMO_USER_ID}`;
    const options = {
      hostname: `${OLD_PROJECT}.supabase.co`,
      path: `/rest/v1/${table}?select=*&user_id=eq.${DEMO_USER_ID}`,
      method: 'GET',
      headers: {
        'apikey': OLD_ANON,
        'Authorization': `Bearer ${OLD_ANON}`,
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          console.log(`📥 Old ${table}: ${Array.isArray(parsed) ? parsed.length : 'error'} rows`);
          resolve(parsed);
        } catch(e) {
          console.log(`📥 Old ${table}: raw response = ${data.slice(0,200)}`);
          resolve([]);
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function runQuery(sql, label) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ query: sql });
    const options = {
      hostname: 'api.supabase.com',
      path: `/v1/projects/${NEW_PROJECT}/database/query`,
      method: 'POST',
      headers: {
        'apikey': MGMT_TOKEN,
        'Authorization': `Bearer ${MGMT_TOKEN}`,
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

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
  if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  if (Array.isArray(v)) return `ARRAY[${v.map(x => `'${String(x).replace(/'/g, "''")}'`).join(',')}]`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

(async () => {
  // 1. Delete existing seeded data from new project
  await runQuery(`DELETE FROM patrimonio_valuation_snapshots WHERE user_id = '${DEMO_USER_ID}';`, 'Clear snapshots');
  await runQuery(`DELETE FROM patrimonio_debt_facilities WHERE user_id = '${DEMO_USER_ID}';`, 'Clear debt');
  await runQuery(`DELETE FROM patrimonio_dcf_models WHERE user_id = '${DEMO_USER_ID}';`, 'Clear DCF');
  await runQuery(`DELETE FROM patrimonio_comparables WHERE user_id = '${DEMO_USER_ID}';`, 'Clear comparables');
  await runQuery(`DELETE FROM patrimonio_scenarios WHERE user_id = '${DEMO_USER_ID}';`, 'Clear scenarios');
  await runQuery(`DELETE FROM patrimonio_assets WHERE user_id = '${DEMO_USER_ID}';`, 'Clear assets');

  // 2. Fetch from old project
  const assets = await fetchFromOld('patrimonio_assets');
  const snapshots = await fetchFromOld('patrimonio_valuation_snapshots');
  const debt = await fetchFromOld('patrimonio_debt_facilities');
  
  if (!Array.isArray(assets) || assets.length === 0) {
    console.log('\n⚠️  No assets found in old project. The old project may have RLS blocking anonymous reads.');
    console.log('Trying without user_id filter...');
    
    // Try fetching all (if RLS allows)
    const allAssets = await new Promise((resolve, reject) => {
      const options = {
        hostname: `${OLD_PROJECT}.supabase.co`,
        path: `/rest/v1/patrimonio_assets?select=*`,
        method: 'GET',
        headers: {
          'apikey': OLD_ANON,
          'Authorization': `Bearer ${OLD_ANON}`,
        }
      };
      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch(e) { resolve([]); }
        });
      });
      req.on('error', reject);
      req.end();
    });
    
    console.log(`📥 All assets (no filter): ${Array.isArray(allAssets) ? allAssets.length : JSON.stringify(allAssets).slice(0,200)}`);
    
    if (Array.isArray(allAssets) && allAssets.length > 0) {
      // Insert these
      for (const a of allAssets) {
        const cols = ['id','user_id','name','category','subcategory','country_operating','country_fiscal','currency','ownership_pct','ownership_type','status','purchase_date','purchase_cost','preferred_valuation_method','liquidity_level','liquidity_days_est','tags','notes','sector_data'];
        const vals = cols.map(c => {
          let v = a[c];
          if (c === 'user_id') v = DEMO_USER_ID;
          if (c === 'tags' && Array.isArray(v)) return `ARRAY[${v.map(x => `'${x}'`).join(',')}]::text[]`;
          if (c === 'tags' && !v) return "'{}'::text[]";
          return esc(v);
        });
        const sql = `INSERT INTO patrimonio_assets (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING;`;
        await runQuery(sql, `Asset: ${a.name}`);
      }
    }
    return;
  }

  // 3. Insert assets
  for (const a of assets) {
    const cols = ['id','user_id','name','category','subcategory','country_operating','country_fiscal','currency','ownership_pct','ownership_type','status','purchase_date','purchase_cost','preferred_valuation_method','liquidity_level','liquidity_days_est','tags','notes','sector_data'];
    const vals = cols.map(c => {
      let v = a[c];
      if (c === 'user_id') v = DEMO_USER_ID;
      if (c === 'tags' && Array.isArray(v)) return v.length > 0 ? `ARRAY[${v.map(x => `'${x}'`).join(',')}]::text[]` : "'{}'::text[]";
      if (c === 'tags' && !v) return "'{}'::text[]";
      return esc(v);
    });
    const sql = `INSERT INTO patrimonio_assets (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING;`;
    await runQuery(sql, `Asset: ${a.name}`);
  }

  // 4. Insert snapshots
  if (Array.isArray(snapshots)) {
    for (const s of snapshots) {
      const cols = ['id','asset_id','user_id','snapshot_date','value_low','value_base','value_high','method_used','confidence_score','drivers','explanation','assumptions_metadata','engine_version'];
      const vals = cols.map(c => {
        let v = s[c];
        if (c === 'user_id') v = DEMO_USER_ID;
        if (c === 'drivers' && Array.isArray(v)) return v.length > 0 ? `ARRAY[${v.map(x => `'${String(x).replace(/'/g,"''")}'`).join(',')}]::text[]` : "'{}'::text[]";
        if (c === 'drivers' && !v) return "'{}'::text[]";
        return esc(v);
      });
      const sql = `INSERT INTO patrimonio_valuation_snapshots (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING;`;
      await runQuery(sql, `Snapshot: ${s.asset_id?.slice(0,8)}`);
    }
  }

  // 5. Insert debt
  if (Array.isArray(debt) && debt.length > 0) {
    for (const d of debt) {
      const cols = ['id','asset_id','user_id','lender','debt_type','outstanding_principal','annual_interest_rate','annual_payment','maturity_date','currency','notes'];
      const vals = cols.map(c => {
        let v = d[c];
        if (c === 'user_id') v = DEMO_USER_ID;
        return esc(v);
      });
      const sql = `INSERT INTO patrimonio_debt_facilities (${cols.join(',')}) VALUES (${vals.join(',')}) ON CONFLICT (id) DO NOTHING;`;
      await runQuery(sql, `Debt: ${d.lender || d.id?.slice(0,8)}`);
    }
  }

  console.log(`\n🎉 Migrated ${assets.length} assets, ${snapshots?.length || 0} snapshots, ${debt?.length || 0} debt from old project!`);
})();
