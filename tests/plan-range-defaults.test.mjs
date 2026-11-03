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
let browser,server,url;
function fixture(){
  const root=demoRoot(),program=root.profiles[root.activeProfileId].programs[root.activeProgramId],ex=program.days[0].exercises[0];
  program.actualDates={};program.dateAnchors={};program.sessionStartedAt={};program.completed={};program.currentWorkoutDrafts={};
  ex.name=ex.trackingName='匿名范围测试';ex.setCount=3;
  ex.prescription={repsMin:6,repsMax:10,rirMin:2,rirMax:3,restMin:150,restMax:180,unit:'kg'};
  ex.sets=Array.from({length:3},(_,i)=>({setId:'range-S'+i,setNo:i+1,setType:'working',prescriptionDefined:true,weight:'',unit:'kg',reps:'',rir:'',rest:150,targetRepsMin:6,targetRepsMax:10,targetRirMin:2,targetRirMax:3,targetRestMin:150,targetRestMax:180}));
  program.workoutLogs=[{logId:'OLD',actualDate:'2026-10-01',title:'历史',entries:[{name:ex.name,trackingName:ex.name,type:'主训练',set:1,setType:'working',weight:'60',weightKg:60,unit:'kg',reps:'10',rir:'3'}]}];
  return root;
}
test.before(async()=>{
  server=http.createServer((req,res)=>{const file=path.join(directory,new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(file).pipe(res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port+'/';browser=await webkit.launch({headless:true});
});
test.after(async()=>{await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));});
async function run(fn,seed=fixture()){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
  await context.addInitScript(root=>{if(!localStorage.getItem('training-tracker-state'))localStorage.setItem('training-tracker-state',JSON.stringify(root));window.__writes=0;const write=Storage.prototype.setItem;Storage.prototype.setItem=function(...args){window.__writes++;return write.apply(this,args);};},seed);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.dismiss());
  try{await page.goto(url);await page.waitForFunction(()=>window.trainingAppReady);await fn(page);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}finally{await context.close();}
}
const input=(p,field,i=0)=>p.locator('#exercises .mainCard .setrow').nth(i).locator('[data-field="'+field+'"]');
test('PR1 header displays full range while all fresh working rows use lower bounds',()=>run(async p=>{
  assert.match(await p.locator('#exercises .planSummary').first().textContent(),/6–10.*2–3/);
  for(let i=0;i<3;i++){assert.equal(await input(p,'reps',i).inputValue(),'6');assert.equal(await input(p,'rir',i).inputValue(),'2');}
  assert.equal(await input(p,'weight').inputValue(),'60');assert.equal(await input(p,'weight',1).inputValue(),'');
  assert.equal(await p.evaluate(()=>__writes),0);assert.deepEqual(await p.evaluate(()=>state.actualDates),{});
  await p.locator('#exercises .mainCard').first().screenshot({path:'/tmp/plan-range-defaults-mobile.png'});
}));
test('PR2 fixed targets remain fixed and zero lower RIR stays zero',async()=>{
  const root=fixture(),ex=root.profiles[root.activeProfileId].programs[root.activeProgramId].days[0].exercises[0];
  ex.prescription={...ex.prescription,repsMax:6,rirMin:0,rirMax:0};ex.sets.forEach(s=>Object.assign(s,{targetRepsMax:6,targetRirMin:0,targetRirMax:0}));
  await run(async p=>{assert.match(await p.locator('#exercises .planSummary').first().textContent(),/6.*余力.*0/);assert.equal(await input(p,'reps').inputValue(),'6');assert.equal(await input(p,'rir').inputValue(),'0');},root);
});
test('PR3 existing actual values override defaults without changing header targets',async()=>{
  const root=fixture(),ex=root.profiles[root.activeProfileId].programs[root.activeProgramId].days[0].exercises[0];
  Object.assign(ex.sets[0],{weight:'65',reps:'9',rir:'0'});
  await run(async p=>{assert.equal(await input(p,'weight').inputValue(),'65');assert.equal(await input(p,'reps').inputValue(),'9');assert.equal(await input(p,'rir').inputValue(),'0');assert.match(await p.locator('#exercises .planSummary').first().textContent(),/6–10.*2–3/);},root);
});
test('PR4 edited draft values survive rebuild, day switch and refresh; IDs and logs stay intact',()=>run(async p=>{
  const before=await p.evaluate(()=>JSON.stringify({days:getWorkout().exercises,logs:state.workoutLogs}));
  await input(p,'reps').fill('8');await input(p,'rir').fill('1');await input(p,'rir').blur();
  await p.evaluate(()=>rebuild());assert.equal(await input(p,'reps').inputValue(),'8');
  await p.evaluate(()=>{nextWorkout();prevWorkout();});assert.equal(await input(p,'rir').inputValue(),'1');
  await p.reload();await p.waitForFunction(()=>window.trainingAppReady);assert.equal(await input(p,'reps').inputValue(),'8');assert.equal(await input(p,'rir').inputValue(),'1');
  assert.equal(await p.evaluate(()=>JSON.stringify({days:getWorkout().exercises,logs:state.workoutLogs})),before);
}));
test('PR5 explicitly cleared saved draft is not filled again on refresh',()=>run(async p=>{
  await input(p,'reps').fill('');await input(p,'rir').fill('');await input(p,'rir').blur();await p.evaluate(()=>saveProgress());
  await p.reload();await p.waitForFunction(()=>window.trainingAppReady);assert.equal(await input(p,'reps').inputValue(),'');assert.equal(await input(p,'rir').inputValue(),'');
}));
test('PR6 special set defaults are unchanged',async()=>{
  const root=fixture(),sets=root.profiles[root.activeProfileId].programs[root.activeProgramId].days[0].exercises[0].sets;
  sets[0].setType='warmup';sets[1].setType='technique';sets[2].setType='backoff';
  await run(async p=>{for(let i=0;i<3;i++){assert.equal(await input(p,'reps',i).inputValue(),'10');assert.equal(await input(p,'rir',i).inputValue(),'3');}},root);
});
