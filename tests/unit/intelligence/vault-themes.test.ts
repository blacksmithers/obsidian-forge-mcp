import { describe, it, expect } from "vitest";
import { computeTfIdf } from "../../../src/tools/intelligence/tfidf.js";

describe("vault-themes tfidf", () => {
  it("computeTfIdf returns fingerprints for input docs", () => {
    const files = [
      { path: "notes/a.md", title: "Note A", content: "obsidian vault management tools integration" },
      { path: "notes/b.md", title: "Note B", content: "typescript programming code review testing" },
      { path: "notes/c.md", title: "Note C", content: "obsidian plugins community vault sharing" },
    ];

    const result = computeTfIdf(files);
    expect(result.length).toBe(3);
    expect(result[0].path).toBe("notes/a.md");
    expect(result[0].title).toBe("Note A");
    expect(result[0].folder).toBe("notes");
  });

  it("fingerprints have top terms", () => {
    const files = [
      { path: "notes/a.md", title: "Note A", content: "obsidian vault management tools integration plugins" },
      { path: "notes/b.md", title: "Note B", content: "typescript programming code review testing debugging" },
    ];

    const result = computeTfIdf(files);
    for (const fingerprint of result) {
      expect(Array.isArray(fingerprint.topTerms)).toBe(true);
      expect(fingerprint.topTerms.length).toBeGreaterThan(0);
      for (const term of fingerprint.topTerms) {
        expect(term).toHaveProperty("term");
        expect(term).toHaveProperty("tfidf");
        expect(typeof term.term).toBe("string");
        expect(typeof term.tfidf).toBe("number");
      }
    }
  });

  it("handles empty input", () => {
    const result = computeTfIdf([]);
    expect(result).toEqual([]);
  });
});
