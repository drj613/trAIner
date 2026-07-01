import { render, screen, fireEvent } from "@testing-library/react";
import { RoutineAnalysisCard } from "./RoutineAnalysisCard";
import { analyzeProgram } from "@/lib/analysis/analyze";
import { toDisplayAnalysis } from "@/lib/analysis/toDisplayAnalysis";
import { balancedProgram, startingStrengthProgram } from "@/lib/analysis/fixtures";

const mockAnalysis = {
  durationMs: 184,
  overall: { score: 82, grade: "B" },
  goalScope: { goal: "general" as const, partial: false, gradedDimensions: ["volume", "session", "balance", "periodization"] as const },
  fingerprint: { primary: "Hypertrophy", secondary: "Strength", label: "Hypertrophy-focused upper/lower split" },
  dimensions: [
    { id: "volume", label: "Volume", score: 91, grade: "A", status: "good" as const, note: "8/10 in MAV", graded: true },
    { id: "balance", label: "Balance", score: 78, grade: "B", status: "warn" as const, note: "Push-dominant", graded: true },
    { id: "structure", label: "Structure", score: 88, grade: "A", status: "good" as const, note: "38-62 min", graded: true },
    { id: "periodization", label: "Periodization", score: 65, grade: "C", status: "warn" as const, note: "No deload", graded: true },
  ],
  muscles: [
    { group: "Chest", sets: 6.5, mev: 6, mavLo: 6, mavHi: 16, mrv: 24, status: "green" as const },
    { group: "Rear delts", sets: 3, mev: 4, mavLo: 4, mavHi: 12, mrv: 20, status: "yellow" as const, flag: "below_mev" },
  ],
  ratios: [
    { id: "push_pull", label: "Push : Pull", value: "1.18 : 1", verdict: "warn" as const, target: "0.67–1.0" },
  ],
  patterns: { covered: ["horizontal_push", "squat"], missing: ["hip_hinge"] },
  sessions: [
    { day: "Mon · Upper A", exercises: 7, sets: 22, durationMin: 56, status: "good" as const },
  ],
  warnings: [
    { severity: "warn" as const, area: "Volume", msg: "Rear delts below MEV" },
  ],
  strengths: ["Excellent compound ordering"],
};

describe("RoutineAnalysisCard", () => {
  it("shows score badge with grade", () => {
    render(<RoutineAnalysisCard analysis={mockAnalysis} goal="general" onGoalChange={() => {}} onOpenPrompt={jest.fn()} />);
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
  });

  it("shows fingerprint label", () => {
    render(<RoutineAnalysisCard analysis={mockAnalysis} goal="general" onGoalChange={() => {}} onOpenPrompt={jest.fn()} />);
    expect(screen.getByText("Hypertrophy-focused upper/lower split")).toBeInTheDocument();
  });

  it("shows dimension chips", () => {
    render(<RoutineAnalysisCard analysis={mockAnalysis} goal="general" onGoalChange={() => {}} onOpenPrompt={jest.fn()} />);
    expect(screen.getByText("Volume")).toBeInTheDocument();
    expect(screen.getByText("Balance")).toBeInTheDocument();
  });

  it("expands when header clicked", () => {
    render(<RoutineAnalysisCard analysis={mockAnalysis} goal="general" onGoalChange={() => {}} onOpenPrompt={jest.fn()} />);
    fireEvent.click(screen.getByText("Hypertrophy-focused upper/lower split"));
    expect(screen.getByText("Chest")).toBeInTheDocument();
  });

  it("switches to balance tab", () => {
    render(<RoutineAnalysisCard analysis={mockAnalysis} goal="general" onGoalChange={() => {}} onOpenPrompt={jest.fn()} />);
    fireEvent.click(screen.getByText("Balance"));
    expect(screen.getByText("Push : Pull")).toBeInTheDocument();
  });

  it("calls onOpenPrompt when AI prompt button clicked", () => {
    const onOpenPrompt = jest.fn();
    render(<RoutineAnalysisCard analysis={mockAnalysis} goal="general" onGoalChange={() => {}} onOpenPrompt={onOpenPrompt} />);
    fireEvent.click(screen.getByText("Hypertrophy-focused upper/lower split"));
    fireEvent.click(screen.getByRole("button", { name: /AI prompt/ }));
    expect(onOpenPrompt).toHaveBeenCalled();
  });

  it("states the grade is calibrated for general/hypertrophy training", () => {
    const analysis = toDisplayAnalysis(analyzeProgram(balancedProgram), 0);
    render(<RoutineAnalysisCard analysis={analysis} goal="general" onGoalChange={() => {}} onOpenPrompt={() => {}} />);
    expect(
      screen.getByText(/calibrated for general .* hypertrophy training/i),
    ).toBeInTheDocument();
  });
});

const strengthAnalysis = () =>
  toDisplayAnalysis(analyzeProgram({ ...startingStrengthProgram, goal: "strength" as const }), 0);

const generalAnalysis = () =>
  toDisplayAnalysis(analyzeProgram(startingStrengthProgram), 0);

describe("RoutineAnalysisCard goal gate", () => {
  it("shows a partial tag when dimensions are gated out", () => {
    render(<RoutineAnalysisCard analysis={strengthAnalysis()} goal="strength" onGoalChange={() => {}} onOpenPrompt={() => {}} />);
    expect(screen.getByText(/partial/i)).toBeTruthy();
  });

  it("no partial tag for full-scope goals", () => {
    render(<RoutineAnalysisCard analysis={generalAnalysis()} goal="general" onGoalChange={() => {}} onOpenPrompt={() => {}} />);
    expect(screen.queryByText(/·\s*partial/i)).toBeNull();
  });

  it("goal select fires onGoalChange", () => {
    const onGoalChange = jest.fn();
    render(<RoutineAnalysisCard analysis={generalAnalysis()} goal="general" onGoalChange={onGoalChange} onOpenPrompt={() => {}} />);
    fireEvent.change(screen.getByLabelText(/routine goal/i), { target: { value: "strength" } });
    expect(onGoalChange).toHaveBeenCalledWith("strength");
  });

  it("goal-scoped footnote names what was graded", () => {
    render(<RoutineAnalysisCard analysis={strengthAnalysis()} goal="strength" onGoalChange={() => {}} onOpenPrompt={() => {}} />);
    expect(screen.getByText(/graded on/i).textContent).toMatch(/Structure/);
  });
});
