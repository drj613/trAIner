import { previewProgramEdit, applyProgramEdit } from './edits';
import { parseProgramJson } from '@/lib/import/parser';
import { getRenderableDays } from './overrides';
import type { ProgramDocument, WorkoutLogDocument } from './types';

function routine(): ProgramDocument {
  return parseProgramJson(
    JSON.stringify({
      title: 'Test',
      weeks: 3,
      days: [
        {
          day: 1,
          title: 'Same',
          sections: [
            {
              type: 'strength',
              groups: [
                {
                  type: 'single',
                  exercises: [
                    {
                      name: 'Squat',
                      sets: 4,
                      reps: '8',
                      variants: [
                        { weeks: [2], reps: '6' },
                        { weeks: [3], sets: 2 },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { day: 2, title: 'Same', sections: [] },
      ],
    })
  ).program;
}
const ex = (p: ProgramDocument, n: number) =>
  getRenderableDays(p)[n].sections[0].groups[0].exercises[0];

describe('reviewed routine edits', () => {
  it('changes only edited fields and preserves deload and progression exceptions', () => {
    const p = routine();
    const original = JSON.stringify(p);
    const preview = previewProgramEdit(
      p,
      {
        kind: 'exercise-fields',
        dayId: p.days[0].id,
        exerciseId: ex(p, 0).id,
        fields: { sets: 5 },
      },
      { scope: 'routine-day' }
    );
    const saved = applyProgramEdit(p, preview);
    expect([ex(saved, 0).sets, ex(saved, 2).sets, ex(saved, 4).sets]).toEqual([
      5, 5, 2,
    ]);
    expect(ex(saved, 2).reps).toBe('6');
    expect(preview.preservedExceptions.length).toBeGreaterThan(0);
    expect(JSON.stringify(p)).toBe(original);
    expect(saved).toEqual(preview.proposedDocument);
  });
  it('explicitly targets an exception without altering other same-title workouts', () => {
    const p = routine();
    const preview = previewProgramEdit(
      p,
      {
        kind: 'exercise-fields',
        dayId: p.days[0].id,
        exerciseId: ex(p, 0).id,
        fields: { sets: 5 },
      },
      { scope: 'routine-day', includeExceptionDayIds: [p.days[4].id] }
    );
    expect(ex(preview.proposedDocument, 4).sets).toBe(5);
    expect(preview.changes.map(c => c.dayId)).not.toContain(p.days[1].id);
  });
  it('supports explicit clears and preserves unrelated week overrides', () => {
    const p = routine();
    ex(p, 0).notes = 'Keep?';
    p.overrides.push({
      id: 'week',
      programId: p.id,
      scope: 'week',
      weekNumber: 1,
      replacement: [{ ...p.days[1], title: 'Other override' }],
      createdAt: p.createdAt,
    });
    const preview = previewProgramEdit(
      p,
      {
        kind: 'exercise-fields',
        dayId: p.days[0].id,
        exerciseId: ex(p, 0).id,
        fields: { notes: null },
      },
      { scope: 'occurrence' }
    );
    expect(ex(preview.proposedDocument, 0).notes).toBeUndefined();
    expect(getRenderableDays(preview.proposedDocument)[1].title).toBe(
      'Other override'
    );
    expect(preview.proposedDocument.overrides.some(o => o.id === 'week')).toBe(
      true
    );
    expect(() =>
      applyProgramEdit({ ...p, updatedAt: 'changed' }, preview)
    ).toThrow(/changed/i);
  });
  it('excludes completed workouts in the current pass while allowing subsequent passes', () => {
    const p = routine();
    const log = (dayId: string, id: string): WorkoutLogDocument => ({
      id,
      programId: p.id,
      dayId,
      performedAt: '2026-10-08',
      completedAt: '2026-10-08',
      entries: [],
    });
    const edit = {
      kind: 'exercise-fields' as const,
      dayId: p.days[0].id,
      exerciseId: ex(p, 0).id,
      fields: { sets: 5 },
    };
    const preview = previewProgramEdit(p, edit, {
      scope: 'routine-day',
      logs: [log(p.days[2].id, 'out-of-order')],
    });
    expect(ex(preview.proposedDocument, 2).sets).toBe(4);
    const nextPass = previewProgramEdit(p, edit, {
      scope: 'routine-day',
      logs: p.days.map((d, i) => log(d.id, String(i))),
    });
    expect(ex(nextPass.proposedDocument, 2).sets).toBe(5);
  });
  it('reorders workout slots including rest and retains occurrence IDs', () => {
    const p = routine();
    const ids = p.days.map(d => d.id);
    const templates = p.editing!.templateDays.map(d => d.id).reverse();
    const preview = previewProgramEdit(
      p,
      { kind: 'day-order', templateDayIds: templates },
      { scope: 'routine-day' }
    );
    expect(preview.proposedDocument.days.map(d => d.id)).toEqual([
      ids[1],
      ids[0],
      ids[3],
      ids[2],
      ids[5],
      ids[4],
    ]);
    expect(preview.proposedDocument.days.map(d => d.dayNumber)).toEqual([
      1, 2, 1, 2, 1, 2,
    ]);
  });
  it('groups by stable membership and preserves all other members', () => {
    const p = routine();
    const d = p.days[0],
      g = d.sections[0].groups[0];
    const preview = previewProgramEdit(
      p,
      {
        kind: 'grouping',
        dayId: d.id,
        sectionId: d.sections[0].id,
        groups: [
          { id: g.id, type: 'circuit', exerciseIds: [g.exercises[0].id] },
        ],
      },
      { scope: 'routine-day' }
    );
    expect(
      getRenderableDays(preview.proposedDocument)[2].sections[0].groups[0].type
    ).toBe('circuit');
    expect(() =>
      previewProgramEdit(
        p,
        {
          kind: 'grouping',
          dayId: d.id,
          sectionId: d.sections[0].id,
          groups: [],
        },
        { scope: 'occurrence' }
      )
    ).toThrow(/member/i);
  });
});
it('uses a new row identity for replacement and records occurrence exceptions', () => {
  const p = routine();
  const original = ex(p, 0);
  const preview = previewProgramEdit(
    p,
    {
      kind: 'exercise-replacement',
      dayId: p.days[0].id,
      exerciseId: original.id,
      exercise: { ...original, name: 'Row', canonicalExerciseId: 'row' },
    },
    { scope: 'occurrence' }
  );
  expect(ex(preview.proposedDocument, 0).id).not.toBe(original.id);
  expect(
    preview.proposedDocument.editing!.exceptions.some(
      e => e.dayId === p.days[0].id && e.kind === 'structural'
    )
  ).toBe(true);
});
it('a repeated grouping updates bindings for the next field edit and preserves occurrence grouping', () => {
  const p = routine(),
    d = p.days[0],
    s = d.sections[0],
    g = s.groups[0];
  const grouped = previewProgramEdit(
    p,
    {
      kind: 'grouping',
      dayId: d.id,
      sectionId: s.id,
      groups: [
        { id: 'new-group', type: 'circuit', exerciseIds: [g.exercises[0].id] },
      ],
    },
    { scope: 'routine-day' }
  ).proposedDocument;
  const again = previewProgramEdit(
    grouped,
    {
      kind: 'exercise-fields',
      dayId: d.id,
      exerciseId: ex(grouped, 0).id,
      fields: { reps: '12' },
    },
    { scope: 'routine-day' }
  );
  expect(ex(again.proposedDocument, 2).reps).toBe('6');
  expect(ex(again.proposedDocument, 4).reps).toBe('12');
});
it('AI day-content changes only selected fields across recurring occurrences', () => {
  const p = routine();
  const replacement = structuredClone(getRenderableDays(p)[0]);
  replacement.sections[0].groups[0].exercises[0].sets = 5;
  const preview = previewProgramEdit(
    p,
    { kind: 'day-content', dayId: p.days[0].id, replacement },
    { scope: 'routine-day' }
  );
  expect([
    ex(preview.proposedDocument, 0).sets,
    ex(preview.proposedDocument, 2).sets,
    ex(preview.proposedDocument, 4).sets,
  ]).toEqual([5, 5, 2]);
  expect(
    preview.proposedDocument.editing!.templateDays[0].sections[0].groups[0]
      .exercises[0].sets
  ).toBe(5);
});
it('AI occurrence edits become field exceptions without freezing other fields', () => {
  const p = routine(),
    replacement = structuredClone(getRenderableDays(p)[2]);
  replacement.sections[0].groups[0].exercises[0].sets = 7;
  const changed = previewProgramEdit(
    p,
    { kind: 'day-content', dayId: p.days[2].id, replacement },
    { scope: 'occurrence' }
  ).proposedDocument;
  const next = previewProgramEdit(
    changed,
    {
      kind: 'exercise-fields',
      dayId: p.days[0].id,
      exerciseId: ex(p, 0).id,
      fields: { sets: 5, load: '100' },
    },
    { scope: 'routine-day' }
  ).proposedDocument;
  expect(ex(next, 2).sets).toBe(7);
  expect(ex(next, 2).load).toBe('100');
});
it('selects one exception field without applying another exception in the same occurrence', () => {
  const p = routine();
  const occurrence = p.days[4];
  const exercise = ex(p, 4);
  exercise.reps = '3';
  const tid = p.editing!.elementBindings.find(b => b.occurrenceDayId === occurrence.id && b.occurrenceElementId === exercise.id)!.templateElementId;
  p.editing!.exceptions.push({kind:'field',dayId:occurrence.id,templateElementId:tid,field:'reps',reason:'Deload reps'});
  const edit = {kind:'exercise-fields' as const,dayId:p.days[0].id,exerciseId:ex(p,0).id,fields:{sets:5,reps:'12'}};
  const preview = previewProgramEdit(p, edit, {scope:'routine-day'});
  const selected = preview.preservedExceptions.find(e => e.dayId === occurrence.id && e.reason.includes('sets'))!;
  expect(selected.selectionId).toBeDefined();
  const included = previewProgramEdit(p,edit,{scope:'routine-day',includeExceptionDayIds:[selected.selectionId!]});
  expect(ex(included.proposedDocument,4).sets).toBe(5);
  expect(ex(included.proposedDocument,4).reps).toBe('3');
});
it('binds exercises added by a recurring structural edit for later field edits', () => {
 const p=routine();const replacement=structuredClone(getRenderableDays(p)[0]);
 replacement.sections[0].groups[0].exercises.push({id:'added',name:'Row',sets:3,reps:'10',tags:{primary:[],secondary:[],incidental:[],modifiers:[]}});
 const added=previewProgramEdit(p,{kind:'day-content',dayId:p.days[0].id,replacement},{scope:'routine-day'}).proposedDocument;
 const next=previewProgramEdit(added,{kind:'exercise-fields',dayId:p.days[0].id,exerciseId:'added',fields:{reps:'12'}},{scope:'routine-day'});
 expect(getRenderableDays(next.proposedDocument).filter(d=>d.sections.length).map(d=>d.sections[0].groups[0].exercises[1].reps)).toEqual(['12','12','12']);
});
it('removes an old source field exception when a repeated edit updates the baseline', () => {
 const p=routine(),id=ex(p,0).id;
 const one=previewProgramEdit(p,{kind:'exercise-fields',dayId:p.days[0].id,exerciseId:id,fields:{sets:6}},{scope:'occurrence',atImport:true}).proposedDocument;
 const repeated=previewProgramEdit(one,{kind:'exercise-fields',dayId:p.days[0].id,exerciseId:id,fields:{sets:5}},{scope:'routine-day',atImport:true}).proposedDocument;
 const again=previewProgramEdit(repeated,{kind:'exercise-fields',dayId:p.days[2].id,exerciseId:ex(repeated,2).id,fields:{sets:7}},{scope:'routine-day',atImport:true}).proposedDocument;
 expect(ex(again,0).sets).toBe(7);
});
