/* Nutrition is calendar-based, profile-owned and independent of workout execution. */
(function(global){
  'use strict';
  const clone=value=>JSON.parse(JSON.stringify(value));
  const MEALS=['早餐','午餐','晚餐','加餐'];
  const NUTRIENTS=['kcal','protein','carbs','fat'];
  const fail=message=>{throw new Error(message);};
  const id=()=>global.crypto&&global.crypto.randomUUID?global.crypto.randomUUID():'n_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2);
  function localDate(date=new Date()){return [date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');}
  function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(value)&&!isNaN(Date.parse(value))&&new Date(value+'T12:00:00Z').toISOString().slice(0,10)===value;}
  function shiftDate(date,days){if(!validDate(date))fail('日期无效。');const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
  function number(value,max=100000){if(value===''||value===undefined||value===null)return null;const n=Number(value);if(!Number.isFinite(n)||n<0||n>max)fail('数值必须为合理范围内的非负数。');return n;}
  function empty(){return {version:1,cycles:[],days:{},metrics:{}};}
  function read(profile){const data=profile&&profile.nutrition;if(!data)return empty();return validateData(data);}
  function validateData(data){
    const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
    if(data.version!==1||!Array.isArray(data.cycles)||!object(data.days)||!object(data.metrics))fail('饮食数据版本或结构不兼容，已停止修改。');
    const checkedFoods=foods=>{
      if(!Array.isArray(foods))fail('食品列表无效。');
      foods.forEach(f=>{
        if(!object(f)||typeof f.name!=='string'||!f.name.trim()||!['g','mL','份','个'].includes(f.unit)||f.basis!==(['g','mL'].includes(f.unit)?100:1)||!object(f.nutrients))fail('食品单位或营养基准无效。');
        for(const n of [f.quantity,...NUTRIENTS.map(k=>f.nutrients[k])])if(n!==null&&(typeof n!=='number'||!Number.isFinite(n)||n<0))fail('食品数值无效。');
      });
    };
    const mealList=meals=>{if(!Array.isArray(meals)||meals.length!==MEALS.length||meals.some((m,i)=>!object(m)||m.mealId!=='meal-'+i))fail('餐次结构无效。');};
    const cycleIds=new Set();
    for(const c of data.cycles){
      if(!c.cycleId||cycleIds.has(c.cycleId)||!validDate(c.startDate)||!validDate(c.endDate)||c.startDate>c.endDate||!['regular','travel'].includes(c.kind))fail('周期方案无效。');
      cycleIds.add(c.cycleId);mealList(c.meals);c.meals.forEach(m=>checkedFoods(m.foods));number(c.proteinTarget,1000);
    }
    for(const [date,day] of Object.entries(data.days)){
      if(!validDate(date)||!object(day)||day.date!==date)fail('饮食记录日期无效。');mealList(day.meals);number(day.proteinTarget,1000);
      for(const meal of day.meals){if(!['pending','confirmed','estimated'].includes(meal.status))fail('餐次状态无效。');checkedFoods(meal.planned);if(meal.status==='pending'){if(meal.actual!==null)fail('未记录餐次不能包含实际摄入。');}else checkedFoods(meal.actual);}
    }
    for(const [date,metric] of Object.entries(data.metrics)){if(!validDate(date)||!object(metric))fail('身体记录日期无效。');for(const k of ['weight','waist','steps','zone2','sleepHours'])if(metric[k]!==null&&(typeof metric[k]!=='number'||!Number.isFinite(metric[k])||metric[k]<0))fail('身体记录数值无效。');}
    return data;
  }
  function food(input){
    const name=String(input.name||'').trim();if(!name)fail('请填写具体食品名称。');
    const unit=input.unit||'g';if(!['g','mL','份','个'].includes(unit))fail('食品单位不支持。');
    const values={};NUTRIENTS.forEach(k=>values[k]=number(input.nutrients&&input.nutrients[k],100000));
    return {foodId:input.foodId||id(),name,quantity:number(input.quantity),unit,basis:['g','mL'].includes(unit)?100:1,nutrients:values,note:String(input.note||'')};
  }
  function normalizeCycle(input){
    if(!String(input.name||'').trim())fail('请填写方案名称。');
    if(!validDate(input.startDate)||!validDate(input.endDate)||input.startDate>input.endDate)fail('请检查方案起止日期。');
    if(!['regular','travel'].includes(input.kind))fail('请选择常规或出差方案。');
    const meals=MEALS.map((name,i)=>({mealId:'meal-'+i,name,foods:((input.meals||[])[i]?.foods||[]).map(food)}));
    if(!meals.some(m=>m.foods.length))fail('请至少添加一种食品或饮品。');
    return {cycleId:input.cycleId||id(),name:input.name.trim(),kind:input.kind,startDate:input.startDate,endDate:input.endDate,
      proteinTarget:number(input.proteinTarget,1000),meals,version:input.version||1};
  }
  function saveCycle(data,input){
    const next=clone(data),cycle=normalizeCycle(input),old=next.cycles.find(c=>c.cycleId===cycle.cycleId);
    if(next.cycles.some(c=>c.cycleId!==cycle.cycleId&&c.kind===cycle.kind&&c.startDate<=cycle.endDate&&cycle.startDate<=c.endDate))fail('同类型方案日期重叠，请调整日期；出差方案可以覆盖常规方案。');
    cycle.version=old?old.version+1:1;
    next.cycles=next.cycles.filter(c=>c.cycleId!==cycle.cycleId).concat(cycle);return next;
  }
  function deleteCycle(data,cycleId){const next=clone(data);next.cycles=next.cycles.filter(c=>c.cycleId!==cycleId);return next;}
  function preview(data,date){
    if(!validDate(date))fail('日期无效。');if(data.days[date])return clone(data.days[date]);
    const matches=data.cycles.filter(c=>c.startDate<=date&&c.endDate>=date).sort((a,b)=>(b.kind==='travel')-(a.kind==='travel'));
    const cycle=matches[0];
    return snapshot(cycle,date);
  }
  function snapshot(cycle,date){return {date,cycleId:cycle?.cycleId||null,cycleName:cycle?.name||'未设置方案',cycleVersion:cycle?.version||null,proteinTarget:cycle?.proteinTarget??null,
    meals:(cycle?clone(cycle.meals):MEALS.map((name,i)=>({mealId:'meal-'+i,name,foods:[]}))).map(m=>({mealId:m.mealId,name:m.name,planned:m.foods,actual:null,status:'pending',note:''}))};}
  function chooseCycle(data,date,cycleId){
    const current=preview(data,date);if(current.meals.some(m=>m.status!=='pending'))fail('当天已有实际记录，不能更换整日模板；请逐餐修改，避免覆盖记录。');
    const cycle=data.cycles.find(c=>c.cycleId===cycleId);if(!cycle)fail('方案不存在。');
    const next=clone(data);next.days[date]=snapshot(cycle,date);return next;
  }
  function saveMeal(data,date,mealId,input){
    const next=clone(data),day=preview(data,date),meal=day.meals.find(m=>m.mealId===mealId);if(!meal)fail('餐次不存在。');
    if(!['confirmed','estimated','pending'].includes(input.status))fail('记录状态无效。');
    meal.status=input.status;meal.note=String(input.note||'');meal.actual=input.status==='pending'?null:(input.foods||[]).map(food);
    next.days[date]=day;return next;
  }
  function confirmPlanned(data,date,mealId){const day=preview(data,date),meal=day.meals.find(m=>m.mealId===mealId);return saveMeal(data,date,mealId,{status:'confirmed',foods:meal.planned,note:meal.note});}
  function confirmDay(data,date){let next=clone(data);for(const meal of preview(data,date).meals)if(meal.status==='pending'&&meal.planned.length)next=confirmPlanned(next,date,meal.mealId);return next;}
  function totals(foods){
    const result={};for(const key of NUTRIENTS){let value=0,unknown=0;for(const item of foods){if(item.quantity===null||item.nutrients[key]===null)unknown++;else value+=item.quantity/item.basis*item.nutrients[key];}result[key]=unknown?null:value;result[key+'Known']=value;result[key+'Unknown']=unknown;}return result;
  }
  function summary(day){
    const recorded=day.meals.filter(m=>m.status!=='pending'),pending=day.meals.filter(m=>m.status==='pending'&&m.planned.length);
    const anyPending=day.meals.filter(m=>m.status==='pending');
    const actual=totals(recorded.flatMap(m=>m.actual||[])),planned=totals(day.meals.flatMap(m=>m.planned));
    if(recorded.some(m=>m.status==='estimated'&&!m.actual?.length))for(const key of NUTRIENTS){actual[key]=null;actual[key+'Unknown']++;}
    return {planned,actual,recorded:recorded.length,pending:pending.length,unrecorded:anyPending.length,estimated:recorded.filter(m=>m.status==='estimated').length,
      complete:recorded.length===day.meals.length,hasRecord:recorded.length>0};
  }
  function saveMetrics(data,date,input){
    if(!validDate(date))fail('日期无效。');const next=clone(data),metric={};
    const limits={weight:1000,waist:500,steps:200000,zone2:1440,sleepHours:24};
    for(const key of Object.keys(limits))metric[key]=number(input[key],limits[key]);
    if(metric.weight===0||metric.waist===0)fail('体重和腰围不能为 0；未测量请留空。');
    metric.note=String(input.note||'');next.metrics[date]=metric;return next;
  }
  function weekly(data,endDate){
    const dates=Array.from({length:7},(_,i)=>shiftDate(endDate,i-6)),days=dates.map(d=>({date:d,day:preview(data,d),metric:data.metrics[d]||{}}));
    const avg=values=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;
    const weights=days.filter(d=>d.metric.weight!=null).map(d=>d.metric.weight);
    const summaries=days.map(d=>summary(d.day)),full=summaries.filter(s=>s.complete&&s.actual.kcal!==null);
    const proteins=summaries.filter(s=>s.complete&&s.actual.protein!==null);
    const steps=days.filter(d=>d.metric.steps!=null).map(d=>d.metric.steps),zone=days.filter(d=>d.metric.zone2!=null).map(d=>d.metric.zone2);
    return {dates,days,weightMean:avg(weights),weightDays:weights.length,intakeMean:avg(full.map(s=>s.actual.kcal)),intakeDays:full.length,
      proteinMean:avg(proteins.map(s=>s.actual.protein)),proteinDays:proteins.length,recordedDays:summaries.filter(s=>s.hasRecord).length,
      estimatedDays:summaries.filter(s=>s.estimated>0).length,stepsMean:avg(steps),stepsDays:steps.length,zone2:zone.length?zone.reduce((a,b)=>a+b,0):null,zone2Days:zone.length};
  }
  // Old training-only backups must never erase independently collected nutrition.
  function protectBackup(current,incoming){
    for(const [profileId,profile] of Object.entries(current?.profiles||{})){
      if(!profile.nutrition)continue;
      if(!incoming.profiles?.[profileId])fail('此备份缺少有饮食记录的用户档案，已停止恢复，未修改当前数据。请先导出完整存档。');
      if(incoming.profiles[profileId].nutrition===undefined)incoming.profiles[profileId].nutrition=clone(profile.nutrition);
    }
    for(const profile of Object.values(incoming.profiles||{}))if(profile.nutrition)read(profile);
    return incoming;
  }
  global.NutritionModel={MEALS,NUTRIENTS,empty,read,food,localDate,validDate,shiftDate,saveCycle,deleteCycle,preview,chooseCycle,saveMeal,confirmPlanned,confirmDay,totals,summary,saveMetrics,weekly,protectBackup};
})(typeof window!=='undefined'?window:globalThis);
