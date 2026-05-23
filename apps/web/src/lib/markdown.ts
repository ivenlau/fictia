export function countWords(text: string): number {
  // Count Chinese characters + English words
  const chinese = (text.match(/[一-鿿]/g) || []).length;
  const english = text.replace(/[一-鿿]/g, "").split(/\s+/).filter(Boolean).length;
  return chinese + english;
}

export function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}
