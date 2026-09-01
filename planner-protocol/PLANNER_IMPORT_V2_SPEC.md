# Planner Import v2.0 Specification

Protocol：`planner-import-v2`  
Protocol Version：`2.0`  
Schema：`2`  
Status：`FROZEN`

Planner Import v2.0 冻结以下兼容边界：Sheet 名、canonical 列名、canonical enum 语义、stable source key 语义和 foreign-key 关系。后续向后兼容扩展进入 `2.x`；任何破坏兼容的修改必须进入 `v3`。

本文档是 Planner Import v2 的 **Single Source of Truth**。任何 AI、人工编辑器、Excel 生成器和训练器 Validator 都必须遵守本文档；不需要阅读训练器源码。

## 给 AI 的强制执行规则

你负责填写训练内容，不得修改协议格式。

严禁：

- 修改 Sheet 名或机器列名、列顺序。
- 自创 enum，或在 canonical enum 字段中填写自由中文文本。
- 合并字段、删除必填字段、合并机器数据单元格。
- 用自然语言替代可以结构化填写的组数、次数、RIR、时间、重量调整或关联关系。
- 对已有计划版本随机重生成 source key。
- 把 Activity 写成 Exercise，或把 Instruction 写成 Exercise/Activity。
- 把多个 Set 或多个递减阶段塞进一个单元格。
- 把计划重量写成实际训练重量。
- 写入训练日志、完成状态、实际训练日期或历史重量。

生成文件前必须读完本文档，填写官方母模板，并按末尾检查清单自检。

## 1. 固定 Workbook 结构

Workbook 必须包含以下 Sheet，名称和顺序固定：

1. `填写说明`
2. `计划信息_v2`
3. `训练日_v2`
4. `动作_v2`
5. `组计划_v2`
6. `超级组_v2`
7. `递减组_v2`
8. `活动_v2`
9. `活动阶段_v2`
10. `说明块_v2`

`填写说明` 只供人阅读。其余九张 Sheet 是机器数据源，禁止改名、改列、改顺序或使用合并单元格。没有数据的机器 Sheet 仍须保留完整表头。

不得增加额外 Sheet；Validator 会同时检查 Sheet 名称、数量和顺序。

## 2. 关系图

```text
Plan
└─ Workout
   ├─ Exercise
   │  ├─ Set
   │  │  └─ Drop Segment
   │  └─ Superset membership
   ├─ Activity
   │  └─ Activity Segment
   └─ Instruction (scopeType + scopeKey)
```

Exercise 是正式训练动作；Activity 是热身、有氧、攀岩、技能活动或恢复活动；Instruction 是非执行型说明，不生成动作卡。

## 3. 通用数据规则

- 文本使用 UTF-8，前后空格会被清理；稳定键和 enum 区分大小写。
- 日期使用 `YYYY-MM-DD`；时间统一使用秒。
- 数字单元格必须是数字，不要附加 `kg`、`秒`、`次`、`%` 等文字。
- 布尔值只能使用 `TRUE` 或 `FALSE`。
- 所有 `Min/Max` 范围必须同时填写或同时留空，且 `Min <= Max`。
- RIR、RPE 合法范围为 `0–10`。
- 空白可选字段不得写 `N/A`、`无`、`-`；应真正留空。
- 每一行只能表达一个实体：一个 Workout、Exercise、Set、Segment、Activity 或 Instruction。

## 4. Stable Source Key

所有来源键必须匹配：`^[A-Z][A-Z0-9_-]{0,63}$`。

推荐格式：

```text
planKey             XUHUI_96D
workoutKey          W001
exerciseKey         W001-E01
setKey              W001-E01-S01
supersetKey         W001-SS01
dropSegmentKey      W001-E01-S03-D01
activityKey         W004-A01
activitySegmentKey  W004-A01-P01
instructionKey      W001-I01
```

规则：

- 同一 Workbook 内所有实体来源键全局唯一。
- 排序、标题和展示名变化时不得改变 key。
- 删除后的 key 永不复用。
- 同一语义实体跨 `planVersion` 必须保留 key。
- 实体换父级、换类型或语义完全替换时必须使用新 key。
- source key 不是训练器运行时 `workoutId/exerciseId/setId`；运行时 ID 由训练器生成。

`planKey` 表示计划谱系，版本更新时保持不变。`planVersion` 使用 `1.0`、`1.1`、`2.0` 或 `1.0.0` 格式。

## 5. Canonical Enums

| 字段 | 合法机器值 |
|---|---|
| workoutType | `strength`, `strength-cardio`, `climbing`, `deload-strength`, `deload-climbing`, `rest` |
| section | `main`, `main-assistance`, `assistance`, `isolation`, `core`, `rehab`, `skill` |
| trainingRole | `pattern`, `hypertrophy`, `isolation`, `skill-acquisition`, `skill-retention` |
| exerciseType | `resistance`, `bodyweight`, `timed` |
| setType | `working`, `technique`, `warmup`, `top`, `backoff`, `dropset` |
| mode | `alternating` |
| activityType | `warmup`, `cardio`, `climbing`, `skill`, `recovery` |
| segmentType | `warmup-stage`, `drill`, `route-block` |
| loadAdjustmentType | `percent`, `absolute` |
| weightUnit | `kg`, `lb` |
| measureUnit | `reps`, `seconds`, `meters`, `routes` |
| scopeType | `workout`, `exercise`, `activity` |
| instructionType | `cycle`, `progression`, `volume`, `execution`, `record`, `recovery`, `recovery-check`, `adjustment`, `stop`, `review`, `note` |

中文解释可以写在 `填写说明` 或自由说明字段中，不得代替上述机器值。

## 6. Sheet 字段定义

`必填` 指有数据行时必须填写。`—` 表示无默认值。

### 6.1 计划信息_v2

<!-- PLANNER_V2_COLUMNS:计划信息_v2=protocol|schemaVersion|planKey|planVersion|programName|description|startDate|locale|note -->

必须且只能有一行。

| 字段 | 类型 | 必填 | 默认 | 规则 / 外键 | 示例 |
|---|---|---:|---|---|---|
| protocol | text | 是 | — | 固定 `planner-import-v2` | planner-import-v2 |
| schemaVersion | integer | 是 | — | 固定 `2` | 2 |
| planKey | source key | 是 | — | 计划谱系稳定键 | SAMPLE_PLAN |
| planVersion | version | 是 | — | `1.0` / `1.0.0` 格式 | 1.0 |
| programName | text | 是 | — | 用户可见计划名 | 协议示例计划 |
| description | text | 否 | 空 | 计划简介 | 仅用于接口演示 |
| startDate | date | 否 | 空 | `YYYY-MM-DD` | 2026-09-01 |
| locale | text | 否 | `zh-CN` | BCP 47 locale | zh-CN |
| note | text | 否 | 空 | 非执行说明 | 示例数据可删除 |

### 6.2 训练日_v2

<!-- PLANNER_V2_COLUMNS:训练日_v2=planKey|planVersion|workoutKey|order|plannedDate|week|dayInWeek|workoutType|title|targetDurationMin|note -->

| 字段 | 类型 | 必填 | 默认 | 规则 / 外键 | 示例 |
|---|---|---:|---|---|---|
| planKey | source key | 是 | — | 必须等于计划信息 | SAMPLE_PLAN |
| planVersion | version | 是 | — | 必须等于计划信息 | 1.0 |
| workoutKey | source key | 是 | — | 全局唯一 | W001 |
| order | positive integer | 是 | — | 从 1 连续 | 1 |
| plannedDate | date | 否 | 空 | 仅计划参考日期 | 2026-09-01 |
| week | positive integer | 否 | 空 | 展示元数据 | 1 |
| dayInWeek | positive integer | 否 | 空 | 展示元数据 | 1 |
| workoutType | enum | 是 | — | `workoutType` enum | strength |
| title | text | 是 | — | 用户可见标题 | 示例力量日 |
| targetDurationMin | positive number | 否 | 空 | 分钟 | 60 |
| note | text | 否 | 空 | 简短备注 | 示例数据 |

### 6.3 动作_v2

<!-- PLANNER_V2_COLUMNS:动作_v2=planKey|planVersion|workoutKey|exerciseKey|order|section|trainingRole|exerciseType|name|trackingName|unit|supersetKey|supersetOrder|countsAsWorkingSet|countsAsHypertrophySet|techniqueCue|note -->

| 字段 | 类型 | 必填 | 默认 | 规则 / 外键 | 示例 |
|---|---|---:|---|---|---|
| planKey | source key | 是 | — | 必须等于计划信息 | SAMPLE_PLAN |
| planVersion | version | 是 | — | 必须等于计划信息 | 1.0 |
| workoutKey | source key | 是 | — | FK → 训练日_v2 | W001 |
| exerciseKey | source key | 是 | — | 全局唯一 | W001-E01 |
| order | positive integer | 是 | — | 同 Workout 从 1 连续 | 1 |
| section | enum | 是 | — | `section` enum | main |
| trainingRole | enum | 是 | — | `trainingRole` enum | pattern |
| exerciseType | enum | 是 | — | `exerciseType` enum | resistance |
| name | text | 是 | — | 用户可见动作名 | 示例深蹲 |
| trackingName | text | 是 | — | 历史追踪名，跨版本谨慎修改 | 示例深蹲 |
| unit | enum | 否 | `kg` | `kg` / `lb` | kg |
| supersetKey | source key | 否 | 空 | FK → 超级组_v2 | W001-SS01 |
| supersetOrder | positive integer | 条件 | 空 | 有 supersetKey 时必填 | 1 |
| countsAsWorkingSet | boolean | 是 | — | `TRUE/FALSE` | TRUE |
| countsAsHypertrophySet | boolean | 是 | — | `TRUE/FALSE` | TRUE |
| techniqueCue | text | 否 | 空 | 动作级执行提示 | 保持稳定轨迹 |
| note | text | 否 | 空 | 非处方备注 | 示例动作 |

### 6.4 组计划_v2

<!-- PLANNER_V2_COLUMNS:组计划_v2=planKey|planVersion|workoutKey|exerciseKey|setKey|setNo|setType|targetWeight|weightUnit|repsMin|repsMax|rirMin|rirMax|restMinSec|restMaxSec|durationSec|loadAdjustmentType|loadAdjustmentValue|techniqueCue|note -->

一行等于一个 Set。`repsMin/repsMax` 与 `durationSec` 必须二选一。

| 字段 | 类型 | 必填 | 默认 | 规则 / 外键 | 示例 |
|---|---|---:|---|---|---|
| planKey / planVersion | identity | 是 | — | 必须等于计划信息 | SAMPLE_PLAN / 1.0 |
| workoutKey | source key | 是 | — | FK → 训练日_v2 | W001 |
| exerciseKey | source key | 是 | — | FK → 动作_v2，且属于 workoutKey | W001-E01 |
| setKey | source key | 是 | — | 全局唯一 | W001-E01-S01 |
| setNo | positive integer | 是 | — | 同 Exercise 从 1 连续 | 1 |
| setType | enum | 是 | — | `setType` enum | working |
| targetWeight | non-negative number | 否 | 空 | 计划目标重量，不是实际重量 | 60 |
| weightUnit | enum | 条件 | 空 | 有 targetWeight 时必填 | kg |
| repsMin / repsMax | number pair | 条件 | 空 | 次数型 Set | 5 / 5 |
| rirMin / rirMax | 0–10 pair | 否 | 空 | 目标 RIR | 2 / 3 |
| restMinSec / restMaxSec | non-negative pair | 否 | 空 | 组后休息秒数 | 150 / 180 |
| durationSec | positive number | 条件 | 空 | 时间型 Set；与 reps 二选一 | 30 |
| loadAdjustmentType | enum | 否 | 空 | 与调整值同时填写 | percent |
| loadAdjustmentValue | number | 条件 | 空 | 正数增重，负数减重 | -15 |
| techniqueCue | text | 否 | 空 | Set 级技术提示 | 动作速度稳定 |
| note | text | 否 | 空 | 非执行备注 | 示例组 |

`targetWeight` 必须保存为 prescription。训练器不得将其复制到 `weight`、`weightKg`、`workoutLogs` 或 `exerciseHistory`。

### 6.5 超级组_v2

<!-- PLANNER_V2_COLUMNS:超级组_v2=planKey|planVersion|workoutKey|supersetKey|name|mode|transitionMinSec|transitionMaxSec|roundRestMinSec|roundRestMaxSec|note -->

| 字段 | 类型 | 必填 | 默认 | 规则 / 外键 | 示例 |
|---|---|---:|---|---|---|
| planKey / planVersion | identity | 是 | — | 必须等于计划信息 | SAMPLE_PLAN / 1.0 |
| workoutKey | source key | 是 | — | FK → 训练日_v2 | W001 |
| supersetKey | source key | 是 | — | 全局唯一 | W001-SS01 |
| name | text | 否 | 空 | 用户可见分组名 | 示例超级组 |
| mode | enum | 是 | — | 当前只允许 `alternating` | alternating |
| transitionMinSec / transitionMaxSec | number pair | 否 | 空 | 动作间过渡秒数 | 0 / 15 |
| roundRestMinSec / roundRestMaxSec | number pair | 否 | 空 | 一轮完成后的休息 | 90 / 120 |
| note | text | 否 | 空 | 非执行备注 | A1/A2 交替 |

成员关系只通过 `动作_v2.supersetKey + supersetOrder` 表达。同一超级组至少两个成员，成员必须属于同一 Workout。

### 6.6 递减组_v2

<!-- PLANNER_V2_COLUMNS:递减组_v2=planKey|planVersion|workoutKey|exerciseKey|parentSetKey|dropSegmentKey|segmentOrder|label|loadAdjustmentType|loadAdjustmentMin|loadAdjustmentMax|repsMin|repsMax|rirMin|rirMax|transitionMinSec|transitionMaxSec|techniqueCue|note -->

一行等于一个递减阶段。

| 字段 | 类型 | 必填 | 默认 | 规则 / 外键 | 示例 |
|---|---|---:|---|---|---|
| planKey / planVersion | identity | 是 | — | 必须等于计划信息 | SAMPLE_PLAN / 1.0 |
| workoutKey | source key | 是 | — | FK → 训练日_v2 | W001 |
| exerciseKey | source key | 是 | — | FK → 动作_v2 | W001-E05 |
| parentSetKey | source key | 是 | — | FK → setType=dropset 的 Set | W001-E05-S03 |
| dropSegmentKey | source key | 是 | — | 全局唯一 | W001-E05-S03-D01 |
| segmentOrder | positive integer | 是 | — | 同 parentSet 从 1 连续 | 1 |
| label | text | 否 | 空 | 阶段名 | 主段 |
| loadAdjustmentType | enum | 条件 | 空 | 第 1 段留空，第 2 段起必填 | percent |
| loadAdjustmentMin / Max | number pair | 条件 | 空 | 第 2 段起必填 | -25 / -20 |
| repsMin / repsMax | number pair | 否 | 空 | 本阶段次数 | 8 / 10 |
| rirMin / rirMax | 0–10 pair | 否 | 空 | 本阶段 RIR | 1 / 2 |
| transitionMinSec / Max | number pair | 否 | 空 | 与上一段之间的过渡 | 10 / 15 |
| techniqueCue | text | 否 | 空 | 阶段技术提示 | 不借力 |
| note | text | 否 | 空 | 非执行备注 | 示例递减段 |

父 Set 必须是 `dropset`，且至少两个 Segment。父 Set 的休息表示整套递减完成后的休息。

### 6.7 活动_v2

<!-- PLANNER_V2_COLUMNS:活动_v2=planKey|planVersion|workoutKey|activityKey|order|activityType|name|durationMinSec|durationMaxSec|rpeMin|rpeMax|zone|measureMin|measureMax|measureUnit|instruction|note -->

| 字段 | 类型 | 必填 | 默认 | 规则 / 外键 | 示例 |
|---|---|---:|---|---|---|
| planKey / planVersion | identity | 是 | — | 必须等于计划信息 | SAMPLE_PLAN / 1.0 |
| workoutKey | source key | 是 | — | FK → 训练日_v2 | W001 |
| activityKey | source key | 是 | — | 全局唯一 | W001-A01 |
| order | positive integer | 是 | — | 同 Workout 从 1 连续 | 1 |
| activityType | enum | 是 | — | `activityType` enum | warmup |
| name | text | 是 | — | 用户可见名称 | 深蹲主项热身 |
| durationMinSec / Max | number pair | 否 | 空 | 总时长秒数 | 480 / 600 |
| rpeMin / rpeMax | 0–10 pair | 否 | 空 | Activity 强度 | 3 / 4 |
| zone | text | 否 | 空 | 强度区间显示值 | Zone2 |
| measureMin / Max | number pair | 否 | 空 | 距离、路线等计量 | 4 / 6 |
| measureUnit | enum | 条件 | 空 | 有 measure 时必填 | routes |
| instruction | text | 否 | 空 | Activity 直接执行说明 | 保持可对话强度 |
| note | text | 否 | 空 | 非执行备注 | 示例活动 |

`cardio` 至少填写 duration 或 measure。`warmup` 至少包含一个 `活动阶段_v2`。Activity 不得伪装成 Exercise。

### 6.8 活动阶段_v2

<!-- PLANNER_V2_COLUMNS:活动阶段_v2=planKey|planVersion|workoutKey|activityKey|activitySegmentKey|segmentOrder|segmentType|name|targetWeight|weightUnit|repsMin|repsMax|rirMin|rirMax|restMinSec|restMaxSec|durationSec|measureMin|measureMax|measureUnit|techniqueCue|instruction|note -->

| 字段 | 类型 | 必填 | 默认 | 规则 / 外键 | 示例 |
|---|---|---:|---|---|---|
| planKey / planVersion | identity | 是 | — | 必须等于计划信息 | SAMPLE_PLAN / 1.0 |
| workoutKey | source key | 是 | — | FK → 训练日_v2 | W001 |
| activityKey | source key | 是 | — | FK → 活动_v2 | W001-A01 |
| activitySegmentKey | source key | 是 | — | 全局唯一 | W001-A01-P01 |
| segmentOrder | positive integer | 是 | — | 同 Activity 从 1 连续 | 1 |
| segmentType | enum | 是 | — | `activitySegmentType` enum | warmup-stage |
| name | text | 是 | — | 阶段/drill 名称 | 空杆准备 |
| targetWeight | non-negative number | 否 | 空 | 计划目标，不是实际重量 | 20 |
| weightUnit | enum | 条件 | 空 | 有 targetWeight 时必填 | kg |
| repsMin / repsMax | number pair | 否 | 空 | 阶段次数 | 10 / 12 |
| rirMin / rirMax | 0–10 pair | 否 | 空 | 目标 RIR | 4 / 5 |
| restMinSec / Max | number pair | 否 | 空 | 阶段后休息 | 30 / 45 |
| durationSec | positive number | 否 | 空 | 时间型阶段 | 30 |
| measureMin / Max | number pair | 否 | 空 | drill/路线计量 | 2 / 3 |
| measureUnit | enum | 条件 | 空 | 有 measure 时必填 | routes |
| techniqueCue | text | 否 | 空 | 阶段技术提示 | 稳定足弓 |
| instruction | text | 否 | 空 | 阶段执行说明 | 逐级增加重量 |
| note | text | 否 | 空 | 非执行备注 | 示例阶段 |

Warmup 阶段映射到 Activity `segments`；climbing drill 映射到 `drills`。每个阶段保持独立来源键。

### 6.9 说明块_v2

<!-- PLANNER_V2_COLUMNS:说明块_v2=planKey|planVersion|instructionKey|scopeType|scopeKey|order|instructionType|content -->

| 字段 | 类型 | 必填 | 默认 | 规则 / 外键 | 示例 |
|---|---|---:|---|---|---|
| planKey / planVersion | identity | 是 | — | 必须等于计划信息 | SAMPLE_PLAN / 1.0 |
| instructionKey | source key | 是 | — | 全局唯一 | W001-I01 |
| scopeType | enum | 是 | — | workout/exercise/activity | workout |
| scopeKey | source key | 是 | — | 按 scopeType 引用对应实体 | W001 |
| order | positive integer | 是 | — | 同 scope 从 1 连续 | 1 |
| instructionType | enum | 是 | — | `instructionType` enum | execution |
| content | text | 是 | — | 非执行型自由说明 | 今天以动作质量优先 |

说明块不生成假 Exercise 或 Activity。Set 级技术提示必须写入 `组计划_v2.techniqueCue`。

## 7. Rest Workout

`workoutType=rest` 时：

- 禁止包含 Exercise、Set、Superset 或 Drop Segment。
- 可以没有 Activity。
- 如需安排恢复内容，只允许 `activityType=recovery`。
- 可以使用 Workout scope Instruction 记录恢复检查或停止条件。

## 8. Prescription 与实际训练数据边界

Workbook 只定义计划 prescription：目标重量、次数、RIR、休息、时长、技术提示和结构关系。

Workbook 永远不能提供或覆盖：

```text
weight
weightKg
实际 reps / rir
completed
actualDate
sessionStartedAt
workoutLogs
exerciseHistory
用户备注
计时器状态
```

`targetWeight` 和 Activity Segment 的 `targetWeight` 必须保存为目标字段；导入时实际重量保持空白。

## 9. Validator ERROR / WARNING

以下属于 ERROR：

- Sheet、列、列顺序缺失、重复或未知。
- protocol/schema 不正确；计划信息不是恰好一行。
- 必填字段缺失、enum 非法、数字/日期/布尔格式非法。
- planKey/planVersion 在不同 Sheet 不一致。
- source key 非法、重复、外键不存在或父级不一致。
- order/setNo/segmentOrder 不连续。
- 范围只填一端、上下限颠倒或超范围。
- Set 同时填写 reps 和 duration，或两者都不填。
- Superset 少于两个成员或跨 Workout。
- dropset 少于两个 Segment、Segment 绑定非 dropset、后续段缺少重量调整。
- warmup Activity 没有 Activity Segment。
- rest Workout 包含 Exercise 或非 recovery Activity。
- Instruction scopeKey 找不到对应实体。

以下属于 WARNING：

- 空白母模板尚未填写 Workout。
- 同 Workout 中重复 trackingName、异常长文本或可疑但不破坏结构的内容。
- 可选字段缺失导致展示信息较少，但不造成语义歧义。

正式导入门槛：`Errors = 0` 且 `Semantic validation = PASS`。一旦识别到任意 v2 机器 Sheet，验证失败必须终止，禁止 fallback 到 Structured v1、Long-form 或 Legacy。

## 10. 版本更新与 Diff

- 只有相同 `planKey` 的版本可以做版本 Diff。
- 同 key 且规范化内容相同：`unchanged`。
- 同 key 但内容不同：`modified`。
- 只在新版本出现：`added`；只在旧版本出现：`removed`。
- 排序变化属于 modified，不改变身份。
- 不能把旧 key 用于不同实体类型或不同父级。
- 展示名可以更新；`trackingName` 改变通常意味着历史身份变化，应谨慎并接受 Warning。
- Planner Import v2 初版只导入为新 Program，不自动 merge、不覆盖旧 Program、不迁移执行数据。

## 11. 给 AI 的生成步骤

1. 读取本文档和官方 `训练计划导入母模板_v2.xlsx`。
2. 确定稳定的 `planKey` 和 `planVersion`。
3. 先填写 Workout，再填写 Exercise、Set、Activity 和关联表。
4. 为每个实体分配稳定且全局唯一的 source key。
5. 用 Superset 表和成员字段表达超级组，不使用 A1/A2 自然语言代替关联。
6. 用一行一个 Segment 表达多阶段递减与 Activity 阶段。
7. 把非执行型说明写入带 scope 的说明块。
8. 保持所有 canonical enum 为固定英文值。
9. 校验所有外键、顺序、范围和休息日规则。
10. 输出 `.xlsx`，不要另造协议或附加机器列。

## 12. 最终交付检查清单

- [ ] 10 个固定 Sheet 均存在，名称和顺序正确。
- [ ] 九张机器 Sheet 的列名和顺序与本文完全一致。
- [ ] `protocol=planner-import-v2`，`schemaVersion=2`。
- [ ] 所有行的 planKey/planVersion 一致。
- [ ] source key 合法、唯一、跨版本稳定。
- [ ] Workout / Exercise / Set / Activity 外键完整。
- [ ] 所有 order、setNo、segmentOrder 从 1 连续。
- [ ] enum 只使用规范英文值。
- [ ] Set 一行一组，reps 与 duration 二选一。
- [ ] targetWeight 没有被当成实际重量。
- [ ] Superset 至少两个成员且不跨 Workout。
- [ ] dropset 至少两个 Segment，后续段有重量调整。
- [ ] warmup Activity 有 Activity Segment。
- [ ] Instruction 使用 scopeType/scopeKey，未伪装成 Exercise。
- [ ] rest Workout 不含正式动作。
- [ ] Validator 为 `0 ERROR` 且 `Semantic validation = PASS`。
