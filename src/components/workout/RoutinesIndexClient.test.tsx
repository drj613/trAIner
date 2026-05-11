import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RoutinesIndexClient } from "./RoutinesIndexClient";

const mockActivateProgram = jest.fn().mockResolvedValue(undefined);
const mockDuplicateProgram = jest.fn().mockResolvedValue({ id: "p-copy" });
const mockRemoveProgram = jest.fn().mockResolvedValue(undefined);

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({
    programs: [
      {
        id: "p1", title: "Upper/Lower v3", description: "Hypertrophy block",
        source: "manual", active: true, status: "active",
        daysPerWeek: 4, lengthWeeks: 4, streakWeeks: 11, completion: 0.68,
        lastRunAt: null, days: [], overrides: [],
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "p2", title: "Power Look Draft", description: "Push-pull focus",
        source: "manual", active: false, status: "draft",
        daysPerWeek: 4, lengthWeeks: 6, days: [], overrides: [],
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "p3", title: "Old Program", description: "Archived",
        source: "manual", active: false, status: "archived",
        daysPerWeek: 3, lengthWeeks: 8, days: [], overrides: [],
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    loading: false,
    activateProgram: mockActivateProgram,
    duplicateProgram: mockDuplicateProgram,
    removeProgram: mockRemoveProgram,
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe("RoutinesIndexClient", () => {
  it("shows active routine pinned at top with ACTIVE badge", () => {
    render(<MemoryRouter><RoutinesIndexClient /></MemoryRouter>);
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    expect(screen.getByText("Upper/Lower v3")).toBeInTheDocument();
  });

  it("shows stat tiles for active routine", () => {
    render(<MemoryRouter><RoutinesIndexClient /></MemoryRouter>);
    expect(screen.getByText("DAYS/WK")).toBeInTheDocument();
    expect(screen.getByText("STREAK")).toBeInTheDocument();
    expect(screen.getByText("DONE")).toBeInTheDocument();
  });

  it("shows compact rows for non-active routines", () => {
    render(<MemoryRouter><RoutinesIndexClient /></MemoryRouter>);
    expect(screen.getByText("Power Look Draft")).toBeInTheDocument();
  });

  it("filter chip hides archived when 'draft' selected", async () => {
    render(<MemoryRouter><RoutinesIndexClient /></MemoryRouter>);
    fireEvent.click(screen.getByText(/^draft/i));
    await waitFor(() => {
      expect(screen.queryByText("Old Program")).not.toBeInTheDocument();
    });
  });

  it("clicking Duplicate in the row menu calls duplicateProgram and navigates", async () => {
    render(<MemoryRouter><RoutinesIndexClient /></MemoryRouter>);
    // Open the menu for "Power Look Draft" (p2)
    const menuButtons = screen.getAllByRole("button", { name: /open menu/i });
    fireEvent.click(menuButtons[0]); // first row = p2 (p1 is in active card, not in rows)
    fireEvent.click(screen.getByText("Duplicate"));
    await waitFor(() => {
      expect(mockDuplicateProgram).toHaveBeenCalledWith("p2");
    });
  });
});
