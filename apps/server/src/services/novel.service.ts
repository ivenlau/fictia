import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db, schema } from "../db/index.js";
import { fileService } from "./file.service.js";
import { removeOrchestrator } from "./pipeline.service.js";
import { FILE_TEMPLATES } from "../../../../packages/shared/src/constants.js";

const now = () => new Date().toISOString();

function parseNovel(row: any) {
  if (!row) return row;
  return {
    ...row,
    tags: typeof row.tags === "string" ? JSON.parse(row.tags) : row.tags,
  };
}

export const novelService = {
  list() {
    return db.select().from(schema.novels).all().map(parseNovel);
  },

  getById(id: string) {
    const row = db.select().from(schema.novels).where(eq(schema.novels.id, id)).get();
    return parseNovel(row);
  },

  /** 构造注入 agent prompt 的小说元信息上下文（标题/题材/简介/目标章节数/标签）。 */
  buildMetaContext(novel: {
    title: string;
    genre: string;
    description?: string;
    targetChapters: number;
    tags?: string[] | string;
  }): string {
    const tags = Array.isArray(novel.tags)
      ? novel.tags.join("、")
      : typeof novel.tags === "string"
        ? (() => {
            try {
              return JSON.parse(novel.tags as string).join("、");
            } catch {
              return novel.tags as string;
            }
          })()
        : "";
    return `小说标题：${novel.title}
题材类型：${novel.genre}
小说简介：${novel.description || "暂无"}
目标章节数：${novel.targetChapters}
标签：${tags || "无"}`;
  },

  /** 读取 meta.json（体裁卡选择 genreCard 等运行时配置的真相源；DB 不存这些）。 */
  async getMeta(id: string): Promise<Record<string, any> | null> {
    if (!this.getById(id)) return null;
    return fileService.readNovelMeta(id);
  },

  async create(data: { title: string; genre: string; description: string; targetChapters: number; tags: string[] }) {
    const id = uuid();
    const timestamp = now();

    // 创建数据库记录
    db.insert(schema.novels)
      .values({
        id,
        title: data.title,
        genre: data.genre,
        description: data.description,
        targetChapters: data.targetChapters,
        status: "creating",
        tags: JSON.stringify(data.tags),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    // 初始化文件目录结构
    await fileService.initNovelDir(id);

    // 创建工作区模板文件
    for (const template of Object.values(FILE_TEMPLATES)) {
      await fileService.writeWorkspaceFile(id, template.path, template.content);
    }

    // 保存元数据
    await fileService.saveNovelMeta(id, {
      title: data.title,
      genre: data.genre,
      description: data.description,
      targetChapters: data.targetChapters,
      tags: data.tags,
      createdAt: timestamp,
    });

    return this.getById(id)!;
  },

  async update(id: string, data: Partial<{ title: string; genre: string; description: string; targetChapters: number; status: string; tags: string[]; genreCard: string | null }>) {
    const updates: Record<string, unknown> = { updatedAt: now() };

    if (data.title !== undefined) updates.title = data.title;
    if (data.genre !== undefined) updates.genre = data.genre;
    if (data.description !== undefined) updates.description = data.description;
    if (data.targetChapters !== undefined) updates.targetChapters = data.targetChapters;
    if (data.status !== undefined) updates.status = data.status;
    if (data.tags !== undefined) updates.tags = JSON.stringify(data.tags);

    db.update(schema.novels).set(updates).where(eq(schema.novels.id, id)).run();

    // 同步更新元数据文件
    const meta = await fileService.readNovelMeta(id);
    if (meta) {
      await fileService.saveNovelMeta(id, {
        ...meta,
        ...data,
        updatedAt: updates.updatedAt,
      });
    }

    return this.getById(id);
  },

  async delete(id: string) {
    // 删除文件目录
    await fileService.deleteNovelDir(id);
    // 删除数据库记录
    db.delete(schema.novels).where(eq(schema.novels.id, id)).run();
  },

  /** Reset novel to fresh state: clear all agent outputs, chapters, and restore workspace templates */
  async reset(id: string) {
    const timestamp = now();

    // 删除所有相关数据
    db.delete(schema.chapters).where(eq(schema.chapters.novelId, id)).run();
    db.delete(schema.agentOutputs).where(eq(schema.agentOutputs.novelId, id)).run();
    db.delete(schema.chatMessages).where(eq(schema.chatMessages.novelId, id)).run();
    db.delete(schema.pipelineState).where(eq(schema.pipelineState.novelId, id)).run();
    removeOrchestrator(id);

    // 删除章节和 agent-outputs 目录下的所有文件
    const chapterFiles = await fileService.listChapterFiles(id);
    for (const file of chapterFiles) {
      await fileService.deleteChapter(id, file);
    }

    const agentFiles = await fileService.listAgentOutputFiles(id);
    for (const file of agentFiles) {
      await fileService.deleteWorkspaceFile(id, `agent-outputs/${file}`);
    }

    // 重置工作区文件为模板内容
    for (const template of Object.values(FILE_TEMPLATES)) {
      await fileService.writeWorkspaceFile(id, template.path, template.content);
    }

    // 恢复 meta.json（模板里是占位的 {}，需要写入实际元数据）
    const novel = this.getById(id);
    if (novel) {
      await fileService.saveNovelMeta(id, {
        title: novel.title,
        genre: novel.genre,
        description: novel.description,
        targetChapters: novel.targetChapters,
        tags: novel.tags,
        createdAt: novel.createdAt,
      });
    }

    // 删除非模板文件
    const allFiles = await fileService.listWorkspaceFiles(id);
    const templatePaths = new Set(Object.values(FILE_TEMPLATES).map((t) => t.path));
    for (const file of allFiles) {
      if (!templatePaths.has(file.path)) {
        await fileService.deleteWorkspaceFile(id, file.path);
      }
    }

    // 重建目录结构和 .gitkeep 占位文件
    await fileService.initNovelDir(id);

    // 重置小说状态
    db.update(schema.novels).set({ status: "creating", pipelineStatus: "not_started", updatedAt: timestamp }).where(eq(schema.novels.id, id)).run();

    return this.getById(id);
  },

  async getWorkspaceFiles(novelId: string) {
    const files = await fileService.listWorkspaceFiles(novelId);
    const results = [];

    for (const file of files) {
      const content = await fileService.readWorkspaceFile(novelId, file.path);
      results.push({
        id: `${novelId}:${file.path}`,
        novelId,
        path: file.path,
        type: file.type,
        content,
        createdAt: "",
        updatedAt: "",
      });
    }

    return results;
  },

  async getWorkspaceFile(novelId: string, filePath: string) {
    const content = await fileService.readWorkspaceFile(novelId, filePath);
    if (!content && content !== "") return null;

    const ext = filePath.split(".").pop() ?? "";
    const type = ext === "json" ? "json" : ext === "yml" || ext === "yaml" ? "yaml" : "markdown";

    return {
      id: `${novelId}:${filePath}`,
      novelId,
      path: filePath,
      type,
      content,
      createdAt: "",
      updatedAt: "",
    };
  },

  async updateWorkspaceFile(novelId: string, filePath: string, content: string) {
    await fileService.writeWorkspaceFile(novelId, filePath, content);
    return this.getWorkspaceFile(novelId, filePath);
  },

  async createWorkspaceFile(novelId: string, filePath: string, content: string) {
    await fileService.writeWorkspaceFile(novelId, filePath, content);
    return this.getWorkspaceFile(novelId, filePath);
  },

  async search(query: string) {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const results: Array<{
      type: "workspace" | "chapter";
      id: string;
      novelId: string;
      novelTitle: string;
      title: string;
      path: string;
      snippet: string;
    }> = [];

    const allNovels = this.list();

    for (const novel of allNovels) {
      // 搜索工作区文件
      const files = await this.getWorkspaceFiles(novel.id);
      for (const file of files) {
        if (!file.content) continue;
        const lower = file.content.toLowerCase();
        const idx = lower.indexOf(q);
        if (idx !== -1) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(file.content.length, idx + query.length + 60);
          const snippet =
            (start > 0 ? "..." : "") + file.content.slice(start, end) + (end < file.content.length ? "..." : "");
          results.push({
            type: "workspace",
            id: file.id,
            novelId: novel.id,
            novelTitle: novel.title,
            title: file.path.split("/").pop() ?? file.path,
            path: file.path,
            snippet,
          });
        }
      }

      // 搜索章节
      const chaptersList = await db
        .select()
        .from(schema.chapters)
        .where(eq(schema.chapters.novelId, novel.id))
        .all();

      for (const ch of chaptersList) {
        const content = ch.filename
          ? await fileService.readChapter(novel.id, ch.filename)
          : "";
        const searchable = `${ch.title ?? ""} ${content}`;
        const lower = searchable.toLowerCase();
        const idx = lower.indexOf(q);
        if (idx !== -1) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(searchable.length, idx + query.length + 60);
          const snippet =
            (start > 0 ? "..." : "") + searchable.slice(start, end) + (end < searchable.length ? "..." : "");
          results.push({
            type: "chapter",
            id: ch.id,
            novelId: novel.id,
            novelTitle: novel.title,
            title: ch.title ?? `第${ch.number}章`,
            path: `章节/${ch.title ?? `第${ch.number}章`}`,
            snippet,
          });
        }
      }
    }

    return results;
  },
};
