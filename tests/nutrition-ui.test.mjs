import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {demoRoot} from '../storage-v2/demo.mjs';
const require=createRequire(process.env.PLAYWRIGHT_PACKAGE||process.execPath),{webkit}=require('playwright');
const directory=fileURLToPath(new URL('../',import.meta.url));
let server,browser,url;
test.before(async()=>{
  server=http.createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname,file=path.join(directory,name==='/'?'index.html':name);if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/html');fs.createReadStream(file).pipe(res);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));url='http://127.0.0.1:'+server.address().port+'/';browser=await webkit.launch({headless:true});
});
test.after(async()=>{await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));});
async function run(fn){
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,acceptDownloads:true});
  await context.route('https://cdn.jsdelivr.net/**',r=>r.fulfill({body:'',contentType:'application/javascript'}));
  await context.addInitScript(root=>{if(!localStorage.getItem('training-tracker-state'))localStorage.setItem('training-tracker-state',JSON.stringify(root));},demoRoot());
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try{
    await page.goto(url);await page.waitForFunction(()=>window.trainingAppReady);await page.evaluate(()=>showTab('settings'));await page.locator('#activateStorage').tap();await page.waitForFunction(()=>!!trainingStorageBackend&&document.getElementById('storageBusy').hidden);
    await page.locator('.mobileDock [data-tab="nutrition"]').tap();await page.locator('#nutritionDate').fill('2026-10-06');
    await fn(page);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }finally{await context.close();}
}
const saved=p=>p.waitForFunction(()=>document.getElementById('nutritionStatus').textContent==='已保存');
const training=p=>p.evaluate(()=>JSON.stringify(getActiveProfile().programs));
async function seed(p){await p.evaluate(async()=>{
  const root=JSON.parse(JSON.stringify(trainingTrackerState));root.profiles[root.activeProfileId].nutrition=NutritionModel.saveCycle(NutritionModel.empty(),{cycleId:'cycle',name:'匿名周期',startDate:'2026-10-01',endDate:'2026-12-01',kind:'regular',meals:[{foods:[{name:'匿名食品',quantity:100,unit:'g',nutrients:{kcal:120,protein:10,carbs:15,fat:2}}]}]});
  await saveRootCandidate(root);renderNutrition();
});}
test('NU1 entering nutrition and browsing dates is read-only, mobile tabs still work',()=>run(async p=>{
  const before=await p.evaluate(()=>JSON.stringify(trainingTrackerState)),revision=await p.evaluate(()=>trainingStorageBackend.revision);
  await p.locator('[data-n-action="next"]').tap();await p.locator('[data-n-action="previous"]').tap();
  for(const tab of ['today','calendar','history','settings','rmcalc','importer','nutrition']){await p.locator(`.mobileDock [data-tab="${tab}"]`).tap();assert.equal(await p.locator('#'+tab).isVisible(),true);}
  assert.equal(await p.evaluate(()=>JSON.stringify(trainingTrackerState)),before);assert.equal(await p.evaluate(()=>trainingStorageBackend.revision),revision);
}));
test('NU2 create cycle with actual forms, reload persists without writing training',()=>run(async p=>{
  const before=await training(p),legacy=await p.evaluate(()=>localStorage.getItem('training-tracker-state'));
  await p.locator('[data-n-action="new-cycle"]').tap();const form=p.locator('#nutritionCycleForm');
  await form.locator('[name="cycleName"]').fill('两月匿名模板');await form.locator('[name="startDate"]').fill('2026-10-01');await form.locator('[name="endDate"]').fill('2026-11-30');
  await form.locator('[data-n-action="add-food"]').first().tap();const food=form.locator('fieldset').first();await food.locator('[name="name"]').fill('匿名食品（熟重）');await food.locator('[name="quantity"]').fill('100');await food.locator('summary').tap();
  for(const [k,v] of Object.entries({kcal:'120',protein:'10',carbs:'15',fat:'2'}))await food.locator(`[name="${k}"]`).fill(v);
  await form.locator('[type="submit"]').tap();await saved(p);assert.equal(await training(p),before);
  await p.reload();await p.waitForFunction(()=>window.trainingAppReady);await p.evaluate(()=>showTab('nutrition'));await p.locator('[data-n-action="view"][data-id="cycles"]').tap();assert.match(await p.locator('#nutritionContent').textContent(),/两月匿名模板/);
  assert.equal(await p.evaluate(()=>localStorage.getItem('training-tracker-state')),legacy);
}));
test('NU3 estimated meal and metrics persist; no logs, date, IDs or completion changes',()=>run(async p=>{
  await seed(p);const before=await training(p);
  await p.locator('[data-n-action="edit-meal"]').first().tap();const form=p.locator('#nutritionMealForm');await form.locator('[name="quantity"]').fill('150');await form.locator('[name="status"]').selectOption('estimated');await form.locator('[name="mealNote"]').fill('外食，大概份量');await form.locator('[type="submit"]').tap();await saved(p);
  assert.match(await p.locator('.nutritionMeal').first().textContent(),/150 g/);assert.match(await p.locator('.nutritionMeal').first().textContent(),/估算/);
  await p.locator('.nutritionMetrics summary').tap();await p.locator('[name="weight"]').last().fill('80');await p.locator('#nutritionMetricsForm [type="submit"]').tap();await saved(p);assert.equal(await training(p),before);
  assert.equal(await p.evaluate(()=>getActiveProfile().nutrition.days['2026-10-06'].meals[0].actual[0].quantity),150);
  assert.equal(await p.evaluate(()=>getActiveProfile().nutrition.metrics['2026-10-06'].weight),80);
}));
test('NU4 recording a day freezes its snapshot across future cycle edits',()=>run(async p=>{
  await seed(p);await p.locator('[data-n-action="confirm-meal"]').first().tap();await saved(p);
  const before=await p.evaluate(()=>JSON.stringify(getActiveProfile().nutrition.days['2026-10-06']));
  await p.locator('[data-n-action="view"][data-id="cycles"]').tap();await p.locator('[data-n-action="edit-cycle"]').tap();await p.locator('[name="quantity"]').fill('200');await p.locator('#nutritionCycleForm [type="submit"]').tap();await saved(p);
  assert.equal(await p.evaluate(()=>JSON.stringify(getActiveProfile().nutrition.days['2026-10-06'])),before);
}));
test('NU5 old training backup preserves nutrition; current total backup includes it',()=>run(async p=>{
  await seed(p);await p.locator('[data-n-action="confirm-meal"]').tap();await saved(p);
  const before=await p.evaluate(()=>JSON.stringify(getActiveProfile().nutrition));
  await p.evaluate(async()=>{const old=JSON.parse(JSON.stringify(trainingTrackerState));delete old.profiles[old.activeProfileId].nutrition;await importBackupObject({state:old});});
  assert.equal(await p.evaluate(()=>JSON.stringify(getActiveProfile().nutrition)),before);
  const backup=await p.evaluate(()=>buildCycleBackupObject());assert.equal(JSON.stringify(backup.state.profiles[backup.state.activeProfileId].nutrition),before);
  await p.evaluate(async backup=>{await importBackupObject(backup);},backup);assert.equal(await p.evaluate(()=>JSON.stringify(getActiveProfile().nutrition)),before);
}));
test('NU6 failed nutrition save leaves committed nutrition and training unchanged',()=>run(async p=>{
  await seed(p);const before=await p.evaluate(async()=>JSON.stringify((await trainingStorageBackend.database.read()).root));
  await p.evaluate(()=>trainingStorageBackend.database.db.metadata.hook('updating',()=>{throw new DOMException('injected quota','QuotaExceededError');}));
  await p.locator('[data-n-action="confirm-meal"]').tap();await p.waitForFunction(()=>document.getElementById('nutritionStatus').textContent.includes('未保存'));
  assert.equal(await p.evaluate(async()=>JSON.stringify((await trainingStorageBackend.database.read()).root)),before);
  assert.equal(await p.evaluate(()=>getActiveProfile().nutrition.days['2026-10-06']),undefined);
}));
test('NU7 review states coverage and unit change clears misleading nutrition basis',()=>run(async p=>{
  await seed(p);await p.locator('[data-n-action="edit-meal"]').first().tap();await p.locator('#nutritionMealForm [name="unit"]').selectOption('份');assert.equal(await p.locator('#nutritionMealForm [name="kcal"]').inputValue(),'');assert.match(await p.locator('#nutritionStatus').textContent(),/新单位/);
  await p.locator('[data-n-action="cancel"]').tap();await p.locator('[data-n-action="view"][data-id="review"]').tap();assert.match(await p.locator('#nutritionContent').textContent(),/已记录 0\/7 天/);assert.match(await p.locator('#nutritionContent').textContent(),/0 个完整可计算日/);
}));
test('NU8 mobile and desktop nutrition controls remain readable and do not overflow',()=>run(async p=>{
  await seed(p);for(const width of [390,1280]){
    await p.setViewportSize({width,height:844});for(const view of ['day','cycles','review']){await p.locator(`[data-n-action="view"][data-id="${view}"]`).click();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
  }
  await p.setViewportSize({width:390,height:844});await p.locator('[data-n-action="view"][data-id="day"]').tap();await p.locator('[data-n-action="edit-meal"]').first().tap();
  const bad=await p.locator('#nutrition input,#nutrition select,#nutrition button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length&&(n.getBoundingClientRect().height<44||parseFloat(getComputedStyle(n).fontSize)<15)).map(n=>({html:n.outerHTML,height:n.getBoundingClientRect().height,font:getComputedStyle(n).fontSize,min:getComputedStyle(n).minHeight})));assert.deepEqual(bad,[]);
}));
test('NU9 switching training Programs leaves calendar nutrition independent and intact',()=>run(async p=>{
  await seed(p);await p.locator('[data-n-action="confirm-meal"]').tap();await saved(p);
  const before=await p.evaluate(()=>JSON.stringify(getActiveProfile().nutrition));
  await p.evaluate(()=>switchProgramFromSelect('demo-two'));
  assert.equal(await p.evaluate(()=>trainingTrackerState.activeProgramId),'demo-two');
  await p.evaluate(()=>showTab('nutrition'));
  assert.equal(await p.evaluate(()=>JSON.stringify(getActiveProfile().nutrition)),before);
  assert.match(await p.locator('.nutritionMeal').first().textContent(),/已确认/);
  await p.reload();await p.waitForFunction(()=>window.trainingAppReady);
  assert.equal(await p.evaluate(()=>JSON.stringify(getActiveProfile().nutrition)),before);
}));
test('NU10 nutrition review download contains saved snapshots without state writes',()=>run(async p=>{
  await seed(p);await p.locator('[data-n-action="confirm-meal"]').tap();await saved(p);
  const before=await p.evaluate(()=>JSON.stringify(trainingTrackerState));
  const expected=await p.evaluate(()=>JSON.stringify(getActiveProfile().nutrition));
  await p.locator('[data-n-action="view"][data-id="review"]').tap();
  const downloadEvent=p.waitForEvent('download');await p.locator('[data-n-action="export"]').tap();const download=await downloadEvent;
  const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);
  const file=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  assert.equal(file.app,'training-tracker-nutrition');assert.equal(file.version,1);
  assert.equal(JSON.stringify(file.nutrition),expected);assert.equal(await p.evaluate(()=>JSON.stringify(trainingTrackerState)),before);
}));
