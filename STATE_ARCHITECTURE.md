# Training Tracker 状态架构

## 唯一持久化根

所有业务状态只写入：

```text
training-tracker-state
```

`storage.js` 负责加载、保存、旧数据迁移、周期备份导出和周期备份导入。

## Schema v6

```js
{
  schemaVersion: 6,
  activeProfileId,
  activeProgramId,
  profiles: {
    [profileId]: {
      programs: {
        [programId]: {
          programId,
          name,
          source,
          sourceFileName,
          days,
          currentWorkoutId,
          actualDates,
          completed,
          currentWorkoutDrafts,
          workoutLogs
        }
      },
      exerciseTemplates,
      warmupTemplates,
      warmupActionTemplates,
      rmRecords
    }
  },
  ui: {}
}
```

Schema v6 在 Schema v5 的稳定身份模型上增加正式组处方：

```js
exercise.prescription = {
  repsMin, repsMax,
  rirMin, rirMax,
  restMin, restMax,
  recommendedWeight,
  unit
}

set = {
  setId,
  setNo,
  setType,
  targetRepsMin,
  targetRepsMax,
  targetRirMin,
  targetRirMax,
  targetRestMin,
  targetRestMax,
  loadAdjustmentType,
  loadAdjustmentValue,
  techniqueCue,
  weight,
  weightKg,
  reps,
  rir,
  rest
}
```

旧动作没有 `prescription` 时自动从原计划参数补齐；旧组没有 `setType` 时迁移为 `working`。迁移只增加字段，不覆盖重量、次数、RIR、日志或动作历史。

### v5 到 v6 的无损迁移

检测到 `schemaVersion < 6` 时，`storage.js` 会先把根状态的原始 JSON 保存到：

```text
training-tracker-state-pre-v6-backup
```

随后只在深拷贝上补充 v6 字段，并校验 Program、Workout、训练日志、历史 entry、有重量 entry、模板和当前草稿组的数量。`workoutLogs` 还会进行完整 JSON 对比。只有全部校验通过，迁移后的状态才会一次性写回 `training-tracker-state`；任何异常都会停止写入，旧根状态和安全快照均保留。

参数设置中的“恢复升级前本地数据”只在存在安全快照时显示，并要求二次确认。安全快照不会在恢复或迁移成功后自动删除。

示例计划只允许在 `training-tracker-state` 和旧版训练器数据都不存在的首次打开场景创建。已有根状态缺少当前 Profile 或 Program 时会直接报错，不会用示例计划补位。

每个训练日使用稳定 `workoutId`，每个动作使用稳定 `exerciseId`，每一组使用稳定 `setId`。数组顺序只负责显示，不再作为对象身份。

## 导入边界

Excel 只先生成预览对象。识别失败会抛出 `ImportError`，不会修改活动计划。

成功预览后有两个明确入口：

- 导入为新的训练计划：新增 Program，并保留所有现有计划。
- 替换当前计划：确认后只替换当前 Program，其他 Program 不受影响。

内置示例计划只在首次初始化或用户明确点击“恢复示例计划”时创建。

Structured Import v1 的固定协议见 `IMPORT_FORMAT_V1.md`。只要存在 `训练器数据_v1`，结构化校验失败就终止导入，绝不回退到旧解析器或示例计划。

## 模块边界

- `prescription.js`：组处方归一化、六种 setType、处方摘要和局部更新。
- `history.js`：从 workoutLogs 重建 exerciseHistory、上次同名、完整历史弹窗。
- `importer.js`：工作簿识别、结构化协议校验、旧格式兼容和导入预检查。
- `parser.js`：旧格式文本动作解析，保持兼容。
- `storage.js`：唯一根状态、Schema 迁移、备份导入导出。
- `app.js`：页面控制与训练执行协调；倒计时实现保持原样。
