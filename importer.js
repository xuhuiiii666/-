/* ===== 导入适配：支持两种 Excel 复制格式 ===== */
let lastImportPreview = null;

function ImportError(message,code,details){
  this.name='ImportError';
  this.message=message||'无法识别该训练计划。';
  this.code=code||'IMPORT_UNRECOGNIZED';
  this.details=details||null;
  this.report=details&&details.report?details.report:details;
  if(Error.captureStackTrace) Error.captureStackTrace(this,ImportError);
}
ImportError.prototype=Object.create(Error.prototype);
ImportError.prototype.constructor=ImportError;
function ImportFormatError(message,code,details){ImportError.call(this,message,code||'IMPORT_FORMAT_INVALID',details);this.name='ImportFormatError';}
ImportFormatError.prototype=Object.create(ImportError.prototype);ImportFormatError.prototype.constructor=ImportFormatError;
function ImportValidationError(message,code,details){ImportError.call(this,message,code||'IMPORT_VALIDATION_FAILED',details);this.name='ImportValidationError';}
ImportValidationError.prototype=Object.create(ImportError.prototype);ImportValidationError.prototype.constructor=ImportValidationError;
function asImportError(error){return error instanceof ImportError?error:new ImportError(error&&error.message?error.message:String(error||'无法识别该训练计划。'),error&&error.code,error&&error.details||(error&&error.report?{report:error.report}:null));}

function normalizeDash(s){ return String(s||'').replace(/[—]/g,'-').replace(/[–]/g,'-').replace(/×/g,'x').trim(); }
function parseDelimited(text){
  text = String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  var delim = text.indexOf('\t')>=0 ? '\t' : ',';
  var rows=[], row=[], cell='', inQ=false;
  for(var i=0;i<text.length;i++){
    var ch=text[i], next=text[i+1];
    if(ch==='"'){
      if(inQ && next==='"'){ cell+='"'; i++; }
      else inQ=!inQ;
    }else if(ch===delim && !inQ){
      row.push(cell); cell='';
    }else if(ch==='\n' && !inQ){
      row.push(cell); rows.push(row); row=[]; cell='';
    }else{
      cell+=ch;
    }
  }
  row.push(cell); rows.push(row);
  return rows.filter(r=>r.some(c=>String(c).trim()!=='')).map(r=>r.map(c=>String(c).trim()));
}
function findHeaderRow(rows, keys){
  for(var i=0;i<Math.min(rows.length,20);i++){
    var joined=rows[i].join('|');
    var ok=keys.every(k=>joined.indexOf(k)>=0);
    if(ok) return i;
  }
  return -1;
}
function headerIndex(headers, names){
  for(var i=0;i<headers.length;i++){
    var h=String(headers[i]||'').replace(/\s/g,'');
    for(var j=0;j<names.length;j++){
      if(h.indexOf(String(names[j]).replace(/\s/g,''))>=0) return i;
    }
  }
  return -1;
}
function cell(row, idx){ return idx>=0 ? (row[idx]||'') : ''; }
function stripBullets(line){ return String(line||'').replace(/^\s*[-•]\s*/,'').replace(/^\s*\d+[\.、\)、)]\s*/,'').trim(); }
function normalizeSetRepText(s){
  return normalizeDash(s)
    .replace(/(\d+)\s*组\s*[xX]\s*([\d\-~至]+)\s*次/g,'$1x$2')
    .replace(/(\d+)\s*组\s*[xX]\s*([\d\-~至]+)\s*秒/g,'$2sx$1')
    .replace(/(\d+)\s*组\s*[xX]\s*([\d\-~至]+)\s*次呼吸/g,'$1x$2')
    .replace(/休\s*([\d\-]+)\s*秒/g,'休$1秒');
}
function isStandaloneTrainingSectionMarker(line){
  return /^【\s*(?:功能模块|功能\/热身|热身|主项|主辅助|正式训练|主训练|功能循环|功能训练|训练循环|辅助|康复\/辅助|康复辅助|核心|有氧|执行|可选恢复|恢复|休息)\s*】$/.test(String(line||'').trim());
}
function stripStandaloneTrainingSectionMarkers(text){
  return String(text||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n').split('\n').filter(function(line){
    return !isStandaloneTrainingSectionMarker(line);
  }).join('\n').trim();
}
function normalizeImportedDateCell(value){
  if(value && typeof value.getTime==='function' && !isNaN(value.getTime())){
    return value.getFullYear()+'-'+('0'+(value.getMonth()+1)).slice(-2)+'-'+('0'+value.getDate()).slice(-2);
  }
  var raw=String(value==null?'':value).trim();
  if(/^\d{5}(?:\.\d+)?$/.test(raw)){
    var serial=Number(raw);
    if(serial>=20000 && serial<=80000){
      return new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000).toISOString().slice(0,10);
    }
  }
  return raw;
}
function parseImportedWeek(value){
  var m=String(value==null?'':value).match(/(\d+)/);
  return m ? (parseInt(m[1],10)||'') : '';
}
function firstNumberRange(s){
  var m=String(s||'').match(/(\d+(?:\.\d+)?)(?:\s*[–\-~至]\s*(\d+(?:\.\d+)?))?/);
  if(!m) return '';
  return m[1];
}
function restToSeconds(restText){
  var parsed = (typeof parseRestSeconds === 'function') ? parseRestSeconds(restText) : null;
  if(parsed) return parsed;
  var m=String(restText||'').match(/(?:休息|休|间歇)\s*[:：]?\s*(\d+)\s*(?:[–\-~至]\s*(\d+))?\s*(秒|s|分钟|min)?/i);
  if(!m) return null;
  var unit=m[3]||'秒';
  var min=parseInt(m[1],10)||0;
  var max=parseInt(m[2]||m[1],10)||min;
  if(/分钟|min/i.test(unit)){ min*=60; max*=60; }
  return {min:min,max:max,def:min,raw:(max!==min ? min+'-'+max+'秒' : min+'秒')};
}
function findRestInDetails(details){
  var joined=(details||[]).join('；');
  var r=restToSeconds(joined);
  if(!r) return '';
  return r.max && r.max!==r.min ? (r.min+'-'+r.max+'秒') : (r.min+'秒');
}
function parseStructuredHead(head){
  if(typeof parseExerciseLine === 'function'){
    var parsed = parseExerciseLine(head);
    if(parsed && parsed.valid){
      return {
        name:parsed.name,
        sets:String(parsed.sets||1),
        reps:parsed.duration ? (parsed.duration + '秒') : (parsed.reps||''),
        rir:parsed.rir||'',
        suggest:parsed.suggestedWeight ? ('建议重量'+parsed.suggestedWeight) : '',
        rest:parsed.rest ? ('休息：'+parsed.rest.raw) : '',
        raw:parsed.raw||head
      };
    }
  }
  var raw=stripBullets(head);
  raw=raw.replace(/^\d+[\.、\)、)]\s*/,'').trim();
  var parts=raw.split('｜').map(function(x){return x.trim();}).filter(Boolean);
  var name=parts.shift()||raw;
  var sets='', reps='', rir='', suggest='', rest='';
  for(var i=0;i<parts.length;i++){
    var p=parts[i];
    if(!sets && /(\d+)\s*组/.test(p)){ sets=(p.match(/(\d+)\s*组/)||[])[1]||''; continue; }
    if(!rir && /余力|RIR/i.test(p)){ var rm=p.match(/(?:余力|RIR)\s*[:：]?\s*([\d–\-~至]+)/i); rir=rm?rm[1]:p.replace(/余力|RIR/ig,'').trim(); continue; }
    if(/建议/.test(p)){ suggest=p.replace(/^建议\s*/,'建议').trim(); continue; }
    if(/休息/.test(p)){ rest=p; continue; }
    if(!reps) reps=p;
  }
  if(!sets){ var sm=raw.match(/(\d+)\s*(?:组\s*)?[x×*]\s*([\d–\-~至]+)/i); if(sm){ sets=sm[1]; reps=reps||sm[2]; } }
  return {name:name,sets:sets||'1',reps:reps,rir:rir,suggest:suggest,rest:rest,raw:raw};
}
function formatItemForImport(item, mode){
  var h=parseStructuredHead(item.head);
  var rest=findRestInDetails(item.details) || h.rest.replace(/休息\s*[:：]?/,'');
  var compoundDetail=(item.details||[]).find(function(line){return /机械递减|递减组|降重组|drop\s*set|超级组|超級組|superset|连做|連做|无休(?:息)?/i.test(line);})||'';
  var compoundSource=compoundDetail || (/机械递减|递减组|降重组|drop\s*set|超级组|超級組|superset|连做|連做|无休(?:息)?/i.test(item.head||'')?(item.head||''):'');
  var reps=String(h.reps||'').trim();
  var sets=h.sets||'1';
  var name=h.name||'训练项目';
  if(compoundSource && typeof detectCompoundExercise==='function'){
    var compoundMeta=detectCompoundExercise(compoundSource,name,reps);
    if(compoundMeta&&compoundMeta.type==='superset'){
      name='超级组：'+compoundMeta.segments.map(function(segment){return segment.name;}).join(' + ');
    }else if(compoundMeta){
      name=name.replace(/\s*(?:(?:→|➜|➡|＞|>|\+|＋)\s*\d+(?:\.\d+)?(?:\s*[-–~至]\s*\d+(?:\.\d+)?)?\s*次?)+\s*$/,'').trim();
    }
  }
  if(mode==='warm'){
    var restPart=rest ? (' 休息'+firstNumberRange(rest)+'秒') : '';
    if(/秒|s/i.test(reps)) return (name+' '+firstNumberRange(reps)+'sx'+sets+restPart).trim();
    if(/分钟|min/i.test(reps)) return (name+' '+(parseInt(firstNumberRange(reps)||'0',10)*60)+'sx'+sets+restPart).trim();
    if(/呼吸/.test(reps)) return (name+' '+sets+'x'+(firstNumberRange(reps)||reps)+restPart).trim();
    return (name+' '+sets+'x'+(firstNumberRange(reps)||reps)+restPart).trim();
  }
  var out=name+(reps?(' '+sets+'x'+(firstNumberRange(reps)||reps)):('｜'+sets+'组'));
  if(h.rir) out+='（余力'+h.rir+'）';
  if(h.suggest) out+='｜'+h.suggest.replace(/^建议(?!重量)/,'建议');
  if(rest) out+='｜休息：'+rest;
  var needsCompoundRequirement=!!compoundDetail || /超级组|超級組|superset|连做|連做|无休(?:息)?/i.test(compoundSource) || /(?:→|➜|➡|＞|>|\+|＋)/.test(compoundSource) || ((compoundSource.match(/\d+(?:\.\d+)?\s*次/g)||[]).length>1);
  if(compoundSource && needsCompoundRequirement) out+='｜组合要求：'+stripBullets(compoundSource);
  return out.trim();
}
function extractSectionBlock(content, title){
  var txt=String(content||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  var safe=String(title||'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  var re=new RegExp('【\\s*'+safe+'\\s*】([\\s\\S]*?)(?=\\n【|$)');
  var m=txt.match(re);
  return m ? m[1].trim() : '';
}
function collectSection(txt, titles){
  var blocks=[];
  for(var i=0;i<titles.length;i++){
    var b=extractSectionBlock(txt,titles[i]);
    if(b) blocks.push({title:titles[i], block:b});
  }
  return blocks;
}
function isSectionInstructionLine(line){
  var x=stripBullets(line);
  return /^(?:以下动作|连续完成|每轮|全程|不做|当天|不追加|保持|本周规则)(?:[:：\s，,]|$)/.test(x) ||
    /^(?:今日目标|观察|当日观察|重点|节奏|替代|减重|技术(?:提示)?|动作标准|提示)[:：]/.test(x);
}
function isStructuredExerciseHead(line){
  var raw=String(line||'').trim();
  var clean=stripBullets(raw);
  if(!clean || isSectionInstructionLine(clean)) return false;
  if(/^\d+[\.、\)、)]\s*/.test(raw)) return true;
  if(clean.indexOf('｜')>=0 && /组|次|秒|分钟|呼吸|Zone\s*2|x|×/i.test(clean)) return true;
  return /(?:\d+\s*组(?:\s*[x×＊*]\s*[\d\-~至]+)?|\d+\s*[x×＊*]\s*[\d\-~至]+|\d+\s*(?:秒|s|sec|分钟|min|次呼吸|次|下|步|米)(?:\/侧)?|Zone\s*2)/i.test(clean);
}
function sectionItems(block){
  var lines=String(block||'').split('\n').map(function(x){return String(x||'').trim();}).filter(Boolean);
  var items=[], cur=null;
  for(var i=0;i<lines.length;i++){
    var line=lines[i];
    if(isStructuredExerciseHead(line)){
      if(cur) items.push(cur);
      cur={head:line, details:[]};
    }else if(cur){
      cur.details.push(line);
    }
  }
  if(cur) items.push(cur);
  return items;
}
function linesFromBlocks(blocks, mode){
  var out=[];
  for(var b=0;b<blocks.length;b++){
    var items=sectionItems(blocks[b].block);
    for(var i=0;i<items.length;i++){
      var line=formatItemForImport(items[i], mode);
      if(line) out.push(line);
    }
  }
  return out;
}
function cleanSectionLines(block, mode){
  // 兼容旧版复制粘贴：如果不是结构化“1. 动作｜2组｜10”的写法，仍按行清洗。
  var structured=sectionItems(block);
  if(structured.length) return structured.map(function(it){return formatItemForImport(it, mode==='main'?'main':'warm');}).filter(Boolean);
  return String(block||'').split('\n').map(function(line){
    var x=stripBullets(line);
    if(!x) return '';
    if(/^今日目标/.test(x)) return '';
    if(/^观察[:：]/.test(x)) return '';
    if(/^当日观察/.test(x)) return '';
    if(/^重点[:：]/.test(x)) return '';
    if(/^节奏[:：]/.test(x)) return '';
    if(/^替代|^减重/.test(x)) return '';
    if(typeof parseExerciseLine === 'function'){
      var parsed=parseExerciseLine(x);
      if(parsed && parsed.valid) return formatParsedExerciseLine(parsed, mode==='main'?'main':'warm');
    }
    if(mode==='main') return convertWorkoutLine(x);
    return normalizeSetRepText(x);
  }).filter(Boolean);
}
function convertWorkoutLine(line){
  var item={head:line, details:[]};
  return formatItemForImport(item,'main');
}
function parseMobileDayContent(content){
  var txt=String(content||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  // 徐晖版手机清晰版：优先读取【功能模块】为热身；【主项/辅助/核心/康复辅助/有氧】为正式训练。
  var warmBlocks=collectSection(txt,['功能模块','功能/热身','热身']);
  var mainBlocks=collectSection(txt,['主项','主辅助','正式训练','主训练','功能循环','功能训练','训练循环','辅助','康复/辅助','康复辅助','核心','有氧','执行','可选恢复']);
  var recoveryBlocks=collectSection(txt,['恢复']);
  var restBlocks=collectSection(txt,['休息']);
  var hasStructuredSections=!!(warmBlocks.length || mainBlocks.length || recoveryBlocks.length || restBlocks.length);
  if(!mainBlocks.length){
    warmBlocks=warmBlocks.concat(recoveryBlocks,restBlocks);
  }
  var warmLines=linesFromBlocks(warmBlocks,'warm');
  var mainLines=linesFromBlocks(mainBlocks,'main');
  // 旧格式兜底。
  if(!warmLines.length){
    var warm = extractSectionBlock(txt,'功能/热身') || extractSectionBlock(txt,'热身') || '';
    warmLines=cleanSectionLines(warm,'warm');
  }
  if(!mainLines.length){
    var main = extractSectionBlock(txt,'主训练') || extractSectionBlock(txt,'正式训练') || extractSectionBlock(txt,'执行') || '';
    mainLines=cleanSectionLines(main,'main');
  }
  return {warmup:warmLines.join('\n'), main:mainLines.join('\n'), rawMain:mainLines.join('\n'), rawExecute:'', hasStructuredSections:hasStructuredSections};
}
function importFormatA(rows, headerRow){
  var h=rows[headerRow];
  var ixWeek=headerIndex(h,['周次']), ixDate=headerIndex(h,['日期']), ixDay=headerIndex(h,['星期','周内日']);
  var ixStage=headerIndex(h,['阶段']), ixTheme=headerIndex(h,['训练主题','主题']), ixWarm=headerIndex(h,['热身模板']);
  var ixWarmContent=headerIndex(h,['热身/功能退阶','热身／功能退阶','热身内容','功能退阶']);
  var ixContent=headerIndex(h,['训练内容','今日内容']), ixRest=headerIndex(h,['组间休息','休息']);
  var plan=[];
  for(var r=headerRow+1;r<rows.length;r++){
    var row=rows[r];
    var content=cell(row,ixContent);
    var theme=cell(row,ixTheme);
    if(!content && !theme) continue;
    var warmupContent=ixWarmContent>=0 ? normalizeSetRepText(stripStandaloneTrainingSectionMarkers(cell(row,ixWarmContent))) : '';
    var cleanedContent=normalizeSetRepText(stripStandaloneTrainingSectionMarkers(content));
    var plannedDate=normalizeImportedDateCell(cell(row,ixDate));
    plan.push({
      '周次': parseImportedWeek(cell(row,ixWeek)),
      '日期': plannedDate,
      'plannedDate': plannedDate,
      '星期': cell(row,ixDay)||'',
      '阶段': cell(row,ixStage)||'导入计划',
      '训练主题': theme||('导入训练 '+(plan.length+1)),
      '热身模板': cell(row,ixWarm)||(warmupContent?'逐日导入热身':'导入热身'),
      '导入热身内容': warmupContent,
      '训练内容（组×次数/余力）': cleanedContent,
      '组间休息/规则': cell(row,ixRest)||'主项3分钟；大辅助90–120秒；小辅助45–90秒'
    });
  }
  return {type:'A｜每周训练内容总表', plan:plan, warmups:null};
}
function parseDayLabel(label, content){
  var s=String(label||'');
  var c=String(content||'');
  var weekM=s.match(/第\s*(\d+)\s*周/) || c.match(/第\s*(\d+)\s*周/);
  var dayM=s.match(/周[一二三四五六日天]/) || c.match(/建议星期[:：]?\s*(周[一二三四五六日天])/);
  var lines=c.split('\n').map(function(x){return x.trim();}).filter(Boolean);
  var title=lines[0] || s.replace(/顺序\d+｜?/,'').replace(/\n/g,'｜');
  var stageLine='';
  for(var i=0;i<lines.length;i++){
    if(/中周期/.test(lines[i])){
      var stageParts=String(lines[i]).replace(/[【】]/g,'').split(/[｜|]/).map(function(x){return x.trim();}).filter(function(x){return /中周期|阶段|期/.test(x);});
      stageLine=stageParts.join('｜') || lines[i];
      break;
    }
  }
  var type='训练日';
  var labelLines=s.split('\n').map(function(x){return x.trim();}).filter(Boolean);
  if(labelLines.length>1) type=labelLines[1];
  else if(title.indexOf('｜')>0){
    var titleType=title.split('｜')[0].replace(/[【】]/g,'').trim();
    if(!/^第\s*\d+\s*周/.test(titleType)) type=titleType;
  }
  return {week:weekM?parseInt(weekM[1],10):'', weekday:dayM?(dayM[1]||dayM[0]):'', title:title, stage:stageLine||type, type:type};
}
function importFormatB(rows, headerRow){
  var h=rows[headerRow];
  var ixSeq=headerIndex(h,['顺序日','顺序']);
  var ixLabel=headerIndex(h,['今天练哪天','训练日','今天练','周内日','星期']);
  var ixWeek=headerIndex(h,['周次']);
  var ixDay=headerIndex(h,['周内日','星期']);
  var ixType=headerIndex(h,['类型']);
  var ixTheme=headerIndex(h,['主题']);
  var ixContent=headerIndex(h,['今日内容','今天整块内容','整块内容','从上到下做']);
  var ixDone=headerIndex(h,['完成日期']);
  var plan=[], warmups=[];
  for(var r=headerRow+1;r<rows.length;r++){
    var row=rows[r];
    var content=cell(row,ixContent), theme=cell(row,ixTheme), label=cell(row,ixLabel);
    if(!content && !theme && !label) continue;
    var parsed=parseMobileDayContent(content);
    var meta=parseDayLabel(label, content);
    var seq=cell(row,ixSeq) || (plan.length+1);
    var type=cell(row,ixType)||meta.type||'训练日';
    var title=theme || meta.title || ('顺序 '+seq);
    var warmName='导入热身｜'+title;
    if(parsed.warmup){
      warmups.push({name:warmName, applies:type, steps:parsed.warmup, notes:'从手机查看版_一日一格导入'});
    }
    plan.push({
      '周次': parseInt(cell(row,ixWeek),10)||meta.week||'',
      '日期': '',
      'plannedDate': '',
      '星期': cell(row,ixDay)||meta.weekday||'',
      '阶段': meta.stage||type,
      '类型': type,
      '今天练哪天': label,
      '训练主题': title,
      '热身模板': parsed.warmup ? warmName : '—',
      '导入热身内容': parsed.warmup,
      '训练内容（组×次数/余力）': parsed.main || (parsed.hasStructuredSections ? '' : normalizeSetRepText(content)),
      '组间休息/规则': '按动作行内休息优先；主项约150–210秒；大辅助90–120秒；小辅助45–90秒',
      '完成日期': cell(row,ixDone)||''
    });
  }
  return {type:'B｜手机查看版一日一格/逐日执行', plan:plan, warmups:warmups};
}
function detectAndParseImport(text){
  var rows=parseDelimited(text);
  if(!rows.length) throw new ImportError('没有读取到有效内容。请复制包含表头的表格区域。','EMPTY_INPUT');
  if(typeof detectLongFormDailyGrid==='function'&&detectLongFormDailyGrid(rows,'')){
    var longForm=parseLongFormDailyGrid(rows,{fileName:'复制粘贴内容',sheetName:'复制粘贴'});
    longForm.adapter=importAdapterLabel(longForm);longForm.routeWarnings=longFormRouteWarnings(longForm);return longForm;
  }
  var legacy=parseDailyGridSheet(rows, {id:'clipboard', label:'复制粘贴'});legacy.adapter=importAdapterLabel(legacy);return legacy;
}

function sheetNameBlocked(name){
  return /导航|使用说明|说明|周总览|总览|替代规则|先看这里/.test(String(name||''));
}

function detectPlanType(fileOrWorkbook){
  var fileName = '';
  var names = [];
  if(typeof fileOrWorkbook === 'string') fileName = fileOrWorkbook;
  else if(fileOrWorkbook && fileOrWorkbook.name) fileName = fileOrWorkbook.name;
  else if(fileOrWorkbook && fileOrWorkbook.SheetNames) names = fileOrWorkbook.SheetNames.slice();
  var joined = [fileName].concat(names).join(' ');
  if(/徐晖|手机清晰版|手机查看版/.test(joined)) return {id:'xuhui', label:'徐晖版'};
  if(/肖悦|肖悅/.test(joined)) return {id:'xiaoyue', label:'肖悦版'};
  if(/一日一格|逐日执行|逐日執行/.test(joined)) return {id:'daily-grid', label:'逐日执行模板'};
  return {id:'unknown', label:'自动识别模板'};
}

function rowsFromSheet(sheet){
  if(Array.isArray(sheet)) return normalizeExcelRows(sheet);
  if(!sheet) return [];
  if(typeof XLSX !== 'undefined' && XLSX.utils && sheet['!ref']){
    return normalizeExcelRows(XLSX.utils.sheet_to_json(sheet,{header:1,raw:false,defval:''}));
  }
  return [];
}

function scoreDailySheet(name, rows){
  var score = 0;
  var n = String(name||'');
  var text = rowsToDelimitedText(rows).slice(0,24000);
  if(sheetNameBlocked(n)) score -= 10000;
  if(/手机查看版|手机版|手机/.test(n)) score += 3000;
  if(/一日一格/.test(n)) score += 2600;
  if(/逐日执行|逐日執行/.test(n)) score += 2200;
  if(/训练计划|每日|Daily/i.test(n)) score += 300;
  if(/今天整块内容|从上到下做|今日内容/.test(text)) score += 1400;
  if(/顺序日|顺序/.test(text) && /今天练哪天|今天练|训练日/.test(text)) score += 800;
  if(/【功能\/热身】|【功能模块】|【热身】/.test(text)) score += 500;
  if(/【主项】|【主辅助】|【辅助】|【核心】|【正式训练】|【主训练】/.test(text)) score += 500;
  if(/周次/.test(text) && /训练内容/.test(text)) score += 120;
  return score;
}

function findDailyExecutionSheet(workbook){
  if(!workbook || !workbook.SheetNames) throw new ImportFormatError('不是有效的 Excel 工作簿。','INVALID_WORKBOOK');
  var candidates = [];
  for(var i=0;i<workbook.SheetNames.length;i++){
    var name = workbook.SheetNames[i];
    var rows = rowsFromSheet(workbook.Sheets[name]);
    if(!rows.length) continue;
    candidates.push({name:name, sheet:workbook.Sheets[name], rows:rows, score:scoreDailySheet(name, rows)});
  }
  candidates.sort(function(a,b){return b.score-a.score;});
  var best = candidates.find(function(c){ return c.score > 0 && !sheetNameBlocked(c.name); });
  if(!best) throw new ImportFormatError('没有找到逐日执行工作表。已跳过导航、说明、周总览、替代规则等页面。','DAILY_SHEET_NOT_FOUND');
  best.candidates = candidates.map(function(c){return c.name+'('+c.score+')';}).slice(0,8);
  return best;
}

function parseDailyGridSheet(sheet, planType){
  var rows = rowsFromSheet(sheet);
  if(!rows.length) throw new ImportError('工作表为空。','EMPTY_SHEET');
  var headerB=findHeaderRow(rows,['顺序','今天']);
  if(headerB<0) headerB=findHeaderRow(rows,['顺序日','今日内容']);
  var headerA=findHeaderRow(rows,['周次','训练内容']);
  var parsed = null;
  if(headerB>=0) parsed = importFormatB(rows,headerB);
  else if(headerA>=0) parsed = importFormatA(rows,headerA);
  else throw new ImportError('没有识别到支持的表头。需要「顺序/今天练哪天/今天整块内容」或「周次/训练内容」。','UNSUPPORTED_HEADER');
  parsed.planType = planType && planType.id ? planType : (planType || {id:'unknown', label:'自动识别模板'});
  parsed.type = (parsed.planType.label || '自动识别模板') + '｜' + parsed.type;
  parsed.plan = (parsed.plan || []).map(function(day, idx){
    var info = (typeof classifyTrainingDay === 'function') ? classifyTrainingDay(day) : null;
    day['训练日分类'] = info ? info.kind : '';
    day['导入序号'] = idx + 1;
    return day;
  });
  parsed.validation = validateImportedPlan(parsed.plan);
  if(!parsed.plan.length) throw new ImportError('识别到表头，但没有读取到任何训练日。','EMPTY_PLAN');
  return parsed;
}

function importedExerciseNames(day){
  return String((day&&day['训练内容（组×次数/余力）'])||'').split('\n').map(function(line){
    var parsed=(typeof parseExerciseLine==='function') ? parseExerciseLine(line) : null;
    return parsed&&parsed.valid ? normalizeExerciseName(parsed.name) : '';
  }).filter(Boolean);
}
function validateImportedPlan(plan){
  var duplicateDays=[];
  (plan||[]).forEach(function(day,idx){
    var seen={}, duplicates=[];
    importedExerciseNames(day).forEach(function(name){
      var key=String(name||'').toLowerCase().replace(/\s+/g,'');
      if(seen[key] && duplicates.indexOf(name)<0) duplicates.push(name);
      seen[key]=true;
    });
    if(duplicates.length) duplicateDays.push({index:idx+1,title:day['训练主题']||'',names:duplicates});
  });
  return {valid:Array.isArray(plan)&&plan.length>0,dayCount:(plan||[]).length,duplicateDays:duplicateDays};
}

function detectStructuredFormat(workbook){
  return !!(workbook&&Array.isArray(workbook.SheetNames)&&workbook.SheetNames.indexOf(STRUCTURED_DATA_SHEET)>=0);
}
function importAdapterLabel(parsed){
  if(parsed&&parsed.format==='structured-v1')return 'Structured Import v1';
  if(parsed&&parsed.format==='long-form-daily-v1')return 'Long-form Daily Grid';
  return 'Legacy Import';
}
function importBuildVersion(){return typeof APP_BUILD_VERSION!=='undefined'&&APP_BUILD_VERSION?String(APP_BUILD_VERSION):'unknown';}
function longFormRouteWarnings(parsed){
  if(!parsed||parsed.format!=='long-form-daily-v1')return [];
  var semantic=parsed.semanticStats||{},types=semantic.types||{},activeDays=(types['力量训练']||0)+(types['力量＋有氧']||0)+(types['攀岩']||0)+(types['减载训练']||0)+(types['减载攀岩']||0);
  var activities=(semantic.warmups||0)+(semantic.cardio||0)+(semantic.climbing||0),warnings=[];
  if(activeDays>0&&!(semantic.warmups>0))warnings.push('该文件疑似未进入 Long-form 解析：structured warmup = 0，请勿正式导入。');
  if(activeDays>0&&!(activities>0))warnings.push('该文件疑似未进入 Long-form 解析：activities = 0，请勿正式导入。');
  return warnings;
}
function parseWorkbookToImport(workbook, file){
  try{
    if(detectStructuredFormat(workbook)){
      var structuredReport=validateStructuredWorkbook(workbook,rowsFromSheet);
      var structured=createStandardProgram(structuredReport,file);structured.adapter=importAdapterLabel(structured);return structured;
    }
    var planType = detectPlanType(file || workbook);
    if(planType.id === 'unknown'){
      var wbType = detectPlanType(workbook);
      if(wbType.id !== 'unknown') planType = wbType;
    }
    var selected = findDailyExecutionSheet(workbook);
    if(typeof detectLongFormDailyGrid==='function'&&detectLongFormDailyGrid(selected.rows,selected.name)){
      var longForm=parseLongFormDailyGrid(selected.rows,{fileName:file&&file.name||'',sheetName:selected.name});
      if(!longForm.validation||!longForm.validation.valid){
        var semanticErrors=(longForm.validation&&longForm.validation.errors||[]).concat(longForm.semanticWarnings||[]);
        throw new ImportValidationError('Long-form 训练计划存在未结构化内容或身份错误，请先查看语义损失警告。','LONG_FORM_SEMANTIC_LOSS',{report:{format:longForm.format,stats:longForm.semanticStats,warnings:longForm.semanticWarnings,errors:semanticErrors}});
      }
      longForm.candidates=selected.candidates;
      longForm.adapter=importAdapterLabel(longForm);
      longForm.routeWarnings=longFormRouteWarnings(longForm);
      return longForm;
    }
    var parsed = parseDailyGridSheet(selected.rows, planType);
    if(!parsed.validation||!parsed.validation.valid) throw new ImportValidationError('训练计划校验失败。','VALIDATION_FAILED');
    parsed.sheetName = selected.name;
    parsed.source = 'file';
    parsed.sourceFileName=file&&file.name||'';
    parsed.candidates = selected.candidates;
    parsed.adapter=importAdapterLabel(parsed);
    return parsed;
  }catch(error){throw asImportError(error);}
}

function migrateOldImportedDataIfNeeded(){
  return false; // 旧键迁移已统一由 storage.js 在启动时原子完成。
}

function detectAndParseImportLegacy(text){
  var rows=parseDelimited(text);
  if(!rows.length) throw new Error('没有读取到有效内容。请复制包含表头的表格区域。');
  var headerB=findHeaderRow(rows,['顺序','今天'])>=0 ? findHeaderRow(rows,['顺序','今天']) : findHeaderRow(rows,['顺序日','今日内容']);
  var headerA=findHeaderRow(rows,['周次','训练内容']);
  if(headerB>=0) return importFormatB(rows,headerB);
  if(headerA>=0) return importFormatA(rows,headerA);
  throw new Error('没有识别到支持的表头。新版格式需要「顺序/今天练哪天/今天整块内容」，旧版格式需要「顺序日/今日内容」。');
}
function previewImportPlan(){
  var box=document.getElementById('importBox');
  var out=document.getElementById('importPreview');
  try{
    var parsed=detectAndParseImport(box.value);
    lastImportPreview=parsed;
    var first=parsed.plan[0]||{};
    var duplicateCount=(parsed.validation&&parsed.validation.duplicateDays&&parsed.validation.duplicateDays.length)||0;
    out.textContent='导入方式：'+importAdapterLabel(parsed)+'\nBuild：'+importBuildVersion()+'\n识别格式：'+parsed.type+'\n训练日数量：'+parsed.plan.length+'\n热身模板数量：'+(parsed.warmups?parsed.warmups.length:'沿用表内热身模板')+'\n同日重复动作检查：'+(duplicateCount?('发现 '+duplicateCount+' 天，请检查预览'):'未发现')+'\n\n第一条预览：\n'+JSON.stringify(first,null,2).slice(0,1200);
  }catch(e){
    lastImportPreview=null;
    out.textContent='识别失败：'+e.message;
  }
}
function importUtf8Bytes(value){
  var source=String(value===undefined||value===null?'':value);
  if(typeof TextEncoder!=='undefined') return new TextEncoder().encode(source).length;
  try{return unescape(encodeURIComponent(source)).length;}catch(ignore){return source.length;}
}
function formatImportMegabytes(bytes){return (Math.max(0,Number(bytes)||0)/1000000).toFixed(2)+' MB';}
function programFromParsedImport(parsed){
  if(!parsed||!parsed.plan||!parsed.plan.length) throw new ImportError('请先成功预览训练计划。','NO_PREVIEW');
  var importSource=parsed.format==='structured-v1'?'structured-v1':(parsed.format==='long-form-daily-v1'?'long-form-daily-v1':'excel');
  var program=typeof createProgramFromPlan==='function'&&typeof normalizeProgram==='function'
    ?createProgramFromPlan(parsed.plan,{name:parsed.programName||parsed.sourceFileName||'导入训练计划',source:importSource,sourceFileName:parsed.sourceFileName||''})
    :{name:parsed.programName||parsed.sourceFileName||'导入训练计划',source:importSource,sourceFileName:parsed.sourceFileName||'',days:parsed.plan.slice()};
  program.warmupDefinitions=(parsed.warmups||[]).slice();
  if(parsed.format==='long-form-daily-v1'){
    program.sharedSourceBlocks=Object.assign({},parsed.sharedSourceBlocks||{});
    program.importSemanticStats=Object.assign({},parsed.semanticStats||{});
    program.importFormat='long-form-daily-v1';
  }
  return program;
}
function estimateImportStorage(parsed){
  var program=programFromParsedImport(parsed),programBytes=importUtf8Bytes(JSON.stringify(program));
  var usage=typeof estimateStorageUsage==='function'?estimateStorageUsage():null;
  var currentRootBytes=usage&&Number(usage.rootBytes)||0;
  if(!currentRootBytes&&typeof localStorage!=='undefined'){
    try{currentRootBytes=importUtf8Bytes(localStorage.getItem('training-tracker-state')||'');}catch(ignore){}
  }
  var estimatedAfterBytes=currentRootBytes+programBytes;
  var warningLevel=estimatedAfterBytes>=8000000?'strong':(estimatedAfterBytes>=4000000?'warning':'normal');
  return {program:program,programBytes:programBytes,currentRootBytes:currentRootBytes,estimatedAfterBytes:estimatedAfterBytes,warningLevel:warningLevel};
}
function importStorageEstimateLines(parsed){
  var estimate=estimateImportStorage(parsed),lines=[
    '预计 Program 大小：约 '+formatImportMegabytes(estimate.programBytes),
    '当前 ROOT：约 '+formatImportMegabytes(estimate.currentRootBytes),
    '导入后预计：约 '+formatImportMegabytes(estimate.estimatedAfterBytes)
  ];
  if(estimate.warningLevel==='warning')lines.push('容量提醒：预计体积较大，请先保留原始存档；各浏览器实际配额不同。');
  if(estimate.warningLevel==='strong')lines.push('强容量提醒：预计体积很大，写入可能失败；实际以浏览器保存结果为准。');
  return {estimate:estimate,lines:lines};
}
function importPrecheckText(parsed,fileName){
  if(parsed&&parsed.format==='long-form-daily-v1'){
    var semantic=parsed.semanticStats||{},types=semantic.types||{};
    var lines=[
      '文件：'+(fileName||parsed.sourceFileName||''),
      '导入方式：'+importAdapterLabel(parsed),
      'Build：'+importBuildVersion(),
      '格式：Long-form Daily Grid｜语义适配 v1',
      'Workout：'+(semantic.workouts||0),
      '力量训练：'+(types['力量训练']||0)+'｜力量＋有氧：'+(types['力量＋有氧']||0)+'｜完全休息：'+(types['完全休息']||0),
      '攀岩：'+(types['攀岩']||0)+'｜减载训练：'+(types['减载训练']||0)+'｜减载攀岩：'+(types['减载攀岩']||0),
      '正式动作：'+(semantic.formalExercises||0)+'｜热身模块：'+(semantic.warmups||0)+'｜技能保留动作：'+(semantic.skillRetention||0),
      '超级组：'+(semantic.supersetGroups||0)+'｜多阶段递减组：'+(semantic.multiStageDropSets||0),
      '有氧活动：'+(semantic.cardio||0)+'｜攀岩活动：'+(semantic.climbing||0),
      '未识别内容块：'+(semantic.unrecognizedBlocks||0)
    ];
    (parsed.semanticWarnings||[]).forEach(function(item){lines.push('语义损失警告：'+item);});
    (parsed.routeWarnings||[]).forEach(function(item){lines.push('路由警告：'+item);});
    var validation=parsed.validation||{},errors=validation.errors||[],warnings=(validation.warnings||[]).concat(parsed.semanticWarnings||[]);
    lines.push('validation：'+errors.length+' errors / '+warnings.length+' warnings');
    lines=lines.concat(importStorageEstimateLines(parsed).lines);
    lines.push((semantic.unrecognizedBlocks||0)?'严重错误：'+semantic.unrecognizedBlocks:'✓ 未发现语义损失');
    return lines.join('\n');
  }
  var report=parsed&&parsed.report;
  if(!report){
    return '文件：'+(fileName||parsed&&parsed.sourceFileName||'粘贴内容')+'\n导入方式：'+importAdapterLabel(parsed)+'\nBuild：'+importBuildVersion()+'\n格式：Legacy 兼容格式\n✓ 旧版解析成功\n训练日：'+((parsed&&parsed.plan&&parsed.plan.length)||0)+'\n严重错误：0';
  }
  var lines=['文件：'+(fileName||parsed.sourceFileName||''),'导入方式：'+importAdapterLabel(parsed),'Build：'+importBuildVersion(),'格式：'+report.format,'训练日：'+report.stats.workouts+'｜动作：'+report.stats.exercises+'｜计划组：'+report.stats.sets+'｜特殊组：'+report.stats.specialSets];
  (report.checks||[]).forEach(function(item){lines.push('✓ '+item);});
  (report.warnings||[]).forEach(function(item){lines.push('提醒：'+item);});
  (report.errors||[]).forEach(function(item){lines.push('错误：'+item);});
  lines.push('严重错误：'+(report.errors||[]).length);
  return lines.join('\n');
}
function renderImportPrecheck(parsed,fileName,error){
  var box=document.getElementById('importPrecheck');if(!box) return;
  var report=error&&(error.report||(error.details&&error.details.report));
  if(error&&report) parsed={report:report,sourceFileName:fileName||''};
  box.textContent=error&&!report?('文件：'+(fileName||'')+'\nBuild：'+importBuildVersion()+'\n识别失败：'+(error.message||error)+'\n严重错误：1'):importPrecheckText(parsed,fileName);
  var previewProgram=null,exactDuplicate=null,similarSource=null;
  if(!error&&parsed){
    try{previewProgram=programFromParsedImport(parsed);}catch(ignore){}
    if(previewProgram&&typeof findDuplicateImportedProgram==='function')exactDuplicate=findDuplicateImportedProgram(previewProgram);
    if(!exactDuplicate&&typeof findImportedProgramBySource==='function')similarSource=findImportedProgramBySource(parsed.sourceFileName||fileName||'',(parsed.plan||[]).length);
  }
  if(exactDuplicate)box.textContent+='\n提醒：当前已存在内容完全一致的计划：'+(exactDuplicate.name||exactDuplicate.sourceFileName||'未命名计划')+'。不会自动覆盖或重复创建。';
  else if(similarSource)box.textContent+='\n提醒：当前已存在同名且 Workout 数量相同的计划，但内容不一定相同。确认后仍可导入为新的 Program，不会自动覆盖。';
  var storageEstimate=null;
  if(!error&&parsed&&parsed.format==='long-form-daily-v1'){
    try{storageEstimate=estimateImportStorage(parsed);}catch(ignore){}
  }
  box.classList.toggle('blocked',!!error||!!(report&&report.errors&&report.errors.length)||!!(parsed&&parsed.routeWarnings&&parsed.routeWarnings.length));
  box.classList.toggle('storageWarning',!!storageEstimate&&storageEstimate.warningLevel==='warning');
  box.classList.toggle('storageStrongWarning',!!storageEstimate&&storageEstimate.warningLevel==='strong');
}
function programFromImportPreview(){
  if(!lastImportPreview) previewImportPlan();
  if(lastImportPreview&&lastImportPreview.routeWarnings&&lastImportPreview.routeWarnings.length)throw new ImportValidationError(lastImportPreview.routeWarnings.join('\n'),'LONG_FORM_ROUTE_SUSPECT',{report:{format:lastImportPreview.format,errors:lastImportPreview.routeWarnings,warnings:[]}});
  return programFromParsedImport(lastImportPreview);
}
function refreshAfterProgramImport(message){
  state=getActiveProgram();PLAN=state.days;WARMUPS=(state.warmupDefinitions&&state.warmupDefinitions.length)?state.warmupDefinitions:(trainingTrackerState.builtinWarmups||BUILTIN_WARMUPS);
  var canonicalRootSnapshot=JSON.parse(JSON.stringify(trainingTrackerState)),templateWarning='';
  try{autoSeedTemplatesFromPlan();}catch(error){
    console.error('导入后的模板沉淀未保存',error);
    if(typeof bindTrainingRuntime==='function')bindTrainingRuntime(canonicalRootSnapshot);
    state=getActiveProgram();PLAN=state.days;WARMUPS=(state.warmupDefinitions&&state.warmupDefinitions.length)?state.warmupDefinitions:(trainingTrackerState.builtinWarmups||BUILTIN_WARMUPS);
    templateWarning=(typeof isStorageQuotaError==='function'&&isStorageQuotaError(error))?'训练计划已保存，但动作模板更新因存储空间不足未保存。':'训练计划已保存，但动作模板自动更新失败。';
  }
  rebuild();renderCalendar();renderHistory();alert(message+(templateWarning?'\n'+templateWarning:''));showTab('today');
  if(templateWarning)showToast(templateWarning);
}
function importApplyErrorMessage(error){
  if(typeof isStorageQuotaError==='function'&&isStorageQuotaError(error)) return '训练计划已经识别成功，但浏览器本地存储空间不足，因此没有保存新计划。当前计划未修改。';
  return '无法识别该训练计划，没有修改当前训练计划。\n'+(error&&error.message?error.message:error);
}
function applyImportPlan(){
  var committed=false;
  try{
    var program=programFromImportPreview();
    var exactDuplicate=typeof findDuplicateImportedProgram==='function'?findDuplicateImportedProgram(program):null;
    if(exactDuplicate){alert('当前已存在内容完全一致的计划：'+(exactDuplicate.name||exactDuplicate.sourceFileName||'未命名计划')+'。没有重复创建，也没有覆盖现有计划。');return;}
    var similarSource=typeof findImportedProgramBySource==='function'?findImportedProgramBySource(program.sourceFileName,(program.days||[]).length):null;
    var confirmText=similarSource?'当前已存在同名且 Workout 数量相同的计划，但内容不同。确认仍导入为新的 Program？不会覆盖现有计划。':'确认把“'+program.name+'”导入为新的训练计划？现有训练计划和记录不会被覆盖。';
    if(!confirm(confirmText)) return;
    var result=typeof addImportedProgram==='function'?addImportedProgram(program,true):{created:true,program:addProgram(program,true)};
    if(!result.created){alert('当前已存在来源相同的计划：'+(result.program.name||result.program.sourceFileName||'未命名计划')+'。没有重复创建，也没有覆盖现有计划。');return;}
    committed=true;
    refreshAfterProgramImport('已导入为新的训练计划：'+result.program.days.length+'天。');
  }catch(error){
    console.error(committed?'导入已保存，但后续页面刷新失败':'导入训练计划失败',error);
    alert(committed?('训练计划已保存，但页面刷新失败。请刷新页面后继续使用。\n'+(error&&error.message?error.message:error)):importApplyErrorMessage(error));
  }
}
function replaceCurrentWithImportPlan(){
  var committed=false;
  try{
    var program=programFromImportPreview();
    if(!confirm('确认替换当前训练计划？当前计划中的训练日、草稿和日志会被新的计划替换。其他训练计划不受影响。')) return;
    replaceActiveProgram(program);
    committed=true;
    refreshAfterProgramImport('已替换当前训练计划：'+program.days.length+'天。');
  }catch(error){
    console.error(committed?'替换已保存，但后续页面刷新失败':'替换训练计划失败',error);
    alert(committed?('训练计划已保存，但页面刷新失败。请刷新页面后继续使用。\n'+(error&&error.message?error.message:error)):importApplyErrorMessage(error));
  }
}
function resetImportedPlan(){
  if(!confirm('确认恢复示例计划？示例计划会作为新的训练计划加入，不覆盖当前训练日志。')) return;
  var program=createProgramFromPlan(BUILTIN_PLAN,{name:'示例训练计划',source:'builtin'});
  program.warmupDefinitions=BUILTIN_WARMUPS.slice();
  addProgram(program,true);refreshAfterProgramImport('已恢复示例训练计划。');
}
function fillImportHintA(){
  document.getElementById('importBox').value='周次\\t日期\\t星期\\t阶段\\t训练主题\\t热身模板\\t训练内容（组×次数/余力）\\t组间休息/规则\\n1\\t2025-12-29\\t周一\\t增肌期\\t下肢A\\t下肢退阶热身\\t高脚杯箱式深蹲 4×6-8（余力3-4）\\nRDL 3×8（余力2-3）\\t主项3分钟；大辅助90-120秒';
}
function fillImportHintB(){
  document.getElementById('importBox').value='顺序日\\t周次\\t周内日\\t类型\\t主题\\t今日内容（整格照做）\\t完成日期/备注\\n1\\t1\\t周一\\t训练日\\t第1周｜下肢A\\t【功能/热身】\\n- 90/90呼吸 2组×5次呼吸\\n- 高脚杯深蹲底部停留 2组×20秒\\n\\n【主训练】\\n1. 箱式高脚杯深蹲｜4组×10次｜余力3｜休75-90秒\\n   观察：全脚掌踩地\\n2. 腿举｜3组×12次｜余力2-3｜休75秒\\t';
}
function clearImportBox(){ document.getElementById('importBox').value=''; document.getElementById('importPreview').textContent='尚未预览。'; lastImportPreview=null; }

function rowsToDelimitedText(rows){
  var out=[];
  for(var i=0;i<rows.length;i++){
    var row=rows[i]||[];
    var cells=[];
    for(var j=0;j<row.length;j++){
      var v=row[j];
      if(v===undefined || v===null) v='';
      if(Object.prototype.toString.call(v)==='[object Date]'){
        try{ v=v.toISOString().slice(0,10); }catch(e){ v=String(v); }
      }
      v=String(v).replace(/\r\n/g,'\n').replace(/\r/g,'\n');
      cells.push(v);
    }
    out.push(cells.join('\t'));
  }
  return out.join('\n');
}
function normalizeExcelRows(rows){
  var clean=[];
  for(var i=0;i<rows.length;i++){
    var row=rows[i]||[];
    var arr=[];
    var has=false;
    for(var j=0;j<row.length;j++){
      var v=row[j];
      if(v===undefined || v===null) v='';
      if(typeof v==='number'){
        // Excel serial date fallback: only convert likely dates, otherwise keep number.
        if(v>20000 && v<60000){
          try{
            var d = XLSX.SSF.parse_date_code(v);
            if(d && d.y){ v = d.y+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0'); }
          }catch(e){}
        }
      }
      v=String(v).trim();
      if(v) has=true;
      arr.push(v);
    }
    if(has) clean.push(arr);
  }
  return clean;
}
function importExcelFile(file){
  var status=document.getElementById('fileImportStatus');
  var out=document.getElementById('importPreview');
  if(!file){ if(status) status.textContent='没有选择文件。'; return; }
  if(typeof XLSX==='undefined'){
    if(status) status.textContent='Excel 解析库没有加载成功。请保持联网后重新打开此 HTML，或临时用复制粘贴备用区。';
    if(out) out.textContent='无法读取 Excel：XLSX 解析库未加载。手机本地 HTML 容易失败，部署到 GitHub Pages 后再导入会稳定。';
    return;
  }
  if(status) status.textContent='正在读取：'+file.name;
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      var data=e.target.result;
      var wb=XLSX.read(data,{type:'array',cellDates:true});
      var parsed=parseWorkbookToImport(wb, file);
      parsed.sourceFileName=file.name;
      lastImportPreview=parsed;
      renderImportPrecheck(parsed,file.name);
      var first=parsed.plan[0]||{};
      var duplicateCount=(parsed.validation&&parsed.validation.duplicateDays&&parsed.validation.duplicateDays.length)||0;
      if(status) status.textContent='已读取：'+file.name+'｜导入方式：'+importAdapterLabel(parsed)+'｜工作表：'+(parsed.sheetName||'自动识别')+'｜训练日 '+parsed.plan.length+' 天';
      if(out) out.textContent='导入方式：'+importAdapterLabel(parsed)+'\nBuild：'+importBuildVersion()+'\n识别格式：'+parsed.type+'\n来源文件：'+file.name+'\n实际导入工作表：'+(parsed.sheetName||'自动识别')+'\n工作表候选排序：'+(parsed.candidates?parsed.candidates.join(' → '):'')+'\n训练日数量：'+parsed.plan.length+'\n热身模板数量：'+(parsed.warmups?parsed.warmups.length:'沿用表内热身模板')+'\n同日重复动作检查：'+(duplicateCount?('发现 '+duplicateCount+' 天，请先检查'):'未发现')+'\n\n第一天主题：'+(first['训练主题']||'')+'\n\n第一天热身内容：\n'+String(first['导入热身内容']||'').slice(0,500)+'\n\n第一天主训练内容：\n'+String(first['训练内容（组×次数/余力）']||'').slice(0,900)+'\n\n确认没问题后，点「导入为新的训练计划」。';
    }catch(err){
      lastImportPreview=null;
      renderImportPrecheck(null,file.name,err);
      if(status) status.textContent='无法识别该训练计划，没有修改当前训练计划。';
      if(out) out.textContent='无法识别该训练计划，没有修改当前训练计划。\n'+(err.message||err);
    }
  };
  reader.onerror=function(){
    lastImportPreview=null;
    if(status) status.textContent='文件读取失败。';
    if(out) out.textContent='文件读取失败。';
    renderImportPrecheck(null,file.name,new ImportError('文件读取失败。','FILE_READ_FAILED'));
  };
  reader.readAsArrayBuffer(file);
}
