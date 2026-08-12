# Client-Only Storage — Durability & Longevity Audit

Date: 2026-08-10
Scope: `src/lib/storage/`, `src/lib/backup/`, `src/lib/workspace/`, the workout autosave write path
(`src/lib/workout/useDebouncedAutoSave.ts`, `src/components/workout/WorkoutDayClient.tsx`), and the
PWA/service-worker layer (`public/sw.js`, `src/components/pwa/`, `vite.config.ts`).
Method: two independent passes — one by Claude, one by Codex (session `019fec65-0c3f-7082-9a4b-35af3cb63b67`)
deliberately given no information about the first pass's findings beyond "it's IndexedDB, not localStorage."
Findings merged here, with severities re-calibrated and each claim marked verified or plausible.

**Question this answers:** what will the client-only storage approach cost us over a multi-year horizon
of real use, and what should we fix first?

---

## One-line summary

The two things we were worried about — localStorage's 5MB cap and raw data growth — **are not the
risks**. Workout data is compact and lives in IndexedDB, not localStorage. The real exposure is
threefold: **the browser can delete everything without warning** (no `persist()` call), **the in-app
"snapshot" feature is a durability illusion** (backups stored inside the database they protect), and
**the hot autosave path can silently drop the last edits of a workout** (no lifecycle save, unawaited
unmount flush).

## Two myths to retire first

**Myth 1: we're on localStorage.** We aren't, for user data. Everything authoritative is IndexedDB —
database `trainer-local-first`, schema v9, opened via `idb` (`src/lib/storage/appDb.ts:6-9`).
localStorage holds exactly four values: theme, density, mono font (`ThemeProvider.tsx:12-42`) and one
onboarding flag (`workspace/onboarding.ts`). Under 100 bytes. The 5MB cap is irrelevant to us.

**Myth 2: data will outgrow the quota.** Run the math on our own schema. A `WorkoutSetLog` is ~60–80
bytes of JSON; a session of 6 exercises × 4 sets is ~2–4KB. At 4 sessions/week that's ~200
sessions/year, so **roughly 1MB per year**. Chrome grants IndexedDB a large share of free disk
(typically ~60%), Firefox is comparable, Safari allows ~1GB+ per origin. Decades of logging will not
approach the ceiling. Growth only becomes a problem via snapshots — see S2.

---

## Findings, ranked

| # | Finding | Severity | Status | Found by |
|---|---------|----------|--------|----------|
| S1 | Browser can evict everything; `persist()` never called | **High** | Verified | Claude |
| S2 | Snapshots live in the DB they protect; unbounded, undeletable | **High** | Verified | Both |
| S3 | Autosave can lose the last edits of a workout | **High** | Verified | Codex |
| S4 | Restore bypasses every record migration; export format frozen at v1 | **High** | Verified | Codex |
| S5 | Restore clears the workspace before validating the replacement properly | **High** | Verified | Codex |
| S6 | An old tab blocks a future schema upgrade forever, silently | Medium | Verified | Both |
| S7 | PWA/service-worker paths don't match the deployed base | Medium | Verified | Both |
| S8 | Write failures have no user-visible path on the unmount route | Medium | Verified | Both |
| S9 | `metrics` store is dead, unexported, and not cleared by restore | Low (latent) | Verified | Claude |
| S10 | Export is not a point-in-time snapshot | Low | Verified | Codex |

> **Dropped:** a twelfth finding (v7 date migration misassigning legacy workouts across a timezone
> change) was raised by Codex and **deliberately closed without action on 2026-08-10**. It only affects
> pre-v7 logs lacking `performedDate`, only when the device timezone changed in between, and for anyone
> already upgraded it is damage already done rather than a future risk. Not worth carrying.

---

## S1 — Browser can evict everything; `persist()` never called

**Severity: High.** This is the single largest threat to multi-year history, and it's larger than
"the user forgot to export."

The framing we started with was that data loss requires user negligence. It doesn't. Browsers delete
script-writable storage on their own:

- **Safari (iOS + macOS) caps script-writable storage at 7 days** without site interaction. Someone
  who takes a two-week break from the gym can return to an empty app. Installed web apps (added to
  home screen) are exempt — which we don't currently qualify for, see S7.
- Chrome/Android evicts non-persistent origins under disk pressure.
- "Clear browsing data," any privacy cleaner, or a profile reset wipes it.

**Evidence:** the only `navigator.storage` call in the codebase is `estimate()`, used purely for the
size readout (`workspace/stats.ts:24`). Nothing ever calls `navigator.storage.persist()`. That single
call moves the origin to the persistent bucket, which Chrome grants freely to installed PWAs and
which exempts us from routine eviction.

**Fix:** one line at startup, plus surface the granted/denied result in Settings so the user knows
which regime they're in. Cheap, and it protects against the worst outcome.

## S2 — Snapshots live in the database they protect

**Severity: High** — not for growth (that's secondary) but because the feature *reads as safety and
isn't*.

"Snapshot current state" (`SettingsClient.tsx:111-118`) calls `exportBackup()` and writes the full
result into the `backups` object store of the same IndexedDB database
(`storage/backupRepo.ts:4-8`). So every failure mode in S1 destroys the history **and every snapshot
of it, together**. A user who diligently snapshots weekly and never downloads a JSON file has no
backup at all. That's worse than having no feature, because it manufactures false confidence.

Secondary problem — **unbounded growth.** Each snapshot is a complete copy of all programs, logs,
aliases, bodyweight and presets (`backup/backup.ts:23-34`). Nothing prunes them: `backupRepo` exposes
only `save` and `list` — no delete, no retention policy — and the Settings UI only ever creates them
(`SettingsClient.tsx:161`). Snapshot weekly for five years and you have ~260 full copies, each larger
than the last. That's roughly quadratic, and it is the *only* realistic path to
`QuotaExceededError` in this app. Settings also fetches `quota` from `estimate()` and discards it,
displaying used KB only (`workspace/stats.ts:24-37`), so the user gets no warning as they approach a
limit.

**Fix:** cap retention (keep last N), add delete, show snapshots' size separately from real data, and
reframe the UI so downloading a file is the primary durability action and snapshots are explicitly
labeled as undo-points, not backups.

## S3 — Autosave can lose the last edits of a workout

**Severity: High.** This is the hottest write path in the app, and unlike everything else here it
loses data during *ordinary* use, not in an edge case. Independently verified.

Three compounding defects:

**(a) No lifecycle save at all.** There is no `pagehide`, `visibilitychange`, or `beforeunload`
handler anywhere in `src/` — confirmed by grep. Edits sit in memory for 1.5 seconds before being
written (`WorkoutDayClient.tsx:766`). Close the tab, swipe the PWA away, or get killed by iOS
mid-set, and those edits are simply gone. On a phone at the gym this is the most likely loss event we
have.

**(b) Unmount flush is fired and forgotten.** `useEffect(() => () => { void flush(); }, [])`
(`WorkoutDayClient.tsx:769-772`) launches an async IndexedDB write during unmount without awaiting
it — React can't await a cleanup function. On in-app navigation the JS context survives so the write
usually lands; on tab close it does not.

**(c) No in-flight serialization.** `doSave` has no lock (`useDebouncedAutoSave.ts:29-37`), and
`saveCells` is read-then-replace-whole-document (`WorkoutDayClient.tsx:713`, `:752`, via
`logRepo.save` → `put`). Two overlapping saves each read `existing`, then each write a complete
record. If save A (carrying value V1) has a slow `existing` read and creates its `put` transaction
after save B (carrying newer V2), **A overwrites V2 with V1**. Note `finishWorkout` has a
`saving.current` guard (`:790`) — autosave has no equivalent.

One calibration: Codex framed (c) as a headline stale-overwrite risk. The window is genuinely
narrow, because `doSave` reads `valueRef.current` at invocation time so each save starts from the
latest value. The ordering hazard is real but low-probability. **(a) is the finding that matters** —
it's a guaranteed loss, not a race.

**Fix:** add a `pagehide`/`visibilitychange` handler that writes synchronously-as-possible; add an
in-flight promise chain so saves serialize; consider shortening the debounce for cell edits.

## S4 — Restore bypasses every record migration

**Severity: High.** Sharp finding, and it makes our backup files quietly lossy across versions.

The v5, v7 and v8 log migrations only run inside `openDB`'s upgrade transaction
(`appDb.ts:53`, `:91`, `:113`, `:137`). `restoreBackup` writes records straight into an
already-current database (`backup/backup.ts:99-119`), so **none of them run on restored data**. And
`BackupDocument.version` is hardcoded to `1` (`programs/types.ts:214`, written at `backup.ts:25`)
while the DB schema has moved to 9 — so the JSON file carries no signal about which record shape is
inside it, and `restoreBackup` hard-rejects anything that isn't `1` (`backup.ts:44`).

Concretely: restore a pre-v7/v8 export into v9 and those logs never get `performedDate` backfilled,
never get phantom-log cleanup, and keep raw `"10kg x10"` cells that contribute zero volume — even
though plugging the same data in via a database upgrade would repair all three.

This also subsumes a related gap: `restoreBackup` clears and refills seven stores but leaves
`metrics` and `backups` untouched (`backup.ts:101-111`), and `exportBackup` omits `metrics`
entirely (see S9).

**Fix:** stamp a real schema version into the export, and route restored records through the same
migration functions the DB upgrade uses (extract them so both paths share one implementation).

## S5 — Restore clears the workspace before validating properly

**Severity: High**, because the failure is destructive and unrecoverable.

Validation checks only that required arrays contain non-null objects carrying string `id`s
(`backup.ts:11-21`, `:47-97`). There's no validation of nested structure, timestamps, units, or
referential integrity. Then all seven stores are cleared and refilled in one transaction
(`backup.ts:101-119`).

A `ProgramDocument` actually requires `title`, `days`, `overrides` and timestamps
(`types.ts:45`); a `WorkoutLogDocument` requires `programId`, `dayId`, `performedAt`, `entries`
(`types.ts:137`). So a truncated or hand-edited file containing `{"id": "p1"}` passes validation,
commits, and destroys the existing workspace — leaving records that crash any page expecting
`program.days`.

**Fix:** validate nested shape before the destructive clear, and auto-snapshot to a downloadable file
immediately before restore so a bad restore is reversible.

## S6 — An old tab blocks a future schema upgrade, silently

**Severity: Medium.** Cheap to fix, annoying if it bites.

The connection is cached for the page lifetime (`appDb.ts:50`, `:177`), and `openDB` passes only an
`upgrade` handler (`appDb.ts:53`) — no `blocked`, no `blocking`. Ship DB v10 while a user has a pinned
or sleeping v9 tab open and the new tab's upgrade waits on the old connection: `getDb()` never
resolves, and the UI just sits there with no error and no instruction. `resetWorkspace` already
handles this correctly and tells the user to close other tabs (`backup.ts:131`) — `getDb` should do
the same, and `blocking` should close the stale connection.

## S7 — PWA/service-worker paths don't match the deployed base

**Severity: Medium** today, but it's also blocking the S1 fix and hiding a future trap.

`vite.config.ts:12` sets `base: "/trAIner/"` and we deploy to GitHub Pages
(`.github/workflows/deploy.yml`). But `ServiceWorkerRegistration.tsx:8` registers `/sw.js` at the
domain root, `sw.js`'s `APP_SHELL` lists root paths (`/`, `/today`, …), and the manifest declares
`start_url: "/today"` with icons at `/icon-192.png`. All of those 404 under `/trAIner/`, and the
registration failure is swallowed by `.catch(() => undefined)`.

Three consequences: **no offline support** despite shipping a service worker; **"add to home screen"
likely doesn't work properly**, which costs us the Safari storage exemption that S1 depends on; and
when the paths get fixed we immediately inherit `sw.js`'s cache-first-for-every-GET fetch handler,
which pins users to a stale app shell indefinitely. That last one turns nasty in combination with
S6 — stale shell running v9 code against a v10 database throws `VersionError` and the app cannot open
its own data.

**Fix the paths and the fetch strategy in the same change**, not separately. Network-first (or
stale-while-revalidate) for navigations, cache-first only for hashed assets.

## S8 — Write failures have no user-visible path on the unmount route

**Severity: Medium.** Every repo method is a bare `await db.put(...)`. The debounced autosave does
surface failures as an `error` status (`useDebouncedAutoSave.ts:34`), which is good — but the
unmount flush runs after its UI is gone, so a quota or corruption failure there is completely silent.
Combined with S3(a), a failed final write looks identical to a successful one.

## S9 — `metrics` store is dead, unexported, and not cleared by restore

**Severity: Low (latent).** Nothing outside `metricsRepo` reads or writes the `metrics` store —
verified by grep; the only other reference is the type import in `appDb.ts:4`. It's absent from
`exportBackup` and not cleared by `restoreBackup`. Harmless while unused, but the moment it becomes a
derived cache, restoring a backup will leave metrics computed from data that no longer exists.
**Either delete the store or wire it into export/restore before using it.**

## S10 — Export is not a point-in-time snapshot

**Severity: Low.** `exportBackup` reads each repo sequentially in separate transactions
(`backup.ts:23-34`) rather than one read-only transaction spanning the stores. With two tabs open, a
backup can contain a program from one moment and logs from another — and S5's shallow validation
happily accepts the mismatch. Single-tab use is unaffected.

---

## What's actually fine

Worth recording so we don't churn on it:

- **Restore is atomic** across the stores it covers — clears and puts share one readwrite transaction
  and await `tx.done` (`backup.ts:101-119`). A failed restore rolls back rather than half-applying.
- **DB migrations are correctly transactional** — they run inside the upgrade transaction and await
  each cursor mutation before continuing (`appDb.ts:95`, `:142`).
- **Current writes preserve historical semantics** — `performedDate` is stamped at save time and each
  exercise's unit is serialized into the log, so later edits to an exercise don't rewrite history
  (`WorkoutDayClient.tsx:718`, `:752`).
- **Deterministic session IDs** prevent duplicate records for concurrent first-saves of the same
  (program, day, date) (`localDate.ts:30`). Doesn't prevent S3's whole-record overwrite, but the
  duplicate-session class of bug is closed by construction.
- **Raw data volume** is a non-issue, as established above.

---

## Suggested order of work

Ranked by (loss prevented) ÷ (effort), not by severity alone.

1. **S3(a) — lifecycle save handler.** Guaranteed data loss on every tab close during the debounce
   window, on the app's primary path. Small change, largest real-world payoff.
2. **S1 — call `persist()`** and show the result in Settings. One line; prevents whole-history loss.
3. **S7 — fix base paths + fetch strategy together.** Unblocks the PWA install that S1's Safari
   exemption needs, and defuses the stale-shell trap before it can ship.
4. **S2 — snapshot retention, delete, and honest labeling.** Removes the false-confidence trap and
   the only real quota path.
5. **S6 — `blocked`/`blocking` handlers.** Small, prevents a baffling silent hang on our next schema bump.
6. **S5 — validate before the destructive clear** + auto-download a pre-restore file.
7. **S3(b,c) — serialize saves, await what can be awaited.**
8. **S4 — versioned exports + shared migration path.** Largest design change here; worth doing
   before we ship another schema bump, since every export we write until then is a future problem.
9. **S9, S10** — cleanup and correctness, no urgency.

Items 1–3 are each small and independently shippable. Item 8 is the one that deserves its own
brainstorm.

## The strategic question

None of the above changes the fundamental position: **the only durable copy of a user's history is a
file they have to remember to download.** Everything here reduces the odds of loss; nothing
eliminates it.

The durability fix is **platform-split**, and this is the key constraint to design around: there is a
real automatic fix on desktop and **no automatic fix at all on iOS**.

### Desktop (Chrome/Edge): File System Access API

Hold a persistent directory handle (`showDirectoryPicker`) and write a real file-backed autosave
alongside IndexedDB. The handle survives across sessions once stored in IndexedDB and re-permissioned,
so this genuinely solves S1 — a browser-storage wipe no longer loses history. No hosting, no auth, no
server; fully compatible with GitHub Pages. **Chromium desktop only** — not Firefox, not Safari.

### iOS: the API does not exist, and no browser choice escapes it

File System Access is unavailable on iOS. Critically, **every browser on iOS is WebKit underneath**,
so installing Chrome or Firefox there changes nothing — same engine, same limits.

Two traps worth naming so nobody rediscovers them:

- **OPFS is not a substitute.** Safari *does* support the Origin Private File System
  (`navigator.storage.getDirectory()`), and it's easy to mistake for the same capability. It isn't:
  OPFS is origin-private, invisible to the user and to the Files app, and it lives in **the same
  evictable storage bucket as IndexedDB**. It is wiped by exactly the events in S1, so it contributes
  nothing to durability.
- **There is no background or automatic write to user-visible storage on iOS.** Any durable copy
  requires a user gesture, every time. That's a platform ceiling, not something better code gets past.

So on iOS the strategy has to be *lower the friction and raise the prompting*, not automate.

**Decision (2026-08-10):** prompting iOS users to install to the home screen is **the** iOS durability
story. Web Share export and similar friction-reduction work is **deliberately out of scope** — not
rejected on merit, just not needed if install lands. Prerequisite: the S7 plumbing has to actually
support installation first.

1. **Get the PWA installed to the home screen** — the highest-value iOS durability action available,
   because installed web apps are exempt from Safari's 7-day storage cap. Currently blocked by S7's
   path bug. **This alone converts iOS from our worst platform to a tolerable one.**
2. **Export-age nudge** in Settings: "last exported 34 days ago." We track snapshot dates
   (`stats.ts:31-33`) but nothing about actual downloads, so we currently can't even ask this question.
   Keep this regardless — it's the backstop for every platform.

### Three constraints on building the install prompt

**(a) There is no programmatic install on iOS.** No `beforeinstallprompt` event, no `prompt()` call —
that's Chromium-only. On iOS the user must tap Share → "Add to Home Screen" themselves, so our
"prompt" is necessarily a piece of instructional UI, not an API call. Plan for a small custom
explainer with the actual steps, shown only to iOS Safari users who aren't already installed.

**(b) Detecting already-installed differs by platform.** iOS exposes the non-standard
`navigator.standalone === true`; everywhere else it's
`matchMedia('(display-mode: standalone)').matches`. Check both, or the prompt will nag users who
already did the thing.

**(c) ✅ CONFIRMED: installed iOS web apps do NOT share IndexedDB with Safari.** Verified by web
search 2026-08-10 (sources at the bottom of this doc). Cookies, Web Storage and IndexedDB are
**isolated** between Safari and a home screen web app; each installed instance gets its own container.
Service Worker registration and Cache Storage *are* shared, which makes this easy to misdiagnose — the
app shell loads fine and only the user's data appears missing.

So the hazard is real, not hypothetical: telling an existing user "install this to protect your data"
hands them **an app that looks completely empty**. Worst possible outcome for a feature whose entire
purpose is reassurance about data safety.

**This is why the install instructions must carry an explicit data-migration blurb** — export from
Safari, then import into the installed app. Wording agreed 2026-08-10, along the lines of: *"if you've
been using this in your browser, you'll need to download your profile data and import it into the
installed app."* Not optional copy; it's the only thing standing between an existing user and apparent
total data loss.

**(d) `persist()` works in Safari too, and install makes it more likely to be granted.** Corrects an
earlier assumption in this doc that `persist()` was effectively a Chrome-side lever. `StorageManager.persist()`
and `.persisted()` ship in **Safari 17.0+**, and WebKit grants the request "based on heuristics like
whether the website is opened as a Home Screen Web App." So S1 and the install prompt **compound** on
iOS rather than being alternatives — install, then request persistence, and the origin is exempt from
eviction by both routes. Do S1 and S7 together.

All of this is additive and none of it requires giving up the local-first, zero-hosting position.

---

## Verification log (2026-08-10)

Every uncertain claim in this doc was checked by web search rather than left as an assumption.

| Claim | Result |
|---|---|
| iOS home screen app has storage isolated from Safari | **Confirmed.** IndexedDB/Web Storage/cookies isolated; Service Worker + Cache Storage shared |
| Safari's 7-day script-writable storage cap exists | **Confirmed.** Deletes IndexedDB, LocalStorage, SessionStorage, SW registrations after 7 days of Safari use without interaction |
| Installed home screen apps are exempt from the 7-day cap | **Confirmed.** They run their own use counter outside Safari, which resets on actual use |
| File System Access pickers unavailable on iOS | **Confirmed.** Safari ships only OPFS on macOS/iPadOS/iOS; `showOpenFilePicker`/`showSaveFilePicker`/`showDirectoryPicker` absent on all Safari platforms |
| No `beforeinstallprompt` on iOS | **Confirmed.** Apple doesn't implement it; every iOS install is a manual Add to Home Screen, so instructional UI is the only option |
| Detect installed via `navigator.standalone` / `display-mode` | **Confirmed.** Check `matchMedia('(display-mode: standalone)').matches \|\| navigator.standalone === true` |
| `persist()` is Chrome-only | **WRONG — corrected.** Ships in Safari 17.0+; WebKit grants partly on the basis of being a Home Screen Web App |

**Sources:**
- [Updates to Storage Policy — WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Full Third-Party Cookie Blocking and More — WebKit](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/)
- [Safari on iOS 14 for PWA and Web Developers — firt.dev](https://firt.dev/ios-14/)
- [PWA iOS Limitations and Safari Support (2026) — MagicBell](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
- [File System API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)
- [File System Access API — Can I use](https://caniuse.com/native-filesystem-api)
- [Installation prompt — web.dev](https://web.dev/learn/pwa/installation-prompt)

Browser capability moves; re-verify at implementation time if this doc is more than a few months old.
The structural points (Chromium-desktop-only file pickers, WebKit-only iOS, iOS storage isolation) have
been stable for years.
