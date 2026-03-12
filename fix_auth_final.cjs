const https = require('https');
const PROJECT_ID = 'nohqxcuhnlsmenywywfl';
const TOKEN = 'sbp_f22d8a1550a3b0db65b012820406c4b125fca889';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vaHF4Y3VobmxzbWVueXd5d2ZsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMzNDgwMzIsImV4cCI6MjA4ODkyNDAzMn0._OA5-z_H0VxgyQD66QYJji4rpnT-DAYilNfinJ1VxAg';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5vaHF4Y3VobmxzbWVueXd5d2ZsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM0ODAzMiwiZXhwIjoyMDg4OTI0MDMyfQ.V1iFOHXcNpUcTLjrktPyWUqDy6ySG3g9rrXcpmUpm9o';
const OLD_USER_ID = '702dda83-031a-4df7-b0cf-b5e4b99c03b5';

function httpReq(h,p,m,hd,b){return new Promise((res,rej)=>{const o={hostname:h,path:p,method:m,headers:{...hd,'Content-Type':'application/json'}};if(b)o.headers['Content-Length']=Buffer.byteLength(b);const r=https.request(o,rs=>{let d='';rs.on('data',c=>d+=c);rs.on('end',()=>res({status:rs.statusCode,data:d}))});r.on('error',rej);if(b)r.write(b);r.end()});}
function rq(sql,l){return new Promise((res,rej)=>{const b=JSON.stringify({query:sql});const o={hostname:'api.supabase.com',path:`/v1/projects/${PROJECT_ID}/database/query`,method:'POST',headers:{'apikey':TOKEN,'Authorization':`Bearer ${TOKEN}`,'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}};const r=https.request(o,re=>{let d='';re.on('data',c=>d+=c);re.on('end',()=>{if(re.statusCode<300){console.log('✅',l);res(d)}else{console.error('❌',l,re.statusCode,d.slice(0,200));res(null)}})});r.on('error',e=>{res(null)});r.write(b);r.end()});}

(async()=>{
  // 1. DROP the trigger temporarily
  console.log('1. Drop trigger...');
  await rq(`DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;`, 'Drop trigger');

  // 2. Create user via GoTrue admin
  console.log('2. Create user...');
  const cr = await httpReq(`${PROJECT_ID}.supabase.co`,'/auth/v1/admin/users','POST',
    {'apikey':SERVICE_KEY,'Authorization':`Bearer ${SERVICE_KEY}`},
    JSON.stringify({email:'propietario@gestpatrimonio.com',password:'Demo123!',email_confirm:true,user_metadata:{full_name:'Propietario'}}));
  console.log('   Status:',cr.status);
  console.log('   Body:',cr.data.slice(0,400));
  
  let newId;
  try{const p=JSON.parse(cr.data);newId=p.id;console.log('   ID:',newId)}catch(e){}

  // 3. Recreate trigger
  await rq(`
    CREATE OR REPLACE FUNCTION handle_new_user() RETURNS TRIGGER AS $$ BEGIN
      INSERT INTO patrimonio_profiles (id, full_name) VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name') ON CONFLICT (id) DO NOTHING;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql SECURITY DEFINER;
    CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
  `, 'Recreate trigger');

  if(!newId){console.error('❌ Failed');process.exit(1)}

  // 4. Create profile, reassign assets
  await rq(`INSERT INTO patrimonio_profiles (id,full_name,base_currency,default_country,expertise_level) VALUES ('${newId}','Propietario','GBP','GB','pro') ON CONFLICT (id) DO UPDATE SET base_currency='GBP',expertise_level='pro';`,'Profile');
  await rq(`UPDATE patrimonio_valuation_snapshots SET user_id='${newId}' WHERE user_id='${OLD_USER_ID}';`,'Reassign snaps');
  await rq(`UPDATE patrimonio_assets SET user_id='${newId}' WHERE user_id='${OLD_USER_ID}';`,'Reassign assets');

  // 5. Test sign-in
  console.log('\n4. Test sign-in...');
  const si = await httpReq(`${PROJECT_ID}.supabase.co`,'/auth/v1/token?grant_type=password','POST',
    {'apikey':ANON_KEY},JSON.stringify({email:'propietario@gestpatrimonio.com',password:'Demo123!'}));
  if(si.status<300){const t=JSON.parse(si.data);console.log(`✅ WORKS! ${t.user?.email} (${t.user?.id})`)}
  else console.error(`❌ ${si.status}: ${si.data.slice(0,200)}`);

  const cnt=await rq(`SELECT COUNT(*) FROM patrimonio_assets WHERE user_id='${newId}';`,'Count');
  try{console.log('Assets:',JSON.parse(cnt))}catch(e){}
})();
