import {
  validateRoutineDocument,
  normalizeRoutineBody,
} from '@/lib/routines/validate';
import { SUPPORTED_SCHEMA_VERSION } from '@/lib/routines/types';

describe('validateRoutineDocument', () => {
  const validRoutine = {
    schema_version: '1.0',
    title: 'Test Routine',
    duration_weeks: 4,
    days_per_week: 3,
    goals: ['strength'],
    equipment: ['barbell'],
    weeks: [
      {
        week_number: 1,
        days: [
          {
            day_number: 1,
            title: 'Day A',
            exercises: [
              {
                exercise_id: 'ex1',
                name: 'Squat',
                sets: [{ set_number: 1, reps: 5 }],
              },
            ],
          },
        ],
      },
    ],
  };

  it('accepts a valid routine document', () => {
    const result = validateRoutineDocument(validRoutine);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects non-object input', () => {
    expect(validateRoutineDocument(null).valid).toBe(false);
    expect(validateRoutineDocument('string').valid).toBe(false);
    expect(validateRoutineDocument([]).valid).toBe(false);
    expect(validateRoutineDocument(123).valid).toBe(false);
  });

  describe('schema_version', () => {
    it('requires schema_version', () => {
      const doc = { ...validRoutine };
      delete (doc as Record<string, unknown>).schema_version;
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'schema_version')).toBe(true);
    });

    it('rejects unsupported schema_version', () => {
      const doc = { ...validRoutine, schema_version: '2.0' };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'invalid_schema_version')).toBe(true);
    });

    it('accepts supported schema_version', () => {
      const doc = { ...validRoutine, schema_version: SUPPORTED_SCHEMA_VERSION };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(true);
    });
  });

  describe('title', () => {
    it('requires title', () => {
      const doc = { ...validRoutine };
      delete (doc as Record<string, unknown>).title;
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'title')).toBe(true);
    });

    it('rejects empty title', () => {
      const doc = { ...validRoutine, title: '' };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'title')).toBe(true);
    });

    it('rejects whitespace-only title', () => {
      const doc = { ...validRoutine, title: '   ' };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
    });
  });

  describe('duration_weeks', () => {
    it('requires duration_weeks', () => {
      const doc = { ...validRoutine };
      delete (doc as Record<string, unknown>).duration_weeks;
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'duration_weeks')).toBe(true);
    });

    it('rejects duration_weeks < 1', () => {
      const doc = { ...validRoutine, duration_weeks: 0 };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
    });

    it('rejects non-number duration_weeks', () => {
      const doc = { ...validRoutine, duration_weeks: 'four' };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
    });
  });

  describe('days_per_week', () => {
    it('requires days_per_week', () => {
      const doc = { ...validRoutine };
      delete (doc as Record<string, unknown>).days_per_week;
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'days_per_week')).toBe(true);
    });

    it('rejects days_per_week < 1', () => {
      const doc = { ...validRoutine, days_per_week: 0 };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
    });
  });

  describe('weeks', () => {
    it('requires weeks array', () => {
      const doc = { ...validRoutine };
      delete (doc as Record<string, unknown>).weeks;
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'weeks')).toBe(true);
    });

    it('rejects empty weeks array', () => {
      const doc = { ...validRoutine, weeks: [] };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
    });

    it('validates week_number', () => {
      const doc = {
        ...validRoutine,
        weeks: [{ week_number: 0, days: validRoutine.weeks[0].days }],
      };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'weeks[0].week_number')).toBe(true);
    });
  });

  describe('days', () => {
    it('requires days array in each week', () => {
      const doc = {
        ...validRoutine,
        weeks: [{ week_number: 1 }],
      };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'weeks[0].days')).toBe(true);
    });

    it('validates day_number', () => {
      const doc = {
        ...validRoutine,
        weeks: [
          {
            week_number: 1,
            days: [{ day_number: 0, title: 'Day', exercises: validRoutine.weeks[0].days[0].exercises }],
          },
        ],
      };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'weeks[0].days[0].day_number')).toBe(true);
    });

    it('requires day title', () => {
      const doc = {
        ...validRoutine,
        weeks: [
          {
            week_number: 1,
            days: [{ day_number: 1, title: '', exercises: validRoutine.weeks[0].days[0].exercises }],
          },
        ],
      };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'weeks[0].days[0].title')).toBe(true);
    });
  });

  describe('exercises', () => {
    it('requires exercises array in each day', () => {
      const doc = {
        ...validRoutine,
        weeks: [
          {
            week_number: 1,
            days: [{ day_number: 1, title: 'Day A' }],
          },
        ],
      };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'weeks[0].days[0].exercises')).toBe(true);
    });

    it('requires exercise_id', () => {
      const doc = {
        ...validRoutine,
        weeks: [
          {
            week_number: 1,
            days: [
              {
                day_number: 1,
                title: 'Day A',
                exercises: [{ name: 'Squat', sets: [{ set_number: 1, reps: 5 }] }],
              },
            ],
          },
        ],
      };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('exercise_id'))).toBe(true);
    });

    it('requires exercise name', () => {
      const doc = {
        ...validRoutine,
        weeks: [
          {
            week_number: 1,
            days: [
              {
                day_number: 1,
                title: 'Day A',
                exercises: [{ exercise_id: 'ex1', name: '', sets: [{ set_number: 1, reps: 5 }] }],
              },
            ],
          },
        ],
      };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('name'))).toBe(true);
    });

    it('rejects duplicate exercise_id within routine', () => {
      const doc = {
        ...validRoutine,
        weeks: [
          {
            week_number: 1,
            days: [
              {
                day_number: 1,
                title: 'Day A',
                exercises: [
                  { exercise_id: 'ex1', name: 'Squat', sets: [{ set_number: 1, reps: 5 }] },
                  { exercise_id: 'ex1', name: 'Bench', sets: [{ set_number: 1, reps: 5 }] },
                ],
              },
            ],
          },
        ],
      };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'duplicate')).toBe(true);
    });
  });

  describe('sets', () => {
    it('requires sets array in each exercise', () => {
      const doc = {
        ...validRoutine,
        weeks: [
          {
            week_number: 1,
            days: [
              {
                day_number: 1,
                title: 'Day A',
                exercises: [{ exercise_id: 'ex1', name: 'Squat' }],
              },
            ],
          },
        ],
      };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('sets'))).toBe(true);
    });

    it('requires set_number', () => {
      const doc = {
        ...validRoutine,
        weeks: [
          {
            week_number: 1,
            days: [
              {
                day_number: 1,
                title: 'Day A',
                exercises: [{ exercise_id: 'ex1', name: 'Squat', sets: [{ reps: 5 }] }],
              },
            ],
          },
        ],
      };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('set_number'))).toBe(true);
    });

    it('requires reps', () => {
      const doc = {
        ...validRoutine,
        weeks: [
          {
            week_number: 1,
            days: [
              {
                day_number: 1,
                title: 'Day A',
                exercises: [{ exercise_id: 'ex1', name: 'Squat', sets: [{ set_number: 1 }] }],
              },
            ],
          },
        ],
      };
      const result = validateRoutineDocument(doc);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path.includes('reps'))).toBe(true);
    });
  });
});

describe('normalizeRoutineBody', () => {
  const validRoutine = {
    schema_version: '1.0',
    title: 'Test',
    duration_weeks: 4,
    days_per_week: 3,
    weeks: [],
  };

  it('returns routine document if body has schema_version and weeks', () => {
    const result = normalizeRoutineBody(validRoutine);
    expect(result).toEqual(validRoutine);
  });

  it('extracts payload from envelope', () => {
    const envelope = {
      payload: validRoutine,
      meta: { source: 'test' },
    };
    const result = normalizeRoutineBody(envelope);
    expect(result).toEqual(validRoutine);
  });

  it('returns null for non-object input', () => {
    expect(normalizeRoutineBody(null)).toBeNull();
    expect(normalizeRoutineBody('string')).toBeNull();
    expect(normalizeRoutineBody([])).toBeNull();
  });

  it('returns null for object without schema_version or payload', () => {
    expect(normalizeRoutineBody({ title: 'Test' })).toBeNull();
    expect(normalizeRoutineBody({})).toBeNull();
  });
});
