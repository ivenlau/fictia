/**
 * Todo 工具（任务规划，L2）。
 *
 * 让写章 agent 动笔前主动规划任务、逐步推进、一时刻一个 in_progress。
 * 替代"被动接收塞满的 user message"，把上下文从"推"转"拉"——agent 按自己规划的
 * 步骤，按需调用 get_craft_doc / semantic_search / get_summary_chain 等工具拉取。
 *
 * 状态存工厂闭包（单次 agent 会话内有效），每次调用经 details.snapshot 上报，
 * 由 agent-runner 提取写入 trace.todoSnapshot，下发调试视图展示规划进度。
 *
 * 参考 pi coding-agent/examples/extensions/todo.ts，移植到 FictiaTool 工厂模式：
 * pi 版依赖 ExtensionAPI/TUI/session（coding-agent 层），fictia 用更底层的
 * pi-agent-core runAgentLoop + ToolRegistry，故用闭包持有状态、details 上报快照。
 */
import { Type, StringEnum } from "@earendil-works/pi-ai";
import type { TodoItem, TodoStatus, TodoSnapshot } from "@fictia/shared";
import type { FictiaTool, ToolContext } from "./types.js";

export function createTodoTools(_ctx: ToolContext): FictiaTool[] {
  // 闭包状态：单次 agent 会话内有效（每次 runAgentSession 新建一组工具实例）。
  let todos: TodoItem[] = [];
  let nextId = 1;

  const snapshot = (): TodoSnapshot => ({
    items: todos.map((t) => ({ ...t })),
    completed: todos.filter((t) => t.status === "done").length,
    total: todos.length,
  });

  const render = (): string => {
    if (todos.length === 0) return "（尚未规划任务。用 action=add 拆解本章写作步骤。）";
    const lines = todos.map((t) => {
      const mark = t.status === "done" ? "[x]" : t.status === "in_progress" ? "[>]" : "[ ]";
      return `${mark} #${t.id} ${t.text}`;
    });
    const done = todos.filter((t) => t.status === "done").length;
    return `任务清单（${done}/${todos.length}）：\n${lines.join("\n")}`;
  };

  return [
    {
      name: "todo",
      label: "任务清单",
      tier: "readonly",
      tags: ["planning"],
      description:
        "规划并跟踪当前写作任务。动笔前先用 action=add 拆解为可执行步骤（建议：读章节大纲/目标字数 → 查本章伏笔指令与前文摘要 get_summary_chain → 按需加载 craft 技法 get_craft_doc → 必要时 semantic_search 召回相关设定 → 写作 → validate_style/scan_consistency 核验 → write_file 写入），逐步 update 推进。一时刻只允许一个 status=in_progress；置新 in_progress 会自动把旧的归 pending。写完本章前所有项应置 done。",
      parameters: Type.Object({
        action: StringEnum(["add", "update", "list"] as const),
        items: Type.Optional(
          Type.Array(
            Type.Object({
              id: Type.Optional(Type.Number({ description: "update 时指定目标任务 id；add 时忽略" })),
              text: Type.String({ description: "任务描述（add 必填；update 可选覆盖）" }),
              status: Type.Optional(
                StringEnum(["pending", "in_progress", "done"] as const),
              ),
            }),
          ),
        ),
      }),
      async execute(_toolCallId, params) {
        const action = params.action as "add" | "update" | "list";

        if (action === "add") {
          const incoming = (params.items ?? []) as Array<{
            text?: string;
            status?: TodoStatus;
          }>;
          const valid = incoming.filter((it) => it.text && it.text.trim());
          if (valid.length === 0) {
            return {
              content: [{ type: "text", text: "错误：add 需传入 items，每项含 text。" }],
              details: { snapshot: snapshot() },
            };
          }
          let hasInProgress = todos.some((t) => t.status === "in_progress");
          for (const it of valid) {
            let status: TodoStatus = it.status ?? "pending";
            // 维持单 in_progress：若已有进行中，新增项不直接占 in_progress
            if (status === "in_progress" && hasInProgress) status = "pending";
            if (status === "in_progress") hasInProgress = true;
            todos.push({ id: nextId++, text: it.text!.trim(), status });
          }
          return { content: [{ type: "text", text: render() }], details: { snapshot: snapshot() } };
        }

        if (action === "update") {
          const incoming = (params.items ?? []) as Array<{
            id?: number;
            text?: string;
            status?: TodoStatus;
          }>;
          for (const it of incoming) {
            if (it.id === undefined) continue;
            const target = todos.find((t) => t.id === it.id);
            if (!target) continue;
            if (it.text) target.text = it.text.trim();
            if (it.status) {
              // 置新 in_progress 前，把其他进行中的归 pending（单进行中约束）
              if (it.status === "in_progress") {
                for (const t of todos) {
                  if (t.status === "in_progress") t.status = "pending";
                }
              }
              target.status = it.status;
            }
          }
          return { content: [{ type: "text", text: render() }], details: { snapshot: snapshot() } };
        }

        // list
        return { content: [{ type: "text", text: render() }], details: { snapshot: snapshot() } };
      },
    },
  ];
}
