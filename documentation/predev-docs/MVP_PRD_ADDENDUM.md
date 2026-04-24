# MVP Requirements Update Addendum
Date: 2026-02-02

This addendum updates the MVP requirements based on the revised product direction. It does not replace the long-term vision in `FULL_PRD.md`, but it supersedes the MVP scope and Phase 1 roadmap details.

## 1. MVP Summary
The MVP centers on a strict, LLM-agnostic JSON export format for workout routines, an ingestion API that validates and stores that JSON, and a lightweight UI for set-level weight tracking (progressive overload). Conversational AI and in-app trainer personas are deferred.

## 2. MVP Goals
- Define a stable routine JSON schema with versioning and validation rules.
- Provide a reusable LLM export prompt that guarantees schema-conformant JSON.
- Offer a glossary of trainer/personality prompts to shape routines.
- Ingest routines via API and persist them to the database.
- Track weights and reps at the set level for each exercise.
- Keep the flow non-invasive: users generate routines in their existing LLM chat workflow.

## 3. In Scope (MVP)
- Routine JSON schema with semantic constraints (required fields, types, ranges).
- LLM export prompt template with explicit JSON-only output instructions.
- Prompt glossary for distinct training styles (prompt-only, external LLM).
- Prompt compiler UI that assembles copy-ready prompts.
- Routine ingestion API with validation and error reporting.
- Routine viewer UI with set-level logging (weight, reps, optional RPE/notes).
- Local-first SQLite persistence.

## 4. Out of Scope (MVP)
- In-app conversational AI or trainer chat.
- Automatic routine generation inside the app.
- Trainer matching, hybrid trainers, or persona switching.
- Advanced analytics, heat maps, or exercise video libraries.
- Export formats beyond the JSON import (Sheets/CSV/PDF).

## 5. Routine JSON Schema (MVP Draft)
The schema is intentionally minimal but extendable. A version field is required for forward compatibility.

**Top-level structure**
- `schema_version` (string, required, example: "1.0")
- `routine_id` (string, optional; generated if omitted)
- `title` (string, required)
- `duration_weeks` (integer, required, min 1)
- `days_per_week` (integer, required, min 1)
- `goals` (array of strings, optional)
- `equipment` (array of strings, optional)
- `notes` (string, optional)
- `weeks` (array, required)

**Week**
- `week_number` (integer, required, 1-based)
- `days` (array, required)

**Day**
- `day_number` (integer, required, 1-based)
- `title` (string, required)
- `focus` (array of strings, optional)
- `exercises` (array, required)

**Exercise**
- `exercise_id` (string, required, unique within routine)
- `name` (string, required)
- `movement_pattern` (string, optional)
- `primary_muscles` (array of strings, optional)
- `secondary_muscles` (array of strings, optional)
- `rest_seconds` (integer, optional)
- `tempo` (string, optional)
- `notes` (string, optional)
- `alternatives` (array of strings, optional)
- `sets` (array, required)

**Set**
- `set_number` (integer, required, 1-based)
- `reps` (integer, required)
- `target_rpe` (number, optional)
- `target_weight` (number, optional)
- `rep_range` (string, optional, example: "8-12")

## 6. LLM Export Prompt Template (MVP)
Use this template as the final instruction in the LLM session:

```
You must output ONLY valid JSON that conforms exactly to the routine schema below.
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
        - rep_range (string, optional)
```

## 7. Trainer/Personality Prompt Glossary (MVP)
Use any of these as additional system/user prompts in the same LLM session, before the export template:
- **Hypertrophy Volume Specialist**: Emphasize volume landmarks, exercise variety, and moderate rep ranges.
- **Strength Fundamentals Coach**: Prioritize compound lifts, linear progression, and technical mastery.
- **Mobility & Movement Coach**: Add prehab, mobility drills, and low-impact substitutions.
- **Powerlifting Analyst**: Focus on squat/bench/deadlift variations and intensity management.
- **Minimalist Strength**: Few exercises, full-body emphasis, high consistency.
- **Kettlebell Specialist**: Ballistics, strength endurance, and single-tool programming.
- **Bodyweight Progressions**: Calisthenics skill progressions and minimal equipment.
- **Functional Fitness Generalist**: Mixed modalities, conditioning finishers, athletic balance.

## 8. API Requirements (MVP)
See **ROUTINE_API_JSON_SPEC.md** for the reusable JSON request/response structures, validation rules, and examples.

- `POST /api/routines`
  - Accepts routine JSON (see ROUTINE_API_JSON_SPEC). Optional envelope with `payload` and `meta` for source/persona traceability.
  - Validates and stores routine.
  - Returns routine ID and validation warnings (if any).
- `GET /api/routines/:id`
  - Returns routine by ID (same JSON structure as accepted on POST).
- `POST /api/workouts`
  - Logs a workout session. Payload: routine_id, date, exercise-level set logs (weight, reps, optional RPE/notes). See ROUTINE_API_JSON_SPEC §6.
- `GET /api/routines/:id/workouts`
  - Returns historical logs for a routine.

## 9. UI Requirements (MVP)
- Routine list and routine detail views.
- Day/workout view with exercises and set targets.
- Set-level inputs for weight and reps (optional RPE/notes).
- Simple history view per exercise (last workout, last weight used).
- Easy exercise swapper (prescribed exercise is X, but alternatives are Y and Z. have quick links to swap X for Y or Z and keep tracking your weight as normal. should be as simple as "changing a row in a spreadsheet")
- UI view for prompt building. Start with base prompt, including instructions for final output. Instructions for final output should include a trigger word. Conversation should be a normal, text-based workflow, and the structured output should only come out at the end when the trigger word is used. On this page, show all the different AI personas available. Selecting a persona will add to the prompt. Copy the whole thing with one click to paste into any LLM you want

## 10. Security & Deployment (MVP)
- No auth in current local-first MVP mode.
- SQLite local file persistence.
- If deploying publicly later, add auth + persistent hosted DB before release.

## 11. Future Enhancements (Non-MVP)
- In-app conversational AI and trainer chat.
- Export to CSV/Sheets/PDF.
- Exercise videos and advanced analytics.
- Trainer matching and hybrid personas.
