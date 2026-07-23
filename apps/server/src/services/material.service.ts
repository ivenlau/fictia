import { fileService } from "./file.service.js";
import {
  listGenreCards,
  listCraftDocs,
  listAgentNames,
  buildInjectionPreview,
  type CatalogEntry,
  type InjectionPreview,
} from "../utils/material-catalog.js";
import {
  listUserMaterials,
  getUserMaterial,
  writeUserMaterial,
  deleteUserMaterial,
  readPreferences,
  writePreferences,
  type UserMaterial,
  type UserMaterialType,
  type UserMaterialInput,
  type Preferences,
} from "../utils/user-materials.js";

/**
 * 素材库服务（块 1：只读目录 + 注入预览）。
 *
 * 块 2 起会扩展用户素材 CRUD（materials 表 + novel 目录下 materials/ 文件）。
 * 体裁卡选择写 meta.json.genreCard（base-agent 读取处），不入 DB——
 * 见 novelService.update 与 BaseAgent.readNovelGenre。
 */

export type CatalogType = "genre-card" | "craft";

export const materialService = {
  /** 内置目录：体裁卡（8 张）或写作技法（20 篇）。 */
  async getCatalog(type: CatalogType): Promise<CatalogEntry[]> {
    return type === "craft" ? listCraftDocs() : listGenreCards();
  },

  /** agent 清单（注入预览选择器用）。 */
  listAgentNames(): Promise<string[]> {
    return listAgentNames();
  },

  /** 注入预览：某 agent 在某 novel 下，素材如何拼进 system prompt。 */
  async getInjectionPreview(novelId: string, agent: string): Promise<InjectionPreview> {
    return buildInjectionPreview(fileService.getNovelDir(novelId), agent);
  },

  // ==================== 用户素材 CRUD（块 2） ====================

  listUserMaterials(novelId: string, type: UserMaterialType): Promise<UserMaterial[]> {
    return listUserMaterials(fileService.getNovelDir(novelId), type);
  },

  getUserMaterial(novelId: string, type: UserMaterialType, key: string): Promise<UserMaterial | null> {
    return getUserMaterial(fileService.getNovelDir(novelId), type, key);
  },

  upsertUserMaterial(
    novelId: string,
    type: UserMaterialType,
    key: string,
    data: UserMaterialInput,
  ): Promise<UserMaterial> {
    return writeUserMaterial(fileService.getNovelDir(novelId), type, key, data);
  },

  async deleteUserMaterial(novelId: string, type: UserMaterialType, key: string): Promise<void> {
    await deleteUserMaterial(fileService.getNovelDir(novelId), type, key);
  },

  /** 克隆内置体裁卡为本项目自定义卡（同 key 覆盖内置；可编辑）。仅 genre-card。 */
  async cloneBuiltin(novelId: string, type: UserMaterialType, key: string): Promise<UserMaterial> {
    const catalog = type === "craft" ? await listCraftDocs() : await listGenreCards();
    const entry = catalog.find((e) => e.key === key);
    if (!entry) throw new Error(`内置 ${type} 不存在: ${key}`);
    return writeUserMaterial(fileService.getNovelDir(novelId), type, key, {
      name: entry.name,
      description: entry.description,
      content: entry.content,
      enabled: true,
    });
  },

  // ==================== C1 创作偏好 ====================

  getPreferences(novelId: string): Promise<Preferences | null> {
    return readPreferences(fileService.getNovelDir(novelId));
  },

  setPreferences(novelId: string, enabled: boolean, content: string): Promise<Preferences> {
    return writePreferences(fileService.getNovelDir(novelId), enabled, content);
  },
};
