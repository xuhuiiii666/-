import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {loadImporter} from './helpers.mjs';
import {longFormRows,workbookFromLongFormRows} from './fixtures/long-form-daily-fixture.mjs';

const RELEASE='20260831-longform-history-1';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('V1. 所有本地 CSS 和 JS 使用统一 release query',()=>{
  const urls=[...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(match=>match[1]).filter(url=>!/^https?:\/\//.test(url));
  assert.ok(urls.length>=16);
  for(const url of urls)assert.equal(new URL(url,'https://example.test/').searchParams.get('v'),RELEASE,url);
});

test('V2. 设置页暴露集中 Build 标识',()=>{
  assert.match(html,new RegExp("window\\.APP_BUILD_VERSION='"+RELEASE+"'"));
  assert.match(html,/Build: <span id="appBuildVersion">/);
});

test('V3. Long-form Preview 同时显示 Adapter 与 Build',()=>{
  const app=loadImporter();app.APP_BUILD_VERSION=RELEASE;
  const parsed=app.parseWorkbookToImport(workbookFromLongFormRows(),{name:'匿名.xlsx'});
  const preview=app.importPrecheckText(parsed,'匿名.xlsx');
  assert.match(preview,/导入方式：Long-form Daily Grid/);
  assert.match(preview,new RegExp('Build：'+RELEASE));
  assert.equal(parsed.plan.length,longFormRows.length-1);
});
