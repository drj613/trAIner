import { preserveEditedSession } from './editSession';
import type { ProgramDay, WorkoutLogEntry } from '@/lib/programs/types';
const day = (name: string, id = 'slot'): ProgramDay => ({
  id: 'day',
  dayNumber: 1,
  title: 'Day',
  sections: [
    {
      id: 's',
      type: 'strength',
      name: 'Work',
      groups: [
        {
          id: 'g',
          type: 'single',
          exercises: [
            {
              id,
              name,
              sets: 2,
              tags: {
                primary: [],
                secondary: [],
                incidental: [],
                modifiers: [],
              },
            },
          ],
        },
      ],
    },
  ],
});
it('keeps all typed cells after sets shrink and moves replaced logged cells to their original identity', () => {
  const entries: WorkoutLogEntry[] = [
    {
      exerciseId: 'slot',
      exerciseName: 'Squat',
      sets: [{ setNumber: 1, reps: 8 }],
    },
  ];
  const old = day('Squat');
  const next = day('Row', 'new-slot');
  const preserved = preserveEditedSession(
    old,
    next,
    { slot: ['100x8', '', '100x6'] },
    entries
  );
  expect(preserved.entries[0].exerciseName).toBe('Squat');
  expect(preserved.entries).toEqual(entries);
  expect(preserved.cells[preserved.entries[0].exerciseId]).toEqual([
    '100x8',
    '',
    '100x6',
  ]);
  expect(preserved.cells['new-slot']).toEqual(['', '']);
  const shrink = preserveEditedSession(
    old,
    old,
    { slot: ['100x8', '', '100x6'] },
    entries
  );
  expect(shrink.cells.slot).toHaveLength(3);
});
