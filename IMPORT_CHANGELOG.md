# Training Plan Import Changelog

本文件记录会影响 Structured Import、Excel 字段、Sheet、trainingRole、Set Prescription、Superset、时间预算或 validation 的接口变化。

## 2026-08-30

新增：

- `Long-form Daily Grid Adapter v1`，用于逐日一格、富文本训练计划。
- Section 语义解析，说明块不会生成 Exercise。
- 逐组 RIR、多个独立超级组、Activity 和 multi-stage drop set 执行语义。
- 有氧、攀岩、技能和恢复 Activity。
- Long-form Preview 语义统计、validation 结果和预计存储容量。
- 稳定 `sourceWorkoutKey`，用于训练执行身份对账；运行时 `workoutId` 仍由训练器维护。

兼容与边界：

- App State 继续使用 Schema v6；新增字段全部 optional，不触发 v7 migration。
- Structured Import v1 协议没有增加列、Sheet 或枚举。
- Structured Import v1 尚不能完整表达 Activity、攀岩任务和 multi-stage segments。
- Long-form adapter capability 暂时大于 Structured Import v1 capability。
- 后续协议扩展必须作为独立 Structured Import v1.1 optional extension 设计。
- Legacy 徐晖版、肖悦版和旧 Structured Import v1 继续走原有兼容路径。
- 真实用户 Excel 和本地存档不作为测试 fixture 提交。

存储：

- Preview 只估算 Program、当前 ROOT 和导入后 ROOT，不写 localStorage。
- 实际导入仍以 candidate clone 原子写入；写入失败时当前 ROOT、activeProgramId、日志、日期和历史保持不变。
- 容量显示是估算，各浏览器实际配额不同，不把 5 MB 当作固定上限。

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
