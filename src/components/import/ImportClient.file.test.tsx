import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ImportClient } from "./ImportClient";
import type { ProgramDocument } from "@/lib/programs/types";
import { getRenderableDays } from "@/lib/programs/overrides";
import { MemoryRouter, useLocation } from "react-router-dom";

const mockSaveProgram = jest.fn().mockResolvedValue(undefined);
const mockAliasSaveMany = jest.fn();
const mockAliasList = jest.fn().mockResolvedValue([]);
const mockUserExerciseList = jest.fn().mockResolvedValue([]);

jest.mock("@/components/app/LocalDataProvider", () => ({
  useLocalData: () => ({ saveProgram: mockSaveProgram }),
}));
jest.mock("@/lib/storage/aliasRepo", () => ({
  aliasRepo: { list: (...args: unknown[]) => mockAliasList(...args), saveMany: (...args: unknown[]) => mockAliasSaveMany(...args) },
}));
jest.mock("@/lib/storage/userExerciseRepo", () => ({
  userExerciseRepo: { list: (...args: unknown[]) => mockUserExerciseList(...args), save: jest.fn() },
}));
jest.mock("react-router-dom", () => ({
  ...jest.requireActual("react-router-dom"),
  useNavigate: () => jest.fn(),
}));

const routineText = JSON.stringify({
  program_name: "Example routine",
  days: [{
    day: 1,
    title: "Upper body",
    sections: [{ type: "strength", name: "Main lifts", groups: [{ type: "single", exercises: [{ name: "Barbell Bench Press", sets: 3, reps: "8", load: "95", unit: "lb" }] }] }],
  }],
});

function selectedFile(text: string, name = "routine.json") {
  return { name, size: Buffer.byteLength(text), text: jest.fn().mockResolvedValue(text) } as unknown as File;
}

function chooseFile(file?: File) {
  fireEvent.change(screen.getByLabelText("Choose JSON file"), { target: { files: file ? [file] : [] } });
}

function RouterLocation() {
  return <output aria-label="Router location">{useLocation().pathname}</output>;
}

describe("ImportClient file input", () => {
  beforeEach(() => {
    mockSaveProgram.mockClear();
    mockAliasSaveMany.mockClear();
    mockAliasList.mockClear().mockResolvedValue([]);
    mockUserExerciseList.mockClear().mockResolvedValue([]);
  });

  it("loads a file without validating or saving, then follows the existing Save path", async () => {
    const user = userEvent.setup();
    render(<ImportClient />);
    chooseFile(selectedFile(routineText));

    const textarea = screen.getByRole("textbox", { name: /routine json/i });
    await waitFor(() => expect(textarea).toHaveValue(routineText));
    expect(await screen.findByRole("status")).toHaveTextContent("routine.json");
    expect(mockSaveProgram).not.toHaveBeenCalled();
    expect(mockAliasSaveMany).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Validate →" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Validate →" }));
    expect(await screen.findByRole("heading", { name: "Confirm import" })).toBeInTheDocument();
    expect(mockSaveProgram).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /Save program/ }));
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
  });

  it("preserves pasted JSON on cancel, oversize, backup, and read failure", async () => {
    render(<MemoryRouter basename="/trAIner" initialEntries={["/trAIner/import"]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><><ImportClient /><RouterLocation /></></MemoryRouter>);
    const textarea = screen.getByRole("textbox", { name: /routine json/i });
    fireEvent.change(textarea, { target: { value: "keep this draft" } });

    chooseFile();
    expect(textarea).toHaveValue("keep this draft");

    chooseFile({ ...selectedFile("large"), size: 5 * 1024 * 1024 + 1 } as File);
    expect(await screen.findByRole("alert")).toHaveTextContent(/5 MB/i);
    expect(textarea).toHaveValue("keep this draft");

    chooseFile(selectedFile('{"programs":[],"logs":[]}'));
    const settingsLink = await screen.findByRole("link", { name: /Settings/i });
    expect(settingsLink).toHaveAttribute("href", "/trAIner/settings");
    await userEvent.setup().click(settingsLink);
    expect(screen.getByLabelText("Router location")).toHaveTextContent("/settings");
    expect(textarea).toHaveValue("keep this draft");
    expect(mockSaveProgram).not.toHaveBeenCalled();

    chooseFile({ name: "broken.json", size: 1, text: jest.fn().mockRejectedValue(new Error("private")) } as unknown as File);
    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be read/i);
    expect(screen.getByRole("alert")).not.toHaveTextContent("private");
    expect(textarea).toHaveValue("keep this draft");
  });

  it("lets a newer file read win and resets the input for same-file selection", async () => {
    let finishFirst!: (text: string) => void;
    const first = { name: "first.json", size: 1, text: jest.fn(() => new Promise<string>((resolve) => { finishFirst = resolve; })) } as unknown as File;
    const second = selectedFile("second text", "second.json");
    render(<ImportClient />);
    const input = screen.getByLabelText("Choose JSON file") as HTMLInputElement;

    chooseFile(first);
    expect(await screen.findByRole("status")).toHaveTextContent(/reading/i);
    expect(screen.getByRole("textbox", { name: /routine json/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Validate →" })).toBeDisabled();
    expect(input.value).toBe("");
    chooseFile(second);
    await waitFor(() => expect(screen.getByRole("textbox", { name: /routine json/i })).toHaveValue("second text"));
    finishFirst("first text");
    await waitFor(() => expect(screen.getByRole("textbox", { name: /routine json/i })).toHaveValue("second text"));

    chooseFile(second);
    await waitFor(() => expect(second.text).toHaveBeenCalledTimes(2));
  });

  it("saves the same prescription from pasted and selected text regardless of filename", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<ImportClient />);
    fireEvent.change(screen.getByPlaceholderText('{ "program_name": "...", "days": [...] }'), { target: { value: routineText } });
    await user.click(screen.getByRole("button", { name: "Validate →" }));
    expect(await screen.findByRole("heading", { name: "Confirm import" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save program/ }));
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    const pasted = mockSaveProgram.mock.calls[0][0] as ProgramDocument;
    unmount();

    mockSaveProgram.mockClear();
    render(<ImportClient />);
    chooseFile(selectedFile(routineText, "different-name.json"));
    await waitFor(() => expect(screen.getByRole("textbox", { name: /routine json/i })).toHaveValue(routineText));
    await user.click(screen.getByRole("button", { name: "Validate →" }));
    expect(await screen.findByRole("heading", { name: "Confirm import" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save program/ }));
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    const selected = mockSaveProgram.mock.calls[0][0] as ProgramDocument;

    const prescription = (program: typeof pasted) => ({
      title: program.title,
      days: program.days.map((day) => ({
        title: day.title,
        sections: day.sections.map((section) => ({
          name: section.name,
          type: section.type,
          groups: section.groups.map((group) => ({
            type: group.type,
            exercises: group.exercises.map(({ name, sets, reps, load, unit }) => ({ name, sets, reps, load, unit })),
          })),
        })),
      })),
    });
    expect(prescription(selected)).toEqual(prescription(pasted));
    expect(selected.id).not.toBe(pasted.id);
  });

  it("keeps parser error guidance source-neutral for a selected file", async () => {
    const user = userEvent.setup();
    render(<ImportClient />);
    chooseFile(selectedFile("{"));
    await waitFor(() => expect(screen.getByText("Loaded routine.json")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Validate →" }));

    const error = await screen.findByText(/ends with 1 unclosed structure/);
    expect(error).toHaveTextContent("provided JSON");
    expect(error).not.toHaveTextContent("pasted");
  });

  it("clears an old parse error after loading and displays the filename as text", async () => {
    const user = userEvent.setup();
    render(<ImportClient />);
    fireEvent.change(screen.getByRole("textbox", { name: /routine json/i }), { target: { value: "{" } });
    await user.click(screen.getByRole("button", { name: "Validate →" }));
    expect(await screen.findByText(/provided JSON ends/)).toBeInTheDocument();

    const filename = '<img src=x onerror="alert(1)">.json';
    chooseFile(selectedFile("not json", filename));
    expect(await screen.findByText(`Loaded ${filename}`)).toBeInTheDocument();
    expect(screen.queryByText(/provided JSON ends/)).not.toBeInTheDocument();
    expect(document.querySelector("img[src='x']")).toBeNull();
  });

  it("passes a file through resolution and review edits before saving", async () => {
    const user = userEvent.setup();
    const backSquatJson = JSON.stringify({
      program_name: "File squat",
      days: [{ day: 1, title: "Lower", sections: [{ type: "strength", name: "Main", groups: [{ type: "single", exercises: [{ name: "Back Squat", sets: 3, reps: "5" }] }] }] }],
    });
    render(<ImportClient />);
    chooseFile(selectedFile(backSquatJson));
    await waitFor(() => expect(screen.getByRole("textbox", { name: /routine json/i })).toHaveValue(backSquatJson));
    await user.click(screen.getByRole("button", { name: "Validate →" }));
    await user.selectOptions(await screen.findByLabelText("Choose version for Back Squat"), "barbell-high-bar-squat");
    await user.click(screen.getByRole("button", { name: /review import/i }));
    await user.click(await screen.findByRole("button", { name: /^Select Lower/ }));
    const sets = await screen.findByLabelText("Sets");
    expect(sets).toHaveValue(3);
    fireEvent.change(sets, { target: { value: "5" } });
    fireEvent.blur(sets);
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply edit" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Apply edit" }));
    await user.click(screen.getByRole("button", { name: "Done editing" }));
    await user.click(screen.getByRole("button", { name: /Save program/ }));

    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    const saved = mockSaveProgram.mock.calls[0][0] as ProgramDocument;
    const exercise = getRenderableDays(saved)[0].sections[0].groups[0].exercises[0];
    expect(exercise).toMatchObject({ canonicalExerciseId: "barbell-high-bar-squat", sets: 5 });
  });

  it("reuses the saved program ID when the same file contents are retried", async () => {
    const user = userEvent.setup();
    render(<ImportClient />);
    const file = selectedFile(routineText);
    chooseFile(file);
    await waitFor(() => expect(screen.getByRole("textbox", { name: /routine json/i })).toHaveValue(routineText));
    await user.click(screen.getByRole("button", { name: "Validate →" }));
    await user.click(screen.getByRole("button", { name: /Save program/ }));
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(1));
    const firstId = (mockSaveProgram.mock.calls[0][0] as ProgramDocument).id;

    await user.click(screen.getByRole("button", { name: /Back/ }));
    chooseFile(selectedFile(routineText, "renamed.json"));
    await user.click(screen.getByRole("button", { name: "Validate →" }));
    await user.click(screen.getByRole("button", { name: /Save program/ }));
    await waitFor(() => expect(mockSaveProgram).toHaveBeenCalledTimes(2));
    expect((mockSaveProgram.mock.calls[1][0] as ProgramDocument).id).toBe(firstId);
  });
});
