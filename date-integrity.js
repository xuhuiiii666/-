/* Pure Workout identity and date-state diagnostics. Never writes storage. */
(function(global){
  'use strict';

  function copy(value){return value===undefined?undefined:JSON.parse(JSON.stringify(value));}
  function asArray(value){return Array.isArray(value)?value:[];}
  function asObject(value){return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
  function text(value){return String(value===undefined||value===null?'':value).trim();}
  function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(text(value));}
  function datePart(value){var match=text(value).match(/^\d{4}-\d{2}-\d{2}/);return match?match[0]:'';}
  function workoutTitle(workout){return text(workout&&(workout.title||workout['训练主题']||workout.theme));}
  function normalizeDateIdentityText(value){
    var valueText=text(value);
    try{valueText=valueText.normalize('NFKC');}catch(ignore){}
    return valueText.toLowerCase().replace(/[（]/g,'(').replace(/[）]/g,')').replace(/[\s|｜:：()【】\[\]{}\-_/\\]+/g,'');
  }
  function sourceFamily(source){
    source=normalizeDateIdentityText(source);
    if(source.indexOf('structured')>=0)return 'structured';
    if(source.indexOf('legacy')>=0||source.indexOf('excel')>=0||source.indexOf('import')>=0)return 'legacy';
    if(source.indexOf('builtin')>=0)return 'builtin';
    if(source.indexOf('custom')>=0)return 'custom';
    return source||'program';
  }
  function deriveSourceWorkoutKey(workout,index,source){
    workout=workout||{};
    if(text(workout.sourceWorkoutKey))return text(workout.sourceWorkoutKey);
    var family=sourceFamily(workout.source||source);
    var order=Number(workout.sourceOrder||workout.order||workout['顺序']||workout['顺序日']||workout['序号'])||index+1;
    if(family==='structured'){
      var sourceId=text(workout.sourceWorkoutId||workout.workoutId);
      if(sourceId)return 'structured:'+sourceId;
    }
    if(family==='custom'&&text(workout.workoutId))return 'custom:'+text(workout.workoutId);
    return family+':'+order+':'+normalizeDateIdentityText(workoutTitle(workout));
  }
  function sameLogicalWorkout(workout,record){
    if(!workout||!record)return false;
    var workoutKey=text(workout.sourceWorkoutKey),recordKey=text(record.sourceWorkoutKey);
    if(workoutKey&&recordKey)return workoutKey===recordKey;
    var workoutName=normalizeDateIdentityText(workoutTitle(workout));
    var recordName=normalizeDateIdentityText(record.title||record.workoutTitle||record['训练主题']);
    if(workoutName&&recordName)return workoutName===recordName;
    return !!(record.workoutId&&workout.workoutId&&record.workoutId===workout.workoutId&&recordKey&&workoutKey===recordKey);
  }
  function findUniqueWorkoutForRecord(program,record){
    var days=asArray(program&&program.days),sourceKey=text(record&&record.sourceWorkoutKey),matches=[];
    if(sourceKey)matches=days.filter(function(day){return text(day.sourceWorkoutKey)===sourceKey;});
    if(matches.length===1)return matches[0];
    if(record&&record.workoutId){
      var exact=days.find(function(day){return day.workoutId===record.workoutId;});
      if(exact&&sameLogicalWorkout(exact,record))return exact;
    }
    var titleKey=normalizeDateIdentityText(record&&(record.title||record.workoutTitle||record['训练主题']));
    if(titleKey){
      matches=days.filter(function(day){return normalizeDateIdentityText(workoutTitle(day))===titleKey;});
      if(matches.length===1){
        if(record&&typeof record.planIndex==='number'&&days[record.planIndex]&&days[record.planIndex]!==matches[0])return null;
        return matches[0];
      }
    }
    return null;
  }
  function meaningfulSet(set){return !!(set&&(text(set.weight)||Number(set.weightKg)>0||text(set.reps)||text(set.rir)||text(set.duration)||set.completed));}
  function meaningfulWorkoutDraft(draft){
    if(typeof global.hasMeaningfulTrainingInput==='function')return global.hasMeaningfulTrainingInput(draft);
    return asArray(draft&&draft.mains).concat(asArray(draft&&draft.warmups)).some(function(item){return asArray(item&&item.sets).some(meaningfulSet);});
  }
  function logDate(log){return text(log&&(log.actualDate||log.date||log.completedAt)).slice(0,10);}
  function workoutIndexMap(days){var map={};days.forEach(function(day,index){if(day&&day.workoutId)map[day.workoutId]=index;});return map;}
  function trustedLogsForWorkout(program,workout){
    return asArray(program&&program.workoutLogs).filter(function(log){return findUniqueWorkoutForRecord(program,log)===workout;});
  }
  function inspectProgramDateIntegrity(program){
    program=program||{};
    var days=asArray(program.days),ids=workoutIndexMap(days),actualDates=asObject(program.actualDates),completed=asObject(program.completed),drafts=asObject(program.currentWorkoutDrafts),sessions=asObject(program.sessionStartedAt);
    var report={validActualDates:[],orphanActualDates:[],conflictingActualDates:[],staleDraftDates:[],unmatchedCompleted:[],unmatchedLogs:[],counts:{workouts:days.length,workoutLogs:asArray(program.workoutLogs).length,actualDates:Object.keys(actualDates).length}};
    var matchedLogs=new Set();
    asArray(program.workoutLogs).forEach(function(log,index){var workout=findUniqueWorkoutForRecord(program,log);if(workout)matchedLogs.add(index);else report.unmatchedLogs.push({logIndex:index,workoutId:text(log&&log.workoutId),date:logDate(log),reason:'日志无法与当前计划中的唯一 Workout 身份匹配'});});
    Object.keys(actualDates).forEach(function(workoutId){
      var date=text(actualDates[workoutId]),index=ids[workoutId],workout=index===undefined?null:days[index];
      if(!workout){report.orphanActualDates.push({workoutId:workoutId,date:date,index:-1,reason:'actualDate 指向不存在的 Workout'});return;}
      var exactLogs=asArray(program.workoutLogs).filter(function(log){return log&&log.workoutId===workoutId;});
      var trustedLogs=trustedLogsForWorkout(program,workout).filter(function(log){return !date||logDate(log)===date;});
      var conflicting=exactLogs.filter(function(log){return !sameLogicalWorkout(workout,log);});
      if(conflicting.length)report.conflictingActualDates.push({workoutId:workoutId,date:date,index:index,reason:'相同 workoutId 的历史日志标题/来源身份与当前 Workout 不一致',logCount:conflicting.length});
      var draft=drafts[workoutId],draftUpdatedDate=datePart(draft&&draft.updatedAt),sessionDate=datePart(sessions[workoutId]&&(sessions[workoutId].actualDate||sessions[workoutId].startedAt)||workout.sessionStartedAt);
      var evidence=[];
      if(completed[workoutId]===true)evidence.push('completed');
      if(trustedLogs.length)evidence.push('workoutLog');
      if(sessionDate&&(!date||sessionDate===date))evidence.push('sessionStartedAt');
      if(meaningfulWorkoutDraft(draft)&&draftUpdatedDate===date)evidence.push('currentWorkoutDraft');
      if(evidence.length)report.validActualDates.push({workoutId:workoutId,date:date,index:index,evidence:evidence});
      else report.orphanActualDates.push({workoutId:workoutId,date:date,index:index,reason:conflicting.length?'历史日志身份冲突，且没有可信执行证据':'未完成、无可信日志、无开始标记，且草稿日期不支持该 actualDate'});
      if(draft&&date&&draftUpdatedDate&&draftUpdatedDate!==date)report.staleDraftDates.push({kind:'workoutDraftDate',workoutId:workoutId,index:index,draftDate:draftUpdatedDate,actualDate:date,reason:'Workout 草稿更新时间与 actualDate 明显不一致'});
    });
    Object.keys(drafts).forEach(function(workoutId){if(ids[workoutId]===undefined)report.staleDraftDates.push({kind:'orphanWorkoutDraft',workoutId:workoutId,index:-1,reason:'currentWorkoutDrafts 指向不存在的 Workout'});});
    var currentLogDraft=program.currentWorkoutLogDraft,currentWorkout=days[Math.max(0,Math.min(days.length-1,Number(program.currentIndex)||0))];
    if(currentLogDraft){
      var matchedDraftWorkout=findUniqueWorkoutForRecord(program,currentLogDraft);
      if(!matchedDraftWorkout||!currentWorkout||matchedDraftWorkout.workoutId!==currentWorkout.workoutId){
        report.staleDraftDates.push({kind:'currentWorkoutLogDraft',workoutId:text(currentLogDraft.workoutId),index:Number(currentLogDraft.planIndex),reason:'currentWorkoutLogDraft 无法唯一匹配当前 Workout'});
      }
    }
    Object.keys(completed).forEach(function(workoutId){
      if(completed[workoutId]!==true)return;
      if(ids[workoutId]===undefined)report.unmatchedCompleted.push({workoutId:workoutId,index:-1,reason:'完成状态指向不存在的 Workout'});
      else if(!actualDates[workoutId]&&!trustedLogsForWorkout(program,days[ids[workoutId]]).length)report.unmatchedCompleted.push({workoutId:workoutId,index:ids[workoutId],reason:'完成状态没有 actualDate 或可信日志'});
    });
    report.counts.validActualDates=report.validActualDates.length;report.counts.orphanActualDates=report.orphanActualDates.length;report.counts.conflictingActualDates=report.conflictingActualDates.length;report.counts.staleDraftDates=report.staleDraftDates.length;report.counts.unmatchedCompleted=report.unmatchedCompleted.length;report.counts.unmatchedLogs=report.unmatchedLogs.length;
    return report;
  }
  function flattenWorkoutDraft(draft){
    var entries=[];
    asArray(draft&&draft.warmups).forEach(function(item){asArray(item.sets).forEach(function(set,index){entries.push(Object.assign({type:'热身',name:item.name||'',trackingName:item.trackName||item.name||'',set:index+1},copy(set)));});});
    asArray(draft&&draft.mains).forEach(function(item){asArray(item.sets).forEach(function(set,index){entries.push(Object.assign({type:'主训练',name:item.name||'',trackingName:item.trackName||item.name||'',originalName:item.originalName||item.name||'',set:index+1},copy(set)));});});
    return entries;
  }
  function deriveLastActual(program){
    var items=inspectProgramDateIntegrity(program).validActualDates.filter(function(item){return validDate(item.date);}).map(function(item){return {workoutId:item.workoutId,index:item.index,date:item.date};});
    items.sort(function(a,b){return b.date.localeCompare(a.date)||b.index-a.index;});return items[0]||null;
  }
  function repairProgramDateState(program,options){
    options=options||{};
    var source=program||{},before=inspectProgramDateIntegrity(source),reconciliation=typeof global.reconcileProgramExecutionState==='function'?global.reconcileProgramExecutionState(source,source.workoutLogs):null,next=reconciliation?reconciliation.proposedState:copy(source),removed=reconciliation?copy(reconciliation.safeRemove):[];
    next.actualDates=asObject(next.actualDates);next.dateAnchors=asObject(next.dateAnchors);
    var days=asArray(next.days),currentIndex=Math.max(0,Math.min(days.length-1,Number(next.currentIndex)||0)),current=days[currentIndex],rebuilt=false;
    if(current&&((reconciliation&&reconciliation.staleCurrentWorkoutLogDraft)||before.staleDraftDates.some(function(item){return item.kind==='currentWorkoutLogDraft';}))){
      var workoutDraft=asObject(next.currentWorkoutDrafts)[current.workoutId];
      if(workoutDraft){
        var actual=text(next.actualDates[current.workoutId]),planned=text(current.plannedDate||current.date||current['日期']),scheduled=typeof options.scheduledDateResolver==='function'?text(options.scheduledDateResolver(next,currentIndex)):planned;
        next.currentWorkoutLogDraft={workoutId:current.workoutId,sourceWorkoutKey:current.sourceWorkoutKey||'',date:actual||scheduled||planned,actualDate:actual,scheduledDate:scheduled,plannedDate:planned,planIndex:currentIndex,title:workoutTitle(current),stage:current['阶段']||'',status:'草稿',note:workoutDraft.note!==undefined?workoutDraft.note:(next.currentSessionNote||''),entries:flattenWorkoutDraft(workoutDraft)};rebuilt=true;
      }else next.currentWorkoutLogDraft=null;
    }
    var last=deriveLastActual(next);next.lastActualIndex=last?last.index:null;next.lastActualDate=last?last.date:'';
    var beforeLogHash=typeof global.hashWorkoutLogs==='function'?global.hashWorkoutLogs(source.workoutLogs):JSON.stringify(asArray(source.workoutLogs)),afterLogHash=typeof global.hashWorkoutLogs==='function'?global.hashWorkoutLogs(next.workoutLogs):JSON.stringify(asArray(next.workoutLogs));
    var beforeWeighted=typeof global.countWeightedWorkoutLogEntries==='function'?global.countWeightedWorkoutLogEntries(source.workoutLogs):null,afterWeighted=typeof global.countWeightedWorkoutLogEntries==='function'?global.countWeightedWorkoutLogEntries(next.workoutLogs):null;
    if(beforeLogHash!==afterLogHash||JSON.stringify(asArray(source.workoutLogs))!==JSON.stringify(asArray(next.workoutLogs)))throwIntegrityError('日期修复完整性失败：workoutLogs 发生变化。');
    if(beforeWeighted!==afterWeighted)throwIntegrityError('日期修复完整性失败：历史重量记录发生变化。');
    if(JSON.stringify(asArray(source.days))!==JSON.stringify(asArray(next.days)))throwIntegrityError('日期修复完整性失败：训练计划内容发生变化。');
    ['settings','currentSessionNote','noteArchive'].forEach(function(field){if(JSON.stringify(source[field])!==JSON.stringify(next[field]))throwIntegrityError('日期修复完整性失败：'+field+' 发生变化。');});
    var after=inspectProgramDateIntegrity(next);
    return {program:next,before:before,after:after,reconciliation:reconciliation,diff:{removedActualDates:removed,safeRebind:reconciliation?copy(reconciliation.safeRebind):[],ambiguous:reconciliation?copy(reconciliation.ambiguous):[],safeKeep:reconciliation?copy(reconciliation.unchanged):[],rebuiltCurrentWorkoutLogDraft:rebuilt,lastActualIndex:next.lastActualIndex,lastActualDate:next.lastActualDate,workoutLogsUnchanged:true,workoutLogsHashBefore:beforeLogHash,workoutLogsHashAfter:afterLogHash,weightedEntriesBefore:beforeWeighted,weightedEntriesAfter:afterWeighted}};
  }
  function currentWorkoutLogDraftFor(program){
    var days=asArray(program&&program.days),current=days[Math.max(0,Math.min(days.length-1,Number(program&&program.currentIndex)||0))],draft=program&&program.currentWorkoutLogDraft;
    if(!current||!draft)return null;
    return findUniqueWorkoutForRecord(program,draft)===current?draft:null;
  }
  function throwIntegrityError(message){
    if(typeof global.StateIntegrityError==='function')throw new global.StateIntegrityError(message);
    var error=new Error(message);error.name='StateIntegrityError';error.code='STATE_INTEGRITY_FAILED';throw error;
  }

  global.normalizeDateIdentityText=normalizeDateIdentityText;
  global.deriveSourceWorkoutKey=deriveSourceWorkoutKey;
  global.sameLogicalWorkout=sameLogicalWorkout;
  global.findUniqueWorkoutForRecord=findUniqueWorkoutForRecord;
  global.inspectProgramDateIntegrity=inspectProgramDateIntegrity;
  global.repairProgramDateState=repairProgramDateState;
  global.deriveLastActualState=deriveLastActual;
  global.currentWorkoutLogDraftFor=currentWorkoutLogDraftFor;
})(typeof window!=='undefined'?window:globalThis);
