/**
 * 刷新章节文件名的 act 维度。
 *
 * 扫 chapters/、outline/chapters/、reviews/ 下 ch{NN}_act{N}-*.md 文件，
 * 用 chapterToAct（读 design/blueprint.md 的 ## 幕定义）重算 act，若变化则 rename。
 * .bak 备份文件不处理（不被解析）。
 *
 * 运行：
 *   pnpm --filter @fictia/server db:refresh-act            # dry-run（打印变更不写盘）
 *   pnpm --filter @fictia/server db:refresh-act -- --apply # 实际 rename
 */
import fs from "fs/promises";
import path from "path";
import { chapterToAct } from "../utils/context-extractor.js";

const DATA_ROOT = path.join(process.cwd(), "fictia-data", "novels");
const APPLY = process.argv.includes("--apply");

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

/** 解析 ch{NN}_act{N}-{body}[-review].md → {num, oldAct, body, suffix}。 */
function parseActFile(basename: string): { num: number; oldAct: number; body: string; suffix: string } | null {
  const m = basename.match(/^ch(\d+)_act(\d+)-(.*?)(-review)?\.md$/);
  if (!m) return null;
  return { num: Number(m[1]), oldAct: Number(m[2]), body: m[3], suffix: m[4] ?? "" };
}

async function refreshDir(
  dir: string,
  blueprint: string,
  kind: string,
): Promise<Array<{ from: string; to: string; kind: string }>> {
  if (!(await exists(dir))) return [];
  const files = await fs.readdir(dir);
  const renames: Array<{ from: string; to: string; kind: string }> = [];
  for (const f of files) {
    if (!f.endsWith(".md") || f === ".gitkeep") continue;
    const parsed = parseActFile(f);
    if (!parsed) continue; // 跳过 .bak / 非 act 命名文件
    const newAct = chapterToAct(parsed.num, blueprint);
    if (newAct === parsed.oldAct) continue;
    const newName = `ch${String(parsed.num).padStart(2, "0")}_act${newAct}-${parsed.body}${parsed.suffix}.md`;
    renames.push({ from: path.join(dir, f), to: path.join(dir, newName), kind });
  }
  return renames;
}

async function main() {
  console.log(APPLY ? "=== APPLY（实际重命名）===" : "=== DRY RUN（加 --apply 执行）===");
  if (!(await exists(DATA_ROOT))) {
    console.log("数据目录不存在");
    return;
  }

  const novelIds = await fs.readdir(DATA_ROOT);
  let total = 0;

  for (const id of novelIds) {
    const novelDir = path.join(DATA_ROOT, id);
    const stat = await fs.stat(novelDir).catch(() => null);
    if (!stat?.isDirectory()) continue;

    let blueprint = "";
    for (const bp of ["design/blueprint.md", "blueprint.md"]) {
      const c = await readText(path.join(novelDir, bp));
      if (c) {
        blueprint = c;
        break;
      }
    }
    console.log(`\n=== ${id}（blueprint ${blueprint ? "已加载" : "缺失，走兜底"}）===`);

    const all: Array<{ from: string; to: string; kind: string }> = [];
    all.push(...(await refreshDir(path.join(novelDir, "chapters"), blueprint, "章节")));
    all.push(...(await refreshDir(path.join(novelDir, "outline", "chapters"), blueprint, "大纲")));
    all.push(...(await refreshDir(path.join(novelDir, "reviews"), blueprint, "审核")));

    if (all.length === 0) {
      console.log("  无需变更");
      continue;
    }
    for (const r of all) {
      console.log(`  [${r.kind}] ${path.basename(r.from)} → ${path.basename(r.to)}`);
    }
    total += all.length;

    if (APPLY) {
      for (const r of all) {
        if (await exists(r.from)) await fs.rename(r.from, r.to);
      }
    }
  }

  console.log(`\n${APPLY ? "✅ 已重命名" : "待重命名"} ${total} 项`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
