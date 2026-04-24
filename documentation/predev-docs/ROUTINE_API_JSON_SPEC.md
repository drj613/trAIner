# Routine API JSON Specification
Date: 2026-02-02

This document defines the reusable JSON structures that the routine ingestion API accepts and returns. The same payload shape is used for LLM-generated routine export and for direct API submission.

## 1. Design principles
- **Single schema**: One canonical routine structure for both LLM output and API ingestion.
- **Versioned**: `schema_version` enables forward-compatible validation.
- **Strict but optional**: Required fields are minimal; optional fields may be omitted (never invented).
- **Idempotent IDs**: `routine_id` and `exercise_id` are optional on input; server may generate. When present, they must be unique within scope.

## 2. POST /api/routines — Request body

The API accepts a single JSON object: the **routine document** (optionally wrapped; see 2.2).

### 2.1 Routine document (core payload)

This is the structure that both the LLM and the API use. All fields listed here are part of the reusable JSON structure.

```json
{
  "schema_version": "1.0",
  "routine_id": null,
  "title": "string",
  "duration_weeks": 1,
  "days_per_week": 1,
  "goals": ["string"],
  "equipment": ["string"],
  "notes": "string",
  "weeks": []
}
```

| Field | Type | Required | Constraints | Notes |
|-------|------|----------|-------------|--------|
| `schema_version` | string | Yes | e.g. `"1.0"` | For validation and future migrations |
| `routine_id` | string \| null | No | UUID or slug; unique | Omit or null: server generates |
| `title` | string | Yes | Non-empty | Routine name |
| `duration_weeks` | integer | Yes | ≥ 1 | Program length |
| `days_per_week` | integer | Yes | ≥ 1 | Sessions per week |
| `goals` | string[] | No | — | e.g. hypertrophy, strength |
| `equipment` | string[] | No | — | Available equipment |
| `notes` | string | No | — | Program-level notes |
| `weeks` | Week[] | Yes | Length ≥ 1 | Ordered by week_number |

### 2.2 Week object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `week_number` | integer | Yes | 1-based |
| `days` | Day[] | Yes | Ordered by day_number |

### 2.3 Day object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `day_number` | integer | Yes | 1-based |
| `title` | string | Yes | Non-empty (e.g. "Upper", "Lower") |
| `focus` | string[] | No | — |
| `exercises` | Exercise[] | Yes | `exercise_id` unique within routine |

### 2.4 Exercise object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `exercise_id` | string | Yes | Unique within this routine |
| `name` | string | Yes | Non-empty |
| `movement_pattern` | string | No | e.g. push, pull, hinge |
| `primary_muscles` | string[] | No | — |
| `secondary_muscles` | string[] | No | — |
| `rest_seconds` | integer | No | ≥ 0 |
| `tempo` | string | No | e.g. "3-1-2-0" |
| `notes` | string | No | — |
| `alternatives` | string[] | No | Exercise names or IDs |
| `sets` | Set[] | Yes | Ordered by set_number |

### 2.5 Set object

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `set_number` | integer | Yes | 1-based |
| `reps` | integer | Yes | Target reps |
| `target_rpe` | number | No | 1–10 scale |
| `target_weight` | number | No | kg or lb (unit in notes if needed) |
| `rep_range` | string | No | e.g. `"8-12"` |

### 2.6 Optional envelope (metadata)

For traceability without changing the core schema, the API may accept an envelope:

```json
{
  "payload": { /* routine document */ },
  "meta": {
    "source": "llm_generated",
    "persona_ids": ["max", "alex"],
    "schema_version": "1.0"
  }
}
```

- If the request body has a `payload` property, the server validates and stores `payload` as the routine; `meta` is for logging/analytics only.
- If the request body has `schema_version` at the top level, the server treats the body as the routine document directly (no envelope).

## 3. POST /api/routines — Response body

### 3.1 Success (201 Created)

```json
{
  "ok": true,
  "routine_id": "generated-or-echoed-id",
  "schema_version": "1.0",
  "warnings": []
}
```

| Field | Type | Notes |
|-------|------|--------|
| `ok` | boolean | Always `true` on success |
| `routine_id` | string | Stored ID (generated or echoed) |
| `schema_version` | string | Echo of accepted version |
| `warnings` | string[] | Non-blocking issues (e.g. unknown equipment, missing optional fields) |

### 3.2 Validation error (400 Bad Request)

```json
{
  "ok": false,
  "error": "validation_failed",
  "message": "Human-readable summary",
  "details": [
    { "path": "weeks[0].days[0].exercises[1].exercise_id", "code": "duplicate", "message": "exercise_id must be unique within routine" }
  ]
}
```

| Field | Type | Notes |
|-------|------|--------|
| `ok` | boolean | Always `false` |
| `error` | string | Code: e.g. `validation_failed`, `invalid_schema_version` |
| `message` | string | Short summary |
| `details` | array | Optional; path, code, message per issue |

### 3.3 Server error (5xx)

```json
{
  "ok": false,
  "error": "internal_error",
  "message": "Optional safe message"
}
```

## 4. Minimal valid example (reusable for LLM or API)

```json
{
  "schema_version": "1.0",
  "title": "4-Week Strength Base",
  "duration_weeks": 4,
  "days_per_week": 3,
  "goals": ["strength"],
  "equipment": ["barbell", "rack"],
  "weeks": [
    {
      "week_number": 1,
      "days": [
        {
          "day_number": 1,
          "title": "Full Body A",
          "focus": ["squat", "press"],
          "exercises": [
            {
              "exercise_id": "sq1",
              "name": "Back Squat",
              "movement_pattern": "squat",
              "primary_muscles": ["quadriceps", "glutes"],
              "rest_seconds": 180,
              "sets": [
                { "set_number": 1, "reps": 5, "target_rpe": 8 },
                { "set_number": 2, "reps": 5, "target_rpe": 8 }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## 5. GET /api/routines/:id — Response

Returns the stored routine document (same structure as §2.1–2.5) with `routine_id` and any server-set fields populated. Status 404 if not found.

## 6. POST /api/workouts — Request body (workout log)

Separate from routine ingestion; used for set-level logging.

```json
{
  "routine_id": "string",
  "date": "YYYY-MM-DD",
  "exercises": [
    {
      "exercise_id": "string",
      "sets": [
        {
          "set_number": 1,
          "reps": 5,
          "weight": 100,
          "rpe": 8,
          "notes": "optional"
        }
      ]
    }
  ]
}
```

## 7. Versioning and compatibility

- **Current supported version**: `"1.0"`.
- Unknown `schema_version`: API returns 400 with `error: "invalid_schema_version"` and optionally lists supported versions.
- New optional fields may be added in minor schema updates; clients and LLMs should omit unknown fields and omit optional fields when unknown.
