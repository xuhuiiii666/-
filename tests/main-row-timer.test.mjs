import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function load(c,name){const start=source.indexOf('function '+name+'('),end=source.indexOf('\nfunction ',start+1);vm.runInContext(source.slice(start,end),c);}
function harness(){
  let now=1000000,next=0,saves=0,notes=0;
  const intervals=new Map(),nodes={},draft={},rows={};
  const classes=()=>{const set=new Set();return {add:(...v)=>v.forEach(x=>set.add(x)),remove:(...v)=>v.forEach(x=>set.delete(x)),contains:v=>set.has(v)};};
  const c={console,Date:{now:()=>now},rowTimers:{},document:{getElementById:id=>nodes[id]||null,querySelector:selector=>{if(selector.includes(':'))throw new SyntaxError('unsafe selector: '+selector);return nodes[selector.slice(1).split(' ')[0]]?.querySelector('input');}},
    markCurrentTrainingToday(){},captureCurrentWorkoutDraft(){for(const [id,row]of Object.entries(rows))draft[id]={rest:row.rest,completed:row.classList.contains('done')};},
    getDraftSetByDomId:id=>draft[id],setRestButtonStatus(id,status){nodes['rest_'+id].status=status;},markNextSetReady(){},checkModuleComplete(){},
    renderTimer(){},saveState(){saves++;},updateRestValue(){},fmt:s=>`${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`,
    setInterval:fn=>{intervals.set(++next,fn);return next;},clearInterval:id=>intervals.delete(id),beep:()=>notes++,beepAction(){},markSetNeedFinish(){}};
  c.window=c;vm.createContext(c);vm.runInContext('var activeSet=null,timerLeft=180,timerBase=180,timerId=null,activeTimerContext=null;',c);
  load(c,'startRowTimer');load(c,'tickRealTimer');
  function add(id,rest){const row={rest,classList:classes(),setAttribute(){},closest(){return null;}};rows[id]=row;nodes['row_'+id]=row;nodes['rest_'+id]={classList:classes(),querySelector:()=>({value:String(rest)})};nodes['mt_'+id]={textContent:c.fmt(rest)};}
  add('warmup-safe-id',30);for(let i=1;i<=3;i++)add('longform:row:001:exercise:01:set:'+i,180);
  return {c,rows,nodes,draft,intervals,advance:ms=>{now+=ms;c.tickRealTimer();},state:()=>vm.runInContext('({activeSet,timerLeft,activeTimerContext})',c),saves:()=>saves,notes:()=>notes};
}
const S1='longform:row:001:exercise:01:set:1',S2='longform:row:001:exercise:01:set:2';
test('T01-1 main canonical colon ID starts one live row timer',()=>{const h=harness();h.c.startRowTimer(S1);assert.equal(h.intervals.size,1);assert.equal(h.state().activeTimerContext.id,S1);assert.equal(h.nodes['mt_'+S1].textContent,'03:00');});
test('T01-2 main row decrements 180 -> 179 -> 178 in its own DOM',()=>{const h=harness();h.c.startRowTimer(S1);h.advance(1000);assert.equal(h.nodes['mt_'+S1].textContent,'02:59');h.advance(1000);assert.equal(h.c.rowTimers[S1].left,178);assert.equal(h.nodes['mt_'+S1].textContent,'02:58');});
test('T01-3 warmup A/B remains 30 -> 29 -> 28 with the same timer engine',()=>{const h=harness();h.c.startRowTimer('warmup-safe-id');h.advance(1000);assert.equal(h.nodes['mt_warmup-safe-id'].textContent,'00:29');h.advance(1000);assert.equal(h.nodes['mt_warmup-safe-id'].textContent,'00:28');});
test('T01-4 completed set is persisted to draft after marking, not before',()=>{const h=harness();h.c.startRowTimer(S1);assert.equal(h.draft[S1].completed,true);assert.equal(h.saves(),1);});
test('T01-5 next set never changes the previous visible countdown',()=>{const h=harness();h.c.startRowTimer(S1);h.advance(1000);const previous=h.nodes['mt_'+S1].textContent;h.c.startRowTimer(S2);h.advance(2000);assert.equal(h.nodes['mt_'+S1].textContent,previous);assert.equal(h.nodes['mt_'+S2].textContent,'02:58');assert.equal(h.c.rowTimers[S1].running,false);assert.equal(h.intervals.size,1);});
test('T01-6 background elapsed 10s uses endAt without another interval',()=>{const h=harness();h.c.startRowTimer(S1);const end=h.state().activeTimerContext.endAt;h.advance(10000);assert.equal(h.nodes['mt_'+S1].textContent,'02:50');assert.equal(h.state().activeTimerContext.endAt,end);assert.equal(h.intervals.size,1);});
test('T01-7 zero keeps completed state and existing notification exactly once',()=>{const h=harness();h.c.startRowTimer(S1);h.advance(180000);assert.equal(h.nodes['mt_'+S1].textContent,'00:00');assert.equal(h.rows[S1].classList.contains('done'),true);assert.equal(h.c.rowTimers[S1].running,false);assert.equal(h.nodes['rest_'+S1].status,'restDone');assert.equal(h.notes(),1);h.c.tickRealTimer();assert.equal(h.notes(),1);assert.equal(h.intervals.size,0);});
test('T01-8 timer preserves original exercise/set identities and cannot append logs or advance',()=>{const h=harness(),ids=Object.keys(h.rows);h.c.state={workoutLogs:[],currentIndex:0};h.c.startRowTimer(S1);h.advance(1000);assert.deepEqual(Object.keys(h.rows),ids);assert.deepEqual(h.c.state,{workoutLogs:[],currentIndex:0});});
test('T01-9 restoring a rest display never captures a partially restored draft or saves state',()=>{
  const h=harness();load(h.c,'updateRestValue');h.draft[S1]={weight:'60',rest:180,completed:true};
  h.c.updateRestValue(S1,180,{renderOnly:true});assert.equal(h.saves(),0);
  assert.deepEqual(h.draft[S1],{weight:'60',rest:180,completed:true});assert.equal(h.nodes['mt_'+S1].textContent,'03:00');
});
test('T01-10 restoring a completed row retains completion and uses render-only rest updates',()=>{
  const h=harness(),range={type:'range',value:''},weight={value:''},attrs={},classes=new Set(),calls=[];
  const row={setAttribute:(k,v)=>attrs[k]=v,classList:{toggle:(k,v)=>v?classes.add(k):classes.delete(k)},querySelector:selector=>selector==='input[type=range]'?range:selector==='[data-field="weight"]'?weight:null};
  h.c.updateRestLabel=(input,opts)=>calls.push(opts.renderOnly);load(h.c,'writeSetRow');
  h.c.writeSetRow(row,{setId:S1,setNo:1,weight:'60',rest:180,completed:true},{restoreCompletion:true});
  assert.equal(attrs['data-set-id'],S1);assert.equal(classes.has('done'),true);assert.equal(weight.value,'60');assert.equal(range.value,180);assert.deepEqual(calls,[true]);assert.equal(h.saves(),0);
});
test('T01-11 copying a template never inherits its historical completed state',()=>{
  const h=harness();let completed=false;
  const row={setAttribute(){},classList:{toggle(){completed=true;}},querySelector:()=>null};load(h.c,'writeSetRow');
  h.c.writeSetRow(row,{setId:S2,completed:true});assert.equal(completed,false);
});
