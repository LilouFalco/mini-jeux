/* LOCAL PostgreSQL + real pg_cron integration. Auth/realtime SQL stubs only.
 * Use a FRESH local Postgres cluster with pg_cron preloaded. NO remote Supabase.
 * PGHOST must be an absolute Unix socket directory; PGPORT defaults 39783.
 */
const {Client}=require(process.env.PG_MODULE||'/tmp/onlineqa/node_modules/pg');
if(!process.env.PGHOST?.startsWith('/'))throw Error('LOCAL_UNIX_SOCKET_REQUIRED'); class PGlite {constructor(){this.c=new Client({host:process.env.PGHOST,port:Number(process.env.PGPORT||39783),user:process.env.PGUSER||'kit',database:'postgres'});this.ready=this.c.connect()}async query(q,p){await this.ready;return this.c.query(q,p)}async exec(q){return this.query(q)}async close(){return this.c.end()}}
const assert=require('node:assert/strict'), fs=require('node:fs');
(async()=>{
 const db=new PGlite(), sql=fs.readFileSync(__dirname+'/sql/001-online.sql','utf8');
 await db.exec(`
 create role anon; create role authenticated; create schema auth; create schema realtime;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table realtime.messages(extension text);
 create table realtime.sent(payload jsonb,event text,topic text,private boolean);
 create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;
 create function realtime.send(p jsonb,e text,t text,b boolean) returns void language sql as $$ insert into realtime.sent values(p,e,t,b) $$;
 alter table realtime.messages enable row level security;
 `);
 const sql2=fs.readFileSync(__dirname+'/sql/002-online-puissance4.sql','utf8');
 await db.exec(sql);
 const ids=['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000007'];
 for(const id of ids)await db.query('insert into auth.users values($1)',[id]);
 const uuid=()=>require('crypto').randomUUID();
 const rpc=async(i,name,args=[])=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]||'']);
  await db.exec('set role authenticated');
  try{return (await db.query('select public.'+name+'('+args.map((_,j)=>'$'+(j+1)).join(',')+') as value',args)).rows[0].value;}
  finally{await db.exec('reset role');}
 };


 await db.exec(sql2);
 const sql3=fs.readFileSync(__dirname+'/sql/003-online-lifecycle.sql','utf8');
 await db.exec(sql3);await db.exec(sql3);

 const fail=async(fn,code)=>assert.rejects(fn,e=>String(e.message).includes(code));
 const setup=async(game='morpion')=>{
  await db.exec('delete from app_private.rooms;delete from app_private.rate_limits;');
  let r=await rpc(0,'online_create_room_game',[game,'Lifecycle test','Lilou',uuid()]);
  await rpc(1,'online_join_room_game',[game,r.name,'Lulu']);return r;
 };
 let r=await setup();let topic=r.topic;
 await fail(()=>rpc(2,'online_depart_room',[r.id]),'NOT_MEMBER');
 assert.equal((await db.query('select count(*)::int n from app_private.rooms')).rows[0].n,1);
 await fail(()=>rpc(99,'online_room_status',[r.id]),'AUTH_REQUIRED');
 await fail(()=>rpc(2,'online_heartbeat',[r.id]),'NOT_MEMBER');
 await rpc(0,'online_depart_room',[r.id]);
 assert.equal((await db.query('select count(*)::int n from app_private.rooms')).rows[0].n,0);
 assert.equal((await rpc(1,'online_room_status',[r.id])).name,'Lilou');
 assert.equal((await rpc(0,'online_depart_room',[r.id])).terminated,true);
 assert.equal(await rpc(1,'online_can_receive',[topic]),false);
 assert.equal((await rpc(1,'online_list_rooms_game',['morpion',0])).length,0);
 console.log('PASS host explicit authoritative delete, cascade, terminal receipts, replay, private old topic, directory');
 r=await setup('puissance4');
 await rpc(1,'online_action',[r.id,r.instance,r.version,uuid(),'leave',null]);
 assert.equal((await rpc(0,'online_room_status',[r.id])).name,'Lulu');
 console.log('PASS frozen legacy board leave overridden');
 r=await setup('chess');await rpc(0,'online_game_leave',[r.id,r.instance,r.version,uuid()]);
 assert.equal((await rpc(1,'online_room_status',[r.id])).terminated,true);
 console.log('PASS future games shared leave');
 r=await setup();await db.query("update app_private.members set seen_at=clock_timestamp()-interval '44 seconds' where room_id=$1 and uid=$2",[r.id,ids[0]]);
 assert.equal((await rpc(0,'online_heartbeat',[r.id])).id,r.id);
 await db.query("update app_private.members set seen_at=clock_timestamp()-interval '46 seconds' where room_id=$1 and uid=$2",[r.id,ids[1]]);
 assert.equal((await rpc(0,'online_room_status',[r.id])).reason,'player_timeout');
 console.log('PASS reconnect before lease cancels timeout; opponent lease is server authoritative');
 r=await setup();await db.query("update app_private.members set seen_at=clock_timestamp()-interval '46 seconds' where room_id=$1",[r.id]);
 assert.equal((await rpc(0,'online_heartbeat',[r.id])).terminated,true);
 console.log('PASS expired heartbeat cannot resurrect host');
 for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);await assert.rejects(()=>db.query('select * from app_private.departures'),/permission denied/);await db.exec('reset role');
 }
 assert.deepEqual((await db.query("select p.oid::regprocedure::text f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='app_private' and (has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute'))")).rows,[]);
 console.log('PASS all private helper ACLs');
 // Dedicated future games cannot bypass lifecycle checks through their own RPCs.
 for(const [game,fn] of [['chess','online_chess_action'],['petitbac','online_petitbac_action'],['naval','online_hidden_action']]){
  r=await setup(game);
  await rpc(0,fn,[r.id,r.instance,r.version,uuid(),'ready',{}]);
  await db.query("update app_private.members set seen_at=clock_timestamp()-interval '46 seconds' where room_id=$1 and uid=$2",[r.id,ids[0]]);
  assert.equal((await rpc(0,fn,[r.id,r.instance,r.version,uuid(),'ready',{}])).terminated,true);
  assert.equal((await rpc(1,'online_get_room',[r.id])).terminated,true);
 }
 console.log('PASS all dedicated action RPCs and legacy get_room enforce server lease');
 // Cron is a real extension, not a SQL shim. Leave one stale room for asynchronous proof.
 // Inspect cron.job_run_details after the next actual minute; no manual cleanup call.
 r=await setup();await db.query("update app_private.members set seen_at=clock_timestamp()-interval '46 seconds' where room_id=$1",[r.id]);
 console.log('READY real cron',JSON.stringify((await db.query("select jobid,jobname,schedule,active from cron.job")).rows),r.id);
 await db.close();
})().catch(e=>{console.error(e);process.exitCode=1});
