/**
 * Agglomerative clustering using Jaccard similarity on TF-IDF fingerprints.
 */

import type { FileFingerprint } from "./tfidf.js";

export interface ThemeCluster {
  id: string;
  label: string;
  keyTerms: string[];
  files: string[];
  folders: string[];
  coherenceScore: number;
  crossFolder: boolean;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function computeAverageJaccard(files: FileFingerprint[]): number {
  if (files.length < 2) return 1.0;

  const termSets = files.map((f) => new Set(f.topTerms.map((t) => t.term)));
  let totalSim = 0;
  let pairs = 0;

  for (let i = 0; i < termSets.length; i++) {
    for (let j = i + 1; j < termSets.length; j++) {
      totalSim += jaccardSimilarity(termSets[i], termSets[j]);
      pairs++;
    }
  }

  return pairs > 0 ? totalSim / pairs : 0;
}

export function clusterFiles(
  fingerprints: FileFingerprint[],
  minClusterSize: number = 3,
  similarityThreshold: number = 0.15,
): ThemeCluster[] {
  type Cluster = { files: FileFingerprint[]; terms: Set<string> };

  let clusters: Cluster[] = fingerprints.map((fp) => ({
    files: [fp],
    terms: new Set(fp.topTerms.map((t) => t.term)),
  }));

  // Agglomerative merging
  while (true) {
    let bestSim = 0;
    let bestI = -1;
    let bestJ = -1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        const sim = jaccardSimilarity(clusters[i].terms, clusters[j].terms);
        if (sim > bestSim) {
          bestSim = sim;
          bestI = i;
          bestJ = j;
        }
      }
    }

    if (bestSim < similarityThreshold || bestI === -1) break;

    // Merge bestJ into bestI
    clusters[bestI].files.push(...clusters[bestJ].files);
    for (const t of clusters[bestJ].terms) {
      clusters[bestI].terms.add(t);
    }
    clusters.splice(bestJ, 1);
  }

  // Convert to ThemeCluster
  return clusters
    .filter((c) => c.files.length >= minClusterSize)
    .map((c) => {
      const folders = [...new Set(c.files.map((f) => f.folder))];

      // Label = top terms by combined TF-IDF
      const termScores = new Map<string, number>();
      for (const file of c.files) {
        for (const { term, tfidf } of file.topTerms) {
          termScores.set(term, (termScores.get(term) || 0) + tfidf);
        }
      }
      const sortedTerms = [...termScores.entries()]
        .sort(([, a], [, b]) => b - a)
        .slice(0, 6);

      const coherence = computeAverageJaccard(c.files);

      return {
        id: sortedTerms
          .slice(0, 2)
          .map(([t]) => t)
          .join("-"),
        label: sortedTerms
          .slice(0, 3)
          .map(([t]) => capitalize(t))
          .join(" + "),
        keyTerms: sortedTerms.map(([t]) => t),
        files: c.files.map((f) => f.path),
        folders,
        coherenceScore: Math.round(coherence * 100) / 100,
        crossFolder: folders.length > 1,
      };
    })
    .sort((a, b) => b.files.length - a.files.length);
}
