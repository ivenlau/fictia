/**
 * Count Chinese characters and words in text.
 * Chinese: each character counts as 1 word
 * English: each space-separated word counts as 1 word
 */
export function countWords(text: string): number {
  // Remove markdown syntax
  const cleaned = text
    .replace(/```[\s\S]*?```/g, "")  // code blocks
    .replace(/`[^`]*`/g, "")          // inline code
    .replace(/!\[.*?\]\(.*?\)/g, "")  // images
    .replace(/\[.*?\]\(.*?\)/g, "")   // links
    .replace(/#{1,6}\s/g, "")         // headings
    .replace(/[*_~]{1,3}/g, "")       // emphasis
    .replace(/[-*+]\s/g, "")          // list markers
    .replace(/\d+\.\s/g, "")          // ordered list
    .replace(/>\s/g, "")              // blockquotes
    .replace(/---/g, "")              // horizontal rules
    .trim();

  // Count Chinese characters
  const chineseChars = cleaned.match(/[一-鿿㐀-䶿]/g);
  const chineseCount = chineseChars ? chineseChars.length : 0;

  // Count English words (non-Chinese, non-whitespace sequences)
  const englishText = cleaned.replace(/[一-鿿㐀-䶿]/g, " ");
  const englishWords = englishText.split(/\s+/).filter(w => w.length > 0);
  const englishCount = englishWords.length;

  // Punctuation count (Chinese punctuation)
  const punctuation = cleaned.match(/[，。！？；：""''、（）【】《》…—\-]/g);
  const punctuationCount = punctuation ? punctuation.length : 0;

  return chineseCount + englishCount;
}

export function formatWordCount(count: number): string {
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万字`;
  }
  return `${count}字`;
}
