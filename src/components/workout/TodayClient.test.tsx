import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TodayClient } from "./TodayClient";
import type { ProfileDocument } from "@/lib/programs/types";

let mockProfile: ProfileDocument | undefined = undefined;

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    programs: [],
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
});
