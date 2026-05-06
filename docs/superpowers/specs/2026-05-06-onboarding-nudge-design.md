# Onboarding Nudge — Design Spec

**Date:** 2026-05-06
**Status:** Approved

## Summary

On a fresh install, no profile exists in IndexedDB and the app offers no useful guidance. This spec adds a lightweight onboarding nudge that surfaces in two contextually appropriate places and fixes the dead-end Profile page experience for new users.

## Goals

- Direct first-time users to fill out their Profile without blocking or requiring a wizard
- Warn users on the Prompts page before they copy a prompt that will be generic due to a missing profile
- Fix the Profile page so it's usable as a creation surface, not just an editing one

## Non-goals

- No guided multi-step wizard
- No modal or full-page interstitial
- No dismissible banner (nudge stays until profile is saved)
- No change to the Profile page for users who already have a profile

---

## Detection

The nudge condition is `profile === undefined && !loading`, using the existing `profile` value from `LocalDataProvider` context. No new storage, flags, or heuristics needed.

Once the user saves a profile for the first time, `LocalDataProvider.refresh()` is called (already wired into `ProfileClient.saveEdit()`), `profile` becomes defined, and both nudges disappear automatically.

---

## Today Page Banner

**Location:** Top of `TodayClient`, above all other content.

**Shown when:** `!profile && !loading`

**Behavior:**
- Non-dismissible — stays until a profile is saved
- Contains a brief message and a link to `/profile`
- Styled as a soft informational callout (accent color, not an error)

**Suggested copy:**
> Welcome to trAIner — set up your Profile so the app can tailor your workouts. **Go to Profile →**

---

## Prompts Page Warning

**Location:** Inline block inside `PromptBuilderClient`, rendered above the generated prompt output.

**Shown when:** `!profile`

**Behavior:**
- Non-dismissible
- Slightly more prominent than the Today banner (warn color) since acting without a profile produces a low-quality output
- Contains a direct explanation and a link to `/profile`

**Suggested copy:**
> No profile found. The prompt below won't include your goals, equipment, or constraints — fill out your **Profile** first for a useful result.

---

## Profile Page — Empty State

**Current behavior:** When `profile === undefined`, `ProfileClient` renders a dead-end message: "No profile found. Import a program to create one." This is incorrect (import is not required) and leaves the user with nothing to do.

**New behavior:** When `profile === undefined`, `ProfileClient` renders all sections in their edit/input state with empty values, ready to be filled. A "Save profile" action at the top (or within each card via the existing Save button pattern) writes a new `ProfileDocument` via `profileRepo.save()` and calls `refresh()`.

**Implementation approach:**
- Initialize a blank draft when `profile` is undefined: `{ id: "local-profile", name: "", goals: [], equipment: [], constraints: [], trainingAge: "", defaultDaysPerWeek: 4, updatedAt: "" }`
- Put all sections into edit mode by default (`editingSection` can remain per-section, but the name field and at minimum one key section should be auto-focused or opened)
- The existing `saveEdit()` path already handles the first save correctly — `profileRepo.save()` does a `put`, which creates or updates

**What does not change:**
- The editing UX for existing profiles is untouched
- `defaultProfile` in `sample.ts` remains test-only; no runtime seeding

---

## Profile Page — Reset Button

**Purpose:** Development/testing convenience. Allows wiping all app data back to a clean state without navigating to Workspace settings.

**Location:** Bottom of `ProfileClient`, below all profile cards. Shown for both new and existing users (it's useful regardless of profile state).

**Behavior — two-step confirmation:**
1. First click reveals an inline danger panel below the button (the button itself does not immediately act)
2. The panel shows a warning message and a second explicit "Yes, wipe everything" button
3. Clicking the second button calls the existing `resetWorkspace()` from `src/lib/backup/backup.ts` and reloads the page
4. Clicking anywhere else (or a "Cancel" link in the panel) collapses the panel without acting

This two-step reveal pattern is more intentional than a single `confirm()` dialog and consistent with the app's in-page UI style.

**Styling:**
- First button: danger color (`var(--bad)`), labeled "Reset workspace"
- Expanded panel: red-tinted background, border in danger color
- Warning text: "This will permanently delete all programs, logs, profile data, and aliases. There is no undo."
- Confirm button inside panel: solid red, labeled "Yes, wipe everything"
- Cancel: plain text link or ghost button

**Note:** `resetWorkspace()` already exists and is used by `SettingsClient`. No new logic needed — just a new call site.

---

## Files Affected

| File | Change |
|---|---|
| `src/components/workout/TodayClient.tsx` | Add banner when `!profile && !loading` |
| `src/components/prompts/PromptBuilderClient.tsx` | Add inline warning when `!profile` |
| `src/components/profile/ProfileClient.tsx` | Replace dead-end message with editable empty state; add reset button at bottom |

No changes to `LocalDataProvider`, `profileRepo`, `appDb`, `sample.ts`, or `backup.ts`.

---

## Testing

- Fresh IndexedDB (clear site data): Today banner appears, Prompts warning appears, Profile page shows editable form
- After saving profile: both nudges disappear, Profile page switches to normal view
- Existing users (profile already saved): no nudges shown, Profile page unchanged
- Reset button: first click expands panel, second click wipes data and reloads; cancel collapses without acting
