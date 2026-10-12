import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {loadTrainingModules} from './helpers.mjs';

const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||process.execPath);
const {webkit}=require('playwright');
const directory=fileURLToPath(new URL('../',import.meta.url));
const ROOT='training-tracker-state', m=loadTrainingModules();
function fixture(){
  function program(id){return m.createProgramFromPlan([0,1].map(i=>({workoutId:id+'-D'+i,title:'匿名力量训练 '+i,workoutType:'strength',sourceWorkoutKey:'D'+i,
    exercises:[{exerciseId:id+'-E'+i,name:'测试前蹲',trackingName:'测试前蹲',section:'主项',trainingRole:'main',sets:[0,1,2].map(n=>({setId:id+'-S'+i+'-'+n,weight:'',unit:'kg',reps:'5',rir:'3',rest:180}))}],
    activities:[{activityId:id+'-W'+i,activityType:'warmup',warmupType:'ramp',title:'主项热身',segments:[{segmentNo:1,label:'测试前蹲',instruction:'空杆×10'}]}]
  })),{programId:id,name:'匿名计划 '+id,source:'long-form-daily-v1'});}
  const a=program('P1'),b=program('P2');
  a.workoutLogs=[{logId:'old-log',actualDate:'2026-01-01',title:'历史测试',entries:[{name:'测试前蹲',trackingName:'测试前蹲',type:'主训练',weight:'55',weightKg:55,unit:'kg',reps:'5',rir:'3'}]}];
  return {schemaVersion:6,activeProfileId:'PF',activeProgramId:'P1',profiles:{PF:{profileId:'PF',programs:{P1:a,P2:b},exerciseTemplates:[],warmupTemplates:[],rmRecords:[{weight:55,reps:5}]}},ui:{}};
}
let browser,server,url;
test.before(async()=>{
  server=http.createServer((req,res)=>{
    const name=new URL(req.url,'http://localhost').pathname,file=path.join(directory,name==='/'?'index.html':name);
    if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
    res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/html');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  url='http://127.0.0.1:'+server.address().port+'/';browser=await webkit.launch({headless:true});
});
test.after(async()=>{await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));});
async function withPage(run){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,acceptDownloads:true});
  const page=await context.newPage(),errors=[],dialogs=[];
  await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
  await context.addInitScript(root=>{
    if(localStorage.getItem('training-tracker-state')===null)localStorage.setItem('training-tracker-state',JSON.stringify(root));
    window.__initialRoot=localStorage.getItem('training-tracker-state');
    window.__writes=0;const old=Storage.prototype.setItem;
    Storage.prototype.setItem=function(...args){__writes++;return old.apply(this,args);};
  },fixture());
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  try{
    await page.goto(url,{waitUntil:'load'});await page.waitForFunction(()=>window.trainingAppReady);
    await run(page,dialogs,context);
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }finally{await context.close();}
}
async function activate(p){
  await p.evaluate(()=>showTab('settings'));
  await p.locator('#activateStorage').tap();
  await p.waitForFunction(()=>!!window.trainingStorageBackend && document.getElementById('storageBusy').hidden);
  await p.evaluate(()=>showTab('today'));
}
const disk=p=>p.evaluate(async()=>JSON.stringify((await trainingStorageBackend.database.read()).root));
const legacy=p=>p.evaluate(()=>localStorage.getItem('training-tracker-state'));
const flush=p=>p.evaluate(()=>flushTrainingStorage());
async function reload(p){await p.reload();await p.waitForFunction(()=>window.trainingAppReady);}
async function weight(p,value='60'){
  const row=p.locator('#exercises .mainCard .setrow').first();
  await row.locator('[data-field="weight"]').fill(value);
  await row.locator('[data-field="reps"]').fill('5');await row.locator('[data-field="rir"]').fill('3');await flush(p);
}

test('SI1 startup reads old root without migration or ROOT writes',()=>withPage(async p=>{
  assert.equal(await p.evaluate(()=>trainingStorageBackend),null);
  assert.equal(await p.evaluate(()=>__writes),0);assert.equal(await legacy(p),await p.evaluate(()=>__initialRoot));
}));
test('SI2 actual migration button verifies original content and preserves all IDs/history',()=>withPage(async p=>{
  const before=await legacy(p);await activate(p);
  assert.equal(await disk(p),before);assert.equal(await legacy(p),before);assert.equal(await p.evaluate(()=>__writes),0);
  assert.equal(await p.evaluate(()=>trainingStorageBackend.database.original()),before);
  assert.match(await p.locator('#storageMode').textContent(),/IndexedDB/);
}));
test('SI3 active reload uses IndexedDB and writes nothing at startup',()=>withPage(async p=>{
  await activate(p);const before=await disk(p);await reload(p);
  assert.ok(await p.evaluate(()=>!!trainingStorageBackend));assert.equal(await disk(p),before);assert.equal(await p.evaluate(()=>__writes),0);
}));
test('SI4 weight/reps/RIR immediately persist; reload restores draft by stable IDs',()=>withPage(async p=>{
  await activate(p);const old=await legacy(p);await weight(p);
  const before=await p.locator('#exercises .setrow').first().getAttribute('data-set-id');
  await reload(p);
  const row=p.locator('#exercises .setrow').first();assert.equal(await row.locator('[data-field="weight"]').inputValue(),'60');
  assert.equal(await row.getAttribute('data-set-id'),before);assert.equal(await legacy(p),old);assert.equal(await p.evaluate(()=>__writes),0);
}));
test('SI5 Finish durably appends weight log and advances; repeated tap does not duplicate',()=>withPage(async p=>{
  await activate(p);await weight(p);
  await p.evaluate(()=>Promise.all([finishWorkoutCompleteBackup(),finishWorkoutCompleteBackup()]));
  const root=JSON.parse(await disk(p)),program=root.profiles.PF.programs.P1;
  assert.equal(program.workoutLogs.length,2);assert.equal(program.workoutLogs[1].entries.find(e=>e.type==='主训练').weight,'60');
  assert.equal(program.currentIndex,1);assert.equal(program.completed['P1-D0'],true);assert.ok(program.actualDates['P1-D0']);
  await reload(p);assert.equal(await p.evaluate(()=>state.currentIndex),1);
}));
test('SI6 Finish quota error leaves disk bytes/index/logs unchanged, runtime rolled back',()=>withPage(async(p,dialogs)=>{
  await activate(p);await weight(p);const before=await disk(p);
  await p.evaluate(()=>{trainingStorageBackend.database.db.metadata.hook('updating',()=>{throw new DOMException('quota injected','QuotaExceededError');});});
  await p.evaluate(()=>finishWorkoutCompleteBackup());
  assert.equal(await disk(p),before);assert.equal(await p.evaluate(()=>state.currentIndex),0);
  assert.equal(await p.evaluate(()=>state.workoutLogs.length),1);assert.ok(dialogs.some(s=>s.includes('本次未完成')));
  assert.match(await p.locator('#storageSaveStatus').textContent(),/保存失败/);
}));
test('SI7 Finish success followed by render failure reports saved and keeps committed history',()=>withPage(async(p,dialogs)=>{
  await activate(p);await weight(p);
  await p.evaluate(()=>{rebuild=()=>{throw new Error('render injected');};return finishWorkoutCompleteBackup();});
  const program=JSON.parse(await disk(p)).profiles.PF.programs.P1;
  assert.equal(program.workoutLogs.length,2);assert.equal(program.currentIndex,1);
  assert.ok(dialogs.some(s=>s.includes('训练已保存，但页面刷新')));
}));
test('SI8 Program switch waits for durable commit and restores each independent draft',()=>withPage(async p=>{
  await activate(p);await weight(p);
  await p.evaluate(()=>switchProgramFromSelect('P2'));assert.equal(await p.evaluate(()=>state.programId),'P2');
  await weight(p,'45');await p.evaluate(()=>switchProgramFromSelect('P1'));
  assert.equal(await p.locator('#exercises .setrow').first().locator('[data-field="weight"]').inputValue(),'60');
  const root=JSON.parse(await disk(p));assert.equal(root.activeProgramId,'P1');assert.equal(root.profiles.PF.programs.P1.workoutLogs.length,1);assert.equal(root.profiles.PF.programs.P2.workoutLogs.length,0);
}));
test('SI9 Program save failure never switches active program or overwrites ROOT',()=>withPage(async p=>{
  await activate(p);const before=await disk(p);
  const result=await p.evaluate(async()=>{
    trainingStorageBackend.database.db.metadata.hook('updating',()=>{throw new DOMException('quota injected','QuotaExceededError');});
    try{await activateProgram('P2');}catch(error){return {name:error.name,active:trainingTrackerState.activeProgramId};}
  });
  assert.deepEqual(result,{name:'QuotaExceededError',active:'P1'});assert.equal(await disk(p),before);
}));
test('SI10 Excel import commit creates new Program only after commit, old histories remain',()=>withPage(async(p,dialogs)=>{
  await activate(p);const old=await legacy(p);
  await p.evaluate(()=>{
    lastImportPreview={sourceFileName:'synthetic.xlsx',programName:'匿名新计划',format:'legacy',plan:[{workoutId:'new-D',title:'匿名新增',exercises:[{exerciseId:'new-E',name:'匿名动作',sets:[{setId:'new-S',rest:90}]}]}],warmups:[]};
    return applyImportPlan();
  });
  const root=JSON.parse(await disk(p));assert.equal(Object.keys(root.profiles.PF.programs).length,3);
  assert.notEqual(root.activeProgramId,'P1');assert.equal(root.profiles.PF.programs.P1.workoutLogs.length,1);
  assert.equal(await legacy(p),old);assert.ok(dialogs.some(s=>s.includes('已导入为新的训练计划')));
}));
test('SI11 manual backup includes unsaved DOM values and imports back with histories intact',()=>withPage(async p=>{
  await activate(p);
  const backup=await p.evaluate(async()=>{
    const row=document.querySelector('#exercises .setrow');row.querySelector('[data-field="weight"]').value='62.5';
    return await buildCycleBackupObject();
  });
  const draft=backup.state.profiles.PF.programs.P1.currentWorkoutDrafts['P1-D0'];
  assert.equal(draft.mains[0].sets[0].weight,'62.5');
  await p.evaluate(backup=>importBackupObject(backup),backup);
  await reload(p);assert.equal(await p.locator('#exercises .setrow').first().locator('[data-field="weight"]').inputValue(),'62.5');
  assert.equal(await p.evaluate(()=>state.workoutLogs.length),1);
}));
test('SI12 quota autosave stays visible, retry persists current draft without creating history',()=>withPage(async p=>{
  await activate(p);
  await p.evaluate(()=>{
    window.__fail=()=>{throw new DOMException('quota injected','QuotaExceededError');};
    trainingStorageBackend.database.db.metadata.hook('updating',__fail);
  });
  await p.locator('#exercises .setrow').first().locator('[data-field="weight"]').fill('70');
  await p.waitForFunction(()=>!!trainingStorageBackend.failure);
  assert.equal(await p.locator('#storageRecovery').isVisible(),true);
  await p.evaluate(()=>trainingStorageBackend.database.db.metadata.hook('updating').unsubscribe(__fail));
  await p.locator('#retryStorage').tap();await p.waitForFunction(()=>!trainingStorageBackend.failure&&!trainingStorageBackend.pending);
  await reload(p);assert.equal(await p.locator('#exercises .setrow').first().locator('[data-field="weight"]').inputValue(),'70');
  assert.equal(await p.evaluate(()=>state.workoutLogs.length),1);
}));
test('SI13 older tab modifying legacy snapshot stops new saves, never reimports stale state',()=>withPage(async p=>{
  await activate(p);const before=await disk(p);
  const result=await p.evaluate(async()=>{
    localStorage.setItem('training-tracker-state',JSON.stringify({...JSON.parse(localStorage.getItem('training-tracker-state')),oldTabChange:true}));
    try{await saveState();}catch(error){return error.code;}
  });
  assert.equal(result,'LEGACY_CHANGED');assert.equal(await disk(p),before);
}));
test('SI14 no-op Preview and general timer never write IndexedDB or dates',()=>withPage(async p=>{
  await activate(p);const before=await disk(p),revision=await p.evaluate(()=>trainingStorageBackend.revision);
  await p.evaluate(()=>{for(let i=0;i<5;i++)previewCurrentBrief();setTimer(90);startTimer();pauseTimer();resetTimer();});
  assert.equal(await disk(p),before);assert.equal(await p.evaluate(()=>trainingStorageBackend.revision),revision);
}));
test('SI15 main/warmup row timers keep working and save set completion to new drafts',()=>withPage(async p=>{
  await activate(p);
  const result=await p.evaluate(async()=>{
    const row=document.querySelector('#exercises .setrow'),id=row.dataset.setId;startRowTimer(id,180);
    activeTimerContext.endAt=Date.now()+178000;tickRealTimer();await flushTrainingStorage();
    const main=document.getElementById('mt_'+id).textContent;
    const warm=document.querySelector('#warmupExercises .setrow'),wid=warm.dataset.setId;startRowTimer(wid,30);
    activeTimerContext.endAt=Date.now()+28000;tickRealTimer();await flushTrainingStorage();
    const warmText=document.getElementById('mt_'+wid).textContent;pauseTimer();return {main,warmText};
  });
  assert.equal(result.main,'02:58');assert.equal(result.warmText,'00:28');
  assert.equal(JSON.parse(await disk(p)).profiles.PF.programs.P1.workoutLogs.length,1);
}));
test('SI16 custom Workout and custom Exercise survive reload with original stable IDs',()=>withPage(async p=>{
  await activate(p);
  const ids=await p.evaluate(async()=>{
    const w=createCustomWorkout('我的测试训练');const ex=addExerciseToWorkout(w.workoutId,{name:'我的测试动作',sets:[{setId:'custom-fixed-set',rest:90}]});
    await flushTrainingStorage();return {workout:w.workoutId,exercise:ex.exerciseId};
  });
  await reload(p);
  const restored=await p.evaluate(ids=>{const w=state.days.find(w=>w.workoutId===ids.workout);return w.exercises[0];},ids);
  assert.equal(restored.exerciseId,ids.exercise);assert.equal(restored.sets[0].setId,'custom-fixed-set');
}));

async function rejectLocalWrites(p){
  await p.evaluate(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='training-tracker-state')throw new DOMException('injected full localStorage','QuotaExceededError');return original.call(this,key,value);};});
}
test('SQ1 localStorage quota cannot block main row interval; ROOT and history unchanged',()=>withPage(async p=>{
  const before=await legacy(p),logs=await p.evaluate(()=>JSON.stringify(state.workoutLogs));await rejectLocalWrites(p);
  const row=p.locator('#exercises .setrow').first(),id=await row.getAttribute('data-set-id');
  await row.locator('.restBtn').tap();
  assert.match(await p.locator('#storageSaveStatus').textContent(),/本组记录未保存/);
  await p.waitForFunction(id=>document.getElementById('mt_'+id).textContent==='02:58',id);
  assert.equal(await p.evaluate(()=>activeTimerContext.type),'rest');
  assert.equal(await legacy(p),before);assert.equal(await p.evaluate(()=>JSON.stringify(state.workoutLogs)),logs);
  await p.evaluate(()=>pauseTimer());
}));
test('SQ2 warmup quota keeps ticking; endAt recovery and single interval survive repeated rest',()=>withPage(async p=>{
  const before=await legacy(p),logs=await p.evaluate(()=>JSON.stringify(state.workoutLogs));
  await p.evaluate(()=>{window.__intervals=new Set();const start=window.setInterval,stop=window.clearInterval;window.setInterval=(fn,ms)=>{const id=start(fn,ms);__intervals.add(id);return id;};window.clearInterval=id=>{__intervals.delete(id);stop(id);};});
  await rejectLocalWrites(p);
  const id=await p.locator('#warmupExercises .setrow').first().getAttribute('data-set-id');
  await p.evaluate(id=>startRowTimer(id,30),id);
  await p.waitForFunction(id=>document.getElementById('mt_'+id).textContent==='00:28',id);
  await p.evaluate(id=>startRowTimer(id,180),id);
  assert.equal(await p.evaluate(id=>document.getElementById('mt_'+id).textContent,id),'03:00');
  assert.match(await p.locator('#storageSaveStatus').textContent(),/本组记录未保存/);
  await p.waitForFunction(id=>document.getElementById('mt_'+id).textContent==='02:59',id);
  const end=await p.evaluate(()=>activeTimerContext.endAt);
  await p.evaluate(()=>{activeTimerContext.endAt-=10000;window.dispatchEvent(new Event('focus'));});
  assert.equal(await p.evaluate(()=>activeTimerContext.endAt),end-10000);
  assert.ok(await p.evaluate(()=>timerLeft<=170&&timerLeft>=168));
  assert.equal(await p.evaluate(()=>__intervals.size),1);
  assert.equal(await legacy(p),before);assert.equal(await p.evaluate(()=>JSON.stringify(state.workoutLogs)),logs);
  await p.evaluate(()=>pauseTimer());
}));
test('SQ3 rejected async database save does not stop row clock or claim saved',()=>withPage(async p=>{
  await activate(p);const before=await disk(p);
  await p.evaluate(()=>trainingStorageBackend.database.db.metadata.hook('updating',()=>{throw new DOMException('injected quota','QuotaExceededError');}));
  const row=p.locator('#exercises .setrow').first(),id=await row.getAttribute('data-set-id');await row.locator('.restBtn').tap();
  await p.waitForFunction(()=>document.getElementById('storageSaveStatus').textContent.includes('本组记录未保存'));
  await p.waitForFunction(id=>document.getElementById('mt_'+id).textContent==='02:58',id);
  assert.equal(await disk(p),before);await p.evaluate(()=>pauseTimer());
}));
