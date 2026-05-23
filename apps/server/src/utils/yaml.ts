import * as yaml from "js-yaml";

export function parseYaml<T = unknown>(content: string): T {
  return yaml.load(content) as T;
}

export function dumpYaml(data: unknown): string {
  return yaml.dump(data, {
    indent: 2,
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}

export function parseYamlFrontMatter<T = Record<string, unknown>>(
  content: string
): { data: T; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { data: {} as T, body: content };
  }
  return {
    data: yaml.load(match[1]) as T,
    body: match[2],
  };
}

export function createYamlFrontMatter(data: Record<string, unknown>, body: string): string {
  const frontMatter = yaml.dump(data, { indent: 2, noRefs: true, sortKeys: false });
  return `---\n${frontMatter}---\n${body}`;
}
