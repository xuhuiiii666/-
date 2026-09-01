import {execFileSync} from 'node:child_process';

const unzip=(file,entry)=>execFileSync('unzip',['-p',file,entry],{encoding:'utf8',maxBuffer:32*1024*1024});
const decode=value=>String(value??'')
  .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"')
  .replace(/&apos;/g,"'").replace(/&amp;/g,'&').replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code)));
const attr=(source,name)=>decode((source.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))||[])[1]||'');
const columnIndex=reference=>{
  const letters=(String(reference).match(/^[A-Z]+/)||['A'])[0];
  return [...letters].reduce((value,letter)=>value*26+letter.charCodeAt(0)-64,0)-1;
};
const richText=source=>[...source.matchAll(/<[^:>]*:?t(?:\s[^>]*)?>([\s\S]*?)<\/[^:>]*:?t>/g)].map(match=>decode(match[1])).join('');

function sharedStrings(file){
  try{return [...unzip(file,'xl/sharedStrings.xml').matchAll(/<[^:>]*:?si(?:\s[^>]*)?>([\s\S]*?)<\/[^:>]*:?si>/g)].map(match=>richText(match[1]));}
  catch{return [];}
}

function sheetRows(xml,shared){
  const rows=[];
  for(const rowMatch of xml.matchAll(/<[^:>]*:?row(?:\s[^>]*)?>([\s\S]*?)<\/[^:>]*:?row>/g)){
    const row=[];
    for(const cellMatch of rowMatch[1].matchAll(/<[^:>]*:?c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/[^:>]*:?c>)/g)){
      const attributes=cellMatch[1],body=cellMatch[2]||'',index=columnIndex(attr(attributes,'r')),type=attr(attributes,'t');
      const raw=(body.match(/<[^:>]*:?v>([\s\S]*?)<\/[^:>]*:?v>/)||[])[1]??'';
      let value=type==='inlineStr'?richText(body):decode(raw);
      if(type==='s')value=shared[Number(value)]??'';
      else if(type==='b')value=value==='1'?'TRUE':'FALSE';
      else if(type==='n'&&value!=='')value=Number(value);
      row[index]=value;
    }
    rows.push(row);
  }
  return rows;
}

export function readXlsxWorkbook(file){
  const workbookXml=unzip(file,'xl/workbook.xml'),relsXml=unzip(file,'xl/_rels/workbook.xml.rels'),shared=sharedStrings(file),targets={};
  for(const match of relsXml.matchAll(/<Relationship\s([^>]+?)\s*\/>/g))targets[attr(match[1],'Id')]=attr(match[1],'Target').replace(/^\//,'');
  const workbook={SheetNames:[],Sheets:{}};
  for(const match of workbookXml.matchAll(/<[^:>]*:?sheet\s([^>]+?)\s*\/>/g)){
    const name=attr(match[1],'name'),id=attr(match[1],'r:id')||attr(match[1],'id'),target=targets[id];
    workbook.SheetNames.push(name);workbook.Sheets[name]=sheetRows(unzip(file,target),shared);
  }
  return workbook;
}
