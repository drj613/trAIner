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

describe("PromptBuilderClient nudge", () => {
  it("nudges when an enabled important field is empty", () => {
    mockProfile = { ...mockProfile!, injuries: [], schedule: [] };
    renderBuilder();
    const nudge = screen.getByRole("note");
    expect(nudge).toHaveTextContent(/Injuries/);
    expect(nudge).toHaveTextContent(/Schedule/);
    expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile");
  });

  it("does not nudge when important fields are filled", () => {
    mockProfile = { ...mockProfile!, schedule: ["Mon/Wed/Fri"] }; // injuries already set in beforeEach
    renderBuilder();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("PromptBuilderClient ad-hoc injuries", () => {
  it("merges a typed temporary injury into the constraints block", () => {
    renderBuilder();
    const input = screen.getByPlaceholderText(/temporary injury/i);
    fireEvent.change(input, { target: { value: "tweaked lower back" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText(/- tweaked lower back/)).toBeInTheDocument();
    expect(screen.getByText(/- bad knee/)).toBeInTheDocument(); // profile injury still present
  });
});

describe("PromptBuilderClient multi-coach synthesis", () => {
  it("instructs multi-coach prompts to resolve conflicts with explicit rules", () => {
    render(<MemoryRouter><PromptBuilderClient /></MemoryRouter>);
    // rp is selected by default; select a second persona to trigger synthesis
    fireEvent.click(screen.getByRole("button", { name: /Powerlifting Specialist/i }));
    expect(screen.getByText(/resolve each conflict with an explicit rule/i)).toBeInTheDocument();
  });

  it("states persona precedence even in the default single-coach flow (no synthesis block emitted)", () => {
    render(<MemoryRouter><PromptBuilderClient /></MemoryRouter>);
    // Default state selects a single persona (rp), so the multi-coach synthesis
    // block is NOT emitted — but the precedence subordination must still appear.
    expect(screen.queryByText(/resolve each conflict with an explicit rule/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Athlete constraints, explicit goals, injuries, session limits, output rules, and the synthesized plan override any absolute statement inside an individual coach persona/i,
      ),
    ).toBeInTheDocument();
  });

  it("keeps persona precedence present in the multi-coach flow too", () => {
    render(<MemoryRouter><PromptBuilderClient /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /Powerlifting Specialist/i }));
    expect(
      screen.getByText(
        /Athlete constraints, explicit goals, injuries, session limits, output rules, and the synthesized plan override any absolute statement inside an individual coach persona/i,
      ),
    ).toBeInTheDocument();
  });
});
