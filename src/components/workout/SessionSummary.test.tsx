import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SessionSummary, computeSessionSummary } from "./SessionSummary";

describe("computeSessionSummary", () => {
  it("counts done/total, exercises with work, PRs and misses", () => {
    const stats = computeSessionSummary({
      e1: ["70x8", "+80x5", ""],
      e2: ["skip", "60x10!"],
      e3: ["", ""],
    });
    expect(stats).toEqual({
      exercises: 2, // e1 and e2 have logged work; e3 is empty
      setsDone: 4, // 70x8, +80x5, skip, 60x10!
      setsTotal: 7,
      prs: 1, // +80x5
      misses: 1, // 60x10!
    });
  });

  it("returns zeroes for an all-empty session", () => {
    expect(computeSessionSummary({ e1: ["", ""] })).toEqual({
      exercises: 0,
      setsDone: 0,
      setsTotal: 2,
      prs: 0,
      misses: 0,
    });
  });
});

describe("SessionSummary", () => {
  const stats = { exercises: 2, setsDone: 4, setsTotal: 5, prs: 1, misses: 1 };

  it("shows the day title, counts, PRs and misses", () => {
    render(<SessionSummary dayTitle="Push Day" stats={stats} onNext={jest.fn()} onReview={jest.fn()} />);
    expect(screen.getByText(/push day done/i)).toBeInTheDocument();
    expect(screen.getByText(/4 of 5 sets logged/i)).toBeInTheDocument();
    expect(screen.getByText("PR")).toBeInTheDocument();
    expect(screen.getByText("Miss")).toBeInTheDocument();
  });

  it("hides PR/Miss tiles when there are none", () => {
    render(
      <SessionSummary
        dayTitle="Push Day"
        stats={{ exercises: 1, setsDone: 3, setsTotal: 3, prs: 0, misses: 0 }}
        onNext={jest.fn()}
        onReview={jest.fn()}
      />,
    );
    expect(screen.queryByText(/^PRs?$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Miss(es)?$/)).not.toBeInTheDocument();
  });

  it("fires onNext and onReview", async () => {
    const onNext = jest.fn();
    const onReview = jest.fn();
    const user = userEvent.setup();
    render(<SessionSummary dayTitle="Push Day" stats={stats} onNext={onNext} onReview={onReview} />);
    await user.click(screen.getByRole("button", { name: /continue to next day/i }));
    await user.click(screen.getByRole("button", { name: /review session/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onReview).toHaveBeenCalledTimes(1);
  });
});
