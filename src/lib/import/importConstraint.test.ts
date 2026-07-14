// Regression test for the ConstraintError thrown when importing
// knee-conscious-powerbuilding-cut.json (an 8-week program with a
// week-4 deload override that reuses base-day exercise names). Drives the
// REAL import -> save path: parseProgramJson -> extractUnresolvedExercises
// -> buildInitialResolutions -> applyResolutions -> dedupeAliasResolutions
// -> aliasRepo.save (exactly as ImportClient.handleSave does) ->
// programRepo.save. Uses the real IndexedDB (fake-indexeddb, wired up
// globally via jest.config.js's setupFiles) so real unique-index
// enforcement runs — no repo mocks.
import fs from "node:fs";
import path from "node:path";
import { deleteDB } from "idb";
import { parseProgramJson } from "./parser";
import {
  extractUnresolvedExercises,
  buildInitialResolutions,
  applyResolutions,
  dedupeAliasResolutions,
  CUSTOM_ID,
} from "./resolution";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import { programRepo } from "@/lib/storage/programRepo";
import { DB_NAME, resetDbConnection } from "@/lib/storage/appDb";

const fixturePath = path.join(__dirname, "__fixtures__", "knee-conscious-powerbuilding-cut.json");
const fixtureJson = fs.readFileSync(fixturePath, "utf-8");

beforeEach(async () => {
  resetDbConnection();
  await deleteDB(DB_NAME);
  resetDbConnection();
});

describe("import -> save with a deload override that reuses base-day exercise names", () => {
  it("saves the knee-conscious-powerbuilding-cut fixture without a ConstraintError", async () => {
    // Step 1: parse, exactly like ImportClient.handleValidate (no existing
    // aliases/userExercises — a fresh install).
    const review = parseProgramJson(fixtureJson, undefined, [], []);

    // Step 2: figure out which exercises need resolution and their
    // auto-assigned resolutions, exactly like ImportClient does.
    const unresolvedItems = extractUnresolvedExercises(review.warnings);
    const resolutions = buildInitialResolutions(unresolvedItems);
    const resolvedItems = unresolvedItems.filter(
      (item) => resolutions[item.path] && resolutions[item.path] !== CUSTOM_ID,
    );

    // The fixture's week-4 deload override reuses several base-day exercise
    // names (e.g. "Competition bench press"), so multiple resolved items
    // share the same rawName. Confirm the fixture still exercises that
    // shape before asserting on the dedup behavior below.
    const rawNameCounts = new Map<string, number>();
    for (const item of resolvedItems) {
      rawNameCounts.set(item.rawName, (rawNameCounts.get(item.rawName) ?? 0) + 1);
    }
    const duplicateRawNames = [...rawNameCounts.values()].filter((count) => count > 1);
    expect(duplicateRawNames.length).toBeGreaterThan(0);

    // Step 3: apply resolutions to the program, exactly like handleSave.
    const catalogResolutions = resolvedItems.map((item) => ({
      path: item.path,
      canonicalId: resolutions[item.path],
    }));
    const resolvedProgram =
      catalogResolutions.length > 0
        ? applyResolutions(review.program, catalogResolutions)
        : review.program;

    // Step 4: dedup + save aliases CONCURRENTLY, exactly like
    // ImportClient.handleSave.
    const aliasesToSave = dedupeAliasResolutions(resolvedItems, resolutions);
    // One alias write per unique normalized name — the duplicate rawName
    // pairs collapse to a single save each.
    expect(aliasesToSave.length).toBe(rawNameCounts.size);

    await Promise.all(aliasesToSave.map((entry) => aliasRepo.save(entry)));

    // Step 5: save the program itself, exactly like LocalDataProvider.saveProgram.
    // This is the REGRESSION assertion: importing this fixture must succeed
    // (previously threw a ConstraintError from duplicate alias writes).
    await expect(programRepo.save(resolvedProgram)).resolves.toBeUndefined();

    const savedAliases = await aliasRepo.list();
    expect(savedAliases).toHaveLength(aliasesToSave.length);
    const normalizedAliasValues = savedAliases.map((a) => a.normalizedAlias);
    expect(new Set(normalizedAliasValues).size).toBe(normalizedAliasValues.length);

    const savedProgram = await programRepo.get(resolvedProgram.id);
    expect(savedProgram).toBeDefined();
  });

  it("re-importing the same fixture into a DB that already has the aliases does not throw or duplicate", async () => {
    const review = parseProgramJson(fixtureJson, undefined, [], []);
    const unresolvedItems = extractUnresolvedExercises(review.warnings);
    const resolutions = buildInitialResolutions(unresolvedItems);
    const resolvedItems = unresolvedItems.filter(
      (item) => resolutions[item.path] && resolutions[item.path] !== CUSTOM_ID,
    );
    const aliasesToSave = dedupeAliasResolutions(resolvedItems, resolutions);

    // First import.
    await Promise.all(aliasesToSave.map((entry) => aliasRepo.save(entry)));
    const afterFirstImport = await aliasRepo.list();
    expect(afterFirstImport).toHaveLength(aliasesToSave.length);

    // Second import of the identical fixture: every alias already exists
    // in the DB by normalizedAlias. Re-saving must update in place, not
    // throw and not create duplicates.
    await expect(
      Promise.all(aliasesToSave.map((entry) => aliasRepo.save(entry))),
    ).resolves.toBeDefined();

    const afterSecondImport = await aliasRepo.list();
    expect(afterSecondImport).toHaveLength(aliasesToSave.length);
  });
});
