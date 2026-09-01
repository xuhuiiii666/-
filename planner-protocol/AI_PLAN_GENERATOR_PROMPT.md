# AI 训练计划生成入口

先完整阅读同目录的 `PLANNER_IMPORT_V2_SPEC.md`。该文件是唯一协议真相。

然后严格填写 `templates/训练计划导入母模板_v2.xlsx`，生成可导入的 `.xlsx` 训练计划。

要求：

- 不修改任何 Sheet 名、机器列名或列顺序。
- 不自创 enum，不用自然语言替代结构化字段。
- 保持稳定 source key；一个 Set 或 Segment 只占一行。
- Activity、Instruction 与 Exercise 必须按协议分开。
- `targetWeight` 只表示计划目标重量，不是实际训练记录。
- 输出前按 SPEC 的“最终交付检查清单”逐项自检。
- 只有预期达到 `0 ERROR` 且 `Semantic validation = PASS` 时才交付。

