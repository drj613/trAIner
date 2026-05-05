import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ProgramDocument } from "@/lib/programs/types";
import { emptyTags } from "@/lib/programs/types";

jest.mock("@/lib/storage/programRepo", () => ({
  programRepo: {
    get: jest.fn(),
  },
}));

import { programRepo } from "@/lib/storage/programRepo";
import { ProgramMapClient } from "./ProgramMapClient";

const mockProgramRepo = programRepo as jest.Mocked<typeof programRepo>;

const mockProgram: ProgramDocument = {
  id: "prog-1",
  title: "Test Program",
  active: true,
  source: "manual",
  overrides: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  days: [
    {
      id: "day-1",
      dayNumber: 1,
      weekNumber: 1,
      title: "Day 1",
      sections: [
        {
          id: "sec-1",
          type: "strength",
          name: "Strength",
          groups: [
            {
              id: "grp-1",
              type: "single",
              exercises: [
                { id: "ex-1", name: "Squat", sets: 3, tags: emptyTags() },
              ],
            },
          ],
        },
      ],
    },
    {
      id: "day-2",
      dayNumber: 2,
      weekNumber: 1,
      title: "Rest Day",
      sections: [],
    },
  ],
};

describe("ProgramMapClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockProgramRepo.get.mockReturnValue(new Promise(() => {}));
    render(<MemoryRouter><ProgramMapClient programId="prog-1" /></MemoryRouter>);
    expect(screen.getByText(/loading program map/i)).toBeInTheDocument();
  });

  it("renders program title and week grid when loaded", async () => {
    mockProgramRepo.get.mockResolvedValue(mockProgram);
    render(<MemoryRouter><ProgramMapClient programId="prog-1" /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText("Test Program")).toBeInTheDocument();
    });
    expect(screen.getByText("Week 1")).toBeInTheDocument();
    expect(screen.getByText("Day 1")).toBeInTheDocument();
  });

  it("shows rest label for days with no sections", async () => {
    mockProgramRepo.get.mockResolvedValue(mockProgram);
    render(<MemoryRouter><ProgramMapClient programId="prog-1" /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/^rest$/i)).toBeInTheDocument();
    });
  });

  it("shows error state when programRepo throws", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    mockProgramRepo.get.mockRejectedValue(new Error("DB error"));
    render(<MemoryRouter><ProgramMapClient programId="prog-1" /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/failed to load program/i)).toBeInTheDocument();
    });
  });

  it("shows not found state when program is undefined", async () => {
    mockProgramRepo.get.mockResolvedValue(undefined);
    render(<MemoryRouter><ProgramMapClient programId="prog-1" /></MemoryRouter>);
    await waitFor(() => {
      expect(screen.getByText(/program not found/i)).toBeInTheDocument();
    });
  });

  it("renders accessible links for non-rest days", async () => {
    mockProgramRepo.get.mockResolvedValue(mockProgram);
    render(<MemoryRouter><ProgramMapClient programId="prog-1" /></MemoryRouter>);
    await waitFor(() => {
      const link = screen.getByRole("link", { name: /Go to Day 1/i });
      expect(link).toBeInTheDocument();
    });
  });
});
