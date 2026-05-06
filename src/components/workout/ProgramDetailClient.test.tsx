import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProgramDetailClient } from "./ProgramDetailClient";

jest.mock("@/lib/storage/programRepo", () => ({
  programRepo: {
    get: jest.fn().mockResolvedValue({
      id: "p1", title: "Upper/Lower", description: "Test",
      source: "manual", active: true, days: [], overrides: [],
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    }),
  },
}));

jest.mock("@/lib/analysis/analyze", () => ({
  analyzeProgram: jest.fn().mockReturnValue({
    overall: { name: "Overall", score: 82, grade: "B" },
    dimensions: {
      volume:        { name: "Volume",        score: 91, grade: "A" },
      session:       { name: "Structure",     score: 88, grade: "A" },
      balance:       { name: "Balance",       score: 78, grade: "B" },
      periodization: { name: "Periodization", score: 65, grade: "C" },
    },
    muscleVolumes: [], sessions: [],
    balance: {
      pushPullRatio: null, upperLowerRatio: null, quadHamRatio: null, chestBackRatio: null,
      movementPatternsCovered: [], movementPatternsMissing: [], warnings: [],
    },
    periodization: { weeksDetected: 1, volumePattern: "static", deloadDetected: false, warnings: [] },
    warnings: [],
  }),
}));

describe("ProgramDetailClient analysis integration", () => {
  it("shows analysis card after program loads", async () => {
    render(<MemoryRouter><ProgramDetailClient id="p1" /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/Analysis/)).toBeInTheDocument();
    });
  });
});
