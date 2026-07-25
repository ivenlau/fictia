import { eq } from "drizzle-orm";
import { chapterPath, DESIGN_DIR } from "@fictia/shared";
import { db, schema } from "../db/index.js";
import { fileService } from "./file.service.js";
import { chapterToAct } from "../utils/context-extractor.js";

const now = () => new Date().toISOString();

/** 读 blueprint 算章节所属幕号（统一真相源，与 chapter-writer 一致）。 */
async function computeAct(novelId: string, number: number): Promise<number> {
  const blueprint = await fileService.readWorkspaceFile(novelId, `${DESIGN_DIR}/blueprint.md`);
  return chapterToAct(number, blueprint || undefined);
}

/** 生成章节文件 basename（chapters/ 下的文件名，不含目录前缀）。 */
function generateFilename(number: number, act: number, title?: string): string {
  return chapterPath(number, act, title).replace(/^chapters\//, "");
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

  async update(id: string, data: Partial<{ title: string; summary: string; content: string; status: string; goal: string; version: number }>) {
    const chapter = await this.getById(id);
    if (!chapter) return null;

    const updates: Record<string, unknown> = { updatedAt: now() };

    // 处理内容更新
    if (data.content !== undefined) {
      const act = await computeAct(chapter.novelId, chapter.number);
      let filename = chapter.filename || generateFilename(chapter.number, act, chapter.title ?? undefined);

      // 如果标题改变了，需要重命名文件
      if (data.title !== undefined && data.title !== chapter.title) {
        const newFilename = generateFilename(chapter.number, act, data.title);
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
      const act = await computeAct(chapter.novelId, chapter.number);
      const newFilename = generateFilename(chapter.number, act, data.title);
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
