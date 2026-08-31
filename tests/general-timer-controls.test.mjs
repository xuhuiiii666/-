import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const appSource=fs.readFileSync(path.join(root,'app.js'),'utf8');
const timerSource=appSource.slice(appSource.indexOf('function setTimerControlStatus'),appSource.indexOf('function calendarThemeInfo'));

function classList(){
  const values=new Set();
  return {add:value=>values.add(value),remove:value=>values.delete(value),contains:value=>values.has(value)};
}

function button(attributes={}){
  const attrs=new Map(Object.entries(attributes).map(([key,value])=>[key,String(value)]));
  const item={classList:classList(),getAttribute:key=>attrs.has(key)?attrs.get(key):null,setAttribute:(key,value)=>attrs.set(key,String(value))};
  item.closest=selector=>selector.includes('button')?item:null;
  return item;
}

function createTimerHarness({notification}={}){
  let now=Date.parse('2026-08-31T10:00:00Z'),nextInterval=1;
  const intervals=new Map(),alerts=[],listeners={},calls={setTimer:0,startTimer:0,pauseTimer:0,resetTimer:0,notifyPermission:0};
  const timer={textContent:'03:00'},status={textContent:''};
  const secondButtons=[45,90,120,180,300].map(value=>button({'data-timer-seconds':value}));
  const actionButtons=['start','pause','reset','notify'].map(value=>button({'data-timer-action':value}));
  const controls={dataset:{},contains:item=>secondButtons.includes(item)||actionButtons.includes(item),addEventListener:(type,handler)=>{listeners[type]=handler;}};
  const document={
    hidden:false,addEventListener(){},
    querySelector:selector=>selector==='.workoutUtilityCard'?controls:null,
    querySelectorAll:selector=>selector==='[data-timer-seconds]'?secondButtons:[],
    getElementById:id=>id==='timer'?timer:id==='timerControlStatus'?status:null
  };
  const context={
    console,document,alert:message=>alerts.push(String(message)),rowTimers:{},addEventListener(){},
    Date:{now:()=>now},
    setTimeout:handler=>{handler();return 1;},clearTimeout(){},
    setInterval:handler=>{const id=nextInterval++;intervals.set(id,handler);return id;},clearInterval:id=>intervals.delete(id),
    fmt:seconds=>`${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`,
    beep(){},beepAction(){},markSetNeedFinish(){},Notification:notification
  };
  context.window=context;
  vm.createContext(context);
  vm.runInContext(`let activeSet=null,timerLeft=180,timerBase=180,timerId=null,activeTimerContext=null;\n${timerSource}`,context,{filename:'app.js#general-timer'});
  context.bindGeneralTimerControls();
  for(const name of Object.keys(calls)){
    const original=context[name];
    context[name]=function(...args){calls[name]++;return original.apply(context,args);};
  }
  return {
    context,timer,status,alerts,listeners,controls,secondButtons,actionButtons,intervals,calls,
    advance:milliseconds=>{now+=milliseconds;},runInterval:()=>{for(const handler of [...intervals.values()])handler();},
    state:()=>vm.runInContext('({timerLeft,timerBase,timerId,activeTimerContext})',context)
  };
}

function fire(harness,item,type='click'){
  const event={target:item,cancelable:true,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
  harness.listeners[type](event);return event;
}

function safariTap(harness,item){fire(harness,item,'touchend');fire(harness,item,'click');}

test('GT1. setTimer(45) updates the canonical timer value and DOM',()=>{
  const h=createTimerHarness();h.context.setTimer(45);
  assert.equal(h.state().timerLeft,45);assert.equal(h.timer.textContent,'00:45');
});

test('GT2. setTimer(180) updates timerBase and selected button',()=>{
  const h=createTimerHarness();h.context.setTimer(180);
  assert.equal(h.state().timerBase,180);assert.equal(h.timer.textContent,'03:00');assert.equal(h.secondButtons[3].getAttribute('aria-pressed'),'true');
});

test('GT3. start establishes one interval and decrements from endAt',()=>{
  const h=createTimerHarness();h.context.setTimer(45);h.context.startTimer();h.advance(1000);h.runInterval();
  assert.equal(h.intervals.size,1);assert.equal(h.state().timerLeft,44);assert.equal(h.timer.textContent,'00:44');
});

test('GT4. pause freezes the remaining time',()=>{
  const h=createTimerHarness();h.context.setTimer(45);h.context.startTimer();h.advance(1000);h.runInterval();h.context.pauseTimer();
  const paused=h.state().timerLeft;h.advance(3000);h.runInterval();
  assert.equal(h.intervals.size,0);assert.equal(h.state().timerLeft,paused);assert.match(h.status.textContent,/已暂停/);
});

test('GT5. resume continues from the paused remainder',()=>{
  const h=createTimerHarness();h.context.setTimer(45);h.context.startTimer();h.advance(2000);h.runInterval();h.context.pauseTimer();
  const paused=h.state().timerLeft;h.context.startTimer();h.advance(1000);h.runInterval();assert.equal(h.state().timerLeft,paused-1);
});

test('GT6. reset returns to the current timerBase',()=>{
  const h=createTimerHarness();h.context.setTimer(90);h.context.startTimer();h.advance(5000);h.runInterval();h.context.resetTimer();
  assert.equal(h.state().timerLeft,90);assert.equal(h.timer.textContent,'01:30');assert.equal(h.intervals.size,0);
});

test('GT7. endAt calibration accounts for 30 seconds in background',()=>{
  const h=createTimerHarness();h.context.setTimer(180);h.context.startTimer();h.advance(30000);h.context.tickRealTimer();
  assert.equal(h.state().timerLeft,150);assert.equal(h.timer.textContent,'02:30');
});

test('GT8. every timer control is directly actionable on touchend',()=>{
  const h=createTimerHarness();
  for(let index=0;index<h.secondButtons.length;index++){fire(h,h.secondButtons[index],'touchend');assert.equal(h.state().timerBase,[45,90,120,180,300][index]);}
  fire(h,h.actionButtons[0],'touchend');assert.equal(h.intervals.size,1);
  fire(h,h.actionButtons[1],'touchend');assert.equal(h.intervals.size,0);
  fire(h,h.actionButtons[2],'touchend');assert.equal(h.timer.textContent,'05:00');
});

test('GT9. one Safari touchend plus synthetic click executes each action exactly once',()=>{
  const permissionCalls={count:0};
  const h=createTimerHarness({notification:{permission:'granted',requestPermission:callback=>{permissionCalls.count++;callback('granted');}}});
  safariTap(h,h.secondButtons[1]);assert.equal(h.calls.setTimer,1);assert.equal(h.timer.textContent,'01:30');
  safariTap(h,h.actionButtons[0]);assert.equal(h.calls.startTimer,1);assert.equal(h.intervals.size,1);
  safariTap(h,h.actionButtons[1]);assert.equal(h.calls.pauseTimer,1);
  safariTap(h,h.actionButtons[2]);assert.equal(h.calls.resetTimer,1);
  safariTap(h,h.actionButtons[3]);assert.equal(h.calls.notifyPermission,1);assert.equal(permissionCalls.count,1);assert.equal(h.alerts.length,1);
});

test('GT10. mobile controls keep native hit testing and pressed feedback',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),css=fs.readFileSync(path.join(root,'style.css'),'utf8');
  assert.match(html,/data-general-timer-controls/);assert.match(html,/type="button" data-timer-seconds="45"/);
  assert.match(css,/\.timerControls button\{[^}]*touch-action:manipulation/);assert.doesNotMatch(css,/\.timerControls[^}]*pointer-events\s*:\s*none/);
});

test('GT11. timer controls do not write workoutLogs',()=>{
  const h=createTimerHarness(),logs=[];h.context.state={workoutLogs:logs};
  h.context.setTimer(45);h.context.startTimer();h.context.pauseTimer();h.context.resetTimer();assert.deepEqual(logs,[]);
});

test('GT12. timer controls do not create actualDate',()=>{
  const h=createTimerHarness(),state={actualDates:{}};h.context.state=state;
  h.context.setTimer(90);h.context.startTimer();h.advance(1000);h.runInterval();h.context.pauseTimer();assert.deepEqual(state.actualDates,{});
});

test('GT13. Safari notification callback and unsupported browser both give feedback',()=>{
  const supported=createTimerHarness({notification:{permission:'granted',requestPermission:callback=>{callback('granted');}}});
  supported.context.notifyPermission();assert.equal(supported.status.textContent,'提醒已开启');assert.equal(supported.alerts.at(-1),'提醒已开启。');
  const unsupported=createTimerHarness();delete unsupported.context.Notification;
  unsupported.context.notifyPermission();assert.match(unsupported.status.textContent,/不支持/);assert.match(unsupported.alerts.at(-1),/不支持/);
});

test('GT14. floating note touchcancel clears stale dragging before later timer taps',()=>{
  assert.match(appSource,/function cancelDrag\(\)\{\s*dragging=false; moved=false;/);assert.match(appSource,/addEventListener\('touchcancel',cancelDrag/);
});

test('GT15. hotfix build excludes Planner v2 production resources',()=>{
  const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.doesNotMatch(html,/planner-import-v2\.js/);assert.doesNotMatch(html,/PLANNER_IMPORT_V2/);
});
