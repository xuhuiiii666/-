/* Workout-log-derived exercise history and readonly history UI. */
(function(global){
  'use strict';
  var pageSize=10,currentName='',visibleCount=10;
  function esc(value){
    if(typeof global.escapeHtml==='function') return global.escapeHtml(value);
    return String(value==null?'':value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function normalized(name){
    return String(name||'').normalize('NFKC').replace(/【\s*本块增量\s*】|\{\s*本块增量\s*\}/g,'').replace(/\s+/g,'').toLowerCase();
  }
  function comparableHistoryName(name){return normalized(name).replace(/\((?:高张力|肌肥大|张力日|容量日|重点日)(?:减载)?\)/g,'');}
  function logsFrom(src){src=src||{};var logs=src.workoutLogs||src.logs||src.trainingLogs||src.history||src.completedWorkouts||[];return Array.isArray(logs)?logs:[];}
  function activeProfile(root){
    root=root||{};var profiles=root.profiles||{},profileId=root.activeProfileId;
    return profiles[profileId]||null;
  }
  function collectAllWorkoutLogs(root){
    var profile=activeProfile(root);if(!profile)return [];
    var result=[];Object.keys(profile.programs||{}).forEach(function(programId){
      var program=profile.programs[programId]||{},programName=program.name||program.sourceFileName||'未命名计划';
      logsFrom(program).forEach(function(log){result.push(Object.assign({},log,{programId:programId,programName:programName}));});
    });
    return result;
  }
  function collectProgramWorkoutLogs(root,programId){
    var profile=activeProfile(root),program=profile&&profile.programs&&profile.programs[programId];if(!program)return [];
    var programName=program.name||program.sourceFileName||'未命名计划';
    return logsFrom(program).map(function(log){return Object.assign({},log,{programId:programId,programName:programName});});
  }
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
        if(!grouped[key]) grouped[key]={date:date,workoutTitle:title,workoutIndex:workoutIndex,sourceLogIndex:li,programId:log.programId||'',programName:log.programName||'',name:rawName,originalName:item.originalName||rawName,trackName:item.trackName||item.trackingName||rawName,sets:[],note:item.note||''};
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
  function findExerciseHistoryAcrossPrograms(root,name){
    var key=normalized(name);if(!key)return [];
    var history=buildExerciseHistoryFromLogs(collectAllWorkoutLogs(root));
    var records=(history[key]||[]).slice();
    if(!records.length){var comparable=comparableHistoryName(name);Object.keys(history).forEach(function(historyKey){if(comparableHistoryName(historyKey)===comparable)records=records.concat(history[historyKey]||[]);});}
    return records.sort(function(a,b){var da=String(a.date||''),db=String(b.date||'');return da===db?(b.sourceLogIndex||0)-(a.sourceLogIndex||0):db.localeCompare(da);});
  }
  function recordsFor(name){
    var root=global.trainingTrackerState;
    if(root&&root.profiles)return findExerciseHistoryAcrossPrograms(root,name);
    var key=normalized(name),history=ensureExerciseHistory(),records=(history[key]||[]).slice();
    if(!records.length&&global.state){global.state.exerciseHistory=buildExerciseHistoryFromLogs(logsFrom(global.state));records=(global.state.exerciseHistory[key]||[]).slice();}
    return records.sort(function(a,b){var da=String(a.date||''),db=String(b.date||'');return da===db?(b.sourceLogIndex||0)-(a.sourceLogIndex||0):db.localeCompare(da);});
  }
  function getLastExercisePerformance(name){return recordsFor(name).find(function(record){return record&&record.sets&&record.sets.some(function(set){return Number(set.weightKg)>0||!!set.weight;});})||null;}
  function ordinaryExercise(exercise){
    return !!exercise&&!exercise.isWarmup&&exercise.countsAsWorkingSet!==false&&
      !/warmup|skill|technique/.test(exercise.trainingRole||'')&&
      !/功能|热身|基本功|技能/.test(exercise.section||'')&&
      !/必要时辅助/.test(entryName(exercise));
  }
  function entryName(entry){return entry.trackingName||entry.trackName||entry.name||entry.originalName||'';}
  function plainText(value){return String(value||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();}
  // Old logs lack set types. Only a unique, unchanged source prescription can prove one.
  function ordinarySetEvidence(program,log,entry){
    if(entry.segment||(entry.segments||[]).length||entry.loadAdjustmentType||!ordinaryExercise(entry))return false;
    if(entry.setType)return entry.setType==='working';
    if(!log.workoutId||!entry.target||entry.target==='动作模板')return false;
    var days=(program.days||[]).filter(function(day){return day.workoutId===log.workoutId;});
    if(days.length!==1)return false;
    var day=days[0],title=log.title||log.workoutTitle;
    if(log.sourceWorkoutKey&&log.sourceWorkoutKey!==day.sourceWorkoutKey)return false;
    if(!title||plainText(title)!==plainText(day.title||day['训练主题']))return false;
    var exercises=(day.exercises||[]).filter(function(ex){
      return ordinaryExercise(ex)&&normalized(entryName(ex))===normalized(entryName(entry))&&
        plainText(ex.line)===plainText(entry.target)&&(!entry.exerciseId||entry.exerciseId===ex.exerciseId);
    });
    if(exercises.length!==1||!/^\d+$/.test(String(entry.set||entry.setNo||'')))return false;
    var sets=(exercises[0].sets||[]).filter(function(set,index){return entry.setId?set.setId===entry.setId:Number(set.setNo||index+1)===Number(entry.set||entry.setNo);});
    return sets.length===1&&sets[0].setType==='working'&&!sets[0].loadAdjustmentType&&!(sets[0].segments||[]).length;
  }
  function getLastOrdinaryWorkingSet(root,name){
    var profile=activeProfile(root),key=normalized(name),sessions=[];
    if(!profile||!key)return null;
    Object.keys(profile.programs||{}).forEach(function(programId){
      var program=profile.programs[programId];
      logsFrom(program).forEach(function(log,index){
        if(/草稿|预览|draft|preview/i.test(log.status||'')||!logDate(log))return;
        var candidates=[];
        itemsFrom(log).forEach(function(item){
          if(item.type&&!/主训练/.test(item.type))return;
          (Array.isArray(item.sets)?item.sets:[item]).forEach(function(set,si){
            var entry=Object.assign({},item,set);delete entry.sets;
            if(normalized(entryName(entry))!==key||!ordinarySetEvidence(program,log,entry))return;
            var unit=entry.unit||'kg',weight=Number(entry.weight);
            if(entry.weight===undefined||entry.weight===null||entry.weight==='')weight=unit==='kg'?Number(entry.weightKg):NaN;
            if(!['kg','lb'].includes(unit)||!Number.isFinite(weight)||weight<=0)return;
            var setNo=Number(entry.set||entry.setNo||si+1);if(!Number.isInteger(setNo)||setNo<1)return;
            candidates.push({weight:String(weight),unit:unit,weightKg:kg(weight,unit),reps:entry.reps,rir:entry.rir,
              setNo:setNo,name:entryName(entry),exerciseId:entry.exerciseId||'',setId:entry.setId||''});
          });
        });
        if(candidates.length){
          candidates.sort(function(a,b){return b.setNo-a.setNo;});
          sessions.push(Object.assign({},candidates[0],{date:logDate(log),workoutId:log.workoutId||'',programId:programId,
            logIndex:index,sessionTime:log.completedAt||log.createdAt||'',title:log.title||log.workoutTitle||''}));
        }
      });
    });
    sessions.sort(function(a,b){return String(b.date).localeCompare(String(a.date))||String(b.sessionTime).localeCompare(String(a.sessionTime))||b.logIndex-a.logIndex||a.programId.localeCompare(b.programId);});
    return sessions[0]||null;
  }
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
    list.innerHTML=visible.length?visible.map(function(record){return '<article class="exerciseHistoryRecord"><div class="exerciseHistoryRecordHead"><b>'+esc(record.date||'日期未知')+'</b><span>'+(record.programName?esc(record.programName)+'｜':'')+(record.workoutIndex!==undefined?'#'+esc(Number(record.workoutIndex)+1)+'｜':'')+esc(record.workoutTitle||'')+'</span></div><div>'+esc((record.sets||[]).map(displaySet).join('；'))+'</div>'+(record.note?'<p>'+esc(record.note)+'</p>':'')+'</article>';}).join(''):'<div class="small">还没有这个动作的训练记录。</div>';
    if(more){more.hidden=records.length<=visibleCount;more.textContent='加载更多（剩余 '+Math.max(0,records.length-visibleCount)+' 条）';}
  }
  function openExerciseHistory(name){currentName=String(name||'');visibleCount=pageSize;var modal=document.getElementById('exerciseHistoryModal');if(modal)modal.classList.add('show');renderExerciseHistoryModal();}
  function closeExerciseHistory(){var modal=document.getElementById('exerciseHistoryModal');if(modal)modal.classList.remove('show');}
  function loadMoreExerciseHistory(){visibleCount+=pageSize;renderExerciseHistoryModal();}

  global.getBackupLogsFromState=logsFrom;
  global.collectAllWorkoutLogs=collectAllWorkoutLogs;
  global.collectProgramWorkoutLogs=collectProgramWorkoutLogs;
  global.getExerciseItemsFromLog=itemsFrom;
  global.getLogDate=logDate;
  global.getLogIndex=logIndex;
  global.hasMeaningfulSet=meaningful;
  global.buildExerciseHistoryFromLogs=buildExerciseHistoryFromLogs;
  global.ensureExerciseHistory=ensureExerciseHistory;
  global.findExerciseHistoryAcrossPrograms=findExerciseHistoryAcrossPrograms;
  global.comparableExerciseHistoryName=comparableHistoryName;
  global.getExerciseHistoryRecords=recordsFor;
  global.getLastExercisePerformance=getLastExercisePerformance;
  global.normalizeHistoryExerciseName=normalized;
  global.isOrdinaryWorkingExercise=ordinaryExercise;
  global.getLastOrdinaryWorkingSet=getLastOrdinaryWorkingSet;
  global.lastReferenceHTML=lastReferenceHTML;
  global.openExerciseHistory=openExerciseHistory;
  global.closeExerciseHistory=closeExerciseHistory;
  global.loadMoreExerciseHistory=loadMoreExerciseHistory;
})(typeof window!=='undefined'?window:globalThis);
