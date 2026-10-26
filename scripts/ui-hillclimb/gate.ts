export const dimensions = ["typography", "hierarchy", "spacing", "contrast", "iconography", "consistency", "clarity"] as const;
export const panel = ["claude-sonnet-5-5", "gpt-6.1-sol", "opencode-go/deepseek-v4.1-flash"] as const;

export type Round = {
  screenshots: string[];
  checks: { lint: boolean; types: boolean; build: boolean; behavior: boolean };
  reviews: {
    model: string;
    imageInspection: boolean;
    inspectedScreenshots: string[];
    scores: Record<(typeof dimensions)[number], number>;
    overall: number;
    unresolvedMajorIssues: string[];
  }[];
};

export function evaluateRound(round: Round): { passed: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!round.screenshots.length || new Set(round.screenshots).size !== round.screenshots.length) {
    reasons.push("The review needs a nonempty, unique screenshot set.");
  }
  for (const check of ["lint", "types", "build", "behavior"] as const) {
    if (round.checks[check] !== true) {
      reasons.push(`${check} verification has not passed.`);
    }
  }
  if (round.reviews.length !== panel.length) reasons.push("The review panel is incomplete or has extra entries.");
  for (const model of panel) {
    const reviews = round.reviews.filter(review => review.model === model);
    if (reviews.length !== 1) {
      reasons.push(`Expected one independent review from ${model}.`);
      continue;
    }
    const review = reviews[0];
    if (review.imageInspection !== true) reasons.push(`${model} did not inspect images directly.`);
    const missing = round.screenshots.filter(file => !review.inspectedScreenshots.includes(file));
    if (missing.length) reasons.push(`${model} did not inspect: ${missing.join(", ")}.`);
    if (!Number.isFinite(review.overall) || review.overall < 8.5 || review.overall > 10) {
      reasons.push(`${model} overall score does not meet 8.5/10.`);
    }
    for (const dimension of dimensions) {
      const score = review.scores[dimension];
      if (!Number.isFinite(score) || score < 8 || score > 10) {
        reasons.push(`${model} ${dimension} score does not meet 8/10.`);
      }
    }
    if (review.unresolvedMajorIssues.length) reasons.push(`${model} has unresolved major issues.`);
  }
  return { passed: reasons.length === 0, reasons };
}
