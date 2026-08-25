import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { deleteDB } from "idb";
import { ExerciseNormalizationProvider } from "@/components/app/ExerciseNormalizationProvider";
import { exerciseCatalog } from "@/lib/catalog/exercises";
import { prepareImportName, resolveExerciseIdentity } from "@/lib/catalog/identity";
import { normalizeExerciseName } from "@/lib/catalog/normalize";
import { disambiguationsByNormalizedName } from "@/lib/catalog/registries";
import type { UserExerciseDocument } from "@/lib/programs/types";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { DB_NAME, getDb, resetDbConnection } from "@/lib/storage/appDb";
import { createMigrationContext } from "@/lib/storage/migrations/v10Identity";
import { normalizationOverrideRepo } from "@/lib/storage/normalizationOverrideRepo";
import { userExerciseRepo } from "@/lib/storage/userExerciseRepo";
import { ExerciseCorrectionSheet, type CorrectionTarget } from "./ExerciseCorrectionSheet";

const nameOnlyTarget: CorrectionTarget = { kind: "normalized-name", value: "Hatfield Squat" };

// A name whose non-identity annotation the resolver strips before it looks
// anything up, so the token it reads is NOT `normalizeExerciseName(name)`. This
// is the population `Needs review` actually holds: the stripped form still
// matches no catalogue entry, so the name never resolves on its own.
const annotatedName = "3 second paused Hatfield Squat";
// A name that offers a choice of exercises, which `resolveName` answers as
// standalone before it consults any store.
const alternativeName = "Hatfield Squat or Lunge";
// A name that is nothing BUT an annotation, so stripping it leaves no token at
// all. Six shipped phrases have this shape (`competition`, four `pain free`
// wordings, `or`), and so does any name made only of punctuation.
const annotationOnlyName = "Competition";

// Guards every annotated-name test below against becoming vacuous if the
// shipped disambiguation artifact stops stripping the annotation: without the
// mismatch there is no defect to catch and the test would pass for free.
function expectAnnotationIsStripped(name: string) {
  const prepared = prepareImportName(name, disambiguationsByNormalizedName);
  expect(prepared.hasAlternative).toBe(false);
  expect(prepared.normalizedName).not.toBe(normalizeExerciseName(name));
  return prepared.normalizedName;
}

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
    // SEMANTICS MOVED (NEW-1): the sheet now hands the repository the token the
    // RESOLVER reads, not the raw text. For a name carrying no annotation that
    // is just its normalized form, so the stored row is byte-for-byte what it
    // was before — the repository normalized the raw text itself. Only the
    // argument changed, and it changed so an annotated name reaches the same
    // key path.
    expect(overrideSave).toHaveBeenCalledWith({
      targetKind: "normalized-name",
      targetValue: "hatfield squat",
      movementId: "squat",
      movementModifierIds: ["barbell", "paused"],
    });

    await user.click(screen.getByRole("button", { name: "Return to standalone" }));

    // A status line is already on screen from the save above, so this waits for
    // its TEXT to change rather than for it to appear.
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("standalone"));
    expect(overrideSave).toHaveBeenLastCalledWith({
      targetKind: "normalized-name",
      targetValue: "hatfield squat",
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
    // Names both the mapping in the way and the control that replaces it —
    // a refusal that does not say what to do next is just a dead end.
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "“Hatfield Squat” is mapped to High Bar Back Squat. Return it to standalone,"
      + " or use “Map to an existing exercise” to replace the mapping, before assigning a movement.",
    );
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
    // This path writes twice (the override, then the alias delete), so the
    // suppression has to be real: consumers must see one event, not two.
    let events = 0;
    const countEvent = () => {
      events += 1;
    };
    window.addEventListener("trainer-exercise-identity-changed", countEvent);

    await user.click(screen.getByRole("button", { name: "Return to standalone" }));

    // Names what it discarded. A remembered mapping is the user's own work, and
    // the single click that destroys it must not be the quietest thing on screen.
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Saved — returned to standalone; the mapping to High Bar Back Squat was removed.",
    );
    window.removeEventListener("trainer-exercise-identity-changed", countEvent);
    expect(events).toBe(1);
    expect(await aliasRepo.find("Hatfield Squat")).toBeUndefined();
    const identity = await resolveStoredName("Hatfield Squat");
    expect(identity.concreteExerciseId).not.toBe("barbell-high-bar-squat");
    expect(identity.movementId).toBeUndefined();
    // SEMANTICS MOVED (NEW-1 + NEW-2): the resolver's token, and the override
    // write is suppressed because the alias delete that follows it announces the
    // pair — one event for two writes.
    expect(overrideSave).toHaveBeenLastCalledWith(
      {
        targetKind: "normalized-name",
        targetValue: "hatfield squat",
        movementId: null,
        movementModifierIds: [],
      },
      { dispatch: false },
    );
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

  it("keys an assigned annotated name on the token the resolver reads", async () => {
    const lookupToken = expectAnnotationIsStripped(annotatedName);
    const user = userEvent.setup();
    await renderSheet({ kind: "normalized-name", value: annotatedName });

    await user.selectOptions(screen.getByLabelText("Primary movement"), "squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    // The claim has to be true of storage, not of the sheet's own view of it:
    // an override keyed on the unstripped token is a key the resolver never
    // reads, so the row would never leave the review queue.
    expect((await resolveStoredName(annotatedName)).movementId).toBe("squat");
    expect(overrideSave).toHaveBeenCalledWith({
      targetKind: "normalized-name",
      targetValue: lookupToken,
      movementId: "squat",
      movementModifierIds: [],
    });
  });

  it("keys a mapped annotated name on the resolver's token but keeps the user's words", async () => {
    const lookupToken = expectAnnotationIsStripped(annotatedName);
    const user = userEvent.setup();
    await renderSheet({ kind: "normalized-name", value: annotatedName });

    await user.click(screen.getByRole("radio", { name: "Map to an existing exercise" }));
    await user.type(screen.getByLabelText("filter"), "high bar back squat");
    await user.selectOptions(screen.getByLabelText("Concrete version"), "barbell-high-bar-squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    await screen.findByRole("status");
    expect((await resolveStoredName(annotatedName)).concreteExerciseId).toBe("barbell-high-bar-squat");
    const [saved] = await aliasRepo.list();
    // Lookup token and display text are separate fields for exactly this
    // reason: re-keying the row must not cost the user their own wording.
    expect(saved.normalizedAlias).toBe(lookupToken);
    expect(saved.alias).toBe(annotatedName);
  });

  it("refuses to correct a name that offers a choice of exercises", async () => {
    // Canary: the refusal only means anything while the artifact really
    // classifies this name as offering alternatives.
    expect(prepareImportName(alternativeName, disambiguationsByNormalizedName).hasAlternative).toBe(true);
    const user = userEvent.setup();
    await renderSheet({ kind: "normalized-name", value: alternativeName });

    // Said up front, not after a click that pretends to work: `resolveName`
    // answers this name as standalone before it reads either store, so no row
    // the sheet could write would ever be consulted.
    expect(screen.getByRole("alert")).toHaveTextContent("more than one exercise");

    await user.selectOptions(screen.getByLabelText("Primary movement"), "squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    await user.click(screen.getByRole("button", { name: "Return to standalone" }));

    await user.click(screen.getByRole("radio", { name: "Map to an existing exercise" }));
    await user.type(screen.getByLabelText("filter"), "high bar back squat");
    await user.selectOptions(screen.getByLabelText("Concrete version"), "barbell-high-bar-squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    expect(overrideSave).not.toHaveBeenCalled();
    expect(aliasSave).not.toHaveBeenCalled();
    expect(await aliasRepo.list()).toEqual([]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("refuses to assign a movement while an alias governs another spelling of the name", async () => {
    // The mapping was made for the 3-second variant; the sheet is opened on the
    // 5-second one. They share the resolver's token, so the mapping governs both
    // — which is the point of keying on that token. Comparing on the raw text
    // would miss it and report a success that changes nothing.
    await aliasRepo.save({
      alias: annotatedName,
      canonicalExerciseId: "barbell-high-bar-squat",
      provenance: "remembered",
    });
    const otherVariant = "5 second paused Hatfield Squat";
    expect(expectAnnotationIsStripped(otherVariant)).toBe(expectAnnotationIsStripped(annotatedName));
    // Canary: the stored mapping really does govern the other spelling.
    expect((await resolveStoredName(otherVariant)).concreteExerciseId).toBe("barbell-high-bar-squat");
    const user = userEvent.setup();
    await renderSheet({ kind: "normalized-name", value: otherVariant });

    await user.selectOptions(screen.getByLabelText("Primary movement"), "squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("High Bar Back Squat");
    expect(overrideSave).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("refuses to correct a name that is nothing but an annotation", async () => {
    // Canary: stripping really does leave nothing, which is what makes this
    // reachable at all.
    expect(prepareImportName(annotationOnlyName, disambiguationsByNormalizedName).normalizedName).toBe("");
    const user = userEvent.setup();
    await renderSheet({ kind: "normalized-name", value: annotationOnlyName });

    // Said in the user's language. Both stores DO refuse an empty token
    // (`validateOverrideTarget` and `assertRememberedInput`, each before its
    // transaction opens, so nothing is written and `by-normalized-alias` cannot
    // be handed a colliding key) — but they refuse in repository language, and
    // every such name would otherwise share the one key `normalized-name:`.
    expect(screen.getByRole("alert")).toHaveTextContent("no exercise name");

    await user.selectOptions(screen.getByLabelText("Primary movement"), "squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));
    await user.click(screen.getByRole("button", { name: "Return to standalone" }));

    await user.click(screen.getByRole("radio", { name: "Map to an existing exercise" }));
    await user.type(screen.getByLabelText("filter"), "high bar back squat");
    await user.selectOptions(screen.getByLabelText("Concrete version"), "barbell-high-bar-squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    expect(overrideSave).not.toHaveBeenCalled();
    expect(aliasSave).not.toHaveBeenCalled();
    expect(await aliasRepo.list()).toEqual([]);
    expect(await normalizationOverrideRepo.list()).toEqual([]);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("leaves an alias stored on a token the resolver never reads alone", async () => {
    // The shape an older build wrote: keyed on the unstripped token. Written
    // through `putRaw` rather than `save` on purpose — `putRaw` is the
    // restore/migration path and keeps the token it is handed, so this fixture
    // keeps modelling a legacy row no matter what `save` keys on. The token is
    // supplied explicitly for that reason, and asserted on the next line.
    await aliasRepo.putRaw({
      id: "alias-legacy-token",
      alias: annotatedName,
      normalizedAlias: normalizeExerciseName(annotatedName),
      canonicalExerciseId: "barbell-high-bar-squat",
      provenance: "remembered",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    expect((await aliasRepo.list())[0].normalizedAlias).toBe(normalizeExerciseName(annotatedName));
    expectAnnotationIsStripped(annotatedName);
    // Canary: that row does not govern the name, because the resolver looks up
    // the stripped token and finds nothing.
    expect((await resolveStoredName(annotatedName)).concreteExerciseId).toBeUndefined();
    const user = userEvent.setup();
    await renderSheet({ kind: "normalized-name", value: annotatedName });

    await user.selectOptions(screen.getByLabelText("Primary movement"), "squat");
    await user.click(screen.getByRole("button", { name: "Save correction" }));

    // Comparing on the unstripped token would report an alias that governs
    // nothing and refuse a correction the user is entitled to make.
    expect(await screen.findByRole("status")).toHaveTextContent("Saved");
    expect((await resolveStoredName(annotatedName)).movementId).toBe("squat");
    // And it is not ours to delete: the user never asked for that row to go.
    expect(await aliasRepo.list()).toHaveLength(1);
  });

  it("keeps the remembered mapping when the standalone override write is rejected", async () => {
    await aliasRepo.save({
      alias: "Hatfield Squat",
      canonicalExerciseId: "barbell-high-bar-squat",
      provenance: "remembered",
    });
    // Canary: the alias really governs the name, so the clearing path with its
    // alias delete is the path under test.
    expect((await resolveStoredName("Hatfield Squat")).concreteExerciseId).toBe("barbell-high-bar-squat");
    // Injected, because the natural causes — a quota rejection or the tab
    // closing between two awaits — are not reproducible in this harness. The
    // end state is identical: the override write does not land.
    overrideSave.mockRejectedValue(new Error("Quota exceeded"));
    const user = userEvent.setup();
    await renderSheet(nameOnlyTarget);

    await user.click(screen.getByRole("button", { name: "Return to standalone" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Quota exceeded");
    // Deleting first would leave the user with neither the mapping nor the
    // standalone row. IndexedDB is their only copy; a visible failure is the
    // better outcome.
    expect(await aliasRepo.find("Hatfield Squat")).toBeDefined();
    expect((await resolveStoredName("Hatfield Squat")).concreteExerciseId).toBe("barbell-high-bar-squat");
  });

  it("closes on request", async () => {
    const user = userEvent.setup();
    const { onClose } = await renderSheet(nameOnlyTarget);

    await user.click(screen.getByRole("button", { name: "Close" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
