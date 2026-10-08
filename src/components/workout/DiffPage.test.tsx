import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DiffPage } from "./DiffPage";
import { storePendingDiff, loadPendingDiff } from "@/lib/workout/pendingDiff";
import { emptyTags, type ProgramDay, type ProgramDocument } from "@/lib/programs/types";

const replacement = (sets: number): ProgramDay => ({
  id: "day-1", dayNumber: 1, weekNumber: 2, title: "Lower B",
  sections: [{ id: "section-1", name: "Strength", type: "strength", groups: [{
    id: "group-1", type: "single", exercises: [{ id: "exercise-1", name: "Squat", sets, reps: "5", tags: emptyTags() }],
  }] }],
});
const program: ProgramDocument = {
  id: "program-1", title: "Routine", source: "manual", active: true,
  days: [replacement(3)], overrides: [], createdAt: "", updatedAt: "",
};

const mockProgramRepo = { get: jest.fn(async () => program) };
const mockLogRepo = { listForProgram: jest.fn(async () => []) };
const mockCommit = jest.fn();
jest.mock("@/lib/storage/programRepo", () => ({ programRepo: { get: () => mockProgramRepo.get() } }));
jest.mock("@/lib/storage/logRepo", () => ({ logRepo: { listForProgram: () => mockLogRepo.listForProgram() } }));
jest.mock("@/components/app/LocalDataProvider", () => ({ useLocalData: () => ({ commitProgramEdit: (...args: unknown[]) => mockCommit(...args) }) }));

function renderPage() {
  return render(<MemoryRouter initialEntries={["/programs/program-1/diff"]}>
    <Routes><Route path="/programs/:id/diff" element={<DiffPage />} /></Routes>
  </MemoryRouter>);
}

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
  mockProgramRepo.get.mockResolvedValue(program);
  mockLogRepo.listForProgram.mockResolvedValue([]);
});

describe("DiffPage", () => {
  it("requires a new choice for legacy week scope and commits the shared preview after selection", async () => {
    storePendingDiff("program-1", replacement(3), replacement(4), "week", 2);
    mockCommit.mockResolvedValue({ status: "saved", program });
    renderPage();
    const apply = await screen.findByRole("button", { name: /apply changes/i });
    expect(screen.getByRole("radio", { name: "This occurrence" })).not.toBeChecked();
    expect(apply).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "This occurrence" }));
    expect(await screen.findByRole("heading", { name: "Review edit" })).toBeInTheDocument();
    fireEvent.click(apply);
    await waitFor(() => expect(mockCommit).toHaveBeenCalledWith(expect.objectContaining({ context: expect.objectContaining({ scope: "occurrence" }) })));
    await waitFor(() => expect(loadPendingDiff()).toBeNull());
  });

  it("keeps the preview and enables retry after a persistence failure", async () => {
    storePendingDiff("program-1", replacement(3), replacement(4));
    mockCommit.mockRejectedValueOnce(new Error("storage unavailable"));
    renderPage();
    const apply = await screen.findByRole("button", { name: /apply changes/i });
    fireEvent.click(apply);
    expect(await screen.findByText(/failed to save changes/i)).toBeInTheDocument();
    await waitFor(() => expect(apply).toBeEnabled());
    expect(loadPendingDiff()).not.toBeNull();
  });

  it("refreshes a stale preview against the latest routine before retry", async () => {
    storePendingDiff("program-1", replacement(3), replacement(4));
    const latest = { ...program, updatedAt: "fresh" };
    mockProgramRepo.get.mockResolvedValueOnce(program).mockResolvedValueOnce(latest);
    mockCommit.mockImplementationOnce(async (preview) => ({ status: "stale", preview }));
    mockCommit.mockResolvedValueOnce({ status: "saved", program: latest });
    renderPage();
    const apply = await screen.findByRole("button", { name: /apply changes/i });
    fireEvent.click(apply);
    expect(await screen.findByText(/preview has been refreshed/i)).toBeInTheDocument();
    fireEvent.click(apply);
    await waitFor(() => expect(mockCommit).toHaveBeenCalledTimes(2));
    expect(mockCommit.mock.calls[1][0].sourceRevision).toBe(JSON.stringify(latest));
  });
});
