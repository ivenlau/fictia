/**
 * 命名规范迁移脚本：把现有 novel 数据 rename 到新命名规范。
 *
 * 运行：
 *   pnpm --filter @fictia/server db:migrate-naming            # dry-run（默认，打印清单不写盘）
 *   pnpm --filter @fictia/server db:migrate-naming -- --apply # 实际执行
 *
 * 迁移内容：
 * - 章节 chapters/act-N/chXX.md  → chapters/chXX_actN-标题.md（扁平，act 进文件名）
 * - 章节 chapters/NNN-标题.md    → chapters/chXX_actN-标题.md
 * - 人物 characters/protagonist.md|antagonist.md → characters/{name}_{主角|反派}.md（frontmatter name）
 * - 人物 characters/supporting/{x}.md            → characters/{name}_配角.md
 * - 记忆 AI助手/记忆.md          → ai/memory.md
 * - 设计稿 根目录 5 个 .md       → design/
 * - 大纲 outline/chapters/chXX.md → chXX_actN-标题.md
 * - 审核 reviews/chXX-review.md  → chXX_actN-标题-review.md
 * - 素材 materials/craft         → materials/crafts
 * - 清理空 chapters/act-N 与 characters/supporting 目录、异常 outline 下字面 glob 文件
 *
 * 标题/角色名提取失败时回退并记 warning（dry-run 会高亮，apply 不阻断）。
 */
import fs from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { chapterPath, characterPath } from "@fictia/shared";

const DATA_ROOT = path.join(process.cwd(), "fictia-data", "novels");
const APPLY = process.argv.includes("--apply");

interface Rename {
  from: string;
  to: string;
  kind: string;
  note?: string;
}
const renames: Rename[] = [];
const cleanups: string[] = [];
const warnings: string[] = [];

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function readText(p: string): Promise<string | null> {
  try {
    return await fs.readFile(p, "utf-8");
  } catch {
    return null;
  }
}

function parseFrontmatter(content: string): Record<string, any> {
  const m = content.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return {};
  try {
    return (yaml.load(m[1]) as Record<string, any>) || {};
  } catch {
    return {};
  }
}

function h1Title(content: string): string | null {
  const m = content.match(/^#\s+(.+?)\s*$/m);
  return m?.[1] ?? null;
}

function outlineTitle(content: string): string | undefined {
  const labeled = content.match(/标题[：:]\s*(.+)/);
  if (labeled) return labeled[1].trim();
  return h1Title(content) ?? undefined;
}

/** blueprint 幕定义 → 章节号到 act 映射。 */
function blueprintActMap(blueprint: string): Map<number, number> {
  const map = new Map<number, number>();
  const actMatches = blueprint.match(/name:\s*"[^"]+"\s*\n\s*chapters:\s*\[([^\]]+)\]/g);
  if (actMatches) {
    let act = 1;
    for (const m of actMatches) {
      const nums = m.match(/\d+/g);
      if (nums) for (const n of nums) map.set(Number(n), act);
      act++;
    }
  }
  return map;
}

function defaultAct(num: number): number {
  if (num <= 3) return 0;
  if (num <= 15) return 1;
  if (num <= 30) return 2;
  if (num <= 45) return 3;
  return 4;
}

function actFor(actMap: Map<number, number>, num: number): number {
  return actMap.get(num) ?? defaultAct(num);
}

/** 章节标题：正文 H1 → 大纲标题 → "未命名"。 */
async function resolveChapterTitle(
  novelDir: string,
  chapterNum: number,
  chapterContent: string | null,
): Promise<string> {
  if (chapterContent) {
    const h1 = h1Title(chapterContent);
    if (h1) return h1;
  }
  // 大纲 fallback
  const outlineDir = path.join(novelDir, "outline", "chapters");
  if (await exists(outlineDir)) {
    const entries = await fs.readdir(outlineDir);
    for (const name of entries) {
      if (new RegExp(`^ch${String(chapterNum).padStart(2, "0")}(_act\\d+-.*)?\\.md$`).test(name)) {
        const oc = await readText(path.join(outlineDir, name));
        if (oc) {
          const t = outlineTitle(oc);
          if (t) return t;
        }
      }
    }
  }
  return "未命名";
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function mv(from: string, to: string) {
  await ensureDir(path.dirname(to));
  await fs.rename(from, to);
}

async function migrateNovel(novelDir: string) {
  const novelId = path.basename(novelDir);
  console.log(`\n=== Novel: ${novelId} ===`);

  // blueprint act 映射（支持 design/ 和根目录两种旧位置）
  let actMap = new Map<number, number>();
  for (const bp of ["design/blueprint.md", "blueprint.md"]) {
    const content = await readText(path.join(novelDir, bp));
    if (content) {
      actMap = blueprintActMap(content);
      break;
    }
  }

  await migrateChapters(novelDir, actMap);
  await migrateCharacters(novelDir);
  await migrateMemory(novelDir);
  await migrateDesignDocs(novelDir);
  await migrateOutlineChapters(novelDir, actMap);
  await migrateReviews(novelDir, actMap);
  await migrateCraft(novelDir);
  await collectCleanups(novelDir);
}

/** chapters/act-N/chXX.md 和 chapters/NNN-标题.md → chapters/chXX_actN-标题.md。 */
async function migrateChapters(novelDir: string, actMap: Map<number, number>) {
  const dir = path.join(novelDir, "chapters");
  if (!(await exists(dir))) return;
  const entries = (await fs.readdir(dir, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  // 目标文件名去重检测
  const usedNames = new Set<string>();

  for (const entry of entries) {
    if (entry.isDirectory() && /^act-\d+$/.test(entry.name)) {
      const sub = path.join(dir, entry.name);
      const files = await fs.readdir(sub);
      for (const f of files) {
        if (!f.endsWith(".md") || f === ".gitkeep") continue;
        const m = f.match(/^ch(\d+)\.md$/);
        if (!m) continue;
        const num = Number(m[1]);
        // act 统一用 chapterToAct（与正文写入逻辑一致），忽略旧 act-N 目录名的历史划分
        const act = actFor(actMap, num);
        const content = await readText(path.join(sub, f));
        const title = await resolveChapterTitle(novelDir, num, content);
        const rel = chapterPath(num, act, title);
        let basename = rel.replace(/^chapters\//, "");
        if (usedNames.has(basename)) {
          warnings.push(`章节冲突（同 num+act 已存在）：${entry.name}/${f} → ${basename}（备份，需人工确认保留哪个版本）`);
          let suffix = ".bak";
          let n = 1;
          while (usedNames.has(basename + suffix)) {
            n++;
            suffix = `.bak${n}`;
          }
          basename += suffix;
        }
        usedNames.add(basename);
        renames.push({
          from: path.join(sub, f),
          to: path.join(dir, basename),
          kind: "章节",
          note: `act=${act} 标题=${title}`,
        });
      }
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      // 根目录 NNN-标题.md（chapterService 命名）
      const m = entry.name.match(/^(\d+)-(.*)\.md$/);
      if (!m) continue;
      const num = Number(m[1]);
      const title = m[2];
      const act = actFor(actMap, num);
      const rel = chapterPath(num, act, title);
      let basename = rel.replace(/^chapters\//, "");
      if (usedNames.has(basename)) {
        warnings.push(`章节冲突：${entry.name} → ${basename}（备份）`);
        let suffix = ".bak";
        let n = 1;
        while (usedNames.has(basename + suffix)) {
          n++;
          suffix = `.bak${n}`;
        }
        basename += suffix;
      }
      usedNames.add(basename);
      renames.push({
        from: path.join(dir, entry.name),
        to: path.join(dir, basename),
        kind: "章节",
        note: `act=${act} 标题=${title}`,
      });
    }
  }
}

/** characters/protagonist|antagonist.md 与 supporting/*.md → {name}_{type}.md。 */
async function migrateCharacters(novelDir: string) {
  const dir = path.join(novelDir, "characters");
  if (!(await exists(dir))) return;

  const fixed: Record<string, string> = {
    "protagonist.md": "主角",
    "antagonist.md": "反派",
  };
  for (const [fname, type] of Object.entries(fixed)) {
    const p = path.join(dir, fname);
    const content = await readText(p);
    if (content === null) continue;
    const fm = parseFrontmatter(content);
    const name = String(fm.name ?? h1Title(content) ?? fname.replace(/\.md$/, ""));
    renames.push({ from: p, to: path.join(dir, characterPath(name, type).replace(/^characters\//, "")), kind: "人物", note: `${fname} → ${name}_${type}` });
  }

  // supporting/*.md → 配角
  const supDir = path.join(dir, "supporting");
  if (await exists(supDir)) {
    const files = await fs.readdir(supDir);
    for (const f of files) {
      if (!f.endsWith(".md") || f === ".gitkeep") continue;
      const p = path.join(supDir, f);
      const content = await readText(p);
      const fm = content ? parseFrontmatter(content) : {};
      const name = String(fm.name ?? h1Title(content ?? "") ?? f.replace(/\.md$/, ""));
      renames.push({
        from: p,
        to: path.join(dir, characterPath(name, "配角").replace(/^characters\//, "")),
        kind: "人物",
        note: `supporting/${f} → ${name}_配角`,
      });
    }
  }
}

/** AI助手/记忆.md → ai/memory.md。 */
async function migrateMemory(novelDir: string) {
  const from = path.join(novelDir, "AI助手", "记忆.md");
  if (await exists(from)) {
    renames.push({ from, to: path.join(novelDir, "ai", "memory.md"), kind: "记忆" });
  }
}

/** 根目录 5 个设计稿 → design/。 */
async function migrateDesignDocs(novelDir: string) {
  const docs = ["genre-analysis.md", "blueprint.md", "style-guide.md", "art-design.md", "narrative-weave.md"];
  for (const d of docs) {
    const from = path.join(novelDir, d);
    if (await exists(from)) {
      renames.push({ from, to: path.join(novelDir, "design", d), kind: "设计稿" });
    }
  }
}

/** outline/chapters/chXX.md → chXX_actN-标题.md。 */
async function migrateOutlineChapters(novelDir: string, actMap: Map<number, number>) {
  const dir = path.join(novelDir, "outline", "chapters");
  if (!(await exists(dir))) return;
  const files = await fs.readdir(dir);
  for (const f of files) {
    if (!f.endsWith(".md") || f === ".gitkeep") continue;
    const m = f.match(/^ch(\d+)\.md$/);
    if (!m) continue; // 异常文件（如 *.md）留待 cleanup
    const num = Number(m[1]);
    const content = await readText(path.join(dir, f));
    const title = content ? outlineTitle(content) ?? "未命名" : "未命名";
    const act = actFor(actMap, num);
    const rel = chapterPath(num, act, title);
    const basename = rel.replace(/^chapters\//, "");
    renames.push({
      from: path.join(dir, f),
      to: path.join(dir, basename),
      kind: "大纲",
      note: `act=${act} 标题=${title}`,
    });
  }
}

/** reviews/chXX-review.md → chXX_actN-标题-review.md。 */
async function migrateReviews(novelDir: string, actMap: Map<number, number>) {
  const dir = path.join(novelDir, "reviews");
  if (!(await exists(dir))) return;
  const files = await fs.readdir(dir);
  for (const f of files) {
    if (!f.endsWith(".md") || f === ".gitkeep") continue;
    const m = f.match(/^ch(\d+)-review\.md$/);
    if (!m) continue; // consistency-report.md 等非章节审核保留
    const num = Number(m[1]);
    const title = await resolveChapterTitle(novelDir, num, null);
    const act = actFor(actMap, num);
    const basename = chapterPath(num, act, title).replace(/^chapters\//, "").replace(/\.md$/, "-review.md");
    renames.push({
      from: path.join(dir, f),
      to: path.join(dir, basename),
      kind: "审核",
      note: `act=${act} 标题=${title}`,
    });
  }
}

/** materials/craft → materials/crafts。 */
async function migrateCraft(novelDir: string) {
  const from = path.join(novelDir, "materials", "craft");
  if (await exists(from)) {
    renames.push({ from, to: path.join(novelDir, "materials", "crafts"), kind: "素材" });
  }
}

/** 收集清理项：空 chapters/act-N 与 characters/supporting 目录、异常 outline 下字面 glob 文件。 */
async function collectCleanups(novelDir: string) {
  // chapters/act-* 目录（章节搬出后应空）
  const chaptersDir = path.join(novelDir, "chapters");
  if (await exists(chaptersDir)) {
    const entries = await fs.readdir(chaptersDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isDirectory() && /^act-\d+$/.test(e.name)) {
        cleanups.push(path.join(chaptersDir, e.name));
      }
    }
  }
  // characters/supporting 目录
  cleanups.push(path.join(novelDir, "characters", "supporting"));
  // 异常 outline/*.md（字面 glob 文件名）
  const outlineDir = path.join(novelDir, "outline");
  if (await exists(outlineDir)) {
    const entries = await fs.readdir(outlineDir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && e.name.includes("*")) {
        cleanups.push(path.join(outlineDir, e.name));
      }
    }
  }
}

async function main() {
  if (!APPLY) {
    console.log("=== DRY RUN（加 --apply 实际执行）===");
  } else {
    console.log("=== APPLY（实际执行重命名）===");
  }

  if (!(await exists(DATA_ROOT))) {
    console.log(`数据目录不存在：${DATA_ROOT}`);
    return;
  }

  const novelIds = await fs.readdir(DATA_ROOT);
  for (const id of novelIds) {
    const novelDir = path.join(DATA_ROOT, id);
    const stat = await fs.stat(novelDir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    await migrateNovel(novelDir);
  }

  // 报告
  console.log(`\n=== 重命名清单（${renames.length} 项）===`);
  for (const r of renames) {
    const fromRel = path.relative(DATA_ROOT, r.from);
    const toRel = path.relative(DATA_ROOT, r.to);
    console.log(`  [${r.kind}] ${fromRel}  →  ${toRel}${r.note ? `  (${r.note})` : ""}`);
  }

  if (cleanups.length > 0) {
    console.log(`\n=== 清理项（${cleanups.length} 项，仅 --apply 时删除）===`);
    for (const c of cleanups) {
      const rel = path.relative(DATA_ROOT, c);
      const exist = await exists(c);
      console.log(`  ${rel}${exist ? "" : "  (已不存在)"}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n=== ⚠️ 警告（${warnings.length} 项）===`);
    for (const w of warnings) console.log(`  ${w}`);
  }

  if (!APPLY) {
    console.log("\n（dry-run 完成，未写盘。确认无误后加 --apply 执行）");
    return;
  }

  // 执行重命名
  console.log("\n=== 执行重命名 ===");
  for (const r of renames) {
    if (await exists(r.from)) {
      await mv(r.from, r.to);
      console.log(`  ✓ ${path.relative(DATA_ROOT, r.to)}`);
    }
  }

  // 清理（只删空目录 + 异常文件）
  console.log("\n=== 执行清理 ===");
  for (const c of cleanups) {
    if (!(await exists(c))) continue;
    try {
      // 目录：尝试递归删（act-* 内 .gitkeep 一起删）；文件：直接删
      const stat = await fs.stat(c);
      if (stat.isDirectory()) {
        const remaining = await fs.readdir(c);
        if (remaining.length === 0 || remaining.every((x) => x === ".gitkeep")) {
          await fs.rm(c, { recursive: true, force: true });
          console.log(`  ✓ 删除空目录 ${path.relative(DATA_ROOT, c)}`);
        } else {
          console.log(`  - 跳过非空目录 ${path.relative(DATA_ROOT, c)}（${remaining.length} 项）`);
        }
      } else {
        await fs.unlink(c);
        console.log(`  ✓ 删除异常文件 ${path.relative(DATA_ROOT, c)}`);
      }
    } catch (e) {
      console.log(`  ✗ 清理失败 ${path.relative(DATA_ROOT, c)}: ${(e as Error).message}`);
    }
  }

  console.log("\n✅ 迁移完成");
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
