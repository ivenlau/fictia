import { useSettingsStore } from "@/stores/settingsStore";

const inputCls =
  "w-full rounded-md border border-subtle bg-surface-card px-3 py-2 font-body text-sm text-fg-primary placeholder:text-fg-muted focus:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent/20";

/**
 * 流程控制：轮次上限、审核-修复轮数、审核通过策略。
 * 对应服务端 agentMaxTurns / reviewFixRounds / reviewPolicy。
 */
export function PipelineSection() {
  const agentMaxTurns = useSettingsStore((s) => s.agentMaxTurns);
  const setAgentMaxTurns = useSettingsStore((s) => s.setAgentMaxTurns);
  const reviewFixRounds = useSettingsStore((s) => s.reviewFixRounds);
  const setReviewFixRounds = useSettingsStore((s) => s.setReviewFixRounds);
  const reviewPolicy = useSettingsStore((s) => s.reviewPolicy);
  const setReviewPolicy = useSettingsStore((s) => s.setReviewPolicy);

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-1 font-heading text-base font-semibold text-fg-primary">流程控制</h3>
        <p className="font-body text-sm text-fg-secondary">
          agent 轮次与审核卡点的宽松程度：产物已产出时，审核未满分只警告不阻塞，可人工继续处理
        </p>
      </div>

      {/* 轮次控制 */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="mb-1.5 font-body text-sm font-medium text-fg-primary">单次会话轮数上限</p>
          <input
            type="number"
            min={0}
            max={200}
            value={agentMaxTurns}
            onChange={(e) => setAgentMaxTurns(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            className={inputCls}
          />
          <p className="mt-1 font-caption text-xs text-fg-muted">
            agent 单次运行的工具调用轮数，跑满会被切断（产物已落盘则降级为警告）。0 = 不限制。
          </p>
        </div>
        <div>
          <p className="mb-1.5 font-body text-sm font-medium text-fg-primary">审核-修复轮数</p>
          <input
            type="number"
            min={1}
            max={6}
            value={reviewFixRounds}
            onChange={(e) =>
              setReviewFixRounds(Math.min(6, Math.max(1, Math.floor(Number(e.target.value) || 3))))
            }
            className={inputCls}
          />
          <p className="mt-1 font-caption text-xs text-fg-muted">
            写作/设计审核未过时自动修复重审的最大轮数（1-6）。跑满后按下方策略判定。
          </p>
        </div>
      </div>

      {/* 审核通过策略 */}
      <div className="rounded-lg border border-subtle bg-surface-muted/30 p-4 space-y-4">
        <p className="font-body text-sm font-medium text-fg-primary">审核通过策略</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="mb-1.5 font-caption text-xs text-fg-secondary">警告通过所需最低评级</p>
            <select
              value={reviewPolicy.passGrade}
              onChange={(e) =>
                setReviewPolicy({
                  ...reviewPolicy,
                  passGrade: e.target.value as "A" | "B" | "C",
                })
              }
              className={inputCls}
            >
              <option value="B">B（推荐）</option>
              <option value="C">C（更宽松）</option>
              <option value="A">A（仅满分可过）</option>
            </select>
          </div>
          <div>
            <p className="mb-1.5 font-caption text-xs text-fg-secondary">严重问题硬失败上限</p>
            <input
              type="number"
              min={1}
              max={20}
              value={reviewPolicy.severeHardFail}
              onChange={(e) =>
                setReviewPolicy({
                  ...reviewPolicy,
                  severeHardFail: Math.max(1, Math.floor(Number(e.target.value) || 3)),
                })
              }
              className={inputCls}
            />
          </div>
        </div>
        <ul className="font-caption text-xs text-fg-muted space-y-1 list-disc list-inside">
          <li>评分 A 且无严重问题：完全通过，自动继续。</li>
          <li>评分达到上述最低评级：警告通过——流程继续，警告交给你人工复核（可在编辑器修改后重跑审核）。</li>
          <li>评分 D 或严重问题达到上限：硬失败，流程中止；若产物文件已在，可在流程面板点「按产物继续」放行。</li>
          <li>自动驾驶下连续 3 章仅警告通过会自动暂停，提醒抽查质量。</li>
        </ul>
      </div>
    </div>
  );
}
