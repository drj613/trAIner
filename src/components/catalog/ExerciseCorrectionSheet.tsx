"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { X } from "lucide-react";
import { useExerciseNormalization } from "@/components/app/ExerciseNormalizationProvider";
import type { ExerciseIdentityInput } from "@/lib/catalog/identity";
import { normalizeExerciseName } from "@/lib/catalog/normalize";
import type { MovementModifierDefinition } from "@/lib/catalog/registries";
import { aliasRepo } from "@/lib/storage/aliasRepo";
import {
  normalizationOverrideRepo,
  validateNormalizationOverrideInput,
  type NormalizationOverrideSaveInput,
} from "@/lib/storage/normalizationOverrideRepo";

/**
 * What a correction is being made about. The three kinds are the three things
 * the spec lets a user correct: a bundled catalogue exercise, one of their own
 * custom exercises, and a legacy name with no stable id behind it.
 */
export type CorrectionTarget =
  | { kind: "catalog-exercise"; exerciseId: string; name: string }
  | { kind: "user-exercise"; exerciseId: string; name: string }
  | { kind: "normalized-name"; value: string };

type CorrectionMode = "assign" | "map";

type Draft = { movementId: string | null; modifierIds: string[] };

/**
 * Identity of a correction target, not of the text that named it. Name targets
 * are keyed on the normalized token because that is what an override and an
 * alias are keyed on too — otherwise `Back Squat` and `back squat` would list
 * as two things to review and then fight over one stored row.
 */
export function correctionTargetKey(target: CorrectionTarget): string {
  return target.kind === "normalized-name"
    ? `name:${normalizeExerciseName(target.value)}`
    : `id:${target.exerciseId}`;
}

export function correctionTargetLabel(target: CorrectionTarget): string {
  return target.kind === "normalized-name" ? target.value : target.name;
}

function identityInputFor(target: CorrectionTarget): ExerciseIdentityInput {
  switch (target.kind) {
    case "catalog-exercise":
      return { kind: "catalog-reference", canonicalExerciseId: target.exerciseId };
    case "user-exercise":
      return { kind: "custom-exercise", exerciseId: target.exerciseId, name: target.name };
    case "normalized-name":
      return { kind: "import-name", name: target.value };
  }
}

function overrideTargetFor(
  target: CorrectionTarget,
): Pick<NormalizationOverrideSaveInput, "targetKind" | "targetValue"> {
  return target.kind === "normalized-name"
    ? { targetKind: "normalized-name", targetValue: target.value }
    : { targetKind: "exercise-id", targetValue: target.exerciseId };
}

const VERSION_OPTION_LIMIT = 40;

const KIND_TAG: Record<CorrectionTarget["kind"], string> = {
  "catalog-exercise": "bundled",
  "user-exercise": "custom",
  "normalized-name": "name only",
};

// Same ordering rule as the resolver and the repository validator: sort order
// first, id as the tie-break. The sheet always emits canonical order, so
// "Modifier order is not canonical" is unreachable from this surface — the
// user is never asked to care what order they ticked boxes in.
function canonicalOrder(
  modifierIds: readonly string[],
  modifiersById: ReadonlyMap<string, MovementModifierDefinition>,
): string[] {
  return [...modifierIds].sort((left, right) => {
    const leftOrder = modifiersById.get(left)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = modifiersById.get(right)?.sortOrder ?? Number.MAX_SAFE_INTEGER;
    return leftOrder - rightOrder || left.localeCompare(right);
  });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: 8,
  padding: "7px 12px",
  borderTop: "1px solid var(--line)",
};

const labelStyle: React.CSSProperties = { width: 92, flexShrink: 0 };

const fieldStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  background: "var(--bg-2)",
  color: "var(--fg)",
  border: "1px solid var(--line)",
  borderRadius: 2,
  padding: "3px 6px",
  fontFamily: "inherit",
  fontSize: 13,
};

/**
 * The one correction surface in the app. Library `Needs review`, catalogue
 * detail, history rows, and the Today drawer all open this same sheet, so the
 * three supported actions cannot drift apart between entry points.
 *
 * Two rules it exists to enforce:
 *
 * 1. **Validation precedes every write.** The pending override is passed
 *    through `validateNormalizationOverrideInput` — the repository's own
 *    validator, not a second opinion — and a failing draft is reported without
 *    a write being attempted.
 * 2. **Replacing a remembered alias is deliberate.** This is the only place in
 *    the app allowed to overwrite an occupied normalized token, and it does so
 *    only through `aliasRepo.replaceRemembered` after the user confirms which
 *    mapping they are discarding.
 */
export function ExerciseCorrectionSheet({
  target,
  onClose,
}: Readonly<{ target: CorrectionTarget; onClose: () => void }>) {
  const { context, resolve, loaded } = useExerciseNormalization();
  const targetKey = correctionTargetKey(target);
  // Two sheets can be open at once — one under a `Needs review` row, one inside
  // an expanded catalogue row. Shared literal ids would cross their labels, and
  // a shared radio `name` would make selecting an action in one silently clear
  // the other's.
  const fieldId = useId();

  const [mode, setMode] = useState<CorrectionMode>("assign");
  // `null` means "follow the stored identity". Stored values arrive after
  // IndexedDB answers and change again after a save, and the draft must not be
  // pinned to whatever was on screen first — but once the user edits, their
  // edit wins.
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mappedExerciseId, setMappedExerciseId] = useState("");
  const [versionQuery, setVersionQuery] = useState("");
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);

  useEffect(() => {
    setMode("assign");
    setDraft(null);
    setMappedExerciseId("");
    setVersionQuery("");
    setReplaceConfirmed(false);
    setSaved(null);
    setWriteError(null);
  }, [targetKey]);

  const movements = useMemo(
    () => [...context.movementsById.values()].sort((left, right) =>
      left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)),
    [context.movementsById],
  );
  const userExerciseIds = useMemo(
    () => new Set(context.userExercises.map((exercise) => exercise.id)),
    [context.userExercises],
  );
  // Capped on purpose. The catalogue is >3,000 entries, and a select holding
  // all of them is unusable on a phone and expensive to render on every
  // keystroke; the filter above it is the real instrument. The hidden count is
  // shown rather than silently dropped, so the list never lies about how many
  // versions matched.
  const versionMatches = useMemo(() => {
    const query = normalizeExerciseName(versionQuery);
    const entries = [...context.catalogById.values()];
    const matches = query
      ? entries.filter((item) =>
        normalizeExerciseName(item.name).includes(query) ||
        item.aliases.some((alias) => normalizeExerciseName(alias).includes(query)))
      : entries;
    return matches.sort((left, right) => left.name.localeCompare(right.name));
  }, [context.catalogById, versionQuery]);
  const versionOptions = versionMatches.slice(0, VERSION_OPTION_LIMIT);

  const stored = resolve(identityInputFor(target));
  const current: Draft = draft ?? {
    movementId: stored.movementId ?? null,
    modifierIds: [...stored.movementModifierIds],
  };
  const movement = current.movementId ? context.movementsById.get(current.movementId) : undefined;
  const modifierOptions = useMemo(
    () =>
      (movement?.allowedModifierIds ?? [])
        .map((modifierId) => context.modifiersById.get(modifierId))
        .filter((definition): definition is MovementModifierDefinition => definition !== undefined)
        .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)),
    [movement, context.modifiersById],
  );

  const overrideInput: NormalizationOverrideSaveInput = {
    ...overrideTargetFor(target),
    movementId: current.movementId,
    movementModifierIds: canonicalOrder(current.modifierIds, context.modifiersById),
  };

  function validationErrorFor(input: NormalizationOverrideSaveInput): string | null {
    try {
      validateNormalizationOverrideInput(input, userExerciseIds);
      return null;
    } catch (error) {
      return messageOf(error);
    }
  }

  const draftError = validationErrorFor(overrideInput);

  const existingAlias = target.kind === "normalized-name"
    ? context.aliases.find((alias) =>
      normalizeExerciseName(alias.normalizedAlias || alias.alias) === normalizeExerciseName(target.value))
    : undefined;
  const occupiedAlias = existingAlias && existingAlias.canonicalExerciseId !== mappedExerciseId
    ? existingAlias
    : undefined;
  const occupiedByLabel = occupiedAlias
    ? context.catalogById.get(occupiedAlias.canonicalExerciseId)?.name
      ?? context.userExercises.find((exercise) => exercise.id === occupiedAlias.canonicalExerciseId)?.name
      ?? occupiedAlias.canonicalExerciseId
    : undefined;

  const alert = mode === "map"
    ? writeError
      ?? (occupiedAlias
        ? `“${correctionTargetLabel(target)}” already maps to ${occupiedByLabel}. Confirm below to replace it.`
        : null)
    : writeError ?? draftError;

  function describe(input: NormalizationOverrideSaveInput): string {
    if (!input.movementId) return "Saved — returned to standalone.";
    const movementName = context.movementsById.get(input.movementId)?.name ?? input.movementId;
    const modifierNames = input.movementModifierIds.map(
      (modifierId) => context.modifiersById.get(modifierId)?.name ?? modifierId,
    );
    return `Saved — ${[movementName, ...modifierNames].join(" · ")}`;
  }

  async function writeOverride(input: NormalizationOverrideSaveInput) {
    setSaved(null);
    // Validation first, always. A rejected draft must not reach a repository
    // call at all — the repository validates as well, but a surface that
    // writes first and asks later is how a half-applied correction happens.
    const error = validationErrorFor(input);
    if (error) {
      setWriteError(error);
      return;
    }
    try {
      await normalizationOverrideRepo.save(input);
      // Show what was written, not what was on screen: the provider reload is
      // in flight, so following the stored identity here would flash the old
      // classification for a frame.
      setDraft({ movementId: input.movementId, modifierIds: input.movementModifierIds });
      setWriteError(null);
      setSaved(describe(input));
    } catch (failure) {
      setWriteError(messageOf(failure));
    }
  }

  async function writeAliasMapping() {
    setSaved(null);
    if (!mappedExerciseId) {
      setWriteError("Choose a concrete version first.");
      return;
    }
    const input = {
      alias: correctionTargetLabel(target),
      canonicalExerciseId: mappedExerciseId,
      provenance: "remembered" as const,
    };
    if (occupiedAlias && !replaceConfirmed) {
      setWriteError(`“${input.alias}” already maps to ${occupiedByLabel}. Confirm the replacement first.`);
      return;
    }
    try {
      // The one sanctioned overwrite in the app: one transaction that drops the
      // row holding the token and inserts the new remembered target.
      if (occupiedAlias) await aliasRepo.replaceRemembered(input);
      else await aliasRepo.save(input);
      setWriteError(null);
      setReplaceConfirmed(false);
      setSaved(`Saved — “${input.alias}” now means ${context.catalogById.get(mappedExerciseId)?.name ?? mappedExerciseId}.`);
    } catch (failure) {
      setWriteError(messageOf(failure));
    }
  }

  function toggleModifier(modifierId: string) {
    setSaved(null);
    setWriteError(null);
    setDraft({
      movementId: current.movementId,
      modifierIds: current.modifierIds.includes(modifierId)
        ? current.modifierIds.filter((candidate) => candidate !== modifierId)
        : [...current.modifierIds, modifierId],
    });
  }

  return (
    <section
      aria-label={`Correct ${correctionTargetLabel(target)}`}
      // Flat at rest, per DESIGN: the sheet is raised by a hairline, not a fill,
      // so it reads correctly on both the panel it opens inside (--bg-2) and the
      // expanded catalogue row it opens inside (--bg-3).
      style={{
        border: "1px solid var(--line-strong)",
        borderRadius: "var(--r)",
        overflow: "hidden",
      }}
    >
      <header style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px" }}>
        <span className="tx-up" style={{ color: "var(--fg-4)" }}>correction</span>
        <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {correctionTargetLabel(target)}
        </span>
        <span className="tx-mono" style={{ fontSize: 10, color: "var(--fg-4)" }}>{KIND_TAG[target.kind]}</span>
        <button
          type="button"
          className="btn ghost"
          aria-label="Close"
          onClick={onClose}
          style={{ marginLeft: "auto", padding: "2px 4px" }}
        >
          <X size={12} />
        </button>
      </header>

      {!loaded ? (
        <p style={{ ...rowStyle, fontSize: 12, color: "var(--fg-3)" }}>Reading stored corrections…</p>
      ) : (
        <>
          {target.kind === "normalized-name" && (
            <fieldset style={{ ...rowStyle, border: "none", margin: 0 }}>
              <legend className="tx-up" style={{ float: "left", ...labelStyle }}>action</legend>
              {([
                ["assign", "Assign a primary movement"],
                ["map", "Map to an existing exercise"],
              ] as const).map(([value, text]) => (
                <label
                  key={value}
                  className="tap-target"
                  style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}
                >
                  <input
                    type="radio"
                    name={`${fieldId}-action`}
                    checked={mode === value}
                    onChange={() => {
                      setMode(value);
                      setWriteError(null);
                      setSaved(null);
                    }}
                  />
                  {text}
                </label>
              ))}
            </fieldset>
          )}

          {mode === "assign" ? (
            <>
              <div style={rowStyle}>
                <label className="tx-up" htmlFor={`${fieldId}-movement`} style={labelStyle}>
                  Primary movement
                </label>
                <select
                  id={`${fieldId}-movement`}
                  value={current.movementId ?? ""}
                  onChange={(event) => {
                    setSaved(null);
                    setWriteError(null);
                    setDraft({ movementId: event.target.value || null, modifierIds: [] });
                  }}
                  style={fieldStyle}
                >
                  <option value="">standalone — no movement</option>
                  {movements.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
              </div>

              {modifierOptions.length > 0 && (
                <div style={{ ...rowStyle, flexWrap: "wrap", rowGap: 2 }}>
                  <span className="tx-up" style={labelStyle}>modifiers</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 10px", flex: 1, minWidth: 0 }}>
                    {modifierOptions.map((option) => (
                      <label
                        key={option.id}
                        className="tap-target"
                        style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}
                      >
                        <input
                          type="checkbox"
                          checked={current.modifierIds.includes(option.id)}
                          onChange={() => toggleModifier(option.id)}
                        />
                        {option.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={rowStyle}>
                <label className="tx-up" htmlFor={`${fieldId}-version-filter`} style={labelStyle}>filter</label>
                <input
                  id={`${fieldId}-version-filter`}
                  value={versionQuery}
                  onChange={(event) => setVersionQuery(event.target.value)}
                  placeholder="narrow the list…"
                  style={fieldStyle}
                />
              </div>
              <div style={rowStyle}>
                <label className="tx-up" htmlFor={`${fieldId}-version`} style={labelStyle}>Concrete version</label>
                <select
                  id={`${fieldId}-version`}
                  value={mappedExerciseId}
                  onChange={(event) => {
                    setSaved(null);
                    setWriteError(null);
                    setMappedExerciseId(event.target.value);
                  }}
                  style={fieldStyle}
                >
                  <option value="">choose a version…</option>
                  {versionOptions.map((option) => (
                    <option key={option.id} value={option.id}>{option.name}</option>
                  ))}
                </select>
                {versionMatches.length > versionOptions.length && (
                  <span className="tx-mono" style={{ fontSize: 10, color: "var(--fg-4)", flexShrink: 0 }}>
                    +{versionMatches.length - versionOptions.length}
                  </span>
                )}
              </div>
              {occupiedAlias && (
                <div style={rowStyle}>
                  <span className="tx-up" style={labelStyle}>replace</span>
                  <label
                    className="tap-target"
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={replaceConfirmed}
                      onChange={() => {
                        setWriteError(null);
                        setReplaceConfirmed((confirmed) => !confirmed);
                      }}
                    />
                    Replace the existing mapping
                  </label>
                </div>
              )}
            </>
          )}

          {alert && (
            <p role="alert" style={{ ...rowStyle, fontSize: 12, color: "var(--bad)", margin: 0 }}>
              {alert}
            </p>
          )}
          {saved && !alert && (
            <p role="status" style={{ ...rowStyle, fontSize: 12, color: "var(--fg-2)", margin: 0 }}>
              {saved}
            </p>
          )}

          <div style={{ ...rowStyle, gap: 6, justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn"
              onClick={() => {
                void writeOverride({ ...overrideTargetFor(target), movementId: null, movementModifierIds: [] });
              }}
            >
              Return to standalone
            </button>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                void (mode === "map" ? writeAliasMapping() : writeOverride(overrideInput));
              }}
            >
              Save correction
            </button>
          </div>
        </>
      )}
    </section>
  );
}
