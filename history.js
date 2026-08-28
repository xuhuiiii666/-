/* Workout-log-derived exercise history and readonly history UI. */
(function(global){
  'use strict';
  var pageSize=10,currentName='',visibleCount=10;
  function esc(value){
    if(typeof global.escapeHtml==='function') return global.escapeHtml(value);
    return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function normalized(name){
    if(typeof global.normalizeTemplateKey==='function') return global.normalizeTemplateKey(name);
    return String(name||'').normalize?String(name||'').normalize('NFKC').trim().replace(/\s+/g,' ').replace(/（/g,'(').replace(/）/g,')').toLowerCase():String(name||'').trim().toLowerCase();
  }
  function logsFrom(src){src=src||{};var logs=src.workoutLogs||src.logs||src.trainingLogs||src.history||src.completedWorkouts||[];return Array.isArray(logs)?logs:[];}
  function itemsFrom(log){var items=(log&&(log.entries||log.exercises||log.training||log.items))||[];return Array.isArray(items)?items:[];}
  function logDate(log){return (log&&(log.actualDate||log.date||log.performedDate||log.completedAt||log.createdAt))||'';}
  function logIndex(log){if(!log)return undefined;if(typeof log.planIndex==='number')return log.planIndex;if(typeof log.index==='number')return log.index;return log.workoutIndex;}
  function kg(weight,unit){if(typeof global.weightToKg==='function')return global.weightToKg(weight,unit);var n=Number(weight)||0;return unit==='lb'?n*0.45359237:n;}
  function estimated(weight,reps){if(typeof global.e1rm==='function')return global.e1rm(weight,reps);var w=Number(weight)||0,r=Number(reps)||0;return w&&r?w*(1+r/30):0;}
  function meaningful(set){return !!(set&&(set.weight||set.reps||set.rir||set.duration||set.note));}
  function buildExerciseHistoryFromLogs(workoutLogs){
    var history={};
    (workoutLogs||[]).forEach(function(log,li){
      var date=logDate(log),title=(log&&(log.title||log.workoutTitle||log['训练主题']))||'',workoutIndex=logIndex(log),grouped={};
      itemsFrom(log).forEach(function(item){
        if(item.type&&!/主训练/.test(String(item.type))) return;
        var rawName=item.trackingName||item.trackName||item.name||item.originalName,key=normalized(rawName);if(!key)return;
        if(!grouped[key]) grouped[key]={date:date,workoutTitle:title,workoutIndex:workoutIndex,sourceLogIndex:li,name:rawName,originalName:item.originalName||rawName,trackName:item.trackName||item.trackingName||rawName,sets:[],note:item.note||''};
        var itemSets=Array.isArray(item.sets)?item.sets:[item];
        itemSets.forEach(function(set,index){
          set=set||{};var weightKg=Number(set.weightKg||kg(set.weight,set.unit||'kg')||0);
          var value={set:set.set||set.setNo||set.index||set.setIndex||index+1,round:set.round||'',segment:set.segment||'',segmentLabel:set.segmentLabel||'',segmentName:set.segmentName||'',weight:set.weight||'',unit:set.unit||'kg',weightKg:Math.round(weightKg*10)/10,reps:set.reps||'',rir:set.rir||set.RIR||'',duration:set.duration||'',rest:set.rest||'',note:set.note||item.note||'',e1rm:set.e1rm||Math.round(estimated(weightKg,set.reps)*10)/10};
          if(meaningful(value)) grouped[key].sets.push(value);
        });
      });
      Object.keys(grouped).forEach(function(key){if(!grouped[key].sets.length)return;(history[key]=history[key]||[]).push(grouped[key]);});
    });
    Object.keys(history).forEach(function(key){history[key].sort(function(a,b){var da=String(a.date||''),db=String(b.date||'');return da===db?(a.sourceLogIndex||0)-(b.sourceLogIndex||0):da.localeCompare(db);});});
    return history;
  }
  function ensureExerciseHistory(){
    var state=global.state||{};state.workoutLogs=logsFrom(state);
    if(state.workoutLogs.length) state.exerciseHistory=buildExerciseHistoryFromLogs(state.workoutLogs);
    else if(!state.exerciseHistory||!Object.keys(state.exerciseHistory).length) state.exerciseHistory={};
    return state.exerciseHistory||{};
  }
  function recordsFor(name){
    var key=normalized(name),history=ensureExerciseHistory(),records=(history[key]||[]).slice();
    if(!records.length&&global.state){global.state.exerciseHistory=buildExerciseHistoryFromLogs(logsFrom(global.state));records=(global.state.exerciseHistory[key]||[]).slice();}
    return records.sort(function(a,b){var da=String(a.date||''),db=String(b.date||'');return da===db?(b.sourceLogIndex||0)-(a.sourceLogIndex||0):db.localeCompare(da);});
  }
  function getLastExercisePerformance(name){return recordsFor(name).find(function(record){return record&&record.sets&&record.sets.some(function(set){return Number(set.weightKg)>0||!!set.weight;});})||null;}
  function displaySet(set){
    var weight=set.weight?String(set.weight)+(set.unit||'kg'):(set.duration?set.duration+'s':'-');
    return (set.set?('第'+set.set+'组 '):'')+weight+(set.reps?('×'+set.reps):'')+(set.rir?(' RIR '+set.rir):'');
  }
  function lastReferenceHTML(name){
    var record=getLastExercisePerformance(name),button='<button type="button" class="historyLink" onclick="openExerciseHistory(decodeURIComponent(\''+encodeURIComponent(String(name||''))+'\'))">查看历史</button>';
    if(!record) return '<div class="lastRef"><b>上次同名：</b>暂无记录 '+button+'</div>';
    var entries=(record.sets||[]).slice(0,(record.sets||[]).some(function(set){return !!set.segment;})?16:5);
    var parts=entries.map(displaySet),best=Math.max.apply(null,entries.map(function(set){return set.e1rm||estimated(set.weightKg||kg(set.weight,set.unit||'kg'),set.reps)||0;}));
    var e1=best&&isFinite(best)?('｜最高e1RM '+Math.round(best*10)/10):'';
    return '<div class="lastRef"><b>上次同名：</b>'+esc(record.date||'')+'｜'+esc(parts.join('；'))+esc(e1)+' '+button+'</div>';
  }
  function renderExerciseHistoryModal(){
    var modal=global.document&&document.getElementById('exerciseHistoryModal'),list=global.document&&document.getElementById('exerciseHistoryList'),title=global.document&&document.getElementById('exerciseHistoryTitle'),more=global.document&&document.getElementById('exerciseHistoryMore');if(!modal||!list)return;
    var records=recordsFor(currentName),visible=records.slice(0,visibleCount);if(title)title.textContent=currentName+'｜训练历史';
    list.innerHTML=visible.length?visible.map(function(record){return '<article class="exerciseHistoryRecord"><div class="exerciseHistoryRecordHead"><b>'+esc(record.date||'日期未知')+'</b><span>'+(record.workoutIndex!==undefined?'#'+esc(Number(record.workoutIndex)+1)+'｜':'')+esc(record.workoutTitle||'')+'</span></div><div>'+esc((record.sets||[]).map(displaySet).join('；'))+'</div>'+(record.note?'<p>'+esc(record.note)+'</p>':'')+'</article>';}).join(''):'<div class="small">还没有这个动作的训练记录。</div>';
    if(more){more.hidden=records.length<=visibleCount;more.textContent='加载更多（剩余 '+Math.max(0,records.length-visibleCount)+' 条）';}
  }
  function openExerciseHistory(name){currentName=String(name||'');visibleCount=pageSize;var modal=document.getElementById('exerciseHistoryModal');if(modal)modal.classList.add('show');renderExerciseHistoryModal();}
  function closeExerciseHistory(){var modal=document.getElementById('exerciseHistoryModal');if(modal)modal.classList.remove('show');}
  function loadMoreExerciseHistory(){visibleCount+=pageSize;renderExerciseHistoryModal();}

  global.getBackupLogsFromState=logsFrom;
  global.getExerciseItemsFromLog=itemsFrom;
  global.getLogDate=logDate;
  global.getLogIndex=logIndex;
  global.hasMeaningfulSet=meaningful;
  global.buildExerciseHistoryFromLogs=buildExerciseHistoryFromLogs;
  global.ensureExerciseHistory=ensureExerciseHistory;
  global.getExerciseHistoryRecords=recordsFor;
  global.getLastExercisePerformance=getLastExercisePerformance;
  global.lastReferenceHTML=lastReferenceHTML;
  global.openExerciseHistory=openExerciseHistory;
  global.closeExerciseHistory=closeExerciseHistory;
  global.loadMoreExerciseHistory=loadMoreExerciseHistory;
})(typeof window!=='undefined'?window:globalThis);
