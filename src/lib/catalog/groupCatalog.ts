import type { ExerciseCatalogItem } from "./exercises";
import type { ExerciseIdentityInput, ExerciseIdentityResolver } from "./identity";
import { modifiersById, movementsById } from "./registries";
import type { UserExerciseDocument } from "@/lib/programs/types";

/**
 * One thing the user can actually choose. A family is never one of these — see
 * `CatalogGroup.standalone` for why that distinction is the whole point of this
 * module.
 */
export type SelectableExercise = {
  id: string;
  name: string;
  source: "bundled" | "user" | "unresolved";
  catalogItem?: ExerciseCatalogItem;
  userExercise?: UserExerciseDocument;
};

/**
 * A row in a catalogue surface.
 *
 * `standalone: false` is a movement family: navigation only. Its own row can
 * never be chosen as an exercise — only the concrete versions nested beneath
 * it can. `standalone: true` is an entry with no family, which is the common
 * case (only 142 of 3,175 bundled entries carry a `movementId`); it renders as
 * an ordinary row and its single version is chosen directly.
 *
 * `matchedVersionIds` names the versions a query matched by themselves, so a
 * modifier query can reveal and highlight one version without hiding its
 * siblings. Grouping leaves it empty: with no query, nothing is highlighted.
 */
export type CatalogGroup = {
  id: string;
  movementId?: string;
  name: string;
  versions: SelectableExercise[];
  standalone: boolean;
  matchedVersionIds: string[];
};

function identityInputFor(item: SelectableExercise): ExerciseIdentityInput {
  switch (item.source) {
    case "bundled":
      return { kind: "catalog-reference", canonicalExerciseId: item.id };
    case "user":
      return { kind: "custom-exercise", exerciseId: item.id, name: item.name };
    case "unresolved":
      return { kind: "import-name", name: item.name };
  }
}

type Ranked = { item: SelectableExercise; modifierIds: readonly string[] };

function modifierRank(modifierId: string): number {
  return modifiersById.get(modifierId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Canonical modifier order, elementwise. A version with fewer modifiers sorts
 * before one that merely adds to it, so the generic version of a family leads
 * and each refinement follows the version it refines.
 */
function compareByModifiers(left: Ranked, right: Ranked): number {
  const shared = Math.min(left.modifierIds.length, right.modifierIds.length);
  for (let index = 0; index < shared; index += 1) {
    const difference = modifierRank(left.modifierIds[index]) - modifierRank(right.modifierIds[index]);
    if (difference !== 0) return difference;
    const byId = left.modifierIds[index].localeCompare(right.modifierIds[index]);
    if (byId !== 0) return byId;
  }
  return left.modifierIds.length - right.modifierIds.length;
}

function compareVersions(left: Ranked, right: Ranked): number {
  return (
    compareByModifiers(left, right)
    || left.item.name.localeCompare(right.item.name)
    || left.item.id.localeCompare(right.item.id)
  );
}

function movementRank(movementId: string | undefined): number {
  if (!movementId) return Number.MAX_SAFE_INTEGER;
  return movementsById.get(movementId)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
}

/**
 * Families first, in the reviewed movement order, then everything with no
 * family, by name. Two orderings rather than one because they answer different
 * questions: a family list is a short, curated menu, and the standalone list is
 * three thousand rows a user can only find alphabetically.
 */
function compareGroups(left: CatalogGroup, right: CatalogGroup): number {
  if (left.standalone !== right.standalone) return left.standalone ? 1 : -1;
  if (!left.standalone) {
    const byOrder = movementRank(left.movementId) - movementRank(right.movementId);
    if (byOrder !== 0) return byOrder;
  }
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

export function groupCatalogItems(
  items: readonly SelectableExercise[],
  resolve: ExerciseIdentityResolver,
): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>();
  // Keyed on the item itself, not on a composed string. Ids are catalogue and
  // user data and may hold any character, so any separator a composed key
  // picked could also appear inside one of the halves.
  const ranked = new Map<SelectableExercise, Ranked>();

  for (const item of items) {
    const identity = resolve(identityInputFor(item));
    // The resolver owns grouping, so a saved correction moves an entry between
    // family and standalone with nothing here to keep in sync.
    const key = identity.groupKey;
    let group = groups.get(key);
    if (!group) {
      group = identity.movementId
        ? {
          id: key,
          movementId: identity.movementId,
          name: identity.movementName ?? identity.movementId,
          versions: [],
          standalone: false,
          matchedVersionIds: [],
        }
        // `item.name`, not `identity.displayLabel`: the two are equal for every
        // input this builds (the resolver derives the label from the same name
        // or catalogue entry), so this is the cheaper of two identical answers.
        : { id: key, name: item.name, versions: [], standalone: true, matchedVersionIds: [] };
      groups.set(key, group);
    }
    group.versions.push(item);
    ranked.set(item, { item, modifierIds: identity.movementModifierIds });
  }

  const ordered = [...groups.values()];
  for (const group of ordered) {
    group.versions.sort((left, right) => compareVersions(ranked.get(left)!, ranked.get(right)!));
  }
  return ordered.sort(compareGroups);
}

/**
 * Applies a per-version filter (equipment, muscle) to already-grouped rows.
 * Written once because two things have to happen together and only one of them
 * is obvious: a group left with no versions disappears, and a highlight whose
 * version was removed is forgotten — otherwise a family would open itself on a
 * row that is no longer there.
 */
export function filterGroupVersions(
  groups: readonly CatalogGroup[],
  keep: (version: SelectableExercise) => boolean,
): CatalogGroup[] {
  const filtered: CatalogGroup[] = [];
  for (const group of groups) {
    const versions = group.versions.filter(keep);
    if (versions.length === 0) continue;
    const kept = new Set(versions.map((version) => version.id));
    filtered.push({
      ...group,
      versions,
      matchedVersionIds: group.matchedVersionIds.filter((id) => kept.has(id)),
    });
  }
  return filtered;
}

function versionMatches(version: SelectableExercise, query: string): boolean {
  if (version.name.toLowerCase().includes(query)) return true;
  const catalogItem = version.catalogItem;
  if (!catalogItem) return false;
  return (
    catalogItem.aliases.some((alias) => alias.toLowerCase().includes(query))
    || catalogItem.muscles.primary.some((muscle) => muscle.toLowerCase().includes(query))
  );
}

/**
 * Searches both levels. A family query keeps the family and every version
 * beneath it; a version query keeps the family too, and names the matching
 * versions in `matchedVersionIds` so the surface can open the family and mark
 * the row rather than hiding the siblings the user is choosing between.
 */
export function searchCatalogGroups(groups: readonly CatalogGroup[], query: string): CatalogGroup[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...groups];

  const results: CatalogGroup[] = [];
  for (const group of groups) {
    const matchedVersionIds = group.versions
      .filter((version) => versionMatches(version, needle))
      .map((version) => version.id);
    // No `standalone` special case: a standalone group's name IS its single
    // version's name, so a `!group.standalone` guard here would be dead —
    // measured, not assumed (the mutation that drops it kills nothing).
    const groupNameMatches = group.name.toLowerCase().includes(needle);
    if (!groupNameMatches && matchedVersionIds.length === 0) continue;
    results.push({ ...group, matchedVersionIds });
  }
  return results;
}
