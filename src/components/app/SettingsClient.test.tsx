import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SettingsClient } from "./SettingsClient";

jest.mock("@/lib/backup/backup", () => ({
  exportBackup: jest.fn().mockResolvedValue({ exportedAt: "2026-05-06T00:00:00.000Z", programs: [], logs: [], aliases: [] }),
  restoreBackup: jest.fn().mockResolvedValue(undefined),
  resetWorkspace: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/storage/backupRepo", () => ({
  backupRepo: { save: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@/lib/workspace/stats", () => ({
  loadWorkspaceStats: jest.fn().mockResolvedValue({
    profile: 1, programs: 2, logs: 5, aliases: 3, snapshots: 0,
    sizeKB: 42, lastSnapshotAt: null,
  }),
}));

jest.mock("@/components/app/ThemeProvider", () => ({
  setTheme: jest.fn(),
  setDensity: jest.fn(),
  setMono: jest.fn(),
}));

describe("SettingsClient — reset workspace", () => {
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
  });

  it("collapses the panel when Cancel is clicked", () => {
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /reset workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("button", { name: /yes, wipe everything/i })).not.toBeInTheDocument();
  });

  it("calls resetWorkspace when the confirm button is clicked", async () => {
    const { resetWorkspace } = require("@/lib/backup/backup");
    const reloadMock = jest.fn();
    Object.defineProperty(window, "location", { value: { reload: reloadMock }, writable: true });

    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /reset workspace/i }));
    fireEvent.click(screen.getByRole("button", { name: /yes, wipe everything/i }));

    await waitFor(() => {
      expect(resetWorkspace).toHaveBeenCalled();
    });
  });
});
