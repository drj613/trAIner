import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import { ExerciseNormalizationProvider } from "@/components/app/ExerciseNormalizationProvider";
import { exerciseCatalog } from "@/lib/catalog/exercises";
import type { UserExerciseDocument } from "@/lib/programs/types";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { DB_NAME, getDb, resetDbConnection } from "@/lib/storage/appDb";
import { normalizationOverrideRepo } from "@/lib/storage/normalizationOverrideRepo";
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

    expect(overrideSave).toHaveBeenCalledWith({
      targetKind: "normalized-name",
      targetValue: "Hatfield Squat",
      movementId: "squat",
      movementModifierIds: ["barbell", "paused"],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");

    await user.click(screen.getByRole("button", { name: "Return to standalone" }));

    expect(overrideSave).toHaveBeenLastCalledWith({
      targetKind: "normalized-name",
      targetValue: "Hatfield Squat",
      movementId: null,
      movementModifierIds: [],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("standalone");
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

    expect(overrideSave).toHaveBeenCalledWith({
      targetKind: "exercise-id",
      targetValue: target.kind === "normalized-name" ? target.value : target.exerciseId,
      movementId: "squat",
      movementModifierIds: ["barbell"],
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
  });

  it("does not offer alias mapping for a concrete target", async () => {
    await renderSheet({ kind: "catalog-exercise", exerciseId: "barbell-back-squat", name: "Barbell Back Squat" });

    expect(screen.queryByRole("radio", { name: "Map to an existing exercise" })).not.toBeInTheDocument();
  });

  it("maps an unknown name to a concrete version with a remembered alias", async () => {
    const user = userEvent.setup();
    await renderSheet(nameOnlyTarget);

    await user.click(screen.getByRole("radio", { name: "Map to an existing exercise" }));
    // The version list is filter-first: >3,000 entries never all render at once.
    await user.type(screen.getByLabelText("filter"), "high bar back squat");
    await user.selectOptions(screen.getByLabelText("Concrete version"), "barbell-high-bar-squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    expect(aliasSave).toHaveBeenCalledWith({
      alias: "Hatfield Squat",
      canonicalExerciseId: "barbell-high-bar-squat",
      provenance: "remembered",
    });
    expect(aliasReplace).not.toHaveBeenCalled();
    expect(overrideSave).not.toHaveBeenCalled();
  });

  it("caps the version list and says how many matches it is hiding", async () => {
    const user = userEvent.setup();
    await renderSheet(nameOnlyTarget);
    await user.click(screen.getByRole("radio", { name: "Map to an existing exercise" }));

    const options = within(screen.getByLabelText("Concrete version")).getAllByRole("option");
    // 40 versions plus the empty "choose a version…" row.
    expect(options).toHaveLength(41);
    const hidden = exerciseCatalog.length - 40;
    expect(screen.getByText(`+${hidden}`)).toBeInTheDocument();

    await user.type(screen.getByLabelText("filter"), "high bar back squat");
    expect(within(screen.getByLabelText("Concrete version")).getAllByRole("option").length).toBeLessThan(41);
    expect(screen.queryByText(`+${hidden}`)).not.toBeInTheDocument();
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

    expect(aliasReplace).toHaveBeenCalledWith({
      alias: "Hatfield Squat",
      canonicalExerciseId: "barbell-high-bar-squat",
      provenance: "remembered",
    });
    expect(aliasSave).not.toHaveBeenCalled();
  });

  it("closes on request", async () => {
    const user = userEvent.setup();
    const { onClose } = await renderSheet(nameOnlyTarget);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
