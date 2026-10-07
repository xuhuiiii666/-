import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {demoRoot} from '../storage-v2/demo.mjs';
const {webkit}=createRequire(process.env.PLAYWRIGHT_PACKAGE||process.execPath)('playwright');
const directory=fileURLToPath(new URL('../',import.meta.url));
let server,browser,url;
function fixture(){
  const root=demoRoot(),p=root.profiles[root.activeProfileId].programs['demo-one'];
  p.actualDates={};p.dateAnchors={};p.sessionStartedAt={};p.completed={};p.currentWorkoutDrafts={};p.currentSessionNote='';
  const ex=p.days[0].exercises[0];ex.name=ex.trackingName='测试动作【本块增量】';
  ex.sets=Array.from({length:3},(_,i)=>({...ex.sets[0],setId:'current-S'+(i+1),setNo:i+1,setType:'working',reps:'8',rir:'2',targetRepsMin:8,targetRepsMax:8,targetRirMin:2,targetRirMax:2}));
  p.workoutLogs=[{actualDate:'2026-10-01',title:'上次',workoutId:'prior',entries:[1,2,3].map((n)=>({type:'主训练',name:'测试动作',trackingName:'测试动作',set:n,setType:n===3?'dropset':'working',weight:String(n===1?65:n===2?62.5:40),unit:'kg',reps:'8',rir:'2'}))}];
  return root;
}
test.before(async()=>{
  server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,file=path.join(directory,name==='/'?'index.html':name);if(!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(file).pipe(res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port+'/';browser=await webkit.launch({headless:true});
});
test.after(async()=>{await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));});
async function run(fn,seed=fixture()){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
  await context.addInitScript(root=>{if(!localStorage.getItem('training-tracker-state'))localStorage.setItem('training-tracker-state',JSON.stringify(root));window.__writes=0;const set=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){window.__writes++;return set.apply(this,args);};},seed);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  try{await page.goto(url);await page.waitForFunction(()=>window.trainingAppReady);await fn(page);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}finally{await context.close();}
}
const weight=p=>p.locator('#exercises .mainCard [data-field="weight"]').first();
test('WU1 first working weight only, source labelled, no startup writes or actual date',()=>run(async p=>{
  assert.equal(await weight(p).inputValue(),'62.5');assert.deepEqual(await p.locator('#exercises [data-field="weight"]').evaluateAll(ns=>ns.map(n=>n.value)),['62.5','','']);
  assert.match(await p.locator('[data-anchor-status]').first().textContent(),/第2个普通工作组/);
  assert.match(await p.locator('[data-anchor-result]').first().textContent(),/预估/);
  assert.equal(await p.evaluate(()=>__writes),0);assert.deepEqual(await p.evaluate(()=>state.actualDates),{});
  assert.equal(await p.evaluate(()=>state.currentWorkoutDrafts[currentDraftKey()]),undefined);
  await p.locator('#exercises .setrow').first().screenshot({path:'/tmp/training-weight-reference-card.png'});
}));
test('WU2 unconfirmed reference never enters logs, saved draft weights, or execution date',()=>run(async p=>{
  const old=await p.evaluate(()=>JSON.stringify(state.workoutLogs));
  await p.evaluate(()=>saveProgress());
  assert.equal(await p.evaluate(()=>state.currentWorkoutDrafts[currentDraftKey()].mains[0].sets[0].weight),'');
  assert.deepEqual(await p.evaluate(()=>state.actualDates),{});
  assert.equal(await p.evaluate(()=>collectEntries().find(e=>e.setId==='current-S1').weight),'');
  assert.equal(await p.evaluate(()=>JSON.stringify(state.workoutLogs)),old);
  await p.reload();await p.waitForFunction(()=>window.trainingAppReady);assert.equal(await weight(p).inputValue(),'62.5');
}));
test('WU3 actual input confirms weight, calculates RM, persists and logs stable set identity',()=>run(async p=>{
  const before=await p.evaluate(()=>JSON.stringify(getWorkout().exercises));
  await p.locator('#exercises [data-field="reps"]').first().fill('7');
  await p.locator('#exercises [data-field="rir"]').first().fill('1');
  assert.match(await p.locator('[data-anchor-result]').first().textContent(),/今日e1RM/);
  assert.equal(await p.evaluate(()=>state.currentWorkoutDrafts[currentDraftKey()].mains[0].sets[0].weight),'62.5');
  const entry=await p.evaluate(()=>collectEntries().find(e=>e.setId==='current-S1'));assert.equal(entry.weight,'62.5');assert.equal(entry.setType,'working');assert.equal(entry.setId,'current-S1');assert.equal(entry.exerciseId,'demo-one-exercise');
  assert.equal(await p.evaluate(()=>JSON.stringify(getWorkout().exercises)),before);
  await p.reload();await p.waitForFunction(()=>window.trainingAppReady);assert.equal(await weight(p).inputValue(),'62.5');
  assert.equal(await weight(p).evaluate(n=>n.closest('.setrow').hasAttribute('data-history-weight-reference')),false);
}));
test('WU4 manual clear remains blank through rebuild and reload',()=>run(async p=>{
  await weight(p).fill('');await p.evaluate(()=>rebuild());assert.equal(await weight(p).inputValue(),'');
  await p.reload();await p.waitForFunction(()=>window.trainingAppReady);assert.equal(await weight(p).inputValue(),'');
}));
test('WU5 existing draft and special first set take precedence',async()=>{
  const seed=fixture(),program=seed.profiles['demo-profile'].programs['demo-one'];
  program.currentWorkoutDrafts['demo-one-day']={workoutId:'demo-one-day',mains:[{exerciseId:'demo-one-exercise',name:'测试动作【本块增量】',sets:[{...program.days[0].exercises[0].sets[0],weight:'70',unit:'kg'}]}]};
  await run(async p=>assert.equal(await weight(p).inputValue(),'70'),seed);
  const special=fixture();special.profiles['demo-profile'].programs['demo-one'].days[0].exercises[0].sets[0].setType='technique';
  await run(async p=>assert.equal(await weight(p).inputValue(),''),special);
});
test('WU6 completing first set accepts displayed weight without rewriting canonical data',()=>run(async p=>{
  const before=await p.evaluate(()=>JSON.stringify(getWorkout().exercises)),logs=await p.evaluate(()=>state.workoutLogs.length);
  await p.locator('#exercises .restBtn').first().tap();
  assert.equal(await p.evaluate(()=>collectEntries().find(e=>e.setId==='current-S1').weight),'62.5');
  assert.doesNotMatch(await p.locator('[data-anchor-status]').first().textContent(),/待确认/);
  assert.equal(await p.evaluate(()=>state.workoutLogs.length),logs);
  assert.equal(await p.evaluate(()=>JSON.stringify(getWorkout().exercises)),before);
  await p.evaluate(()=>pauseTimer());
}));
test('WU7 Finish and backup preserve explicit working identity and complete old history',()=>run(async p=>{
  await weight(p).fill('67.5');await p.locator('#exercises [data-field="reps"]').first().fill('9');
  const old=await p.evaluate(()=>JSON.stringify(state.workoutLogs));
  await p.evaluate(()=>finishWorkoutCompleteBackup());
  const backup=await p.evaluate(()=>buildCycleBackupObject());
  const logs=backup.state.profiles['demo-profile'].programs['demo-one'].workoutLogs;
  assert.equal(logs.length,2);assert.equal(JSON.stringify(logs.slice(0,1)),old);
  const actual=logs.at(-1).entries.find(e=>e.setId==='current-S1');
  assert.equal(actual.weight,'67.5');assert.equal(actual.setType,'working');assert.equal(actual.exerciseId,'demo-one-exercise');
  assert.equal(await p.evaluate(()=>getLastOrdinaryWorkingSet(trainingTrackerState,'测试动作').weight),'67.5');
}));
test('WU8 rename clears pending reference from previous exercise',()=>run(async p=>{
  await p.locator('#exercises [data-field="mainName"]').first().fill('完全不同的动作');
  assert.equal(await weight(p).inputValue(),'');
  assert.ok((await p.evaluate(()=>collectEntries())).filter(e=>e.type==='主训练').every(e=>!e.weight));
}));
test('WU9 superset members receive independent references without duplicate cards',async()=>{
  const seed=fixture(),program=seed.profiles['demo-profile'].programs['demo-one'],day=program.days[0],first=day.exercises[0];
  first.sets=first.sets.slice(0,2);first.supersetId='SS1';
  const second=JSON.parse(JSON.stringify(first));second.exerciseId='E2';second.name=second.trackingName='独立第二动作';second.sets.forEach((s,i)=>s.setId='E2-S'+i);
  day.exercises.push(second);day.supersetRules=[{supersetId:'SS1',mode:'alternating',members:[first.exerciseId,second.exerciseId],roundRestMinSec:90,roundRestMaxSec:90}];
  program.workoutLogs[0].entries.push({type:'主训练',name:second.name,trackingName:second.name,set:1,setType:'working',weight:'20',unit:'kg',reps:'8',rir:'2'});
  await run(async p=>{
    assert.equal(await p.locator('#exercises > .supersetCard').count(),1);
    assert.equal(await p.locator('#exercises .mainCard').count(),2);
    assert.equal(await p.locator('[data-card-id="E2"] [data-field="weight"]').first().inputValue(),'20');
    assert.equal(await weight(p).inputValue(),'62.5');
    assert.equal(await p.evaluate(()=>__writes),0);
  },seed);
});
test('WU10 duplicating an unconfirmed reference cannot turn it into an actual weight',async()=>{
  const seed=fixture();seed.profiles['demo-profile'].programs['demo-one'].days[0].exercises[0].sets.length=1;
  await run(async p=>{
    await p.locator('#exercises [onclick="duplicateMainSet(this)"]').tap();
    assert.equal(await p.locator('#exercises [data-field="weight"]').nth(1).inputValue(),'');
    assert.equal(await p.evaluate(()=>currentMainWorkoutHasWeight()),false);
    assert.ok((await p.evaluate(()=>collectEntries())).filter(e=>e.type==='主训练').every(e=>!e.weight));
  },seed);
});
