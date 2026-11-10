const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('app.js','utf8');const fn=source.slice(source.indexOf('async function loadThreads('),source.indexOf('function updateBadgeCounters()'));
const TT='ttw6622749003845042177';
const smax={tid:'same-id',page_pid:'fb-page',updated_at:'2026-10-26T01:00:00Z',message:'Facebook'};
const tik={tid:'same-id',page_pid:TT,source:'botbanhang_tiktok',updated_at:'2026-10-27T01:00:00Z',customer:{name:'Khách TikTok'},message:'Size 39'};
function setup(options={}){
 const calls=[],context={selectedPagePid:options.page||'all',TIKTOK_SMAX_MENU_PID:TT,SMAX_PAGE_IDS:['fb-page',TT],SMAX_BIZ_ID:'test',smaxToken:'fake',
 isLoadingThreads:false,smaxThreads:options.existing||[],activeThread:null,currentSmaxAfter:'old-cursor',currentSmaxSearch:options.search||'',currentSmaxFilterReply:null,currentSmaxFilterSeen:null,
 document:{getElementById:()=>({innerHTML:''})},window:{},navigator:{onLine:true},console:{log(){},warn(){},error(){}},
 getOfflineThreadScopeKey:()=>context.selectedPagePid,cacheThreads:async()=>{},updateBadgeCounters(){},renderThreads(){},fetchThreadOrdersMap(){},loadMessages:async()=>{},
 fetchTikTokChatboxConversations:async()=>{calls.push({source:'tiktok'});if(options.tiktokError)throw Error('TikTok unavailable');return options.tiktok||[tik]},
 fetch:async(url,opts)=>{calls.push({source:'smax',payload:JSON.parse(opts.body)});if(options.smaxError)throw Error('Smax unavailable');return{ok:true,json:async()=>({data:options.smax||[smax],after:'next-smax'})}}};
 vm.createContext(context);vm.runInContext(fn,context);return{context,calls};
}
test('ALL fetches Smax and BotBanHang, orders latest first, and preserves same ID on different pages',async()=>{
 const {context,calls}=setup();await context.loadThreads();assert.equal(context.smaxThreads.length,2);assert.equal(context.smaxThreads[0].source,'botbanhang_tiktok');
 assert.equal(calls.filter(c=>c.source==='tiktok').length,1);assert.deepEqual([...calls.find(c=>c.source==='smax').payload.page_pids],['fb-page']);assert.equal(context.currentSmaxAfter,'next-smax');
});
test('loading older Smax pages keeps TikTok and replaces duplicates without adding a second TikTok row',async()=>{
 const {context,calls}=setup({existing:[smax,tik],smax:[{...smax,message:'Updated'},{...smax,tid:'old',updated_at:'2026-10-25T00:00:00Z'}]});
 await context.loadThreads(false,true);assert.equal(context.smaxThreads.length,3);assert.equal(context.smaxThreads.find(t=>t.page_pid==='fb-page'&&t.tid==='same-id').message,'Updated');assert.equal(calls.find(c=>c.source==='smax').payload.after,'old-cursor');
});
test('ALL still shows the available source when the other API fails',async()=>{
 for(const options of [{smaxError:true},{tiktokError:true}]){const {context}=setup(options);await context.loadThreads();assert.equal(context.smaxThreads.length,1);assert.equal(context.smaxThreads[0].page_pid,options.smaxError?TT:'fb-page')}
});
test('page-specific views only query their own source and ALL searches TikTok locally',async()=>{
 let run=setup({page:TT});await run.context.loadThreads();assert.equal(run.calls.length,1);assert.equal(run.calls[0].source,'tiktok');
 run=setup({page:'fb-page'});await run.context.loadThreads();assert.equal(run.calls.length,1);assert.equal(run.calls[0].source,'smax');
 run=setup({search:'khách tiktok',smax:[]});await run.context.loadThreads();assert.equal(run.context.smaxThreads.length,1);
 run=setup({search:'unmatched',smax:[]});await run.context.loadThreads();assert.equal(run.context.smaxThreads.length,0);
});
