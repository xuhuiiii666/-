/* Fast template lookup and debounced library search. */
(function(global){
  var exerciseIndex=new Map();
  var warmupIndex=new Map();
  var searchTimers={};

  function rebuildTemplateIndexes(){
    exerciseIndex.clear();warmupIndex.clear();
    var current=global.state||{};
    (current.exerciseTemplates||[]).forEach(function(template){
      var key=typeof global.normalizeTemplateKey==='function'?global.normalizeTemplateKey(template.trackName||template.name||template.originalName):String(template.name||'').trim().toLowerCase();
      if(key) exerciseIndex.set(key,template);
    });
    (current.warmupActionTemplates||[]).forEach(function(template){
      var key=typeof global.normalizeTemplateKey==='function'?global.normalizeTemplateKey(template.name):String(template.name||'').trim().toLowerCase();
      if(key) warmupIndex.set(key,template);
    });
    return {exercise:exerciseIndex,warmup:warmupIndex};
  }
  function indexedExerciseTemplate(key){return exerciseIndex.get(key)||null;}
  function indexedWarmupTemplate(key){return warmupIndex.get(key)||null;}
  function debounceTemplateSearch(kind,callback,delay){
    clearTimeout(searchTimers[kind]);
    searchTimers[kind]=setTimeout(callback,delay||140);
  }
  global.rebuildTemplateIndexes=rebuildTemplateIndexes;
  global.indexedExerciseTemplate=indexedExerciseTemplate;
  global.indexedWarmupTemplate=indexedWarmupTemplate;
  global.debounceTemplateSearch=debounceTemplateSearch;
})(typeof window!=='undefined'?window:this);
