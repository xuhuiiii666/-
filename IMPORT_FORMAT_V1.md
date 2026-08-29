# Training Tracker Structured Import v1

本文档是 Excel 与 training-tracker importer 之间的机器接口规范。它不负责训练内容设计。

- 训练规划 AI 的内容交接要求见 `TRAINING_PLAN_HANDOFF.md`。
- 接口变化记录见 `IMPORT_CHANGELOG.md`。
- 内容到 workbook data 的转换由 `plan-compiler.js` 完成。

## 1. 格式识别与分流

固定主工作表名：

```text
训练器数据_v1
```

- 工作簿存在 `训练器数据_v1`：必须进入 Structured Import v1。
- 工作簿不存在 `训练器数据_v1`：才允许进入 Legacy Import。
- Structured validation 失败：立即终止，不得回退 Legacy Import、近似解析或内置计划。
- 读取和预览不会修改当前 Program 或 localStorage。

Legacy Import 继续兼容徐晖旧版、肖悦旧版、`手机查看版_一日一格` 和旧逐日执行 Excel。

## 2. 当前标准工作表

当前官方 Excel 包含：

```text
填写说明
训练器数据_v1
组计划_v1
超级组规则_v1
手机查看版_一日一格
```

机器数据源是 `训练器数据_v1`、`组计划_v1` 和 `超级组规则_v1`。其余两张 Sheet 只供人查看。

兼容规则：

- `训练器数据_v1` 必需。
- `组计划_v1` 可选；缺少时所有组按 `working` 生成。
- `超级组规则_v1` 可选；旧 Structured v1 只有 `超级组ID` 时继续保留原分组关系。
- 旧文件缺少 `trainingRole`、`targetDurationMin` 时仍可导入，导入值留空，不做推断。

## 3. 主表：训练器数据_v1

一行表示一个 Exercise。当前标准列名和顺序如下：

```text
schemaVersion
programName
workoutId
顺序
plannedDate
训练主题
targetDurationMin
section
trainingRole
exerciseId
动作顺序
动作名称
组数
次数下限
次数上限
RIR下限
RIR上限
建议重量
单位
休息下限秒
休息上限秒
动作秒数
动作备注
超级组ID
是否热身
```

| 列名 | 类型 | 新文件必填 | 兼容规则 |
|---|---|---:|---|
| `schemaVersion` | 文本/整数 | 是 | 固定为 `1` |
| `programName` | 文本 | 是 | 同一工作簿所有行一致 |
| `workoutId` | 文本 ID | 是 | 同一 Workout 的动作共用同一 ID |
| `顺序` | 正整数 | 是 | 不同 workoutId 不得重复 |
| `plannedDate` | 日期文本 | 否 | 留空或 `YYYY-MM-DD`；仅作计划参考 |
| `训练主题` | 文本 | 是 | 同一 workoutId 必须一致 |
| `targetDurationMin` | 正数 | 否 | Workout 目标时长，单位为分钟；同一 workoutId 必须一致 |
| `section` | 枚举 | 是 | 见 section 枚举 |
| `trainingRole` | 枚举 | 是 | 新编译文件必填；旧 Structured v1 缺列或留空时兼容 |
| `exerciseId` | 文本 ID | 是 | 整个工作簿中唯一且稳定 |
| `动作顺序` | 正整数 | 是 | 同一 workoutId 内不得重复 |
| `动作名称` | 文本 | 是 | 真实动作名称；不能是 section 标题 |
| `组数` | 正整数 | 是 | 至少为 `1` |
| `次数下限` | 非负数字 | 否 | 与次数上限同时填写或同时留空 |
| `次数上限` | 非负数字 | 否 | 不得小于次数下限 |
| `RIR下限` | 0-10 数字 | 否 | 与 RIR上限同时填写或同时留空 |
| `RIR上限` | 0-10 数字 | 否 | 不得小于 RIR下限 |
| `建议重量` | 非负数字 | 否 | 只写数值，不包含单位 |
| `单位` | 枚举 | 条件必填 | `kg`、`lb` 或留空；填写建议重量时必填 |
| `休息下限秒` | 非负数字 | 否 | 与休息上限秒同时填写或同时留空 |
| `休息上限秒` | 非负数字 | 否 | 不得小于休息下限秒 |
| `动作秒数` | 正数 | 否 | 时间型动作使用，单位为秒 |
| `动作备注` | 文本 | 否 | 原样保存，不做自然语言推断 |
| `超级组ID` | 文本 | 否 | 同一 Workout 内同组动作使用相同 ID |
| `是否热身` | 布尔值 | 是 | `是/否`、`true/false`、`1/0` |

Structured Import 直接读取字段，不调用 `parser.js` 的动作名称、次数、RIR、重量或时间正则。

## 4. section 枚举

只允许：

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

以下文本是 section 标题，不是 Exercise：

```text
【功能模块】
【主项】
【主辅助】
【辅助】
【核心】
```

它们出现在 `动作名称` 时属于严重错误，不能生成动作卡。

## 5. trainingRole 枚举

新编译文件只允许：

```text
pattern
hypertrophy
isolation
skill-acquisition
skill-retention
```

- `trainingRole` 必须来自训练规划内容。
- importer 和 compiler 不根据动作名称或 section 推断角色。
- 旧 Structured v1 文件缺少该列或值为空时继续有效，导入后保持空值。

## 6. 可选表：组计划_v1

`组计划_v1` 只描述与主表默认处方不同的 Set。不存在该工作表时，所有 Set 都生成 `working`。

当前列名和顺序：

```text
workoutId
exerciseId
组号
setType
次数下限
次数上限
RIR下限
RIR上限
休息下限秒
休息上限秒
重量调整类型
重量调整值
技术提示
```

| 列名 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| `workoutId` | 文本 ID | 是 | 对应主表 workoutId |
| `exerciseId` | 文本 ID | 是 | 与 workoutId 一起精确对应动作 |
| `组号` | 正整数 | 是 | 从 `1` 开始，不超过主表组数，同一动作内不重复 |
| `setType` | 枚举 | 是 | 见 setType 枚举 |
| `次数下限` | 非负数字 | 否 | 成对填写，覆盖该组默认值 |
| `次数上限` | 非负数字 | 否 | 成对填写，不得小于下限 |
| `RIR下限` | 0-10 数字 | 否 | 成对填写，覆盖该组默认值 |
| `RIR上限` | 0-10 数字 | 否 | 成对填写，不得小于下限 |
| `休息下限秒` | 非负数字 | 否 | 成对填写，覆盖该组默认值 |
| `休息上限秒` | 非负数字 | 否 | 成对填写，不得小于下限 |
| `重量调整类型` | 枚举 | 否 | `percent`、`absolute` 或留空 |
| `重量调整值` | 数字 | 条件必填 | 与重量调整类型同时填写或同时留空 |
| `技术提示` | 文本 | 否 | 原样保存 |

## 7. setType 枚举

只允许 `working`、`technique`、`warmup`、`top`、`backoff`、`dropset`。

训练器不会根据动作名称、section 或备注猜测 setType。

## 8. 可选表：超级组规则_v1

该表描述主表 `超级组ID` 对应的执行关系。当前第一版只支持 `alternating`。

当前列名和顺序：

```text
workoutId
超级组ID
超级组名称
mode
过渡下限秒
过渡上限秒
轮间休息下限秒
轮间休息上限秒
超级组备注
```

| 列名 | 类型 | 必填 | 规则 |
|---|---|---:|---|
| `workoutId` | 文本 ID | 是 | 必须对应主表 Workout |
| `超级组ID` | 文本 ID | 是 | 必须对应主表中至少两个 Exercise |
| `超级组名称` | 文本 | 否 | 人类可读标签 |
| `mode` | 枚举 | 是 | 第一版只允许 `alternating` |
| `过渡下限秒` | 非负数字 | 是 | 与过渡上限秒成对填写 |
| `过渡上限秒` | 非负数字 | 是 | 不得小于下限 |
| `轮间休息下限秒` | 非负数字 | 是 | 与轮间休息上限秒成对填写 |
| `轮间休息上限秒` | 非负数字 | 是 | 不得小于下限 |
| `超级组备注` | 文本 | 否 | 原样保存 |

如果工作簿包含该 Sheet：

- 每个主表非空 `超级组ID` 都必须有且只有一条规则。
- 每条规则必须能找到主表成员。
- 同一 Workout 的同一 `超级组ID` 至少关联两个 Exercise。

旧文件没有该 Sheet 时仍可导入，只保留原 `超级组ID` 分组关系。

## 9. 稳定 ID 规则

`workoutId` 和 `exerciseId`：

- 以英文字母开头。
- 后续只允许英文字母、数字、下划线 `_` 和连字符 `-`。
- 最长 64 个字符。
- 移动显示顺序后 ID 不变。
- `exerciseId` 在整个工作簿中唯一。
- 数组 index 不是身份。

Codex 编译器统一生成：

```text
Workout: W001, W002, W003
Exercise: W001-E01, W001-E02
Superset: SS01, SS02
```

训练规划 AI 不维护这些 ID。

## 10. RIR、重量与时间

```text
RIR下限 = 2
RIR上限 = 3
建议重量 = 62.5
单位 = kg
targetDurationMin = 60
休息下限秒 = 90
休息上限秒 = 120
动作秒数 = 20
```

不得填写 `RIR2-3`、`62.5kg`、`1分30秒`、`20s` 等自然语言。

建议重量是计划字段，不是实际训练重量；实际重量继续写入训练草稿和 `workoutLogs`。

## 11. 特殊组覆盖规则

1. 根据主表组数和默认处方生成全部 `working` Set。
2. 以 `workoutId + exerciseId` 找到组计划。
3. 按 `组号` 精确覆盖。
4. 组计划空字段沿用主表默认值。
5. 未提及 Set 保持 `working`。
6. 组计划不得新增超过主表组数的 Set。

接口示意：

```text
technique
working
working
backoff -15%
```

## 12. 时间型动作

```text
组数 = 2
次数下限 = 留空
次数上限 = 留空
动作秒数 = 20
```

导入后动作及每个 Set 的 `duration` 都是 `20`。训练器不从名称或备注推断时长。

## 13. 超级组关联

- 同一 Workout 的同组动作填写相同 `超级组ID`。
- 一个非空 `超级组ID` 至少关联两个 Exercise。
- `超级组ID` 不跨 Workout 建立关联。
- `超级组规则_v1` 只表达外部已经确定的执行关系。
- importer 不从 `+`、`连做`、`超级组`或动作名称猜测关联。

## 14. 严格校验清单

1. `训练器数据_v1` 存在，旧必需列完整。
2. schemaVersion 为 `1`。
3. programName 一致。
4. workoutId、exerciseId 格式合法。
5. exerciseId 全工作簿唯一。
6. 同一 workoutId 的顺序、plannedDate、训练主题和 targetDurationMin 一致。
7. Workout 顺序和同日动作顺序不重复。
8. section、trainingRole、布尔值属于固定枚举；旧文件 trainingRole 可空。
9. 动作名称不是 section 标题。
10. 组数、次数、RIR、休息、动作秒数、目标时长和建议重量合法。
11. 上下限字段成对填写且上限不小于下限。
12. setType 和重量调整类型合法。
13. 组计划引用存在的 workoutId + exerciseId。
14. 组号不超过动作组数且不重复。
15. 超级组ID在同日至少关联两个动作。
16. 存在 `超级组规则_v1` 时，规则引用、mode 和时间范围合法且完整。

任一严重错误都会抛出 `ImportError`，当前 Program、其他 Program 和 localStorage 保持原样。

## 15. Program 写入行为

- validation 成功只生成预览对象，不自动写入。
- 用户明确确认后，创建新的 Program。
- 新 Program 保留稳定 workoutId、exerciseId、setId、trainingRole、targetDurationMin 和超级组规则。
- 其他 Program 的 currentWorkout、actualDates、completed、currentWorkoutDrafts、workoutLogs 和 exerciseHistory 不变。
- 替换当前计划属于独立操作，必须再次确认。

## 16. 协议同步要求

任何影响训练计划接口的代码修改必须同时检查：

1. `IMPORT_FORMAT_V1.md`
2. `TRAINING_PLAN_HANDOFF.md`
3. `训练器标准计划母版_v1.xlsx`
4. `IMPORT_CHANGELOG.md`

无需更新其中某项时，交付报告必须说明原因。
