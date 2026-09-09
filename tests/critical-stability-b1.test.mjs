import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadStorage,MemoryStorage} from './helpers.mjs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const ROOT='training-tracker-state';
function loadFunctions(context,names){
  for(const name of names){
    const start=source.indexOf(`function ${name}(`);
    if(start<0)continue;
    const end=source.indexOf('\nfunction ',start+1);
    vm.runInContext(source.slice(start,end<0?source.length:end),context);
  }
}
function node(attrs={},fields={}){
  const classes=new Set();
  return {id:attrs.id||'',attrs,fields,classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),contains:x=>classes.has(x)},
    getAttribute:key=>attrs[key]??null,setAttribute:(key,value)=>{attrs[key]=String(value);},hasAttribute:key=>key in attrs,
    querySelector:selector=>fields[selector]||null,querySelectorAll:()=>[]};
}
function row(id,weight=''){
  return node({'data-set-id':id,'data-set-no':'1'},{
    '[data-field="weight"]':{value:weight},'[data-field="unit"]':{value:'kg'},
    '[data-field="reps"]':{value:'5'},'[data-field="rir"]':{value:'3'},
    '[data-field="duration"]':{value:''},'input[type=range]':{value:'90',type:'range'}
  });
}
function card(id,rows=[row(id+'-S1')]){
  const wrap=node();
  const result=node({id,'data-card-id':id,'data-exercise-id':id},{'[data-field="mainName"]':{value:id},'.mainSets':wrap});
  result.rows=rows;
  rows.forEach(item=>{item.remove=()=>rows.splice(rows.indexOf(item),1);});
  result.querySelectorAll=wrap.querySelectorAll=selector=>selector.includes('setrow')?rows:[];
  wrap.insertAdjacentHTML=(_position,encoded)=>{rows.push(row(JSON.parse(encoded).setId));};
  return result;
}
function harness(){
  const storage=new MemoryStorage(),c=loadStorage(storage);
  c.console={log(){},error(){},warn(){}};
  const days=[0,1].map(i=>({workoutId:'W'+(i+1),sourceWorkoutKey:'D'+(i+1),title:'匿名训练',workoutType:'strength',
    exercises:['E1','E2'].map(id=>({exerciseId:i?id+'next':id,name:id,section:'主项',sets:[{setId:(i?id+'next':id)+'-S1',reps:5}]}))}));
  const program=c.createProgramFromPlan(days,{programId:'P1',name:'匿名测试'});
  const root={schemaVersion:6,activeProfileId:'PF',activeProgramId:program.programId,profiles:{PF:{profileId:'PF',programs:{[program.programId]:program},exerciseTemplates:[],warmupTemplates:[],rmRecords:[]}},ui:{}};
  c.bindTrainingRuntime(root);
  c.saveState();
  let writes=0,quota=false;
  const baseSet=storage.setItem.bind(storage);
  storage.setItem=(key,value)=>{writes++;if(quota)throw Object.assign(new Error('quota injected'),{name:'QuotaExceededError'});baseSet(key,value);};
  const h={c,storage,cards:[card('E1'),card('E2')],alerts:[],writes:()=>writes,setQuota:value=>{quota=value;}};
  const panel=node(),toggle=node();
  h.panel=panel;
  c.document={activeElement:null,
    getElementById:id=>id==='warmupPanel'?panel:id==='warmupToggleBtn'?toggle:h.cards.find(item=>item.id===id)||null,
    querySelector:()=>null,querySelectorAll:selector=>selector==='#exercises .mainCard'?h.cards:[]};
  Object.assign(c,{
    getWorkout:()=>c.PLAN[c.state.currentIndex],getCurrentSessionNote:()=>c.state.currentSessionNote||'',
    setCurrentSessionNote:value=>{c.state.currentSessionNote=value;},syncFloatingNote:()=>c.state.currentSessionNote||'',
    workoutWarmupKey:()=>c.getWorkout().workoutId,refreshAllAnchorAssessments(){},normalizeSetNumbersInDom(){},
    weightToKg:(value,unit)=>Number(value||0)*(unit==='lb'?0.45359237:1),updateRestLabel(){},rowTimers:{},
    fmt:value=>String(value),mainSetForCardHTML:(_card,_idx,_no,_reps,_rir,_rest,_dur,_custom,_total,setId)=>JSON.stringify({setId}),
    collectEntries:()=>h.cards.flatMap(item=>item.rows.map(r=>({name:item.id,trackingName:item.id,type:'主训练',...c.readSetRow(r)}))),
    actualDateFor:()=>c.state.actualDates[c.getWorkout().workoutId]||'',scheduledDateFor:()=>'',plannedDateFor:()=>'',localDateString:()=> '2026-09-09',
    markCurrentTrainingToday:()=>{c.state.actualDates[c.getWorkout().workoutId]='2026-09-09';},
    writeWorkoutMap:(map,index,value)=>({...map,[c.PLAN[index].workoutId]:value}),
    buildExerciseHistoryFromLogs:()=>({}),buildBriefText:()=> '匿名简报',renderCompleteDebugStatus(){},showBrief(){},
    rebuild(){},showToast:message=>h.alerts.push(message),alert:message=>h.alerts.push(String(message)),downloadCycleBackupFile(){},
    finishWorkoutInProgress:false,lastFinishedWorkoutIntent:null
  });
  loadFunctions(c,['currentDraftKey','readSetRow','writeSetRow','draftCanonicalWarmups','draftSetBelongsToExercise','mergeReadableDraftItems',
    'findCurrentSet','updateSetValue','captureCurrentWorkoutDraft','hasIncompleteMainWorkoutRender','syncCurrentWorkoutFormToState','rebuildCurrentWorkoutLogDraft',
    'restoreDraftCardSets','restoreCurrentWorkoutDraft','clearCurrentWorkoutDraft',
    'setWarmupPanelCollapsed','toggleWarmupPanel','initWarmupPanel','initWorkoutUiPreferences',
    'buildWorkoutLogSnapshotFromDom','buildWorkoutLogFromCurrent','archiveSessionNote','setCompleteDebugStatus','finishWorkoutCompleteBackup']);
  h.seedDraft=()=>{c.state.currentWorkoutDrafts.W1={workoutId:'W1',mains:[{exerciseId:'E1',name:'甲',sets:[{setId:'E1-S1',weight:'60',unit:'kg',reps:'5',rir:'3'}]}],warmups:[]};};
  h.draft=()=>c.state.currentWorkoutDrafts.W1;
  h.persisted=()=>{const root=JSON.parse(storage.getItem(ROOT));return root.profiles[root.activeProfileId].programs[root.activeProgramId];};
  return h;
}

test('A01-1 partial render never restores E1 data into E2',()=>{
  const h=harness();h.seedDraft();const before=plain(h.draft());h.cards=h.cards.slice(1);
  h.c.restoreCurrentWorkoutDraft();h.c.captureCurrentWorkoutDraft();h.c.saveState();
  assert.equal(h.cards[0].rows[0].fields['[data-field="weight"]'].value,'');
  assert.deepEqual(plain(h.draft().mains.find(x=>x.exerciseId==='E1')),before.mains[0]);
});
test('A01-2 all cards failed: restore capture sync save preserves absent canonical draft',()=>{
  const h=harness();h.seedDraft();h.cards=[];h.c.restoreCurrentWorkoutDraft();h.c.syncCurrentWorkoutFormToState();
  assert.equal(h.persisted().currentWorkoutDrafts.W1.mains.length,1);
  assert.equal(h.draft().mains[0].sets[0].weight,'60');
});
test('A01-3 reordered cards and rows restore by stable identity',()=>{
  const h=harness();h.seedDraft();h.c.PLAN[0].exercises[0].sets.push({setId:'E1-S2'});
  h.draft().mains[0].sets.push({setId:'E1-S2',weight:'65'});
  h.draft().mains.push({exerciseId:'E2',sets:[{setId:'E2-S1',weight:'28'}]});
  h.cards[0].rows.unshift(row('E1-S2'));h.cards.reverse();h.c.restoreCurrentWorkoutDraft();
  assert.equal(h.cards[0].rows[0].fields['[data-field="weight"]'].value,'28');
  assert.deepEqual(h.cards[1].rows.map(r=>r.fields['[data-field="weight"]'].value),['65','60']);
});
test('A01-4 normal E1 edits update only E1 and retain canonical data',()=>{
  const h=harness();h.seedDraft();const before=JSON.stringify(h.c.PLAN);h.c.restoreCurrentWorkoutDraft();
  h.cards[0].rows[0].fields['[data-field="weight"]'].value='62.5';h.c.captureCurrentWorkoutDraft();
  assert.equal(h.draft().mains.find(x=>x.exerciseId==='E1').sets[0].weight,'62.5');
  assert.equal(JSON.stringify(h.c.PLAN),before);
});
test('A01-5 cross-parent set identity is rejected by restore capture and update',()=>{
  const h=harness();h.seedDraft();h.draft().mains.push({exerciseId:'E2',sets:[{setId:'E1-S1',weight:'99'}]});
  assert.equal(h.c.findCurrentSet('E2','E1-S1'),null);
  h.c.restoreCurrentWorkoutDraft();assert.equal(h.cards[1].rows[0].getAttribute('data-set-id'),'E2-S1');
  h.cards[1].rows[0].setAttribute('data-set-id','E1-S1');h.c.captureCurrentWorkoutDraft();
  assert.equal(h.draft().mains.find(x=>x.exerciseId==='E2').sets.some(x=>x.setId==='E1-S1'),false);
  assert.equal(h.c.findCurrentSet('missing','E1-S1'),null);
  assert.equal(h.c.findCurrentSet('E2','E1-S1'),null);
});
test('A01-6 true rest with zero canonical exercises permits an empty draft',()=>{
  const h=harness();h.seedDraft();h.c.PLAN[0].exercises=[];h.c.PLAN[0].workoutType='rest';h.cards=[];
  assert.equal(h.c.captureCurrentWorkoutDraft().mains.length,0);
});
test('A01-7 missing canonical set survives partial DOM but explicit canonical deletion does not',()=>{
  const h=harness();h.seedDraft();h.cards[0].rows.length=0;h.c.captureCurrentWorkoutDraft();
  assert.equal(h.draft().mains[0].sets.length,1);
  h.c.PLAN[0].exercises=[];h.cards=[];h.c.captureCurrentWorkoutDraft();assert.equal(h.draft().mains.length,0);
});
test('A01-8 partial render preserves brief draft and cannot finalize an incomplete DOM snapshot',()=>{
  const h=harness();h.seedDraft();h.c.state.currentWorkoutLogDraft={entries:[{name:'甲',setId:'E1-S1',weight:'60'}]};
  const before=JSON.stringify(h.c.state.currentWorkoutLogDraft);h.cards=[];
  h.c.rebuildCurrentWorkoutLogDraft();assert.equal(JSON.stringify(h.c.state.currentWorkoutLogDraft),before);
  h.c.finishWorkoutCompleteBackup();assert.equal(h.persisted().workoutLogs.length,0);assert.equal(h.draft().mains.length,1);
});
test('A01-9 DOM-only legacy rows restore saved IDs without duplicating placeholder rows',()=>{
  const h=harness();h.seedDraft();h.c.PLAN[0].exercises=[];
  h.cards[0].rows[0].setAttribute('data-set-id','new-render-placeholder');
  h.c.restoreCurrentWorkoutDraft();assert.equal(h.cards[0].rows.length,1);
  assert.equal(h.cards[0].rows[0].getAttribute('data-set-id'),'E1-S1');
  assert.equal(h.cards[0].rows[0].fields['[data-field="weight"]'].value,'60');
});
test('A01-10 structured warmup display identities preserve missing stages without mutating source',()=>{
  const h=harness();h.c.structuredWarmupItems=()=>[{viewExerciseId:'warm-1',viewSetId:'warm-1-S1',sets:1}];
  h.seedDraft();h.draft().warmups=[{exerciseId:'warm-1',sets:[{setId:'warm-1-S1',weight:'5'}]}];
  const before=JSON.stringify(h.c.PLAN);h.c.restoreCurrentWorkoutDraft();h.c.captureCurrentWorkoutDraft();
  assert.equal(h.draft().warmups[0].sets[0].weight,'5');assert.equal(JSON.stringify(h.c.PLAN),before);
});
test('A02-1 initialization renders preference with zero ROOT writes or mutations',()=>{
  const h=harness(),before=JSON.stringify(h.c.trainingTrackerState);h.c.initWarmupPanel();
  assert.equal(h.writes(),0);assert.equal(JSON.stringify(h.c.trainingTrackerState),before);
});
test('A02-2 quota cannot interrupt preference initialization',()=>{
  const h=harness();h.setQuota(true);assert.doesNotThrow(()=>h.c.initWarmupPanel());assert.equal(h.writes(),0);
});
test('A02-3 user collapse persists and reload restores without another write',()=>{
  const h=harness();h.c.toggleWarmupPanel();assert.equal(h.writes(),1);
  assert.equal(JSON.parse(h.storage.getItem(ROOT)).ui.warmupPanelCollapsed,true);
  h.panel.classList.remove('collapsed');h.c.bindTrainingRuntime(JSON.parse(h.storage.getItem(ROOT)));h.c.initWarmupPanel();
  assert.equal(h.panel.classList.contains('collapsed'),true);assert.equal(h.writes(),1);
});
test('A02-4 optional preference exception does not block remaining startup bindings',()=>{
  const h=harness(),calls=[];h.c.rebuild=()=>calls.push('rebuild');h.c.showTab=()=>calls.push('nav');
  h.c.initWarmupPanel=()=>{throw new Error('optional preference failed');};
  h.c.initFloatingNoteDrag=()=>calls.push('drag');h.c.bindGeneralTimerControls=()=>calls.push('timer');
  const startup=source.slice(source.lastIndexOf('\nrebuild();')).trim();
  assert.doesNotThrow(()=>vm.runInContext(startup,h.c));assert.ok(calls.includes('timer'));assert.ok(calls.includes('nav'));
});
test('A04-1 normal Finish commits log completed date and next position together',()=>{
  const h=harness();h.cards[0].rows[0].fields['[data-field="weight"]'].value='60';h.c.finishWorkoutCompleteBackup();
  const stored=h.persisted();assert.equal(stored.workoutLogs.length,1);assert.equal(stored.workoutLogs[0].entries[0].weight,'60');
  assert.equal(stored.completed.W1,true);assert.equal(stored.actualDates.W1,'2026-09-09');assert.equal(stored.currentIndex,1);
  assert.equal(h.writes(),1);
});
test('A04-2 committed rebuild failure reports saved and prevents stale-page duplicate Finish',()=>{
  const h=harness();h.c.rebuild=()=>{throw new Error('render injected');};h.c.finishWorkoutCompleteBackup();
  const after=h.storage.getItem(ROOT);h.c.finishWorkoutCompleteBackup();
  assert.equal(h.storage.getItem(ROOT),after);assert.equal(h.persisted().workoutLogs.length,1);
  assert.equal(h.persisted().completed.W1,true);assert.equal(h.persisted().actualDates.W1,'2026-09-09');
  assert.match(h.alerts.join('\n'),/已保存.*刷新/);assert.doesNotMatch(h.alerts.join('\n'),/完成训练失败|保存失败/);
});
test('A04-3 core quota failure leaves bytes runtime and next position unchanged',()=>{
  const h=harness(),before=h.storage.getItem(ROOT);h.setQuota(true);h.c.finishWorkoutCompleteBackup();
  assert.equal(h.storage.getItem(ROOT),before);assert.equal(h.c.state.currentIndex,0);assert.equal(h.c.state.logs.length,0);
  assert.equal(h.c.state.completed.W1,undefined);assert.equal(h.c.state.actualDates.W1,undefined);
  assert.match(h.alerts.join('\n'),/保存失败/);
});
test('A04-4 failure feedback never retries save even if status rendering throws',()=>{
  const h=harness();h.setQuota(true);h.c.renderCompleteDebugStatus=()=>{throw new Error('status injected');};
  assert.doesNotThrow(()=>h.c.finishWorkoutCompleteBackup());assert.equal(h.writes(),1);assert.match(h.alerts.join('\n'),/保存失败/);
});
test('A04-5 repeated Finish on final workout appends only one log',()=>{
  const h=harness();h.c.state.currentIndex=1;h.cards=[card('E1next'),card('E2next')];h.c.finishWorkoutCompleteBackup();h.c.finishWorkoutCompleteBackup();
  assert.equal(h.persisted().workoutLogs.length,1);
});
test('A04-6 secondary backup failure is post-commit with no catch save',()=>{
  const h=harness();h.c.downloadCycleBackupFile=()=>{throw new Error('backup injected');};h.c.finishWorkoutCompleteBackup();
  assert.equal(h.persisted().workoutLogs.length,1);assert.equal(h.writes(),1);
  assert.match(h.alerts.join('\n'),/备份失败/);assert.doesNotMatch(h.alerts.join('\n'),/完成训练失败|保存失败/);
});
test('A04-7 pre-commit non-quota exception also rolls runtime back and allows retry',()=>{
  const h=harness(),before=h.storage.getItem(ROOT),save=h.c.saveState;
  h.c.saveState=()=>{throw new Error('injected write denied');};h.c.finishWorkoutCompleteBackup();
  assert.equal(h.c.state.currentIndex,0);assert.equal(h.c.state.logs.length,0);assert.equal(h.storage.getItem(ROOT),before);
  h.c.saveState=save;h.c.finishWorkoutCompleteBackup();assert.equal(h.persisted().workoutLogs.length,1);
});
test('A04-8 rapid second click after a successful next-workout rebuild cannot finish the next day',()=>{
  const h=harness();h.c.rebuild=()=>{h.cards=[card('E1next'),card('E2next')];};
  h.c.finishWorkoutCompleteBackup();h.c.finishWorkoutCompleteBackup();assert.equal(h.persisted().workoutLogs.length,1);
  assert.equal(h.persisted().completed.W2,undefined);
});
test('A04-9 quota failure preserves visible notes and date input for retry',()=>{
  const h=harness(),note={value:'未提交备注'},date={value:'2026-09-01'},get=h.c.document.getElementById;
  h.c.state.currentSessionNote=note.value;
  h.c.document.getElementById=id=>id==='sessionNote'?note:id==='actualDate'?date:get(id);
  loadFunctions(h.c,['renderNoteInputs','setCurrentSessionNote']);
  const mark=h.c.markCurrentTrainingToday;h.c.markCurrentTrainingToday=()=>{mark();date.value='2026-09-09';};
  h.setQuota(true);h.c.finishWorkoutCompleteBackup();assert.equal(note.value,'未提交备注');assert.equal(date.value,'2026-09-01');
});
test('A04-10 Finish appends without changing old history ownership canonical IDs or templates',()=>{
  const h=harness(),old={workoutId:'older-workout',actualDate:'2026-08-01',entries:[{name:'甲',weight:'50',weightKg:50,reps:'5',rir:'2'}]};
  h.c.state.logs.push(old);h.c.state.actualDates['older-workout']='2026-08-01';
  h.c.trainingTrackerState.profiles.PF.exerciseTemplates.push({id:'template1',name:'甲'});
  const days=JSON.stringify(h.c.PLAN),templates=JSON.stringify(h.c.trainingTrackerState.profiles.PF.exerciseTemplates);
  h.c.finishWorkoutCompleteBackup();const stored=h.persisted();
  assert.equal(stored.workoutLogs.length,2);assert.deepEqual(stored.workoutLogs[0],old);
  assert.equal(JSON.stringify(h.c.PLAN),days);assert.equal(stored.actualDates['older-workout'],'2026-08-01');
  assert.equal(JSON.stringify(h.c.trainingTrackerState.profiles.PF.exerciseTemplates),templates);
  assert.equal(JSON.parse(h.storage.getItem(ROOT)).schemaVersion,6);assert.deepEqual(h.storage.keys(),[ROOT]);
});
