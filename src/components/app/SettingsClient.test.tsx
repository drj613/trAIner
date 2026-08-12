import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { SettingsClient } from "./SettingsClient";
import { exportBackup, restoreBackup, resetWorkspace } from "@/lib/backup/backup";
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
    listIds: jest.fn().mockResolvedValue([]),
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

  // resetWorkspace's onblocked can't cancel the pending deleteDatabase call
  // (IndexedDB gives no cancellation API), so a blocked reset is NOT a
  // failure — it's still in flight and will complete on its own once other
  // tabs close. The UI must say that truthfully, not show an error, and
  // must not let the user re-arm the confirm button to fire a second
  // deleteDatabase request.
  it("shows a waiting message (not an error) when the reset is blocked, and keeps the confirm button disabled", async () => {
    let capturedOnBlocked: (() => void) | undefined;
    (resetWorkspace as jest.Mock).mockImplementation((onBlocked?: () => void) => {
      capturedOnBlocked = onBlocked;
      return new Promise<void>(() => {}); // stays pending for this test
    });

    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /reset workspace/i }));
    const confirmButton = screen.getByRole("button", { name: /yes, wipe everything/i });
    fireEvent.click(confirmButton);

    await waitFor(() => expect(capturedOnBlocked).toBeDefined());
    act(() => capturedOnBlocked!());

    expect(
      await screen.findByText(/waiting for other trAIner tabs to close/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/reset failed/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/^blocked/i)).not.toBeInTheDocument();
    expect(confirmButton).toBeDisabled();
  });

  // A Cancel button that stays clickable during an uncancellable pending
  // deletion implies it can cancel it. It can't — deleteDatabase has no
  // cancellation API — so clicking Cancel would just hide the panel and
  // the waiting message while the wipe still happens in the background.
  // Disable it for the whole in-flight/blocked window, same as Confirm.
  it("disables Cancel while a reset is pending, and keeps it disabled once blocked", async () => {
    let capturedOnBlocked: (() => void) | undefined;
    (resetWorkspace as jest.Mock).mockImplementation((onBlocked?: () => void) => {
      capturedOnBlocked = onBlocked;
      return new Promise<void>(() => {}); // stays pending for this test
    });

    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /reset workspace/i }));
    const cancelButton = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(screen.getByRole("button", { name: /yes, wipe everything/i }));

    // Pending, not yet blocked: still must not be cancellable.
    await waitFor(() => expect(cancelButton).toBeDisabled());

    await waitFor(() => expect(capturedOnBlocked).toBeDefined());
    act(() => capturedOnBlocked!());

    // Blocked: still must not be cancellable.
    expect(await screen.findByText(/waiting for other trAIner tabs to close/i)).toBeInTheDocument();
    expect(cancelButton).toBeDisabled();
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

  it("a single click arms the delete button but does not delete", async () => {
    (backupRepo.listIds as jest.Mock).mockResolvedValue(["2026-08-01T00:00:00.000Z"]);
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    expect(await screen.findByText("2026-08-01 00:00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^delete snapshot/i }));

    expect(backupRepo.delete).not.toHaveBeenCalled();
    // Armed state relabels the same row so a second click means "confirm".
    expect(await screen.findByRole("button", { name: /^confirm delete snapshot/i })).toBeInTheDocument();
    expect(screen.getByText("2026-08-01 00:00")).toBeInTheDocument();
  });

  it("deletes a snapshot from the list on the second (confirm) click", async () => {
    (backupRepo.listIds as jest.Mock)
      .mockResolvedValueOnce(["2026-08-01T00:00:00.000Z"])
      .mockResolvedValue([]);
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    expect(await screen.findByText("2026-08-01 00:00")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^delete snapshot/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^confirm delete snapshot/i }));

    await waitFor(() => expect(backupRepo.delete).toHaveBeenCalledWith("2026-08-01T00:00:00.000Z"));
    // The observable behaviour a user cares about: the row is actually gone
    // from the list after the refresh that follows delete, not just that
    // the mock was called.
    await waitFor(() => expect(screen.queryByText("2026-08-01 00:00")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("gives each snapshot row's delete button a distinct accessible name", async () => {
    (backupRepo.listIds as jest.Mock).mockResolvedValue([
      "2026-08-01T00:00:00.000Z",
      "2026-08-02T00:00:00.000Z",
    ]);
    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "delete snapshot 2026-08-01T00:00:00.000Z" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "delete snapshot 2026-08-02T00:00:00.000Z" })).toBeInTheDocument();
  });

  it("disables the snapshot button while saving so a rapid double-click can't create two snapshots with the same id", async () => {
    let resolveExport!: (v: unknown) => void;
    (exportBackup as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => { resolveExport = resolve; }),
    );

    render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    const button = await screen.findByRole("button", { name: /snapshot \(undo point\)/i });
    await userEvent.click(button);

    expect(await screen.findByRole("button", { name: /saving/i })).toBeDisabled();

    resolveExport({ exportedAt: "2026-08-03T00:00:00.000Z", programs: [], logs: [], aliases: [] });
    await waitFor(() => expect(backupRepo.save).toHaveBeenCalledTimes(1));
  });
});

describe("import flow", () => {
  const calls: string[] = [];
  beforeEach(() => {
    calls.length = 0;
    jest.spyOn(window, "confirm").mockReturnValue(true);
    window.URL.createObjectURL = jest.fn().mockReturnValue("blob:x");
    window.URL.revokeObjectURL = jest.fn();
    // Capture the anchor's `download` attribute, not just that a click
    // happened — a regression that downloads the plain (non-pre-restore)
    // export here would still produce a "click" but with the wrong filename.
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      calls.push(`download:${this.download}`);
    });
    (exportBackup as jest.Mock).mockReset().mockResolvedValue({ exportedAt: "2026-08-10T00:00:00.000Z" });
    (restoreBackup as jest.Mock).mockReset().mockImplementation(async () => { calls.push("restore"); });
  });
  afterEach(() => jest.restoreAllMocks());

  async function importFile() {
    const { container } = render(<MemoryRouter><SettingsClient /></MemoryRouter>);
    const input = container.querySelector('input[type="file"]')!;
    const payload = JSON.stringify({ version: 1, programs: [], logs: [], aliases: [] });
    const file = new File([payload], "b.json", { type: "application/json" });
    // jsdom 20 (this repo's jest-environment-jsdom) does NOT implement
    // File.prototype.text — without this stub, handleImport's JSON.parse
    // throws, the catch swallows it, and the test fails in a way that looks
    // like a production ordering bug. Stub it explicitly.
    Object.defineProperty(file, "text", { value: async () => payload });
    await userEvent.upload(input as HTMLInputElement, file);
  }

  it("downloads a pre-restore backup (not the plain export) before restoring", async () => {
    await importFile();
    await waitFor(() =>
      expect(calls).toEqual(["download:trAIner-pre-restore-2026-08-10.json", "restore"]),
    );
  });

  it("does not restore when the pre-restore export fails, and shows the export-failure message specifically", async () => {
    (exportBackup as jest.Mock).mockRejectedValue(new Error("boom"));
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => undefined);
    await importFile();
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Could not create a safety backup first, so nothing was changed."),
    );
    expect(restoreBackup).not.toHaveBeenCalled();
  });
});
