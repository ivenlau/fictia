import fs from "fs/promises";
import path from "path";

const DATA_ROOT = path.join(process.cwd(), "fictia-data");

export const fileService = {
  /**
   * Get data root directory
   */
  getDataRoot(): string {
    return DATA_ROOT;
  },

  /**
   * Get novel root directory
   */
  getNovelDir(novelId: string): string {
    return path.join(DATA_ROOT, "novels", novelId);
  },

  /**
   * Initialize novel directory structure (CLI-style)
   */
  async initNovelDir(novelId: string): Promise<void> {
    const base = this.getNovelDir(novelId);
    await fs.mkdir(path.join(base, "world"), { recursive: true });
    await fs.mkdir(path.join(base, "characters", "supporting"), { recursive: true });
    await fs.mkdir(path.join(base, "outline", "chapters"), { recursive: true });
    await fs.mkdir(path.join(base, "chapters", "act-1"), { recursive: true });
    await fs.mkdir(path.join(base, "chapters", "act-2"), { recursive: true });
    await fs.mkdir(path.join(base, "chapters", "act-3"), { recursive: true });
    await fs.mkdir(path.join(base, "reviews"), { recursive: true });
    await fs.mkdir(path.join(base, "agent-outputs"), { recursive: true });

    // Write .gitkeep to empty directories so they show up in file listing
    await fs.writeFile(path.join(base, "characters", "supporting", ".gitkeep"), "", "utf-8");
    await fs.writeFile(path.join(base, "outline", ".gitkeep"), "", "utf-8");
    await fs.writeFile(path.join(base, "outline", "chapters", ".gitkeep"), "", "utf-8");
    await fs.writeFile(path.join(base, "chapters", "act-1", ".gitkeep"), "", "utf-8");
    await fs.writeFile(path.join(base, "chapters", "act-2", ".gitkeep"), "", "utf-8");
    await fs.writeFile(path.join(base, "chapters", "act-3", ".gitkeep"), "", "utf-8");
    await fs.writeFile(path.join(base, "reviews", ".gitkeep"), "", "utf-8");
    await fs.writeFile(path.join(base, "agent-outputs", ".gitkeep"), "", "utf-8");
  },

  /**
   * Delete novel directory
   */
  async deleteNovelDir(novelId: string): Promise<void> {
    const dir = this.getNovelDir(novelId);
    await fs.rm(dir, { recursive: true, force: true });
  },

  // ==================== Chapter file operations ====================

  /**
   * Read chapter content
   */
  async readChapter(novelId: string, filename: string): Promise<string> {
    const filePath = path.join(this.getNovelDir(novelId), "chapters", filename);
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (err: any) {
      if (err.code === "ENOENT") return "";
      throw err;
    }
  },

  /**
   * Write chapter content
   */
  async writeChapter(novelId: string, filename: string, content: string): Promise<void> {
    const dir = path.join(this.getNovelDir(novelId), "chapters");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), content, "utf-8");
  },

  /**
   * Delete chapter file
   */
  async deleteChapter(novelId: string, filename: string): Promise<void> {
    const filePath = path.join(this.getNovelDir(novelId), "chapters", filename);
    await fs.unlink(filePath).catch(() => {});
  },

  /**
   * List chapter files
   */
  async listChapterFiles(novelId: string): Promise<string[]> {
    const dir = path.join(this.getNovelDir(novelId), "chapters");
    try {
      const files = await fs.readdir(dir, { recursive: true });
      return (files as string[]).filter((f) => f.endsWith(".md")).sort();
    } catch {
      return [];
    }
  },

  /**
   * Rename chapter file
   */
  async renameChapter(novelId: string, oldFilename: string, newFilename: string): Promise<void> {
    const dir = path.join(this.getNovelDir(novelId), "chapters");
    await fs.rename(path.join(dir, oldFilename), path.join(dir, newFilename));
  },

  // ==================== Agent output file operations ====================

  /**
   * Read agent output
   */
  async readAgentOutput(novelId: string, filename: string): Promise<string> {
    const filePath = path.join(this.getNovelDir(novelId), "agent-outputs", filename);
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (err: any) {
      if (err.code === "ENOENT") return "";
      throw err;
    }
  },

  /**
   * Write agent output
   */
  async writeAgentOutput(novelId: string, filename: string, content: string): Promise<void> {
    const dir = path.join(this.getNovelDir(novelId), "agent-outputs");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), content, "utf-8");
  },

  /**
   * List agent output files
   */
  async listAgentOutputFiles(novelId: string): Promise<string[]> {
    const dir = path.join(this.getNovelDir(novelId), "agent-outputs");
    try {
      const files = await fs.readdir(dir);
      return files.filter((f) => f.endsWith(".md")).sort().reverse();
    } catch {
      return [];
    }
  },

  // ==================== Workspace file operations ====================

  /**
   * Read workspace file
   */
  async readWorkspaceFile(novelId: string, filePath: string): Promise<string> {
    const fullPath = path.join(this.getNovelDir(novelId), filePath);
    try {
      return await fs.readFile(fullPath, "utf-8");
    } catch (err: any) {
      if (err.code === "ENOENT") return "";
      throw err;
    }
  },

  /**
   * Write workspace file
   */
  async writeWorkspaceFile(novelId: string, filePath: string, content: string): Promise<void> {
    const fullPath = path.join(this.getNovelDir(novelId), filePath);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
  },

  /**
   * Delete workspace file
   */
  async deleteWorkspaceFile(novelId: string, filePath: string): Promise<void> {
    const fullPath = path.join(this.getNovelDir(novelId), filePath);
    await fs.unlink(fullPath).catch(() => {});
  },

  /**
   * List workspace files (recursive)
   */
  async listWorkspaceFiles(novelId: string): Promise<Array<{ path: string; type: string }>> {
    const base = this.getNovelDir(novelId);
    const results: Array<{ path: string; type: string }> = [];

    async function walk(dir: string, relativePath: string) {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

          if (entry.isDirectory()) {
            await walk(fullPath, relPath);
          } else {
            const ext = path.extname(entry.name).toLowerCase();
            let type = "markdown";
            if (ext === ".json") type = "json";
            else if (ext === ".yml" || ext === ".yaml") type = "yaml";
            results.push({ path: relPath, type });
          }
        }
      } catch {
        // Directory doesn't exist
      }
    }

    await walk(base, "");
    return results;
  },

  // ==================== Metadata file ====================

  /**
   * Save novel metadata
   */
  async saveNovelMeta(novelId: string, meta: Record<string, any>): Promise<void> {
    const filePath = path.join(this.getNovelDir(novelId), "meta.json");
    await fs.writeFile(filePath, JSON.stringify(meta, null, 2), "utf-8");
  },

  /**
   * Read novel metadata
   */
  async readNovelMeta(novelId: string): Promise<Record<string, any> | null> {
    const filePath = path.join(this.getNovelDir(novelId), "meta.json");
    try {
      const content = await fs.readFile(filePath, "utf-8");
      return JSON.parse(content);
    } catch {
      return null;
    }
  },

  /**
   * Read project.yaml
   */
  async readProjectYaml(novelId: string): Promise<string> {
    return this.readWorkspaceFile(novelId, "project.yaml");
  },

  /**
   * Write project.yaml
   */
  async writeProjectYaml(novelId: string, content: string): Promise<void> {
    await this.writeWorkspaceFile(novelId, "project.yaml", content);
  },
};
