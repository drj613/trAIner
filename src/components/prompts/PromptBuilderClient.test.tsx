import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PromptBuilderClient } from "./PromptBuilderClient";
import type { ProfileDocument } from "@/lib/programs/types";

let mockProfile: ProfileDocument | undefined;

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
  mockProfile = {
    id: "local-profile",
    name: "Alex",
    goals: ["Hypertrophy"],
    equipment: ["Full gym"],
    constraints: [],
    injuries: ["bad knee"],
    preferences: [],
    trainingAge: "5 years",
    defaultDaysPerWeek: 4,
    updatedAt: "2026-01-01",
  };
});

function renderBuilder() {
  return render(
    <MemoryRouter>
      <PromptBuilderClient />
    </MemoryRouter>,
  );
}

describe("PromptBuilderClient no-profile warning", () => {
  it("shows a no-profile warning when profile is undefined", () => {
    mockProfile = undefined;
    renderBuilder();
    expect(screen.getByText(/no profile found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile");
  });

  it("does not show the warning when a profile exists", () => {
    renderBuilder();
    expect(screen.queryByText(/no profile found/i)).not.toBeInTheDocument();
  });
});

describe("PromptBuilderClient field toggles", () => {
  it("includes enabled profile fields in the generated prompt", () => {
    renderBuilder();
    expect(screen.getByText(/Goals: Hypertrophy/)).toBeInTheDocument();
    expect(screen.getByText(/- bad knee/)).toBeInTheDocument();
  });

  it("removes a field's text when its toggle is switched off", () => {
    renderBuilder();
    fireEvent.click(screen.getByLabelText("Goals"));
    expect(screen.queryByText(/Goals: Hypertrophy/)).not.toBeInTheDocument();
  });
});
