# PushFlow UI/UX Audit & Improvement Plan

**Date:** 2026-03-13
**Scope:** Full application audit — ProjectLibraryPage, ProjectEditorPage (Editor, Lanes, Loop Editor tabs), all panels and interactions.

---

## Part 1 — Product Understanding

### What the Application Is Trying to Accomplish

PushFlow converts MIDI-derived musical material into physically playable performances on the Ableton Push 3 8×8 pad grid. It jointly optimizes:

1. **Layout** — which sound goes on which pad
2. **Execution Plan** — which hand/finger plays each event over time

The goal is **human playability**: helping musicians understand why a pattern is hard, where the bottlenecks are, and how alternative layouts or fingerings could improve the situation.

### Core Interaction Model

1. **Import** MIDI → auto-splits into sound streams (one per unique pitch)
2. **Name** sounds (optional, with GM drum preset button)
3. **Assign** sounds to pads (drag from VoicePalette to grid, or auto-assign via Generate)
4. **Analyze** — solver computes finger assignments, difficulty, and fatigue
5. **Compare** — view 3 candidate solutions, switch between them, compare side-by-side
6. **Constrain** — pin specific fingers to specific pads, re-analyze
7. **Iterate** — adjust layout, re-generate, converge on a playable arrangement

### Primary User Task

A musician wants to answer: *"Given this MIDI pattern, what is the best pad layout and fingering strategy for playing it on Push 3?"*

### Does the Interface Support That Task Clearly?

**Partially.** The core pipeline (import → assign → analyze → compare) works end-to-end. However:

- The **relationship between timeline, grid, and metrics** is unclear to a new user
- There is **no onboarding or guided flow** — a first-time user sees an empty library and must discover the workflow
- **Three tabs** (Lanes / Loop Editor / Editor) create confusion about which one to use for what
- The **analysis results are dense and technical** — musicians need simpler summaries
- There is **no practice workflow** — no way to loop difficult sections, slow them down, or generate exercises

### Assumptions

- Primary users are intermediate-to-advanced Push 3 owners who want to optimize existing MIDI arrangements
- Users understand basic music terminology (MIDI, BPM, velocity) but not biomechanics jargon
- The application is browser-based, desktop-first (not mobile)
- No audio playback exists — all feedback is visual

---

## Part 2 — UI/UX Audit

### 1. Timeline and Event Visualization

**Current State:** `ExecutionTimeline` renders per-voice swim lanes with 20px-wide event pills colored by hand (blue=left, purple=right, red=unplayable). Wrapped in collapsible `TimelinePanel`.

**What Works:**
- Swim-lane-per-voice layout is intuitive for multi-sound patterns
- Hand coloring (blue/purple) is immediately readable
- Legend shows total events, unplayable count, and duration
- Clicking an event selects it, enabling inspection in EventDetailPanel

**Issues:**

| # | Issue | Severity |
|---|-------|----------|
| T1 | **No zoom or scroll** — timeline uses percentage positioning within a fixed-width container. Dense patterns overlap badly; sparse patterns waste space. | Critical |
| T2 | **No rhythmic grid lines** — no beat/bar markers. Impossible to relate events to musical time. | High |
| T3 | **Event pills overlap** — 20px fixed width means events at similar times stack on top of each other with no offset logic. | High |
| T4 | **No playback cursor or scrubbing** — cannot drag through time to see which pads activate. | High |
| T5 | **Time axis only shows 3 labels** (start, middle, end) — insufficient for patterns longer than a few seconds. | Medium |
| T6 | **No duration representation** — all events are same-width pills regardless of note duration. | Medium |
| T7 | **No density visualization** — dense sections are not highlighted, only visible as overlapping pills. | Medium |
| T8 | **Collapsed by default can be missed** — `useState(false)` means timeline starts open, but the panel header is subtle. | Low |

### 2. Push Grid Visualization

**Current State:** `InteractiveGrid` renders an 8×8 grid with row/column labels, hand-zone labels (Left/Right), drag-drop assignment, and context menu. Pads show voice name, finger abbreviations, and hit count badges.

**What Works:**
- Physical Push 3 orientation preserved (row 0 bottom, row 7 top)
- Left/right hand zones visually distinguished (blue/purple tints + zone labels)
- Drag-and-drop from VoicePalette to grid works naturally
- Pad-to-pad drag for swapping
- Context menu for finger constraints
- Selected event highlights corresponding pads with yellow ring
- Stale analysis indicator shown above grid

**Issues:**

| # | Issue | Severity |
|---|-------|----------|
| G1 | **No finger movement visualization** — no arrows, trajectories, or paths showing how fingers move between pads over time. | Critical |
| G2 | **No temporal animation** — grid only shows static state (aggregate of all assignments). Cannot see how the pattern unfolds in time. | High |
| G3 | **Pad information density too high at small text sizes** — voice name (9px), finger labels (8px), hit count badge (7px), constraint badge (7px) all crammed into 56×56px pads. Hard to read. | High |
| G4 | **Remove button ("x") uses JavaScript hover** instead of CSS `:hover`, and `style={{ opacity: undefined }}` causes initial opacity to default to 1 (visible), contradicting the `opacity-0` className. | High |
| G5 | **No heatmap overlay mode** — difficulty heatmap exists as a separate panel but cannot be overlaid on the grid itself. | Medium |
| G6 | **Empty pads show coordinates** in tiny (8px) text — not particularly useful and adds visual noise. | Low |
| G7 | **Muted streams on grid** show at 30% opacity but are still interactive (can be clicked, dragged). Potentially confusing. | Medium |

### 3. Finger Movement and Ergonomic Visualization

**Current State:** Movement data exists in the engine (`costBreakdown.movement`, `costBreakdown.stretch`, `costBreakdown.drift`) but is only exposed numerically in EventDetailPanel and DiagnosticsPanel. No visual movement representation exists.

**Issues:**

| # | Issue | Severity |
|---|-------|----------|
| M1 | **No movement path visualization whatsoever** — this is the core value proposition of the product and it's completely missing from the UI. | Critical |
| M2 | **No transition arrows between pads** — when stepping through events, there's no visual indication of which pad was previous vs. next. | Critical |
| M3 | **No hand pose visualization** — no indication of where each hand's "home position" is or how far it drifts. | High |
| M4 | **No stretch distance visualization** — stretch is a key ergonomic metric but has no spatial representation on the grid. | High |
| M5 | **No speed pressure indicator** — rapid transitions are only visible by examining individual event timestamps. | Medium |

**Recommended additions (priority order):**
1. Transition arrows on grid when stepping through events (previous → current → next)
2. Hand centroid markers showing home position drift
3. Difficulty-colored pad borders or glow based on per-pad cost
4. Onion-skin overlay showing last N hand positions
5. Stretch radius circles around active fingers

### 4. Metrics and Analysis Panels

**Current State:** Three panels provide metrics:
- `AnalysisSidePanel`: DifficultyHeatmap (passage bars), score/drift/hard counts, finger usage stats, candidate switcher
- `DiagnosticsPanel`: Hand balance bar, score summary grid, avg cost breakdown (6 bars), finger fatigue bars
- `EventDetailPanel`: Per-event info fields (sound, time, pad, hand, finger, cost, difficulty, movement, stretch, drift), finger constraint controls

**What Works:**
- DifficultyHeatmap's passage-level bars with color coding (green→red) are effective
- Hand balance visualization (blue/purple bar) is immediately clear
- Candidate switcher with percentage scores enables quick comparison
- Event detail panel's constraint controls allow direct user intervention

**Issues:**

| # | Issue | Severity |
|---|-------|----------|
| A1 | **Metrics lack context/explanation** — "Score: 14.3", "Drift: 0.42" — what do these numbers mean? No tooltips, no scale reference, no "good vs bad" framing. | Critical |
| A2 | **Too many metrics visible at once** — AnalysisSidePanel + DiagnosticsPanel present ~20 distinct numbers simultaneously. Information overload. | High |
| A3 | **Cost breakdown labels are jargon** — "Bounce", "Drift", "Crossover" mean nothing to a musician without explanation. | High |
| A4 | **MetricBar max is hardcoded to 2** — if actual values exceed 2, bars clip at 100%. No indication that the real value is much higher. | Medium |
| A5 | **Finger usage stats are raw counts** — "L-index: 47" doesn't communicate whether that's good or bad. Needs relative comparison. | Medium |
| A6 | **DifficultyHeatmap dominant factors only appear on hover** (`hidden group-hover:flex`) — key diagnostic information is invisible by default. | Medium |
| A7 | **No "what should I do about this?" guidance** — metrics describe problems but don't suggest solutions. | High |
| A8 | **Binding constraints are plain text strings** — e.g. "Maximum span exceeded between pads (2,1) and (5,7)" — would be more useful if they highlighted the relevant pads on the grid. | Medium |

### 5. Practice and Improvement Workflow

**Current State:** The Loop Editor tab provides a step sequencer for manual pattern creation with rudiment analysis and event stepping. However, there is **no practice workflow for imported MIDI patterns** in the Editor tab.

**Issues:**

| # | Issue | Severity |
|---|-------|----------|
| P1 | **No way to isolate difficult passages** — the DifficultyHeatmap shows which passages are hard, but clicking them does nothing. Cannot filter the timeline to just that passage. | Critical |
| P2 | **No loop/repeat region** — cannot define a section of the timeline to focus on. | High |
| P3 | **No tempo adjustment** — cannot slow down a pattern to practice at reduced speed. | High |
| P4 | **No "why is this hard?" drill-down** — when a passage scores poorly, the dominant factors are hidden behind hover and not actionable. | High |
| P5 | **No alternate fingering suggestions** — the system generates 3 full candidates but cannot suggest "try using your middle finger here instead of index". | Medium |
| P6 | **Loop Editor and Editor tabs are disconnected** — patterns created in Loop Editor must be "committed" to the project, but there's no way to extract a section from an imported MIDI into the Loop Editor for isolated practice. | Medium |

### 6. Navigation and Information Hierarchy

**Current State:** Three-tab layout (Lanes / Loop Editor / Editor) with the Editor tab containing a toolbar, grid, voice palette, analysis panel, diagnostics panel, event detail panel, and timeline panel.

**What Works:**
- Tab switcher is clear and well-positioned
- Library button for navigation back to home
- Project name visible in both the top bar and toolbar
- Panels are logically grouped (grid left, analysis right, timeline bottom)

**Issues:**

| # | Issue | Severity |
|---|-------|----------|
| N1 | **Tab purpose unclear** — "Lanes" vs "Loop Editor" vs "Editor" doesn't communicate what each does. First-time users have no guidance. | High |
| N2 | **No onboarding flow** — new users see an empty library page with no guidance on what to do first. | High |
| N3 | **Dual project name display** — name appears in the top bar AND in EditorToolbar, wasting space. | Low |
| N4 | **Side panel scroll behavior** — when VoicePalette + AnalysisSidePanel + DiagnosticsPanel exceed viewport height, there's no scroll container; the entire page scrolls. | High |
| N5 | **Event detail panel appears between grid and timeline** — this interrupts the spatial relationship between the grid (top) and timeline (bottom). | Medium |
| N6 | **No breadcrumb or workflow indicator** — user doesn't know "what should I do next?" at any point. | Medium |
| N7 | **Context menu can go off-screen** — `PadContextMenu` positions at `(e.clientX, e.clientY)` with no viewport bounds checking. With 10 finger options, the menu is ~350px tall. | High |
| N8 | **Layout selector only visible when >1 layout exists** — discovery problem: users don't know they can create multiple layouts. | Low |

### 7. Performance and Responsiveness

**Current State:** Analysis runs via `useAutoAnalysis` with a 1-second debounce. Full generation is triggered manually. `isProcessing` flag drives UI indicators.

**What Works:**
- Processing state disables the Generate button and shows "Analyzing..." text
- Debounced auto-analysis prevents excessive re-computation
- Stale analysis indicator ("Layout changed — analysis outdated") is helpful

**Issues:**

| # | Issue | Severity |
|---|-------|----------|
| R1 | **No progress indicator for full generation** — "Analyzing..." text pulses but gives no indication of how long it will take or how far along it is. For complex patterns, this could take several seconds. | High |
| R2 | **No cancel mechanism** — once generation starts, there's no way to cancel it. `abortRef` exists in auto-analysis but not in `generateFull`. | Medium |
| R3 | **SET_PROCESSING not cleared on error** — in `useAutoAnalysis.generateFull`, the catch block dispatches SET_ERROR but does not dispatch `SET_PROCESSING: false`, potentially leaving the UI in a stuck "processing" state. | Critical |
| R4 | **useAutoAnalysis effect dependency array is very broad** — includes `state.soundStreams`, `state.layouts`, etc. Any change to these (including non-relevant properties) triggers re-evaluation of the effect. | Medium |
| R5 | **No Web Worker offloading** — solver runs on the main thread, potentially blocking UI during beam search on large patterns. | Medium |

---

## Part 3 — Must-Have Fixes Before Release

### Critical

| # | Issue | Description | Why It Harms Usability | Recommended Fix |
|---|-------|-------------|----------------------|-----------------|
| C1 | **SET_PROCESSING stuck on error** (R3) | `generateFull()` catch block doesn't reset `isProcessing`, leaving the Generate button permanently disabled after any error. | User cannot retry analysis after an error without refreshing the page. | Add `dispatch({ type: 'SET_PROCESSING', payload: false })` in the catch block of `generateFull()`. |
| C2 | **No movement visualization** (M1, M2) | The core product promise — understanding *how* to play a pattern — has no visual representation. | Users cannot see finger movement paths, making the tool an abstract score generator rather than a performance aid. | Implement transition arrows on the grid when stepping through events. Show previous pad (dimmed), current pad (highlighted), and next pad (indicated). |
| C3 | **Metrics lack context** (A1) | Numeric scores have no reference scale, tooltips, or "good/bad" framing. | Users see "Score: 14.3" and have no idea if that's excellent or terrible. | Add descriptive labels (Easy/Moderate/Hard/Extreme), reference ranges, and tooltips explaining each metric. |
| C4 | **No passage drill-down** (P1) | DifficultyHeatmap passages are display-only. | Users see which passages are hard but cannot act on that information. | Make passage bars clickable: clicking scrolls the timeline to that passage and filters events. |
| C5 | **Timeline has no zoom** (T1) | Fixed-width percentage layout means dense patterns are unreadable. | Real-world MIDI files with 100+ events become an illegible mass of overlapping pills. | Add horizontal zoom (mouse wheel or slider) and scrolling to the ExecutionTimeline. |

### High

| # | Issue | Description | Why It Harms Usability | Recommended Fix |
|---|-------|-------------|----------------------|-----------------|
| H1 | **No beat/bar grid lines** (T2) | Timeline has no rhythmic reference. | Users cannot relate events to musical beats, making the timeline useless for musical analysis. | Add vertical grid lines at beat boundaries (using `tempo` to compute positions). |
| H2 | **Event overlap** (T3) | Same-time events stack with no offset. | Simultaneous events (chords, simultaneous hits) are visually merged. | Implement vertical stacking or offset for simultaneous events within a lane. |
| H3 | **No onboarding** (N2) | Empty library shows import zone and demos with no explanation. | New users don't know what PushFlow does or how to start. | Add a brief welcome text or guided tour showing: Import → Assign → Generate → Analyze flow. |
| H4 | **Context menu off-screen** (N7) | Menu positioned at click coordinates without bounds checking. | Right-clicking pads near bottom or right edge sends the menu off-screen. | Clamp menu position to `window.innerWidth - menuWidth` and `window.innerHeight - menuHeight`. |
| H5 | **Side panel overflow** (N4) | Multiple panels stack vertically with no scroll container. | On smaller screens, diagnostics and analysis data is cut off below the fold. | Add `overflow-y-auto max-h-[calc(100vh-200px)]` to the right side panel container. |
| H6 | **No progress indication for generation** (R1) | Only "Analyzing..." pulse text during potentially long operations. | Users think the app has frozen during complex analysis. | Add a progress bar or step counter ("Evaluating candidate 2 of 3..."). |
| H7 | **Metric jargon** (A3) | "Bounce", "Drift", "Crossover" are unexplained. | Musicians don't know what these cost components mean. | Add tooltips: "Drift = how far your hand moves from its resting position", etc. |
| H8 | **Tab naming** (N1) | "Lanes" / "Loop Editor" / "Editor" are implementation-centric names. | Users don't know which tab to use for their task. | Rename to "Import & Organize" / "Create Patterns" / "Layout & Analysis" or similar task-oriented names. |
| H9 | **Pad remove button opacity bug** (G4) | `style={{ opacity: undefined }}` overrides the `opacity-0` className, making the remove button always visible. | Small red "x" clutters every assigned pad. | Remove the inline style attribute; let the CSS classes handle visibility. |
| H10 | **No "what to do about it" guidance** (A7) | Metrics describe problems but don't suggest fixes. | Users see "Stretch: 1.8" but don't know whether to move a pad, change hand assignment, or accept the cost. | Add contextual suggestions: "Consider moving [Sound] closer to [Hand zone]" based on dominant cost factors. |

### Medium

| # | Issue | Description | Why It Harms Usability | Recommended Fix |
|---|-------|-------------|----------------------|-----------------|
| M-1 | **No loop region** (P2) | Cannot select a section of the timeline for focused work. | Users must mentally track which events belong to a passage. | Add loop region markers (drag-to-select on timeline ruler). |
| M-2 | **No tempo adjustment** (P3) | Fixed tempo from MIDI import. | Cannot slow down for practice. | Add tempo slider or "half speed" / "quarter speed" buttons. |
| M-3 | **Dominant factors hidden** (A6) | Passage difficulty factors only visible on hover. | Key diagnostic info requires deliberate mouse exploration. | Show top 1-2 factors inline next to each passage bar. |
| M-4 | **MetricBar clipping** (A4) | Hardcoded max of 2 clips high values. | Values above 2 all look the same, obscuring severity differences. | Use dynamic max based on actual data range. |
| M-5 | **No cancel for generation** (R2) | Cannot stop a long-running generation. | User must wait for completion even if they realized they want to change something first. | Add AbortController-style cancellation to `generateFull()`. |

---

## Part 4 — UX Enhancements

### High Impact

| # | Enhancement | User Benefit | Suggested Implementation |
|---|-------------|-------------|--------------------------|
| E1 | **Animated event stepping on grid** | Users see exactly how each finger moves between pads in real time. | When stepping through events (arrow keys or stepper), animate a colored dot from previous pad to current pad. Show "ghost" positions for previous 2-3 events with decreasing opacity. |
| E2 | **Difficulty heatmap overlay on grid** | Spatial understanding of which pads are hardest to reach. | Add toggle in toolbar: "Show difficulty". When active, each pad's background reflects its average difficulty score (green→red gradient). |
| E3 | **Zoomable, scrollable timeline with beat grid** | Musical context for event timing. | Rewrite ExecutionTimeline to use a canvas or virtualized container with configurable px-per-beat zoom. Add beat/bar grid lines. |
| E4 | **"Explain This" button on difficult passages** | Actionable understanding of why something is hard. | When passage is clicked in DifficultyHeatmap, show a panel explaining: "This passage is hard because [top factor]. Try [suggestion]." |
| E5 | **Guided first-run experience** | New users understand the workflow immediately. | Show a 4-step overlay on first visit: (1) Import MIDI, (2) Assign pads, (3) Generate analysis, (4) Compare & refine. |

### Medium Impact

| # | Enhancement | User Benefit | Suggested Implementation |
|---|-------------|-------------|--------------------------|
| E6 | **Hand centroid markers on grid** | Visualize where each hand "lives" and how much it wanders. | Draw a small circle (blue L, purple R) at the computed centroid position. Update as events step through. |
| E7 | **Stretch radius visualization** | See finger reach limits spatially. | When a pad is selected, draw a semi-transparent circle showing max comfortable reach from current hand position. |
| E8 | **Quick-assign "auto-layout" button** | One-click from empty grid to analyzed result. | Merge auto-layout + generate into a single "Auto-Analyze" button that does both steps. (Partially exists in generateFull but requires clicking Generate explicitly.) |
| E9 | **Keyboard shortcuts help overlay** | Discoverability of shortcuts. | Add "?" shortcut to show a modal listing all keyboard shortcuts (Ctrl+Z, arrows, Delete, Escape). |
| E10 | **Export as Push 3 User Mode** | Direct utility — take the layout to the actual hardware. | Export the pad-to-MIDI-note mapping in a format Push 3 can load as a User Mode. |
| E11 | **Side-by-side grid diff animation** | Understand differences between candidates kinetically. | In compare mode, animate the pads that differ — flash or slide to show what moved. |
| E12 | **Pin/unpin diagnostics panel** | Reduce information overload when not needed. | Make DiagnosticsPanel collapsible (like TimelinePanel), defaulting to collapsed. |

### Lower Impact but Nice-to-Have

| # | Enhancement | User Benefit | Suggested Implementation |
|---|-------------|-------------|--------------------------|
| E13 | **Dark/light theme toggle** | Accessibility and personal preference. | Add theme toggle in library page header. Currently hardcoded dark theme. |
| E14 | **Responsive / tablet support** | Use on iPad or smaller screens. | Add responsive breakpoints; stack grid above side panel on narrow viewports. |
| E15 | **Audio preview** (via Web Audio API) | Hear the pattern while analyzing it. | Synthesize simple tones for each MIDI note. Play on timeline scrub or event step. |
| E16 | **Undo history panel** | See what was undone/redone. | Add dropdown showing last 10 actions for orientation. |

---

## Part 5 — QA Verification Checklist

### MIDI Import and Parsing

| # | Test Step | Expected Result |
|---|-----------|-----------------|
| I1 | Drop a standard .mid file on the library page upload zone | File is parsed; "Name Your Sounds" screen appears |
| I2 | Verify each unique MIDI pitch creates a separate sound stream | Stream count matches unique pitch count in file |
| I3 | Click "Apply GM Drum Names" | Streams with standard GM drum notes get preset names (Kick, Snare, etc.) |
| I4 | Rename a sound stream | Name updates immediately in the list |
| I5 | Click "Create Project" | Navigates to editor page; project appears in library on return |
| I6 | Import a .mid file with 0 notes | Error message displayed; no project created |
| I7 | Import a .mid file with >64 unique pitches | Graceful handling; pitches beyond grid are noted |
| I8 | Import a non-MIDI file (e.g., .mp3) | Error message; no crash |
| I9 | Import project JSON via "Import Project JSON" button | Project loads and navigates to editor |
| I10 | Drop file while already on naming screen | New import replaces pending import |

### Timeline Interaction

| # | Test Step | Expected Result |
|---|-----------|-----------------|
| TL1 | Expand timeline panel | Timeline shows swim lanes for each active voice |
| TL2 | Click an event pill in the timeline | EventDetailPanel appears below grid; grid highlights corresponding pad |
| TL3 | Press Right Arrow key | Selects next event in time; both grid and timeline update highlight |
| TL4 | Press Left Arrow key | Selects previous event in time |
| TL5 | Press Escape | Event deselected; EventDetailPanel disappears |
| TL6 | Mute a sound stream in VoicePalette | That voice's lane disappears from timeline |
| TL7 | Collapse timeline panel | Panel collapses; header shows event count |
| TL8 | Re-expand timeline | Previous state preserved (selected event, etc.) |
| TL9 | Verify legend shows correct counts | Left/Right/Unplayable counts match actual assignments |

### Push Grid Visualization

| # | Test Step | Expected Result |
|---|-----------|-----------------|
| PG1 | Drag a sound from VoicePalette to an empty pad | Pad shows sound name, color tint applied |
| PG2 | Drag from one assigned pad to another assigned pad | Pads swap their voices |
| PG3 | Drag from VoicePalette to an already-assigned pad | Pad reassigned to new sound |
| PG4 | Right-click a pad | Context menu appears at click position with correct pad info |
| PG5 | Right-click a pad near bottom-right of screen | Context menu should not go off-screen (currently fails — see H4) |
| PG6 | Select "Remove from pad" in context menu | Voice removed; pad returns to empty state |
| PG7 | Set a finger constraint via context menu | Constraint badge appears on pad; analysis re-runs |
| PG8 | Click an assigned pad | Corresponding event selected in timeline (if analysis exists) |
| PG9 | Verify row 0 is at bottom, row 7 at top | Grid matches Push 3 physical orientation |
| PG10 | Verify columns 0-3 labeled "Left Hand", 4-7 "Right Hand" | Zone labels visible below grid |
| PG11 | Verify "X pads assigned / Y active sounds" counter | Numbers match actual state |
| PG12 | Verify stale analysis indicator | Changing a pad assignment shows "Layout changed — analysis outdated" |

### Difficulty Metrics

| # | Test Step | Expected Result |
|---|-----------|-----------------|
| DM1 | Click "Generate" with sounds assigned to pads | Analysis completes; DifficultyHeatmap, score stats, finger usage appear |
| DM2 | Verify overall difficulty bar | Bar width and color match the overallScore value |
| DM3 | Verify passage bars | Each detected passage has a bar with correct color and percentage |
| DM4 | Hover over a passage bar | Dominant factors appear below the bar |
| DM5 | Verify DiagnosticsPanel hand balance | Blue/purple bar proportions match left/right assignment counts |
| DM6 | Verify "Hard Events" count highlights in amber when > 0 | Warning styling applied |
| DM7 | Verify "Unplayable" count highlights in amber when > 0 | Warning styling applied |
| DM8 | Verify fatigue bars in DiagnosticsPanel | Top 6 fatigued fingers shown with colored bars (green < 0.5, orange 0.5-1.0, red > 1.0) |
| DM9 | Change a pad assignment | "Analysis outdated" indicator appears; auto-analysis re-runs after 1s debounce |
| DM10 | Set a finger constraint, then verify analysis respects it | Re-analysis shows the constrained finger for all events on that pad |

### Candidate Generation and Comparison

| # | Test Step | Expected Result |
|---|-----------|-----------------|
| CG1 | Click "Generate" | 3 candidates generated; candidate buttons appear (#1, #2, #3 with scores) |
| CG2 | Click a different candidate button | Grid updates to show that candidate's layout; analysis panel updates |
| CG3 | Switch to "Compare" tab | Compare UI appears with candidate selector |
| CG4 | Select a comparison candidate | Side-by-side grids appear; diff pads highlighted; tradeoff bars shown |
| CG5 | Verify diff summary | "X pads differ" count matches visual differences |
| CG6 | Verify tradeoff comparison bars | Each dimension (Playability, Compactness, etc.) shows correct relative values |
| CG7 | Click "Generate" again | Previous candidates replaced with new set |

### Movement Visualization

| # | Test Step | Expected Result |
|---|-----------|-----------------|
| MV1 | Select an event via timeline or arrow keys | Grid highlights the pad for that event with yellow ring |
| MV2 | Step to next event | Highlight moves to the next pad |
| MV3 | Verify EventDetailPanel shows movement/stretch/drift costs | Cost breakdown values displayed for selected event |
| MV4 | Verify hand and finger labels in EventDetailPanel | Correct hand (left/right) and finger (thumb/index/etc.) shown |

*Note: Movement paths/arrows do not currently exist — see M1/M2 in audit.*

### Edge Cases

| # | Test Step | Expected Result |
|---|-----------|-----------------|
| EC1 | Import MIDI with single note (one pitch, one event) | Creates 1 stream; analysis shows trivial difficulty |
| EC2 | Import MIDI with 64 unique pitches | All 64 sounds created; grid fully populated on auto-assign |
| EC3 | Import MIDI with very dense pattern (>10 events/second) | Timeline renders without crashing; events may overlap but page remains responsive |
| EC4 | Import MIDI at 300 BPM | Correct tempo stored; analysis handles fast tempo |
| EC5 | Create project, close browser, reopen | Project persists in localStorage; reopens correctly |
| EC6 | Export project as JSON, delete it, re-import | Project restores correctly from JSON file |
| EC7 | Undo all actions until empty | Undo stops when nothing left; no errors |
| EC8 | Rapidly click "Generate" multiple times | Only one analysis runs; button is disabled during processing |
| EC9 | Assign same sound to multiple pads | Allowed; analysis handles multi-pad voices |
| EC10 | Generate analysis, then mute a sound, verify auto-re-analysis | Analysis re-runs with muted sound excluded; its lane disappears from timeline |

### Project Library

| # | Test Step | Expected Result |
|---|-----------|-----------------|
| PL1 | Open a demo project | Creates a copy; navigates to editor with demo data loaded |
| PL2 | Expand/collapse demo categories | Group toggles correctly; counts shown |
| PL3 | Open a saved project | Navigates to editor with project data |
| PL4 | Remove a project from history | Project disappears from list |
| PL5 | "Clear All" projects | All projects removed from list |
| PL6 | Verify difficulty badges on saved projects | Easy/Moderate/Hard/Extreme shown with correct colors |
| PL7 | Click "← Library" from editor | Saves project; returns to library page |

---

## Part 6 — UX Summary

### Is the Current UI Fundamentally Sound?

**Yes, with significant gaps.** The core architecture is well-structured:
- The three-panel layout (grid + analysis + timeline) is appropriate for the domain
- The state management is clean (reducer + context + undo/redo)
- The data model correctly couples layout and execution as the CLAUDE.md demands
- Candidate comparison is a genuinely useful feature

However, the UI currently functions more as a **developer dashboard** than a **musician's performance tool**. It generates analysis scores but doesn't help the user *understand* or *act on* those scores.

### Biggest Usability Risks

1. **No movement visualization** — The product's core value proposition is invisible. Users get numbers describing difficulty but never see *how* fingers should move. This is the single biggest gap.

2. **Information overload without interpretation** — 20+ simultaneous metrics with no scale, no explanation, and no suggestions. Users drown in numbers they can't act on.

3. **No practice workflow** — The product analyzes problems but provides no tools to work on them (loop regions, tempo changes, passage isolation).

### Top 3 Changes That Would Most Improve the Product

1. **Add transition arrows and animated event stepping on the grid** — When a user steps through events (arrow keys), show an arrow from the previous pad to the current pad, colored by hand. Show a dimmed "ghost" for the previous position. This single feature transforms the product from "score generator" to "performance coach."

2. **Add metric explanations and actionable suggestions** — Every metric should have a tooltip explaining what it means in plain language. Difficult passages should link to specific pads and suggest concrete actions ("Move Snare to pad [3,2] to reduce left-hand stretch"). The DifficultyHeatmap passage bars should be clickable to focus the timeline.

3. **Add timeline zoom with beat grid and passage markers** — The timeline needs horizontal zoom/scroll, beat/bar grid lines, and visual passage region markers. This contextualizes events in musical time and connects the timeline to the difficulty analysis.

---

*This audit covers all UI surfaces in the application as of 2026-03-13. File-level references are included for traceability. Implementation recommendations are ordered by impact-to-effort ratio.*
