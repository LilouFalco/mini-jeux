// LOCAL TEST HELPER ONLY, NOT PRODUCTION. Loads 001-003 into PGlite with a stubbed pg_cron
// and without 003's pg_cron availability guard. Never run against Supabase.
const fs=require('fs');
module.exports=async db=>{await db.exec("create schema cron; create table cron.job(jobname text,active bool default true,command text); create function cron.schedule(n text,s text,c text) returns bigint language sql as $f$ insert into cron.job(jobname,command) values(n,c) returning 1::bigint $f$;");
for(const f of ['001-online','002-online-puissance4','003-online-lifecycle']){let q=fs.readFileSync(__dirname+'/sql/'+f+'.sql','utf8');
 const i=q.indexOf('do $$'),j=q.indexOf('end $$;',i);if(f.startsWith('003')&&i>=0&&q.slice(i,j).includes('pg_available_extensions'))q=q.slice(0,i)+q.slice(j+7);
 await db.exec(q);}};