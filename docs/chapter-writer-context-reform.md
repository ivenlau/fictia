# 章节写作节点上下文治理方案（chapter-writer context reform）

> 状态：设计稿，待评审
> 日期：2026-07-28
> 关联：`feat/skill-parity` 分支；Agent 调试视图（trace）；叙事状态底座（摘要链+伏笔状态机）；工具平台（ToolRegistry）

---

## 0. 一句话结论

章节写作质量差的根因**不是「prompt 太大」，而是「上下文注入模式错误」**：`chapter-writer` 走的是**「全量推送」**老路（system 硬塞 8 万字方法论 + user 硬塞 5 万字设定），而项目早已建好的 41 个「按需拉取」工具（含 `get_craft_doc` / `semantic_search` / `get_summary_chain`）被完全架空。治本方案 = **todo 规划机制 + 上下文从「推」改「拉」+ system prompt 压缩**，三者必须配套，缺一不可。

---

## 1. 问题现象（实测复现）

### 1.1 System Prompt 实测 80,096 字符

把 `BaseAgent.buildSystemPrompt()`（`apps/server/src/agents/base-agent.ts:94-150`）的真实拼装跑一遍：

| 组成部分 | 字符数 | 占比 | 来源 | 是否压缩 |
|---|---|---|---|---|
| **craft 写作方法论（9 个文件全量）** | **63,525** | **79%** | `loadCraftKnowledge`（`prompt-loader.ts:100-133`）读 `system.md`「知识加载」表 | ❌ 全文 |
| 风格指南全文 | 12,382 | 15% | `readStyleGuide()`（`base-agent.ts:201-203`）直接读 `design/style-guide.md` | ❌ 全文 |
| basePrompt | 4,180 | 5% | `templates/agents/chapter-writer/system.md` | — |
| 参考作品（3 类 × 2000 上限）+ 用户偏好 | ~6,000 | — | `reference-works` / `preferences` | ✅ 已限 |
| **合计** | **~80,000+** | | | |

craft 9 个文件清单（`system.md` 知识加载表引用）：`anti-ai-writing`(15022) / `prose-craft`(9187) / `style-craft`(6069) / `dialogue`(5336) / `suspense`(6963) / `reversals`(6965) / `opening`(5554) / `chapter-hooks`(4195) / `banned-words`(4234)。

### 1.2 User Message 构成（以 b3f67ed5 写第 8 章为例，短篇约 2 万字符；长篇/带状态可达 5 万）

`chapter-writer.ts:135-177` 硬拼了以下内容：

| 块 | 源文件大小 | 实际注入 | 备注 |
|---|---|---|---|
| 前一章正文 | ch07 全文 4,947 | **全文，零压缩** | 长篇单章目标字数大时可达 1.5-2 万 |
| 风格指南（本 act） | style-guide 8,650 | extract 后 ~2.5k | ⚠️ **与 system 全文重复** |
| 世界观速查 | setting+rules 14,818 | 压缩后 ~5k | `buildWorldQuickRef` 保留表格+前 5 行 |
| 角色总览 | 8 角色 20,025 | 表格化 ~1.2k | `buildCharacterRegistry` 压缩到位 |
| 叙事技巧/情感节拍 | weave+art 19,259 | extract 本章 ~2k | 压缩到位 |
| 章节大纲 | outline 4,641 | 全文 | 合理 |

> 说明：用户报告的「5 万字」最可能来自长篇小说（design 文件 3-5 倍大 + 前章正文更长）或 `extraContext` 注入的叙事状态底座，或为 token 数而非字符数。无论哪种，治理方向一致。

### 1.3 为什么「大」直接导致「差」（机制）

1. **注意力稀释 / lost-in-the-middle**：8 万字里 6.3 万是「怎么写好中文小说」的通用方法论，本书本章的硬约束（风格铁律、本章伏笔、角色弧线）被淹没在中段。
2. **重复指令**：风格指南在 system 放全文、user 又放本 act 提取版（内容是子集，完全冗余）；9 个 craft 文件之间也有重叠（`style-craft` vs `prose-craft` vs `style-modules`）。
3. **比例倒挂**：「怎么写」(方法论) 占 79%，「写什么」(本章特定信息) 反而单薄。
4. **输出预算被挤占**：输入逼近 context 上限时，留给正文的输出空间和质量都下降。

---

## 2. 根因分析：上下文「推」vs「拉」，工具被架空

表层是 prompt 太大，**机制层是注入模式错误**。

### 2.1 项目早已建好「按需拉取」工具层，但 chapter-writer 没用

`apps/server/src/tools/index.ts` 注册了 **41 个工具**，chapter-writer 的清单（`index.ts:90`）是 `[...CHAPTER_FULL_TOOLS, ...NARRATIVE_TOOLS, ...ENTITY_TOOLS]`，已包含：

| todo 步骤（用户设想） | 已有对应工具 | 说明 |
|---|---|---|
| 1. 读取必要信息 | `get_chapter_context` / `read_chapter` / `list_chapters` | ⚠️ 见 2.2，粗粒度 |
| 2. 加载相关信息 | `get_craft_doc` / `list_craft_docs` / `get_character` / `get_genre_card` | 细粒度，可用 |
| 3. 向量检索更多信息 | `semantic_search` / `search_entities` | 细粒度，可用 |
| 4. 写作 | （LLM 正文产出） | — |
| 5. 核验 | `validate_style` / `scan_consistency` / `count_words` | 可用 |
| 6. 写入 | `write_file` / `edit_chapter` | 可用 |
| — 伏笔/前文状态 | `get_foreshadow` / `get_summary_chain` / `get_chapter_summary` | 摘要链已就绪 |

**问题**：`writeChapter()` 在 user message 里**预先硬拼了全部上下文**，agent 收到后「已经什么都有了」，**没有动机调用工具**——41 个工具被架空。

### 2.2 更糟：现有「一站式」工具是「全量推送」的翻版

`get_chapter_context`（`chapter-tools.ts:27-84`）返回：outline + styleGuide + artDesign + narrativeWeave + worldSetting + worldRules **全文** + 角色卡 + **前一章正文全文**。

这和 `writeChapter` 在 user message 里硬拼的内容**几乎一模一样**。也就是说，即便 agent 主动调用 `get_chapter_context`，拿回来的还是那 5 万字，只是从 user message 挪到了 tool result——**「拉」模式并没有真正省，反而多了一次往返**。`get_writing_space`（`narrative-state-tools.ts:99-111`，调 `assembleWritingSpace`）同理，待验证其返回粒度。

> 结论：现有工具层是围绕「全量推送」思路建的。要真正治本，必须**拆粗为细** + **推改拉** + **加 todo 规划**。

---

## 3. pi todo 工具调研结论

### 3.1 参考实现：`pi-coding-agent/examples/extensions/todo.ts`（本地已随 npm 包安装，版本 0.74.2）

实现要点：
- 它是一个 **Extension**（`export default function(pi: ExtensionAPI)`），**不是**普通 `AgentTool`。
- 状态存闭包变量 `let todos: Todo[] = []`，通过 `pi.on("session_start" / "session_tree")` 从 session 历史的 `toolResult.details` 重建（支持分支）。
- 工具经 `pi.registerTool({ name, label, description, parameters, execute, renderCall, renderResult })` 注册。
- `parameters` 用 TypeBox（`Type.Object`）+ `StringEnum`，与 fictia 的 `FictiaTool` schema 体系一致。
- 依赖：`@earendil-works/pi-coding-agent`（`ExtensionAPI` / `ExtensionContext` / `Theme`）+ `@earendil-works/pi-tui`（UI 组件）。
- 配套 `plan-mode` example（`examples/extensions/plan-mode/index.ts`）：`Plan:` 编号步骤 + `[DONE:n]` 标记完成 + 进度 widget，是「先规划后执行」的完整范式。

### 3.2 能否直接用于 fictia？—— 不能，但可低成本移植

| 维度 | pi-coding-agent (todo.ts) | fictia |
|---|---|---|
| 运行层 | coding-agent 的 session + `ExtensionAPI` | `pi-agent-core` 的 `runAgentLoop`（更底层） |
| 工具协议 | `pi.registerTool`（Extension） | `FictiaTool extends AgentTool` + `ToolRegistry` 工厂 |
| 状态持久化 | session entry（支持分支重建） | 单次 `runAgentSession` 闭包足够；跨会话可落文件/trace |
| UI | TUI（`pi-tui` 组件、`/todos` 命令） | Web 调试视图（已有 trace 机制） |

**结论**：fictia 用的是 `pi-agent-core`（`agent-runner.ts:18` 的 `runAgentLoop`），**不走** coding-agent 的 Extension/session 通道，因此 todo.ts **不能直接 import 使用**。但核心逻辑（闭包持有 todos + CRUD 工具）与 fictia 的 `FictiaTool` 工厂模式天然契合，**移植成本约 80 行代码**，且比 Extension 更可控（状态可见、可落 trace）。

### 3.3 移植方案（FictiaTool 工厂 + 闭包状态）

新增 `apps/server/src/tools/todo-tools.ts`：

```typescript
// 草图，非最终实现
interface TodoItem { id: number; text: string; status: "pending" | "in_progress" | "done"; }

export function createTodoTools(ctx: ToolContext): FictiaTool[] {
  let todos: TodoItem[] = [];
  let nextId = 1;
  return [{
    name: "todo",
    label: "任务清单",
    tier: "readonly",          // 无副作用，但建议加 tag: "planning"
    description: "规划并跟踪当前写作任务。开写前先用 action=add 拆解步骤（如：读取大纲→加载技法→检索前文→写作→核验→写入），逐步 update。一个时刻只有一个 in_progress。",
    parameters: Type.Object({
      action: StringEnum(["add", "update", "list", "clear"]),
      items: Type.Optional(Type.Array(Type.Object({ /* id?, text, status? */ }))),
    }),
    async execute(_id, params) {
      // add/update/list/clear，操作闭包 todos
      // 返回当前清单的可读文本（含进度 N/M）
      return { content: [{ type: "text", text: renderTodos(todos) }], details: { todos } };
    },
  }];
}
```

接线（`tools/index.ts`）：
1. `toolRegistry.registerFactory(createTodoTools);`
2. `chapter-writer` 清单加 `"todo"`（建议放在工具列表首位，强化「先规划」）。

状态可见性（关键，区别于 pi 的黑盒闭包）：
- 把 `todos` 快照写进 `AgentRunTrace`（新增可选字段 `todoSnapshot`），随 `onTraceUpdate` 增量下发调试视图，用户能实时看到 agent 的规划与进度。
- 跨会话持久化（可选，后续）：落 `ai/todo.json`，resume 时重建。

---

## 4. 解决方案（三层，必须配套）

| 层 | 方案 | 砍掉 | 工作量 | 风险 | 治标/治本 |
|---|---|---|---|---|---|
| **L1** | **system 压缩**：craft 改精要版（每文件 500-1000 字核心清单），style-guide 去重（system 只留硬约束） | 63k→~5k；12k→~2k | 中 | 低 | 治标（但立竿见影） |
| **L2** | **todo 规划机制**：新增 todo 工具 + 改造 chapter-writer `system.md`（强制「先 todo 规划再执行」） | 结构化注意力 | 中 | 低 | 治本（机制） |
| **L3** | **推→拉**：`writeChapter` user message 瘦身到最小指令；上下文改由 agent 按需拉取；前章正文走摘要链；弃用/拆分 `get_chapter_context` 粗粒度工具 | user 5 万→~2k 起步，按需增长 | 大 | 中（连续性依赖摘要质量） | 治本（机制） |

### L1 — system prompt 压缩

- **craft 精要版**：为 9 个 craft 文件各产出一个 `*.brief.md`（500-1000 字核心要点 + 「详细见 read_craft / get_craft_doc」）。`loadCraftKnowledge` 默认加载 brief，完整版走 `get_craft_doc` 工具按需调。
- **style-guide 去重**：`readStyleGuide()` 改为只注入硬约束段（禁用词表 + 语言铁律，~2k），本 act 风格锚点统一由 user 侧 `extractStyleStageNotes` 提供（消除 system 全文 + user 提取的重复）。

### L2 — todo 规划机制

- 新增 `todo` 工具（见 3.3）。
- 改造 `templates/agents/chapter-writer/system.md`：
  - 新增「# 工作流程」段，强制要求「动笔前先调 `todo` 拆解为可执行步骤，逐步 update，一时刻一个 in_progress」。
  - 给出推荐步骤模板：① 读大纲/目标字数 ② 查本章伏笔指令与前文摘要 ③ 按场景需要加载 craft 技法（`get_craft_doc`）④ 必要时 `semantic_search` 召回相关设定 ⑤ 写作 ⑥ `validate_style` + `scan_consistency` 核验 ⑦ `write_file` 写入。
- todo 快照进 trace，调试视图展示规划与进度。

### L3 — 上下文从「推」改「拉」

- **`writeChapter` 瘦身**（`chapter-writer.ts:106-178`）：user message 从 5 万字硬拼改为「写第 N 章（标题/目标字数）+ 极简背景锚点 + 指引（请先用 todo 规划，按需调用工具获取上下文）」。把 `outline` / `styleStageNotes` / `worldQuickRef` / `characterRegistry` / `narrativeWeaveExcerpt` / `artDesignExcerpt` / `previousChapterText` 的硬拼接**全部移除**，改为 agent 按需通过工具拉取。
- **前一章正文走摘要链**：复用已有 `get_summary_chain` / `get_chapter_summary`（叙事状态底座），全文 → 「摘要 + 尾部衔接段」。连续性依赖摘要质量，需配套摘要质量门。
- **拆粗为细**：`get_chapter_context` / `get_writing_space` 这类「一站式」工具标记为 discouraged 或拆分，引导 agent 用 `get_craft_doc` / `get_foreshadow` / `get_character` / `semantic_search` / `get_summary_chain` 的细粒度组合。
- **extraContext 审计**：排查 `AgentRunOptions.extraContext`（`chapter-writer.ts:135`）注入的叙事状态大小，纳入预算。

---

## 5. 落地路径（分阶段，建议顺序）

> 原则：**先治标止血（L1），再建机制（L2），最后改注入模式（L3）**。每阶段都可独立验证、独立上线。

### 阶段 0：可观测性（先行，0.5 天）
- 在 `runLLM` / trace 增加字符数/token 预算字段（system / user / 各 craft 文件 / 工具结果），调试视图展示长度分布。
- 目的：用真实数据确认各块占比，量化每阶段收益。

### 阶段 1：L1 system 压缩（2-3 天）
- 产出 9 个 craft `*.brief.md`。
- 改 `loadCraftKnowledge`：默认 brief，完整走 `get_craft_doc`。
- 改 `readStyleGuide`：只注入硬约束。
- 验证：system 从 80k → ~15k；章节质量回归（对比 trace 输出）。

### 阶段 2：L2 todo 规划机制（2-3 天）
- 新增 `todo-tools.ts` + 注册 + chapter-writer 清单加 `todo`。
- 改 `chapter-writer/system.md`：工作流程 + todo 强制要求。
- todo 快照进 trace + 调试视图展示。
- 验证：trace 里能看到 agent 主动规划并按步执行；工具调用次数上升。

### 阶段 3：L3 推→拉（3-5 天，风险最高）
- `writeChapter` user message 瘦身（保留增量改写路径 `chapter-writer.ts:93-105`）。
- 前章正文改摘要链；`get_chapter_context` / `get_writing_space` 标记 discouraged 或拆分。
- extraContext 审计。
- 验证：user message 从 5 万 → ~2k 起步；连续性回归（重点测长篇后段章节）；总上下文 token 下降 + 输出质量提升。

---

## 6. 这套机制能否彻底解决问题？—— 能，但需配套

| 单独做 | 能否解决 | 原因 |
|---|---|---|
| 只加 todo 工具 | ❌ 不够 | agent 可能不调用；且 user message 仍塞 5 万字，工具继续被架空 |
| 只做 L1 system 压缩 | ⚠️ 缓解 | 砍 80k→15k 立竿见影，但 user 侧 5 万字仍在，注意力仍分散 |
| 只做 L3 推→拉 | ⚠️ 部分解决 | user 瘦身了，但若无 todo 规划，agent 可能漏拉关键上下文（如伏笔），且 system 8 万字方法论仍在稀释 |
| **L1 + L2 + L3 配套** | ✅ 根治 | system ~15k + user ~2k 起步 + agent 按 todo 规划按需拉取 → 总上下文从 ~13 万降到动态按需，注意力聚焦，工具不再被架空 |

**关键风险点**：
1. **agent 不主动用 todo / 工具**：靠 `system.md` 强约束 + 工具描述引导 + 质量门兜底（`validate_style` / `scan_consistency` 失败则重写）。可参考 pi `plan-mode` 的「先规划后执行」强约束范式。
2. **摘要链质量**：L3 前章正文改摘要，连续性依赖摘要质量。需先验证 `get_summary_chain` 产出，必要时加摘要质量门。
3. **回归成本**：L3 改动大，需在长篇后段章节（连续性压力最大处）重点回归。

---

## 7. 待确认 / 待验证

- [ ] 用户报告的「5 万字」具体来自哪本 novel、字符还是 token、`extraContext` 占比多少 → 阶段 0 可观测性数据。
- [ ] `assembleWritingSpace`（`get_writing_space`）返回粒度与大小。
- [ ] `get_summary_chain` 摘要质量是否足以替代前章全文（L3 前置验证）。
- [ ] 是否保留 `get_chapter_context` 作为「兜底一键拉取」，还是完全弃用拆细。

---

## 8. 落地状态（2026-07-28）

L0-L3 全部代码已落地，`pnpm check` 全绿。

- **L0 可观测性** ✅：`AgentRunTrace.promptBudget`（system/user 各块字符数）+ 调试视图 BudgetBar（单块 >10000 字或单侧 >20000 字标红）。
- **L1 system 压缩** ✅：9 个 craft 产出 `*.brief.md`（63525→9658，**-85%**），`loadCraftKnowledge` 优先 brief、回退全文（渐进迁移）；`readStyleGuide` 截断到 5000 字。system **~80k→~25k**。
- **L2 todo 规划** ✅：`tools/todo-tools.ts`（FictiaTool 工厂，移植自 pi `todo.ts`，add/update/list + 单 in_progress 约束）+ `chapter-writer/system.md` 新增「工作流程」段（强制先 todo 规划）+ `trace.todoSnapshot` + 调试视图 TodoPanel。
- **L3 推→拉** ✅：`writeChapter` user message 瘦身（保留 章节大纲 + 本章伏笔指令 + 上章衔接 + 按需拉取引导；移除 风格/世界观/角色总览/情感节拍/前章全文）；前章正文改走 `get_summary_chain`；`get_chapter_context`/`get_writing_space` description 标记 `[已弃用]`（保留供过渡，稳定后删）。

**待实际验证**（代码完成，运行行为待跑通）：
- [ ] 跑一次 chapter-writer，看 trace：预算分布（预期 system ~25k、user ~7k）+ todo 规划步骤 + 工具调用（`get_summary_chain` / `get_character` / `semantic_search` / `get_craft_doc`）。
- [ ] 长篇后段章节回归：连续性依赖 agent 主动 `get_summary_chain`；兜底是 `scan_consistency` 核验设定一致性、失败则重写。
- [ ] `get_craft_doc` 的 key 格式：brief 里引用不带 `.md`（如 `get_craft_doc('dialogue')`），需确认 `listCraftDocs` 返回的 key 一致；不一致则统一。
- [ ] agent 是否真的主动调 todo / 拉取工具（依赖 system.md 强约束 + 引导；若不调，考虑在 user message 或质量门加硬性提示）。
