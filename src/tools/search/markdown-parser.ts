/**
 * Markdown parsing utilities for search indexing.
 * Strips syntax for BM25 scoring, extracts frontmatter and headings.
 */

export function stripMarkdown(content: string): string {
  return content
    .replace(/^---[\s\S]*?---/m, "")         // frontmatter
    .replace(/```[\s\S]*?```/g, "")           // code blocks
    .replace(/`[^`]+`/g, "")                  // inline code
    .replace(/!\[.*?\]\(.*?\)/g, "")          // images
    .replace(/\[([^\]]+)\]\(.*?\)/g, "$1")    // links → text only
    .replace(/#{1,6}\s/g, "")                 // heading markers
    .replace(/[*_~]{1,3}/g, "")              // bold/italic/strikethrough
    .replace(/>\s/g, "")                      // blockquotes
    .replace(/[-*+]\s/g, "")                  // list markers
    .replace(/\d+\.\s/g, "")                 // numbered lists
    .replace(/\|.*\|/g, "")                  // tables
    .replace(/\n{3,}/g, "\n\n")              // collapse newlines
    .trim();
}

export function extractFrontmatter(content: string): { tags: string; aliases: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return { tags: "", aliases: "" };
  const yaml = match[1];

  const tagsMatch = yaml.match(/tags:\s*\[?(.*?)\]?\s*\n/);
  const tags = tagsMatch ? tagsMatch[1].replace(/[,\[\]"']/g, " ").trim() : "";

  const aliasMatch = yaml.match(/aliases:\s*\[?(.*?)\]?\s*\n/);
  const aliases = aliasMatch ? aliasMatch[1].replace(/[,\[\]"']/g, " ").trim() : "";

  return { tags, aliases };
}

export function extractHeadings(content: string): string {
  const headings = content.match(/^#{1,6}\s+(.+)$/gm);
  return headings ? headings.map((h) => h.replace(/^#{1,6}\s+/, "")).join(" ") : "";
}

export function extractSnippet(content: string, query: string, maxLength: number = 200): string {
  const terms = query.toLowerCase().split(/\s+/);
  const lower = content.toLowerCase();

  let bestPos = 0;
  let bestScore = 0;

  // Sample positions rather than scanning every character
  const step = Math.max(1, Math.floor(lower.length / 500));
  for (let i = 0; i < lower.length; i += step) {
    let score = 0;
    for (const term of terms) {
      const idx = lower.indexOf(term, i);
      if (idx !== -1 && idx < i + maxLength) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestPos = i;
    }
  }

  const start = Math.max(0, bestPos - 40);
  const end = Math.min(content.length, start + maxLength);
  let snippet = content.slice(start, end).replace(/\n/g, " ").trim();

  if (start > 0) snippet = "..." + snippet;
  if (end < content.length) snippet = snippet + "...";

  return snippet;
}
