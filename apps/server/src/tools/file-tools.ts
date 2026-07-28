/**
 * 文件操作工具（合并自 BaseAgent 的 *_project_file 与 chat 的 *_file）。
 *
 * 统一参数：path / content / old_text+new_text（snake_case，与既有 base 工具一致）。
 * 路径穿越防护：所有路径 resolve 后必须落在 novelDir 内，禁止访问项目目录外。
 * 同一套工具同时服务 pipeline agents（持有 novelDir）与 chat 助手（经 ToolContext.novelDir）。
 */
import { Type } from "@earendil-works/pi-ai";
import * as path from "path";
import * as fs from "fs/promises";
import { readFileSafe, listFiles, relativePath } from "../utils/file.js";
import type { FictiaTool, ToolContext } from "./types.js";

/** 解析相对路径并校验未越出 novelDir（防穿越）。越界抛错。 */
function safeResolve(novelDir: string, relPath: string): string {
  const full = path.resolve(novelDir, relPath);
  const rel = path.relative(novelDir, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`路径越界（禁止访问项目目录外）: ${relPath}`);
  }
  return full;
}

export function createFileTools(ctx: ToolContext): FictiaTool[] {
  return [
    {
      name: "read_file",
      label: "读取文件",
      tier: "readonly",
      description:
        "读取当前小说项目中的文件内容。可读取任意工作区文件（设定/角色/大纲/章节等）。路径相对项目根目录。**若不确定文件名或路径，先用 list_files 列出目录确认，不要凭猜测调用（猜错会报「文件不存在」）**。查角色优先用 get_character（按角色名查，免文件名）；查 craft 技法用 get_craft_doc。",
      parameters: Type.Object({
        path: Type.String({ description: "相对项目根目录的文件路径，如 'world/setting.md', 'characters/苏蔓_主角.md', 'meta.json'" }),
      }),
      async execute(_toolCallId, { path: relPath }) {
        const full = safeResolve(ctx.novelDir, relPath as string);
        const content = await readFileSafe(full);
        if (content === null) throw new Error(`文件 "${relPath}" 不存在`);
        return {
          content: [{ type: "text", text: content || "(文件为空)" }],
          details: { path: relPath },
        };
      },
    },
    {
      name: "write_file",
      label: "写入文件",
      tier: "write",
      description:
        "将内容写入项目文件。文件不存在则自动创建（含父目录）。路径相对项目根目录。大幅重写或新建文件用此工具。",
      parameters: Type.Object({
        path: Type.String({ description: "相对项目根目录的文件路径，如 'design/genre-analysis.md', 'world/setting.md'" }),
        content: Type.String({ description: "要写入的文件内容（Markdown 格式）" }),
      }),
      async execute(_toolCallId, { path: relPath, content }) {
        const full = safeResolve(ctx.novelDir, relPath as string);
        await fs.mkdir(path.dirname(full), { recursive: true });
        await fs.writeFile(full, content as string, "utf-8");
        return {
          content: [{ type: "text", text: `已写入文件 "${relPath}" (${(content as string).length} 字符)` }],
          details: { path: relPath, bytes: (content as string).length },
        };
      },
    },
    {
      name: "edit_file",
      label: "编辑文件",
      tier: "write",
      description:
        "对项目文件做局部精确替换。适用于少量修改、调整措辞、补充段落。大幅重写请用 write_file。old_text 必须与文件内容完全匹配（含换行缩进）。",
      parameters: Type.Object({
        path: Type.String({ description: "相对项目根目录的文件路径" }),
        old_text: Type.String({ description: "要替换的原文（必须与文件中的内容完全匹配，包括换行和缩进）" }),
        new_text: Type.String({ description: "替换后的内容" }),
        replace_all: Type.Optional(Type.Boolean({ description: "是否替换所有匹配项（默认 false，仅替换第一处）", default: false })),
      }),
      async execute(_toolCallId, { path: relPath, old_text, new_text, replace_all }) {
        const full = safeResolve(ctx.novelDir, relPath as string);
        const content = await readFileSafe(full);
        if (content === null) {
          throw new Error(`文件 "${relPath}" 不存在，无法编辑。请先使用 write_file 创建文件。`);
        }
        if (!content.includes(old_text as string)) {
          throw new Error(`在 "${relPath}" 中未找到匹配的文本。请先使用 read_file 读取文件内容，确认要替换的文本后再编辑。`);
        }
        const count = content.split(old_text as string).length - 1;
        let warning = "";
        if (!replace_all && count > 1) {
          warning = `警告：找到 ${count} 处匹配，仅替换第一处。如需全替换请设 replace_all=true。 `;
        }
        const newContent = replace_all
          ? content.split(old_text as string).join(new_text as string)
          : content.replace(old_text as string, new_text as string);
        await fs.writeFile(full, newContent, "utf-8");
        return {
          content: [{ type: "text", text: `${warning}已编辑 "${relPath}" (${replace_all ? count : 1} 处替换)` }],
          details: { path: relPath, replacements: replace_all ? count : 1 },
        };
      },
    },
    {
      name: "list_files",
      label: "列出文件",
      tier: "readonly",
      description: "列出项目中的文件。可选按目录和扩展名过滤。返回相对项目根目录的路径列表。",
      parameters: Type.Object({
        directory: Type.Optional(Type.String({ description: "要列出的子目录，如 'characters', 'chapters'。不填则列出全部。" })),
        extension: Type.Optional(Type.String({ description: "文件扩展名过滤，如 '.md', '.yaml'" })),
        recursive: Type.Optional(Type.Boolean({ description: "是否递归列出子目录。默认 true。" })),
      }),
      async execute(_toolCallId, { directory, extension, recursive }) {
        const targetDir = directory ? safeResolve(ctx.novelDir, directory as string) : ctx.novelDir;
        const rec = recursive !== false;
        const extensions = extension ? [extension as string] : undefined;
        const files = await listFiles(targetDir, { recursive: rec, extensions });
        const rel = files.map((f) => relativePath(ctx.novelDir, f));
        const text = rel.length > 0 ? rel.join("\n") : "没有找到匹配的文件";
        return { content: [{ type: "text", text }], details: { count: rel.length } };
      },
    },
  ];
}
