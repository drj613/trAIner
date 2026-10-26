import { test, expect, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProgramDocument, WorkoutLogDocument } from "../../src/lib/programs/types";
import { FIXED_TIME, profile, routine } from "./fixture";

const output = path.resolve(process.env.FLOW_OUTPUT_DIR ?? "docs/user-flows/screenshots");
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const sourceDiffDigest = createHash("sha256").update(execFileSync("git", ["diff", "HEAD", "--", "src", "public", "index.html", "vite.config.ts"])).digest("hex");
const command = `${process.env.FLOW_OUTPUT_DIR ? `FLOW_OUTPUT_DIR=${process.env.FLOW_OUTPUT_DIR} ` : ""}bun run docs:flows:capture`;
const variants = [
  { name: "mobile-light", viewport: { width: 390, height: 844 }, theme: "linen", colorScheme: "light" as const },
  { name: "mobile-dark", viewport: { width: 390, height: 844 }, theme: "terminal", colorScheme: "dark" as const },
  { name: "desktop-light", viewport: { width: 1280, height: 900 }, theme: "linen", colorScheme: "light" as const },
];

const completedVariants = new Set<string>();

test.beforeAll(async () => {
  const frozen = await access(path.join(output, ".frozen")).then(() => true, () => false);
  if (frozen) throw new Error(`Frozen screenshot baseline: ${output}. Choose a different FLOW_OUTPUT_DIR.`);
  await rm(path.join(output, "manifest.json"), { force: true });
});

test.afterAll(async () => {
  const manifests = await Promise.all(variants.map(variant => readFile(path.join(output, variant.name, "manifest.json"), "utf8").then(JSON.parse).catch(() => null)));
  if (completedVariants.size === variants.length && manifests.every(manifest => manifest?.screenshots.length === 19)) {
    await writeFile(path.join(output, "manifest.json"), JSON.stringify({
      fixture: "Everyday Strength / Alex Morgan (fictional)", fixedTime: FIXED_TIME,
      command, sourceRevision: revision, sourceDiffDigest,
      screenshots: manifests.flatMap(manifest => manifest.screenshots),
    }, null, 2) + "\n");
  }
});

type Shot = { path: string; screen: string; state: string; route: string; sha256: string; viewport: { width: number; height: number }; theme: string; command: string; sourceRevision: string; sourceDiffDigest: string };

async function seedHistory(page: Page): Promise<ProgramDocument> {
  return page.evaluate(async ({ fictionalProfile }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("trainer-local-first");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const program = await new Promise<ProgramDocument>((resolve, reject) => {
      const req = db.transaction("programs").objectStore("programs").getAll();
      req.onsuccess = () => resolve(req.result[0]);
      req.onerror = () => reject(req.error);
    });
    program.goal = "strength";
    program.daysPerWeek = 3;
    const tx = db.transaction(["programs", "profile", "logs", "bodyweight"], "readwrite");
    tx.objectStore("programs").put(program);
    tx.objectStore("profile").put(fictionalProfile);
    for (let week = 0; week < 3; week++) {
      for (let dayIndex = 0; dayIndex < 3; dayIndex++) {
        const date = new Date(Date.UTC(2026, 9, 5 + week * 7 + dayIndex * 2, 17));
        const day = program.days[dayIndex];
        const log: WorkoutLogDocument = {
          id: `documentation-session-${week}-${dayIndex}`,
          programId: program.id,
          dayId: day.id,
          prescriptionSnapshot: day,
          performedAt: date.toISOString(),
          performedDate: date.toISOString().slice(0, 10),
          completedAt: new Date(date.getTime() + 42 * 60_000).toISOString(),
          dayNote: week === 2 ? "Good energy. Reps stayed smooth." : "Comfortable pace, consistent technique.",
          entries: day.sections.flatMap((section, sectionIndex) => section.groups.flatMap(group => group.exercises.map(exercise => ({
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            canonicalExerciseId: exercise.canonicalExerciseId,
            sets: Array.from({ length: exercise.sets ?? 1 }, (_, i) => ({
              setNumber: i + 1,
              ...(sectionIndex === 0 ? {} : { weight: (dayIndex === 0 ? [0, 125, 30] : dayIndex === 1 ? [0, 85, 30] : [0, 155, 20])[sectionIndex] + week * 5, unit: "lb" as const }),
              reps: sectionIndex === 1 ? (dayIndex === 1 ? 8 : 5) : sectionIndex === 0 ? 12 : 10,
            })),
          })))),
        };
        tx.objectStore("logs").put(log);
      }
      const date = `2026-10-${String(5 + week * 7).padStart(2, "0")}`;
      tx.objectStore("bodyweight").put({ id: date, value: 169 - week * 0.5, unit: "lb", recordedAt: `${date}T12:00:00Z` });
    }
    await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
    db.close();
    return program;
  }, { fictionalProfile: profile });
}

for (const variant of variants) {
  test(`capture ${variant.name}`, async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL, viewport: variant.viewport, colorScheme: variant.colorScheme, locale: "en-US", timezoneId: "America/New_York", deviceScaleFactor: 1, serviceWorkers: "block" });
    await context.addInitScript(({ theme }) => localStorage.setItem("trainer-theme", theme), variant);
    const page = await context.newPage();
    page.on("pageerror", error => console.error(error));
    page.setDefaultTimeout(10_000);
    page.setDefaultNavigationTimeout(20_000);
    await page.clock.setFixedTime(new Date(FIXED_TIME));
    const shots: Shot[] = [];
    const directory = path.join(output, variant.name);
    await mkdir(directory, { recursive: true });

    async function shot(name: string, screen: string, state: string) {
      await page.mouse.move(0, 0);
      await page.evaluate(async () => {
        await document.fonts.ready;
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
        document.querySelectorAll("textarea").forEach(el => { el.scrollTop = 0; });
      });
      await expect(page.locator("html")).toHaveAttribute("data-theme", variant.theme);
      await page.waitForTimeout(250);
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${variant.name}/${name} viewport overflow`).toBeLessThanOrEqual(variant.viewport.width);
      const file = path.join(directory, `${name}.png`);
      console.log(`Capturing ${variant.name}/${name}`);
      await page.screenshot({ path: file, animations: "disabled", fullPage: false });
      const sha256 = createHash("sha256").update(await readFile(file)).digest("hex");
      shots.push({ path: `${variant.name}/${name}.png`, screen, state, route: new URL(page.url()).pathname.replace("/trAIner", ""), sha256, viewport: variant.viewport, theme: variant.theme, command, sourceRevision: revision, sourceDiffDigest });
      await writeFile(path.join(directory, "manifest.json"), JSON.stringify({ fixture: "Everyday Strength / Alex Morgan (fictional)", fixedTime: FIXED_TIME, browser: `Chromium ${browser.version()}`, screenshots: shots }, null, 2) + "\n");
    }
    async function go(route: string, heading: RegExp | string) {
      await page.goto(route);
      await expect(page.getByRole("main").getByText(heading, { exact: typeof heading === "string" }).first()).toBeVisible();
    }

    try {
      await go("today", /welcome|today/i);
      await shot("today-empty", "Today", "Fresh workspace onboarding");
      if (variant.viewport.width > 1100) {
        await expect(page.getByRole("navigation")).toBeVisible();
        await shot("navigation", "Desktop navigation", "Persistent global navigation beside empty Today");
      } else {
        await page.getByRole("button", { name: "Open menu" }).click();
        await expect(page.getByRole("navigation")).toBeVisible();
        await shot("navigation", "Navigation drawer", "Global navigation open over empty Today");
        await page.getByRole("button", { name: /close menu/i }).click();
      }
      await go("import", "Import");
      await page.getByLabel("Routine JSON").fill(JSON.stringify(routine, null, 2));
      await shot("import-paste", "Import", "Fictional three-day routine pasted, before validation");
      await page.getByLabel("Routine JSON").fill('{ "program_name": "Everyday Strength", "days": [ }');
      await page.getByRole("button", { name: /validate/i }).click();
      await expect(page.getByText(/not valid json/i)).toBeVisible();
      await shot("import-error", "Import", "Invalid JSON with recovery message");
      await page.getByLabel("Routine JSON").fill(JSON.stringify(routine, null, 2));
      await page.getByRole("button", { name: /validate/i }).click();
      await expect(page.getByRole("heading", { name: /resolve exercises/i })).toBeVisible();
      await shot("import-resolve", "Import", "Resolve exercise names before confirmation");
      const versions = page.locator('select[aria-label^="Choose version for"]:not([aria-label*=" at "])');
      for (let i = 0; i < await versions.count(); i++) await versions.nth(i).selectOption({ index: 1 });
      await page.getByRole("button", { name: /review import/i }).click();
      await expect(page.getByRole("heading", { name: "Confirm import" })).toBeVisible();
      await shot("import-confirm", "Import", "Validated routine ready to save");
      await page.getByRole("button", { name: /save program/i }).click();
      await page.waitForURL(/\/programs\/[^/]+$/);
      const program = await seedHistory(page);
      await go("profile", "Alex Morgan");
      await expect(page.getByText("Alex Morgan", { exact: true })).toBeVisible();
      await shot("profile", "Profile", "Filled fictional profile, training heatmap and bodyweight history");
      await go("prompts", "Prompts");
      await shot("prompts", "Prompts", "Coach prompt with saved profile available");
      await go("programs", "Routines");
      await expect(page.getByText("Everyday Strength", { exact: true }).first()).toBeVisible();
      await shot("routines", "Routines", "Imported draft four-week, three-day routine with historical logs");
      await page.goto(`programs/${program.id}`);
      await expect(page.getByText("Everyday Strength", { exact: true }).first()).toBeVisible();
      await shot("routine-detail", "Routine overview", "Routine details and day list");
      await page.goto(`programs/${program.id}/map`);
      await expect(page.getByText(/week 1/i).first()).toBeVisible();
      await shot("routine-map", "Routine map", "Four-week schedule");
      await page.goto("programs/new");
      await page.getByPlaceholder("e.g. Upper / Lower 4-day").fill("Weekend Strength");
      await page.getByRole("button", { name: "3", exact: true }).click();
      await page.getByRole("button", { name: /set up days/i }).click();
      await page.getByRole("button", { name: /edit days/i }).click();
      await page.getByRole("button", { name: /add section/i }).click();
      await page.getByRole("button", { name: /strength/i }).click();
      await shot("builder", "Routine builder", "Editing first day with a strength section");
      await page.goto(`programs/${program.id}/days/${program.days[0].id}`);
      await page.getByRole("button", { name: "Start new session", exact: true }).click();
      const cells = page.locator('input[id^="cell-"]');
      await expect(cells.first()).toBeVisible();
      const values = ["12", "135x5", "135x5", "135x5", "40x10", "40x10"];
      for (let i = 0; i < await cells.count(); i++) await cells.nth(i).fill(values[i % values.length]);
      await cells.last().blur();
      await page.waitForTimeout(1800);
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot("workout", "Workout day", "Lower body with entered sets, warmup, main lift and accessory");
      await page.getByRole("button", { name: /history for/i }).nth(1).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await expect(page.getByTestId("history-workout").first()).toBeVisible();
      await shot("exercise-history", "Exercise history drawer", "Previous squat sessions from three weeks");
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.getByRole("button", { name: /finish workout/i }).click();
      await page.getByRole("button", { name: /finish & lock|finish anyway/i }).click();
      await expect(page.getByRole("dialog", { name: /complete/i })).toBeVisible();
      await shot("session-summary", "Session summary", "Completed lower body session with all sets logged");
      await page.getByRole("button", { name: /review session/i }).click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await go("history", "History");
      await expect(page.getByText(/squat/i).first()).toBeVisible();
      await shot("history", "History", "Populated movement families with logged sessions");
      await page.getByRole("button", { name: "Export for AI" }).click();
      await expect(page.getByLabel("Export preview")).toHaveValue(/Everyday Strength/);
      await shot("history-export", "History export", "Export scope and populated text preview");
      await go("library", "Library");
      await shot("library", "Library", "Exercise catalog and movement families");
      await go("settings", "Workspace");
      await shot("workspace", "Workspace", "Appearance and local workspace controls");
      completedVariants.add(variant.name);
    } catch (error) {
      console.log(`Capture failed at ${page.url()}`);
      console.log((await page.locator("body").innerText()).slice(0, 3000));
      await page.screenshot({ path: `/tmp/trainer-flow-failure-${variant.name}.png` });
      throw error;
    } finally {
      await context.close();
    }
  });
}
