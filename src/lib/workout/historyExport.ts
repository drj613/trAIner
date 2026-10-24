import { resolveExerciseIdentity, type ExerciseIdentityContext } from "@/lib/catalog/identity";
import type { ProgramDocument, WorkoutLogDocument } from "@/lib/programs/types";
import { getRenderableDays } from "@/lib/programs/overrides";
import { logLocalDate, sortableStamp } from "./localDate";

export type HistoryExportSelection = {
	routine: { kind: "all" } | { kind: "one"; programId: string };
	from?: string;
	through?: string;
};

export type HistoryExportInput = {
	logs: readonly WorkoutLogDocument[];
	programs: readonly ProgramDocument[];
	context: ExerciseIdentityContext;
	selection: HistoryExportSelection;
};

export type HistoryExportResult =
	| { ok: false; field: "from" | "through" | "routine"; message: string }
	| {
			ok: true;
			text: string;
			fileName: string;
			summary: {
				sessions: number;
				entries: number;
				sets: number;
				warnings: number;
				excludedUndated: number;
			};
			canExport: boolean;
		};

type RecordValue = Record<string, unknown>;
type IndexedRecord = { value: RecordValue; index: number; date: string; stamp: string; id: string };

function compareText(left: string, right: string): number {
	return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is RecordValue {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRoutineId(value: unknown): value is string {
	return typeof value === "string" && value.trim().length > 0;
}

function hasValue(value: unknown): boolean {
	return value !== undefined && value !== null;
}

function readStatusTimestamp(value: unknown): { present: boolean; malformed: boolean } {
	if (value === undefined || value === null) return { present: false, malformed: false };
	if (typeof value !== "string") return { present: false, malformed: true };
	if (!value.trim()) return { present: false, malformed: false };
	return Number.isFinite(Date.parse(value))
		? { present: true, malformed: false }
		: { present: false, malformed: true };
}

function dateIsValid(value: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	const [year, month, day] = value.split("-").map(Number);
	const date = new Date(Date.UTC(year, month - 1, day));
	return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function quote(value: string): string {
	return JSON.stringify(value);
}

function optionalText(value: unknown): { text?: string; malformed: boolean } {
	if (value === undefined || value === null) return { malformed: false };
	if (typeof value !== "string") return { malformed: true };
	if (!value.trim()) return { malformed: false };
	return { text: value, malformed: false };
}

function programDayTitle(programs: readonly ProgramDocument[], programId: string, dayId: string): string | undefined {
	for (const rawProgram of programs as readonly unknown[]) {
		if (!isRecord(rawProgram) || rawProgram.id !== programId) continue;
		let days: unknown[] = Array.isArray(rawProgram.days) ? rawProgram.days : [];
		try {
			days = getRenderableDays(rawProgram as unknown as ProgramDocument);
		} catch {
			// Preserve the readable base-day title if a malformed override cannot be applied.
		}
		for (const rawDay of days) {
			if (isRecord(rawDay) && rawDay.id === dayId && typeof rawDay.title === "string" && rawDay.title.trim()) return rawDay.title;
		}
	}
	return undefined;
}

/** Deterministic options for routines present in the current library or history. */
export function historyRoutineOptions(
	logs: readonly WorkoutLogDocument[],
	programs: readonly ProgramDocument[],
): { value: string; label: string }[] {
	const titles = new Map<string, string>();
	for (const value of programs as readonly unknown[]) {
		if (isRecord(value) && isRoutineId(value.id) && typeof value.title === "string") titles.set(value.id, value.title);
	}
	const ids = new Set(titles.keys());
	for (const value of logs as readonly unknown[]) {
		if (isRecord(value) && isRoutineId(value.programId)) ids.add(value.programId);
	}
	const sortedIds = [...ids].sort(compareText);
	const missing = new Map<string, string>();
	let missingIndex = 0;
	for (const id of sortedIds) {
		if (!titles.has(id)) missing.set(id, `Unavailable routine ${++missingIndex}`);
	}
	const duplicateCounts = new Map<string, number>();
	for (const id of sortedIds) {
		const title = titles.get(id);
		if (title !== undefined) duplicateCounts.set(title, (duplicateCounts.get(title) ?? 0) + 1);
	}
	const duplicateOrdinals = new Map<string, number>();
	return sortedIds.map((id) => {
		const title = titles.get(id);
		if (title === undefined) return { value: id, label: missing.get(id)! };
		if ((duplicateCounts.get(title) ?? 0) < 2) return { value: id, label: title };
		const ordinal = (duplicateOrdinals.get(title) ?? 0) + 1;
		duplicateOrdinals.set(title, ordinal);
		return { value: id, label: `${title} (${ordinal})` };
	});
}

function marker(state: { warnings: number }, name: string): string {
	state.warnings += 1;
	return `!${name}`;
}

function renderSet(rawSet: unknown, state: { warnings: number }): { line?: string; data: boolean } {
	if (!isRecord(rawSet)) return { line: marker(state, "unreadable-set"), data: false };
	const validNumber = typeof rawSet.setNumber === "number" && Number.isInteger(rawSet.setNumber) && rawSet.setNumber > 0;
	const rawText = optionalText(rawSet.rawCell);
	const noteText = optionalText(rawSet.notes);
	const malformedUnit = hasValue(rawSet.unit) && rawSet.unit !== "lb" && rawSet.unit !== "kg";
	const data = hasValue(rawSet.weight) || hasValue(rawSet.reps) || hasValue(rawSet.rpe)
		|| rawText.text !== undefined || rawText.malformed || noteText.text !== undefined || noteText.malformed
		|| malformedUnit || (hasValue(rawSet.setNumber) && !validNumber);
	if (!data) return { data: false };
	const rendered: string[] = [];
	const number = rawSet.setNumber;
	if (validNumber) rendered.push(`#${number as number}`);
	else rendered.push(`#?`, marker(state, "unreadable-set-number"));

	let weight: number | undefined;
	let reps: number | undefined;
	let rpe: number | undefined;
	let unit: "lb" | "kg" | "?unit" = "lb";
	if (hasValue(rawSet.weight)) {
		if (typeof rawSet.weight === "number" && Number.isFinite(rawSet.weight)) weight = rawSet.weight;
		else rendered.push(marker(state, "unreadable-weight"));
	}
	if (hasValue(rawSet.reps)) {
		if (typeof rawSet.reps === "number" && Number.isFinite(rawSet.reps)) reps = rawSet.reps;
		else rendered.push(marker(state, "unreadable-reps"));
	}
	if (hasValue(rawSet.rpe)) {
		if (typeof rawSet.rpe === "number" && Number.isFinite(rawSet.rpe)) rpe = rawSet.rpe;
		else rendered.push(marker(state, "unreadable-rpe"));
	}
	if (hasValue(rawSet.unit)) {
		if (rawSet.unit === "lb" || rawSet.unit === "kg") unit = rawSet.unit;
		else {
			unit = "?unit";
			rendered.push(marker(state, "unreadable-unit"));
		}
	}
	if (weight !== undefined || reps !== undefined) {
		const left = weight === undefined ? "?" : `${weight}${unit === "?unit" ? "?unit" : unit}`;
		rendered.push(`${left}x${reps === undefined ? "?" : reps}`);
	}
	if (rpe !== undefined) rendered.push(`@${rpe}`);
	if (rawText.malformed) rendered.push(marker(state, "unreadable-raw-cell"));
	else if (rawText.text !== undefined) rendered.push(`raw:${quote(rawText.text)}`);
	if (noteText.malformed) rendered.push(marker(state, "unreadable-set-note"));
	else if (noteText.text !== undefined) rendered.push(`note:${quote(noteText.text)}`);
	return { line: rendered.join(" "), data: true };
}

function entryName(entry: RecordValue, context: ExerciseIdentityContext): { name: string; version?: string; malformed: boolean } {
	const performed = optionalText(entry.exerciseName);
	if (performed.malformed) return { name: "Unnamed exercise", malformed: true };
	let version: string | undefined;
	if (typeof entry.exerciseId === "string" && entry.exerciseId.length > 0) {
		try {
			const identity = resolveExerciseIdentity({
				kind: "stored-exercise",
				slotId: entry.exerciseId,
				...(typeof entry.canonicalExerciseId === "string" ? { canonicalExerciseId: entry.canonicalExerciseId } : {}),
				...(performed.text === undefined ? {} : { performedName: performed.text }),
			}, context);
			if (performed.text !== undefined && typeof identity.currentVersionLabel === "string" && identity.currentVersionLabel.trim()
				&& identity.currentVersionLabel !== performed.text) version = identity.currentVersionLabel;
			if (performed.text === undefined && identity.displayLabel.trim() && identity.displayLabel !== entry.exerciseId
				&& identity.displayLabel !== entry.canonicalExerciseId) {
				return { name: identity.displayLabel, version, malformed: false };
			}
		} catch {
			// A damaged identity context must not hide otherwise readable history.
		}
	}
	return { name: performed.text ?? "Unnamed exercise", version, malformed: false };
}

function renderSession(raw: RecordValue, date: string, routineLabels: ReadonlyMap<string, string>, programs: readonly ProgramDocument[], context: ExerciseIdentityContext, state: { warnings: number }): { lines: string[]; entries: number; sets: number; meaningful: boolean; conflict: boolean } {
	const rawProgramId = raw.programId;
	const validProgramId = isRoutineId(rawProgramId);
	const programId = validProgramId ? rawProgramId : "";
	const routine = validProgramId ? routineLabels.get(programId) ?? "Unavailable routine 1" : "Unknown routine";
	const dayId = typeof raw.dayId === "string" ? raw.dayId : "";
	const snapshot = isRecord(raw.prescriptionSnapshot) && typeof raw.prescriptionSnapshot.title === "string" && raw.prescriptionSnapshot.title.trim()
		? raw.prescriptionSnapshot.title : undefined;
	const day = snapshot ?? programDayTitle(programs, programId, dayId) ?? "Unavailable day";
	const completedStatus = readStatusTimestamp(raw.completedAt);
	const skippedStatus = readStatusTimestamp(raw.skippedAt);
	const completed = completedStatus.present;
	const skipped = skippedStatus.present;
	const conflict = completed && skipped;
	if (conflict) state.warnings += 1;
	const status = conflict ? "conflicting-status" : completed ? "completed" : skipped ? "skipped" : "in-progress";
	const lines = [`${date || "date-unknown"} | routine:${quote(routine)} | day:${quote(day)} | ${status}`];
	if (!validProgramId) lines.push(marker(state, "unreadable-routine"));
	if (completedStatus.malformed) lines.push(marker(state, "unreadable-completed-at"));
	if (skippedStatus.malformed) lines.push(marker(state, "unreadable-skipped-at"));
	let entries = 0;
	let sets = 0;
	let meaningful = !validProgramId || completed || skipped || completedStatus.malformed || skippedStatus.malformed;

	if (!Array.isArray(raw.entries)) {
		lines.push(`!unreadable-entries-container`);
		state.warnings += 1;
		meaningful = true;
	} else {
		for (const rawEntry of raw.entries) {
			if (!isRecord(rawEntry)) {
				lines.push(marker(state, "unreadable-entry"));
				meaningful = true;
				continue;
			}
			const entryLines: string[] = [];
			let entrySets = 0;
			let entryData = false;
			const setLines: string[] = [];
			if (!Array.isArray(rawEntry.sets)) {
				entryData = true;
				setLines.push(marker(state, "unreadable-sets-container"));
			} else {
				for (const rawSet of rawEntry.sets) {
					const rendered = renderSet(rawSet, state);
				if (rendered.line) {
					entryData = true;
					setLines.push(rendered.line);
				}
				if (rendered.data) entrySets += 1;
				}
			}
			const entryNote = optionalText(rawEntry.notes);
			const performedName = optionalText(rawEntry.exerciseName);
			if (performedName.malformed) {
				entryData = true;
				entryLines.push(marker(state, "unreadable-exercise-name"));
			}
			if (entryNote.malformed) {
				entryData = true;
				entryLines.push(marker(state, "unreadable-entry-note"));
			} else if (entryNote.text !== undefined) {
				entryData = true;
				entryLines.push(`  entry-note:${quote(entryNote.text)}`);
			}
			if (!entryData) continue;
			const identity = entryName(rawEntry, context);
			const name = quote(identity.name) + (identity.version ? ` (version:${quote(identity.version)})` : "");
			lines.push(`${name}:${setLines.length ? ` ${setLines.join("; ")}` : ""}${entryLines.length ? `\n${entryLines.join("\n")}` : ""}`);
			entries += 1;
			sets += entrySets;
			meaningful = true;
		}
	}
	if (hasValue(raw.unreadableEntries)) {
		lines.push(marker(state, "unreadable-entries"));
		meaningful = true;
	}
	for (const [field, label] of [["notes", "session-note"], ["dayNote", "day-note"], ["skipReason", "skip-reason"]] as const) {
		const text = optionalText(raw[field]);
		if (text.malformed) {
			lines.push(marker(state, `unreadable-${label}`));
			meaningful = true;
		} else if (text.text !== undefined) {
			lines.push(`${label}:${quote(text.text)}`);
			meaningful = true;
		}
	}
	return { lines, entries, sets, meaningful, conflict };
}

function validLogDate(raw: RecordValue): string {
	const date = logLocalDate({ performedDate: raw.performedDate as string | undefined, performedAt: raw.performedAt as string });
	return dateIsValid(date) ? date : "";
}

/** Build deterministic, loss-aware plain-text history without side effects. */
export function buildHistoryExport(input: HistoryExportInput): HistoryExportResult {
	const { selection } = input;
	const from = selection.from || undefined;
	const through = selection.through || undefined;
	if (from && !dateIsValid(from)) return { ok: false, field: "from", message: "Enter a valid From date." };
	if (through && !dateIsValid(through)) return { ok: false, field: "through", message: "Enter a valid Through date." };
	if (from && through && from > through) return { ok: false, field: "through", message: "Through date must be on or after From date." };
	const options = historyRoutineOptions(input.logs, input.programs);
	const routineLabels = new Map(options.map((option) => [option.value, option.label]));
	const selectedProgramId = selection.routine.kind === "one" ? selection.routine.programId : undefined;
	if (selectedProgramId !== undefined && !options.some((option) => option.value === selectedProgramId)) {
		return { ok: false, field: "routine", message: "Choose an available routine." };
	}
	const routineLabel = selectedProgramId === undefined ? undefined : options.find((option) => option.value === selectedProgramId)?.label;
	const filtered = selection.routine.kind === "one" || Boolean(from || through);
	const state = { warnings: 0 };
	let excludedUndated = 0;
	let excludedUnreadable = 0;
	const eligible: IndexedRecord[] = [];
	const malformed: { index: number }[] = [];
	(input.logs as readonly unknown[]).forEach((value, index) => {
		if (!isRecord(value)) {
			if (filtered) {
				excludedUnreadable += 1;
				state.warnings += 1;
			} else malformed.push({ index });
			return;
		}
		if (selection.routine.kind === "one") {
			if (!isRoutineId(value.programId)) {
				excludedUnreadable += 1;
				state.warnings += 1;
				return;
			}
			if (value.programId !== selection.routine.programId) return;
		}
		const date = validLogDate(value);
		if ((from || through) && !date) {
			excludedUndated += 1;
			state.warnings += 1;
			return;
		}
		if (from && date < from || through && date > through) return;
		eligible.push({ value, index, date, stamp: sortableStamp(value.performedAt), id: typeof value.id === "string" ? value.id : "" });
	});
	eligible.sort((left, right) => {
		if (left.date !== right.date) {
			if (!left.date) return 1;
			if (!right.date) return -1;
			return compareText(left.date, right.date);
		}
		return compareText(left.stamp, right.stamp) || compareText(left.id, right.id) || left.index - right.index;
	});
	const sections: string[] = [];
	let entries = 0;
	let sets = 0;
	for (const item of eligible) {
		const session = renderSession(item.value, item.date, routineLabels, input.programs, input.context, state);
		if (!session.meaningful) continue;
		sections.push(session.lines.join("\n"));
		entries += session.entries;
		sets += session.sets;
	}
	const summary = { sessions: sections.length, entries, sets, warnings: state.warnings, excludedUndated };
	const scope = selection.routine.kind === "all" ? "all routines" : quote(routineLabel ?? "Unavailable routine 1");
	const dates = from || through ? `${from ?? "*"}..${through ?? "*"}; local, inclusive` : "all; local, inclusive";
	const header = [
		"trAIner workout history v1",
		`scope: ${scope}`,
		`dates: ${dates}`,
		`sessions: ${summary.sessions}; entries: ${entries}; sets: ${sets}; warnings: ${state.warnings}; excluded-undated: ${excludedUndated}`,
		"sets: #number weight-unit x reps @RPE; ?=unrecorded; quoted text=recorded text",
	];
	if (excludedUnreadable) header.push(`notice: ${excludedUnreadable} unreadable session${excludedUnreadable === 1 ? " was" : "s were"} excluded by filtering`);
	const content = [...malformed.sort((a, b) => a.index - b.index).map(() => marker(state, "unreadable-session")), ...sections];
	// Marker counts are finalized after malformed sessions are rendered.
	const finalSummary = { ...summary, warnings: state.warnings };
	header[3] = `sessions: ${finalSummary.sessions}; entries: ${entries}; sets: ${sets}; warnings: ${finalSummary.warnings}; excluded-undated: ${excludedUndated}`;
	if (finalSummary.sessions === 0 && content.length === 0) content.push("No workouts in this range");
	const dateSuffix = from || through ? `${from ?? "start"}_${through ?? "end"}` : "all";
	const fileName = `trAIner-history-${selection.routine.kind === "all" ? "all" : "routine"}-${dateSuffix}.txt`;
	return {
		ok: true,
		text: `${[...header, ...(content.length ? ["", ...content] : [])].join("\n")}\n`,
		fileName,
		summary: finalSummary,
		canExport: summary.sessions > 0 || state.warnings > 0,
	};
}
