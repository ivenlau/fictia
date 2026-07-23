# 素材库（Material Library）设计文档

> 状态：**草案，待讨论**。本文先定「是什么 / 为什么 / 怎么和现有系统融合」，确认后再进入实现拆分。
> 作者：Claude · 日期：2026-07-23

---

## 0. 一句话目标

在侧边栏新增「素材库」面板，把**当前散落、对用户不可见的创作素材**（体裁卡、写作技法、提示词、对标样例等）统一收口为「可浏览 / 可编辑 / 可开关 / 可注入流水线」的资产层——让素材**真正进入写作过程发挥作用**，而不是只是个存东西的仓库。

**设计第一原则**：每一个素材类型都必须有明确的「注入点」（它怎么影响 agent 的产出）。不能注入、不影响产出的，不放进素材库。

---

## 0.5 已确认范围（2026-07-23 讨论拍板）

首期交付 = **Phase 1 + Phase 2 + C2 片段模板**，一次到位：

- ✅ 侧边栏「素材库」面板（注册 + 容器 + tab）
- ✅ **只读亮出**：8 张体裁卡 + 20 篇写作技法，全文预览
- ✅ **体裁卡选择**：下拉选卡替代自由文本 genre（写 `meta.json.genreCard`，兼容回退 `genre`）
- ✅ **注入预览**：`injection-preview` 接口，用户直观看到素材进了 system prompt
- ✅ **用户素材 CRUD**（文件 + `materials` 表，作用域 = 按书默认 + 全局共享可选）
- ✅ **C1 创作偏好**注入（`buildSystemPrompt` 加「# 用户偏好」段）
- ✅ **自定义写作技法**合并进 `loadCraftKnowledge`
- ✅ **自定义体裁卡**（clone 内置 + 编辑）
- ✅ **C2 片段模板**：brainstorm / chat 输入框一键插入

**砍掉**：~~C3 agent 提示词覆写~~（高风险，不做）。
**推迟但保留设计**：D 对标素材——独立做、不与 P3-1 耦合；存储原语预留 P3-1 整书导入扩展点（§7）。待 P3-1 时间表确定后再排期，不在首期。
**作用域**：按书为默认，「共享到全局」可选（§4.2 `fictia-data/materials/`）。

---

## 1. 背景与现状：已存在但不可见的素材

经过对 `apps/server` + `apps/web` 的核查，系统里**已经有一批素材，只是用户看不到、管不了**。这是素材库最便宜也最高价值的第一步。

| 素材 | 现状 | 数量 | 用户可见？ | 加载方式 |
|---|---|---|---|---|
| **体裁卡片** genre-cards | `apps/server/templates/genre-cards/*.md` | 8 | ❌ 不可见 | `meta.json.genre`（自由文本）匹配文件名，由 `loadCraftKnowledge(agentName, genre)` 注入 |
| **写作技法库** writing-craft | `apps/server/templates/writing-craft/*.md` | 20 | ❌ 不可见 | 每个 agent 的 `system.md` 里「# 知识加载」表列出要加载哪些 craft 文件 |
| **Agent 提示词** | `apps/server/templates/agents/{name}/system.md` | 11 | ❌ 不可见、不可改 | 运行时 `loadPromptTemplate` 只读加载 |
| **风格锚定** style-guide.md | 每个小说目录下的文件 | 1/书 | 间接（编辑器里能看到文件） | `buildSystemPrompt()` 注入「# 风格锚定」段 |
| **对标素材 / 风格指纹** | **完全不存在** | 0 | — | （parity 方案 P3-1 的未来工作） |

关键代码事实（决定「接线点」）：

- **注入中心**：`apps/server/src/agents/base-agent.ts::buildSystemPrompt()`（67–90 行）。当前顺序：
  1. `loadPromptTemplate(agentName)` → base prompt
  2. `loadCraftKnowledge(agentName, genre)` → 注入为 `## 已加载知识`（含 craft + genre card）
  3. `readStyleGuide()` → 注入为 `# 风格锚定`
  三段都落在 `# 专业能力` 之前。这是一个清晰的挂载点，新素材类型往这里接。
- **体裁来源**：`readNovelGenre()`（96–107 行）读 `meta.json.genre`，**纯自由文本**，靠文件名匹配体裁卡——脆弱（拼错就匹配不到）。
- **侧边栏注册**（前端）：`ActivityBar.tsx` 的 `items` 数组 + `uiStore.ts` 的 `Panel` 联合类型 + `IDELayout.tsx` 的条件渲染。新增面板动这 3 处即可，`KnowledgePanel.tsx` 是现成模板。

---

## 2. 素材分类（taxonomy）

把素材库内容分为 5 类。前 3 类是「已存在，需亮出」，后 2 类是「净新增」。每类都配了注入点（见 §3）。

### 类型 A · 体裁卡片（Genre Cards）— 已存在
- 内置 8 张（仙侠/玄幻/都市脑洞/悬疑/科幻末世/总裁言情/历史/年代），YAML front-matter + 富结构正文（开场抓手 / 冲突发动机 / 爽点 / 对话声线 / 章尾钩子 / 场景颗粒 / 前中后期打法 / 节奏密度 / 禁止漂移 / 证据摘要）。
- **价值**：让用户（1）看得见当前书用的是哪张卡；（2）从下拉里选卡（替代脆弱的自由文本 genre）；（3）clone 内置卡做本项目专属魔改；（4）从零写自定义卡。

### 类型 B · 写作技法库（Writing-Craft）— 已存在但完全隐藏
- 内置 20 篇（`prose-craft.md` / `dialogue.md` / `anti-ai-writing.md` / `character-design.md` / `conflict.md` / `reversals.md` / `chapter-hooks.md` ……）。
- **价值**：（1）只读浏览——用户终于能看到「系统对对话/反转/钩子是怎么想的」，这本身就是巨大的透明度收益和信任收益；（2）加自定义技法，按 agent 的知识加载表自动并入。

### 类型 C · 提示词（Custom Prompts）— 净新增
「自定义提示词」太笼统，拆成 3 个具体子类，风险/价值递增：

- **C1 · 创作偏好 / 作者之声（推荐做，低风险高价值）**：用户常驻的创作指令，如「本卷走爽文节奏，避免后妈文」「多用短句，对话占比 30%+」。当前只能靠每次运行时手敲 `userDirective`，无法持久化。**注入**：在相关 agent 运行时，作为「# 用户偏好」段注入 system prompt 或 prepend 到 user message。按书生效，可开关。
- **C2 · 提示词片段 / 模板（中等价值）**：命名的可复用 prompt 片段（如「审稿视角·商业化」「头脑风暴·反派维度」），用户在 brainstorm / co-create / chat 输入框里一键插入。**注入**：用户手动插入，不自动进流水线。
- ~~**C3 · Agent 提示词覆写**~~（**已砍，首期不做**）：原设想是覆盖某 agent 的 `system.md`（如把 chapter-writer 改得更文学）。风险高（可能破坏流水线输出契约 / 阶段依赖），本轮不做，留作未来进阶项。

### 类型 D · 对标素材（Benchmark / Reference）— 净新增，与 P3-1 有交集
用户贴入/导入**参考片段**（喜欢的书的段落、自己旧作的片段），打标签（风格 / 节奏 / 结构 / 对话 / 情绪）。两条注入路径：

- **D1 · 风格指纹锚定**：对一组对标片段用 LLM 提炼「风格指纹」，注入为「# 风格锚定·对标」段（和 style-guide 平级）。
- **D2 · 语义检索对标**：片段进向量库（collection = `materials`），写作时由 writing-space 按当前场景语义召回相关对标段落。

### 类型 E · 其他素材（stretch，可选，不进首期）
- **灵感碎片**：自由想法/脑洞，喂给 brainstorm。
- **词汇/语料库**：禁用词（已有一篇 craft）、偏好词、领域术语表（如修真术语）。注入为「# 词汇约束」段或合并进 banned-words。
- **人物原型 / 世界观参考**：跨书复用的设定模板。

---

## 3. ★核心：每类素材如何「发挥作用」（注入点映射）

这是整个设计的灵魂。下表把每个素材类型钉死到流水线里的一个具体注入点。

| 素材类型 | 注入点（代码位置） | 注入形态 | 触发 | 作用域 |
|---|---|---|---|---|
| A 体裁卡 | `buildSystemPrompt` → `## 已加载知识`（**已有**，扩展读取自定义卡） | system prompt 段 | `meta.json.genreCard` 指定 | 按书 |
| B 写作技法（内置） | `buildSystemPrompt` → `## 已加载知识`（**已有**） | system prompt 段 | agent 知识加载表 | 全局只读 |
| B 写作技法（自定义） | 扩展 `loadCraftKnowledge`：合并 `materials/craft/` 下自定义文件 | system prompt 段 | 知识加载表匹配 | 按书 |
| C1 创作偏好 | `buildSystemPrompt` 新增「# 用户偏好」段（或 prepend user message） | system prompt 段 | 该书启用即注入 | 按书 |
| C2 片段模板 | 不进自动流水线；UI 一键插入到 brainstorm/chat 输入框 | 手动插入 | 用户点击 | 全局/按书 |
| ~~C3 agent 覆写~~ | ~~已砍，首期不做~~ | — | — | — |
| D1 风格指纹 | `buildSystemPrompt` 新增「# 风格锚定·对标」段 | system prompt 段 | 该书启用 | 按书 |
| D2 对标检索 | writing-space 三层之「按需检索」层，向量 collection `materials` | 动态召回，拼进写作上下文 | 写作时语义触发 | 按书 |

**注入顺序**（建议，都落在 `# 专业能力` 之前）：

```
base prompt
# 用户偏好          ← C1（最高意图权威，放最上）
## 已加载知识        ← A 体裁卡 + B 写作技法
# 风格锚定·对标     ← D1
# 风格锚定          ← style-guide（已有）
# 专业能力
```

> 小重构建议：把 `buildSystemPrompt` 里现在的连续 `.replace("# 专业能力", ...)` 链，改成一个 `sections: {title, content}[]` 数组按顺序拼装。更清晰、更易加新段、避免 replace 顺序依赖。

---

## 4. 数据模型与持久化

遵循现有「**SQLite 存元数据 + 文件系统存内容**」的混合模式（novel 目录已是这种模式）。

### 4.1 内置目录（只读）
体裁卡 / 写作技法 / agent 模板**仍在 `templates/`**，只读。新增 `GET /materials/catalog` 暴露清单 + 内容。零迁移。

### 4.2 用户素材（CRUD）

**内容落文件**（匹配 style-guide.md / chapters 的「文件即真相」契约）：

```
{novelDir}/materials/
├── genre-cards/{key}.md      # A 自定义体裁卡（YAML front-matter + 正文）
├── craft/{key}.md            # B 自定义写作技法
├── prompts/
│   ├── preferences.md        # C1 创作偏好（单文件，always-on）
│   ├── snippets/{key}.md     # C2 片段模板
│   └── agent-overrides/{agentName}.md  # C3 覆写
├── benchmarks/{key}.md       # D 对标素材片段（+ 标签 front-matter）
└── benchmarks/_fingerprint.md # D1 提炼出的风格指纹（缓存）

fictia-data/materials/         # 全局共享素材（可选，scope=global）
```

**元数据 + 开关落 DB**（新增 `materials` 表，drizzle）：

```ts
materials {
  id          text pk
  novelId     text?       // null = 全局共享
  type        text        // genre-card | craft | prompt-pref | prompt-snippet | agent-override | benchmark
  key         text        // slug，(novelId, type, key) 唯一
  name        text
  description text?
  scope       text        // novel | global
  enabled     int  default 1
  sourceOrigin text       // built-in-clone | user
  metadata    text  default '{}'  // JSON：标签、风格指纹状态、注入模式等
  createdAt   text
  updatedAt   text
}
```

> **替代方案（决策点 §9.2）**：内容也存 DB（不走文件）。更简单一致，但偏离现有「内容是文件」契约，且 agent 的 `read_project_file` 工具读不到（除非额外桥接）。**推荐文件 + DB 索引**。

### 4.3 体裁选择的破坏性变更
当前 `meta.json.genre` 是自由文本。改为卡片选择后会写 `meta.json.genreCard = "xianxia"`（同时保留 `genre` 文本做显示）。`readNovelGenre()` 改为优先读 `genreCard`，回退 `genre`。**存量书**的 genre 文本若匹配不到内置卡，则视为「无卡」，UI 提示用户选一张——不破坏现有行为。

---

## 5. API 设计

遵循现有 REST 约定（`GET /`、`POST /`、`PATCH /:id`、`DELETE /:id`、动作 `POST /:id/action`）。

```
# 内置目录（只读）
GET  /materials/catalog?type=genre-card|craft          # 列内置 + 预览

# 用户素材 CRUD（按书）
GET    /novels/:novelId/materials?type=...             # 列表
POST   /novels/:novelId/materials                      # 新建（或 clone 内置）
GET    /novels/:novelId/materials/:id                  # 取内容
PATCH  /novels/:novelId/materials/:id                  # 改内容/开关
DELETE /novels/:novelId/materials/:id
POST   /novels/:novelId/materials/:id/clone            # clone 内置卡到本项目（可改）

# 全局素材（可选）
GET/POST/PATCH/DELETE  /materials                      # scope=global

# 注入预览 / 调试
GET  /novels/:novelId/materials/injection-preview?agent=chapter-writer
       # 返回「当前启用素材拼进 system prompt 的样子」——用户能直观看到素材在起作用 ★

# 体裁选择
PATCH /novels/:novelId  { genreCard: "xianxia" }       # 复用现有 PATCH /novels/:id

# 对标素材专属（Phase 3）
POST  /novels/:novelId/materials/:id/extract-fingerprint  # LLM 提炼风格指纹（SSE）
POST  /novels/:novelId/materials/index                    # 入向量库（复用现有 vector 索引）
```

新增路由文件：`apps/server/src/routes/materials.ts`。

---

## 6. 前端 UI 设计

### 6.1 注册侧边栏面板（动 3 处）
- `uiStore.ts`：`Panel` 联合类型加 `"material"`。
- `ActivityBar.tsx`：`items` 加一项。注意 `Library` 图标已被「知识库」占用，素材库建议用 `Boxes` / `Archive` / `BookMarked`。
- `IDELayout.tsx`：条件渲染 `: activePanel === "material" ? <MaterialPanel />`。

### 6.2 MaterialPanel 结构（照 KnowledgePanel 的 tab 模式）

```
┌ 素材库 ─────────────────────┐
│ [体裁卡] [技法] [提示词] [对标] │  ← tab
├─────────────────────────────┤
│  当前体裁：仙侠 ✓            │  ← 体裁卡 tab
│  ┌─────────┐ ┌─────────┐    │
│  │ 仙侠  ✓ │ │ 玄幻    │ …  │  ← 卡片网格，点开预览
│  └─────────┘ └─────────┘    │
│  [+ 自定义体裁卡]            │
├─────────────────────────────┤
│  每行：[开关] 名称 [范围] ⋯ │  ← 通用列表行（启用/预览/编辑/克隆/删）
└─────────────────────────────┘
```

- **体裁卡 tab**：卡片网格 + 当前选中 + 预览侧抽屉 + 「设为本作体裁」+ clone/自定义。
- **技法 tab**：20 篇内置只读列表（点开全文预览）+ 自定义技法。
- **提示词 tab**：C1 创作偏好编辑器（单文件，富开关）+ C2 片段库（一键插入 brainstorm / chat 输入框）。
- **对标 tab**：（首期不实现，UI 占位/灰显「即将推出」）。
- **通用**：每行带启用开关、范围徽标（本作/全局）、预览、编辑、删除。编辑器复用现有 markdown 编辑组件（front-matter 字段对结构化类型提供表单）。

### 6.3 API 客户端
新增 `apps/web/src/api/materials.ts`，导出 `materialsApi`（照 `knowledge.ts` 模式）。

---

## 7. 与 parity 方案的关系（避免冲突）

parity 方案（`docs/parity-upgrade-plan.md`）是真相源。素材库必须和它对齐，不能另起炉灶：

| parity 项 | 素材库关系 |
|---|---|
| P0-1 体裁卡 / 写作技法 / agent 提示词同步 | **完全复用**。素材库只是把这些已同步的内容亮出来 + 可编辑，不改加载逻辑。 |
| P2-1 vector RAG | **复用**。对标素材 D2 走同一套 sqlite-vec + embedding 基础设施，新增 `materials` collection。在 `settings.featureFlags.rag` 之后。 |
| P2-2 writing-space 三层 | **接线点**。对标素材 D2 的语义召回挂在 writing-space「按需检索」层。 |
| P3-1 source 工作流（epub 导入 → imitation 风格指纹） | **边界见下**。 |
| P3-2 notes 子系统 | 不重叠（notes 是写作备注蒸馏，素材库是创作资产）。 |

**对标素材 vs P3-1 imitation 的边界（决策点 §9.3）**：
- P3-1 = 导入**整本**源作品 + 跑 rewrite/imitation/continuation **工作流**（重）。
- 素材库 D = 用户**手动策划**的片段集合 + 轻量注入（风格锚定 / 语义召回）（轻）。
- 建议素材库只建「存储 + 策划 + 轻注入」原语，P3-1 将来在**同一原语**上建「整书导入 + 自动指纹提取」流程。两者组合，不冲突。**但**若你打算很快做 P3-1，D 可以推迟，避免重复造存储层。

---

## 8. 分阶段实施计划

按确认范围（§0.5），首期合并交付。下面把首期拆成 PR 粒度的可独立交付块，外加推迟项与砍掉项。

### 首期交付（已确认）

**块 1 · 地基 + 只读亮出**（流水线零改动，先落地、可独立验收）
- 侧边栏面板脚手架（`uiStore` / `ActivityBar` / `IDELayout` / `MaterialPanel`）。
- `GET /materials/catalog` + 前端只读浏览：**8 张体裁卡 + 20 篇写作技法**，全文预览。
- **体裁卡选择**：下拉选卡替代自由文本 genre（写 `meta.json.genreCard`，兼容回退 `genre`）。
- **注入预览**：`GET .../injection-preview`——用户看到「当前启用素材如何进 system prompt」。

**块 2 · 用户素材 CRUD + 自定义内容**（动流水线注入）
- 用户素材 CRUD（文件 + `materials` 表，作用域 按书默认 / 全局可选）。
- 自定义写作技法合并进 `loadCraftKnowledge`（`materials/craft/`）。
- 自定义体裁卡（clone 内置 + 编辑，`materials/genre-cards/`）。
- **C1 创作偏好**注入（`buildSystemPrompt` 加「# 用户偏好」段）。

**块 3 · C2 片段模板**
- 片段 CRUD（`materials/prompts/snippets/`）+ brainstorm / chat 输入框一键插入入口。

### 推迟项（保留设计，不在首期）
- **D 对标素材 + RAG**：D1 风格指纹提炼（LLM/SSE）+ 注入；D2 向量索引（`materials` collection）+ writing-space 召回。
  - ⚠️ 存储原语（`materials` 表 + `materials/benchmarks/` 目录）在首期就建好，为 P3-1 整书导入留扩展点（§7）。
  - 待 P3-1 时间表确定后，D 与 P3-1 合并排期，避免重复造存储层。

### 砍掉项
- ~~C3 agent 提示词覆写~~：风险过高，不做（如未来需要，单独立项 + advanced/diff/默认关）。
- E 词汇库 / 灵感碎片 / 人物原型：stretch，不在本轮。

---

## 9. 已确认决策（2026-07-23）

讨论结果已拍板，摘要如下（详见 §0.5、§8）：

1. **首期范围** = Phase 1 + Phase 2 + C2 片段模板，一次到位（不再分两个里程碑慢慢来）。
2. **自定义提示词**：做 **C1 创作偏好 + C2 片段模板**；**C3 agent 覆写砍掉**。
3. **对标素材 D**：暂不确定 P3-1 时间表 → D **独立设计、推迟实现**；存储原语在首期建好、为 P3-1 留扩展点。
4. **作用域**：**按书为默认，「共享到全局」可选**。
5. **存储方案**（待我落实时定，倾向）：文件（内容）+ DB（元数据/开关）混合，匹配现有「内容即文件」契约。
6. **图标**（小决策，实现时定）：`Library` 已被知识库占用，素材库候选 `Boxes` / `Archive` / `BookMarked`。

---

## 10. 风险与边界

- ~~**C3 agent 覆写**~~：已砍，不再列入风险。
- **体裁卡选择对存量书**：自由文本 genre 改为卡片选择，存量匹配不上的降级为「无卡」，不破坏现有运行。
- **注入顺序冲突**：素材类型多了之后，system prompt 段落顺序会影响产出。§3 给了建议顺序，需实测调优（injection-preview 正好用于此）。
- **prompt 膨胀**：启用太多素材会让 system prompt 变长、挤占上下文。需要总量上限 / 警告，injection-preview 显示总长度。
- **自定义体裁卡/技法的加载正确性**：clone 后改名、front-matter `name` 与文件名不一致、知识加载表引用了不存在的文件等，需要校验（lint）。
- **成本（推迟项 D，feature flag）**：D1 指纹提炼（LLM）、D2 向量索引（embedding）有 API 调用成本。

---

## 11. 实现状态（2026-07-23）

块 1 / 2 / 3 **已全部实现并通过验证**（server + web typecheck/build 通过；后端注入逻辑端到端验证）。

| 块 | 状态 | 关键产物 |
|---|---|---|
| 块 1 只读亮出 + 体裁卡选择 + 注入预览 | ✅ | `GET /materials/catalog`、`/materials/agents`、`/novels/:id/materials/injection-preview`、`GET /novels/:id/meta`；前端 `MaterialPanel`（`Boxes` 图标）+ 体裁卡/技法/注入预览 tab |
| 块 2 用户素材 CRUD + 自定义技法/体裁卡 + C1 偏好 | ✅ | `utils/user-materials.ts`；`loadCraftKnowledge` 扩展（自定义 craft + 用户体裁卡覆盖内置）；`base-agent.buildSystemPrompt` 注入「# 用户偏好」；CRUD 路由；前端编辑器 + 管理器 + 偏好编辑器 |
| 块 3 C2 片段模板 + 一键插入 | ✅ | `prompt-snippet` 类型；`SnippetPicker` 接入 ChatPanel 输入框（brainstorm/co-create 前端 UI 尚未存在，待 P1 建好后同一 picker 可复用） |

**实现偏差（已采纳，优于原设计）**：用户素材**不建 DB 表**，改为纯文件 + front-matter（`novelDir/materials/{genre-cards,craft,prompts/snippets,preferences}.md`），`enabled`/`agents` 存 front-matter。理由：与 `style-guide.md` / genre-cards / writing-craft 同源「文件即真相」，agent 的 `read_project_file` 可直接读，无需 DB 迁移，风险更低。原 §4.2 提议的 `materials` 表未采用。

**验证要点**：
- 选 `genreCard=xianxia` → 体裁卡真正加载（注入预览 craft 段 +1256 字）。
- clone 内置卡 + 魔改 → 用户卡覆盖内置（注入预览含魔改内容）；删除 → 回退内置。
- C1 偏好启用 → 注入 system prompt 顶部；禁用 → 不注入。
- 自定义 craft 可 `agents:` 限定（chapter-writer 不加载、editor 加载）。
- 片段**不**自动注入（仅 ChatPanel 手动插入）。
- key 路径穿越防护（`/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/`，非法 400）。

