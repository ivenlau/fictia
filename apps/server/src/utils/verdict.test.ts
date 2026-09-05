/**
 * verdict 解析回归测试。
 *
 * 覆盖历史 bug 场景（verdict.ts 注释所列）+ editor / design-reviewer 两种报告格式
 * + judgeVerdict 三级判定阈值。改动解析逻辑前先跑这里。
 */
import { describe, it, expect } from "vitest";
import { parseReviewVerdict, judgeVerdict, DEFAULT_REVIEW_POLICY } from "./verdict.js";

/** editor 报告骨架：综合评分 + 严重/一般问题表。 */
function editorReport(grade: string, severeRows: string[], normalRows: string[]): string {
  const row = (i: number) => `| ${i} | 第3章 | 逻辑 | 问题描述 | 修改建议 |`;
  return [
    "## 审核报告",
    "",
    `**综合评分**：${grade}`,
    "",
    "### 严重问题",
    "| 序号 | 位置 | 问题类型 | 问题描述 | 修改建议 |",
    "|------|------|---------|---------|---------|",
    ...severeRows.map((_, i) => row(i + 1)),
    severeRows.length === 0 ? "无" : "",
    "",
    "### 一般问题",
    "| 序号 | 位置 | 问题类型 | 问题描述 | 修改建议 |",
    "|------|------|---------|---------|---------|",
    ...normalRows.map((_, i) => row(i + 1)),
    normalRows.length === 0 ? "无" : "",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n") + "\n";
}

describe("parseReviewVerdict", () => {
  it("editor 格式（**综合评分**：A）解析评分与问题数", () => {
    const v = parseReviewVerdict(editorReport("A", ["x"], ["y", "z"]));
    expect(v.grade).toBe("A");
    expect(v.severe).toBe(1);
    expect(v.normal).toBe(2);
    expect(v.passed).toBe(false); // severe 1 不通过
  });

  it("design-reviewer 格式（## 综合评分：A，无 **）——历史 bug：无 ** 格式漏解析", () => {
    const report = ["## 综合评分：A", "", "### 严重问题", "无", "", "### 一般问题", "无"].join("\n");
    const v = parseReviewVerdict(report);
    expect(v.grade).toBe("A");
    expect(v.severe).toBe(0);
    expect(v.passed).toBe(true);
  });

  it("design-reviewer 格式（## 综合评分 标题 + 新行 **A**，无冒号）——历史 bug：冒号同行假设", () => {
    const report = ["## 综合评分", "", "**A**", "", "### 严重问题", "无", "", "### 一般问题", "无"].join("\n");
    const v = parseReviewVerdict(report);
    expect(v.grade).toBe("A");
    expect(v.passed).toBe(true);
  });

  it("section 跨边界：严重问题计数不越界到其他表", () => {
    // 细节问题表在一般问题之后，行数不应混入
    const report = [
      "**综合评分**：B",
      "",
      "### 严重问题",
      "| 序号 | 位置 | 问题类型 | 问题描述 | 修改建议 |",
      "|------|------|---------|---------|---------|",
      "| 1 | ch1 | a | a | a |",
      "",
      "### 一般问题",
      "| 序号 | 位置 | 问题类型 | 问题描述 | 修改建议 |",
      "|------|------|---------|---------|---------|",
      "| 1 | ch1 | b | b | b |",
      "",
      "### 细节问题",
      "| 序号 | 位置 | 问题类型 | 问题描述 | 修改建议 |",
      "|------|------|---------|---------|---------|",
      "| 1 | ch1 | c | c | c |",
      "| 2 | ch2 | c | c | c |",
      "| 3 | ch3 | c | c | c |",
    ].join("\n");
    const v = parseReviewVerdict(report);
    expect(v.severe).toBe(1);
    expect(v.normal).toBe(1); // 细节问题 3 行不计入
  });

  it("修复日志混入：报告尾部修复记录中的表格不计数", () => {
    const report = [
      "**综合评分**：A",
      "",
      "### 严重问题",
      "无",
      "",
      "### 一般问题",
      "无",
      "",
      "## 修复日志",
      "",
      "### 严重问题",
      "| 序号 | 位置 | 问题类型 | 问题描述 | 修改建议 |",
      "|------|------|---------|---------|---------|",
      "| 1 | ch2 | 已修复项 | 旧问题 | 已改 |",
    ].join("\n");
    const v = parseReviewVerdict(report);
    // 修复日志里的「### 严重问题」独立 section；正文 section 是「无」→ 0。
    // 注意：日志 section 的表格会被计入其所在 section——因此日志区使用不同标题
    // 或「已修复」表述；此处锁定当前行为：正文 section 计 0。
    expect(v.severe).toBe(0);
    expect(v.normal).toBe(0);
    expect(v.passed).toBe(true);
  });

  it("「无」占位识别：section 体内只有占位文字时计数 0", () => {
    for (const marker of ["无", "（无）", "暂无", "无重大问题", "-"]) {
      const report = [
        `**综合评分**：A`,
        "",
        "### 严重问题",
        marker,
        "",
        "### 一般问题",
        marker,
      ].join("\n");
      const v = parseReviewVerdict(report);
      expect(v.severe).toBe(0);
      expect(v.normal).toBe(0);
    }
  });

  it("评分细项表不误抓：正文只有「评分细项」列头时 grade 为 null（正则过松历史 bug）", () => {
    const report = [
      "## 审核结果",
      "",
      "| 维度 | 综合评分 |",
      "|------|---------|",
      "| 文笔 | B |",
      "",
      "### 严重问题",
      "无",
      "",
      "### 一般问题",
      "无",
    ].join("\n");
    const v = parseReviewVerdict(report);
    // 「综合评分」出现在表头单元格（无冒号、非标题行），不应被抓为评级
    expect(v.grade).toBeNull();
    expect(v.passed).toBe(false);
  });

  it("A + 0 severe = passed；A + severe ≥1 不通过（normal 不阻塞）", () => {
    const pass = parseReviewVerdict(editorReport("A", [], []));
    expect(pass.passed).toBe(true);

    const normalOnly = parseReviewVerdict(editorReport("A", [], ["a", "b"]));
    expect(normalOnly.grade).toBe("A");
    expect(normalOnly.severe).toBe(0);
    expect(normalOnly.passed).toBe(true); // 一般问题不阻塞
  });
});

describe("judgeVerdict 三级判定", () => {
  const v = (grade: "A" | "B" | "C" | "D" | null, severe: number, normal = 0) => ({
    grade,
    severe,
    normal,
    passed: grade === "A" && severe === 0,
  });

  it("A + 无严重 → pass", () => {
    expect(judgeVerdict(v("A", 0)).level).toBe("pass");
  });

  it("B / C → warn（警告通过）", () => {
    expect(judgeVerdict(v("B", 0)).level).toBe("warn");
    expect(judgeVerdict(v("C", 1)).level).toBe("warn");
  });

  it("A + 少量 severe → warn", () => {
    expect(judgeVerdict(v("A", 2)).level).toBe("warn");
  });

  it("D → fail", () => {
    expect(judgeVerdict(v("D", 0)).level).toBe("fail");
  });

  it("severe 达到硬失败上限 → fail（即使 grade A）", () => {
    expect(judgeVerdict(v("A", DEFAULT_REVIEW_POLICY.severeHardFail)).level).toBe("fail");
  });

  it("grade 缺失（报告格式异常）→ fail", () => {
    expect(judgeVerdict(v(null, 0)).level).toBe("fail");
  });

  it("自定义策略生效：passGrade=A 时 B 判 warn，severeHardFail=1 时 A+severe1 判 fail", () => {
    const strict = { passGrade: "A" as const, severeHardFail: 1 };
    expect(judgeVerdict(v("B", 0), strict).level).toBe("warn");
    expect(judgeVerdict(v("A", 1), strict).level).toBe("fail");
  });
});
