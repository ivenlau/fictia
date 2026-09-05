/**
 * prose-check 回归测试：18 条规则各至少 1 正例（触发）+ 关键反例（不误伤）。
 *
 * prose-check 是写作循环的 blocking 硬卡点，规则全是手写正则/启发式——
 * 没有回归保护时任何规则调整都是盲改。改动规则前先跑这里；
 * 新增规则时必须同步补正反用例。
 */
import { describe, it, expect } from "vitest";
import { checkProse } from "./prose-check.js";

const types = (findings: { type: string }[]) => new Set(findings.map((f) => f.type));
const has = (findings: { type: string }[], type: string) => types(findings).has(type);

/** 干净叙述文本：不应触发任何 blocking（人工核对过所有规则）。 */
const CLEAN_TEXT = [
  "陈默推门进了茶馆，挑了张靠窗的桌子坐下。跑堂的过来招呼，他要了一壶碧螺春，两个冷碟。",
  "窗外的雨下得很密，街上行人稀少，偶尔有一辆黄包车碾过水洼，溅起浑浊的水花。",
  "他把伞收好搁在脚边，目光落在对面墙上那幅褪色的年画上，看了很久。",
].join("\n");

describe("blocking 规则", () => {
  it("not-is-comparison：不是…而是 / 跨行触发", () => {
    const r = checkProse("这不是命，\n而是他选的路。");
    expect(has(r.blocking, "not-is-comparison")).toBe(true);
  });

  it("not-is-comparison 反例：是不是问句 / 引号内豁免", () => {
    const r = checkProse([
      "他愣了一下，问这是不是真的。",
      '她低声说："不是你，还能是谁。"',
    ].join("\n"));
    expect(has(r.blocking, "not-is-comparison")).toBe(false);
  });

  it("voice-contrast：声音不大…却 触发", () => {
    const r = checkProse("声音不大，却带着钉子。");
    expect(has(r.blocking, "voice-contrast")).toBe(true);
  });

  it("voice-contrast 反例：正常音量描写", () => {
    const r = checkProse("声音很大，震得桌面嗡嗡响。");
    expect(has(r.blocking, "voice-contrast")).toBe(false);
  });

  it("negation-parade：没有X，没有Y…只有Z 触发", () => {
    const r = checkProse("没有回答，没有脚步声，只有风声。");
    expect(has(r.blocking, "negation-parade")).toBe(true);
  });

  it("negation-parade 反例：单个否定", () => {
    const r = checkProse("他没有回答，径直走出了院子。");
    expect(has(r.blocking, "negation-parade")).toBe(false);
  });

  it("reverse-not-is：是A，不是B 触发", () => {
    const r = checkProse("这是刀法，不是蛮力。");
    expect(has(r.blocking, "reverse-not-is")).toBe(true);
  });

  it("reverse-not-is 反例：前字排除（还/只…）与是的确认语", () => {
    const r = checkProse([
      "他吼道：他还是不是人？",
      "是的，他不是个东西。",
    ].join("\n"));
    expect(has(r.blocking, "reverse-not-is")).toBe(false);
  });

  it("trailer-ending：文末 600 字窗口内的预告腔触发", () => {
    const r = checkProse("雨还在下。没人知道他去了哪里。");
    expect(has(r.blocking, "trailer-ending")).toBe(true);
  });

  it("trailer-ending 反例：引号内的角色台词豁免", () => {
    const r = checkProse('她笑了笑："没人知道。"',);
    expect(has(r.blocking, "trailer-ending")).toBe(false);
  });

  it("em-dash：破折号触发", () => {
    const r = checkProse("他说完——门关上了。");
    expect(has(r.blocking, "em-dash")).toBe(true);
  });

  it("em-dash 反例：无破折号", () => {
    expect(has(checkProse(CLEAN_TEXT).blocking, "em-dash")).toBe(false);
  });
});

describe("advisory 密度型规则", () => {
  it("quote-emphasis-tic：3 处 1-4 字引号强调（无说动词）触发", () => {
    const r = checkProse('所谓的"公平"，只是他定的"规矩"，江湖认的"道理"。');
    expect(has(r.advisory, "quote-emphasis-tic")).toBe(true);
  });

  it("quote-emphasis-tic 反例：引号跟说动词豁免", () => {
    const r = checkProse('他说"滚"就滚了，喊"站住"也没用。');
    expect(has(r.advisory, "quote-emphasis-tic")).toBe(false);
  });

  it("period-stutter：连续 6 个 ≤5 字短句触发", () => {
    const r = checkProse("他停了。风停了。灯灭了。门开了。人走了。夜深了。");
    expect(has(r.advisory, "period-stutter")).toBe(true);
  });

  it("period-stutter 反例：长句打断 run", () => {
    const r = checkProse("他停了。风停了。灯灭了。门外传来一阵急促的脚步声由远及近。人走了。夜深了。");
    expect(has(r.advisory, "period-stutter")).toBe(false);
  });

  it("micro-action-tic：「了下」式补语密度触发", () => {
    const text = "他顿了一下，点了下头，摆了下手指了下桌子，敲了下门，笑了一声，看了下她，转身走了。";
    const r = checkProse(text);
    expect(has(r.advisory, "micro-action-tic")).toBe(true);
  });

  it("micro-action-tic 反例：低密度不触发", () => {
    const r = checkProse("他点了下头，跟着她往里走，一路没再说话。");
    expect(has(r.advisory, "micro-action-tic")).toBe(false);
  });

  it("action-list-tic：同段连续动作动词清单触发", () => {
    const r = checkProse("他伸手，拿过杯子，转身，走到窗边，放下杯子，看向街道。");
    expect(has(r.advisory, "action-list-tic")).toBe(true);
  });

  it("action-list-tic 反例：单动作句", () => {
    const r = checkProse("他拿起杯子喝水，喝得很急。");
    expect(has(r.advisory, "action-list-tic")).toBe(false);
  });

  it("abstract-summary-tic：命运/这一刻终于明白类总结触发", () => {
    const r = checkProse("这一刻他终于明白，命运齿轮开始转动，复仇才刚刚开始，这是全新的开始。");
    expect(has(r.advisory, "abstract-summary-tic")).toBe(true);
  });

  it("abstract-summary-tic 反例：单次出现密度不足", () => {
    const r = checkProse("他知道这件事还没完。");
    expect(has(r.advisory, "abstract-summary-tic")).toBe(false);
  });

  it("cliche-density-tic：高危套词密集触发", () => {
    const r = checkProse("一丝寒意，一抹冷笑，他深吸一口气，缓缓睁眼，眼中闪过杀意，心中涌起一股怒火，仿佛深渊，犹如冰窟，难以言说。");
    expect(has(r.advisory, "cliche-density-tic")).toBe(true);
  });

  it("cliche-density-tic 反例：偶发套词", () => {
    const r = checkProse("他深吸一口气，推门进去。屋里很暗，只有一盏油灯亮着。");
    expect(has(r.advisory, "cliche-density-tic")).toBe(false);
  });

  it("metaphor-density-tic：比喻标记密集触发", () => {
    const r = checkProse("心像被攥住，疼得像裂开，声音像刀，风像潮水，屋像坟，夜像海，人像机器，冷得像冰一样。");
    expect(has(r.advisory, "metaphor-density-tic")).toBe(true);
  });

  it("metaphor-density-tic 反例：单个比喻", () => {
    const r = checkProse("他的心像被一只手攥住了，半天没缓过来。");
    expect(has(r.advisory, "metaphor-density-tic")).toBe(false);
  });

  it("reasoning-chain-tic：判断链密度触发", () => {
    const r = checkProse([
      "他知道这意味着危险。她明白问题在于人心。",
      "他确认必须核对名单。她清楚需要控制局面。",
      "任务有风险。逻辑很简单。他知道结果。她意识到局面失控。",
    ].join("\n"));
    expect(has(r.advisory, "reasoning-chain-tic")).toBe(true);
  });

  it("reasoning-chain-tic 反例：单次「知道」", () => {
    const r = checkProse("他知道这件事。");
    expect(has(r.advisory, "reasoning-chain-tic")).toBe(false);
  });

  it("system-notice-formality-tic：【】公告行（整行括号内）公文腔触发", () => {
    const r = checkProse([
      "【规则公告：访客不得进入三楼，严禁喧哗】",
      "【提示：当前权限不足，必须登记】",
      "【公告：禁止携带凶器入内】",
      "【规则：违规者将被处罚，且必须承担相应责任】",
    ].join("\n"));
    expect(has(r.advisory, "system-notice-formality-tic")).toBe(true);
  });
});

describe("结构类规则", () => {
  it("long-paragraph：>200 字单行触发", () => {
    const longLine = "他沿着河岸走。".repeat(35); // 245 字
    const r = checkProse(longLine);
    expect(has(r.advisory, "long-paragraph")).toBe(true);
  });

  it("long-paragraph 反例：正常分段", () => {
    expect(has(checkProse(CLEAN_TEXT).advisory, "long-paragraph")).toBe(false);
  });

  it("overcompressed-prose-tic：大量 ≤15 字无虚词短段触发", () => {
    const paras: string[] = [];
    for (let i = 1; i <= 180; i++) paras.push(`此${i}人立于门前。`); // ~8 字/段，无虚词，总字数 ≥1200
    const r = checkProse(paras.join("\n"));
    expect(has(r.advisory, "overcompressed-prose-tic")).toBe(true);
  });

  it("low-connective-density-tic：无连接词电报体触发", () => {
    const paras: string[] = [];
    for (let i = 1; i <= 150; i++) paras.push(`此人持刀前行。${i}步外有敌。`); // 无「的了就也还」等
    const r = checkProse(paras.join("\n"));
    expect(has(r.advisory, "low-connective-density-tic")).toBe(true);
  });
});

describe("整体行为", () => {
  it("干净文本：0 blocking", () => {
    const r = checkProse(CLEAN_TEXT);
    expect(r.blocking).toHaveLength(0);
  });

  it("空文本：无 findings", () => {
    expect(checkProse("").blocking).toHaveLength(0);
    expect(checkProse("").advisory).toHaveLength(0);
  });

  it("YAML front matter / markdown 结构行 / 代码块跳过", () => {
    const text = [
      "---",
      "name: test",
      "---",
      "",
      "# 第一章 突围",
      "",
      "```",
      "这不是命，而是选择。",
      "```",
      "",
      "陈默推门进了茶馆，挑了张靠窗的桌子坐下，要了一壶碧螺春，两个冷碟，慢慢喝着。",
    ].join("\n");
    const r = checkProse(text);
    // 代码块内的 not-is 被围栏跳过；structural 行不参与检测
    expect(has(r.blocking, "not-is-comparison")).toBe(false);
  });
});
