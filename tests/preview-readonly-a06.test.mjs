import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadStorage,loadScript,MemoryStorage} from './helpers.mjs';

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
    actualDateFor:()=>c.state.actualDates[c.getWorkout().workoutId]||'',scheduledDateFor:()=>'',plannedDateFor:()=>'',localDateString:()=> '2026-09-10',
    markCurrentTrainingToday:()=>{c.state.actualDates[c.getWorkout().workoutId]='2026-09-10';},
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


function previewHarness(){
  const h=harness(),c=h.c;
  loadScript(c,'parser.js');
  c.runtimeDateIntegrityState=null;
  c.state.days.forEach((w,i)=>{w.plannedDate='2026-09-'+(11+i);w['训练主题']='匿名训练';});
  const brief={textContent:'',classList:{remove(){}},scrollIntoView(){}};
  const note={value:'DOM 备注'},floating={value:'浮动备注'};
  const originalGet=c.document.getElementById;
  c.document.getElementById=id=>id==='briefPreview'?brief:id==='sessionNote'?note:id==='floatingSessionNote'?floating:originalGet(id);
  c.document.querySelectorAll=selector=>selector.includes('#exercises .mainCard')?h.cards:[];
  c.parseExercises=()=>c.getWorkout().exercises;
  c.e1rm=(weight,reps)=>Number(weight)*(1+Number(reps)/30);
  c.addDays=(date,n)=>{const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  loadFunctions(c,['workoutKeyForIndex','workoutIndexForKey','readWorkoutMap','writeWorkoutMap','plannedDateFor',
    'refreshRuntimeDateIntegrity','trustedRuntimeDates','actualDateFor','latestActualPosition','scheduledDateFor','effectiveDateFor',
    'markActualTrainingDate','markCurrentTrainingToday','getCurrentSessionNote','setCurrentSessionNote','renderNoteInputs','syncFloatingNote',
    'collectMainCardEntries','collectEntries','formatEntryLine','buildBriefText','showBrief','buildWorkoutPreviewSnapshot','previewCurrentBrief']);
  h.brief=brief;h.note=note;h.floating=floating;
  h.bytes=()=>JSON.stringify(c.trainingTrackerState);
  h.view=()=>{c.previewCurrentBrief();return brief.textContent;};
  return h;
}
function unchanged(h,action){
  const before=h.bytes(),raw=h.storage.getItem(ROOT),writes=h.writes();
  const result=action();
  assert.equal(h.bytes(),before);
  assert.equal(h.storage.getItem(ROOT),raw);
  assert.equal(h.writes(),writes);
  return result;
}
test('A06-1 fresh Preview never creates execution dates, anchors, sessions or saves',()=>{
  const h=previewHarness(),s=h.c.state;
  s.actualDates={};s.dateAnchors={};s.sessionStartedAt={};s.lastActualIndex=null;s.lastActualDate='';
  unchanged(h,()=>h.view());
  assert.deepEqual(plain([s.actualDates,s.dateAnchors,s.sessionStartedAt]),[{},{},{}]);
  assert.equal(s.lastActualIndex,null);assert.equal(s.lastActualDate,'');assert.equal(h.writes(),0);
});
test('A06-2 five Previews leave the entire ROOT and Program byte-for-byte unchanged',()=>{
  const h=previewHarness();h.seedDraft();
  unchanged(h,()=>{for(let i=0;i<5;i++)h.view();});
});
test('A06-3 existing completed actualDate remains 2026-09-08, never today',()=>{
  const h=previewHarness();h.c.state.actualDates.W1='2026-09-08';h.c.state.completed.W1=true;
  const text=unchanged(h,()=>h.view());
  assert.match(text,/训练简章｜2026-09-08/);assert.equal(h.c.state.actualDates.W1,'2026-09-08');
});
test('A06-4 scheduling anchor supplies display date but not actualDate',()=>{
  const h=previewHarness();h.c.state.dateAnchors.W1='2026-09-12';
  assert.match(unchanged(h,()=>h.view()),/训练简章｜2026-09-12/);
  assert.deepEqual(plain(h.c.state.actualDates),{});
});
test('A06-5 reading DOM 60kg x8 RIR2 without input events is read-only',()=>{
  const h=previewHarness(),fields=h.cards[0].rows[0].fields;
  h.cards[0].fields['[data-field="mainName"]'].value='卧推';
  fields['[data-field="weight"]'].value='60';fields['[data-field="reps"]'].value='8';fields['[data-field="rir"]'].value='2';
  const text=unchanged(h,()=>h.view());
  assert.match(text,/卧推/);assert.match(text,/60kg｜×8｜RIR 2/);assert.deepEqual(plain(h.c.state.actualDates),{});
});
test('A06-6 Preview never appends or changes past workoutLogs',()=>{
  const h=previewHarness();h.c.state.logs.push({workoutId:'past',actualDate:'2026-09-01',entries:[{weight:'50'}]});
  unchanged(h,()=>h.view());assert.equal(h.c.state.logs.length,1);
});
test('A06-7 Preview preserves completion map including past completed workouts',()=>{
  const h=previewHarness();h.c.state.completed.W2=true;
  unchanged(h,()=>h.view());assert.deepEqual(plain(h.c.state.completed),{W2:true});
});
test('A06-8 Preview does not advance currentIndex or currentWorkoutId',()=>{
  const h=previewHarness(),id=h.c.state.currentWorkoutId;
  unchanged(h,()=>h.view());assert.equal(h.c.state.currentIndex,0);assert.equal(h.c.state.currentWorkoutId,id);
});
test('A06-9 Preview reads DOM note without writing Draft or note aliases',()=>{
  const h=previewHarness();h.seedDraft();h.c.state.currentSessionNote='已保存备注';h.c.document.activeElement=h.floating;
  assert.match(unchanged(h,()=>h.view()),/浮动备注/);
  assert.equal(h.c.state.currentSessionNote,'已保存备注');assert.equal(h.draft().mains[0].sets[0].weight,'60');
});
test('A06-10 real Finish after Preview still commits actualDate, log, completed and next workout',()=>{
  const h=previewHarness();h.cards[0].rows[0].fields['[data-field="weight"]'].value='60';
  unchanged(h,()=>h.view());h.c.finishWorkoutCompleteBackup();
  const s=h.persisted();assert.equal(s.actualDates.W1,'2026-09-10');assert.equal(s.workoutLogs.length,1);
  assert.equal(s.workoutLogs[0].actualDate,'2026-09-10');assert.equal(s.completed.W1,true);assert.equal(s.currentIndex,1);
  assert.equal(s.workoutLogs[0].entries[0].weight,'60');
});
test('A06-11 snapshot preserves blank actualDate and explicit scheduled/planned fields',()=>{
  const h=previewHarness();h.c.getWorkout().scheduledDate='2026-09-12';
  const snap=unchanged(h,()=>h.c.buildWorkoutPreviewSnapshot());
  assert.equal(snap.actualDate,'');assert.equal(snap.date,'2026-09-12');assert.equal(snap.plannedDate,'2026-09-11');
  assert.equal(snap.status,'预览');
});
test('A06-12 missing optional maps stay absent, even under deep freeze',()=>{
  const h=previewHarness();delete h.c.state.actualDates;delete h.c.state.dateAnchors;delete h.c.state.sessionStartedAt;
  function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}}
  freeze(h.c.trainingTrackerState);
  assert.match(unchanged(h,()=>h.view()),/训练简章｜2026-09-11/);
});
test('A06-13 preview cannot call execution, draft, synchronization or persistence helpers',()=>{
  const h=previewHarness();
  for(const name of ['markActualTrainingDate','markCurrentTrainingToday','saveState','syncCurrentWorkoutFormToState',
    'captureCurrentWorkoutDraft','syncFloatingNote','setCurrentSessionNote','buildWorkoutLogFromCurrent','buildWorkoutLogSnapshotFromDom'])
    h.c[name]=()=>assert.fail('Preview called mutating helper: '+name);
  unchanged(h,()=>h.view());
});

