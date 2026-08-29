# Training Plan Handoff v1

本文档定义“训练规划 AI → Codex”之间的训练内容协议。它不定义 Excel 列名，也不负责训练器内部数据结构。

- `TRAINING_PLAN_HANDOFF.md`：训练规划 AI 应提供什么内容。
- `IMPORT_FORMAT_V1.md`：Codex 生成的 Excel 与 importer 之间的机器接口。
- `plan-compiler.js`：把已经确定的训练内容转换为当前 Structured Import 数据。

训练规划 AI 负责决定练什么、为什么这么练、每组怎么练。Codex 只负责忠实转换、生成技术 ID、生成 Excel 并运行 validation。

## 1. Program

必需字段：

```text
programName
```

可选字段：

```text
description
cycleLength
startDate
```

`startDate` 使用 `YYYY-MM-DD`。训练规划 AI 不需要提供 `programId`。

## 2. Workout

每个 Workout 必须提供：

```text
title
order
exercises
```

可选字段：

```text
plannedDate
targetDurationMin
notes
supersets
```

`plannedDate` 使用 `YYYY-MM-DD`。`targetDurationMin` 使用分钟，只表达规划方已经确定的目标时长。

## 3. Exercise

每个 Exercise 必须提供：

```text
name
section
trainingRole
order
sets
```

处方字段按实际需要提供：

```text
repsMin
repsMax
rirMin
rirMax
restMinSec
restMaxSec
```

可选字段：

```text
recommendedWeight
unit
durationSec
note
setPrescriptions
```

上下限字段必须成对提供或同时省略。时间统一使用秒；建议重量只写数值，单位单独使用 `kg` 或 `lb`。

`section` 合法值以 `IMPORT_FORMAT_V1.md` 为准：

```text
功能模块
主项
主辅助
辅助
核心
康复/辅助
有氧
恢复
休息
```

`trainingRole` 只允许：

```text
pattern
hypertrophy
isolation
skill-acquisition
skill-retention
```

训练规划 AI 不需要提供 `exerciseId`。

## 4. Set Prescription

只有同一动作的某些组与动作默认处方不同时，才提供 `setPrescriptions`。

每个特殊组必须提供：

```text
setNo
setType
```

可提供覆盖字段：

```text
repsMin
repsMax
rirMin
rirMax
restMinSec
restMaxSec
loadAdjustmentType
loadAdjustmentValue
techniqueCue
```

`setType` 只允许：

```text
working
technique
warmup
top
backoff
dropset
```

`loadAdjustmentType` 只允许 `percent` 或 `absolute`。类型和值必须同时提供。

格式示例，不代表训练建议：

```yaml
name: 绳索侧平举
sets: 4
repsMin: 12
repsMax: 15
rirMin: 2
rirMax: 3
setPrescriptions:
  - setNo: 1
    setType: technique
    repsMin: 12
    repsMax: 15
    rirMin: 3
    rirMax: 3
    techniqueCue: 肩胛稳定，避免耸肩
  - setNo: 2
    setType: technique
    repsMin: 12
    repsMax: 15
    rirMin: 3
    rirMax: 3
    techniqueCue: 保持轨迹，控制离心
  - setNo: 3
    setType: working
    repsMin: 12
    repsMax: 15
    rirMin: 2
    rirMax: 3
  - setNo: 4
    setType: backoff
    repsMin: 15
    repsMax: 20
    rirMin: 1
    rirMax: 2
    loadAdjustmentType: percent
    loadAdjustmentValue: -15
    techniqueCue: 减重约15%，保持动作质量
```

## 5. Superset

交替超级组放在所属 Workout 的 `supersets` 中。

必须提供：

```text
members
mode
transitionMinSec
transitionMaxSec
roundRestMinSec
roundRestMaxSec
```

可选字段：

```text
groupName
note
```

第一版 `mode` 只允许：

```text
alternating
```

`members` 推荐使用同一 Workout 内的 Exercise `order`，例如 `[3, 4]`。也可以使用动作名称，但同一 Workout 存在重名动作时必须改用 `order`，避免歧义。

训练规划 AI 不需要提供 `超级组ID`。Codex 按工作簿顺序自动生成 `SS01`、`SS02`。

## 6. 训练规划 AI 不维护的技术字段

外部训练规划 AI 不需要维护：

```text
schemaVersion
programId
workoutId
exerciseId
setId
超级组ID
Sheet 名称
Excel 列顺序
Structured Import 内部字段映射
```

这些字段全部由 Codex 转换层和训练器负责。

## 7. 纯文本交接

用户可以直接提供结构化 Markdown、YAML-like 文本或 JSON，不需要手工编辑 Excel。

处理流程：

```text
训练规划 AI 的纯文本结构稿
→ Codex 按本文档归一化为内容对象
→ compileTrainingPlan(input)
→ Structured Import workbook data
→ Excel
→ import-validator.js
→ 0 errors 后交付
```

`plan-compiler.js` 直接接受对象或 JSON 文本。Markdown / YAML-like 文本由 Codex 读取并按本文档归一化；编译器不做自然语言训练学推断。

## 8. 最小完整示例

以下只展示内容结构，不是默认训练计划：

```yaml
programName: 示例周期
workouts:
  - title: 上肢A
    order: 1
    targetDurationMin: 60
    exercises:
      - name: 杠铃卧推
        section: 主项
        trainingRole: pattern
        order: 1
        sets: 3
        repsMin: 5
        repsMax: 6
        rirMin: 3
        rirMax: 3
        restMinSec: 150
        restMaxSec: 180
      - name: 上斜史密斯卧推
        section: 主辅助
        trainingRole: hypertrophy
        order: 2
        sets: 3
        repsMin: 8
        repsMax: 10
        rirMin: 1
        rirMax: 2
        restMinSec: 120
        restMaxSec: 150
      - name: 绳索弯举
        section: 辅助
        trainingRole: isolation
        order: 3
        sets: 3
        repsMin: 10
        repsMax: 12
        rirMin: 2
        rirMax: 2
      - name: 绳索下压
        section: 辅助
        trainingRole: isolation
        order: 4
        sets: 3
        repsMin: 10
        repsMax: 12
        rirMin: 2
        rirMax: 2
    supersets:
      - groupName: 手臂A
        members: [3, 4]
        mode: alternating
        transitionMinSec: 0
        transitionMaxSec: 15
        roundRestMinSec: 75
        roundRestMaxSec: 90
```

Codex 会自动生成 `W001`、`W001-E01` 至 `W001-E04` 和 `SS01`，再生成最新版 Excel 并运行 Structured Import validation。

## 9. 禁止的转换行为

Codex 和 `plan-compiler.js` 不得根据动作名称推断：

- `trainingRole`
- `setType`
- 休息时间
- 超级组关系
- RIR
- 技术提示

禁止加入动作名称特判，例如 `exercise.name.includes(...)`。缺少训练内容字段时必须报错或交回训练规划层补充，不能自行设计。
