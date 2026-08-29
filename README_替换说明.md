# GitHub 替换包说明

把这个文件夹里的文件上传到 GitHub 仓库根目录，覆盖同名文件即可。

需要上传的文件：

- `index.html`
- `style.css`
- `app.js`
- `importer.js`
- `import-validator.js`
- `plan-compiler.js`
- `parser.js`
- `storage.js`
- `program-store.js`
- `templates.js`
- `prescription.js`
- `history.js`
- `STATE_ARCHITECTURE.md`
- `IMPORT_FORMAT_V1.md`
- `TRAINING_PLAN_HANDOFF.md`
- `IMPORT_CHANGELOG.md`
- `AGENTS.md`
- `package.json`
- `tests/`

## 本地存档不会丢

训练记录、导入计划、动作库、热身库都保存在浏览器 `localStorage` 里。

这版使用一个稳定的根存储键：

```js
training-tracker-state
```

如果浏览器仍使用更早的旧键，首次打开新版时会自动读取：

- `xuhui_training_v2_dailygrid`
- `xuhui_training_v2_dailygrid_importedPlan`
- `xuhui_training_v2_dailygrid_importedWarmups`

迁移成功后，计划、训练日志、重量、模板、日期和设置都会进入新根状态。旧键随后清理，避免多个版本各写一套状态。

已经使用 Schema v5 根状态的设备会先在本机自动建立：

```js
training-tracker-state-pre-v6-backup
```

然后在状态副本上执行 v5 → v6 增量迁移。Program、当前训练日、草稿重量、训练日志、动作历史、模板和 RM 记录全部通过完整性校验后，才会写回正式根键。迁移失败不会覆盖原状态。参数设置中会出现弱化的“恢复升级前本地数据”入口，并要求二次确认。

只要你：

1. 继续用同一个浏览器打开同一个 GitHub Pages 地址；
2. 不清空浏览器网站数据；
3. 不手动修改 `training-tracker-state`；

原来的本地存档就会自动迁移并继续读取。`actualDates` / `actualDate` 仍用于锁定实际训练日期；旧日志不会删除。

## 训练计划现在彼此独立

Excel 默认会“导入为新的训练计划”，不会覆盖当前计划。需要覆盖时，必须单独点击“替换当前计划”并确认。

在“日历/顺延”页可以切换不同训练计划。每个计划各自保存当前训练、草稿、日期和训练日志。

## 回归测试

项目包含 75 项状态、无损迁移、旧格式导入、Structured v1、组处方、动作历史和计划编译回归测试，其中 16 项专门覆盖 v5 → v6 升级，20 项覆盖 Structured Import v1 固定协议，17 项覆盖训练内容交接编译：

```bash
npm test
```

## 新版结构化计划

训练器不设计训练计划，也不在页面里生成 Excel。训练规划 AI 按 `TRAINING_PLAN_HANDOFF.md` 提供训练内容，Codex 使用 `plan-compiler.js` 转换为 `IMPORT_FORMAT_V1.md` 规定的 workbook data，再生成官方 Excel 并完成严格 validation。

Structured v1 校验失败时，当前训练计划完全不变，也不会回退到任何示例计划。原有徐晖版、肖悦版、手机查看版、一日一格和逐日执行 Excel 仍继续兼容。

## 上传前建议

在旧页面里先点一次「总存档导出」或「导出周期备份」，留一个 JSON 备份。这个不是因为替换会清空，而是防止浏览器、手机系统或 GitHub Pages 缓存带来的意外。

## 替换后如果页面没有变化

浏览器可能缓存了旧文件。可以刷新几次，或在地址后加：

```text
?v=20260829
```

例如：

```text
https://xuhuiiii666.github.io/-/?v=20260829
```
