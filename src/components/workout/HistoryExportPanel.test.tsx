import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ExerciseIdentityContext } from "@/lib/catalog/identity";
import type { WorkoutLogDocument, ProgramDocument } from "@/lib/programs/types";
import { buildHistoryExport } from "@/lib/workout/historyExport";
import { HistoryExportPanel } from "./HistoryExportPanel";

const context = {
  catalogById: new Map(), movementsById: new Map(), modifiersById: new Map(),
  redirects: new Map(), disambiguations: new Map(), aliases: [], userExercises: [],
  normalizationOverrides: [],
} as ExerciseIdentityContext;

const routine = {
  id: "p1", title: "Routine", source: "manual", active: true, days: [], overrides: [],
  createdAt: "2026-01-01", updatedAt: "2026-01-01",
} as ProgramDocument;

const loggedWorkout = {
  id: "l1", programId: "p1", dayId: "d1", performedAt: "2026-10-21T12:00:00.000Z",
  performedDate: "2026-10-21", completedAt: "2026-10-21T12:00:00.000Z",
  entries: [{ exerciseId: "e1", exerciseName: "Bench Press", sets: [{ setNumber: 1, weight: 185, reps: 8 }] }],
} as WorkoutLogDocument;

const props = {
  logs: [loggedWorkout], programs: [routine], context,
  onClose: jest.fn(),
};

afterEach(() => {
  jest.restoreAllMocks();
  props.onClose.mockClear();
});

describe("HistoryExportPanel", () => {
  it("offers all routines and a selected routine with inclusive date controls", async () => {
    const user = userEvent.setup();
    render(<HistoryExportPanel {...props} />);

    expect(screen.getByLabelText("Routine")).toHaveValue("");
    expect(screen.getByRole("option", { name: "All routines" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Routine" })).toBeInTheDocument();
    expect(screen.getByLabelText("From")).toHaveValue("");
    expect(screen.getByLabelText("Through")).toHaveValue("");
    const allResult = buildHistoryExport({ logs: props.logs, programs: props.programs, context, selection: { routine: { kind: "all" } } });
    if (!allResult.ok) throw new Error("fixture should export");
    expect(screen.getByLabelText("Export preview")).toHaveValue(allResult.text);

    await user.selectOptions(screen.getByLabelText("Routine"), "p1");
    await user.type(screen.getByLabelText("From"), "2026-10-21");
    expect((screen.getByLabelText("Export preview") as HTMLTextAreaElement).value).toContain('routine:"Routine"');
  });

  it("reports invalid ranges and disables delivery without discarding the preview", async () => {
    const user = userEvent.setup();
    render(<HistoryExportPanel {...props} />);
    const preview = screen.getByLabelText("Export preview");
    const original = (preview as HTMLTextAreaElement).value;

    await user.type(screen.getByLabelText("From"), "2026-10-22");
    const validRangePreview = (preview as HTMLTextAreaElement).value;
    await user.type(screen.getByLabelText("Through"), "2026-10-21");

    expect(screen.getByRole("alert")).toHaveTextContent(/on or after/i);
    expect(preview).toHaveValue(validRangePreview);
    expect(validRangePreview).not.toBe(original);
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download .txt" })).toBeDisabled();
  });

  it("copies the preview verbatim and announces success only after clipboard success", async () => {
    const user = userEvent.setup();
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<HistoryExportPanel {...props} />);
    const preview = screen.getByLabelText("Export preview") as HTMLTextAreaElement;

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(writeText).toHaveBeenCalledWith(preview.value);
    expect(await screen.findByRole("status")).toHaveTextContent("Copied");
  });

  it("clears the copied claim when the selection changes", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: jest.fn().mockResolvedValue(undefined) } });
    render(<HistoryExportPanel {...props} programs={[routine, { ...routine, id: "p2", title: "Other" }]} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Copied");
    await user.selectOptions(screen.getByLabelText("Routine"), "p2");

    expect(screen.getByRole("status")).not.toHaveTextContent("Copied");
  });

  it("does not claim a stale pending copy when the selection changes", async () => {
    const user = userEvent.setup();
    let resolveCopy: (() => void) | undefined;
    const writeText = jest.fn(() => new Promise<void>((resolve) => { resolveCopy = resolve; }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    render(<HistoryExportPanel {...props} programs={[routine, { ...routine, id: "p2", title: "Other" }]} />);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledTimes(1);
    await user.selectOptions(screen.getByLabelText("Routine"), "p2");
    resolveCopy?.();

    await waitFor(() => expect(screen.getByRole("status")).not.toHaveTextContent("Copied"));
  });

  it("keeps the preview after clipboard rejection", async () => {
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
    });
    render(<HistoryExportPanel {...props} />);
    const preview = screen.getByLabelText("Export preview") as HTMLTextAreaElement;
    const original = preview.value;

    await user.click(screen.getByRole("button", { name: "Copy" }));

    expect(preview).toHaveValue(original);
    expect(screen.getByRole("alert")).toHaveTextContent(/copy/i);
    expect(screen.queryByRole("status")).not.toHaveTextContent("Copied");
  });

  it("downloads the exact preview as UTF-8 text and revokes its object URL", async () => {
    const createObjectURL = jest.fn().mockReturnValue("blob:history-export");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    const clickedFileNames: string[] = [];
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clickedFileNames.push(this.download);
    });
    const user = userEvent.setup();
    render(<HistoryExportPanel {...props} />);
    const preview = screen.getByLabelText("Export preview") as HTMLTextAreaElement;
    const expected = buildHistoryExport({ logs: props.logs, programs: props.programs, context, selection: { routine: { kind: "all" } } });
    if (!expected.ok) throw new Error("fixture should export");

    await user.click(screen.getByRole("button", { name: "Download .txt" }));

    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("text/plain;charset=utf-8");
    const blobText = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(blob);
    });
    expect(blobText).toBe(preview.value);
    expect(preview.value).toBe(expected.text);
    expect(click).toHaveBeenCalled();
    expect(clickedFileNames).toEqual([expected.fileName]);
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:history-export"));
    expect(document.querySelector("a[download]")).not.toBeInTheDocument();
  });

  it("revokes the object URL when initiating the download throws", async () => {
    const createObjectURL = jest.fn().mockReturnValue("blob:failed-export");
    const revokeObjectURL = jest.fn();
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: revokeObjectURL });
    jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => { throw new Error("download blocked"); });
    const user = userEvent.setup();
    render(<HistoryExportPanel {...props} />);

    await user.click(screen.getByRole("button", { name: "Download .txt" }));

    expect(screen.getByRole("alert")).toHaveTextContent(/could not download/i);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:failed-export");
  });

  it("disables empty output but keeps warning-only output exportable", () => {
    const empty = render(<HistoryExportPanel {...props} logs={[]} />);
    expect((screen.getByLabelText("Export preview") as HTMLTextAreaElement).value).toContain("No workouts in this range");
    expect(screen.getByRole("button", { name: "Copy" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download .txt" })).toBeDisabled();
    empty.unmount();

    const corruptLog = { ...loggedWorkout, entries: "corrupt" } as unknown as WorkoutLogDocument;
    render(<HistoryExportPanel {...props} logs={[corruptLog]} />);
    expect((screen.getByLabelText("Export preview") as HTMLTextAreaElement).value).toContain("!unreadable");
    expect(screen.getByRole("button", { name: "Copy" })).toBeEnabled();
  });

  it("closes the inline panel", async () => {
    const user = userEvent.setup();
    render(<HistoryExportPanel {...props} />);
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalledTimes(1);
  });
});
