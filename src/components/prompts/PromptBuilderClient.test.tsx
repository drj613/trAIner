import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PromptBuilderClient } from "./PromptBuilderClient";
import type { ProfileDocument } from "@/lib/storage/schema";

let mockProfile: ProfileDocument | undefined = undefined;

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    profile: mockProfile,
    programs: [],
    loading: false,
    error: null,
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));

beforeEach(() => {
  mockProfile = undefined;
});

describe("PromptBuilderClient", () => {
  it("shows a no-profile warning when profile is undefined", () => {
    render(<MemoryRouter><PromptBuilderClient /></MemoryRouter>);
    expect(screen.getByText(/no profile found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile");
  });

  it("does not show the warning when a profile exists", () => {
    mockProfile = { id: "local-profile", name: "Alex", goals: [], equipment: [], constraints: [], injuries: [], preferences: [], trainingAge: "", defaultDaysPerWeek: 4, updatedAt: "2026-01-01T00:00:00.000Z" };
    render(<MemoryRouter><PromptBuilderClient /></MemoryRouter>);
    expect(screen.queryByText(/no profile found/i)).not.toBeInTheDocument();
  });
});
