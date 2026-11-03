import { createHash } from "node:crypto";
import { normalizeToken } from "../catalog-normalization/compiler/normalize";

export type SearchExercise = {
  id: string;
  name: string;
  aliases: string[];
  equipment: string[];
  description?: string;
};
export type SearchHit = {
  id: string;
  name: string;
  equipment: string[];
  match: "name-or-alias" | "similar";
  score: number;
  conflicts: string[];
};
export type SearchResult = {
  query: string;
  corpusHash: string;
  totalCandidates: number;
  hasMore: boolean;
  warnings: string[];
  hits: SearchHit[];
};

const words: Record<string, string> = {
  db: "dumbbell", dumbbells: "dumbbell", kb: "kettlebell", kettlebells: "kettlebell",
  bb: "barbell", barbells: "barbell", bw: "bodyweight", rdl: "romanian deadlift",
  presses: "press", rows: "row", curls: "curl", squats: "squat", lunges: "lunge",
  raises: "raise", flyes: "fly", flies: "fly", flye: "fly", extensions: "extension",
  rotations: "rotation", stretches: "stretch", hops: "hop", jumps: "jump",
  bicep: "biceps", tricep: "triceps", unilateral: "single",
  banded: "band", pressdown: "pushdown", pressdowns: "pushdown", pushdowns: "pushdown",
  throws: "throw", rings: "ring",
};
const ignored = new Set(["a", "an", "the", "with", "of", "using", "and"]);
const opposites = [
  ["abduction", "adduction"], ["incline", "decline"], ["flexion", "extension"],
  ["pronated", "supinated"], ["internal", "external"], ["front", "back"],
];

export function searchTerms(value: string): string[] {
  return [...new Set(normalizeToken(value)
    .replace(/\b(?:swiss|stability|physio|exercise) balls?\b/g, "exercise ball")
    .replace(/\b(?:physioball|swissball|fitball)s?\b/g, "exercise ball")
    .replace(/\bmed balls?\b/g, "medicine ball")
    .replace(/\bgymnastic rings?\b/g, "ring")
    .replace(/\bskull\s*crushers?\b/g, "lying triceps extension")
    .replace(/\bpull (up|down|over)s?\b/g, "pull$1")
    .replace(/\bchin ups?\b/g, "chinup")
    .replace(/\b(one|single) (arm|leg)\b/g, "single $2")
    .split(" ").flatMap((word) => (words[word] ?? word).split(" "))
    .filter((word) => word && !ignored.has(word)))].sort();
}

function grams(value: string): Set<string> {
  const result = new Set<string>();
  for (let i = 0; i < value.length - 2; i++) result.add(value.slice(i, i + 3));
  return result;
}

function overlap(a: Set<string>, b: Set<string>): number {
  const common = [...a].filter((item) => b.has(item)).length;
  return a.size + b.size ? 2 * common / (a.size + b.size) : 0;
}

export function searchCatalogue(rows: SearchExercise[], queries: string[], limit = 5): SearchResult[] {
  if (!queries.length || queries.length > 20) throw new Error("Supply 1 to 20 queries.");
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("limit must be 1 to 100.");
  if (queries.some((query) => typeof query !== "string" || !query.trim() || query.length > 500)) {
    throw new Error("Each query must contain 1 to 500 characters.");
  }
  const ordered = [...rows].sort((a, b) => a.id.localeCompare(b.id));
  const corpusHash = createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
  const index = ordered.map((row) => ({
    row,
    labels: [row.name, ...row.aliases].map((label) => ({
      normalized: normalizeToken(label), terms: searchTerms(label), grams: grams(searchTerms(label).join(" ")),
    })),
    context: new Set(searchTerms([row.name, row.description ?? "", ...row.equipment].join(" "))),
  }));
  const frequencies = new Map<string, number>();
  for (const entry of index) {
    for (const term of new Set(entry.labels.flatMap((label) => label.terms))) {
      frequencies.set(term, (frequencies.get(term) ?? 0) + 1);
    }
  }
  const weight = (term: string) => Math.log(1 + (rows.length + 1) / ((frequencies.get(term) ?? 0) + 1));
  const weightedOverlap = (query: Set<string>, terms: Set<string>) => {
    const common = [...query].filter((term) => terms.has(term)).reduce((sum, term) => sum + weight(term), 0);
    const queryWeight = [...query].reduce((sum, term) => sum + weight(term), 0);
    const termWeight = [...terms].reduce((sum, term) => sum + weight(term), 0);
    return common ? 0.75 * common / queryWeight + 0.25 * common / termWeight : 0;
  };
  return queries.map((query) => {
    const queryTerms = new Set(searchTerms(query));
    const queryGrams = grams([...queryTerms].join(" "));
    const hits: SearchHit[] = [];
    for (const { row, labels, context } of index) {
      let score = 0;
      let exact = false;
      for (const label of labels) {
        exact ||= label.normalized === normalizeToken(query);
        const lexical = weightedOverlap(queryTerms, new Set(label.terms));
        const spelling = overlap(queryGrams, label.grams);
        score = Math.max(score, lexical * 0.8 + spelling * 0.2, spelling * 0.75);
      }
      score = exact ? 1 : Math.max(score, weightedOverlap(queryTerms, context) * 0.65);
      if (score < 0.28) continue;
      const conflicts = opposites.filter(([a, b]) =>
        (queryTerms.has(a) && !queryTerms.has(b) && context.has(b) && !context.has(a)) ||
        (queryTerms.has(b) && !queryTerms.has(a) && context.has(a) && !context.has(b)),
      ).map((pair) => pair.join("/"));
      hits.push({ id: row.id, name: row.name, equipment: row.equipment,
        match: exact ? "name-or-alias" : "similar", score: Number(score.toFixed(4)), conflicts });
    }
    hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    return { query, corpusHash, totalCandidates: hits.length, hasMore: hits.length > limit,
      warnings: ["Search results are candidates, not identity or novelty decisions.",
        ...(/\bsl(?:dl)?\b/i.test(query) ? ["SL/SLDL may mean single-leg, straight-leg, or stiff-leg. Search each interpretation."] : [])],
      hits: hits.slice(0, limit) };
  });
}
