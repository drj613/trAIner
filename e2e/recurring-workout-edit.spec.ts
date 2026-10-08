import { test, expect } from '@playwright/test';
import { chooseImportVersions, finishWorkout } from './helpers';
import type { ProgramDocument, WorkoutLogDocument } from '../src/lib/programs/types';

const fixture = JSON.stringify({program_name:'Recurring protection',weeks:3,days:[
 {day:1,title:'Lower B',sections:[{type:'strength',groups:[{type:'single',exercises:[{name:'Barbell Squat',sets:4,reps:'8',variants:[{weeks:[3],sets:2}]}]}]}]},
 {day:2,title:'Upper B',sections:[{type:'strength',groups:[{type:'single',exercises:[{name:'Barbell Bench Press',sets:3,reps:'10'}]}]}]},
]});

test('recurring manual edit protects an out-of-order completion, deload and entered cells through reload',async({page})=>{
 await page.goto('import');await page.locator('textarea').fill(fixture);await page.waitForTimeout(300);
 const validate=page.getByRole('button',{name:/validate/i});await expect(validate).toBeEnabled();await validate.click();
 await chooseImportVersions(page);
 const resolve=page.getByRole('button',{name:/review import/i});
 if(await resolve.isVisible())await resolve.click();
 await expect(page.getByRole('heading',{name:'Confirm import'})).toBeVisible();
 await page.getByRole('button',{name:'Save program'}).click();
 await expect(page).toHaveURL(/programs\//);
 const stored=async()=>page.evaluate(async()=>new Promise<{program:ProgramDocument;logs:WorkoutLogDocument[]}>((resolve,reject)=>{
  const request=indexedDB.open('trainer-local-first');
  request.onerror=()=>reject(request.error);request.onsuccess=()=>{const db=request.result;const tx=db.transaction(['programs','logs']);let program:ProgramDocument;let logs:WorkoutLogDocument[];
   const ps=tx.objectStore('programs').getAll();ps.onsuccess=()=>{program=ps.result.find((p:ProgramDocument)=>p.title==='Recurring protection');};
   const ls=tx.objectStore('logs').getAll();ls.onsuccess=()=>{logs=ls.result;};
   tx.oncomplete=()=>{db.close();resolve({program,logs});};tx.onerror=()=>reject(tx.error);
  };
 }));
 const initial=(await stored()).program;
 await page.goto(`programs/${initial.id}/days/${initial.days[2].id}`);
 await page.locator('input[id^="cell-"]').first().fill('100x8');
 await finishWorkout(page);
 const completed=(await stored()).logs.find(l=>l.dayId===initial.days[2].id)!;
 expect(completed.completedAt).toBeTruthy();
 await page.goto(`programs/${initial.id}/days/${initial.days[0].id}`);
 const cells=page.locator('input[id^="cell-"]');await cells.nth(3).fill('90x6');
 await page.getByRole('button',{name:'Edit prescription for Barbell Squat'}).click();
 await page.getByLabel('Sets',{exact:true}).fill('3');
 await page.getByRole('button',{name:'Save',exact:true}).click();
 const recurringScope=page.getByRole('radio',{name:'Apply to remaining occurrences of Lower B'});await recurringScope.click();await expect(recurringScope).toBeChecked();
 await expect(page.getByRole('region',{name:'Edit impact preview'})).toBeVisible();
 await page.getByRole('button',{name:'Apply reviewed edit'}).click();
 const staleNotice=page.getByRole('alert');
 if(await staleNotice.isVisible().catch(()=>false)){
  await expect(staleNotice).toContainText(/routine or completion state changed/i);
  await page.getByRole('button',{name:'Apply reviewed edit'}).click();
 }
 await expect(page.getByRole('dialog',{name:'Review prescription edit'})).not.toBeVisible();
 await expect(cells.nth(3)).toHaveValue('90x6');
 await page.reload();await expect(page.locator('input[id^="cell-"]').nth(3)).toHaveValue('90x6');
 const after=await stored();
 expect(after.logs.find(l=>l.id===completed.id)).toEqual(completed);
 const effective=(dayId:string)=>{const base=after.program.days.find(d=>d.id===dayId)!;const o=after.program.overrides.find(o=>o.scope==='day'&&o.dayId===dayId);return o?Array.isArray(o.replacement)?o.replacement[0]:o.replacement:base;};
 expect(effective(initial.days[0].id).sections[0].groups[0].exercises[0].sets).toBe(3);
 expect(effective(initial.days[2].id).sections[0].groups[0].exercises[0].sets).toBe(4);
 expect(effective(initial.days[4].id).sections[0].groups[0].exercises[0].sets).toBe(2);
 expect(effective(initial.days[1].id)).toEqual(initial.days[1]);
});
