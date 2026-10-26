import { dimensions, evaluateRound, panel, type Round } from "./gate";

function passingRound(): Round {
  return {
    screenshots: ["mobile-light/workout.png", "mobile-dark/workout.png"],
    checks: { lint: true, types: true, build: true, behavior: true },
    reviews: panel.map(model => ({
      model,
      imageInspection: true,
      inspectedScreenshots: ["mobile-light/workout.png", "mobile-dark/workout.png"],
      scores: Object.fromEntries(dimensions.map(key => [key, 8.5])) as Round["reviews"][number]["scores"],
      overall: 8.5,
      unresolvedMajorIssues: [],
    })),
  };
}

test("passes only when the full independent panel meets the fixed gate", () => {
  expect(evaluateRound(passingRound())).toEqual({ passed: true, reasons: [] });
});

test("does not average away a low category from one reviewer", () => {
  const round = passingRound();
  round.reviews[2].scores.contrast = 7.9;
  expect(evaluateRound(round).passed).toBe(false);
});

test("rejects an incomplete or duplicate panel", () => {
  const missing = passingRound();
  missing.reviews.pop();
  expect(evaluateRound(missing).passed).toBe(false);
  const duplicate = passingRound();
  duplicate.reviews[2] = duplicate.reviews[0];
  expect(evaluateRound(duplicate).passed).toBe(false);
});

test("requires direct image inspection and every named screenshot", () => {
  const round = passingRound();
  round.reviews[0].imageInspection = false;
  expect(evaluateRound(round).passed).toBe(false);
  round.reviews[0].imageInspection = true;
  round.reviews[0].inspectedScreenshots.pop();
  expect(evaluateRound(round).passed).toBe(false);
});

test("does not pass a panel with unresolved major issues or failed checks", () => {
  const round = passingRound();
  round.reviews[1].unresolvedMajorIssues.push("Primary save action is obscured");
  expect(evaluateRound(round).passed).toBe(false);
  round.reviews[1].unresolvedMajorIssues = [];
  round.checks.behavior = false;
  expect(evaluateRound(round).passed).toBe(false);
});

test("rejects invalid numeric scores and overall scores below the gate", () => {
  for (const value of [NaN, Infinity, -1, 11, 8.4]) {
    const round = passingRound();
    round.reviews[0].overall = value;
    expect(evaluateRound(round).passed).toBe(false);
  }
  const round = passingRound();
  round.reviews[0].scores.typography = NaN;
  expect(evaluateRound(round).passed).toBe(false);
});

test("requires a nonempty, unique screenshot set", () => {
  const round = passingRound();
  round.screenshots = [];
  expect(evaluateRound(round).passed).toBe(false);
  round.screenshots = ["a.png", "a.png"];
  expect(evaluateRound(round).passed).toBe(false);
});


test("requires every verification check even if a report omits a field", () => {
  const round = passingRound();
  delete (round.checks as Partial<Round["checks"]>).types;
  expect(evaluateRound(round).passed).toBe(false);
});
