/* training-tracker persistent state and backup boundary. */
(function(global){
  'use strict';

  var ROOT_KEY='training-tracker-state';
  var PRE_V6_BACKUP_KEY='training-tracker-state-pre-v6-backup';
  var SCHEMA_VERSION=6;
  var DEFAULT_PROFILE_ID='profile_default';
  var LEGACY_KEY='xuhui_training_v2_dailygrid';
  var LEGACY_PLAN_KEY=LEGACY_KEY+'_importedPlan';
  var LEGACY_WARMUP_KEY=LEGACY_KEY+'_importedWarmups';
  var LEGACY_KEYS=[LEGACY_KEY,LEGACY_PLAN_KEY,LEGACY_WARMUP_KEY,LEGACY_KEY+'_importerMigrated_v3','training_warmup_collapsed'];
  var runtimeBuiltinWarmups=[];

  function copy(value){
    if(value===undefined) return undefined;
    return JSON.parse(JSON.stringify(value));
  }
  function nowIso(){ return new Date().toISOString(); }
  function makeId(prefix){
    var cryptoObj=global.crypto;
    if(cryptoObj&&typeof cryptoObj.randomUUID==='function') return prefix+'_'+cryptoObj.randomUUID();
    return prefix+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
  }
  function asArray(value){ return Array.isArray(value)?value:[]; }
  function asObject(value){ return value&&typeof value==='object'&&!Array.isArray(value)?value:{}; }
  function utf8Bytes(value){
    var text=String(value===undefined||value===null?'':value);
    try{if(typeof Blob==='function'){var blob=new Blob([text]);if(typeof blob.size==='number')return blob.size;}}catch(e){}
    try{return encodeURIComponent(text).replace(/%[0-9A-F]{2}|./gi,'x').length;}catch(e){return text.length*2;}
  }
  function isStorageQuotaError(error){
    if(!error)return false;
    var name=String(error.name||''),message=String(error.message||error),code=Number(error.code)||0;
    return name==='QuotaExceededError'||name==='NS_ERROR_DOM_QUOTA_REACHED'||code===22||code===1014||/quota|storage space|存储空间/i.test(message);
  }
  function StorageQuotaError(message,details){
    this.name='StorageQuotaError';this.code='STORAGE_QUOTA_EXCEEDED';this.message=message||'浏览器本地存储空间不足。';this.details=details||{};
    if(Error.captureStackTrace)Error.captureStackTrace(this,StorageQuotaError);
  }
  StorageQuotaError.prototype=Object.create(Error.prototype);
  StorageQuotaError.prototype.constructor=StorageQuotaError;

  function normalizeSet(set,index){
    var next=Object.assign({},asObject(set));
    next.setId=next.setId||makeId('set');
    next.setNo=Number(next.setNo||next.set||index+1)||index+1;
    if(next.weight===undefined) next.weight='';
    next.unit=next.unit||'kg';
    if(next.weightKg===undefined) next.weightKg=0;
    if(next.reps===undefined) next.reps='';
    if(next.rir===undefined) next.rir='';
    if(next.duration===undefined) next.duration='';
    next.rest=Number(next.rest||90)||90;
    if(next.note===undefined) next.note='';
    next.completed=!!next.completed;
    next.timerState=next.timerState||'idle';
    delete next.intervalId;
    if(typeof global.normalizeSetPrescriptionEntity==='function') next=global.normalizeSetPrescriptionEntity(next,index,{});
    return next;
  }

  function normalizeExercise(exercise,index){
    var next=Object.assign({},asObject(exercise));
    next.exerciseId=next.exerciseId||next.id||makeId('exercise');
    next.name=next.name||next.trackingName||next.originalName||('训练动作 '+(index+1));
    next.trackingName=next.trackingName||next.trackName||next.name;
    next.originalName=next.originalName||next.name;
    if(typeof global.normalizeExerciseWithPrescription==='function') next=global.normalizeExerciseWithPrescription(next);
    next.sets=asArray(next.sets).map(function(set,setIndex){
      var normalized=normalizeSet(set,setIndex);
      return typeof global.normalizeSetPrescriptionEntity==='function'?global.normalizeSetPrescriptionEntity(normalized,setIndex,next.prescription):normalized;
    });
    next.setCount=next.sets.length||Number(next.setCount)||1;
    return next;
  }

  function normalizeWorkout(day,index,programId,source){
    var next=Object.assign({},asObject(day));
    next.workoutId=next.workoutId||next.id||makeId('workout');
    next.source=next.source||source||'imported';
    next.title=next.title||next['训练主题']||next.theme||('第'+(index+1)+'练');
    next['训练主题']=next['训练主题']||next.title;
    next.createdAt=next.createdAt||nowIso();
    next.updatedAt=next.updatedAt||next.createdAt;
    next.exercises=asArray(next.exercises).map(function(exercise,exerciseIndex){return normalizeExercise(exercise,exerciseIndex);});
    return next;
  }

  function normalizeProgram(program,defaults){
    defaults=defaults||{};
    var next=Object.assign({},asObject(program));
    next.programId=next.programId||defaults.programId||makeId('program');
    next.name=next.name||defaults.name||'我的训练计划';
    next.source=next.source||defaults.source||'custom';
    next.sourceFileName=next.sourceFileName||defaults.sourceFileName||'';
    var days=next.days||next.plan||defaults.days||[];
    next.days=asArray(days).map(function(day,index){return normalizeWorkout(day,index,next.programId,next.source);});
    var logs=next.workoutLogs||next.logs||next.trainingLogs||next.history||next.completedWorkouts||[];
    next.workoutLogs=asArray(logs);
    delete next.plan;delete next.logs;delete next.trainingLogs;delete next.history;delete next.completedWorkouts;
    next.actualDates=asObject(next.actualDates);
    next.dateAnchors=asObject(next.dateAnchors);
    next.completed=asObject(next.completed);
    next.currentWorkoutDrafts=asObject(next.currentWorkoutDrafts);
    next.currentWorkoutLogDraft=next.currentWorkoutLogDraft||null;
    next.currentIndex=Math.max(0,Math.min(next.days.length?next.days.length-1:0,Number(next.currentIndex)||0));
    if(next.currentWorkoutId){
      var idIndex=next.days.findIndex(function(day){return day.workoutId===next.currentWorkoutId;});
      if(idIndex>=0)next.currentIndex=idIndex;
    }
    next.currentWorkoutId=(next.days[next.currentIndex]&&next.days[next.currentIndex].workoutId)||next.currentWorkoutId||'';
    next.selectedCalendarIndex=Number(next.selectedCalendarIndex!==undefined?next.selectedCalendarIndex:next.currentIndex)||0;
    next.settings=Object.assign({mainRest:180,assistRest:90},asObject(next.settings));
    next.customWarmups=asObject(next.customWarmups);
    next.exerciseHistory=asObject(next.exerciseHistory);
    next.currentSessionNote=next.currentSessionNote!==undefined?next.currentSessionNote:(next.draftNote||next.quickNote||'');
    next.noteArchive=asArray(next.noteArchive);
    next.keepNoteForNext=!!next.keepNoteForNext;
    next.endReminderFlags=asObject(next.endReminderFlags);
    ['actualDates','dateAnchors','completed','currentWorkoutDrafts'].forEach(function(field){
      var map=next[field]||{};
      Object.keys(map).forEach(function(key){
        if(!/^\d+$/.test(key)||!next.days[Number(key)]) return;
        var stableKey=next.days[Number(key)].workoutId;
        if(map[stableKey]===undefined) map[stableKey]=map[key];
        delete map[key];
      });
    });
    Object.keys(next.customWarmups).forEach(function(key){
      var match=key.match(/^idx_(\d+)$/);if(!match||!next.days[Number(match[1])])return;
      var stableKey='workout_'+next.days[Number(match[1])].workoutId;
      if(next.customWarmups[stableKey]===undefined)next.customWarmups[stableKey]=next.customWarmups[key];
      delete next.customWarmups[key];
    });
    next.createdAt=next.createdAt||nowIso();
    next.updatedAt=next.updatedAt||next.createdAt;
    return next;
  }

  function attachCompatibility(program,profile){
    if(!program||!profile) return program;
    function alias(name,getter,setter){
      try{Object.defineProperty(program,name,{configurable:true,enumerable:false,get:getter,set:setter});}catch(e){}
    }
    alias('logs',function(){return program.workoutLogs;},function(value){program.workoutLogs=asArray(value);});
    alias('exerciseTemplates',function(){return profile.exerciseTemplates;},function(value){profile.exerciseTemplates=asArray(value);});
    alias('warmupTemplates',function(){return profile.warmupTemplates;},function(value){profile.warmupTemplates=asArray(value);});
    alias('warmupActionTemplates',function(){return profile.warmupActionTemplates;},function(value){profile.warmupActionTemplates=asArray(value);});
    alias('rmRecords',function(){return profile.rmRecords;},function(value){profile.rmRecords=asArray(value);});
    return program;
  }

  function normalizeRoot(root,builtinPlan,builtinWarmups,options){
    options=options||{};
    var allowDefault=options.allowDefault===true;
    var next=Object.assign({},asObject(root));
    next.schemaVersion=SCHEMA_VERSION;
    next.activeProfileId=next.activeProfileId||DEFAULT_PROFILE_ID;
    next.profiles=asObject(next.profiles);
    if(!next.profiles[next.activeProfileId]&&allowDefault){
      next.profiles[next.activeProfileId]={profileId:next.activeProfileId,name:'默认档案',programs:{},exerciseTemplates:[],warmupTemplates:[],warmupActionTemplates:[],rmRecords:[]};
    }
    Object.keys(next.profiles).forEach(function(profileId){
      var profile=next.profiles[profileId]=Object.assign({profileId:profileId,name:'训练档案'},asObject(next.profiles[profileId]));
      profile.programs=asObject(profile.programs);
      profile.exerciseTemplates=asArray(profile.exerciseTemplates);
      profile.warmupTemplates=asArray(profile.warmupTemplates);
      profile.warmupActionTemplates=asArray(profile.warmupActionTemplates);
      profile.rmRecords=asArray(profile.rmRecords);
      Object.keys(profile.programs).forEach(function(programId){
        var normalized=normalizeProgram(profile.programs[programId],{programId:programId});
        profile.programs[normalized.programId]=normalized;
        if(normalized.programId!==programId) delete profile.programs[programId];
      });
    });
    var activeProfile=next.profiles[next.activeProfileId];
    if(!activeProfile) throw new Error('状态迁移失败：找不到当前训练档案。');
    next.activeProgramId=next.activeProgramId||Object.keys(activeProfile.programs)[0]||'';
    if(!next.activeProgramId||!activeProfile.programs[next.activeProgramId]){
      if(!allowDefault) throw new Error('状态迁移失败：找不到当前训练计划。');
      var sample=normalizeProgram({}, {name:'示例训练计划',source:'builtin',days:copy(builtinPlan||[])});
      activeProfile.programs[sample.programId]=sample;
      next.activeProgramId=sample.programId;
    }
    next.ui=asObject(next.ui);
    next.builtinWarmups=asArray(next.builtinWarmups&&next.builtinWarmups.length?next.builtinWarmups:copy(builtinWarmups||[]));
    next.updatedAt=nowIso();
    return next;
  }

  function migrateLegacy(builtinPlan,builtinWarmups){
    var legacy={};
    var importedPlan=null;
    var importedWarmups=null;
    try{legacy=JSON.parse(localStorage.getItem(LEGACY_KEY)||'{}')||{};}catch(e){legacy={};}
    try{importedPlan=JSON.parse(localStorage.getItem(LEGACY_PLAN_KEY)||'null');}catch(e){importedPlan=null;}
    try{importedWarmups=JSON.parse(localStorage.getItem(LEGACY_WARMUP_KEY)||'null');}catch(e){importedWarmups=null;}
    var hasLegacy=Object.keys(legacy).length>0||Array.isArray(importedPlan);
    var plan=Array.isArray(importedPlan)&&importedPlan.length?importedPlan:(Array.isArray(legacy.plan)&&legacy.plan.length?legacy.plan:builtinPlan);
    var source=Array.isArray(importedPlan)&&importedPlan.length?'legacy-import':'builtin';
    var program=normalizeProgram(Object.assign({},legacy,{days:copy(plan)}),{name:source==='builtin'?'示例训练计划':'迁移的训练计划',source:source});
    var profile={profileId:DEFAULT_PROFILE_ID,name:'默认档案',programs:{},exerciseTemplates:asArray(legacy.exerciseTemplates),warmupTemplates:asArray(legacy.warmupTemplates),warmupActionTemplates:asArray(legacy.warmupActionTemplates),rmRecords:asArray(legacy.rmRecords)};
    profile.programs[program.programId]=program;
    var profiles={};profiles[DEFAULT_PROFILE_ID]=profile;
    return normalizeRoot({activeProfileId:DEFAULT_PROFILE_ID,activeProgramId:program.programId,profiles:profiles,ui:{},builtinWarmups:copy(importedWarmups||builtinWarmups||[]),migratedFromLegacy:hasLegacy?nowIso():''},builtinPlan,builtinWarmups,{allowDefault:!hasLegacy});
  }

  function getProgramLogs(program){return asArray(program&&(program.workoutLogs||program.logs||program.trainingLogs||program.history||program.completedWorkouts));}
  function getLogEntries(log){return asArray(log&&(log.entries||log.exercises||log.training||log.items));}
  function countDraftSets(program){
    var total=0,drafts=asObject(program&&program.currentWorkoutDrafts);
    Object.keys(drafts).forEach(function(key){
      var draft=asObject(drafts[key]);
      asArray(draft.mains).concat(asArray(draft.warmups)).forEach(function(item){total+=asArray(item&&item.sets).length;});
    });
    return total;
  }
  function collectStateIntegrityStats(root){
    var stats={profiles:0,programs:0,workouts:0,workoutLogs:0,historyEntries:0,weightedEntries:0,exerciseHistory:0,exerciseTemplates:0,warmupTemplates:0,currentWorkoutDrafts:0,currentDraftSets:0};
    Object.keys(asObject(root&&root.profiles)).forEach(function(profileId){
      stats.profiles++;
      var profile=root.profiles[profileId]||{};
      stats.exerciseTemplates+=asArray(profile.exerciseTemplates).length;
      stats.warmupTemplates+=asArray(profile.warmupTemplates).length+asArray(profile.warmupActionTemplates).length;
      Object.keys(asObject(profile.programs)).forEach(function(programId){
        var program=profile.programs[programId]||{},logs=getProgramLogs(program);
        stats.programs++;stats.workouts+=asArray(program.days||program.plan).length;stats.workoutLogs+=logs.length;stats.currentWorkoutDrafts+=Object.keys(asObject(program.currentWorkoutDrafts)).length;stats.currentDraftSets+=countDraftSets(program);stats.exerciseHistory+=Object.keys(asObject(program.exerciseHistory)).length;
        logs.forEach(function(log){getLogEntries(log).forEach(function(entry){stats.historyEntries++;if(entry&&(entry.weight!==undefined&&String(entry.weight)!==''||Number(entry.weightKg)>0))stats.weightedEntries++;});});
      });
    });
    return stats;
  }
  function historyPayload(root){
    var payload=[];
    Object.keys(asObject(root&&root.profiles)).sort().forEach(function(profileId){
      var profile=root.profiles[profileId]||{};
      Object.keys(asObject(profile.programs)).sort().forEach(function(programId){payload.push({profileId:profileId,programId:programId,logs:copy(getProgramLogs(profile.programs[programId]))});});
    });
    return payload;
  }
  function migrationIdentity(root){
    var programs={};
    Object.keys(asObject(root&&root.profiles)).forEach(function(profileId){
      var profile=root.profiles[profileId]||{};
      Object.keys(asObject(profile.programs)).forEach(function(programId){var program=profile.programs[programId]||{};programs[profileId+'::'+programId]={currentWorkoutId:program.currentWorkoutId||'',days:asArray(program.days||program.plan).map(function(day){return {workoutId:day&&day.workoutId||'',title:day&&(day.title||day['训练主题'])||''};})};});
    });
    return {activeProfileId:root&&root.activeProfileId||'',activeProgramId:root&&root.activeProgramId||'',programs:programs};
  }
  function validateMigratedState(before,after){
    if(!after||after.schemaVersion!==SCHEMA_VERSION) throw new Error('状态迁移失败：Schema 版本无效。');
    var beforeStats=collectStateIntegrityStats(before),afterStats=collectStateIntegrityStats(after);
    Object.keys(beforeStats).forEach(function(field){if(afterStats[field]!==beforeStats[field])throw new Error('状态迁移失败：'+field+' 数量发生变化（'+beforeStats[field]+' → '+afterStats[field]+'）。');});
    var beforeId=migrationIdentity(before),afterId=migrationIdentity(after);
    if(beforeId.activeProfileId!==afterId.activeProfileId||beforeId.activeProgramId!==afterId.activeProgramId) throw new Error('状态迁移失败：当前训练计划发生变化。');
    Object.keys(beforeId.programs).forEach(function(key){
      if(!afterId.programs[key]) throw new Error('状态迁移失败：训练计划丢失 '+key+'。');
      if(beforeId.programs[key].currentWorkoutId&&beforeId.programs[key].currentWorkoutId!==afterId.programs[key].currentWorkoutId) throw new Error('状态迁移失败：当前训练日发生变化 '+key+'。');
      var beforeDays=beforeId.programs[key].days,afterDays=afterId.programs[key].days;
      if(beforeDays.length!==afterDays.length) throw new Error('状态迁移失败：训练数量发生变化 '+key+'。');
      beforeDays.forEach(function(day,index){
        var migratedDay=afterDays[index];
        if(!migratedDay||day.title!==migratedDay.title||(day.workoutId&&day.workoutId!==migratedDay.workoutId)) throw new Error('状态迁移失败：训练顺序发生变化 '+key+'。');
      });
    });
    if(JSON.stringify(historyPayload(before))!==JSON.stringify(historyPayload(after))) throw new Error('状态迁移失败：历史训练日志发生变化。');
    return {before:beforeStats,after:afterStats};
  }
  function migrateRootTransaction(raw,builtinPlan,builtinWarmups){
    var source=copy(raw);
    var migrated=normalizeRoot(copy(raw),builtinPlan,builtinWarmups,{allowDefault:false});
    migrated.migrationIntegrity=validateMigratedState(source,migrated);
    migrated.migratedToV6At=migrated.migratedToV6At||nowIso();
    return migrated;
  }

  function removeFields(target,fields){fields.forEach(function(field){delete target[field];});}
  function compactState(root,options){
    options=options||{};
    var compact=copy(root)||{};
    removeFields(compact,['rawWorkbook','rawRows','previewRows','importPreview','lastImportPreview','parsedPlan','normalizedDays','sourceRows']);
    Object.keys(asObject(compact.profiles)).forEach(function(profileId){
      var profile=compact.profiles[profileId]||{};
      Object.keys(asObject(profile.programs)).forEach(function(programId){
        var program=profile.programs[programId]||{};
        removeFields(program,['plan','logs','trainingLogs','history','completedWorkouts','exerciseHistory','rawWorkbook','rawRows','previewRows','importPreview','lastImportPreview','parsedPlan','normalizedDays','sourceRows']);
      });
    });
    var builtin=options.builtinWarmups||runtimeBuiltinWarmups;
    if(compact.builtinWarmups&&builtin&&JSON.stringify(compact.builtinWarmups)===JSON.stringify(builtin)) delete compact.builtinWarmups;
    return compact;
  }
  function criticalStatePayload(root){
    var result={activeProfileId:root&&root.activeProfileId||'',activeProgramId:root&&root.activeProgramId||'',profiles:{}};
    Object.keys(asObject(root&&root.profiles)).sort().forEach(function(profileId){
      var profile=root.profiles[profileId]||{},target={exerciseTemplates:copy(asArray(profile.exerciseTemplates)),warmupTemplates:copy(asArray(profile.warmupTemplates)),warmupActionTemplates:copy(asArray(profile.warmupActionTemplates)),rmRecords:copy(asArray(profile.rmRecords)),programs:{}};
      Object.keys(asObject(profile.programs)).sort().forEach(function(programId){
        var program=profile.programs[programId]||{};
        target.programs[programId]={days:copy(asArray(program.days||program.plan)),workoutLogs:copy(getProgramLogs(program)),currentWorkoutId:program.currentWorkoutId||'',currentIndex:Number(program.currentIndex)||0,currentWorkoutDrafts:copy(asObject(program.currentWorkoutDrafts)),actualDates:copy(asObject(program.actualDates)),dateAnchors:copy(asObject(program.dateAnchors)),completed:copy(asObject(program.completed)),currentSessionNote:program.currentSessionNote||'',noteArchive:copy(asArray(program.noteArchive))};
      });
      result.profiles[profileId]=target;
    });
    return result;
  }
  function validateCompactedState(before,after){
    if(JSON.stringify(criticalStatePayload(before))!==JSON.stringify(criticalStatePayload(after))) throw new Error('状态压缩失败：关键训练数据发生变化。');
    var beforeStats=collectStateIntegrityStats(before),afterStats=collectStateIntegrityStats(after);
    ['profiles','programs','workouts','workoutLogs','historyEntries','weightedEntries','exerciseTemplates','warmupTemplates','currentWorkoutDrafts','currentDraftSets'].forEach(function(field){
      if(beforeStats[field]!==afterStats[field])throw new Error('状态压缩失败：'+field+' 数量发生变化（'+beforeStats[field]+' → '+afterStats[field]+'）。');
    });
    return {before:beforeStats,after:afterStats};
  }
  function stateStorageBreakdown(root){
    var duplicateBytes=0,historyBytes=0,staticRawBytes=0,programBytes=0;
    Object.keys(asObject(root&&root.profiles)).forEach(function(profileId){
      var profile=root.profiles[profileId]||{};
      Object.keys(asObject(profile.programs)).forEach(function(programId){
        var program=profile.programs[programId]||{};programBytes+=utf8Bytes(JSON.stringify(program.days||program.plan||[]))+utf8Bytes(JSON.stringify(getProgramLogs(program)));
        ['plan','logs','trainingLogs','history','completedWorkouts'].forEach(function(field){if(program[field]!==undefined)duplicateBytes+=utf8Bytes(JSON.stringify(program[field]));});
        historyBytes+=utf8Bytes(JSON.stringify(program.exerciseHistory||{}));
        ['rawWorkbook','rawRows','previewRows','importPreview','lastImportPreview','parsedPlan','normalizedDays','sourceRows'].forEach(function(field){if(program[field]!==undefined)staticRawBytes+=utf8Bytes(JSON.stringify(program[field]));});
      });
    });
    ['builtinWarmups','rawWorkbook','rawRows','previewRows','importPreview','lastImportPreview','parsedPlan','normalizedDays','sourceRows'].forEach(function(field){if(root&&root[field]!==undefined)staticRawBytes+=utf8Bytes(JSON.stringify(root[field]));});
    return {programDataBytes:programBytes,duplicateAliasBytes:duplicateBytes,exerciseHistoryBytes:historyBytes,staticRawBytes:staticRawBytes};
  }

  function getActiveProfile(root){
    root=root||global.trainingTrackerState;
    return root&&root.profiles&&root.profiles[root.activeProfileId]||null;
  }
  function getActiveProgram(root){
    root=root||global.trainingTrackerState;
    var profile=getActiveProfile(root);
    return profile&&profile.programs&&profile.programs[root.activeProgramId]||null;
  }
  function syncProgram(program){
    program=program||getActiveProgram();
    if(!program) return program;
    if(global.state===program&&Array.isArray(global.PLAN)){
      program.days=global.PLAN.map(function(day,index){return normalizeWorkout(day,index,program.programId,program.source);});
      global.PLAN=program.days;
      program.currentIndex=Math.max(0,Math.min(program.days.length?program.days.length-1:0,Number(program.currentIndex)||0));
      program.currentWorkoutId=(program.days[program.currentIndex]&&program.days[program.currentIndex].workoutId)||program.currentWorkoutId||'';
    }
    program.updatedAt=nowIso();
    return program;
  }
  function saveRoot(root,options){
    options=options||{};
    root=root||global.trainingTrackerState;
    if(!root) return null;
    if(!options.skipSync)syncProgram(getActiveProgram(root));
    root.schemaVersion=SCHEMA_VERSION;
    root.updatedAt=nowIso();
    var compact=compactState(root,{builtinWarmups:runtimeBuiltinWarmups});
    validateCompactedState(root,compact);
    var serialized=JSON.stringify(compact);
    try{
      var storedRaw=localStorage.getItem(ROOT_KEY);
      if(storedRaw&&!localStorage.getItem(PRE_V6_BACKUP_KEY)){
        var storedVersion=0;
        try{storedVersion=Number(JSON.parse(storedRaw).schemaVersion)||0;}catch(ignore){}
        if(storedVersion>0&&storedVersion<SCHEMA_VERSION)localStorage.setItem(PRE_V6_BACKUP_KEY,storedRaw);
      }
      localStorage.setItem(ROOT_KEY,serialized);
    }
    catch(error){
      if(isStorageQuotaError(error))throw new StorageQuotaError('浏览器本地存储空间不足，训练数据没有写入。',{attemptedBytes:utf8Bytes(serialized),usage:estimateStorageUsage()});
      throw error;
    }
    return root;
  }
  function saveRootCandidate(root){saveRoot(root,{skipSync:true});bindRuntime(root);return root;}
  function bindRuntime(root){
    root=root||global.trainingTrackerState;
    var profile=getActiveProfile(root);
    var program=attachCompatibility(getActiveProgram(root),profile);
    global.trainingTrackerState=root;
    global.state=program;
    global.PLAN=program?program.days:[];
    global.WARMUPS=asArray(program&&program.warmupDefinitions&&program.warmupDefinitions.length?program.warmupDefinitions:(root&&root.builtinWarmups));
    return {root:root,profile:profile,program:program,plan:global.PLAN,warmups:global.WARMUPS};
  }
  function loadState(builtinPlan,builtinWarmups){
    runtimeBuiltinWarmups=copy(builtinWarmups||[]);
    var rawText=localStorage.getItem(ROOT_KEY),raw=null,root=null;
    if(rawText){
      try{raw=JSON.parse(rawText);}catch(error){console.error('训练器状态读取失败，已保留原数据',error);throw error;}
      if(!raw||!raw.profiles) throw new Error('已有 training-tracker-state 不是有效的训练器根状态，已停止写入。');
      try{root=migrateRootTransaction(raw,builtinPlan,builtinWarmups);}
      catch(error){console.error('Schema v6 迁移失败，旧状态未被覆盖',error);throw error;}
    }else{
      root=migrateLegacy(builtinPlan,builtinWarmups);
    }
    global.trainingTrackerState=root;
    return root;
  }
  function initializeTrainingTracker(builtinPlan,builtinWarmups){ return bindRuntime(loadState(builtinPlan,builtinWarmups)); }
  function saveState(){ return saveRoot(global.trainingTrackerState); }
  function hasPreV6Backup(){return !!localStorage.getItem(PRE_V6_BACKUP_KEY);}
  function summarizeStoredRoot(rawText){
    var summary={exists:rawText!==null,bytes:utf8Bytes(rawText||''),validJson:false,schemaVersion:null,profiles:0,programs:0,workouts:0,workoutLogs:0,weightedEntries:0,exerciseHistory:0,currentWorkoutDrafts:0,exerciseTemplates:0,warmupTemplates:0,activeProfileId:'',activeProgramId:'',currentWorkoutId:'',breakdown:{programDataBytes:0,duplicateAliasBytes:0,exerciseHistoryBytes:0,staticRawBytes:0}};
    if(!rawText)return summary;
    try{
      var parsed=JSON.parse(rawText),stats=collectStateIntegrityStats(parsed);summary.validJson=true;summary.schemaVersion=parsed&&parsed.schemaVersion===undefined?null:parsed&&parsed.schemaVersion;summary.profiles=stats.profiles;summary.programs=stats.programs;summary.workouts=stats.workouts;summary.workoutLogs=stats.workoutLogs;summary.weightedEntries=stats.weightedEntries;summary.exerciseHistory=stats.exerciseHistory;summary.currentWorkoutDrafts=stats.currentWorkoutDrafts;summary.exerciseTemplates=stats.exerciseTemplates;summary.warmupTemplates=stats.warmupTemplates;summary.activeProfileId=parsed&&parsed.activeProfileId||'';summary.activeProgramId=parsed&&parsed.activeProgramId||'';
      var activeProfile=parsed&&parsed.profiles&&parsed.profiles[summary.activeProfileId],active=activeProfile&&activeProfile.programs&&activeProfile.programs[summary.activeProgramId];summary.currentWorkoutId=active&&active.currentWorkoutId||'';summary.breakdown=stateStorageBreakdown(parsed);
      if(!parsed||!parsed.profiles){
        var legacyPlan=Array.isArray(parsed)?parsed:asArray(parsed&&parsed.plan),legacyLogs=Array.isArray(parsed)?[]:getProgramLogs(parsed||{}),legacyDrafts=asObject(parsed&&parsed.currentWorkoutDrafts);
        summary.programs=legacyPlan.length||legacyLogs.length?1:0;summary.workouts=legacyPlan.length;summary.workoutLogs=legacyLogs.length;summary.currentWorkoutDrafts=Object.keys(legacyDrafts).length;summary.exerciseTemplates=asArray(parsed&&parsed.exerciseTemplates).length;summary.warmupTemplates=asArray(parsed&&parsed.warmupTemplates).length+asArray(parsed&&parsed.warmupActionTemplates).length;summary.exerciseHistory=Object.keys(asObject(parsed&&parsed.exerciseHistory)).length;summary.currentWorkoutId=parsed&&parsed.currentWorkoutId||'';
        legacyLogs.forEach(function(log){getLogEntries(log).forEach(function(entry){if(entry&&(entry.weight!==undefined&&String(entry.weight)!==''||Number(entry.weightKg)>0))summary.weightedEntries++;});});
      }
    }catch(error){summary.error=error.message||String(error);}
    return summary;
  }
  function inspectTrainingStorage(){
    var rootRaw=localStorage.getItem(ROOT_KEY),backupRaw=localStorage.getItem(PRE_V6_BACKUP_KEY),legacy={};
    LEGACY_KEYS.forEach(function(key){var raw=localStorage.getItem(key);legacy[key]=summarizeStoredRoot(raw);});
    return {rootKey:ROOT_KEY,root:summarizeStoredRoot(rootRaw),preV6:summarizeStoredRoot(backupRaw),legacy:legacy,usage:estimateStorageUsage()};
  }
  function estimateStorageUsage(){
    var rootBytes=utf8Bytes(localStorage.getItem(ROOT_KEY)||''),backupBytes=utf8Bytes(localStorage.getItem(PRE_V6_BACKUP_KEY)||''),legacyBytes=0;
    LEGACY_KEYS.forEach(function(key){legacyBytes+=utf8Bytes(localStorage.getItem(key)||'');});
    return {rootBytes:rootBytes,preV6BackupBytes:backupBytes,legacyBytes:legacyBytes,totalBytes:rootBytes+backupBytes+legacyBytes,dangerThresholdBytes:4*1024*1024};
  }
  function downloadRawStorageKey(key,fileName){
    var raw=localStorage.getItem(key);if(raw===null)throw new Error('没有找到 '+key+'。');
    var blob=new Blob([raw],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=fileName||key+'-raw.json';document.body.appendChild(a);a.click();document.body.removeChild(a);setTimeout(function(){try{URL.revokeObjectURL(a.href);}catch(e){}},1000);return a.download;
  }
  function exportRawTrainingState(){return downloadRawStorageKey(ROOT_KEY,'training-tracker-state-原始存档.json');}
  function exportRawPreV6Backup(){return downloadRawStorageKey(PRE_V6_BACKUP_KEY,'training-tracker-state-pre-v6-原始备份.json');}
  function exportRawLegacyStorageKey(key){
    if(LEGACY_KEYS.indexOf(key)<0)throw new Error('不是训练器允许导出的 Legacy key。');
    return downloadRawStorageKey(key,key+'-原始存档.json');
  }
  function deletePreV6Backup(){if(!localStorage.getItem(PRE_V6_BACKUP_KEY))return false;if(!confirm('确认删除本机升级前快照？请先导出该备份。'))return false;localStorage.removeItem(PRE_V6_BACKUP_KEY);return true;}
  function restorePreV6Backup(){
    var text=localStorage.getItem(PRE_V6_BACKUP_KEY);if(!text)throw new Error('没有找到升级前本地数据。');
    if(!confirm('恢复升级前本地数据会替换当前浏览器状态。确认继续？'))return null;
    if(!confirm('请再次确认：恢复后，本次升级后产生但未备份的数据会被替换。'))return null;
    var raw=JSON.parse(text),restored=migrateRootTransaction(raw,[],[]);
    saveRootCandidate(restored);
    return restored;
  }

  function buildCycleBackupObject(){
    if(typeof global.syncCurrentWorkoutFormToState==='function') global.syncCurrentWorkoutFormToState();
    saveState();
    var backupRoot=copy(global.trainingTrackerState);
    Object.keys(asObject(backupRoot&&backupRoot.profiles)).forEach(function(profileId){Object.keys(asObject(backupRoot.profiles[profileId].programs)).forEach(function(programId){var program=backupRoot.profiles[profileId].programs[programId];if(typeof global.buildExerciseHistoryFromLogs==='function')program.exerciseHistory=global.buildExerciseHistoryFromLogs(program.workoutLogs||[]);});});
    return {version:SCHEMA_VERSION,exportedAt:nowIso(),app:'training-tracker',dateMode:'actualDate-first',state:backupRoot};
  }
  function cleanFilePart(value){return String(value||'').replace(/[\\/:*?"<>|]/g,'').replace(/\s+/g,' ').trim().slice(0,36)||'训练';}
  function formatBackupDateForName(value){var d=value?new Date(String(value).replace(/\//g,'-')):new Date();if(isNaN(d.getTime()))d=new Date();return (d.getMonth()+1)+'月'+d.getDate()+'号';}
  function getBackupFileName(refLog){
    var program=getActiveProgram();
    var idx=refLog&&typeof refLog.planIndex==='number'?refLog.planIndex:Number(program&&program.currentIndex)||0;
    var day=program&&program.days[idx]||{};
    var actual=refLog&&(refLog.actualDate||refLog.date)||(typeof global.actualDateFor==='function'?global.actualDateFor(idx):'');
    return formatBackupDateForName(actual)+'-'+cleanFilePart(refLog&&refLog.title||day['训练主题']||day.title||('第'+(idx+1)+'练'))+'-（总存档）.json';
  }
  function downloadCycleBackupFile(silent,refLog){
    var data=JSON.stringify(buildCycleBackupObject(),null,2);
    var blob=new Blob([data],{type:'application/json'});
    var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=getBackupFileName(refLog);document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(function(){try{URL.revokeObjectURL(a.href);}catch(e){}},1000);
    if(!silent) alert('已导出周期备份：'+a.download);
    return a.download;
  }
  function exportCycleBackup(){
    if(typeof global.syncCurrentWorkoutFormToState==='function') global.syncCurrentWorkoutFormToState();
    if(typeof global.currentMainWorkoutHasWeight==='function'&&document.querySelector('#exercises .mainCard')&&!global.currentMainWorkoutHasWeight()){
      if(!confirm('当前正式训练没有记录任何重量，是否继续导出？')) return;
    }
    if(typeof global.rebuildCurrentWorkoutLogDraft==='function') global.rebuildCurrentWorkoutLogDraft();
    var active=getActiveProgram();if(active)active.lastBackupAt=nowIso();saveState();downloadCycleBackupFile(false);
  }
  function importBackupObject(obj){
    if(!obj||typeof obj!=='object') throw new Error('不是有效的训练器备份。');
    var payload=obj.state||obj;
    var root;
    if(payload&&payload.profiles){root=normalizeRoot(copy(payload),[],[],{allowDefault:false});}
    else{
      var oldPlan=payload.plan||obj.importedPlan||[];
      var oldProgram=normalizeProgram(Object.assign({},payload,{days:oldPlan}),{name:'导入的旧版备份',source:'backup'});
      var profile={profileId:DEFAULT_PROFILE_ID,name:'默认档案',programs:{},exerciseTemplates:asArray(payload.exerciseTemplates),warmupTemplates:asArray(payload.warmupTemplates),warmupActionTemplates:asArray(payload.warmupActionTemplates),rmRecords:asArray(payload.rmRecords)};
      profile.programs[oldProgram.programId]=oldProgram;
      var profiles={};profiles[DEFAULT_PROFILE_ID]=profile;
      root=normalizeRoot({activeProfileId:DEFAULT_PROFILE_ID,activeProgramId:oldProgram.programId,profiles:profiles,builtinWarmups:obj.importedWarmups||[]},[],[],{allowDefault:false});
    }
    Object.keys(root.profiles).forEach(function(profileId){
      Object.keys(root.profiles[profileId].programs).forEach(function(programId){
        var program=root.profiles[profileId].programs[programId];
        if(typeof global.buildExerciseHistoryFromLogs==='function') program.exerciseHistory=global.buildExerciseHistoryFromLogs(program.workoutLogs||[]);
      });
    });
    saveRootCandidate(root);return root;
  }
  function importCycleBackupFile(event){
    var file=event&&event.target&&event.target.files&&event.target.files[0];if(!file)return;
    var reader=new FileReader();
    reader.onload=function(){
      try{
        var obj=JSON.parse(reader.result);if(!confirm('确认导入周期备份？当前浏览器里的训练记录会被备份内容覆盖。'))return;
        importBackupObject(obj);
        if(typeof global.dedupeTemplateLibraries==='function')global.dedupeTemplateLibraries();
        if(typeof global.rebuild==='function')global.rebuild();
        if(typeof global.renderHistory==='function')global.renderHistory();
        if(typeof global.renderCalendar==='function')global.renderCalendar();
        if(typeof global.renderSettings==='function')global.renderSettings();
        var active=getActiveProgram();var profile=getActiveProfile();var logs=active.workoutLogs||[];var actions=Object.keys(active.exerciseHistory||{}).length;var templates=(profile.exerciseTemplates||[]).length+(profile.warmupTemplates||[]).length+(profile.warmupActionTemplates||[]).length;
        if(typeof global.showToast==='function')global.showToast('周期备份已导入，训练记录和动作历史已恢复');
        alert('周期备份已导入\n训练日志：'+logs.length+' 条\n动作历史：'+actions+' 个动作\n模板：'+templates+' 个\n当前训练：#'+((active.currentIndex||0)+1)+(logs.length?'':'\n\n已导入计划，但没有发现训练日志，所以不会显示上次重量。'));
      }catch(error){
        console.error('导入周期备份失败',error);
        if(isStorageQuotaError(error))alert('周期备份已经识别成功，但浏览器本地存储空间不足，因此没有覆盖当前数据。请先导出原始本地存档并清理升级快照。');
        else alert('导入失败：不是有效的训练器备份 JSON。');
      }
    };
    reader.readAsText(file);if(event.target)event.target.value='';
  }

  global.TRAINING_TRACKER_STORAGE_KEY=ROOT_KEY;
  global.TRAINING_TRACKER_PRE_V6_BACKUP_KEY=PRE_V6_BACKUP_KEY;
  global.TRAINING_TRACKER_SCHEMA_VERSION=SCHEMA_VERSION;
  global.StorageQuotaError=StorageQuotaError;
  global.isStorageQuotaError=isStorageQuotaError;
  global.createStableId=makeId;
  global.normalizeSetEntity=normalizeSet;
  global.normalizeExerciseEntity=normalizeExercise;
  global.normalizeWorkoutEntity=normalizeWorkout;
  global.normalizeProgram=normalizeProgram;
  global.loadState=loadState;
  global.saveState=saveState;
  global.saveRootCandidate=saveRootCandidate;
  global.compactState=compactState;
  global.validateCompactedState=validateCompactedState;
  global.inspectTrainingStorage=inspectTrainingStorage;
  global.estimateStorageUsage=estimateStorageUsage;
  global.exportRawTrainingState=exportRawTrainingState;
  global.exportRawPreV6Backup=exportRawPreV6Backup;
  global.exportRawLegacyStorageKey=exportRawLegacyStorageKey;
  global.deletePreV6Backup=deletePreV6Backup;
  global.collectStateIntegrityStats=collectStateIntegrityStats;
  global.validateMigratedState=validateMigratedState;
  global.migrateRootTransaction=migrateRootTransaction;
  global.hasPreV6Backup=hasPreV6Backup;
  global.restorePreV6Backup=restorePreV6Backup;
  global.initializeTrainingTracker=initializeTrainingTracker;
  global.getActiveProfile=getActiveProfile;
  global.getActiveProgram=getActiveProgram;
  global.bindTrainingRuntime=bindRuntime;
  global.syncProgramToRoot=syncProgram;
  global.buildCycleBackupObject=buildCycleBackupObject;
  global.downloadCycleBackupFile=downloadCycleBackupFile;
  global.exportCycleBackup=exportCycleBackup;
  global.importBackupObject=importBackupObject;
  global.importCycleBackupFile=importCycleBackupFile;
})(typeof window!=='undefined'?window:this);
