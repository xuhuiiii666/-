import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {loadTrainingModules} from './helpers.mjs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
function fixture(){return {workoutId:'W1',exercises:[
  {exerciseId:'E1',sourceExerciseKey:'SOURCE1',trackingName:'绳索弯举',name:'绳索弯举',supersetId:'SS01',sets:[{setId:'E1:S1',rest:90},{setId:'E1:S2',rest:90}]},
  {exerciseId:'E0',name:'独立动作',sets:[{setId:'E0:S1'}]},
  {exerciseId:'E2',sourceExerciseKey:'SOURCE2',trackingName:'绳索下压',name:'绳索下压',supersetId:'SS01',sets:[{setId:'E2:S1',rest:90},{setId:'E2:S2',rest:90}]}
],supersetRules:[{supersetId:'SS01',mode:'alternating',members:['E1','E2'],roundRestMinSec:90,roundRestMaxSec:90,transitionMinSec:0,transitionMaxSec:15}]};}
test('T02-1 same supersetId creates one display group, unrelated exercise stays independent',()=>{const c=loadTrainingModules(),groups=c.groupSupersetsForDisplay(fixture());assert.equal(groups.length,2);assert.equal(groups[0].kind,'superset');assert.deepEqual(Array.from(groups[0].members,x=>x.exerciseId),['E1','E2']);assert.equal(groups[1].kind,'exercise');});
test('T02-2 grouping does not merge mutate or regenerate canonical Exercise/Set identities',()=>{const c=loadTrainingModules(),w=fixture(),before=JSON.stringify(w),groups=c.groupSupersetsForDisplay(w);assert.equal(JSON.stringify(w),before);assert.equal(groups[0].members[0],w.exercises[0]);assert.equal(groups[0].members[1].sets[0].setId,'E2:S1');});
test('T02-3 members use explicit rule order and unequal rounds never fabricate sets',()=>{const c=loadTrainingModules(),w=fixture();w.supersetRules[0].members.reverse();w.exercises[0].sets.pop();const g=c.groupSupersetsForDisplay(w)[0];assert.deepEqual(Array.from(g.members,x=>x.exerciseId),['E2','E1']);assert.equal(g.rounds.length,2);assert.equal(g.rounds[0].length,2);assert.equal(g.rounds[1].length,1);});
test('T02-4 an isolated member or missing supersetId is never grouped by name or source text',()=>{const c=loadTrainingModules(),w=fixture();w.exercises[2].supersetId='SS02';w.exercises[1].line='超级组 动作A+动作B';assert.equal(c.groupSupersetsForDisplay(w).filter(x=>x.kind==='superset').length,0);});
test('T02-5 identical group IDs in different workouts stay scoped to their workout',()=>{const c=loadTrainingModules(),a=fixture(),b=fixture();b.workoutId='W2';b.exercises[0].name='另一动作';assert.notEqual(c.groupSupersetsForDisplay(a)[0].workoutId,c.groupSupersetsForDisplay(b)[0].workoutId);assert.equal(a.exercises[0].name,'绳索弯举');});
test('T02-6 display rounds carry original sets, drop segments and per-set prescription untouched',()=>{const c=loadTrainingModules(),w=fixture();w.exercises[0].sets[1].segments=[{key:'drop',reps:10,rir:2}];const g=c.groupSupersetsForDisplay(w)[0];assert.equal(g.rounds[1][0].set,w.exercises[0].sets[1]);assert.equal(g.rounds[1][0].set.segments[0].key,'drop');});
test('T02-7 log collection selects each stable exerciseId, even when display order differs',()=>{
  const c=loadTrainingModules(),exs=fixture().exercises,cards=[exs[0],exs[2],exs[1]].map(ex=>({id:ex.exerciseId,getAttribute:()=>ex.exerciseId})),entries=[];
  c.getWorkout=()=>({});c.parseExercises=()=>exs;c.document.querySelectorAll=selector=>selector.includes('not([data-custom-main])')?cards:[];
  c.collectMainCardEntries=(result,card,meta)=>result.push({id:card?.id,name:meta.name});
  const start=source.indexOf('function collectEntries('),end=source.indexOf('\nfunction ',start+1);vm.runInContext(source.slice(start,end),c);
  const logs=c.collectEntries();assert.deepEqual(Array.from(logs,x=>({id:x.id,name:x.name})),exs.map(x=>({id:x.exerciseId,name:x.name})));
});
test('T02-8 completing a display round marks both original sets and starts only its owner timer',()=>{
  const c=loadTrainingModules(),rows=new Map(['E1:S1','E2:S1'].map(id=>[id,{done:false,classList:{add(){rows.get(id).done=true;}},setAttribute(){}}])),starts=[];
  c.document.getElementById=id=>rows.get(id.replace(/^row_/,''));c.startRowTimer=id=>starts.push(id);
  const start=source.indexOf('function completeSupersetRound('),end=source.indexOf('\nfunction ',start+1);vm.runInContext(source.slice(start,end),c);
  c.completeSupersetRound({dataset:{roundSetIds:JSON.stringify([...rows.keys()])},closest:()=>({contains:row=>[...rows.values()].includes(row)})});
  assert.equal([...rows.values()].every(row=>row.done),true);assert.deepEqual(starts,['E2:S1']);
});
test('T02-9 a failed member render cannot complete a partial round or borrow another set',()=>{
  const c=loadTrainingModules(),starts=[],alerts=[];let done=false;
  c.document.getElementById=id=>id==='row_E1:S1'?{classList:{add(){done=true;}}}:null;c.startRowTimer=id=>starts.push(id);c.alert=text=>alerts.push(text);
  const start=source.indexOf('function completeSupersetRound('),end=source.indexOf('\nfunction ',start+1);vm.runInContext(source.slice(start,end),c);
  c.completeSupersetRound({dataset:{roundSetIds:'["E1:S1","E2:S1"]'},closest:()=>({contains:()=>true})});
  assert.equal(done,false);assert.deepEqual(starts,[]);assert.equal(alerts.length,1);
});
