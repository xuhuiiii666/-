const TRAINING_SECTION_TITLES = ['功能/热身','功能模块','热身','主项','主辅助','正式训练','主训练','功能循环','功能训练','训练循环','辅助','康复/辅助','康复辅助','核心','有氧','恢复','休息','执行','可选恢复'];
const WARMUP_SECTION_TITLES = ['功能/热身','功能模块','热身'];
const MAIN_SECTION_TITLES = ['主项','主辅助','正式训练','主训练','功能循环','功能训练','训练循环','辅助','康复/辅助','康复辅助','核心','有氧','执行'];
const RECOVERY_SECTION_TITLES = ['恢复','休息','可选恢复'];

function normalizeParserText(value){
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[–—～~]/g, '-')
    .replace(/[×＊*]/g, 'x')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function normalizeExerciseName(name){
  return String(name || '')
    .replace(/^[\s\-•]+/, '')
    .replace(/^\d+[\.\)、)]\s*/, '')
    .replace(/(?:休息|休|间歇|每次休息)\s*[:：]?\s*\d{1,3}(?:\s*[-至]\s*\d{1,3})?\s*(?:秒|s|sec|分钟|min)?/i, '')
    .replace(/[｜|]\s*(?:余力|RIR|建议重量|建议|休息|休|间歇)[:：]?.*$/i, '')
    .replace(/（\s*(?:余力|RIR|建议重量|休息|休)[^）]*）/gi, '')
    .replace(/\(\s*(?:余力|RIR|建议重量|休息|休)[^\)]*\)/gi, '')
    .replace(/\d{1,2}\s*(?:组\s*)?x\s*[\d\-.]+(?:\s*(?:次呼吸|次|秒|s|sec|分钟|min|呼吸))?(?:\/侧)?/i, '')
    .replace(/\d{1,3}\s*(?:秒|s|sec)(?:\/侧)?(?:\s*x\s*\d{1,2})?/i, '')
    .replace(/\d{1,2}\s*组/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[，,；;｜|]+$/g, '')
    .trim();
}

function parseRestSeconds(value){
  var text = normalizeParserText(value);
  var match = text.match(/(?:休息|休|间歇|每次休息)\s*[:：]?\s*(\d{1,3})(?:\s*[-至]\s*(\d{1,3}))?\s*(秒|s|sec|分钟|min)?/i);
  if(!match) return null;
  var unit = match[3] || '秒';
  var min = parseInt(match[1], 10) || 0;
  var max = parseInt(match[2] || match[1], 10) || min;
  if(/分钟|min/i.test(unit)){ min *= 60; max *= 60; }
  return {min:min, max:max, def:min, raw:(max !== min ? min + '-' + max + '秒' : min + '秒')};
}

function detectCompoundExercise(line, exerciseName, plannedReps){
  var raw = normalizeParserText([line,exerciseName].filter(Boolean).join(' '));
  var name = String(exerciseName || '').trim();
  var reps = String(plannedReps || '').trim();
  var baseName = name;
  var requirementSource = normalizeParserText(line || name);
  if(/组合要求[:：]/.test(requirementSource)) requirementSource=requirementSource.split(/组合要求[:：]/).pop().trim();
  requirementSource=requirementSource.replace(/^\s*\d+[\.、\)、)]\s*/,'').replace(/^[\-•]\s*/,'').trim();
  var requirementText = requirementSource
    .replace(/\d{1,2}\s*(?:组\s*)?[x×＊*]\s*[\d–\-~至]+(?:\s*次)?/ig, ' ')
    .replace(/(?:余力|RIR)\s*[:：]?\s*[\d–\-~至\.]+/ig, ' ')
    .replace(/休息\s*[:：]?\s*[\d–\-~至\.]+\s*(?:秒|分钟|min|s)?/ig, ' ')
    .replace(/建议(?:重量)?\s*[\d\.]+\s*(?:kg|lb)?/ig, ' ');
  var explicitDropReps = [];
  var repMatch;
  var repPattern = /(\d+(?:\.\d+)?(?:\s*[-–~至]\s*\d+(?:\.\d+)?)?)\s*次/g;
  while((repMatch=repPattern.exec(requirementText))) explicitDropReps.push(repMatch[1].replace(/\s+/g,''));
  if(explicitDropReps.length && /\d{1,2}\s*(?:组\s*)?[x×＊*]\s*[\d.]+\s*次?\s*(?:→|➜|➡|＞|>|\+|＋)/i.test(requirementSource)){
    explicitDropReps.unshift(reps);
  }
  function dropRep(index){
    return explicitDropReps.length>1?(explicitDropReps[index]||''):(index===0?reps:'');
  }
  var dropParts=requirementSource.split(/\s*(?:→|➜|➡|＞|>)\s*/).map(function(part){return part.trim();}).filter(Boolean);
  function dropSegmentName(index,fallback){
    if(dropParts.length<2 || !dropParts[index]) return fallback;
    var cleanedPart=dropParts[index]
      .replace(/(?:机械递减|递减组?|降重组?|drop\s*set)/ig,'')
      .replace(/\d{1,2}\s*(?:组\s*)?[x×＊*]\s*/ig,'')
      .replace(/\d+(?:\.\d+)?(?:\s*[-–~至]\s*\d+(?:\.\d+)?)?\s*次/ig,'')
      .replace(/\d+\s*组/ig,'')
      .replace(/(?:余力|RIR)\s*[:：]?\s*[\d–\-~至\.]+/ig,'')
      .replace(/休息\s*[:：]?\s*[\d–\-~至\.]+\s*(?:秒|分钟|min|s)?/ig,'')
      .replace(/[（）()]/g,'')
      .replace(/^[：:\s]+|[：:｜|\s]+$/g,'')
      .trim();
    return /[A-Za-z\u3400-\u9fff]/.test(cleanedPart)?cleanedPart:fallback;
  }
  if(/机械递减/.test(raw)){
    baseName = name.replace(/机械递减(?:组)?/g, '').trim() || name;
    return {
      type:'mechanical-drop',
      label:'机械递减组',
      cue:explicitDropReps.length>1?'每轮按原计划标注的 A/B/C 要求连续完成，段间不休；整轮结束后再休息。':'每轮三段连续完成，段间不休。原计划未写递减段重量/次数，空白处请按现场实际填写；整轮结束后再休息。',
      segments:[
        {key:'A', label:'主段', name:dropSegmentName(0,baseName), reps:dropRep(0)},
        {key:'B', label:'递减 1', name:dropSegmentName(1,'降低动作难度后继续'), reps:dropRep(1)},
        {key:'C', label:'递减 2', name:dropSegmentName(2,'再次降低难度或做有效半程'), reps:dropRep(2)}
      ]
    };
  }
  if(/递减组|降重组|drop\s*set/i.test(raw)){
    baseName = name.replace(/(?:递减组?|降重组?|drop\s*set)/ig, '').trim() || name;
    return {
      type:'drop-set',
      label:'递减组',
      cue:explicitDropReps.length>1?'每轮按原计划标注的 A/B/C 要求连续完成，段间不休；整轮结束后再休息。':'每轮主段完成后立即降重继续，段间不休。原计划未写的递减段重量/次数请按实际填写；整轮结束后再休息。',
      segments:[
        {key:'A', label:'主段', name:dropSegmentName(0,baseName), reps:dropRep(0)},
        {key:'B', label:'递减 1', name:dropSegmentName(1,'第一次降重'), reps:dropRep(1)},
        {key:'C', label:'递减 2', name:dropSegmentName(2,'第二次降重'), reps:dropRep(2)}
      ]
    };
  }
  if(/超级组|超級組|superset|连做|連做|无休(?:息)?/i.test(raw)){
    var cleaned = requirementText.replace(/(?:超级组|超級組|superset|连做|連做|无休(?:息)?)/ig, '').replace(/^[：:\s]+|[：:\s]+$/g, '');
    var parts = cleaned.split(/\s*(?:\+|＋|→|&|＆|、)\s*/).map(function(x){return x.trim();}).filter(Boolean);
    if(parts.length < 2) parts = ['动作 A','动作 B'];
    return {
      type:'superset',
      label:'超级组',
      cue:'A/B 动作连续完成，动作间不休；完成整轮后再按计划休息。',
      segments:parts.slice(0,4).map(function(part,idx){
        var partRep=(part.match(/(\d+(?:\.\d+)?(?:\s*[-–~至]\s*\d+(?:\.\d+)?)?)\s*次/)||[])[1]||reps;
        var partName=part
          .replace(/\d+(?:\.\d+)?(?:\s*[-–~至]\s*\d+(?:\.\d+)?)?\s*次/g,'')
          .replace(/\d+\s*组/g,'')
          .replace(/[，,]?\s*(?:动作间|段间)?\s*无休(?:息)?(?:连续完成)?$/i,'')
          .replace(/[，,]?\s*(?:动作间|段间)\s*$/,'')
          .replace(/[：:｜|，,]+$/g,'')
          .trim();
        return {key:String.fromCharCode(65+idx), label:'动作 '+String.fromCharCode(65+idx), name:partName||('动作 '+String.fromCharCode(65+idx)), reps:partRep.replace(/\s+/g,'')};
      })
    };
  }
  return null;
}

function parseExerciseLine(line){
  var raw = String(line || '').trim();
  var text = normalizeParserText(raw);
  var clean = text.replace(/^\d+[\.\)、)]\s*/, '').replace(/^[\-•]\s*/, '').trim();
  if(!clean || /^【.+】$/.test(clean) || /^观察[:：]|^重点[:：]|^节奏[:：]|^今日目标/.test(clean)){
    return {name:'', raw:raw, line:raw, valid:false};
  }

  var result = {
    name:'',
    raw:raw,
    line:raw,
    valid:true,
    sets:1,
    reps:'',
    rir:'',
    suggestedWeight:'',
    rest:null,
    duration:'',
    perSide:/\/侧|每侧|单侧/.test(clean)
  };

  var structuredParts = clean.split(/[｜|]/).map(function(x){return x.trim();}).filter(Boolean);
  if(structuredParts.length > 1){
    result.name = normalizeExerciseName(structuredParts[0]) || structuredParts[0];
    for(var sp=0; sp<structuredParts.length; sp++){
      var part = structuredParts[sp];
      var setsOnly = part.match(/^(\d{1,2})\s*组$/);
      if(setsOnly) result.sets = parseInt(setsOnly[1], 10) || result.sets;
      var repsOnly = part.match(/^([\d.]+(?:\s*[-至]\s*[\d.]+)?)\s*(?:次|reps?)?(?:\/侧)?$/i);
      if(repsOnly && !/kg|秒|s|分钟|min|休|余力|RIR/i.test(part)) result.reps = repsOnly[1].replace(/\s+/g, '');
      var partDuration = part.match(/^(\d{1,3})\s*(秒|s|sec)(?:\/侧)?$/i);
      if(partDuration){ result.duration = parseInt(partDuration[1], 10) || result.duration; result.reps = ''; }
      var partRir = part.match(/(?:余力|RIR)\s*[:：]?\s*([\d.]+(?:\s*[-至]\s*[\d.]+)?)/i);
      if(partRir) result.rir = partRir[1].replace(/\s+/g, '');
      var partWeight = part.match(/(?:建议重量|建议)\s*[:：]?\s*([\d.]+)\s*(kg|公斤|lb|磅)?/i);
      if(partWeight) result.suggestedWeight = partWeight[1] + (partWeight[2] || 'kg');
      var partRest = parseRestSeconds(part);
      if(partRest) result.rest = partRest;
      var partSetRep = part.match(/(\d{1,2})\s*(?:组\s*)?x\s*([\d.]+(?:\s*[-至]\s*[\d.]+)?)(?:\s*(?:次|reps?))?(?:\/侧)?/i);
      if(partSetRep){ result.sets = parseInt(partSetRep[1], 10) || result.sets; result.reps = partSetRep[2].replace(/\s+/g, ''); }
    }
    result.valid = !!result.name;
    return result;
  }

  var rir = clean.match(/(?:余力|RIR)\s*[:：]?\s*([\d.]+(?:\s*[-至]\s*[\d.]+)?)/i);
  if(rir) result.rir = rir[1].replace(/\s+/g, '');

  var weight = clean.match(/(?:建议重量|建议)\s*[:：]?\s*([\d.]+)\s*(kg|公斤|lb|磅)?/i);
  if(weight) result.suggestedWeight = weight[1] + (weight[2] || 'kg');

  result.rest = parseRestSeconds(clean);

  var withoutRest = clean.replace(/(?:休息|休|间歇|每次休息)\s*[:：]?\s*\d{1,3}(?:\s*[-至]\s*\d{1,3})?\s*(?:秒|s|sec|分钟|min)?/ig, '');
  var setRep = withoutRest.match(/(\d{1,2})\s*(?:组\s*)?x\s*([\d.]+(?:\s*[-至]\s*[\d.]+)?)(?:\s*(?:次|reps?))?(?:\/侧)?/i);
  if(setRep){
    result.sets = parseInt(setRep[1], 10) || 1;
    result.reps = setRep[2].replace(/\s+/g, '');
  }

  var timeWithSets = withoutRest.match(/(?:(\d{1,2})\s*(?:组\s*)?x\s*)?(\d{1,3})\s*(秒|s|sec)(?:\/侧)?(?:\s*x\s*(\d{1,2}))?/i);
  if(timeWithSets && (!setRep || /秒|s|sec/i.test(timeWithSets[3]))){
    if(timeWithSets[1]) result.sets = parseInt(timeWithSets[1], 10) || result.sets;
    if(timeWithSets[4]) result.sets = parseInt(timeWithSets[4], 10) || result.sets;
    result.duration = parseInt(timeWithSets[2], 10) || '';
    result.reps = '';
  }

  var minuteDuration = withoutRest.match(/(\d{1,2})\s*分钟(?:\/侧)?/);
  if(minuteDuration && !result.duration){
    result.duration = (parseInt(minuteDuration[1], 10) || 0) * 60;
    result.reps = '';
  }

  result.name = normalizeExerciseName(clean);
  if(!result.name) result.name = clean.split(/[｜|]/)[0].trim();
  if(!result.name) result.valid = false;
  return result;
}

function formatParsedExerciseLine(parsed, mode){
  if(!parsed || !parsed.valid || !parsed.name) return '';
  var sets = parsed.sets || 1;
  if(mode === 'warm'){
    if(parsed.duration) return parsed.name + ' ' + parsed.duration + 'sx' + sets + (parsed.rest ? ' 休息' + parsed.rest.def + '秒' : '');
    return parsed.name + ' ' + sets + 'x' + (parsed.reps || '') + (parsed.rest ? ' 休息' + parsed.rest.def + '秒' : '');
  }
  var out = parsed.name + ' ' + sets + 'x' + (parsed.reps || '');
  if(parsed.duration) out = parsed.name + ' ' + parsed.duration + 'sx' + sets;
  if(parsed.rir) out += '（余力' + parsed.rir + '）';
  if(parsed.suggestedWeight) out += '｜建议重量' + parsed.suggestedWeight;
  if(parsed.rest) out += '｜休息：' + parsed.rest.raw;
  return out.trim();
}

function validScheduleDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''));}
function addScheduleDays(value,days){var date=new Date(String(value)+'T00:00:00Z');if(isNaN(date.getTime()))return '';date.setUTCDate(date.getUTCDate()+Number(days||0));return date.toISOString().slice(0,10);}
function scheduleMapValue(map,days,index){var day=days[index]||{},key=day.workoutId||String(index);return map&&map[key]!==undefined?map[key]:map&&map[String(index)];}
function calculateScheduledWorkoutDate(days,index,actualDates,dateAnchors,startDate,fallbackDate){
  days=Array.isArray(days)?days:[];if(!days.length)return '';
  index=Math.max(0,Math.min(days.length-1,Number(index)||0));actualDates=actualDates||{};dateAnchors=dateAnchors||{};
  var currentActual=scheduleMapValue(actualDates,days,index);if(validScheduleDate(currentActual))return currentActual;
  function mapIndex(key){var numeric=Number(key);if(String(numeric)===String(key)&&isFinite(numeric))return numeric;return days.findIndex(function(day){return day&&day.workoutId===key;});}
  var actualItems=Object.keys(actualDates).map(function(key){return {index:mapIndex(key),date:actualDates[key]};}).filter(function(item){return item.index>=0&&validScheduleDate(item.date);}).sort(function(a,b){return String(b.date).localeCompare(String(a.date))||b.index-a.index;});
  var anchor=null;
  if(actualItems.length&&index>actualItems[0].index)anchor=actualItems[0];
  if(!anchor){
    var source=Object.assign({},dateAnchors,actualDates);
    var prior=Object.keys(source).map(function(key){return {index:mapIndex(key),date:source[key]};}).filter(function(item){return item.index>=0&&item.index<=index&&validScheduleDate(item.date);}).sort(function(a,b){return b.index-a.index;});
    anchor=prior[0]||null;
  }
  var position=anchor?anchor.index:0;
  var firstPlanned=days[0]&&(days[0].plannedDate||days[0]['plannedDate']||days[0]['日期']||days[0].date);
  var cursor=anchor?anchor.date:(validScheduleDate(firstPlanned)?firstPlanned:(validScheduleDate(startDate)?startDate:fallbackDate));
  if(!validScheduleDate(cursor))return '';
  if(position===index)return cursor;
  for(var i=position+1;i<=index;i++){
    var actual=scheduleMapValue(actualDates,days,i),manual=scheduleMapValue(dateAnchors,days,i),planned=days[i]&&(days[i].plannedDate||days[i]['plannedDate']||days[i]['日期']||days[i].date);
    if(validScheduleDate(actual))cursor=actual;
    else if(validScheduleDate(manual))cursor=manual;
    else if(validScheduleDate(planned)&&String(planned)>String(cursor))cursor=planned;
    else cursor=addScheduleDays(cursor,1);
  }
  return cursor;
}

function classifyTrainingDay(day){
  day = day || {};
  var structuredType=String(day.trainingType||day.classification||day['训练类型']||'').trim();
  var exact={
    '上肢A':{kind:'上肢A',cls:'calUpperA',label:'上肢A'},'上肢B':{kind:'上肢B',cls:'calUpperB',label:'上肢B'},
    '下肢A':{kind:'下肢A',cls:'calLowerA',label:'下肢A'},'下肢B':{kind:'下肢B',cls:'calLowerB',label:'下肢B'},
    '休息/恢复':{kind:'休息',cls:'calRest',label:'休息/恢复'},'休息':{kind:'休息',cls:'calRest',label:'休息/恢复'},
    '技术/硬拉':{kind:'后链/硬拉',cls:'calTech',label:'技术/硬拉'},'后链/硬拉':{kind:'后链/硬拉',cls:'calTech',label:'技术/硬拉'}
  };
  if(exact[structuredType])return exact[structuredType];
  var title = String(day['训练主题'] || day.theme || '');
  var type = String(day['类型'] || day.type || '');
  var stage = String(day['阶段'] || day.stage || '');
  var label = String(day['今天练哪天'] || day.label || '');
  var content = String(day['训练内容（组×次数/余力）'] || day.content || '');
  var firstLine = (content.split(/\n|\|/)[0] || '');
  var t = [title, type, stage, label, firstLine].join(' ');

  if(/休息日|完全休息|恢复日|恢复\s*$|休息\/轻活动|轻活动|轻有氧|有氧恢复/.test(t)) return {kind:'休息', cls:'calRest', label:'休息/恢复'};
  if(/有氧日|正式有氧|有氧训练|Zone\s*2/i.test(t)) return {kind:'有氧', cls:'calOther', label:'有氧'};
  if(/上肢A|卧推主导|推胸|胸肩/.test(t)) return {kind:'上肢A', cls:'calUpperA', label:'上肢A'};
  if(/上肢B|变式卧推|肩背|肩背手臂|背宽/.test(t)) return {kind:'上肢B', cls:'calUpperB', label:'上肢B'};
  if(/下肢A|深蹲主导|前蹲主导|前蹲|深蹲/.test(t)) return {kind:'下肢A', cls:'calLowerA', label:'下肢A'};
  if(/下肢B|单腿|臀腿|臀推|后侧/.test(t)) return {kind:'下肢B', cls:'calLowerB', label:'下肢B'};
  if(/硬拉|后链|髋铰链|拉\+髋铰链/.test(t)) return {kind:'后链/硬拉', cls:'calTech', label:'技术/硬拉'};
  if(/上肢|卧推|下拉|划船|肩/.test(t)) return {kind:'上肢', cls:'calUpperA', label:'上肢'};
  if(/下肢|腿|臀/.test(t)) return {kind:'下肢', cls:'calLowerA', label:'下肢'};
  return {kind:'训练', cls:'calOther', label:'训练'};
}

if(typeof globalThis!=='undefined')globalThis.calculateScheduledWorkoutDate=calculateScheduledWorkoutDate;

function classifyExerciseTemplate(exercise){
  var name = String((exercise && (exercise.name || exercise.trackName || exercise.line)) || '');
  var text = name.toLowerCase();
  var category = '通用';
  if(/卧推|推胸|飞鸟|夹胸|俯卧撑|胸/.test(text)) category = '胸';
  else if(/推举|侧平举|前平举|面拉|face|landmine|肩/.test(text)) category = '肩';
  else if(/划船|下拉|引体|背|pull|row|lat/.test(text)) category = '背';
  else if(/硬拉|rdl|罗马尼亚|臀桥|臀推|山羊|后链|good morning/.test(text)) category = '后链/硬拉';
  else if(/深蹲|腿举|腿弯举|腿屈伸|登阶|分腿蹲|箭步|提踵|前蹲|背蹲|高脚杯|泽奇|箱式/.test(text)) category = '腿';
  else if(/臀|髋外展|蚌式/.test(text)) category = '臀腿';
  else if(/死虫|卷腹|支撑|平板|核心|抗旋|pallof|哥本哈根/.test(text)) category = '核心';
  else if(/弯举|三头|二头|臂屈伸|下压|手臂/.test(text)) category = '手臂';
  return {category:category, kind:category};
}
