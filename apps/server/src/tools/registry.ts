/**
 * 工具注册表。
 *
 * 集中注册所有工具工厂 + 每个 agent 的工具清单，按需生成 FictiaTool[]。
 * 替代 BaseAgent.getToolTier()/getTools() 的二分硬编码：agent 显式声明所需工具名，
 * registry 过滤返回。新增能力只需注册工厂 + 配置 agent 清单，两套 agent（pipeline/chat）共用。
 */
import type { AgentType } from "@fictia/shared";
import type { FictiaTool, ToolContext, ToolFactory, ToolTier } from "./types.js";

class ToolRegistry {
  private factories: ToolFactory[] = [];
  private agentToolNames: Map<AgentType, string[]> = new Map();

  /** 注册一个工具域工厂（如 createFileTools）。 */
  registerFactory(fn: ToolFactory): void {
    this.factories.push(fn);
  }

  /** 声明某 agent 可用的工具名清单（替代 getToolTier 二分）。 */
  registerAgentTools(agentType: AgentType, toolNames: string[]): void {
    this.agentToolNames.set(agentType, toolNames);
  }

  /** 构建当前 ctx 下的全部工具，按名索引。 */
  private buildAll(ctx: ToolContext): Map<string, FictiaTool> {
    const map = new Map<string, FictiaTool>();
    for (const fn of this.factories) {
      for (const t of fn(ctx)) {
        if (map.has(t.name)) {
          console.warn(`[tool-registry] 工具名冲突: ${t.name} 已注册，后注册者覆盖`);
        }
        map.set(t.name, t);
      }
    }
    return map;
  }

  /** 按名字取工具（顺序保持 names 顺序，缺失的跳过并告警）。 */
  getTools(ctx: ToolContext, names: string[]): FictiaTool[] {
    const all = this.buildAll(ctx);
    const out: FictiaTool[] = [];
    for (const n of names) {
      const t = all.get(n);
      if (t) out.push(t);
      else console.warn(`[tool-registry] 工具 "${n}" 未注册，已跳过`);
    }
    return out;
  }

  /** 取某 agent 声明的工具名清单（不含动态注入的自定义工具）。 */
  getAgentToolNames(agentType: AgentType): string[] {
    return this.agentToolNames.get(agentType) ?? [];
  }

  /** 取某 agent 的工具集。 */
  getToolsForAgent(ctx: ToolContext, agentType: AgentType): FictiaTool[] {
    const names = this.agentToolNames.get(agentType) ?? [];
    return this.getTools(ctx, names);
  }

  /** 按 tier 过滤（chat 助手取全量 readonly 等）。 */
  getToolsByTier(ctx: ToolContext, tier: ToolTier): FictiaTool[] {
    return [...this.buildAll(ctx).values()].filter((t) => t.tier === tier);
  }

  /** 列出全部已注册工具名（诊断/日志用）。 */
  listAllNames(ctx: ToolContext): string[] {
    return [...this.buildAll(ctx).keys()];
  }
}

export const toolRegistry = new ToolRegistry();
