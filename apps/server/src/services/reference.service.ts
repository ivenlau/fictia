import { fileService } from "./file.service.js";
import {
  listReferences,
  getReference,
  createReference,
  updateReference,
  deleteReference,
  type ReferenceMeta,
  type ReferenceWork,
  type CreateReferenceInput,
} from "../utils/reference-works.js";
import { parseReference, type ParseResult } from "./reference-parse.service.js";
import { writeUserMaterial, type UserMaterial } from "../utils/user-materials.js";

/**
 * 参考作品服务（薄封装）：经 fileService.getNovelDir 转 novelDir，委托给
 * utils/reference-works + services/reference-parse。仿 material.service.ts。
 */
export const referenceService = {
  list(novelId: string): Promise<ReferenceMeta[]> {
    return listReferences(fileService.getNovelDir(novelId));
  },

  get(novelId: string, key: string): Promise<ReferenceWork | null> {
    return getReference(fileService.getNovelDir(novelId), key);
  },

  create(novelId: string, key: string, data: CreateReferenceInput): Promise<ReferenceMeta> {
    return createReference(fileService.getNovelDir(novelId), key, data);
  },

  update(
    novelId: string,
    key: string,
    data: { name?: string; description?: string; enabled?: boolean },
  ): Promise<ReferenceMeta | null> {
    return updateReference(fileService.getNovelDir(novelId), key, data);
  },

  remove(novelId: string, key: string): Promise<void> {
    return deleteReference(fileService.getNovelDir(novelId), key);
  },

  /** 把参考作品的体裁卡产出 clone 为本作自定义体裁卡（materials/genre-cards/{key}.md）。 */
  async adoptGenre(novelId: string, key: string): Promise<UserMaterial> {
    const novelDir = fileService.getNovelDir(novelId);
    const work = await getReference(novelDir, key);
    if (!work) throw new Error("参考作品不存在");
    if (!work.genreCard) throw new Error("该参考作品尚未产出版裁卡，请先完成解析");
    return writeUserMaterial(novelDir, "genre-card", key, {
      name: `${work.name}-参考体裁`,
      description: `从参考作品《${work.name}》提炼的体裁打法`,
      content: work.genreCard,
      enabled: true,
    });
  },

  /** 同步解析并返回含 fingerprint 的完整作品 + 解析元信息。 */
  async parse(
    novelId: string,
    key: string,
  ): Promise<{ work: ReferenceWork; parse: ParseResult }> {
    const novelDir = fileService.getNovelDir(novelId);
    const parse = await parseReference(novelDir, key, (msg) =>
      console.log(`[reference:${key}] ${msg}`),
    );
    const work = await getReference(novelDir, key);
    if (!work) throw new Error("参考作品不存在");
    return { work, parse };
  },
};
