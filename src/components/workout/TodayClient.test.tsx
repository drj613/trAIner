import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TodayClient } from "./TodayClient";
import type { ProfileDocument } from "@/lib/programs/types";

let mockProfile: ProfileDocument | undefined = undefined;
let mockPrograms: ProfileDocument[] = []; // will be ProgramDocument[] but declared loosely

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    programs: mockPrograms,
    profile: mockProfile,
    loading: false,
    error: undefined,
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: { listForProgram: jest.fn().mockResolvedValue([]) },
}));

beforeEach(() => {
  mockProfile = undefined;
  mockPrograms = [];
});

describe("TodayClient", () => {
  it("shows profile setup banner when no profile exists", () => {
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    expect(screen.getByText(/set up your Profile/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /go to profile/i })).toHaveAttribute("href", "/profile");
  });

  it("does not show the banner when profile exists", () => {
    mockProfile = {
      id: "local-profile",
      name: "Alex",
      goals: [],
      equipment: [],
      constraints: [],
      trainingAge: "2 years",
      defaultDaysPerWeek: 4,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    expect(screen.queryByText(/set up your Profile/i)).not.toBeInTheDocument();
  });

  it("shows 3-step onboarding when no program exists", () => {
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    expect(screen.getByText(/Fill out your Profile/i)).toBeInTheDocument();
    expect(screen.getByText(/Choose a coach on Prompts/i)).toBeInTheDocument();
    expect(screen.getByText(/Paste the AI/i)).toBeInTheDocument();
  });

  it("marks step 1 done when profile exists", () => {
    mockProfile = {
      id: "local-profile",
      name: "Alex",
      goals: [],
      equipment: [],
      constraints: [],
      trainingAge: "2 years",
      defaultDaysPerWeek: 4,
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    render(<MemoryRouter><TodayClient /></MemoryRouter>);
    const step1Link = screen.getByRole("link", { name: /Fill out your Profile/i });
    expect(step1Link.textContent).toMatch(/✓/);
  });
});
