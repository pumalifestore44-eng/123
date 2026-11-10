const {PGlite}=require('./sql-runtime/node_modules/@electric-sql/pglite'),fs=require('fs'),assert=require('node:assert/strict');
(async()=>{const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role;');
 const sql=fs.readFileSync('supabase/create_ai_post_requests_table.sql','utf8');await db.exec(sql);await db.exec(sql);
 await db.exec('set role anon');
 const inserted=await db.query(`insert into public.ai_post_requests(client_request_id,conversation_id,request_text,metadata) values (gen_random_uuid(),gen_random_uuid(),'Đăng bài kiểm thử','{"image_urls":["https://images.test/a.jpg"]}') returning *`);
 const row=inserted.rows[0];assert.equal(row.status,'pending');assert.equal(row.request_text,'Đăng bài kiểm thử');assert.equal(row.metadata.image_urls.length,1);
 await assert.rejects(()=>db.query(`insert into public.ai_post_requests(client_request_id,conversation_id,request_text) values ($1,$2,'Duplicate')`,[row.client_request_id,row.conversation_id]),/unique/);
 await db.query(`update public.ai_post_requests set status='completed',response_text='Test' where id=$1`,[row.id]);
 assert.equal((await db.query('select status from public.ai_post_requests')).rows[0].status,'completed');
 await assert.rejects(()=>db.query(`insert into public.ai_post_requests(client_request_id,conversation_id,request_text) values (gen_random_uuid(),gen_random_uuid(),' ')`),/check/);
 console.log('Dedicated queue SQL: repeatable setup, anon insert/read/update, pending default, unique request and content constraints passed');
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
