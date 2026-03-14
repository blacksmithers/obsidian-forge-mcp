/**
 * TF-IDF computation and tokenizer for vault theme extraction.
 */

const STOP_WORDS = new Set([
  // English
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "can", "shall", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "this", "that", "these", "those",
  "it", "its", "not", "but", "and", "or", "if", "then", "so", "as",
  "than", "too", "very", "just", "about", "up", "out", "no", "all",
  "also", "each", "which", "their", "there", "them", "they", "we",
  "you", "your", "our", "my", "me", "he", "she", "his", "her",
  // Portuguese
  "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas",
  "um", "uma", "uns", "umas", "para", "por", "com", "sem", "sob",
  "que", "se", "como", "mas", "ou", "e", "não", "mais", "muito",
  "também", "já", "ainda", "só", "ao", "aos", "à", "às", "é", "são",
  "foi", "ser", "ter", "está", "este", "esta", "esse", "essa", "isso",
  "ele", "ela", "eles", "elas", "seu", "sua", "seus", "suas",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-záàâãéèêíïóôõöúçñ0-9\s-]/gi, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));
}

export interface FileFingerprint {
  path: string;
  title: string;
  topTerms: Array<{ term: string; tfidf: number }>;
  folder: string;
}

export function computeTfIdf(
  files: Array<{ path: string; title: string; content: string }>,
): FileFingerprint[] {
  // Step 1: tokenize all files
  const tokenized = files.map((f) => ({
    ...f,
    tokens: tokenize(f.content),
  }));

  const totalFiles = tokenized.length;
  if (totalFiles === 0) return [];

  // Step 2: document frequency
  const df = new Map<string, number>();
  for (const file of tokenized) {
    const uniqueTerms = new Set(file.tokens);
    for (const term of uniqueTerms) {
      df.set(term, (df.get(term) || 0) + 1);
    }
  }

  // Step 3: TF-IDF per file
  return tokenized.map((file) => {
    const termCounts = new Map<string, number>();
    for (const token of file.tokens) {
      termCounts.set(token, (termCounts.get(token) || 0) + 1);
    }

    const totalTerms = file.tokens.length || 1;
    const tfidfScores: Array<{ term: string; tfidf: number }> = [];

    for (const [term, count] of termCounts) {
      const tf = count / totalTerms;
      const idf = Math.log(totalFiles / (df.get(term) || 1));
      tfidfScores.push({ term, tfidf: tf * idf });
    }

    tfidfScores.sort((a, b) => b.tfidf - a.tfidf);

    return {
      path: file.path,
      title: file.title,
      topTerms: tfidfScores.slice(0, 15),
      folder: file.path.split("/").slice(0, -1).join("/"),
    };
  });
}
