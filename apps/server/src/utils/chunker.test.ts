import { describe, it, expect } from "vitest";
import { chunkText, type Chunk } from "./chunker.js";

/** 每块 text 必须等于原文对应切片。 */
function expectSliceInvariant(text: string, chunks: Chunk[]) {
  for (const c of chunks) {
    expect(c.text).toBe(text.slice(c.charStart, c.charEnd));
  }
}

/** 区间必须连续覆盖 [0, len)：首块起于 0、末块止于 len、相邻无空洞。 */
function expectCovers(text: string, chunks: Chunk[]) {
  if (chunks.length === 0) return;
  expect(chunks[0].charStart).toBe(0);
  expect(chunks[chunks.length - 1].charEnd).toBe(text.length);
  for (let i = 1; i < chunks.length; i++) {
    expect(chunks[i].charStart).toBeLessThanOrEqual(chunks[i - 1].charEnd);
  }
}

describe("chunkText", () => {
  it("空串/纯空白返回空数组", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\t  ")).toEqual([]);
  });

  it("短文本（≤ maxChars）返回单块且 offset 正确", () => {
    const text = "这是一段短文本。";
    const chunks = chunkText(text, { maxChars: 600, overlap: 60 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ index: 0, charStart: 0, charEnd: text.length });
    expect(chunks[0].text).toBe(text);
  });

  it("每块都不超过 maxChars（除句子边界回退的容差）", () => {
    const text = "a".repeat(2000);
    const chunks = chunkText(text, { maxChars: 600, overlap: 60 });
    for (const c of chunks) {
      expect(c.charEnd - c.charStart).toBeLessThanOrEqual(600);
    }
    expectSliceInvariant(text, chunks);
    expectCovers(text, chunks);
  });

  it("无边界时硬切，区间连续覆盖", () => {
    const text = "x".repeat(1500);
    const chunks = chunkText(text, { maxChars: 600, overlap: 60 });
    expect(chunks.length).toBeGreaterThanOrEqual(3);
    expectSliceInvariant(text, chunks);
    expectCovers(text, chunks);
  });

  it("段落空行处优先切分", () => {
    const paraA = "甲".repeat(400) + "。";
    const paraB = "乙".repeat(400) + "。";
    const text = paraA + "\n\n" + paraB;
    const chunks = chunkText(text, { maxChars: 500, overlap: 40 });
    // 应在空行处切断，左块含到空行的部分
    const cut = chunks.find((c) => c.charEnd <= paraA.length + 2);
    expect(cut).toBeTruthy();
    expectSliceInvariant(text, chunks);
    expectCovers(text, chunks);
  });

  it("句末符（。！？!?.）处对齐切分", () => {
    const sentences = "第一句。第二句。第三句。第四句。第五句。".repeat(20);
    const chunks = chunkText(sentences, { maxChars: 300, overlap: 30 });
    // 每块的结尾应落在句末符（除了可能的最后一块尾）
    for (const c of chunks.slice(0, -1)) {
      expect(/[。！？!?.]/.test(c.text[c.text.length - 1] ?? "")).toBe(true);
    }
    expectSliceInvariant(sentences, chunks);
    expectCovers(sentences, chunks);
  });

  it("早边界 + 长无界文本不退化成碎块", () => {
    const text = "句子。" + "a".repeat(1500);
    const chunks = chunkText(text, { maxChars: 600, overlap: 60 });
    // 若退化会切出 ~1500 块；正常应远小于 20
    expect(chunks.length).toBeLessThan(20);
    expectSliceInvariant(text, chunks);
    expectCovers(text, chunks);
  });

  it("overlap=0 不死循环且区间覆盖", () => {
    const text = "a".repeat(1500) + "\n".repeat(50);
    const chunks = chunkText(text, { maxChars: 600, overlap: 0 });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.length).toBeLessThan(20);
    expectSliceInvariant(text, chunks);
    expectCovers(text, chunks);
  });

  it("overlap 超过 maxChars/2 时被钳制（不破坏覆盖）", () => {
    const text = "字".repeat(2000);
    const chunks = chunkText(text, { maxChars: 600, overlap: 9999 });
    expectSliceInvariant(text, chunks);
    expectCovers(text, chunks);
    // 钳制后块大小仍受控
    for (const c of chunks) {
      expect(c.charEnd - c.charStart).toBeLessThanOrEqual(600);
    }
  });

  it("真实多段中文文本：块数 > 1 且索引连续", () => {
    const text = [
      "# 第一章",
      "他推开门，风雪扑面而来。屋里很暖。",
      "“你来了。”她说。",
      "",
      "他没说话，只是看着她。窗外的雪越下越大。",
      "",
      "第二章的内容从这里开始。故事还在继续。",
    ].join("\n");
    const chunks = chunkText(text, { maxChars: 60, overlap: 6 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((c) => c.index)).toEqual(
      chunks.map((_, i) => i),
    );
    expectSliceInvariant(text, chunks);
    expectCovers(text, chunks);
  });
});
