import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadTrainingModules} from './helpers.mjs';

const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||process.execPath);
const {webkit}=require('playwright');
const directory=fileURLToPath(new URL('../',import.meta.url));
const m=loadTrainingModules();
function fixture(){
  const program=m.createProgramFromPlan([{workoutId:'A05-D1',title:'Timer fixture',workoutType:'strength',
    exercises:[{exerciseId:'A05-E1',name:'Bench press',section:'主项',trainingRole:'main',sets:[1,2,3].map(n=>({setId:'A05-S'+n,rest:180,reps:'8',rir:'2'}))}],
    activities:[{activityId:'A05-W1',activityType:'warmup',warmupType:'ramp',title:'主项热身',segments:[{segmentNo:1,label:'Bench press',instruction:'空杆×10'}]}]
  }],{programId:'A05-P',name:'Timer fixture',source:'long-form-daily-v1'});
  return {schemaVersion:6,activeProfileId:'A05-PF',activeProgramId:'A05-P',profiles:{'A05-PF':{profileId:'A05-PF',programs:{'A05-P':program},exerciseTemplates:[],warmupTemplates:[],rmRecords:[]}},ui:{}};
}
let browser,server,url;
test.before(async()=>{
  server=http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname,file=path.join(directory,name==='/'?'index.html':name);
    if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port+'/';
  browser=await webkit.launch({headless:true});
});
test.after(async()=>{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));});
async function withPage(run){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  try{
    await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
    await context.addInitScript(root=>{
      localStorage.setItem('training-tracker-state',JSON.stringify(root));
      window.__writes=0;const old=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){__writes++;return old.call(this,k,v);};
      window.__now=Date.parse('2026-09-11T10:00:00Z');Date.now=()=>__now;
      window.__intervals=new Map();window.__created=0;
      window.setInterval=fn=>{const id=++__created;__intervals.set(id,fn);return id;};
      window.clearInterval=id=>__intervals.delete(id);
      window.__advance=ms=>{__now+=ms;for(const fn of [...__intervals.values()])fn();};
    },fixture());
    const p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));p.on('dialog',d=>d.dismiss());
    await p.goto(url,{waitUntil:'load'});
    // Completion sound is outside the preset contract; retain the real timer and DOM code.
    await p.evaluate(()=>{beep=()=>{};beepAction=()=>{};});
    const canonical=await p.evaluate(()=>JSON.stringify(getActiveProgram().days));
    await run(p);
    assert.equal(await p.evaluate(()=>JSON.stringify(getActiveProgram().days)),canonical);
    assert.deepEqual(errors,[]);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }finally{await context.close();}
}
const snapshot=p=>p.evaluate(()=>({base:timerBase,left:timerLeft,context:activeTimerContext,activeSet,rows:rowTimers,interval:timerId,count:__intervals.size,created:__created,now:__now,text:document.getElementById('timer').textContent}));
const data=p=>p.evaluate(()=>JSON.stringify({root:localStorage.getItem('training-tracker-state'),state,runtime:trainingTrackerState,writes:__writes,dirty:warmupEditState}));
const preset=(p,seconds)=>p.locator('[data-timer-seconds="'+seconds+'"]').tap();
const action=(p,name)=>p.locator('[data-timer-action="'+name+'"]').tap();
const advance=(p,ms)=>p.evaluate(ms=>__advance(ms),ms);
async function start180(p){await preset(p,180);await action(p,'start');}
async function assertLeft(p,n){const s=await snapshot(p);assert.equal(s.left,n);assert.equal(s.text,String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0'));}

test('A05-1 idle preset selects 90 without starting or writing data',()=>withPage(async p=>{
  const before=await data(p);await preset(p,90);await assertLeft(p,90);assert.equal((await snapshot(p)).context,null);assert.equal((await snapshot(p)).count,0);assert.equal(await data(p),before);
}));
test('A05-2 running 180 after 20s switches to 90 then 89, not old 159',()=>withPage(async p=>{
  await start180(p);await advance(p,20000);await assertLeft(p,160);const old=await snapshot(p);
  await preset(p,90);const s=await snapshot(p);await assertLeft(p,90);assert.equal(s.base,90);assert.equal(s.context.endAt,s.now+90000);assert.notEqual(s.context.endAt,old.context.endAt);
  assert.equal(s.interval,old.interval);await advance(p,1000);await assertLeft(p,89);
}));
test('A05-3 consecutive 90/45/120 always uses the last selection',()=>withPage(async p=>{
  await start180(p);for(const n of [90,45,120]){await preset(p,n);await assertLeft(p,n);await advance(p,1000);await assertLeft(p,n-1);}
}));
test('A05-4 repeated presets retain exactly one original interval',()=>withPage(async p=>{
  await start180(p);const original=await snapshot(p);
  for(const n of [90,45,120,180,90,90,300]){await preset(p,n);const s=await snapshot(p);assert.equal(s.count,1);assert.equal(s.interval,original.interval);assert.equal(s.created,original.created);}
}));
test('A05-5 paused 72 selects 90 without resuming, start resumes at 90',()=>withPage(async p=>{
  await preset(p,90);await action(p,'start');await advance(p,18000);await action(p,'pause');await assertLeft(p,72);
  await preset(p,90);await advance(p,10000);await assertLeft(p,90);assert.equal((await snapshot(p)).context,null);assert.equal((await snapshot(p)).count,0);
  await action(p,'start');await assertLeft(p,90);await advance(p,1000);await assertLeft(p,89);
}));
test('A05-6 same 90 preset restarts from 65 to 90 then 89',()=>withPage(async p=>{
  await preset(p,90);await action(p,'start');await advance(p,25000);await assertLeft(p,65);await preset(p,90);await assertLeft(p,90);await advance(p,1000);await assertLeft(p,89);
}));
test('A05-7 focus and visibility recovery use the new deadline',()=>withPage(async p=>{
  await start180(p);await advance(p,20000);await preset(p,90);const before=await snapshot(p);
  await p.evaluate(()=>{__now+=10000;window.dispatchEvent(new Event('focus'));});await assertLeft(p,80);
  await p.evaluate(()=>{__now+=1000;document.dispatchEvent(new Event('visibilitychange'));});await assertLeft(p,79);
  const after=await snapshot(p);assert.equal(after.context.endAt,before.context.endAt);assert.equal(after.interval,before.interval);assert.equal(after.count,1);
}));
async function restIsolation(p,selector,seconds){
  const row=p.locator(selector).first(),id=await row.getAttribute('data-set-id');
  await row.locator('input[type=range]').evaluate((el,n)=>{el.value=String(n);el.dispatchEvent(new Event('input',{bubbles:true}));},seconds);
  await row.locator('.restBtn').tap();const original=await snapshot(p),before=await data(p);
  assert.equal(original.context.type,'rest');assert.equal(original.context.id,id);assert.equal(original.left,seconds);
  await preset(p,90);const s=await snapshot(p);assert.deepEqual(s.context,original.context);assert.deepEqual(s.rows,original.rows);assert.equal(s.activeSet,id);assert.equal(s.left,seconds);
  assert.equal(s.interval,original.interval);assert.equal(s.count,1);assert.equal(await data(p),before);
  await advance(p,1000);assert.equal(await p.locator('[id="mt_'+id+'"]').textContent(),seconds===180?'02:59':'00:29');
  await advance(p,1000);assert.equal(await p.locator('[id="mt_'+id+'"]').textContent(),seconds===180?'02:58':'00:28');
  assert.equal(await data(p),before);
}
test('A05-8 main set rest retains context/setId/deadline and independent row countdown',()=>withPage(p=>restIsolation(p,'#exercises .setrow',180)));
test('A05-9 warmup rest retains its own context and 30/29/28 countdown',()=>withPage(p=>restIsolation(p,'#warmupExercises .setrow',30)));
test('A05-10 action duration retains deadline, ID and visible countdown',()=>withPage(async p=>{
  const row=p.locator('#exercises .setrow').first(),id=await row.getAttribute('data-set-id');await row.locator('[data-field=duration]').fill('20');
  await p.evaluate(id=>startDurationTimer(id),id);const old=await snapshot(p),before=await data(p);
  await preset(p,90);const s=await snapshot(p);assert.deepEqual(s.context,old.context);assert.equal(s.context.type,'action');assert.equal(s.activeSet,id);assert.equal(s.left,20);assert.equal(s.interval,old.interval);
  await advance(p,1000);assert.equal(await p.locator('[id="dt_'+id+'"]').textContent(),'00:19');assert.equal(await data(p),before);
}));
test('A05-11 general preset lifecycle never creates execution dates',()=>withPage(async p=>{
  const dates=await p.evaluate(()=>JSON.stringify({actualDates:state.actualDates,dateAnchors:state.dateAnchors,sessionStartedAt:state.sessionStartedAt}));
  await start180(p);await preset(p,90);await advance(p,1000);await action(p,'pause');await preset(p,45);await action(p,'start');
  assert.equal(await p.evaluate(()=>JSON.stringify({actualDates:state.actualDates,dateAnchors:state.dateAnchors,sessionStartedAt:state.sessionStartedAt})),dates);
}));
test('A05-12 preset lifecycle preserves full drafts/logs/completed/index/IDs and ROOT bytes',()=>withPage(async p=>{
  const before=await data(p);await start180(p);await advance(p,20000);await preset(p,90);await advance(p,1000);await action(p,'pause');await preset(p,45);await action(p,'start');await action(p,'reset');assert.equal(await data(p),before);
}));
test('A05-13 zero completion followed by 120 stays idle until start',()=>withPage(async p=>{
  await preset(p,45);await action(p,'start');await advance(p,45000);await assertLeft(p,0);assert.equal((await snapshot(p)).context,null);
  await preset(p,120);await assertLeft(p,120);assert.equal((await snapshot(p)).count,0);await advance(p,1000);await assertLeft(p,120);await action(p,'start');await advance(p,1000);await assertLeft(p,119);
}));
test('A05-14 reset after running preset uses latest base and stops the interval',()=>withPage(async p=>{
  await start180(p);await preset(p,90);await advance(p,1000);await action(p,'reset');await assertLeft(p,90);assert.equal((await snapshot(p)).context,null);assert.equal((await snapshot(p)).count,0);
}));
