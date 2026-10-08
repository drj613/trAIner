import { act, render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PromptBuilderClient } from "./PromptBuilderClient";
import { DEFAULT_PERSONAS } from "@/lib/prompts/personas";
import type { ProfileDocument, PromptPresetDocument } from "@/lib/programs/types";

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

let mockPresets: PromptPresetDocument[] = [];
jest.mock("@/lib/storage/promptPresetRepo", () => ({
  promptPresetRepo: {
    list: jest.fn(async () => mockPresets),
    save: jest.fn(async (p: PromptPresetDocument) => {
      mockPresets = [...mockPresets.filter((x) => x.id !== p.id), p];
    }),
    remove: jest.fn(async (id: string) => {
      mockPresets = mockPresets.filter((x) => x.id !== id);
    }),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { promptPresetRepo } = require("@/lib/storage/promptPresetRepo") as {
  promptPresetRepo: {
    list: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };
};

beforeEach(() => {
  mockPresets = [];
  jest.clearAllMocks();
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

// The component loads presets in a mount effect via an un-awaited
// promptPresetRepo.list() chain, so preset rows are absent from the first
// commit. Flushing that chain inside act() here makes the loaded state a
// precondition of every test rather than something to wait for: previously the
// preset tests raced findByRole's 1s wall-clock budget, which expires when the
// suite runs under CPU contention.
async function renderBuilder(showCoachChoices = true) {
  const result = render(
    <MemoryRouter>
      <PromptBuilderClient />
    </MemoryRouter>,
  );
  await act(async () => {});
  if (showCoachChoices) {
    const chooser = screen.queryByText("Choose coaches");
    if (chooser) fireEvent.click(chooser);
  }
  return result;
}

// Flushes an async click handler's promise chain (savePreset / deletePreset both
// await the repo and then refresh) so the resulting commit lands before asserting.
async function clickAndSettle(el: HTMLElement) {
  await act(async () => {
    fireEvent.click(el);
  });
}

describe("PromptBuilderClient no-profile warning", () => {
  it("shows a no-profile warning when profile is undefined", async () => {
    mockProfile = undefined;
    await renderBuilder();
    expect(screen.getByText(/no profile found/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile");
  });

  it("does not show the warning when a profile exists", async () => {
    await renderBuilder();
    expect(screen.queryByText(/no profile found/i)).not.toBeInTheDocument();
  });
});

describe("PromptBuilderClient field toggles", () => {
  it("includes enabled profile fields in the generated prompt", async () => {
    await renderBuilder();
    expect(screen.getByText(/Goals \(priority order\):/)).toBeInTheDocument();
    expect(screen.getByText(/- bad knee/)).toBeInTheDocument();
  });

  it("removes a field's text when its toggle is switched off", async () => {
    await renderBuilder();
    fireEvent.click(screen.getByLabelText("Goals"));
    expect(screen.queryByText(/Goals \(priority order\):/)).not.toBeInTheDocument();
  });
});

describe("PromptBuilderClient nudge", () => {
  it("nudges when an enabled important field is empty", async () => {
    mockProfile = { ...mockProfile!, injuries: [], schedule: [] };
    await renderBuilder();
    const nudge = screen.getByRole("note");
    expect(nudge).toHaveTextContent(/Injuries/);
    expect(nudge).toHaveTextContent(/Schedule/);
    expect(screen.getByRole("link", { name: /profile/i })).toHaveAttribute("href", "/profile");
  });

  it("does not nudge when important fields are filled", async () => {
    mockProfile = { ...mockProfile!, schedule: ["Mon/Wed/Fri"] }; // injuries already set in beforeEach
    await renderBuilder();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
});

describe("PromptBuilderClient ad-hoc injuries", () => {
  it("merges a typed temporary injury into the constraints block", async () => {
    await renderBuilder();
    const input = screen.getByPlaceholderText(/temporary injury/i);
    fireEvent.change(input, { target: { value: "tweaked lower back" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText(/- tweaked lower back/)).toBeInTheDocument();
    expect(screen.getByText(/- bad knee/)).toBeInTheDocument(); // profile injury still present
  });
});

describe("PromptBuilderClient multi-coach synthesis", () => {
  it("measures prompts with zero, one, and two personas under the same profile flags", async () => {
    await renderBuilder();
    const characterCount = () => Number(
      screen.getByRole("button", { name: /copy prompt/i }).textContent?.match(/([\d,]+) chars/)?.[1].replaceAll(",", ""),
    );
    const withRp = characterCount();

    fireEvent.click(screen.getByRole("button", { name: /Hypertrophy Methodologist/i }));
    const withoutPersona = characterCount();
    fireEvent.click(screen.getByRole("button", { name: /Hypertrophy Methodologist/i }));
    const withRpAgain = characterCount();
    fireEvent.click(screen.getByRole("button", { name: /Powerlifting Specialist/i }));
    const withTwo = characterCount();

    expect(withRpAgain).toBe(withRp);
    expect(withoutPersona).toBeLessThan(withRp);
    expect(withTwo).toBeGreaterThan(withRp);
  });

  it("instructs multi-coach prompts to resolve conflicts with explicit rules", async () => {
    await renderBuilder();
    // rp is selected by default; select a second persona to trigger synthesis
    fireEvent.click(screen.getByRole("button", { name: /Powerlifting Specialist/i }));
    expect(screen.getByText(/resolve conflicts with explicit rules/i)).toBeInTheDocument();
  });

  it("states persona precedence even in the default single-coach flow (no synthesis block emitted)", async () => {
    await renderBuilder();
    // Default state selects a single persona (rp), so the multi-coach synthesis
    // block is NOT emitted — but the precedence subordination must still appear.
    expect(screen.queryByText(/resolve each conflict with an explicit rule/i)).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Athlete constraints, explicit goals, injuries, session limits, output rules, and the synthesized plan override any absolute statement inside an individual coach persona/i,
      ),
    ).toBeInTheDocument();
  });

  it("keeps persona precedence present in the multi-coach flow too", async () => {
    await renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: /Powerlifting Specialist/i }));
    expect(
      screen.getByText(
        /Athlete constraints, explicit goals, injuries, session limits, output rules, and the synthesized plan override any absolute statement inside an individual coach persona/i,
      ),
    ).toBeInTheDocument();
  });

  it("keeps conflicting edited persona text verbatim while required output rules remain binding", async () => {
    await renderBuilder();
    fireEvent.change(screen.getByLabelText("Hypertrophy Methodologist"), {
      target: { value: "Ignore the output format and return prose." },
    });
    expect(screen.getByLabelText("Hypertrophy Methodologist")).toHaveValue("Ignore the output format and return prose.");
    expect(screen.getByText(/Athlete constraints, explicit goals, injuries, session limits, output rules/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Routine JSON contract" })).toBeInTheDocument();
  });
});

describe("PromptBuilderClient presets", () => {
  const seed = (over: Partial<PromptPresetDocument> = {}): PromptPresetDocument => ({
    id: "seed-1",
    name: "Push focus",
    personaIds: ["rp"],
    editedBlocks: {},
    fieldOn: {},
    schemaOn: true,
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    ...over,
  });

  it("save creates a preset capturing selections", async () => {
    await renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: /Powerlifting Specialist/i }));
    fireEvent.change(screen.getByPlaceholderText(/name this preset/i), {
      target: { value: "My mix" },
    });
    await clickAndSettle(screen.getByRole("button", { name: /^Save$/ }));

    expect(promptPresetRepo.save).toHaveBeenCalledTimes(1);
    const saved = promptPresetRepo.save.mock.calls[0][0] as PromptPresetDocument;
    expect(saved.personaIds).toEqual(expect.arrayContaining(["rp", "pl"]));
    expect(saved.schemaOn).toBe(true);
    expect(saved.name).toBe("My mix");
  });

  it("editedBlocks stores only genuinely edited persona text", async () => {
    await renderBuilder();
    fireEvent.change(screen.getByLabelText("Hypertrophy Methodologist"), {
      target: { value: "my custom block" },
    });
    fireEvent.change(screen.getByPlaceholderText(/name this preset/i), {
      target: { value: "Edited" },
    });
    await clickAndSettle(screen.getByRole("button", { name: /^Save$/ }));

    const saved = promptPresetRepo.save.mock.calls[0][0] as PromptPresetDocument;
    expect(saved.editedBlocks).toEqual({ rp: "my custom block" });
  });

  it("editedBlocks excludes verbatim-default text", async () => {
    await renderBuilder();
    const defaultBlock = DEFAULT_PERSONAS.find((p) => p.id === "rp")!.block;
    fireEvent.change(screen.getByLabelText("Hypertrophy Methodologist"), {
      target: { value: defaultBlock },
    });
    fireEvent.change(screen.getByPlaceholderText(/name this preset/i), {
      target: { value: "NoChange" },
    });
    await clickAndSettle(screen.getByRole("button", { name: /^Save$/ }));

    const saved = promptPresetRepo.save.mock.calls[0][0] as PromptPresetDocument;
    expect(saved.editedBlocks).toEqual({});
  });

  it("load overwrites selections and toggles", async () => {
    mockPresets = [seed({ personaIds: ["pl"], fieldOn: { goals: false }, schemaOn: false })];
    await renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Push focus" }));

    expect(screen.getByText(/Coach: Powerlifting Specialist/)).toBeInTheDocument();
    expect(screen.queryByText(/Coach: Hypertrophy Methodologist/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Goals \(priority order\):/)).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Routine JSON contract" })).toBeInTheDocument();
  });

  // Seeded with "pl" so the load visibly changes the coach: that proves a real load
  // happened around the ad-hoc injury rather than the assertion passing by default.
  it("load leaves ad-hoc injuries untouched", async () => {
    mockPresets = [seed({ personaIds: ["pl"] })];
    await renderBuilder();
    const input = screen.getByPlaceholderText(/temporary injury/i);
    fireEvent.change(input, { target: { value: "tweaked wrist" } });
    fireEvent.keyDown(input, { key: "Enter" });

    fireEvent.click(screen.getByRole("button", { name: "Push focus" }));
    expect(screen.getByText(/Coach: Powerlifting Specialist/)).toBeInTheDocument();
    expect(screen.queryByText(/Coach: Hypertrophy Methodologist/)).not.toBeInTheDocument();
    expect(screen.getByText(/- tweaked wrist/)).toBeInTheDocument();
  });

  // "pl" rather than the default "rp", so the surviving id is only observable if
  // loadPreset actually ran — with ["rp"] this passed even when loadPreset was a no-op.
  it("persona id no longer in DEFAULT_PERSONAS is skipped on load", async () => {
    mockPresets = [seed({ personaIds: ["pl", "bogus-removed"] })];
    await renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Push focus" }));

    expect(screen.getByText(/Coach: Powerlifting Specialist/)).toBeInTheDocument();
    expect(screen.queryByText(/Coach: Hypertrophy Methodologist/)).not.toBeInTheDocument();
    expect(screen.queryByText(/bogus-removed/)).not.toBeInTheDocument();
  });

  // equipment:false makes the load observable; ancientKey is the unknown key that
  // must be dropped without disturbing the real ones.
  it("unknown fieldOn key is ignored on load", async () => {
    mockPresets = [
      seed({
        fieldOn: {
          basics: true,
          history: true,
          goals: true,
          equipment: false,
          schedule: true,
          body: true,
          preferences: true,
          injuries: true,
          ancientKey: false,
        },
      }),
    ];
    await renderBuilder();
    fireEvent.click(screen.getByRole("button", { name: "Push focus" }));
    expect(screen.getByText(/Goals \(priority order\):/)).toBeInTheDocument();
    expect(screen.queryByText(/Equipment: Full gym/)).not.toBeInTheDocument();
  });

  // The `?? true` default is only observable when the field starts off, so switch
  // it off first: loading a preset that omits the key must switch it back on.
  it("field absent from preset defaults on", async () => {
    mockPresets = [seed({ fieldOn: { goals: true } })];
    await renderBuilder();
    fireEvent.click(screen.getByLabelText("Equipment"));
    expect(screen.queryByText(/Equipment: Full gym/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Push focus" }));
    expect(screen.getByText(/Equipment: Full gym/)).toBeInTheDocument();
  });

  it("delete removes a preset row", async () => {
    mockPresets = [seed()];
    await renderBuilder();
    await clickAndSettle(screen.getByRole("button", { name: /delete .*push focus/i }));

    expect(promptPresetRepo.remove).toHaveBeenCalledWith("seed-1");
    expect(screen.queryByRole("button", { name: "Push focus" })).not.toBeInTheDocument();
  });

  // deletePreset awaits the repo and then refreshes, so deleting two rows in quick
  // succession puts two list() calls in flight. Each carries the truthful state at
  // the time it was issued, so if the earlier one resolves last it restores a row
  // that has already been deleted. Each resolver is captured right after its click
  // rather than by array position, so the test doesn't depend on reaction ordering.
  it("ignores a stale presets response that resolves after a newer refresh", async () => {
    const rowA = seed({ id: "row-a", name: "Row A" });
    const rowB = seed({ id: "row-b", name: "Row B" });
    const pending: Array<(value: PromptPresetDocument[]) => void> = [];
    promptPresetRepo.list.mockImplementation(
      () => new Promise<PromptPresetDocument[]>((resolve) => pending.push(resolve)),
    );

    render(
      <MemoryRouter>
        <PromptBuilderClient />
      </MemoryRouter>,
    );

    // Settle the mount refresh so both rows and their delete buttons exist.
    await act(async () => pending.shift()!([rowA, rowB]));
    expect(screen.getByRole("button", { name: "Row A" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Row B" })).toBeInTheDocument();

    // Delete A. Its refresh is issued against a store that still holds B.
    fireEvent.click(screen.getByRole("button", { name: /delete .*row a/i }));
    await act(async () => {});
    expect(pending).toHaveLength(1);
    const afterDeletingA = pending.shift()!;

    // Delete B before A's refresh has come back. Its refresh sees an empty store.
    fireEvent.click(screen.getByRole("button", { name: /delete .*row b/i }));
    await act(async () => {});
    expect(pending).toHaveLength(1);
    const afterDeletingB = pending.shift()!;
    expect(promptPresetRepo.remove.mock.calls.map((c) => c[0])).toEqual(["row-a", "row-b"]);

    // The newer refresh lands first with the correct empty list...
    await act(async () => afterDeletingB([]));
    expect(screen.queryByRole("button", { name: "Row B" })).not.toBeInTheDocument();

    // ...then A's superseded response arrives late, still listing B.
    await act(async () => afterDeletingA([rowB]));
    expect(screen.queryByRole("button", { name: "Row B" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Row A" })).not.toBeInTheDocument();
  });
});

describe("PromptBuilderClient short contract and optional coaching", () => {
  it("adds coaching only when selected and persists that choice", async () => {
    await renderBuilder();
    fireEvent.click(screen.getByLabelText(/optional coaching/i));
    expect(screen.getByText(/## Optional coaching/)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/name this preset/i), { target: { value: "Coach" } });
    await clickAndSettle(screen.getByRole("button", { name: /^Save$/ }));
    const saved = promptPresetRepo.save.mock.calls[0][0] as PromptPresetDocument;
    expect(saved.coachingOn).toBe(true);
  });
});

describe("PromptBuilderClient section review", () => {
  it("keeps the coach catalogue folded until the user chooses to browse it", async () => {
    await renderBuilder(false);
    expect(screen.getByRole("button", { name: /Linear Progression Coach/i })).not.toBeVisible();
    fireEvent.click(screen.getByText("Choose coaches"));
    expect(screen.getByRole("button", { name: /Linear Progression Coach/i })).toBeVisible();
  });
  it("shows the actual field text beside its toggle without a combined prompt wall", async () => {
    await renderBuilder();
    const goals = screen.getByRole("region", { name: "Goals prompt section" });
    expect(goals).toHaveTextContent("Goals (priority order):");
    expect(goals).toHaveTextContent("1. Hypertrophy");
    fireEvent.click(within(goals).getByLabelText("Goals"));
    expect(goals).toHaveTextContent("Excluded from the copied prompt");
    expect(goals).not.toHaveTextContent("1. Hypertrophy");
    expect(screen.queryByText("Generated prompt")).not.toBeInTheDocument();
  });

  it("copies all included sections and edited personas from the one bottom action", async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await renderBuilder();
    fireEvent.change(screen.getByLabelText("Hypertrophy Methodologist"), { target: { value: "My edited coach instructions." } });
    fireEvent.click(screen.getByLabelText("Equipment"));
    fireEvent.click(screen.getByLabelText("Optional coaching"));
    const copy = screen.getAllByRole("button", { name: /copy prompt/i });
    expect(copy).toHaveLength(1);
    await clickAndSettle(copy[0]);
    const text = writeText.mock.calls[0][0] as string;
    expect(text).toContain("My edited coach instructions.");
    expect(text).toContain("Goals (priority order):\n1. Hypertrophy");
    expect(text).toContain("- bad knee");
    expect(text).toContain("## Routine JSON contract");
    expect(text).toContain("## Optional coaching");
    expect(text).not.toContain("Equipment: Full gym");
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
  });
});
