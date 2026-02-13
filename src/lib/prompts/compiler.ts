import { TRAINER_PERSONAS } from '@/lib/trainers/personas';

export interface PromptCompilerInput {
  primaryGoal: string;
  durationWeeks: number;
  daysPerWeek: number;
  equipment: string;
  constraints: string;
  selectedPersonaIds: string[];
}

const CORE_EXPORT_INSTRUCTION = `You must output ONLY valid JSON that conforms exactly to the routine schema below.
Do not include markdown, code fences, or commentary.
If any field is unknown, omit it (do not invent data).

Schema (version "1.0"):
- schema_version (string, required)
- title (string, required)
- duration_weeks (integer, required)
- days_per_week (integer, required)
- goals (array of strings, optional)
- equipment (array of strings, optional)
- notes (string, optional)
- weeks (array, required)
  - week_number (integer, required, 1-based)
  - days (array, required)
    - day_number (integer, required, 1-based)
    - title (string, required)
    - focus (array of strings, optional)
    - exercises (array, required)
      - exercise_id (string, required, unique within routine)
      - name (string, required)
      - movement_pattern (string, optional)
      - primary_muscles (array of strings, optional)
      - secondary_muscles (array of strings, optional)
      - rest_seconds (integer, optional)
      - tempo (string, optional)
      - notes (string, optional)
      - alternatives (array of strings, optional)
      - sets (array, required)
        - set_number (integer, required, 1-based)
        - reps (integer, required)
        - target_rpe (number, optional)
        - target_weight (number, optional)
        - rep_range (string, optional)`;

function buildPersonaBlock(personaIds: string[]): string {
  if (personaIds.length === 0) {
    return 'Use a balanced general-strength coaching style with clear progressions and joint-friendly substitutions.';
  }

  const selected = Object.values(TRAINER_PERSONAS).filter((persona) =>
    personaIds.includes(persona.id)
  );

  return selected
    .map((persona) => {
      const style = persona.programmingStyle;
      return `Persona: ${persona.name} (${persona.specialty})
- Methodology: ${persona.methodology}
- Focus areas: ${persona.focusAreas.join(', ')}
- Typical exercises: ${persona.typicalExercises.join(', ')}
- Programming style: volume ${style.volumePreference}, intensity ${style.intensityPreference}, frequency ${style.frequencyPreference}, rest ${style.restPeriods}
- Conversation style: ${persona.conversationStyle}`;
    })
    .join('\n\n');
}

export function compileRoutinePrompt(input: PromptCompilerInput): string {
  const personaSection = buildPersonaBlock(input.selectedPersonaIds);

  return `Create a ${input.durationWeeks}-week workout routine for the primary goal: ${input.primaryGoal}.
Training frequency: ${input.daysPerWeek} days per week.
Available equipment: ${input.equipment || 'none specified'}.
Constraints and preferences: ${input.constraints || 'none specified'}.

Use the following coaching persona guidance:
${personaSection}

When designing the program:
- Include progressive overload week-to-week.
- Provide alternatives where useful.
- Respect constraints and avoid movements likely to aggravate injuries.
- Keep day titles and focus clear.

${CORE_EXPORT_INSTRUCTION}`;
}

export function getExportInstruction(): string {
  return CORE_EXPORT_INSTRUCTION;
}
