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
  function program(id){
    return m.createProgramFromPlan([1,5].map(n=>({workoutId:id+'-D'+n,sourceWorkoutKey:'D'+n,title:'上肢主项热身测试',workoutType:'strength',plannedDate:'2026-09-'+(10+n),
      exercises:[{exerciseId:id+'-D'+n+'-E',name:'卧推',section:'主项',trainingRole:'main',sets:[{setId:id+'-D'+n+'-S',rest:180,reps:'8',rir:'2'}]}],
      activities:[{activityId:id+'-D'+n+'-A',activityType:'warmup',warmupType:'ramp',title:'主项热身',segments:[
        {segmentNo:1,label:'卧推',instruction:'空杆×10'},
        {segmentNo:2,label:'',instruction:'递增热身1×5'},
        {segmentNo:3,label:'',instruction:'递增热身2×3'},
        {segmentNo:4,label:'前蹲',instruction:'空杆×10'},
        {segmentNo:5,label:'',instruction:'递增热身1×5'},
        {segmentNo:6,label:'',instruction:'递增热身2×3'}]}]
    })),{programId:id,name:id,source:'long-form-daily-v1'});
  }
  return {schemaVersion:6,activeProfileId:'PF',activeProgramId:'P1',profiles:{PF:{profileId:'PF',programs:{P1:program('P1'),P2:program('P2')},exerciseTemplates:[],warmupTemplates:[],rmRecords:[]}},ui:{}};
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
async function withPage(run,seed=fixture()){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  try{
    await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
    await context.addInitScript(root=>{
      if(localStorage.getItem('training-tracker-state')===null)localStorage.setItem('training-tracker-state',JSON.stringify(root));
      window.__writes=0;const original=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){__writes++;return original.call(this,k,v);};
    },seed);
    const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
    await page.goto(url,{waitUntil:'load'});
    const before=await page.evaluate(()=>JSON.stringify(getActiveProgram().days));
    await run(page);
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(()=>JSON.stringify(trainingTrackerState.profiles.PF.programs.P1.days)),before);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }finally{await context.close();}
}
const warmRow=page=>page.locator('#warmupExercises .setrow').first();
async function grouped(page){
  assert.equal(await page.locator('.warmupDisplayGroup').count(),2);
  assert.deepEqual(await page.locator('.warmupDisplayGroup').evaluateAll(groups=>groups.map(g=>g.querySelectorAll('.warmupStageCard').length)),[3,3]);
  assert.equal(await page.evaluate(()=>warmupEditState.sourceKind),'structured');
  assert.equal(await page.evaluate(()=>Object.hasOwn(state.customWarmups,workoutWarmupKey())),false);
}
async function identities(page){return page.locator('#warmupExercises .warmCard').evaluateAll(cards=>cards.map(c=>({id:c.dataset.cardId,sets:[...c.querySelectorAll('.setrow')].map(r=>r.dataset.setId)})));}

test('A03-1 rebuild stays structured, two parents/three stages, no override or startup write',()=>withPage(async p=>{
  const ids=await identities(p);await p.evaluate(()=>rebuild());await grouped(p);assert.deepEqual(await identities(p),ids);assert.equal(await p.evaluate(()=>__writes),0);
}));
test('A03-2 main-only 60kg x8 RIR2 save preserves grouped warmup through reload',()=>withPage(async p=>{
  const ids=await identities(p);const row=p.locator('#exercises .setrow').first();
  await row.locator('[data-field="weight"]').fill('60');await row.locator('[data-field="reps"]').fill('8');await row.locator('[data-field="rir"]').fill('2');
  await p.evaluate(()=>saveProgress());await p.evaluate(()=>rebuild());await grouped(p);await p.reload();await grouped(p);
  assert.equal(await p.locator('#exercises [data-field="weight"]').first().inputValue(),'60');assert.deepEqual(await identities(p),ids);
}));
test('A03-3 warmup actual weights restore by original IDs without structural override',()=>withPage(async p=>{
  const ids=await identities(p);await warmRow(p).locator('[data-field="weight"]').fill('20');
  await p.locator('#warmupExercises .setrow').nth(1).locator('[data-field="weight"]').fill('40');
  await p.evaluate(()=>saveProgress());await p.reload();await grouped(p);
  assert.equal(await warmRow(p).locator('[data-field="weight"]').inputValue(),'20');assert.equal(await p.locator('#warmupExercises .setrow').nth(1).locator('[data-field="weight"]').inputValue(),'40');assert.deepEqual(await identities(p),ids);
}));
test('A03-4 warmup reps/RIR/duration/rest remain execution draft fields',()=>withPage(async p=>{
  for(const [field,value]of [['reps','9'],['rir','3'],['duration','25']])await warmRow(p).locator('[data-field="'+field+'"]').fill(value);
  await warmRow(p).locator('input[type=range]').evaluate(el=>{el.value='45';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.evaluate(()=>saveProgress());await p.reload();await grouped(p);
  for(const [field,value]of [['reps','9'],['rir','3'],['duration','25']])assert.equal(await warmRow(p).locator('[data-field="'+field+'"]').inputValue(),value);
  assert.equal(await warmRow(p).locator('input[type=range]').inputValue(),'45');
}));
test('A03-5 add/rename a warmup creates only a workout override and reload preserves IDs',()=>withPage(async p=>{
  await p.evaluate(()=>addWarmupProject());await p.locator('#warmupExercises .warmCard').last().locator('[data-field="warmName"]').fill('肩胛俯卧撑');
  const ids=await identities(p);assert.equal(ids.length,7);assert.equal(await p.evaluate(()=>warmupEditState.sourceKind),'custom');
  await p.reload();assert.equal(await p.locator('#warmupExercises .warmCard').count(),7);assert.deepEqual(await identities(p),ids);
  assert.equal(await p.locator('#warmupExercises .warmCard').last().locator('[data-field="warmName"]').inputValue(),'肩胛俯卧撑');
}));
test('A03-6 deletion survives save and reload without restoring removed canonical stage',()=>withPage(async p=>{
  const ids=await identities(p);await p.evaluate(()=>removeWarmupProject({closest:()=>document.querySelector('#warmupExercises .warmCard')}));
  await p.evaluate(()=>saveProgress());await p.reload();assert.deepEqual(await identities(p),ids.slice(1));assert.equal(await p.evaluate(()=>warmupEditState.sourceKind),'custom');
}));
test('A03-7 restore default removes override and restores original groups/IDs',()=>withPage(async p=>{
  const ids=await identities(p);await warmRow(p).locator('[data-field="weight"]').fill('20');
  await p.evaluate(()=>addWarmupProject());assert.equal(await p.evaluate(()=>Object.hasOwn(state.customWarmups,workoutWarmupKey())),true);
  await p.evaluate(()=>loadDefaultWarmup());await grouped(p);assert.deepEqual(await identities(p),ids);await p.reload();await grouped(p);
  assert.equal(await warmRow(p).locator('[data-field="weight"]').inputValue(),'20');
}));
test('A03-8 D1 override never changes D5 or creates a purpose-level template',()=>withPage(async p=>{
  await p.evaluate(()=>addWarmupProject());assert.deepEqual(await p.evaluate(()=>Object.keys(state.customWarmups)),['workout_P1-D1']);
  await p.evaluate(()=>nextWorkout());await grouped(p);await p.evaluate(()=>prevWorkout());assert.equal(await p.locator('#warmupExercises .warmCard').count(),7);
}));
test('A03-9 explicit purpose template save remains supported',()=>withPage(async p=>{
  await p.evaluate(()=>saveWarmupTemplate());assert.ok(await p.evaluate(()=>state.customWarmups['胸训']));assert.ok(await p.evaluate(()=>state.customWarmups[workoutWarmupKey()]));
}));
test('A03-10 render/restore/programmatic input.value never marks structural dirty',()=>withPage(async p=>{
  await p.evaluate(()=>{document.getElementById('warmupInput').value='programmatic text';parseAndRenderWarmups(true);restoreCurrentWorkoutDraft();saveProgress();rebuild();});await grouped(p);assert.equal(await p.evaluate(()=>warmupEditState.dirty),false);
}));
test('A03-11 unsaved dirty owner cannot cross Program boundary',()=>withPage(async p=>{
  await p.evaluate(()=>{markWarmupStructureEdited();switchProgramFromSelect('P2');});await grouped(p);
  assert.equal(await p.evaluate(()=>warmupEditState.dirty),false);assert.equal(await p.evaluate(()=>commitWarmupStructureEdit(true)),false);
  assert.equal(await p.evaluate(()=>Object.keys(state.customWarmups).length),0);await p.evaluate(()=>switchProgramFromSelect('P1'));await grouped(p);
}));
test('A03-12 unsaved dirty owner cannot cross Workout boundary',()=>withPage(async p=>{
  await p.evaluate(()=>{markWarmupStructureEdited();nextWorkout();});await grouped(p);assert.equal(await p.evaluate(()=>warmupEditState.dirty),false);
  assert.equal(await p.evaluate(()=>commitWarmupStructureEdit(true)),false);
}));
test('A03-13 actual textarea edit and explicit empty override survive reload',()=>withPage(async p=>{
  await p.locator('#warmupInput').fill('肩胛俯卧撑 1x10 休息30秒');await p.reload();assert.equal(await p.evaluate(()=>warmupEditState.sourceKind),'custom');
  await p.locator('#warmupInput').fill('');await p.reload();assert.equal(await p.locator('#warmupExercises .warmCard').count(),0);assert.equal(await p.evaluate(()=>Object.hasOwn(state.customWarmups,workoutWarmupKey())),true);
  await p.evaluate(()=>loadDefaultWarmup());await grouped(p);
}));
test('A03-14 add/copy/delete sets preserve surviving IDs and independent inputs',()=>withPage(async p=>{
  await p.evaluate(()=>addWarmupProject());const last=p.locator('#warmupExercises .warmCard').last();
  await last.locator('[data-field="weight"]').fill('15');await last.locator('[onclick="duplicateWarmupSet(this)"]').tap();
  let ids=await identities(p);assert.equal(new Set(ids.at(-1).sets).size,2);await p.reload();assert.deepEqual(await identities(p),ids);
  assert.equal(await last.locator('[data-field="weight"]').last().inputValue(),'15');
  await p.evaluate(()=>{const card=[...document.querySelectorAll('#warmupExercises .warmCard')].at(-1);removeWarmupSet({closest:()=>card.querySelector('.setrow')});});
  ids=await identities(p);await p.reload();assert.deepEqual(await identities(p),ids);
}));
test('A03-15 Preview five times leaves ROOT/dates/overrides/dirty unchanged',()=>withPage(async p=>{
  const snapshot=()=>p.evaluate(()=>({root:localStorage.getItem('training-tracker-state'),state:JSON.stringify(trainingTrackerState),dirty:JSON.stringify(warmupEditState),writes:__writes}));
  const before=await snapshot();for(let i=0;i<5;i++)await p.locator('[onclick="previewCurrentBrief()"]').tap();assert.deepEqual(await snapshot(),before);await grouped(p);
}));
test('A03-16 generic sync/log-draft/Finish do not create structured overrides',()=>withPage(async p=>{
  await p.evaluate(()=>{syncCurrentWorkoutFormToState();rebuildCurrentWorkoutLogDraft();});await grouped(p);
  await p.evaluate(()=>{downloadCycleBackupFile=()=>{};finishWorkoutCompleteBackup();});await grouped(p);
  assert.deepEqual(await p.evaluate(()=>state.customWarmups),{});assert.equal(await p.evaluate(()=>state.logs.length),1);
}));
test('A03-17 existing override is respected without automatic migration or deletion',async()=>{
  const seed=fixture();seed.profiles.PF.programs.P1.customWarmups['workout_P1-D1']='旧自定义动作 2x10 休息30秒';
  await withPage(async p=>{assert.equal(await p.evaluate(()=>warmupEditState.sourceKind),'custom');assert.equal(await p.locator('#warmupExercises .warmCard').count(),1);assert.equal(await p.evaluate(()=>__writes),0);await p.evaluate(()=>saveProgress());await p.reload();assert.equal(await p.evaluate(()=>state.customWarmups[workoutWarmupKey()]),'旧自定义动作 2x10 休息30秒');},seed);
});
test('A03-18 explicit library template save/apply keeps purpose and workout semantics',()=>withPage(async p=>{
  await p.evaluate(()=>{openSaveTemplateModal();confirmSaveTemplate();});
  assert.ok(await p.evaluate(()=>state.customWarmups['胸训']));
  const id=await p.evaluate(()=>state.warmupTemplates.at(-1).id);
  await p.evaluate(()=>nextWorkout());await grouped(p);
  await p.evaluate(id=>applyWarmupTemplate(id),id);
  assert.equal(await p.evaluate(()=>warmupEditState.sourceKind),'custom');
  const ids=await identities(p);await p.reload();assert.deepEqual(await identities(p),ids);
}));
test('A03-19 adding a set to a structured stage retains original stage/set identities',()=>withPage(async p=>{
  const before=await identities(p);
  await p.evaluate(()=>addWarmupSet({closest:()=>document.querySelector('#warmupExercises .warmCard')}));
  const edited=await identities(p);assert.equal(edited[0].id,before[0].id);assert.equal(edited[0].sets[0],before[0].sets[0]);assert.equal(edited[0].sets.length,2);
  assert.equal(new Set(edited.flatMap(item=>item.sets)).size,7);
  await p.reload();assert.deepEqual(await identities(p),edited);
  await p.evaluate(()=>loadDefaultWarmup());await grouped(p);assert.deepEqual(await identities(p),before);
}));
