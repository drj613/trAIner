import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import { ExerciseNormalizationProvider } from "@/components/app/ExerciseNormalizationProvider";
import { exerciseCatalog } from "@/lib/catalog/exercises";
import { resolveExerciseIdentity } from "@/lib/catalog/identity";
import type { UserExerciseDocument } from "@/lib/programs/types";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { DB_NAME, getDb, resetDbConnection } from "@/lib/storage/appDb";
import { createMigrationContext } from "@/lib/storage/migrations/v10Identity";
import { normalizationOverrideRepo } from "@/lib/storage/normalizationOverrideRepo";
import { userExerciseRepo } from "@/lib/storage/userExerciseRepo";
import { ExerciseCorrectionSheet, type CorrectionTarget } from "./ExerciseCorrectionSheet";

const nameOnlyTarget: CorrectionTarget = { kind: "normalized-name", value: "Hatfield Squat" };

// `user-1` is written straight to the store because `userExerciseRepo.save`
// mints its own `user-<uuid>` id, and the test needs a target id it can name.
const customExercise: UserExerciseDocument = {
  id: "user-1",
  name: "My squat",
  createdAt: "2026-08-18T00:00:00.000Z",
};

async function renderSheet(target: CorrectionTarget) {
  const onClose = jest.fn();
  render(
    <ExerciseNormalizationProvider>
      <ExerciseCorrectionSheet target={target} onClose={onClose} />
    </ExerciseNormalizationProvider>,
  );
  // The sheet validates against stored user exercises and aliases, so every
  // test waits for the loaded snapshot rather than acting on the pre-load one.
  await screen.findByRole("button", { name: "Save correction" });
  return { onClose };
}

// Resolves against what is actually stored, not against the sheet's own view of
// it. A correction that claims success has to change this answer.
async function resolveStoredName(name: string) {
  const context = createMigrationContext(
    await aliasRepo.list(),
    await userExerciseRepo.list(),
    await normalizationOverrideRepo.list(),
  );
  return resolveExerciseIdentity({ kind: "import-name", name }, context);
}

describe("ExerciseCorrectionSheet", () => {
  let overrideSave: jest.SpyInstance;
  let aliasSave: jest.SpyInstance;
  let aliasReplace: jest.SpyInstance;

  beforeEach(async () => {
    resetDbConnection();
    await deleteDB(DB_NAME);
    resetDbConnection();
    await (await getDb()).put("userExercises", customExercise);
    overrideSave = jest.spyOn(normalizationOverrideRepo, "save");
    aliasSave = jest.spyOn(aliasRepo, "save");
    aliasReplace = jest.spyOn(aliasRepo, "replaceRemembered");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    resetDbConnection();
  });

  it("assigns and clears name-only targets", async () => {
    const user = userEvent.setup();
    await renderSheet(nameOnlyTarget);

    await user.selectOptions(screen.getByLabelText("Primary movement"), "squat");
    // Ticked out of canonical order on purpose: the saved list must come back
    // in sort order, because a non-canonical list is a validation failure the
    // user should never be shown for something they cannot control.
    await user.click(screen.getByRole("checkbox", { name: "Paused" }));
    await user.click(screen.getByRole("checkbox", { name: "Barbell" }));
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    // Write completion first, then the assertion about it — a spy sampled
    // straight after the click reads whatever happened to have resolved.
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(overrideSave).toHaveBeenCalledWith({
      targetKind: "normalized-name",
      targetValue: "Hatfield Squat",
      movementId: "squat",
      movementModifierIds: ["barbell", "paused"],
    });

    await user.click(screen.getByRole("button", { name: "Return to standalone" }));

    // A status line is already on screen from the save above, so this waits for
    // its TEXT to change rather than for it to appear.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("standalone"));
    expect(overrideSave).toHaveBeenLastCalledWith({
      targetKind: "normalized-name",
      targetValue: "Hatfield Squat",
      movementId: null,
      movementModifierIds: [],
    });
  });

  it.each<CorrectionTarget>([
    { kind: "catalog-exercise", exerciseId: "barbell-back-squat", name: "Barbell Back Squat" },
    { kind: "user-exercise", exerciseId: "user-1", name: "My squat" },
  ])("assigns bundled movement metadata to $kind", async (target) => {
    const user = userEvent.setup();
    await renderSheet(target);

    await user.selectOptions(screen.getByLabelText("Primary movement"), "squat");
    await user.click(screen.getByRole("checkbox", { name: "Barbell" }));
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect(overrideSave).toHaveBeenCalledWith({
      targetKind: "exercise-id",
      targetValue: target.kind === "normalized-name" ? target.value : target.exerciseId,
      movementId: "squat",
      movementModifierIds: ["barbell"],
    });
  });

  it("does not offer alias mapping for a concrete target", async () => {
    await renderSheet({ kind: "catalog-exercise", exerciseId: "barbell-back-squat", name: "Barbell Back Squat" });

    expect(screen.queryByRole("radio", { name: "Map to an existing exercise" })).not.toBeInTheDocument();
  });

  it("maps an unknown name to a concrete version with a remembered alias", async () => {
    const user = userEvent.setup();
    await renderSheet(nameOnlyTarget);
    // The mapping writes twice (alias, then the override cleanup), so the
    // suppression has to be real: consumers must see one event, not two.
    let events = 0;
    const countEvent = () => {
      events += 1;
    };
    window.addEventListener("trainer-exercise-identity-changed", countEvent);

    await user.click(screen.getByRole("radio", { name: "Map to an existing exercise" }));
    // The version list is filter-first: >3,000 entries never all render at once.
    await user.type(screen.getByLabelText("filter"), "high bar back squat");
    await user.selectOptions(screen.getByLabelText("Concrete version"), "barbell-high-bar-squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    // The status line is set after BOTH writes resolve, so it is the only
    // signal that makes the assertions below deterministic. Sampling them
    // straight after the click read `events === 0` in 2 of 4 runs.
    await screen.findByRole("status");

    expect(aliasSave).toHaveBeenCalledWith(
      {
        alias: "Hatfield Squat",
        canonicalExerciseId: "barbell-high-bar-squat",
        provenance: "remembered",
      },
      { dispatch: false },
    );
    expect(aliasReplace).not.toHaveBeenCalled();
    expect(overrideSave).not.toHaveBeenCalled();
    window.removeEventListener("trainer-exercise-identity-changed", countEvent);
    expect(events).toBe(1);
  });

  it("lists no versions until the filter narrows them, then caps the list", async () => {
    const user = userEvent.setup();
    await renderSheet(nameOnlyTarget);
    await user.click(screen.getByRole("radio", { name: "Map to an existing exercise" }));

    // An unfiltered catalogue is 3,000+ entries; presenting the 40
    // alphabetically-first ones would read as a menu of the wrong 40.
    expect(within(screen.getByLabelText("Concrete version")).getAllByRole("option")).toHaveLength(1);
    expect(screen.getByText(/filter to choose a version/i)).toBeInTheDocument();

    await user.type(screen.getByLabelText("filter"), "squat");
    const matches = exerciseCatalog.filter(
      (item) => /squat/.test(item.name.toLowerCase()) || item.aliases.some((alias) => /squat/.test(alias.toLowerCase())),
    ).length;
    expect(matches).toBeGreaterThan(40);
    // 40 versions plus the empty "choose a version…" row.
    expect(within(screen.getByLabelText("Concrete version")).getAllByRole("option")).toHaveLength(41);
    expect(screen.getByText(`+${matches - 40}`)).toBeInTheDocument();
  });

  it("rejects an invalid target before writing", async () => {
    const user = userEvent.setup();
    await renderSheet({ kind: "user-exercise", exerciseId: "missing", name: "Missing" });

    expect(screen.getByRole("alert")).toHaveTextContent("Unknown exercise target: missing");

    await user.click(screen.getByRole("button", { name: "Save correction" }));
    await user.click(screen.getByRole("button", { name: "Return to standalone" }));

    expect(overrideSave).not.toHaveBeenCalled();
  });

  it("rejects an incompatible modifier set before writing", async () => {
    const user = userEvent.setup();
    await renderSheet(nameOnlyTarget);

    await user.selectOptions(screen.getByLabelText("Primary movement"), "squat");
    await user.click(screen.getByRole("checkbox", { name: "Back Rack" }));
    await user.click(screen.getByRole("checkbox", { name: "High Bar" }));
    await user.click(screen.getByRole("checkbox", { name: "Low Bar" }));

    expect(screen.getByRole("alert")).toHaveTextContent("Exclusive-group conflict: bar-height");

    await user.click(screen.getByRole("button", { name: "Save correction" }));

    // The repository validates too, so a write that reached it would still be
    // rejected — but the correction surface must not hand it one at all.
    expect(overrideSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("replaces an occupied remembered alias only after explicit confirmation", async () => {
    await aliasRepo.save({
      alias: "Hatfield Squat",
      canonicalExerciseId: "barbell-back-squat",
      provenance: "remembered",
    });
    aliasSave.mockClear();
    const user = userEvent.setup();
    await renderSheet(nameOnlyTarget);

    await user.click(screen.getByRole("radio", { name: "Map to an existing exercise" }));
    // The version list is filter-first: >3,000 entries never all render at once.
    await user.type(screen.getByLabelText("filter"), "high bar back squat");
    await user.selectOptions(screen.getByLabelText("Concrete version"), "barbell-high-bar-squat");
    expect(screen.getByRole("alert")).toHaveTextContent("Barbell Back Squat");

    await user.click(screen.getByRole("button", { name: "Save correction" }));
    expect(aliasReplace).not.toHaveBeenCalled();
    expect(aliasSave).not.toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "Replace the existing mapping" }));
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await screen.findByRole("status");
    expect(aliasReplace).toHaveBeenCalledWith(
      {
        alias: "Hatfield Squat",
        canonicalExerciseId: "barbell-high-bar-squat",
        provenance: "remembered",
      },
      { dispatch: false },
    );
    expect(aliasSave).not.toHaveBeenCalled();
  });

  it("only uses theme tokens that globals.css actually defines", () => {
    const css = readFileSync(path.join(__dirname, "..", "..", "app", "globals.css"), "utf8");
    const defined = new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((match) => match[1]));
    const used = new Map<string, string>();
    for (const file of ["ExerciseCorrectionSheet.tsx", "LibraryClient.tsx"]) {
      const source = readFileSync(path.join(__dirname, file), "utf8");
      for (const match of source.matchAll(/var\((--[\w-]+)[,)]/g)) used.set(match[1], file);
    }

    // An unresolvable var() invalidates the whole shorthand it sits in, so a
    // misspelled token does not degrade — it deletes the border, and no render
    // test can see it.
    expect([...used].filter(([token]) => !defined.has(token))).toEqual([]);
    // Canary: a scan that matched nothing would satisfy the assertion above.
    expect(used.size).toBeGreaterThan(5);
  });

  it("refuses to assign a movement while an alias governs the name", async () => {
    await aliasRepo.save({
      alias: "Hatfield Squat",
      canonicalExerciseId: "barbell-high-bar-squat",
      provenance: "remembered",
    });
    const user = userEvent.setup();
    await renderSheet(nameOnlyTarget);

    await user.selectOptions(screen.getByLabelText("Primary movement"), "squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    // A `normalized-name` override cannot be reached while an alias matches
    // (identity.ts:283-298 returns before identity.ts:338-340), so writing one
    // and reporting success would be a lie. Awaited so a late write cannot slip
    // past the spy assertion below.
    expect(await screen.findByRole("alert")).toHaveTextContent("High Bar Back Squat");
    expect(overrideSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("returns an alias-governed name to standalone by dropping the alias", async () => {
    await aliasRepo.save({
      alias: "Hatfield Squat",
      canonicalExerciseId: "barbell-high-bar-squat",
      provenance: "remembered",
    });
    // Canary: the alias really does govern the name before the correction.
    expect((await resolveStoredName("Hatfield Squat")).concreteExerciseId).toBe("barbell-high-bar-squat");
    const user = userEvent.setup();
    await renderSheet(nameOnlyTarget);

    await user.click(screen.getByRole("button", { name: "Return to standalone" }));

    expect(await screen.findByRole("status")).toHaveTextContent("standalone");
    expect(await aliasRepo.find("Hatfield Squat")).toBeUndefined();
    const identity = await resolveStoredName("Hatfield Squat");
    expect(identity.concreteExerciseId).not.toBe("barbell-high-bar-squat");
    expect(identity.movementId).toBeUndefined();
    expect(overrideSave).toHaveBeenLastCalledWith({
      targetKind: "normalized-name",
      targetValue: "Hatfield Squat",
      movementId: null,
      movementModifierIds: [],
    });
  });

  it("reports failure when the alias survives the clearing write", async () => {
    await aliasRepo.save({
      alias: "Hatfield Squat",
      canonicalExerciseId: "barbell-high-bar-squat",
      provenance: "remembered",
    });
    // In production this is a concurrent writer re-occupying the token between
    // the delete and the read. A delete that resolves without deleting
    // reproduces the same end state, which is what the check is about.
    jest.spyOn(aliasRepo, "removeMany").mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderSheet(nameOnlyTarget);

    await user.click(screen.getByRole("button", { name: "Return to standalone" }));

    // Awaited, not sampled: the handler makes three IndexedDB round-trips
    // before it can decide, and `user.click` returns before they settle.
    // Asserting synchronously made this test pass only in suite order.
    expect(await screen.findByRole("alert")).toHaveTextContent("still mapped");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("clears an override the new alias would permanently shadow", async () => {
    await normalizationOverrideRepo.save({
      targetKind: "normalized-name",
      targetValue: "Hatfield Squat",
      movementId: "squat",
      movementModifierIds: [],
    });
    const user = userEvent.setup();
    await renderSheet(nameOnlyTarget);

    await user.click(screen.getByRole("radio", { name: "Map to an existing exercise" }));
    await user.type(screen.getByLabelText("filter"), "high bar back squat");
    await user.selectOptions(screen.getByLabelText("Concrete version"), "barbell-high-bar-squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await screen.findByRole("status");
    // The alias now shadows the override forever, so leaving it stored would
    // ship dead data in every backup export.
    expect(await normalizationOverrideRepo.list()).toEqual([]);
  });

  it("keeps two name-only sheets' action groups independent", async () => {
    render(
      <ExerciseNormalizationProvider>
        <ExerciseCorrectionSheet target={nameOnlyTarget} onClose={jest.fn()} />
        <ExerciseCorrectionSheet target={{ kind: "normalized-name", value: "Zercher Carry" }} onClose={jest.fn()} />
      </ExerciseNormalizationProvider>,
    );
    // Both bodies are gated on the loaded snapshot; the regions exist before
    // the radios do.
    expect(await screen.findAllByRole("button", { name: "Save correction" })).toHaveLength(2);
    const sheets = screen.getAllByRole("region", { name: /^Correct / });
    const user = userEvent.setup();

    await user.click(within(sheets[0]).getByRole("radio", { name: "Map to an existing exercise" }));

    expect(within(sheets[1]).getByRole("radio", { name: "Assign a primary movement" })).toBeChecked();
    expect(within(sheets[0]).getByRole("radio", { name: "Assign a primary movement" })).not.toBeChecked();
  });

  it("closes on request", async () => {
    const user = userEvent.setup();
    const { onClose } = await renderSheet(nameOnlyTarget);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
