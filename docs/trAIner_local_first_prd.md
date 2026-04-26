# Product Requirements Document — trAIner (Local-First Workout Studio)

## 1. Product Definition

**trAIner** is a single-user, local-first Progressive Web App for workout programming and tracking that replaces a spreadsheet workflow while preserving its flexibility, with optional LLM-assisted routine generation via copy/paste.

The system is:

- a document editor for workout programs
- a high-speed workout logging interface
- a prompt construction tool
- a local data store with import/export

There is no backend, no accounts, and no in-app AI API integration.

This direction supersedes the earlier hosted, monetized, multi-user product concept and aligns with the local-first redesign documented in the supporting materials.

## 2. Product Goals

### Primary Goals

- Eliminate friction between:
  - routine generation from an external LLM or human trainer notes
  - routine import and editing
  - in-gym execution and tracking
  - historical review for progression decisions
- Match or exceed spreadsheet usability for workout tracking:
  - freeform inputs
  - fast edits
  - high-density visibility
  - flexible notation
  - easy note-taking
- Keep the app fully usable offline after installation.

### Secondary Goals

- Preserve structured workout data for future analysis.
- Enable repeatable prompt-based routine generation and modification workflows.
- Preserve programming intent such as sections, supersets, and circuits.
- Make the mobile in-gym workflow the dominant design priority.

## 3. Non-Goals

The following are explicitly out of scope for this product:

- monetization or startup concerns
- multi-user support
- trainer dashboards
- in-app AI calls or chat
- subscriptions, billing, or authentication
- cross-device sync
- social features
- gamification, avatars, or challenges
- exercise video hosting
- advanced analytics for v1
- hosted SaaS deployment

## 4. Product Model

### 4.1 Mental Model

trAIner should behave less like a traditional CRUD SaaS app and more like a local creative/editor tool:

- like Photopea in its local workspace model
- like Google Sheets in its flexibility and visibility
- like a structured document editor for workout plans

The app should feel like a persistent workout workspace where the user can open, edit, import, export, and log workout documents.

### 4.2 Core Entities

#### Profile

Stores reusable prompt-generation context and profile settings, including:

- body stats
- training history
- injuries and constraints
- goals
- equipment access
- unit preferences
- user prompt preferences

The profile is persistent and separate from routines.

#### Program

Canonical stored routine object. A program may represent:

- a full imported multi-week routine
- a wrapped single-day import

Each program stores:

- program metadata
- normalized days
- original source JSON
- import warnings
- the profile snapshot used at import time

#### Day

The main UI unit. A day contains:

- title
- optional week/cycle placement
- sections
- notes
- override relationships

#### Section

Preserves programming intent, such as:

- warmup
- explosive
- strength
- metcon
- hypertrophy
- rehab

Sections remain visible in the UI.

#### Exercise Group

Preserves grouping semantics, such as:

- single
- superset
- circuit
- giant set

Groups remain visible in the UI and should help communicate workout flow.

#### Exercise

A hybrid object that preserves both raw imported data and normalized metadata.

Fields may include:

- raw imported name
- canonical exercise id if matched
- display name
- aliases
- prescription fields
- notes
- tempo fields
- AI-provided tags
- catalog-derived metadata
- match status

#### Workout Log

Separate from the prescribed program. Stores what actually happened on a given date.

Set entries are freeform strings, not forced numeric fields.

Examples:

- `60x10`
- `BWx8`
- `BW+10x5`
- `red band x20`
- `30s hold`
- `Skipped`
- `Pain`

A prescribed row may start with a certain number of set cells, but the user must be able to add additional cells to that row as needed.

#### Override

Represents a scoped modification layered on top of a base program.

Allowed scopes:

- base program
- week only
- day only

Rendered output is produced from:

`base program + applicable week overrides + applicable day overrides`

## 5. Core Workflows

### 5.1 Routine Generation Workflow

1. Build a prompt inside the app.
2. Copy the prompt to the clipboard.
3. Paste it into an external LLM.
4. Receive structured JSON.
5. Import the JSON into the app.
6. Normalize and reconcile it against the local exercise library.

### 5.2 Primary Workout Workflow

1. Open the app.
2. Land on today's workout or active day.
3. View the prescribed workout with visible sections and grouping semantics.
4. Enter performed sets quickly using freeform text cells.
5. Add or remove cells as needed.
6. Review relevant previous sessions inline or nearby.
7. Add notes.
8. Finish the workout.

This loop must be faster and easier than maintaining a spreadsheet on a phone.

### 5.3 Modification Workflow

1. Trigger an AI-assisted modification flow from a day, week, or program context.
2. Enter the requested modification.
3. Generate a prompt that includes:
   - profile context
   - current routine JSON for the selected scope
   - modification instructions
   - output contract
4. Copy that prompt to the clipboard.
5. Paste it into an external LLM.
6. Import the returned JSON replacement.
7. Review the diff.
8. Apply it to the selected scope.

Only full replacements are supported. Patch-style output is not the primary model.

### 5.4 Manual Editing Workflow

The user must be able to edit routines manually in a spreadsheet-like manner:

- change exercise name
- change prescription
- edit notes
- add or remove set cells
- reorder exercises
- replace exercises
- adjust sections or group notes

The UI may offer an optional expanded edit modal for more complex edits, but inline editing remains the default.

### 5.5 Historical Review Workflow

The app must make it easy to review prior sessions for a given exercise so the user can decide what to lift today.

This is one of the highest-priority workflows and should preserve the key value of the spreadsheet approach: quick visibility into what happened last time and recently.

## 6. Prompt System

### 6.1 Purpose

The app does not call an AI model directly. Its prompt system exists to make external LLM workflows more repeatable and structured.

### 6.2 Prompt Components

The prompt builder should support assembling prompts from reusable blocks, including:

- profile block
- routine structure block
- constraints block
- output schema block
- selected persona blocks

### 6.3 Persona Model

The app ships with a fixed library of pre-canned personas.

Requirements:

- personas are fixed and bundled with the app
- users may edit persona text while composing a prompt
- those edits affect only the current prompt composition
- edits do not overwrite the bundled persona definitions
- persona customization is ephemeral, not persistent to the library

### 6.4 Prompt Types

Supported prompt categories:

- initial routine generation
- routine refinement
- replacement day
- replacement week
- replacement program

Generated prompts should include all context necessary for the external model to return a complete replacement for the selected scope.

## 7. Routine Schema Direction

The product retains the current rich schema direction rather than collapsing into the minimal MVP routine schema.

The schema should preserve:

- sections
- exercise groups
- notes
- tempo fields
- tags
- rich workout structure

The app may still borrow useful validation and versioning ideas from the prior JSON schema work, but the canonical internal model remains the richer section/group-based model.

## 8. Import and Normalization

### 8.1 Import Requirements

The importer must support:

- single-day rich JSON imports
- full-program imports

Internally, everything is stored as a canonical program-shaped object.

### 8.2 Normalization Pipeline

The import pipeline must:

1. parse incoming JSON
2. detect whether it is a single-day or full-program shape
3. convert it into canonical `Program -> Days -> Sections -> Groups -> Exercises`
4. match exercises against the local exercise library and user aliases
5. enrich matched exercises with canonical metadata
6. preserve original imported fields where useful
7. attach warnings and review metadata
8. store the original import payload and a full snapshot

### 8.3 Import Versioning

Each import creates a full snapshot.

The system should not rely on diff-based routine version history for import storage.

## 9. Exercise Library and Matching

### 9.1 Exercise Library

The app ships with a bundled exercise library containing common names, aliases, and structured metadata.

The purpose of the library is to:

- reconcile variability in LLM-generated exercise naming
- preserve structured metadata for later analysis
- prevent data loss during import and tracking

### 9.2 Matching Strategy

Matching should use:

1. exact canonical matches
2. alias matches
3. normalized-name matches
4. fuzzy suggestions for manual review

### 9.3 Resolution Requirement

Exercise matching resolution is required.

If an exercise cannot be confidently matched:

- the user must resolve it before finalizing the import
- the system must not silently allow unresolved exercises to drift through the workflow
- the goal is to avoid data loss and preserve clean historical records

User-approved resolutions may become local aliases for future imports.

## 10. UI Requirements

### 10.1 Core UX Principles

The UI must prioritize:

- speed
- density
- flexibility
- readability
- offline confidence

The design should not over-optimize for airy dashboard aesthetics.

### 10.2 Visual Direction

Preferred visual direction: hybrid card/grid.

Implications:

- sections or exercise groups may be displayed as card-like containers
- within those containers, row/cell interaction should still feel spreadsheet-like
- the user must still be able to quickly compare prior session values

### 10.3 Today Screen

The Today screen is the most important screen in the app.

It should support:

- visible day title and context
- visible sections and exercise grouping
- exercise rows with prescribed targets
- freeform set-entry cells
- ability to add more cells to a row
- notes
- access to modification flow
- easy access to historical performance

### 10.4 History Visibility

The product must preserve the key spreadsheet benefit of quickly seeing what happened in previous workouts.

History may be presented through a drawer, inline panel, side panel, bottom sheet, or compact adjacent display, but it must remain fast to access and easy to scan.

### 10.5 Editing Surface

Default editing should be inline and fast.

An optional expanded edit modal may exist for more complex edits, such as:

- changing multiple fields at once
- editing notes and metadata
- adjusting tempos or tags
- handling more complex row changes

### 10.6 Scope on Save

Whenever an edit affects routine structure, the app should require an explicit scope choice:

- base program
- this week only
- this day only

This prevents silent mutation.

## 11. Storage and Offline Model

### 11.1 Local-First Requirement

The runtime must be fully usable offline after initial install.

No external requests are required for normal operation.

### 11.2 Persistence

Primary persistence should be local and robust enough for:

- profile
- programs
- logs
- overrides
- aliases
- prompt presets
- routine snapshots

### 11.3 Export and Backup

Export is workspace-wide only.

There should be a full workspace export format that includes everything required to restore the app state on the same or another device.

Per-program export is not required.

## 12. PWA Requirements

The app must:

- be installable as a PWA
- work offline after first load
- load quickly on mobile
- preserve local state reliably
- feel safe to use in the gym without connectivity concerns

## 13. MVP Scope

### 13.1 In Scope

- single saved profile
- fixed bundled persona library
- prompt builder
- single-day import
- full-program import
- canonical normalization pipeline
- bundled exercise library
- alias handling
- required exercise resolution flow
- day-centric workout UI
- visible sections and group semantics
- freeform set logging
- add/remove set cells
- historical exercise visibility
- scoped overrides
- modification prompt generation for external LLMs
- full-snapshot import versioning
- local-first persistence
- full workspace export/import
- fully offline-capable PWA runtime after install

### 13.2 Out of Scope

- in-app AI calls
- sync between devices
- auth
- hosting
- billing
- multi-user support
- advanced analytics engine
- social features
- gamification
- public SaaS deployment

## 14. Product Principles

### 14.1 Never Make the User Serve the Schema

The user should be able to log messy real-world workout notation without fighting validation.

Parsing and normalization can happen later where useful. Logging must remain flexible.

### 14.2 Preserve Structure

Programming intent matters. The app must preserve:

- sections
- group semantics
- scope of edits
- routine snapshots
- exercise identity resolution

### 14.3 Speed Over Ceremony

The gym-floor workflow dominates all design decisions.

### 14.4 Local Ownership

The user owns their data. The full workspace must be exportable and restorable without any hosted dependency.

## 15. Naming Note

Working name remains **trAIner**.

Alternative framings such as “Workout Studio,” “Routine Studio,” or “LiftSheet” remain useful for UI language or future renaming, but the current project name can remain trAIner for now.
