# Training Plan Import Changelog

本文件记录会影响 Structured Import、Excel 字段、Sheet、trainingRole、Set Prescription、Superset、时间预算或 validation 的接口变化。

## 2026-08-29

新增：

- `TRAINING_PLAN_HANDOFF.md`，定义训练规划 AI 与 Codex 的内容交接协议。
- `plan-compiler.js`，把已确定的训练内容转换为 Structured Import workbook data。
- 主表可选列 `trainingRole`。
- 主表可选列 `targetDurationMin`。
- 可选工作表 `超级组规则_v1`。
- `alternating` 超级组规则，包括动作间过渡秒数和轮间休息秒数。
- 自动生成稳定 `workoutId`、`exerciseId` 和 `超级组ID`。
- 编译结果自动调用 Structured Import validator。

兼容：

- `schemaVersion` 保持为 `1`。
- 不含 `trainingRole`、`targetDurationMin` 或 `超级组规则_v1` 的旧 Structured Import v1 文件继续有效。
- Legacy Import 继续兼容徐晖版、肖悦版及原逐日执行格式。
- 不改变 `training-tracker-state`、Schema v6 或任何已有 Program 数据。

职责边界：

- 本次只增加内容转换和导入接口字段，不增加训练建议、训练推荐或动作名称推断。
