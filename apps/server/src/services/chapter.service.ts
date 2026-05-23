import { eq } from "drizzle-orm";
import { v4 as uuid } from "uuid";
import { db, schema } from "../db/index.js";
import { fileService } from "./file.service.js";

const now = () => new Date().toISOString();

function generateFilename(number: number, title?: string): string {
  const padded = String(number).padStart(3, "0");
  const safeTitle = (title || "未命名").replace(/[/\\:*?"<>|]/g, "_");
  return `${padded}-${safeTitle}.md`;
}

export const chapterService = {
  async listByNovel(novelId: string) {
    const rows = db
      .select()
      .from(schema.chapters)
      .where(eq(schema.chapters.novelId, novelId))
      .all();

    // 为每个章节加载内容
    const chapters = [];
    for (const row of rows) {
      const content = row.filename
        ? await fileService.readChapter(novelId, row.filename)
        : "";
      chapters.push({ ...row, content });
    }
    return chapters;
  },

  async getById(id: string) {
    const row = db.select().from(schema.chapters).where(eq(schema.chapters.id, id)).get();
    if (!row) return null;

    const content = row.filename
      ? await fileService.readChapter(row.novelId, row.filename)
      : "";

    return { ...row, content };
  },

  async create(data: { novelId: string; number: number; title?: string; summary?: string; goal?: string }) {
    const id = uuid();
    const timestamp = now();
    const title = data.title ?? "";
    const filename = generateFilename(data.number, title);

    // 创建空文件
    await fileService.writeChapter(data.novelId, filename, "");

    db.insert(schema.chapters)
      .values({
        id,
        novelId: data.novelId,
        number: data.number,
        title,
        summary: data.summary ?? "",
        filename,
        version: 1,
        status: "empty",
        goal: data.goal ?? "",
        wordCount: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return this.getById(id)!;
  },

  async update(id: string, data: Partial<{ title: string; summary: string; content: string; status: string; goal: string; version: number }>) {
    const chapter = await this.getById(id);
    if (!chapter) return null;

    const updates: Record<string, unknown> = { updatedAt: now() };

    // 处理内容更新
    if (data.content !== undefined) {
      let filename = chapter.filename || generateFilename(chapter.number, chapter.title ?? undefined);

      // 如果标题改变了，需要重命名文件
      if (data.title !== undefined && data.title !== chapter.title) {
        const newFilename = generateFilename(chapter.number, data.title);
        if (chapter.filename) {
          await fileService.renameChapter(chapter.novelId, chapter.filename, newFilename);
        }
        filename = newFilename;
        updates.filename = newFilename;
      }

      // 写入文件
      await fileService.writeChapter(chapter.novelId, filename, data.content);
      updates.wordCount = data.content.replace(/\s/g, "").length;
    } else if (data.title !== undefined && data.title !== chapter.title) {
      // 只改标题，不改内容
      const newFilename = generateFilename(chapter.number, data.title);
      if (chapter.filename) {
        await fileService.renameChapter(chapter.novelId, chapter.filename, newFilename);
      }
      updates.filename = newFilename;
    }

    if (data.title !== undefined) updates.title = data.title;
    if (data.summary !== undefined) updates.summary = data.summary;
    if (data.status !== undefined) updates.status = data.status;
    if (data.goal !== undefined) updates.goal = data.goal;
    if (data.version !== undefined) updates.version = data.version;

    db.update(schema.chapters).set(updates).where(eq(schema.chapters.id, id)).run();

    return this.getById(id);
  },

  async delete(id: string) {
    const chapter = db.select().from(schema.chapters).where(eq(schema.chapters.id, id)).get();
    if (chapter?.filename) {
      await fileService.deleteChapter(chapter.novelId, chapter.filename);
    }
    db.delete(schema.chapters).where(eq(schema.chapters.id, id)).run();
  },

  async getFeedback(chapterId: string) {
    return db
      .select()
      .from(schema.reviewFeedback)
      .where(eq(schema.reviewFeedback.chapterId, chapterId))
      .all();
  },
};
