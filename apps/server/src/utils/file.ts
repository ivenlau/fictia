import * as fs from "fs/promises";
import * as path from "path";

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function readFile(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf-8");
}

export async function readFileSafe(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

export async function writeFile(filePath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content, "utf-8");
}

export async function ensureDir(dirPath: string): Promise<void> {
  await fs.mkdir(dirPath, { recursive: true });
}

export async function listFiles(
  dirPath: string,
  options?: { recursive?: boolean; extensions?: string[] }
): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory() && options?.recursive) {
        const subFiles = await listFiles(fullPath, options);
        results.push(...subFiles);
      } else if (entry.isFile()) {
        if (!options?.extensions || options.extensions.some(ext => entry.name.endsWith(ext))) {
          results.push(fullPath);
        }
      }
    }
  } catch {
    // directory doesn't exist
  }
  return results;
}

export function relativePath(from: string, to: string): string {
  return path.relative(from, to).replace(/\\/g, "/");
}

export function joinPath(...segments: string[]): string {
  return path.join(...segments);
}

export function basename(filePath: string, ext?: string): string {
  return path.basename(filePath, ext);
}

export function dirname(filePath: string): string {
  return path.dirname(filePath);
}
