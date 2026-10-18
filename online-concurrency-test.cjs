/* Optional real PostgreSQL concurrency test. Uses ONLY a throwaway local database.
 * PGHOST/PGPORT/PGDATABASE/PGUSER must identify the isolated local test server.
 * Auth JWT lookup and Realtime broadcast delivery remain stubs, not Supabase integration.
 */
const {Client}=require(process.env.PG_MODULE||'/tmp/onlineqa/node_modules/pg');
const fs=require('node:fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
(async()=>{
 if(!process.env.PGHOST?.startsWith('/tmp/mini-online-'))throw Error('Refusing a non-isolated database');
 const options={host:process.env.PGHOST,port:Number(process.env.PGPORT),user:process.env.PGUSER||'kit',database:process.env.PGDATABASE||'postgres'};
 const clients=await Promise.all(Array.from({length:6},async()=>{const c=new Client(options);await c.connect();await c.query("set statement_timeout='8s'");return c;}));
 const [admin,a,b,watch,a2,b2]=clients;
 try{
 await admin.query(`
 create role anon;create role authenticated;create schema auth;create schema realtime;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create table realtime.messages(extension text);alter table realtime.messages enable row level security;
 create function realtime.topic() returns text language sql stable as $$select current_setting('realtime.topic',true)$$;
 create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;
 `);
 const sql=fs.readFileSync(__dirname+'/sql/001-online.sql','utf8');await admin.query(sql);await admin.query(sql);
 const ids=[randomUUID(),randomUUID()];for(const id of ids)await admin.query('insert into auth.users values($1)',[id]);
 for(const [c,i]of [[a,0],[b,1],[a2,0],[b2,1]]){await c.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[i]]);await c.query('set role authenticated');}
 const rpc=async(c,name,args=[]) => (await c.query('select public.'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as value',args)).rows[0].value;
 let r=await rpc(a,'online_create_room',['Concurrency salon','Lilou',randomUUID()]);
 await rpc(b,'online_join_room',['Concurrency salon','Lulu']);
 const get=()=>rpc(a,'online_get_room',[r.id]);
 const act=async(c,kind,cell=null)=>{r=await get();return rpc(c,'online_action',[r.id,r.instance,r.version,randomUUID(),kind,cell]);};
 // Hold the room; the heartbeat must wait without grabbing its member row.
 await admin.query('begin');await admin.query('select 1 from app_private.rooms where id=$1 for update',[r.id]);
 const heartbeat=rpc(b,'online_heartbeat',[r.id]);
 await watch.query('begin');
 await watch.query('select 1 from app_private.members where room_id=$1 and uid=$2 for update nowait',[r.id,ids[1]]);
 await watch.query('commit');await admin.query('commit');await heartbeat;
 // Exercise room/member lock contention, including ready and unready updates.
 for(let i=0;i<6;i++){
  r=await get();const args=[r.id,r.instance,r.version,randomUUID(),i%2?'unready':'ready',null];
  await Promise.all([rpc(b,'online_heartbeat',[r.id]),rpc(b2,'online_action',args)]);
 }
 await act(a,'ready');await act(b,'ready');await act(a,'start');r=await get();
 // Same actor, same expected version, distinct legal moves: exactly one commits.
 const startVersion=r.version;
 const race=await Promise.allSettled([0,1].map(cell=>rpc(cell===0?a:a2,'online_action',[r.id,r.instance,startVersion,randomUUID(),'place',cell])));
 assert.equal(race.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(race.filter(x=>x.status==='rejected'&&x.reason.message.includes('STALE_VERSION')).length,1);
 r=await get();assert.equal(r.version,startVersion+1);assert.equal(r.board.filter(Boolean).length,1);
 // Identical retry raced at the database boundary returns the same receipt once.
 const args=[r.id,r.instance,r.version,randomUUID(),'place',3];
 const retry=await Promise.all([rpc(b,'online_action',args),rpc(b2,'online_action',args)]);
 assert.deepEqual(retry[0],retry[1]);r=await get();assert.equal(r.board.filter(Boolean).length,2);
 const version=r.version;
 // Heartbeat vs explicit departure may finish first, or get NOT_MEMBER, never deadlock.
 const left=await Promise.allSettled([rpc(b,'online_heartbeat',[r.id]),rpc(b2,'online_action',[r.id,r.instance,r.version,randomUUID(),'leave',null])]);
 assert.equal(left[1].status,'fulfilled');if(left[0].status==='rejected')assert(left[0].reason.message.includes('NOT_MEMBER'));
 r=await get();assert.equal(r.status,'waiting');assert.equal(r.members.length,1);assert.equal(r.version,version+1);
 console.log('PASS real PostgreSQL migration repeat, heartbeat room-first contention, heartbeat/ready/unready/leave races, distinct-action CAS and duplicate receipt concurrency');
 }finally{
 await admin.query('rollback').catch(()=>{});await watch.query('rollback').catch(()=>{});
 await Promise.all(clients.map(c=>c.end()));
 }
})().catch(e=>{console.error(e);process.exit(1)});
