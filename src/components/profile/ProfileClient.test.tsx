import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileClient } from "./ProfileClient";
import type { ProfileDocument } from "@/lib/programs/types";

jest.mock("@/lib/storage/logRepo", () => ({
  logRepo: { list: jest.fn().mockResolvedValue([]) },
}));

const mockSaveProfile = jest.fn().mockResolvedValue(undefined);
let mockProfile: ProfileDocument | undefined;

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    profile: mockProfile,
    loading: false,
    error: null,
    saveProfile: mockSaveProfile,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockProfile = undefined;
});

describe("ProfileClient — no profile", () => {
  it("renders a creation form, not the dead-end message", () => {
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);
    expect(screen.queryByText(/import a program/i)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/your name/i)).toBeInTheDocument();
  });

  it("saves when the Save profile button is clicked", async () => {
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/your name/i), {
      target: { value: "Alex" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Alex",
          id: "local-profile",
          defaultDaysPerWeek: 4,
        })
      );
    });
  });

  it("saves the selected primary training goal", async () => {
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/your name/i), {
      target: { value: "Alex" },
    });
    fireEvent.change(screen.getByLabelText(/primary training goal/i), {
      target: { value: "strength" },
    });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ primaryGoal: "strength" })
      );
    });
  });
});

describe("ProfileClient — ranked goals (creation form)", () => {
  it("adds a goal via the ranked editor and saves it in array order", async () => {
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);
    fireEvent.change(screen.getByPlaceholderText(/your name/i), {
      target: { value: "Alex" },
    });
    fireEvent.change(screen.getByPlaceholderText(/add goal/i), {
      target: { value: "Fix shoulder pain" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/add goal/i), { key: "Enter" });
    fireEvent.change(screen.getByPlaceholderText(/add goal/i), {
      target: { value: "Compete again" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/add goal/i), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /save profile/i }));
    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ goals: ["Fix shoulder pain", "Compete again"] })
      );
    });
  });
});

function existingProfile(overrides: Partial<ProfileDocument> = {}): ProfileDocument {
  return {
    id: "local-profile",
    name: "Alex",
    goals: ["Fix shoulder pain", "Compete again"],
    equipment: [],
    constraints: [],
    injuries: [],
    preferences: [],
    trainingAge: "5 years",
    defaultDaysPerWeek: 4,
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

describe("ProfileClient — ranked goals (existing profile)", () => {
  it("renders goals in stored rank order in the read-only view, with the primary goal badge above them", () => {
    mockProfile = existingProfile({ primaryGoal: "strength" });
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);

    const items = screen.getAllByRole("listitem");
    expect(items[0]).toHaveTextContent("1");
    expect(items[0]).toHaveTextContent("Fix shoulder pain");
    expect(items[1]).toHaveTextContent("2");
    expect(items[1]).toHaveTextContent("Compete again");
    expect(screen.getByText(/★.*strength/i)).toBeInTheDocument();
  });

  it("saves a reordered goals array (as produced by the ranked editor's onChange) in the new order", async () => {
    mockProfile = existingProfile();
    render(<MemoryRouter><ProfileClient /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: /edit goals/i }));
    // Simulate the outcome of a completed drag: remove-and-append is the only
    // pointer-free interaction RankedGoalsEditor exposes, and it goes through
    // the exact same onChange(goals) contract handleDragEnd/resolveDragReorder
    // use (see RankedGoalsEditor.test.tsx for direct coverage of the drag math).
    fireEvent.click(screen.getByRole("button", { name: /remove fix shoulder pain/i }));
    fireEvent.change(screen.getByPlaceholderText(/add goal/i), {
      target: { value: "Fix shoulder pain" },
    });
    fireEvent.keyDown(screen.getByPlaceholderText(/add goal/i), { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mockSaveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ goals: ["Compete again", "Fix shoulder pain"] })
      );
    });
  });
});
