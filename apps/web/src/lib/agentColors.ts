import type { AgentType } from "@fictia/shared";

/** Agent 图标底色：统一用主题 accent；状态色（success/error…）另控边框与文案。 */
export interface AgentColor {
  text: string;
  bg: string;
}

export const AGENT_ICON_COLOR: AgentColor = {
  text: "text-accent",
  bg: "bg-accent-bg",
};

export function agentColor(_agentType?: string | AgentType): AgentColor {
  return AGENT_ICON_COLOR;
}
