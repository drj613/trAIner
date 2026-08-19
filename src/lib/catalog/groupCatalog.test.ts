import { groupCatalogItems, searchCatalogGroups, type CatalogGroup } from "./groupCatalog";
import { makeSquatCatalogFixture, squatUserExercise } from "./groupCatalog.testFixtures";
import type { UserExerciseDocument } from "@/lib/programs/types";

function idsOf(groups: readonly CatalogGroup[]): string[] {
  return groups.map((group) => group.id);
}

function versionIdsOf(groups: readonly CatalogGroup[], groupId: string): string[] {
  const group = groups.find((candidate) => candidate.id === groupId);
  if (!group) throw new Error(`no group ${groupId} in [${idsOf(groups).join(", ")}]`);
  return group.versions.map((version) => version.id);
}

describe("groupCatalogItems", () => {
  it("nests concrete squat versions under one movement family", () => {
    const { squatItems, resolve } = makeSquatCatalogFixture();

    expect(groupCatalogItems(squatItems, resolve)[0]).toMatchObject({
      id: "movement:squat",
      movementId: "squat",
      name: "Squat",
      standalone: false,
      versions: [
        { id: "barbell-squat", name: "Barbell Squat" },
        { id: "barbell-high-bar-squat", name: "High Bar Back Squat" },
        { id: "barbell-low-bar-squat", name: "Low Bar Back Squat" },
        { id: "squat--kettlebell", name: "Kettlebell Squat" },
      ],
    });
  });

  it("orders versions by canonical modifier order, not by name", () => {
    const { squatItems, resolve } = makeSquatCatalogFixture();

    const versionIds = versionIdsOf(groupCatalogItems(squatItems, resolve), "movement:squat");

    // Canonical order puts the generic barbell version first and the
    // kettlebell one last. Alphabetical order would put "Barbell Squat" third
    // and "Kettlebell Squat" second, and the fixture's input order puts the
    // kettlebell version first, so neither could produce this list.
    expect(versionIds).toEqual([
      "barbell-squat",
      "barbell-high-bar-squat",
      "barbell-low-bar-squat",
      "squat--kettlebell",
    ]);
  });

  it("orders families by movement sort order and puts standalone entries after them, by name", () => {
    const { squatItems, resolve } = makeSquatCatalogFixture();

    // Squat sorts before Bench Press by movement sort order (1 before 2) but
    // after it alphabetically, so a name sort on families would fail here.
    expect(idsOf(groupCatalogItems(squatItems, resolve))).toEqual([
      "movement:squat",
      "movement:bench-press",
      "movement:pull-up-pulldown",
      "exercise:ab-wheel-rollout",
      "exercise:barbell-back-squat",
      "exercise:user-zercher",
    ]);
  });

  it("keeps the unassigned barbell-back-squat entry out of the squat family", () => {
    const { squatItems, resolve } = makeSquatCatalogFixture();
    const groups = groupCatalogItems(squatItems, resolve);

    expect(versionIdsOf(groups, "movement:squat")).not.toContain("barbell-back-squat");
    expect(groups.find((group) => group.id === "exercise:barbell-back-squat")).toMatchObject({
      standalone: true,
      name: "Barbell Back Squat",
      versions: [{ id: "barbell-back-squat", source: "bundled" }],
    });
  });

  it("carries user exercises through as their own standalone entry", () => {
    const { squatItems, resolve } = makeSquatCatalogFixture();
    const groups = groupCatalogItems(squatItems, resolve);

    expect(groups.find((group) => group.id === "exercise:user-zercher")).toMatchObject({
      standalone: true,
      versions: [{ id: "user-zercher", source: "user", userExercise: squatUserExercise }],
    });
  });

  it("keeps a user exercise standalone even when a bundled version shares its name", () => {
    // Resolving a user exercise by NAME would find the bundled `High Bar Back
    // Squat` and file the user's own entry under the Squat family — a
    // different exercise, silently merged. It resolves by id instead.
    const userExercise: UserExerciseDocument = {
      id: "user-hbbs",
      name: "High Bar Back Squat",
      createdAt: "2026-08-02T00:00:00.000Z",
    };
    const { resolve } = makeSquatCatalogFixture({ userExercises: [userExercise] });

    const groups = groupCatalogItems(
      [{ id: userExercise.id, name: userExercise.name, source: "user", userExercise }],
      resolve,
    );

    expect(groups).toMatchObject([{ id: "exercise:user-hbbs", standalone: true }]);
  });

  it("groups a name-only entry that matches nothing in the catalogue", () => {
    const { resolve } = makeSquatCatalogFixture();

    const groups = groupCatalogItems(
      [{ id: "name:wobble board thing", name: "Wobble Board Thing", source: "unresolved" }],
      resolve,
    );

    expect(groups).toMatchObject([
      { id: "name:wobble board thing", standalone: true, versions: [{ source: "unresolved" }] },
    ]);
  });

  it("follows a user override that moves an entry into a family", () => {
    const { squatItems, resolve } = makeSquatCatalogFixture({
      normalizationOverrides: [
        {
          id: "override-1",
          targetKind: "exercise-id",
          targetValue: "barbell-back-squat",
          movementId: "squat",
          movementModifierIds: ["barbell", "back-rack"],
          updatedAt: "2026-08-18T00:00:00.000Z",
        },
      ],
    });

    const groups = groupCatalogItems(squatItems, resolve);

    expect(versionIdsOf(groups, "movement:squat")).toContain("barbell-back-squat");
    expect(idsOf(groups)).not.toContain("exercise:barbell-back-squat");
  });

  it("highlights nothing until a query asks for something", () => {
    const { squatItems, resolve } = makeSquatCatalogFixture();

    for (const group of groupCatalogItems(squatItems, resolve)) {
      expect(group.matchedVersionIds).toEqual([]);
    }
  });
});

describe("searchCatalogGroups", () => {
  function groups() {
    const { squatItems, resolve } = makeSquatCatalogFixture();
    return groupCatalogItems(squatItems, resolve);
  }

  it("returns the family for a family query and keeps every version beneath it", () => {
    const result = searchCatalogGroups(groups(), "squat");

    expect(result[0].id).toBe("movement:squat");
    expect(versionIdsOf(result, "movement:squat")).toEqual([
      "barbell-squat",
      "barbell-high-bar-squat",
      "barbell-low-bar-squat",
      "squat--kettlebell",
    ]);
  });

  it("reveals and highlights the matching version for a modifier query", () => {
    const result = searchCatalogGroups(groups(), "high bar");

    expect(result[0].id).toBe("movement:squat");
    expect(result[0].versions.some((version) => version.id === "barbell-high-bar-squat")).toBe(true);
    // Highlighted, not filtered down to: the sibling versions stay visible so
    // the user can compare them, and only the match is called out.
    expect(result[0].matchedVersionIds).toEqual(["barbell-high-bar-squat"]);
    expect(result[0].versions).toHaveLength(4);
  });

  it("finds a family by its own name when no version carries that word", () => {
    // "cable pulldown" is the only version of the Pull-up and Pulldown family
    // here, and neither its name, its alias nor its muscle contains "pull-up".
    // Only the family row can answer this query.
    const result = searchCatalogGroups(groups(), "pull-up");

    expect(idsOf(result)).toEqual(["movement:pull-up-pulldown"]);
    expect(result[0].versions.map((version) => version.id)).toEqual(["cable-pulldown"]);
    expect(result[0].matchedVersionIds).toEqual([]);
  });

  it("drops a family whose name and versions both miss the query", () => {
    const result = searchCatalogGroups(groups(), "high bar");

    expect(idsOf(result)).not.toContain("movement:bench-press");
  });

  it("keeps standalone and user entries searchable", () => {
    expect(idsOf(searchCatalogGroups(groups(), "zercher"))).toEqual(["exercise:user-zercher"]);
    expect(idsOf(searchCatalogGroups(groups(), "wheel"))).toEqual(["exercise:ab-wheel-rollout"]);
  });

  it("matches a version alias and a primary muscle, not only the display name", () => {
    // "high bar squat" is an alias of the high-bar version; no display name in
    // the fixture contains that phrase.
    expect(searchCatalogGroups(groups(), "high bar squat")[0].matchedVersionIds).toEqual([
      "barbell-high-bar-squat",
    ]);
    expect(idsOf(searchCatalogGroups(groups(), "abdominals"))).toEqual(["exercise:ab-wheel-rollout"]);
  });

  it("returns every group unchanged for a blank query", () => {
    const all = groups();

    expect(searchCatalogGroups(all, "   ")).toEqual(all);
  });

  it("preserves group and version order in its results", () => {
    const result = searchCatalogGroups(groups(), "squat");

    expect(idsOf(result)).toEqual([
      "movement:squat",
      "exercise:barbell-back-squat",
      "exercise:user-zercher",
    ]);
  });
});
