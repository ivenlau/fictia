/**
 * 数据迁移脚本：将数据库中的内容迁移到文件系统
 *
 * 运行方式: pnpm --filter @fictia/server db:migrate-to-files
 */

import Database from "better-sqlite3";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, "../../fictia.db");
const DATA_ROOT = path.join(process.cwd(), "fictia-data");

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function writeFile(filePath: string, content: string) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, "utf-8");
}

function generateChapterFilename(number: number, title?: string): string {
  const padded = String(number).padStart(3, "0");
  const safeTitle = (title || "未命名").replace(/[/\\:*?"<>|]/g, "_");
  return `${padded}-${safeTitle}.md`;
}

async function migrate() {
  console.log("Starting migration...");
  console.log(`Database: ${dbPath}`);
  console.log(`Data root: ${DATA_ROOT}`);

  // 检查数据库是否存在
  try {
    await fs.access(dbPath);
  } catch {
    console.log("Database not found, nothing to migrate.");
    return;
  }

  const db = new Database(dbPath);

  // 确保数据目录存在
  await ensureDir(DATA_ROOT);

  // 1. 迁移小说数据
  console.log("\n1. Migrating novels...");
  const novels = db.prepare("SELECT * FROM novels").all() as any[];
  console.log(`   Found ${novels.length} novels`);

  for (const novel of novels) {
    const novelDir = path.join(DATA_ROOT, "novels", novel.id);
    await ensureDir(novelDir);
    await ensureDir(path.join(novelDir, "前期准备"));
    await ensureDir(path.join(novelDir, "chapters"));
    await ensureDir(path.join(novelDir, "agent-outputs"));

    // 保存元数据
    await writeFile(
      path.join(novelDir, "meta.json"),
      JSON.stringify(
        {
          id: novel.id,
          title: novel.title,
          genre: novel.genre,
          description: novel.description,
          targetChapters: novel.target_chapters,
          tags: JSON.parse(novel.tags || "[]"),
          status: novel.status,
          createdAt: novel.created_at,
          updatedAt: novel.updated_at,
        },
        null,
        2,
      ),
    );

    console.log(`   ✓ Novel: ${novel.title}`);
  }

  // 2. 迁移工作区文件
  console.log("\n2. Migrating workspace files...");
  const workspaceFiles = db.prepare("SELECT * FROM workspace_files").all() as any[];
  console.log(`   Found ${workspaceFiles.length} workspace files`);

  for (const file of workspaceFiles) {
    const filePath = path.join(DATA_ROOT, "novels", file.novel_id, file.path);
    await writeFile(filePath, file.content || "");
    console.log(`   ✓ ${file.path}`);
  }

  // 3. 迁移章节内容
  console.log("\n3. Migrating chapters...");
  const chapters = db.prepare("SELECT * FROM chapters").all() as any[];
  console.log(`   Found ${chapters.length} chapters`);

  for (const chapter of chapters) {
    if (chapter.content) {
      const filename = generateChapterFilename(chapter.number, chapter.title);
      const filePath = path.join(DATA_ROOT, "novels", chapter.novel_id, "chapters", filename);
      await writeFile(filePath, chapter.content);
      console.log(`   ✓ Chapter ${chapter.number}: ${chapter.title || "未命名"}`);
    }
  }

  // 4. 迁移 Agent 产出
  console.log("\n4. Migrating agent outputs...");
  const agentOutputs = db.prepare("SELECT * FROM agent_outputs").all() as any[];
  console.log(`   Found ${agentOutputs.length} agent outputs`);

  for (const output of agentOutputs) {
    if (output.content) {
      const timestamp = new Date(output.created_at).getTime();
      const filename = `${output.agent_type}-${timestamp}.md`;
      const filePath = path.join(DATA_ROOT, "novels", output.novel_id, "agent-outputs", filename);
      await writeFile(filePath, output.content);
      console.log(`   ✓ ${output.agent_type} (${output.status})`);
    }
  }

  // 5. 更新数据库 schema
  console.log("\n5. Updating database schema...");

  // 添加 filename 列到 chapters 表
  try {
    db.exec("ALTER TABLE chapters ADD COLUMN filename TEXT DEFAULT ''");
    console.log("   ✓ Added filename column to chapters");
  } catch {
    console.log("   - chapters.filename column already exists");
  }

  // 添加 filename 列到 agent_outputs 表
  try {
    db.exec("ALTER TABLE agent_outputs ADD COLUMN filename TEXT DEFAULT ''");
    console.log("   ✓ Added filename column to agent_outputs");
  } catch {
    console.log("   - agent_outputs.filename column already exists");
  }

  // 更新 chapters 的 filename
  for (const chapter of chapters) {
    if (chapter.content) {
      const filename = generateChapterFilename(chapter.number, chapter.title);
      db.prepare("UPDATE chapters SET filename = ? WHERE id = ?").run(filename, chapter.id);
    }
  }
  console.log("   ✓ Updated chapters filenames");

  // 更新 agent_outputs 的 filename
  for (const output of agentOutputs) {
    if (output.content) {
      const timestamp = new Date(output.created_at).getTime();
      const filename = `${output.agent_type}-${timestamp}.md`;
      db.prepare("UPDATE agent_outputs SET filename = ? WHERE id = ?").run(filename, output.id);
    }
  }
  console.log("   ✓ Updated agent_outputs filenames");

  // 6. 可选：清理数据库中的内容字段
  console.log("\n6. Cleanup options:");
  console.log("   To remove content from database, run:");
  console.log("   - CREATE TABLE chapters_new AS SELECT id, novel_id, number, title, summary, filename, version, status, goal, word_count, created_at, updated_at FROM chapters;");
  console.log("   - DROP TABLE chapters;");
  console.log("   - ALTER TABLE chapters_new RENAME TO chapters;");
  console.log("   (Similar for agent_outputs and workspace_files)");

  db.close();

  console.log("\n✅ Migration complete!");
  console.log(`Data files location: ${DATA_ROOT}`);
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
