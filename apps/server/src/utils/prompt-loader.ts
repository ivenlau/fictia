import * as path from "path";
import * as fs from "fs/promises";

const PROMPTS_DIR = "templates/agents";

function getServerRoot(): string {
  return path.resolve(import.meta.dirname ?? process.cwd(), "../..");
}

/**
 * Load a system prompt template for an agent.
 * Looks for templates/agents/{agentName}/system.md
 */
export async function loadPromptTemplate(agentName: string): Promise<string> {
  const candidates = [
    path.join(process.cwd(), PROMPTS_DIR, agentName, "system.md"),
    path.join(getServerRoot(), PROMPTS_DIR, agentName, "system.md"),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return fs.readFile(candidate, "utf-8");
    } catch {
      // continue
    }
  }

  throw new Error(`Prompt template not found for agent: ${agentName}`);
}
