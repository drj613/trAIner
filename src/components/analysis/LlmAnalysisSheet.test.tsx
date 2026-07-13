import { render, screen, fireEvent } from "@testing-library/react";
import { LlmAnalysisSheet } from "./LlmAnalysisSheet";

const mockAnalysis = {
  durationMs: 184,
  overall: { score: 82, grade: "B" },
  goalScope: {
    goal: "general" as const,
    partial: false,
    gradedDimensions: ["volume", "session", "balance", "periodization"] as ("volume" | "session" | "balance" | "periodization")[],
  },
  fingerprint: { primary: "Hypertrophy", secondary: "Strength", label: "Hypertrophy-focused", confidence: 0.88 },
  dimensions: [],
  muscles: [{ group: "Chest", sets: 6.5, mev: 6, mavLo: 6, mavHi: 16, mrv: 24, status: "green" as const }],
  ratios: [],
  patterns: { covered: [], missing: [] },
  sessions: [{ day: "Mon", exercises: 7, sets: 22, workingSets: 18, durationMin: 56, status: "good" as const }],
  warnings: [],
  strengths: [],
};

describe("LlmAnalysisSheet", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <LlmAnalysisSheet open={false} onClose={jest.fn()} analysis={mockAnalysis} programTitle="Test" />
    );
    expect(container.firstChild).toBeNull();
  });

  it("shows what's-in-prompt grid when open", () => {
    render(
      <LlmAnalysisSheet open={true} onClose={jest.fn()} analysis={mockAnalysis} programTitle="Test" />
    );
    expect(screen.getByText("Volume landmarks")).toBeInTheDocument();
    expect(screen.getByText("Balance targets")).toBeInTheDocument();
  });

  it("shows copy button", () => {
    render(
      <LlmAnalysisSheet open={true} onClose={jest.fn()} analysis={mockAnalysis} programTitle="Test" />
    );
    expect(screen.getByText(/Copy prompt/)).toBeInTheDocument();
  });

  it("calls onClose when backdrop clicked", () => {
    const onClose = jest.fn();
    render(
      <LlmAnalysisSheet open={true} onClose={onClose} analysis={mockAnalysis} programTitle="Test" />
    );
    fireEvent.click(screen.getByTestId("llm-sheet-backdrop"));
    expect(onClose).toHaveBeenCalled();
  });
});
