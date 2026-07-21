# Fictia Web 对齐 Skill 升级方案

> 目标：把 `apps/server` + `apps/web`（TypeScript）的功能升级到与 `/root/code/fictia-skill`（Python）对齐，让 web 自给自足到 parity。skill 是真相源，web 是移植目标。

## 1. 背景与现状

两个仓库实现同一套 11 阶段小说创作流水线：

| 维度 | skill（Python，领先） | web（TS，落后） |
|---|---|---|
| agent 提示词 | `references/agents/01-11.md`（含「知识加载」表） | `templates/agents/{name}/system.md`（无知识加载） |
| 流水线定义 | `pipeline.md` + `project.py` dict | `packages/shared/constants.ts`（干净数据编码） |
| 状态机 + 传播 | `project.py`（BFS） | `core/state-tracker.ts` + `update-propagator.ts`（SQLite） |
| 上下文组装 | `context.py` + `writing_space.py`（三层/entity-aware） | `utils/context-extractor.ts`（基础） |
| 质量门 | `prose_check.py`(18 规则) + verdict 解析 | `validate_style`/`scan_consistency` 玩具启发式 |
| RAG | vector + entity(8 类) + 知识图谱 | 无 |
| 流程增强 | brainstorm 三段式 / parallel-design / source 工作流 / notes 蒸馏 / milestone | 无 |
| 确认纪律 | 人工确认 + /clear | **自动 confirm**（`orchestrator.ts:119`） |
| 执行范式 | Claude 直接 Read/Write/Edit | tool-using agentic loop（pi-ai，GLM/Minimax/Doubao） |
| 状态存储 | `project.yaml` + 文件 | SQLite + 文件（章节已 file-based） |

**grep 确认 web 完全缺失**（0 命中）：brainstorm / parallel / prose_check / verdict / vector / writing_space / meta_index / embedding / milestone / imitation / continuation。
**假阳性排除**：`notes`=weave_notes/写作备注（非 raw/summary 蒸馏系统）；`graph`=前端面板名（非知识图谱）；`entity`=identity 字段（非 8 类实体）；`rewrite`=章节局部改写（非源工作流）。

## 2. 总体策略

- **方向**：在 TS 里重实现 skill 有而 web 缺的能力，web 自给自足，不调 Python 服务。
- **分阶段**：P0（内容对齐 + 写作质量门）→ P1（创意设计增强）→ P2（知识库/RAG）→ P3（环境设置/其他）。按 价值/工作量 排序。
- **对齐验收原则**：每项移植都用同一输入在 skill 与 web 跑一遍，输出一致才算对齐（parity test）。skill 是真相源。

### 两个已定决策

1. **向量库**：P2 用 **sqlite-vec**（贴合现有 better-sqlite3 栈，零额外服务）+ **API embedding**（智谱 embedding-2，复用现有 API key 基础设施）。不复用 skill 的 Python `embed_server`。
2. **确认纪律**：把 orchestrator 的自动 confirm 改为人工 confirm（`pending_confirm` → 前端 `/confirm` 按钮）。web 有 UI，比 skill 的 /clear 优雅，不照搬清上下文那套。

## 3. 功能对齐 gap（按 4 能力分组）

| 能力 | web 已有 | web 缺 |
|---|---|---|
| 环境设置 | novel 增删改、settings、文件模板、db migrate | source 导入(epub/txt/md+workflow)、meta-index、lint、embedding 配置 |
| 创意和设计 | 11 agent、stage 依赖/传播、orchestrator | brainstorm 三段式、人工确认纪律、writing-craft+genre-cards 加载、parallel-design、丰富上下文组装 |
| 写作循环 | chapter-writer、editor(feedback+增量审核)、consistency-checker、局部改写 | prose_check(18 规则)、verdict 解析、review-fix 循环门、每 5 章里程碑、writing-space 三层、notes 蒸馏、source-aware 上下文 |
| 知识库管理 | 无 | vector RAG、entity RAG(8 类)+动态写作空间、知识图谱、craft 可检索知识库 |

---

## 4. P0 详细方案（内容对齐 + 写作质量门）

最便宜、收益最大，也是 P1/P2 的地基。5 个任务。

### P0-1 · 提示词 & 知识对齐

**目标**：web 的 agent 提示词与 skill 同步（skill 版更全，含「知识加载」表），并让 web agent 能按需加载 writing-craft / genre-cards 知识。

**落点文件**：
- 同步：`apps/server/templates/agents/{name}/system.md` ← skill `references/agents/0N-*.md`（11 个）
- 新增：`apps/server/templates/writing-craft/*.md`（20 个，从 skill 移植）
- 新增：`apps/server/templates/genre-cards/*.md`（8 个，从 skill 移植）
- 扩展：`apps/server/src/utils/prompt-loader.ts`
- 扩展：`apps/server/src/agents/base-agent.ts`（`buildSystemPrompt`）

**TS 模块草图** — `prompt-loader.ts` 新增：

```ts
const CRAFT_DIR = "templates/writing-craft";
const GENRE_DIR = "templates/genre-cards";

// 读取 agent system.md 中「# 知识加载」表，返回需加载的 craft 文件名列表
export async function loadCraftIndex(agentName: string): Promise<string[]> { ... }

// 按 agent 的知识加载表，拼装 craft + genre-card 内容
export async function loadCraftKnowledge(agentName: string, genre?: string): Promise<string> {
  const files = await loadCraftIndex(agentName);
  const parts: string[] = [];
  for (const f of files) parts.push(await readTemplate(`${CRAFT_DIR}/${f}`));
  if (genre) {
    const card = await readTemplateSafe(`${GENRE_DIR}/${genre}.md`);
    if (card) parts.push(card);
  }
  return parts.join("\n\n---\n\n");
}
```

**接线点** — `base-agent.ts::buildSystemPrompt()`：

```ts
protected async buildSystemPrompt(): Promise<string> {
  const basePrompt = await loadPromptTemplate(this.agentName);
  const craft = await loadCraftKnowledge(this.agentName, this.genre); // 新增
  const styleGuide = await this.readStyleGuide();
  // 注入顺序：base → craft 知识 → style 锚定
  let prompt = basePrompt;
  if (craft) prompt = prompt.replace("# 专业能力", `# 知识加载\n\n${craft}\n\n# 专业能力`);
  if (styleGuide) prompt = prompt.replace("# 专业能力", `# 风格锚定\n\n${styleGuide}\n\n# 专业能力`);
  return prompt;
}
```

**验收**：任意 agent 运行时 system prompt 含「知识加载」段；加载的 craft 文件与 skill 该 agent 的知识加载表一致。

---

### P0-2 · prose_check.ts（确定性 AI 味检测）

**目标**：移植 skill `scripts/lib/prose_check.py`（1388 行，18 规则：6 blocking / 12 advisory）到 TS。注释写明「与 JS 版 check-ai-patterns.js 同源」，移植是回归原语言，风险低。

**落点文件**：
- 新增：`apps/server/src/utils/prose-check.ts`
- 新增测试：`apps/server/src/utils/prose-check.test.ts`（用 skill 同一章节做 parity 测试）

**规则清单**（从 `prose_check.py` 提取）：
- **blocking（6 条，必须修复才能进 LLM 审核）**：not-is 比较、音量反差腔、否定排比、reverse-not-is、拖尾碎句号、引号强调 tic
- **advisory（12 条，记录到写作备注供 LLM 参考）**：引号强调、微动作 tic、动作清单 tic、陈词密度、比喻密度、推理链 tic、通知正式腔、过度压缩 prose 等

**TS 模块草图**：

```ts
export type Severity = "blocking" | "advisory";

export interface ProseFinding {
  rule: string;          // 规则名（与 skill 同名，便于 parity）
  severity: Severity;
  line: number;
  snippet: string;       // 命中片段
  message: string;       // 说明 + 修改建议
}

export interface ProseReport {
  blocking: ProseFinding[];
  advisory: ProseFinding[];
}

// 主入口：检测一段正文（先剥离 YAML front-matter / 代码块 / 引用，再逐规则扫描）
export function checkProse(text: string): ProseReport {
  const lines = preprocess(text);          // 复刻 _mask_quoted / _split_sentences 等
  const blocking = [findNotIs, findVoiceContrast, findNegationParade,
    findReverseNotIs, findTrailerEnding, findQuoteEmphasisTic]
    .flatMap(fn => fn(lines));
  const advisory = [/* 12 个 advisory 规则 */].flatMap(fn => fn(lines));
  return { blocking, advisory };
}
```

**移植要点**：`prose_check.py` 有一批辅助函数（`_mask_quoted` 屏蔽对话、`_split_sentences`、`_quoted_ranges`、YAML front-matter / fence 检测、位置追踪）必须一并移植，否则规则误报。建议逐规则移植 + parity 测试（同一段文本，TS 与 Python 输出的 finding 集合一致）。

**接线点**：在 `WritingLoopService`（P0-4）中，章节写完后、进 editor 前调用：
```ts
const report = checkProse(chapterText);
if (report.blocking.length > 0) { /* 必须先修复 blocking，再进 editor */ }
if (report.advisory.length > 0) { /* 追加到写作备注，供 editor 参考 */ }
```

**验收**：对同一章节，`checkProse` 与 `python prose_check.py` 的 blocking/advisory 命中一致（parity test）。

---

### P0-3 · verdict.ts（审核/校验报告解析）

**目标**：移植 skill `context.py::parse_review_verdict` + consistency 版本。解析 editor / consistency-checker 产出的 markdown 报告，返回结构化判定。

**零摩擦点**：web `editor.ts` 的 prompt（`editor.ts:114-119`）已要求「综合评分 A/B/C/D」+「问题清单按严重/一般/细节三级分类」--正是 skill verdict 解析的格式。`verdict.ts` 可直接解析 web 现有 editor 产出，无需改 editor。

**落点文件**：
- 新增：`apps/server/src/utils/verdict.ts`
- 新增测试：`apps/server/src/utils/verdict.test.ts`

**TS 模块草图**：

```ts
export type Grade = "A" | "B" | "C" | "D";

export interface Verdict {
  passed: boolean;       // severe==0 && normal==0 && grade==="A"
  severe: number;        // 严重问题数
  normal: number;        // 一般问题数
  grade: Grade;
}

// 解析编辑审核报告：抓「综合评分」行 + 严重/一般问题表行数
export function parseReviewVerdict(reviewMd: string): Verdict { ... }

// 解析一致性校验报告：同结构
export function parseConsistencyVerdict(reportMd: string): Verdict { ... }
```

**接线点**：`WritingLoopService`（P0-4）用 `parseReviewVerdict` 判定是否进入修复轮；`milestone.service`（P0-5）用 `parseConsistencyVerdict` 判定一致性是否通过。

**验收**：对 web editor 产出的多份 review，`parseReviewVerdict` 抽取的 grade/severe/normal 与人工读表一致；与 skill `fictia verdict review` 输出一致。

---

### P0-4 · review-fix 循环门 + WritingLoopService

**目标**：实现 skill「章节写作流程」的完整循环：写作 → prose_check → 审核 → verdict → 未过则定向修复 → 最多 3 轮 → 零严重 + 评分 A 才确认。替换 orchestrator 对 chapters 阶段的自动 confirm。

**落点文件**：
- 新增：`apps/server/src/services/writing-loop.service.ts`
- 改：`apps/server/src/core/orchestrator.ts`（`chapters` 阶段成功后置 `pending_confirm`，不自动 confirm）
- 新路由：`apps/server/src/routes/chapters.ts` → `POST /chapters/:id/writing-loop`
- 复用：`ChapterWriter.run`、`EditorAgent.reviewChapter`、`checkProse`、`parseReviewVerdict`

**TS 模块草图** — `writing-loop.service.ts`：

```ts
export interface LoopResult {
  chapterId: string;
  rounds: number;
  passed: boolean;
  finalVerdict: Verdict;
  reviewPath: string;
}

export class WritingLoopService {
  constructor(private novelDir: string, private apiKeys: Record<string, string>,
              private agentModels?: AgentModels) {}

  // 单章完整循环：write → prose_check → editor → verdict → fix（最多 maxRounds 轮）
  async runChapterLoop(chapterId: string, maxRounds = 3): Promise<LoopResult> {
    const writer = createAgent("chapter-writer", ...);
    const editor = new EditorAgent(...);

    // 第 0 轮：写作
    await writer.run({ incrementalTarget: chapterPath });

    let verdict: Verdict;
    for (let round = 1; round <= maxRounds; round++) {
      // 1. 确定性 prose 检查（blocking 必须先修）
      const prose = checkProse(await readChapter(chapterPath));
      if (prose.blocking.length > 0) {
        await writer.run({ incrementalTarget: chapterPath,
                           userDirective: proseFixDirective(prose.blocking) });
        continue; // 修完 blocking 重新进检查
      }

      // 2. LLM 审核
      await editor.reviewChapter(chapterPath);

      // 3. verdict 判定
      verdict = parseReviewVerdict(await readReview(chapterPath));
      if (verdict.passed) {
        await this.confirmChapter(chapterId);       // 标记章节 confirmed
        await this.maybeMilestone(chapterId);       // P0-5 里程碑检查
        return { chapterId, rounds: round, passed: true, finalVerdict: verdict, reviewPath };
      }

      // 4. 未过：按审核问题定向修复，进下一轮
      await writer.run({ incrementalTarget: chapterPath,
                         userDirective: reviewFixDirective(verdict, await readReview(chapterPath)) });
    }

    // maxRounds 仍未过：中止，交用户决定
    return { chapterId, rounds: maxRounds, passed: false, finalVerdict: verdict!, reviewPath };
  }
}
```

**接线点**：
- `orchestrator.ts::runStage("chapters")` 成功后不再调 `confirmStage`，改置 `pending_confirm`；章节级 confirmation 移交给 `WritingLoopService`。
- 新路由 `POST /chapters/:id/writing-loop` 调用 `runChapterLoop`，SSE 流式回传每轮状态（写作中/审核中/修复中/通过/中止）供前端展示。
- 前端 `features/chapter/ReviewActions.tsx` 增「运行写作循环」入口 + 轮次进度。

**验收**：
- 一章跑通循环：blocking 修复 → 审核 → 通过则 confirmed。
- 故意注入严重问题：循环最多 3 轮，未过则中止并展示所有轮次结果（对应 skill「3 轮后中止」）。
- 通过条件严格等价 skill：`severe==0 && normal==0 && grade=="A"`。

---

### P0-5 · 里程碑一致性校验（每 5 章）

**目标**：每确认 5 章（ch05/ch10/...）提醒做一致性校验，可跳过、不阻塞新章。

**落点文件**：
- 新增：`apps/server/src/services/milestone.service.ts`（或在 `pipeline.service.ts` 内加方法）
- 复用：`ConsistencyCheckerAgent`、`parseConsistencyVerdict`

**TS 模块草图**：

```ts
export interface MilestoneCheck {
  reached: boolean;        // confirmedCount % 5 === 0
  chapter: number;
  action: "run" | "later" | "skip";  // 用户选择
}

export class MilestoneService {
  // 章节确认后调；到达里程碑则返回提醒（前端弹窗）
  checkAfterConfirm(confirmedCount: number): MilestoneCheck | null {
    if (confirmedCount > 0 && confirmedCount % 5 === 0) {
      return { reached: true, chapter: confirmedCount, action: "run" };
    }
    return null;
  }

  // 用户选「立即校验」：跑 consistency + 修复循环（最多 2 轮，对应 skill）
  async runConsistencyLoop(novelId: string, maxRounds = 2): Promise<Verdict> { ... }
}
```

**接线点**：`WritingLoopService.runChapterLoop` 通过章节后调 `MilestoneService.checkAfterConfirm`；前端收到里程碑提醒 → 选「立即校验」→ 调 `runConsistencyLoop`（内含 consistency-checker + parseConsistencyVerdict + 修复，最多 2 轮）。

**验收**：第 5/10 章确认后触发提醒；选跳过则不阻塞下一章；一致性修复循环最多 2 轮，逻辑与 skill `里程碑一致性校验` 一致。

---

## 5. P1 概要（创意和设计增强）

**P1-1 · 人工确认纪律（全阶段）**
- 改 `orchestrator.ts::runStage`：成功后统一置 `pending_confirm`，删掉自动 `confirmStage`（P0-4 已对 chapters 做了，P1 推广到 1-8 + editor/consistency）。
- API `POST /pipeline/stages/:stage/confirm` 已存在，前端补「确认」按钮即可。
- 不照搬 skill 的 `/clear` 上下文清理--web 状态在 DB，无上下文膨胀问题。

**P1-2 · brainstorm 三段式（stages 1-8）**
- 新增 `apps/server/src/services/brainstorm.service.ts`：三段协议（Explore 3-5 方向 → Co-Create 多轮 → Produce）。
- 新增 `pipeline_settings.brainstorm_mode`（默认 on），存 settings 表。
- 新路由：`POST /pipeline/stages/:stage/explore`（出方向）、`POST .../co-create`（多轮）、`POST .../produce`（产出）。
- 前端新组件：方向卡片选择 + 共创对话流（web 的 UI 优势，比 skill 的 AskUserQuestion 更直观）。
- agent system.md 增「探索方向 + 发散约束」段（从 skill SKILL.md「头脑风暴模式」+ 各 agent prompt 移植）。

## 6. P2 概要（知识库 / RAG，feature flag）

**P2-1 · vector RAG**
- 依赖：`sqlite-vec`（better-sqlite3 扩展）+ 智谱 embedding-2 API（复用 settings 的 API key）。
- 新增 `apps/server/src/utils/embedding.ts`（API embed）、`apps/server/src/utils/vector-store.ts`（sqlite-vec 封装）。
- 索引对象：chapters / design / world / outlines / notes / sources（对应 skill 的 collection 划分）。
- 新增 `apps/server/src/utils/semantic-search.ts` + 路由 `GET /search?q=...&collection=...&top_k=...`。
- 自动索引钩子：章节确认后索引；meta-index（P3）追踪文件变化做增量。

**P2-2 · entity RAG + 动态写作空间**
- 新增 `apps/server/src/utils/entity-store.ts`（8 collection：characters/locations/items/events/foreshadowing/easter_eggs/storylines/timeline）+ `entity-extractors.ts`（从项目文件提取，复刻 skill 的表格 schema）。
- 新增 `apps/server/src/services/writing-space.service.ts`：三层上下文组装（静态设计 / 必读动态实体 / 按需检索），对应 skill `writing_space.py`。
- 接线：`WritingLoopService` 写作前用 writing-space 组装上下文替代当前 `get_chapter_context` 工具的简单拼装。

**P2-3 · 知识图谱**
- 新增 `relations` collection + `relation-extractors.ts`（从 characters relationships / events participants / storylines key_chars 等字段抽三元组）。
- 路由：`GET /graph/neighbors/:id`、`GET /graph/path`、`GET /graph/search`。
- 接线：`writing-space.service` 展开关联实体时同时查图谱邻居（1 跳），双源合并去重。

## 7. P3 概要（环境设置 / 其他）

- **P3-1 · source 工作流**：TS 版 epub/txt/md 解析（epub 用 `node-epub` 或解 zip 读 xhtml）+ `POST /novels/:id/source/import?workflow=rewrite|imitation|continuation` + source-aware 上下文（`ctx assemble` 自动带源文本节选，按 workflow 分支：rewrite→情节骨架 / imitation→风格指纹 / continuation→断点上下文）。
- **P3-2 · notes 子系统**：`notes/raw.md`（verbatim）+ `notes/summary.md`（蒸馏）+ `notes.service.ts`（add/list/revert + 阶段确认后自动蒸馏）。`ctx assemble` 检测到 summary.md 即追加。
- **P3-3 · parallel-design**：`pipeline_settings.parallel_design` + `chapters.outlines` 时间戳 + `isChapterWritable` 判定（上游五设计阶段 confirmed + 大纲就绪）。
- **P3-4 · meta-index + lint**：`meta-index.yaml` 产出文件注册表（path/stage/indexable/chunk_strategy/content_hash）供 vector/entity 增量发现；`lint` 校验项目结构（文件命名、front-matter、表格 schema）。

## 8. 迁移与回滚原则

1. **skill 是真相源**：所有移植以 skill 行为为准，parity test 守住。
2. **不破坏现有 web 流程**：P0-4 的 WritingLoopService 作为新路径上线，旧 `POST /chapters/:id/agents/chapter-writer/trigger` + 独立 editor trigger 保留为「直接写/直接审」快速通道，循环门是新默认。
3. **feature flag**：P2 RAG 全程在 `settings.featureFlags.rag` 后，默认关，不影响现有用户。
4. **存储不动**：不把 SQLite 改 project.yaml，也不反之。共享的是文件布局契约（novel 的 markdown 结构两边已一致），状态元数据各自存。
5. **回滚**：每个 P0 任务独立 PR，可单独 revert；P0-4 回滚后恢复自动 confirm。

## 9. P0 任务清单

| # | 任务 | 新增/改动文件 | 依赖 | parity 校验对象 |
|---|---|---|---|---|
| P0-1 | 提示词 & 知识对齐 | templates/agents/*(同步)、templates/writing-craft/*、templates/genre-cards/*、prompt-loader.ts、base-agent.ts | - | agent 知识加载表与 skill 一致 |
| P0-2 | prose_check.ts | utils/prose-check.ts、prose-check.test.ts | - | `prose_check.py` 同输入同输出 |
| P0-3 | verdict.ts | utils/verdict.ts、verdict.test.ts | - | `fictia verdict review/consistency` 同输出 |
| P0-4 | review-fix 循环门 | services/writing-loop.service.ts、orchestrator.ts、routes/chapters.ts | P0-2, P0-3 | 循环语义 = skill 章节写作流程 |
| P0-5 | 里程碑 | services/milestone.service.ts | P0-3 | = skill 里程碑一致性校验 |

建议实施顺序：P0-1 与 P0-2/P0-3 可并行（互不依赖）；P0-4 依赖 P0-2+P0-3；P0-5 依赖 P0-3。P0-1 最先做（内容对齐是其余任务的地基）。
