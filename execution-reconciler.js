/* Pure reconciliation between immutable workout history and current Program execution state. */
(function(global){
  'use strict';

  function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function asArray(value){return Array.isArray(value)?value:[];}
  function asObject(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
  function text(value){return String(value===undefined||value===null?'':value).trim();}
  function datePart(value){var match=text(value).match(/^\d{4}-\d{2}-\d{2}/);return match?match[0]:'';}
  function titleOf(value){return text(value&&(value.title||value.workoutTitle||value['训练主题']||value.theme));}
  function normalized(value){
    if(typeof global.normalizeDateIdentityText==='function')return global.normalizeDateIdentityText(value);
    var result=text(value);try{result=result.normalize('NFKC');}catch(ignore){}
    return result.toLowerCase().replace(/[（]/g,'(').replace(/[）]/g,')').replace(/[\s|｜:：()【】\[\]{}\-_/\\]+/g,'');
  }
  function sourceFamily(source){source=normalized(source);if(source.indexOf('structured')>=0)return 'structured';if(source.indexOf('legacy')>=0||source.indexOf('excel')>=0||source.indexOf('import')>=0)return 'legacy';if(source.indexOf('custom')>=0)return 'custom';if(source.indexOf('builtin')>=0)return 'builtin';return source||'program';}
  function workoutSourceKey(day,index,program){
    if(text(day&&day.sourceWorkoutKey))return text(day.sourceWorkoutKey);
    if(typeof global.deriveSourceWorkoutKey==='function')return global.deriveSourceWorkoutKey(day,index,day&&day.source||program&&program.source);
    var family=sourceFamily(day&&day.source||program&&program.source),order=Number(day&&(day.sourceOrder||day.order||day['顺序']||day['顺序日']||day['序号']))||index+1;
    if(family==='structured'&&text(day&&(day.sourceWorkoutId||day.workoutId)))return 'structured:'+text(day.sourceWorkoutId||day.workoutId);
    return family+':'+order+':'+normalized(titleOf(day));
  }
  function logSourceKey(log,program){
    if(text(log&&log.sourceWorkoutKey))return text(log.sourceWorkoutKey);
    var index=Number(log&&log.planIndex),title=normalized(titleOf(log)),family=sourceFamily(log&&log.source||program&&program.source);
    if(Number.isInteger(index)&&index>=0&&title&&family==='legacy')return 'legacy:'+(index+1)+':'+title;
    return '';
  }
  function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(datePart(value));}
  function logDate(log){return datePart(log&&(log.actualDate||log.date||log.performedDate||log.completedAt||log.createdAt));}
  function setValues(value){return value===null||value===undefined?'':String(value).trim();}
  function targetValues(min,max){var values=[];if(min!==null&&min!==undefined&&min!=='')values.push(String(min));if(max!==null&&max!==undefined&&max!=='')values.push(String(max));if(values.length===2){values.push(values[0]+'-'+values[1]);values.push(values[0]+'–'+values[1]);}return values;}
  function userEdited(set,field){return asArray(set&&set.userEditedFields).indexOf(field)>=0||asArray(set&&set._userEditedFields).indexOf(field)>=0;}
  function setHasMeaningfulInput(set){
    set=set||{};
    if(text(set.weight)||Number(set.weightKg)>0||set.completed===true||text(set.note))return true;
    if(asArray(set.segments).some(function(segment){return text(segment&&segment.weight)||Number(segment&&segment.weightKg)>0||userEdited(segment,'reps')||userEdited(segment,'rir');}))return true;
    var reps=setValues(set.reps),rir=setValues(set.rir);
    if(userEdited(set,'reps')||userEdited(set,'rir')||userEdited(set,'duration'))return true;
    if(reps&&targetValues(set.targetRepsMin,set.targetRepsMax).length&&targetValues(set.targetRepsMin,set.targetRepsMax).indexOf(reps)<0)return true;
    if(rir&&targetValues(set.targetRirMin,set.targetRirMax).length&&targetValues(set.targetRirMin,set.targetRirMax).indexOf(rir)<0)return true;
    return false;
  }
  function hasMeaningfulTrainingInput(draft){
    draft=draft||{};
    if(text(draft.note)||text(draft.currentSessionNote))return true;
    return asArray(draft.mains).concat(asArray(draft.warmups)).some(function(item){return text(item&&item.note)||asArray(item&&item.sets).some(setHasMeaningfulInput);});
  }
  function countWeightedEntries(logs){var count=0;asArray(logs).forEach(function(log){asArray(log&&(log.entries||log.exercises||log.training||log.items)).forEach(function(entry){var sets=Array.isArray(entry&&entry.sets)?entry.sets:[entry];sets.forEach(function(set){if(text(set&&set.weight)||Number(set&&set.weightKg)>0)count++;});});});return count;}
  function hashWorkoutLogs(logs){var raw=JSON.stringify(asArray(logs)),hash=2166136261;for(var i=0;i<raw.length;i++){hash^=raw.charCodeAt(i);hash=Math.imul(hash,16777619);}return raw.length+':'+(hash>>>0).toString(16);}
  function shouldCreateActualDateForAction(action,details){
    if(action==='complete-set'||action==='complete-workout')return true;
    if(action!=='training-input')return false;
    details=details||{};return /^(weight|reps|rir|duration|moduleNote|sessionNote)$/.test(text(details.field))&&text(details.value)!=='';
  }
  function createStartedExecutionState(program,workoutId,date,startedAt){
    var next={actualDates:copy(asObject(program&&program.actualDates)),dateAnchors:copy(asObject(program&&program.dateAnchors)),sessionStartedAt:copy(asObject(program&&program.sessionStartedAt))};
    next.actualDates[workoutId]=date;next.dateAnchors[workoutId]=date;
    if(!next.sessionStartedAt[workoutId]||datePart(next.sessionStartedAt[workoutId].actualDate||next.sessionStartedAt[workoutId].startedAt)!==date)next.sessionStartedAt[workoutId]={startedAt:startedAt,actualDate:date};
    return next;
  }

  function buildIdentityIndex(program){
    var days=asArray(program&&program.days),byId={},byKey={};
    days.forEach(function(day,index){var entry={day:day,index:index,key:workoutSourceKey(day,index,program),title:normalized(titleOf(day))};if(day&&day.workoutId)byId[day.workoutId]=entry;(byKey[entry.key]=byKey[entry.key]||[]).push(entry);});
    return {days:days,byId:byId,byKey:byKey};
  }
  function matchLogToWorkout(program,log,indexData){
    indexData=indexData||buildIdentityIndex(program);
    var explicit=text(log&&log.sourceWorkoutKey),derived=logSourceKey(log,program),key=explicit||derived,candidates=[];
    if(key)candidates=asArray(indexData.byKey[key]);
    if(!key){
      var planIndex=Number(log&&log.planIndex),logTitle=normalized(titleOf(log));
      if(Number.isInteger(planIndex)&&planIndex>=0&&logTitle){var atIndex=indexData.days[planIndex];if(atIndex&&normalized(titleOf(atIndex))===logTitle)candidates=[indexData.byId[atIndex.workoutId]];}
    }
    candidates=candidates.filter(Boolean);
    if(candidates.length===1)return {status:'unique',workout:candidates[0].day,index:candidates[0].index,sourceWorkoutKey:candidates[0].key,method:explicit?'sourceWorkoutKey':(derived?'derivedSourceWorkoutKey':'planIndex+title')};
    if(candidates.length>1)return {status:'multiple',candidates:candidates.map(function(item){return item.day.workoutId;}),method:key?'sourceWorkoutKey':'planIndex+title'};
    var sameIndex=Number.isInteger(Number(log&&log.planIndex))&&indexData.days[Number(log.planIndex)]?indexData.days[Number(log.planIndex)].workoutId:'';
    var sameTitle=indexData.days.filter(function(day){return normalized(titleOf(day))===normalized(titleOf(log));}).map(function(day){return day.workoutId;});
    return {status:(sameIndex||sameTitle.length)?'unmapped':'unmapped',sameIndexWorkoutId:sameIndex,sameTitleWorkoutIds:sameTitle,reason:sameIndex&&sameTitle.indexOf(sameIndex)<0?'index/title 冲突':'没有可证明的联合身份'};
  }
  function uniqueDates(matches){var values={};matches.forEach(function(item){var value=logDate(item.log);if(value)values[value]=true;});return Object.keys(values).sort();}
  function addAction(list,kind,details){list.push(Object.assign({classification:kind},details));}
  function reconcileProgramExecutionState(program,workoutLogs){
    program=program||{};var logs=asArray(workoutLogs!==undefined?workoutLogs:program.workoutLogs),next=copy(program),indexData=buildIdentityIndex(program);
    next.actualDates=asObject(next.actualDates);next.dateAnchors=asObject(next.dateAnchors);next.completed=asObject(next.completed);next.currentWorkoutDrafts=asObject(next.currentWorkoutDrafts);next.sessionStartedAt=asObject(next.sessionStartedAt);
    var safeRebind=[],safeRemove=[],ambiguous=[],unchanged=[],logMatches=[],mappedByWorkout={},claimedByWorkout={};
    logs.forEach(function(log,logIndex){var match=matchLogToWorkout(program,log,indexData),item={log:log,logIndex:logIndex,match:match};logMatches.push(item);if(match.status==='unique'){(mappedByWorkout[match.workout.workoutId]=mappedByWorkout[match.workout.workoutId]||[]).push(item);}if(log&&log.workoutId)(claimedByWorkout[log.workoutId]=claimedByWorkout[log.workoutId]||[]).push(item);});
    var handledTargets={};
    Object.keys(asObject(program.actualDates)).forEach(function(workoutId){
      var actual=datePart(program.actualDates[workoutId]),entry=indexData.byId[workoutId];
      if(!entry){
        var claimed=asArray(claimedByWorkout[workoutId]).filter(function(item){return item.match.status==='unique'&&logDate(item.log)===actual;});
        if(claimed.length===1&&!next.actualDates[claimed[0].match.workout.workoutId]){var target=claimed[0].match.workout.workoutId;addAction(safeRebind,'SAFE_REBIND',{fromWorkoutId:workoutId,toWorkoutId:target,fromDate:actual,toDate:actual,reason:'旧 workoutId 的日志可唯一映射到当前 Workout',logIndexes:[claimed[0].logIndex],hadActualDate:true});delete next.actualDates[workoutId];delete next.dateAnchors[workoutId];next.actualDates[target]=actual;next.dateAnchors[target]=actual;next.completed[target]=true;handledTargets[target]=true;}
        else addAction(ambiguous,'AMBIGUOUS',{workoutId:workoutId,date:actual,reason:'actualDate 指向不存在的 Workout，且无法唯一重绑',hadActualDate:true});
        return;
      }
      var mapped=asArray(mappedByWorkout[workoutId]),dates=uniqueDates(mapped),claimedHere=asArray(claimedByWorkout[workoutId]),completed=program.completed&&program.completed[workoutId]===true,session=datePart(program.sessionStartedAt&&program.sessionStartedAt[workoutId]&&(program.sessionStartedAt[workoutId].actualDate||program.sessionStartedAt[workoutId].startedAt)),draft=program.currentWorkoutDrafts&&program.currentWorkoutDrafts[workoutId],meaningful=hasMeaningfulTrainingInput(draft),draftDate=datePart(draft&&draft.updatedAt);
      if(dates.length===1){
        if(dates[0]===actual){addAction(unchanged,'SAFE_KEEP',{workoutId:workoutId,date:actual,reason:'唯一历史日志与 actualDate 一致',logIndexes:mapped.map(function(item){return item.logIndex;}),hadActualDate:true});next.completed[workoutId]=true;handledTargets[workoutId]=true;}
        else{addAction(safeRebind,'SAFE_REBIND',{fromWorkoutId:workoutId,toWorkoutId:workoutId,fromDate:actual,toDate:dates[0],reason:'唯一历史日志提供真实训练日期',logIndexes:mapped.map(function(item){return item.logIndex;}),hadActualDate:true});next.actualDates[workoutId]=dates[0];next.dateAnchors[workoutId]=dates[0];next.completed[workoutId]=true;handledTargets[workoutId]=true;}
        return;
      }
      if(dates.length>1){addAction(ambiguous,'AMBIGUOUS',{workoutId:workoutId,date:actual,reason:'同一 Workout 存在多个不同历史训练日期',logIndexes:mapped.map(function(item){return item.logIndex;}),hadActualDate:true});return;}
      var unresolvedClaimed=claimedHere.filter(function(item){return item.match.status!=='unique'||item.match.workout.workoutId!==workoutId;});
      if(unresolvedClaimed.length){addAction(ambiguous,'AMBIGUOUS',{workoutId:workoutId,date:actual,reason:'相同旧 workoutId 存在无法安全映射的历史日志',logIndexes:unresolvedClaimed.map(function(item){return item.logIndex;}),hadActualDate:true});return;}
      if(completed){addAction(unchanged,'SAFE_KEEP',{workoutId:workoutId,date:actual,reason:'已有明确 completed 执行证据',hadActualDate:true});return;}
      if(session&&session===actual){addAction(unchanged,'SAFE_KEEP',{workoutId:workoutId,date:actual,reason:'sessionStartedAt 与 actualDate 一致',hadActualDate:true});return;}
      if(meaningful&&draftDate===actual){addAction(unchanged,'SAFE_KEEP',{workoutId:workoutId,date:actual,reason:'真实训练输入与 actualDate 同日',hadActualDate:true});return;}
      if(session||meaningful){addAction(ambiguous,'AMBIGUOUS',{workoutId:workoutId,date:actual,reason:'存在真实训练输入或开始标记，但日期证据互相冲突',hadActualDate:true});return;}
      addAction(safeRemove,'SAFE_REMOVE',{workoutId:workoutId,date:actual,reason:'未完成、无唯一日志、无开始标记且无真实训练输入',conflictingLogIndexes:claimedHere.filter(function(item){return item.match.status!=='unique'||item.match.workout.workoutId!==workoutId;}).map(function(item){return item.logIndex;}),hadActualDate:true});delete next.actualDates[workoutId];delete next.dateAnchors[workoutId];
    });
    Object.keys(mappedByWorkout).forEach(function(workoutId){
      if(handledTargets[workoutId]||next.actualDates[workoutId])return;var mapped=mappedByWorkout[workoutId],dates=uniqueDates(mapped);
      if(dates.length===1){addAction(safeRebind,'SAFE_REBIND',{fromWorkoutId:'',toWorkoutId:workoutId,fromDate:'',toDate:dates[0],reason:'唯一历史日志补回当前 Workout 的真实日期',logIndexes:mapped.map(function(item){return item.logIndex;}),hadActualDate:false});next.actualDates[workoutId]=dates[0];next.dateAnchors[workoutId]=dates[0];next.completed[workoutId]=true;}
      else if(dates.length>1)addAction(ambiguous,'AMBIGUOUS',{workoutId:workoutId,date:'',reason:'历史日志可映射，但存在多个真实日期',logIndexes:mapped.map(function(item){return item.logIndex;}),hadActualDate:false});
    });
    logMatches.forEach(function(item){if(item.match.status==='unique')next.completed[item.match.workout.workoutId]=true;});
    var currentIndex=Math.max(0,Math.min(indexData.days.length-1,Number(program.currentIndex)||0)),current=indexData.days[currentIndex],currentLogDraft=program.currentWorkoutLogDraft,staleCurrentWorkoutLogDraft=false;
    if(currentLogDraft&&current){var draftMatch=matchLogToWorkout(program,currentLogDraft,indexData);staleCurrentWorkoutLogDraft=draftMatch.status!=='unique'||draftMatch.workout.workoutId!==current.workoutId;}
    var actualClassifications=unchanged.filter(function(item){return item.hadActualDate;}).length+safeRebind.filter(function(item){return item.hadActualDate;}).length+safeRemove.filter(function(item){return item.hadActualDate;}).length+ambiguous.filter(function(item){return item.hadActualDate;}).length;
    var uniqueLogs=logMatches.filter(function(item){return item.match.status==='unique';}).length,multipleLogs=logMatches.filter(function(item){return item.match.status==='multiple';}).length,unmappedLogs=logs.length-uniqueLogs-multipleLogs;
    return {safeRebind:safeRebind,safeRemove:safeRemove,ambiguous:ambiguous,unchanged:unchanged,proposedState:next,logMatches:logMatches,staleCurrentWorkoutLogDraft:staleCurrentWorkoutLogDraft,stats:{actualDates:Object.keys(asObject(program.actualDates)).length,classifiedActualDates:actualClassifications,safeKeep:unchanged.filter(function(item){return item.hadActualDate;}).length,safeRebind:safeRebind.filter(function(item){return item.hadActualDate;}).length,safeRemove:safeRemove.filter(function(item){return item.hadActualDate;}).length,ambiguous:ambiguous.filter(function(item){return item.hadActualDate;}).length,logBackfills:safeRebind.filter(function(item){return !item.hadActualDate;}).length,logs:logs.length,uniqueLogs:uniqueLogs,unmappedLogs:unmappedLogs,multipleLogs:multipleLogs,weightedEntries:countWeightedEntries(logs),workoutLogsHash:hashWorkoutLogs(logs),staleDrafts:staleCurrentWorkoutLogDraft?1:0}};
  }

  global.hasMeaningfulTrainingInput=hasMeaningfulTrainingInput;
  global.hashWorkoutLogs=hashWorkoutLogs;
  global.countWeightedWorkoutLogEntries=countWeightedEntries;
  global.shouldCreateActualDateForAction=shouldCreateActualDateForAction;
  global.createStartedExecutionState=createStartedExecutionState;
  global.matchLogToWorkout=matchLogToWorkout;
  global.reconcileProgramExecutionState=reconcileProgramExecutionState;
})(typeof window!=='undefined'?window:globalThis);
