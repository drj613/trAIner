import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SettingsClient } from "./SettingsClient";
import { resetWorkspace } from "@/lib/backup/backup";
import { backupRepo } from "@/lib/storage/backupRepo";
import { getPersistenceState } from "@/lib/storage/persistence";

jest.mock("@/lib/backup/backup", () => ({
  exportBackup: jest.fn().mockResolvedValue({ exportedAt: "2026-05-06T00:00:00.000Z", programs: [], logs: [], aliases: [] }),
  restoreBackup: jest.fn().mockResolvedValue(undefined),
  resetWorkspace: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/storage/backupRepo", () => ({
  backupRepo: {
    save: jest.fn().mockResolvedValue(undefined),
    list: jest.fn().mockResolvedValue([]),
    delete: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock("@/lib/workspace/stats", () => ({
  loadWorkspaceStats: jest.fn().mockResolvedValue({
    profile: 1, programs: 2, logs: 5, aliases: 3, snapshots: 0,
    sizeKB: 42, snapshotKB: 0, lastSnapshotAt: null,
  }),
}));

jest.mock("@/components/app/ThemeProvider", () => ({
  setTheme: jest.fn(),
  setDensity: jest.fn(),
  setMono: jest.fn(),
}));

jest.mock("@/lib/storage/persistence", () => ({
  getPersistenceState: jest.fn().mockResolvedValue("persisted"),
  requestPersistence: jest.fn().mockResolvedValue("persisted"),
}));

describe("SettingsClient — reset workspace", () => {
  let originalLocation: typeof window.location;

  beforeEach(() => {
    originalLocation = window.location;
  });

  afterEach(() => {
    Object.defineProperty(window, "location", { value: originalLocation, writable: true });
  });

  it("shows the reset button but not the confirmation panel by default", () => {
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    expect(screen.getByRole("button", { name: /reset workspace/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /yes, wipe everything/i })).not.toBeInTheDocument();
  });

  it("reveals confirmation panel on first click without wiping", () => {
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /reset workspace/i }));
    expect(screen.getByRole("button", { name: /yes, wipe everything/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(resetWorkspace).not.toHaveBeenCalled();
  });

  it("collapses the panel when Cancel is clicked", () => {
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /reset workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("button", { name: /yes, wipe everything/i })).not.toBeInTheDocument();
  });

  it("calls resetWorkspace when the confirm button is clicked", async () => {
    const reloadMock = jest.fn();
    Object.defineProperty(window, "location", { value: { reload: reloadMock }, writable: true });

    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /reset workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, wipe everything/i }));

    await waitFor(() => {
      expect(resetWorkspace).toHaveBeenCalled();
      expect(reloadMock).toHaveBeenCalled();
    });
  });
});

describe("SettingsClient — storage persistence", () => {
  it("shows storage protection state", async () => {
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    expect(await screen.findByText(/^protected$/)).toBeInTheDocument();
  });

  it("shows evictable state with a Request protection button when denied", async () => {
    (getPersistenceState as jest.Mock).mockResolvedValueOnce("denied");
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    expect(await screen.findByText(/^evictable$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /request protection/i })).toBeInTheDocument();
  });

  it("shows unprotected state with no button when unsupported", async () => {
    (getPersistenceState as jest.Mock).mockResolvedValueOnce("unsupported");
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    expect(await screen.findByText(/^unprotected$/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /request protection/i })).not.toBeInTheDocument();
  });
});

describe("SettingsClient — snapshot labeling and deletion", () => {
  it("labels snapshots as undo points, not backups", async () => {
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    expect(await screen.findByText(/undo point/i)).toBeInTheDocument();
    expect(screen.getByText(/not a backup/i)).toBeInTheDocument();
  });

  it("deletes a snapshot from the list", async () => {
    (backupRepo.list as jest.Mock)
      .mockResolvedValueOnce([{ id: "2026-08-01T00:00:00.000Z" }])
      .mockResolvedValue([]);
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    expect(await screen.findByText("2026-08-01 00:00")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /delete/i }));
    await waitFor(() => expect(backupRepo.delete).toHaveBeenCalledWith("2026-08-01T00:00:00.000Z"));
    // The observable behaviour a user cares about: the row is actually gone
    // from the list after the refresh that follows delete, not just that
    // the mock was called.
    await waitFor(() => expect(screen.queryByText("2026-08-01 00:00")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });
});
