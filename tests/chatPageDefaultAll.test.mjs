import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const routingStart = source.indexOf('async function handleHashRouting() {');
const routingEnd = source.indexOf('// ----------------------------------------------------\n// 2. LOADING THREADS', routingStart);
const resetStart = source.indexOf('function resetSmaxPageFilterToAll() {');
const resetEnd = source.indexOf('function setupEventListeners()', resetStart);
assert.ok(routingStart > 0 && routingEnd > routingStart && resetStart > 0 && resetEnd > resetStart);

const handlers = source.slice(routingStart, routingEnd) + '\n' +
  source.slice(resetStart, resetEnd);

function setup({hash, initialPage='fb107767088445908', threads=[]}={}) {
  const calls = {pageLoads:[], messages:[], tabClicks:0};
  const items = ['all','fb1574281086218015','fb107767088445908'].map(pid => ({
    dataset:{pid},
    classList:{active:pid===initialPage, toggle(_,active){this.active=active;}}
  }));
  const label = {textContent:initialPage==='all'?'ALL':'Nlife'};
  const appContainer = {classList:{add:()=>{}}};
  const menu = {querySelectorAll:()=>items};
  const document = {
    querySelector(selector) {
      if(selector==='.tab-nav-btn[data-target="chat-tab-content"]') return {click(){calls.tabClicks++;}};
      if(selector==='#channelFilterBtn .filter-label') return label;
      return null;
    },
    getElementById(id) {return id==='channelFilterMenu'?menu:
      id==='appContainer'?appContainer:null;}
  };
  const scope = {
    document, window:{location:{hash},isHandlingHashRouting:false},
    URLSearchParams, console,
    loadThreads:async()=>{calls.pageLoads.push(scope.selectedPagePid);
      scope.smaxThreads = threads;},
    loadMessages:async(thread)=>{calls.messages.push(thread);}
  };
  // Expose local state for assertions while keeping the production functions unchanged.
  runInNewContext(`let selectedPagePid=${JSON.stringify(initialPage)};
    let smaxThreads=${JSON.stringify(threads)};
    let currentSmaxAfter='cursor';
    ${handlers}
    this.route=handleHashRouting;
    Object.defineProperty(this,'selectedPagePid',{get:()=>selectedPagePid});
    Object.defineProperty(this,'smaxThreads',{get:()=>smaxThreads,set:v=>smaxThreads=v});
    Object.defineProperty(this,'currentSmaxAfter',{get:()=>currentSmaxAfter});
  `,scope);
  return {scope,calls,items,label};
}

test('View Chat from Orders resets the page filter to ALL and opens the correct conversation',async()=>{
  const threads=[
    {tid:'fb123',page_pid:'fb1574281086218015'},
    {tid:'fb123',page_pid:'fb107767088445908'}
  ];
  const {scope,calls,items,label}=setup({
    hash:'#tin-nhan?pid=fb1574281086218015&tid=fb123',
    initialPage:'fb107767088445908',threads
  });
  await scope.route();
  assert.equal(scope.selectedPagePid,'all');
  assert.deepEqual(calls.pageLoads,['all']);
  assert.equal(label.textContent,'ALL');
  assert.equal(items.find(x=>x.dataset.pid==='all').classList.active,true);
  assert.equal(items.find(x=>x.dataset.pid==='fb107767088445908').classList.active,false);
  assert.equal(calls.messages.length,1);
  assert.equal(calls.messages[0].page_pid,'fb1574281086218015');
  assert.equal(scope.window.isHandlingHashRouting,false);
});

test('deep linked chat keeps ALL when already selected without needless reload',async()=>{
  const thread={tid:'fb111',page_pid:'fb1574281086218015'};
  const {scope,calls,label}=setup({
    hash:'#tin-nhan?pid=fb1574281086218015&tid=fb111',
    initialPage:'all',threads:[thread]
  });
  await scope.route();
  assert.deepEqual(calls.pageLoads,[]);
  assert.equal(scope.selectedPagePid,'all');
  assert.equal(label.textContent,'ALL');
  assert.equal(calls.messages[0].tid,thread.tid);
});

test('when the target is outside the loaded thread page, the URL pid locates it but never filters the list',async()=>{
  const {scope,calls}=setup({
    hash:'#tin-nhan?pid=fb1574281086218015&tid=fb999',
    initialPage:'fb107767088445908',threads:[{tid:'fb888',page_pid:'fb107767088445908'}]
  });
  await scope.route();
  assert.equal(scope.selectedPagePid,'all');
  assert.deepEqual(calls.pageLoads,['all']);
  assert.equal(calls.messages[0].page_pid,'fb1574281086218015');
  assert.equal(calls.messages[0].tid,'fb999');
});

test('entering Chat without a target also resets the menu to ALL',async()=>{
  const {scope,calls,label}=setup({hash:'#tin-nhan',threads:[{tid:'fb1'}]});
  await scope.route();
  assert.equal(scope.selectedPagePid,'all');
  assert.equal(label.textContent,'ALL');
  assert.deepEqual(calls.pageLoads,['all']);
  assert.deepEqual(calls.messages,[]);
});

test('page filtering is only performed by the channel dropdown click, not routing or message opening',()=>{
  const start=source.indexOf("channelFilterMenu.querySelectorAll('.channel-filter-item').forEach(item =>");
  const end=source.indexOf('document.addEventListener(\'click\'',start);
  const manual=source.slice(start,end);
  assert.match(manual,/item\.addEventListener\('click'/);
  assert.match(manual,/selectedPagePid = pid;/);
  assert.match(manual,/loadThreads\(\)/);
  const route=source.slice(routingStart,routingEnd);
  assert.doesNotMatch(route,/selectedPagePid = pid;/);
  assert.match(route,/resetSmaxPageFilterToAll\(\)/);
  const message=source.slice(source.indexOf('async function loadMessages(thread) {'),
    source.indexOf('async function fetchMessages(',source.indexOf('async function loadMessages(thread) {')));
  assert.match(message,/history\.pushState/);
  assert.doesNotMatch(message,/selectedPagePid = thread\./);
});
