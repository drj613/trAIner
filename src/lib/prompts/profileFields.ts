import type { ProfileDocument } from "@/lib/programs/types";

export type FieldGroup = "profile" | "constraints";

export type ProfileField = {
  key: string;
  label: string;
  group: FieldGroup;
  important: boolean;
  hasData: (p: ProfileDocument) => boolean;
  render: (p: ProfileDocument) => string | null;
};

const join = (values: string[] | undefined): string => (values ?? []).join(", ");

export const PROFILE_FIELDS: ProfileField[] = [
  {
    key: "basics",
    label: "Basics (name · days/week)",
    group: "profile",
    important: false,
    hasData: (p) => Boolean(p.name),
    render: (p) => {
      const lines: string[] = [];
      if (p.name) lines.push(`Name: ${p.name}`);
      if (typeof p.defaultDaysPerWeek === "number") {
        lines.push(`Days per week: ${p.defaultDaysPerWeek}`);
      }
      return lines.length ? lines.join("\n") : null;
    },
  },
  {
    key: "history",
    label: "Training history",
    group: "profile",
    important: true,
    hasData: (p) => Boolean(p.trainingAge) || (p.history?.length ?? 0) > 0,
    render: (p) => {
      const lines: string[] = [];
      if (p.trainingAge) lines.push(`Training age: ${p.trainingAge}`);
      if (p.history?.length) lines.push(`Training history: ${join(p.history)}`);
      return lines.length ? lines.join("\n") : null;
    },
  },
  {
    key: "goals",
    label: "Goals",
    group: "profile",
    important: true,
    hasData: (p) => p.goals.length > 0,
    render: (p) => (p.goals.length ? `Goals: ${join(p.goals)}` : null),
  },
  {
    key: "equipment",
    label: "Equipment",
    group: "profile",
    important: true,
    hasData: (p) => p.equipment.length > 0,
    render: (p) => (p.equipment.length ? `Equipment: ${join(p.equipment)}` : null),
  },
  {
    key: "schedule",
    label: "Schedule",
    group: "profile",
    important: true,
    hasData: (p) => (p.schedule?.length ?? 0) > 0,
    render: (p) => (p.schedule?.length ? `Schedule: ${join(p.schedule)}` : null),
  },
  {
    key: "body",
    label: "Body",
    group: "profile",
    important: false,
    hasData: (p) => Object.values(p.body ?? {}).some((v) => v && v !== "—"),
    render: (p) => {
      const b = p.body ?? {};
      const parts: string[] = [];
      if (b.age) parts.push(`age ${b.age}`);
      if (b.height) parts.push(`height ${b.height}`);
      if (b.weight) parts.push(`weight ${b.weight}`);
      if (b.bodyfat) parts.push(`bodyfat ${b.bodyfat}`);
      return parts.length ? `Body: ${parts.join(", ")}` : null;
    },
  },
  {
    key: "preferences",
    label: "Exercise preferences",
    group: "profile",
    important: false,
    hasData: (p) => (p.preferences?.length ?? 0) > 0,
    render: (p) =>
      p.preferences?.length ? `Exercise preferences: ${join(p.preferences)}` : null,
  },
  {
    key: "injuries",
    label: "Injuries",
    group: "constraints",
    important: true,
    hasData: (p) => (p.injuries?.length ? p.injuries : p.constraints).length > 0,
    render: (p) => {
      const items = p.injuries?.length ? p.injuries : p.constraints;
      return items.length ? items.map((i) => `- ${i}`).join("\n") : null;
    },
  },
];

const HARD_CONSTRAINT_DIRECTIVE =
  "Treat listed injuries as precaution flags. Ask about known aggravating movements when needed. Do not knowingly program a reported aggravating movement; provide a pain-free substitution that preserves the intended pattern or stimulus, and note the swap.";

export function buildProfileFieldsBlock(
  profile: ProfileDocument,
  enabled: Set<string>,
): string {
  const chunks = PROFILE_FIELDS.filter(
    (f) => f.group === "profile" && enabled.has(f.key),
  )
    .map((f) => f.render(profile))
    .filter((c): c is string => Boolean(c));
  return chunks.length ? ["## Profile", ...chunks].join("\n") : "";
}

export function buildConstraintsFieldsBlock(
  profile: ProfileDocument,
  enabled: Set<string>,
  extraInjuries: string[] = [],
): string {
  const chunks = PROFILE_FIELDS.filter(
    (f) => f.group === "constraints" && enabled.has(f.key),
  )
    .map((f) => f.render(profile))
    .filter((c): c is string => Boolean(c));
  const extra = extraInjuries
    .map((i) => i.trim())
    .filter(Boolean)
    .map((i) => `- ${i}`);
  const all = [...chunks, ...extra];
  if (!all.length) return "";
  return ["## Injuries & constraints", HARD_CONSTRAINT_DIRECTIVE, ...all].join("\n");
}

export function missingImportantFields(
  profile: ProfileDocument,
  enabled: Set<string>,
  extraInjuries: string[] = [],
): ProfileField[] {
  return PROFILE_FIELDS.filter((f) => {
    if (!f.important || !enabled.has(f.key)) return false;
    if (f.key === "injuries" && extraInjuries.some((i) => i.trim())) return false;
    return !f.hasData(profile);
  });
}
