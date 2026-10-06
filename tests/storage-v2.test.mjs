import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {encodeRoot, decodeRoot, parseSource, inspectSource, inventory} from '../storage-v2/state-codec.mjs';
import {demoRoot} from '../storage-v2/demo.mjs';
import {loadStorage} from './helpers.mjs';

const require = createRequire(process.env.PLAYWRIGHT_PACKAGE || process.execPath);
const {webkit} = require('playwright');
const directory = fileURLToPath(new URL('../', import.meta.url));
let server, browser, url;
test.before(async () => {
  server = http.createServer((req, res) => {
    const file = path.join(directory, new URL(req.url, 'http://localhost').pathname);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.setHeader('Content-Type', /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  url = 'http://127.0.0.1:' + server.address().port;
  browser = await webkit.launch({headless: true});
});
test.after(async () => { await browser?.close(); if (server?.listening) await new Promise(resolve => server.close(resolve)); });

test('S2 codec preserves all fields, IDs, log ownership and order exactly', () => {
  const root = demoRoot(), original = JSON.stringify(root), encoded = encodeRoot(root);
  assert.equal(JSON.stringify(decodeRoot(encoded.tree, encoded.documents)), original);
  assert.equal(JSON.stringify(root), original);
  assert.deepEqual(inventory(root), {profiles:1,programs:2,workouts:2,exercises:2,sets:2,logs:2,weightedEntries:2,actualDates:2,drafts:2,templates:2,rmRecords:1});
});
test('S2 accepts v6 raw ROOT and exported backup without normalization', () => {
  const root = demoRoot();
  assert.deepEqual(parseSource(JSON.stringify(root)), root);
  assert.deepEqual(parseSource(JSON.stringify({app:'training-tracker', version:6, state:root})), root);
});
test('S2 rejects invalid schema, broken active references and duplicate Workout IDs', () => {
  assert.throws(() => parseSource('{'), {code:'INVALID_STATE'});
  for (const change of [r=>r.schemaVersion=7, r=>r.activeProgramId='missing', r=>r.profiles['demo-profile'].programs['demo-one'].days.push(r.profiles['demo-profile'].programs['demo-one'].days[0])]) {
    const root = demoRoot(); change(root); assert.throws(() => encodeRoot(root), {code:'INVALID_STATE'});
  }
});
test('S2 preserves unknown optional data, null, empty arrays and descriptor-like user fields', () => {
  const root = demoRoot();
  root.unknown = JSON.parse('{"__proto__":{"safe":true},"type":"document","key":"fake","items":[],"empty":null}');
  const encoded = encodeRoot(root);
  assert.deepEqual(decodeRoot(encoded.tree, encoded.documents), root);
  assert.equal({}.safe, undefined);
});
test('S2 missing records cause explicit failure rather than an empty default plan', () => {
  const encoded = encodeRoot(demoRoot()); encoded.documents.pop();
  assert.throws(() => decodeRoot(encoded.tree, encoded.documents), {code:'INCOMPLETE_STORAGE'});
});
test('S2 SHA checks distinguish content updates while keeping original source bytes', async () => {
  const root = demoRoot(), raw = JSON.stringify(root, null, 2), a = await inspectSource(raw);
  const b = await inspectSource(JSON.stringify(root));
  assert.equal(a.fingerprint, b.fingerprint); assert.notEqual(a.sourceHash, b.sourceHash);
  root.profiles['demo-profile'].programs['demo-two'].currentSessionNote = 'updated';
  assert.notEqual((await inspectSource(JSON.stringify(root))).fingerprint, a.fingerprint);
});

async function withPage(run) {
  const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p = await context.newPage(), errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await context.addInitScript(() => {
    localStorage.setItem('training-tracker-state', 'DO-NOT-READ-OR-WRITE');
    localStorage.setItem('other-app', 'preserve');
    const proto = Storage.prototype;
    window.__storageCalls = [];
    for (const method of ['getItem', 'setItem', 'removeItem', 'clear']) {
      const original = proto[method];
      proto[method] = function(...args) { window.__storageCalls.push({method, key:args[0]}); return original.apply(this,args); };
    }
  });
  try {
    await p.goto(url + '/storage-v2/lab.html', {waitUntil:'load'});
    await p.evaluate(async () => {
      const {TrainingDatabase} = await import('/storage-v2/database.mjs');
      const {demoRoot} = await import('/storage-v2/demo.mjs');
      window.labDB = new TrainingDatabase('test-storage-v2'); window.demoRoot = demoRoot;
      window.sampleRaw = JSON.stringify(demoRoot(), null, 2);
    });
    await run(p);
    assert.deepEqual(await p.evaluate(() => __storageCalls), []);
    assert.deepEqual(errors, []);
    assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  } finally { await context.close(); }
}
const stage = p => p.evaluate(() => labDB.stageSource(sampleRaw));

test('S2 WebKit first copy commits only after full comparison; original is byte-exact', () => withPage(async p => {
  const result = await stage(p); assert.equal(result.revision, 1);
  assert.deepEqual(await p.evaluate(async () => (await labDB.read()).root), demoRoot());
  assert.equal(await p.evaluate(() => labDB.original()), JSON.stringify(demoRoot(),null,2));
}));
test('S2 repeated migration is idempotent, never creates a third Program', () => withPage(async p => {
  await stage(p); const result = await stage(p);
  assert.equal(result.unchanged, true); assert.equal(result.revision, 1); assert.equal(result.counts.programs, 2);
}));
test('S2 a different source or changed destination cannot be silently overwritten', () => withPage(async p => {
  await stage(p);
  const result = await p.evaluate(async () => {
    const before = await labDB.read(); const next = demoRoot(); next.ui.selected = 'history';
    try { await labDB.stageSource(JSON.stringify(next)); } catch (error) { return {code:error.code, same:JSON.stringify(before) === JSON.stringify(await labDB.read())}; }
  });
  assert.deepEqual(result, {code:'DESTINATION_EXISTS', same:true});
}));
test('S2 one edited draft saves one record and preserves both programs and history', () => withPage(async p => {
  await stage(p);
  const result = await p.evaluate(async () => {
    const before = await labDB.read();
    const next = structuredClone(before.root);
    next.profiles['demo-profile'].programs['demo-one'].currentWorkoutDrafts['demo-one-day'].exercises[0].sets[0].weight = '65';
    const commit = await labDB.commit(next, before.revision);
    const after = await labDB.read();
    return {commit, root:after.root, expected:next, original:await labDB.original()};
  });
  assert.equal(result.commit.changedRecords,1); assert.equal(result.commit.revision,2);
  assert.deepEqual(result.root,result.expected); assert.equal(result.original, JSON.stringify(demoRoot(),null,2));
}));
test('S2 transaction abort after document writes restores prior revision and all bytes', () => withPage(async p => {
  await stage(p);
  const result = await p.evaluate(async () => {
    const before = await labDB.read(), documents = await labDB.db.documents.toArray();
    const next = structuredClone(before.root);
    next.profiles['demo-profile'].programs['demo-one'].workoutLogs.push({logId:'new-log',entries:[{weight:70}]});
    delete next.futureOptionalField;
    const fail = () => { throw new DOMException('Injected storage full', 'QuotaExceededError'); };
    labDB.db.metadata.hook('updating', fail);
    let errorName;
    try { await labDB.commit(next,before.revision); } catch (error) { errorName = error.name; }
    labDB.db.metadata.hook('updating').unsubscribe(fail);
    return {errorName, same:JSON.stringify(before) === JSON.stringify(await labDB.read()), docsSame:JSON.stringify(documents) === JSON.stringify(await labDB.db.documents.toArray())};
  });
  assert.equal(result.errorName,'QuotaExceededError'); assert.equal(result.same,true); assert.equal(result.docsSame,true);
}));
test('S2 first migration failing at final manifest leaves no partial candidate or original', () => withPage(async p => {
  const result = await p.evaluate(async () => {
    labDB.db.metadata.hook('creating', () => { throw new DOMException('full','QuotaExceededError'); });
    let name; try { await labDB.stageSource(sampleRaw); } catch (error) { name=error.name; }
    return {name,status:await labDB.status(),records:await labDB.db.documents.count(),original:await labDB.original()};
  });
  assert.deepEqual(result,{name:'QuotaExceededError',status:null,records:0,original:null});
}));
test('S2 concurrent tabs cannot silently overwrite; one commit wins and one conflicts', () => withPage(async p => {
  await stage(p);
  const result = await p.evaluate(async () => {
    const {TrainingDatabase}=await import('/storage-v2/database.mjs'); const second=new TrainingDatabase('test-storage-v2');
    const a=await labDB.read(), b=await second.read(); a.root.ui.tab='a'; b.root.ui.tab='b';
    const results=await Promise.allSettled([labDB.commit(a.root,a.revision),second.commit(b.root,b.revision)]);
    second.close(); return results.map(r=>({status:r.status,code:r.reason?.code}));
  });
  assert.equal(result.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(result.find(r=>r.status==='rejected').code,'REVISION_CONFLICT');
}));
test('S2 unchanged save does not advance revision or write records', () => withPage(async p => {
  await stage(p);
  const r=await p.evaluate(async()=>{const current=await labDB.read();return labDB.commit(current.root,current.revision);});
  assert.equal(r.revision,1);assert.equal(r.changedRecords,0);
}));
test('S2 close and reopen recover the exact state and original', () => withPage(async p => {
  await stage(p);
  const result=await p.evaluate(async()=>{
    labDB.close();const {TrainingDatabase}=await import('/storage-v2/database.mjs'); labDB=new TrainingDatabase('test-storage-v2');
    return {root:(await labDB.read()).root,raw:await labDB.original()};
  });
  assert.deepEqual(result.root,demoRoot());assert.equal(result.raw,JSON.stringify(demoRoot(),null,2));
}));
test('S2 exported backup reimports without changes and remains compatible with existing importer', () => withPage(async p => {
  await stage(p);
  const result=await p.evaluate(async()=>{
    const backup=await labDB.exportBackup();const {TrainingDatabase}=await import('/storage-v2/database.mjs');
    const restored=new TrainingDatabase('restored-test');await restored.stageSource(JSON.stringify(backup));
    const r=await restored.read();restored.close();return {backup,root:r.root};
  });
  assert.deepEqual(result.root,demoRoot());
  const m=loadStorage();m.importBackupObject(result.backup);
  const active=m.getActiveProgram();assert.equal(active.workoutLogs[0].entries[0].weight,'60');
  assert.equal(active.days[0].exercises[0].exerciseId,'demo-one-exercise');
  assert.equal(Object.keys(m.getActiveProfile().programs).length,2);
}));
test('S2 tampered payload fails hash validation and cannot be overwritten by commit', () => withPage(async p => {
  await stage(p);
  const result=await p.evaluate(async()=>{
    const rows=await labDB.db.documents.toArray();const row=rows.find(r=>r.key==='["ui"]');
    await labDB.db.documents.put({...row,json:'{"corrupt":true}'});
    let read,write;
    try{await labDB.read();}catch(e){read=e.code;}
    try{await labDB.commit(demoRoot(),1);}catch(e){write=e.code;}
    return {read,write};
  });
  assert.deepEqual(result,{read:'HASH_MISMATCH',write:'HASH_MISMATCH'});
}));
test('S2 390px actual UI supports copy, refresh verification and both downloads', () => withPage(async p => {
  await p.locator('#demo').tap();await p.waitForFunction(()=>!document.getElementById('stage').disabled);
  await p.locator('#stage').tap();await p.waitForFunction(()=>document.getElementById('status').dataset.state==='success');
  assert.match(await p.locator('#status').textContent(),/完整内容/);
  const first=p.waitForEvent('download');await p.locator('#export').tap();assert.match((await first).suggestedFilename(),/总存档/);
  const original=p.waitForEvent('download');await p.locator('#original').tap();assert.match((await original).suggestedFilename(),/原始/);
  await p.reload();await p.locator('#inspect').tap();await p.waitForFunction(()=>document.getElementById('status').dataset.state==='success');
  assert.match(await p.locator('#comparison').textContent(),/训练日志2/);
  assert.ok((await p.locator('#stage').boundingBox()).height>=44);
}));
test('S2 production entry point never loads the laboratory; lab database does not access localStorage', () => {
  const html=fs.readFileSync(path.join(directory,'index.html'),'utf8');
  assert.doesNotMatch(html,/storage-v2\/lab\./);
  const script=fs.readFileSync(path.join(directory,'storage-v2/database.mjs'),'utf8');
  assert.doesNotMatch(script,/localStorage\s*\./);
});
test('S2 incomplete manifest cannot be treated as fresh empty storage', () => withPage(async p => {
  await stage(p);
  const result=await p.evaluate(async()=>{
    await labDB.db.metadata.delete('manifest');let read,stage;
    try{await labDB.read();}catch(e){read=e.code;}
    try{await labDB.stageSource(sampleRaw);}catch(e){stage=e.code;}
    return {read,stage,original:await labDB.original()};
  });
  assert.equal(result.read,'INCOMPLETE_STORAGE');assert.equal(result.stage,'INCOMPLETE_STORAGE');
  assert.equal(result.original,JSON.stringify(demoRoot(),null,2));
}));
test('S2 a synthetic 6 MiB source persists in IndexedDB without touching localStorage', () => withPage(async p => {
  const result=await p.evaluate(async()=>{
    const root=demoRoot();root.syntheticLargePayload='x'.repeat(6*1024*1024);
    const raw=JSON.stringify(root);await labDB.stageSource(raw);
    const after=await labDB.read();
    return {same:JSON.stringify(after.root)===raw,bytes:raw.length,rawEqual:await labDB.original()===raw};
  });
  assert.equal(result.same,true);assert.equal(result.rawEqual,true);assert.ok(result.bytes>6*1024*1024);
}));
