import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

export class MemoryStorage {
  constructor(seed={}){this.data=new Map(Object.entries(seed));}
  getItem(key){return this.data.has(key)?this.data.get(key):null;}
  setItem(key,value){this.data.set(String(key),String(value));}
  removeItem(key){this.data.delete(String(key));}
  clear(){this.data.clear();}
  keys(){return [...this.data.keys()];}
}

export function createContext(storage=new MemoryStorage()){
  const context={
    console,
    localStorage:storage,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Object,
    Array,
    Map,
    Error,
    confirm:()=>true,
    alert:()=>{},
    document:{querySelector:()=>null,createElement:()=>({}),body:{appendChild(){},removeChild(){}}},
    URL:{createObjectURL:()=>'',revokeObjectURL(){}},
    Blob:class Blob {}
  };
  context.window=context;
  vm.createContext(context);
  return context;
}

export function loadScript(context,file){
  vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
  return context;
}

export function loadStorage(storage=new MemoryStorage()){
  const context=createContext(storage);
  loadScript(context,'prescription.js');
  loadScript(context,'storage.js');
  loadScript(context,'program-store.js');
  return context;
}

export function loadImporter(storage=new MemoryStorage()){
  const context=createContext(storage);
  context.normalizeExcelRows=rows=>(rows||[]).filter(row=>row.some(cell=>String(cell??'').trim())).map(row=>row.map(cell=>String(cell??'').trim()));
  loadScript(context,'prescription.js');
  loadScript(context,'parser.js');
  loadScript(context,'import-validator.js');
  loadScript(context,'importer.js');
  loadScript(context,'program-store.js');
  return context;
}

export function loadTrainingModules(storage=new MemoryStorage()){
  const context=createContext(storage);
  context.normalizeExcelRows=rows=>(rows||[]).filter(row=>row.some(cell=>String(cell??'').trim())).map(row=>row.map(cell=>String(cell??'').trim()));
  loadScript(context,'prescription.js');
  loadScript(context,'storage.js');
  loadScript(context,'parser.js');
  loadScript(context,'history.js');
  loadScript(context,'import-validator.js');
  loadScript(context,'importer.js');
  loadScript(context,'program-store.js');
  return context;
}

export const samplePlan=[
  {'周次':1,'日期':'2026-01-01','星期':'周一','训练主题':'下肢A','热身模板':'下肢热身','训练内容（组×次数/余力）':'前蹲 3x5（余力3）','组间休息/规则':'主项180秒'},
  {'周次':1,'日期':'2026-01-02','星期':'周二','训练主题':'上肢A','热身模板':'上肢热身','训练内容（组×次数/余力）':'卧推 3x5（余力3）','组间休息/规则':'主项180秒'}
];

export const sampleWarmups=[{name:'下肢热身',steps:'踝背屈 2x10'}];
