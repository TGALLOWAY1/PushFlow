# PushFlow Optimization Assessment

**Date:** 2026-04-11
**Scope:** Critical assessment of the current PushFlow optimization pipeline and a concrete proposal for getting substantially better results.
**Author's stance:** Blunt, honest, and opinionated. Willing to recommend replacing major parts of the current system if warranted.

---

## 1. Executive Summary

### Blunt assessment

**The current PushFlow optimizer is solving the wrong problem well.**

The physical/biomechanical layer is good — feasibility tiers, finger span constraints, speed limits, Fitts's-law transition costs, and the beam/annealing sandwich are all reasonable. The codebase is clean, the cost terms are mostly principled, and the search structure (annealing over layouts, beam search over fingerings) is a sensible decomposition of a genuinely hard coupled problem.

But the optimizer has **almost no musical knowledge**, and that is the root cause of the "technically valid but humanly awful" outputs. The pipeline does rich structure analysis — sections, roles, motifs, co-occurrence, transition graphs — and then **throws all of it away** before the solver runs. The beam solver and annealing solver literally do not import `PerformanceStructure`. The cost function has no concept of sound family, musical role, motif consistency, or spatial ordering. It measures hand comfort and physical effort, nothing more.

This is a **representation failure compounded by an objective failure**. Search is fine. The solver is trying its best to optimize an impoverished objective over an impoverished representation, and the result is layouts that are ergonomically plausible but musically incoherent — hi-hats scattered across the grid, kicks next to leads, repeated motifs getting different fingerings each cycle, and no sense of "where does this sound belong."

A carefully designed rule-based baseline — cluster by sound family, preserve spatial ordering, pin backbone voices to strong pads, enforce motif consistency — would **probably outperform the current optimizer today** on almost every realistic pattern. That is the strongest indictment I can give of the current cost model.

### Main reasons outputs are disappointing

1. **Orphaned structure analysis.** Roles, motifs, co-occurrence, transitions, and sections are extracted by `performanceAnalyzer.ts` and then consumed only by post-hoc difficulty analysis — never by the optimizer itself. The solver sees a flat list of `(noteNumber, startTime)` tuples.
2. **No grouping logic.** Nothing in the cost model rewards putting related sounds near each other. Nothing rewards consistent mapping of the same motif. Nothing penalizes scattering the same sound family across distant pads.
3. **No spatial ordering prior.** The cost function does not care whether low pitches are on the left or right, whether the layout is monotonic, or whether the 2D shape is compact and readable.
4. **Diagnostic-only signals that should be active.** The irrational-assignment detector (`irrationalDetector.ts`) can flag pinky misuse, thumb abuse, same-finger streaks, and unnecessary cross-hand — but runs only after optimization. The fatigue model is computed and displayed but never penalized. These are exactly the signals a human would use to reject a layout, and the optimizer cannot see them.
5. **Weak evaluation.** The golden test suite checks for crashes and gross violations, not for humanly sensible outputs. There is no benchmark that can distinguish a mediocre layout from a good one, so weight changes are judged by vibes.
6. **Opaque decisions.** The annealing trace, acceptance rates, neighborhood structure, and rationale for a specific placement are all invisible to the user. When a bad layout comes out, there is no way to ask "why this one?"

### Tune, restructure, or replace?

**Restructure.** The physical layer deserves to survive. The search architecture is defensible. But the cost model and the optimizer/representation interface need a significant rebuild, and the evaluation infrastructure needs to exist before any further tuning is trustworthy.

Specifically:
- **Keep:** `feasibility.ts`, `biomechanicalModel.ts`, `handPose.ts`, `beamSolver.ts` skeleton, `annealingSolver.ts` skeleton, `mutationService.ts`, structure analysis modules.
- **Redesign:** the cost function (new terms for grouping, ordering, motif consistency, role placement), the optimizer-to-structure interface (pass `PerformanceStructure` into the solver), the candidate generation (seed from role-based rules, not just Pose0), and the evaluation layer (benchmark + introspection).
- **Replace:** the "flat event list" representation inside the solver; candidate ranking that treats compactness and learnability as vague tradeoff axes rather than first-class objectives.

### Top 3 highest-leverage changes

1. **Build a rule-based heuristic baseline and benchmark against it.** Before touching the optimizer, produce a handcrafted set of ~20 canonical patterns with reference layouts, and a simple rule-based generator that clusters by role, orders by pitch, and pins backbone voices. If this baseline beats the current optimizer — and it almost certainly will on most cases — that is the ground truth the optimizer must surpass. Without this baseline you cannot tell whether any change is an improvement.

2. **Wire structure analysis into the cost function.** Pass `PerformanceStructure` through the solver interface. Add four cost terms with real weight: (a) co-occurrence proximity (simultaneous voices should be near), (b) family/role grouping (same-family voices cluster), (c) motif consistency (same motif → same finger pattern across repetitions), (d) spatial monotonicity (pitch/role roughly monotonic over grid). These are the terms that encode "human sensibility" and their absence is why outputs feel wrong.

3. **Turn the irrational-assignment detector and fatigue model into active costs.** Both already exist. Both capture real human quality signals. Neither affects the solver. Move them into the beam score (with sensible weights) and add regression tests asserting that the golden scenarios produce zero irrational assignments.

Everything else — improved search, deep mode, learning-based scoring, human-in-the-loop — is downstream of having (1) a benchmark to measure against and (2) a cost function that captures what humans actually value.

---

## 2. Current System Overview

### 2.1 Pipeline shape

The optimization pipeline is a nested two-level search driven by a multi-candidate generator:

```
MIDI import
  → Performance (flat events)
  → PerformanceStructure    (computed, mostly unused downstream)
  → seedFromPose / compact seeding
  → multiCandidateGenerator
      → 3 strategies: baseline, compact-right, compact-left
      → for each strategy:
          annealingSolver (outer layout search)
            → mutation → BeamSolver (inner fingering search) → cost → accept/reject
          → final high-width beam search on best layout
      → analyzeDifficulty + computeTradeoffProfile
  → candidateRanker (composite score + Pareto filter)
  → CandidateSolution[]
```

### 2.2 Decision variables

There are exactly two:

| Variable | Shape | Owner |
|---|---|---|
| **Layout** | `padToVoice: Record<padKey, Voice>` on an 8×8 grid | `annealingSolver` mutates it |
| **Execution plan** | Per-event `FingerAssignment { hand, finger, grip }` | `beamSolver` chooses it, given a layout |

`fingerConstraints` on the layout can pin specific pads to specific (hand, finger) pairs and are treated as hard constraints by the beam solver. These are user-editable but rarely set.

### 2.3 Constraints

**Hard constraints (cause grip rejection or `Infinity` cost):**

- Per-finger-pair span limits (strict tier), e.g. pinky-ring ≤ 1.5, index-middle ≤ 2.0, thumb-pinky ≤ 5.5 grid units — `biomechanicalModel.ts:96-107`
- Finger ordering / topology (left hand L→R: pinky ≤ ring ≤ middle ≤ index; right hand mirrored) — `feasibility.ts`
- Thumb delta (thumb can only sit ≤1.0 unit vertical offset from index, strict tier) — `biomechanicalModel.ts:133`
- Max hand speed 12.0 grid units/sec — exceeding this returns `Infinity` in `calculateTransitionCost` — `costFunction.ts:229-240`
- Max 5 simultaneous pads per hand — `feasibility.ts:456`
- Layout must cover all required notes; `evaluateLayoutCost` returns `Infinity` otherwise — `annealingSolver.ts:96-98`

**Soft constraints (penalties, not rejections):**

- Tier 2 relaxed grips: +200 penalty — `biomechanicalModel.ts:192`
- Tier 3 fallback grips: +1000 penalty — `biomechanicalModel.ts:195`
- Finger dominance cost: ring +1.0, pinky +3.0, thumb +5.0 — `biomechanicalModel.ts:173-179`

### 2.4 Objective structure

The beam score per step is:

```
stepCost = poseNaturalness
         + transitionDifficulty
         + constraintPenalty
         + alternationCost     × ALTERNATION_BEAM_WEIGHT   (0.8)
         + handBalanceCost     × HAND_BALANCE_BEAM_WEIGHT  (0.3)
         − lookaheadBonus      (≤ 20% of stepCost)
```

Where:

- `poseNaturalness = 0.4 × attractorCost + 0.4 × perFingerHomeCost + 0.2 × dominanceCost` — `costFunction.ts:79-103`
- `transitionDifficulty = distance + speed × 0.5` (Fitts-style), `Infinity` over 12 u/s — `costFunction.ts:229-240`
- `constraintPenalty ∈ {0, 200, 1000}` — tier penalty from grip generation
- `alternationCost`: penalizes reusing the same (hand, finger) within 0.25s window, base penalty 1.5 — `costFunction.ts:114-129`
- `handBalanceCost`: quadratic penalty around 45% left-hand share, weight 2.0 — `costFunction.ts:140-149`
- `lookaheadBonus`: 1-step reward for ending near the next group's centroid — `beamSolver.ts:182-196`

The layout-level objective is the accumulated beam cost, treated as a scalar by annealing. At candidate-ranking time, a separate composite score combines six tradeoff dimensions:

```
compositeScore = 0.30 × playability
               + 0.15 × compactness
               + 0.10 × handBalance
               + 0.20 × transitionEfficiency
               + 0.15 × learnability
               + 0.10 × robustness
```
(`candidateRanker.ts:30-43`)

These tradeoff dimensions are all derived from the beam output after the fact; they do not feed back into search.

### 2.5 Are layout and execution solved jointly or separately?

**Nested, not truly joint.** The outer loop (annealing) mutates the layout. The inner loop (beam) chooses fingerings for that fixed layout and returns a scalar cost. Annealing uses that cost as the layout's fitness. So layout is optimized *with respect to the execution plan it induces*, but the two variables are never co-varied in a single move. A good layout swap that requires changing the fingering pattern on a distant passage is implicitly handled (because beam re-plans from scratch), but there is no single move operator that edits both simultaneously.

This is a defensible decomposition. It gets the coupled structure the spec demands (evaluation is temporal, through the beam) while keeping each layer tractable.

### 2.6 Search strategy

**Layout level:** classical simulated annealing.
- Initial temp 500, cooling 0.997 (fast) / 0.9985 (deep)
- 3000 iterations (fast) / 8000 iterations × 3 restarts (deep)
- Metropolis acceptance: `exp(−Δ/T)`
- Mutations: 35% swap, 35% move, 15% cluster swap, 15% row/col shift; deep mode adds zone transfer
- No population, no tabu, no memetic refinement
- `annealingSolver.ts`, `mutationService.ts`

**Execution level:** beam search.
- Beam width 12 (fast SA eval) / 16 (deep SA eval) / 50 (final high-quality eval)
- Groups simultaneous events (1ms epsilon), generates valid grips per hand, also tries split-hand assignment for chords, prunes to top-K by accumulated cost
- 1-step lookahead bonus only (no multi-step)
- `beamSolver.ts`

**Candidate level:** three seeded strategies (baseline, compact-right, compact-left), independently annealed, then Pareto-filtered.

### 2.7 Where the main assumptions are encoded

| Assumption | Location |
|---|---|
| Physical constants (spans, speed, dominance) | `biomechanicalModel.ts` — single source of truth, well-organized |
| Natural hand pose | `naturalHandPose.ts:96-107` (Pose0 cells) |
| Cost weightings between the 3 primary terms | `combinePerformabilityComponents` — equal sum, no weights |
| Alternation & hand-balance weights | **Hardcoded in `beamSolver.ts:63-77`**, not in biomechanicalModel, not configurable |
| Ranking weights | `candidateRanker.ts:17-24` — hardcoded composite weights |
| Seed strategies | `multiCandidateGenerator.ts` and `seedFromPose.ts` |
| Feasibility tiers | `feasibility.ts` — Tier 1/2/3 generation logic |

### 2.8 Where implementation and intended design diverge

1. **Structure analysis is orphaned.** `PerformanceStructure` is built on every analysis pass but neither `BeamSolver` nor `AnnealingSolver` imports it. The beam solver *re-discovers* simultaneity internally via its own `groupEventsByTimestamp`, completely bypassing the structural grouping already computed. Sections are passed to *post-hoc* difficulty analysis but not to the optimizer.

2. **Fatigue model is unused.** `diagnostics/fatigueModel.ts` defines accumulation rate, decay, max fatigue — and the file's own header comment admits it is diagnostic-only, not used in the primary beam score. The product spec explicitly lists repetition burden and finger overload as core factors.

3. **Irrational detector is post-hoc.** `debug/irrationalDetector.ts` encodes exactly the rules a human would use to say "that's wrong" — pinky on central pads, thumb on upper rows, 3+ consecutive same-finger at fast tempo, cross-hand zone violations. These never influence the search.

4. **Hardcoded weights that should be configurable.** `ALTERNATION_BEAM_WEIGHT = 0.8` and `HAND_BALANCE_BEAM_WEIGHT = 0.3` are baked into the beam solver and not exported. Tuning them requires code edits.

5. **Annealing was disabled in auto-analysis.** `useAutoAnalysis` still uses beam-only. Only the explicit "Generate" path with a non-`undefined` `optimizationMode` enables annealing. Many users may have been getting unoptimized layouts without knowing.

6. **Candidate persistence vs. layout edits.** Candidates persist to localStorage; manual layout edits invalidate them silently. `repo_map.md` flags this as a known fragile area.

### 2.9 Hidden coupling and inconsistencies

- **`analysisStale` is the only freshness signal.** Any layout edit clears it, but there is no contract that the candidate's execution plan stays consistent with the currently displayed layout.
- **Beam width differs between evaluation contexts.** Fast SA uses width 12, deep SA uses 16, final eval uses 50, auto-analysis uses 15. The *same* layout can be scored differently depending on who called the solver. Acceptance decisions inside SA are made at the noisier width.
- **Diagnostic 7-component model vs. primary 3-component model.** The beam scores on 3 components but computes 7 in parallel for display. The mapping from 3 to 7 is approximate (`performabilityToDifficultyBreakdown` distributes poseNaturalness across legacy fields). Users see one thing; the solver optimizes another.
- **Structure rediscovery.** BeamSolver's internal simultaneity grouping uses `TIME_EPSILON = 0.001s`; the structure module uses the same constant separately. Two sources of truth for the same thing.
- **Tradeoff profile dimensions are derived, not optimized.** `learnability` is `1 − min(uniquePadCount/20, 1)`, which is a proxy for "few pads used" — not actual learnability. Ranking uses this as if it were meaningful.

---

## 3. Failure Analysis

This section goes beyond "weights need tuning." Each failure is named, classified, and grounded in specific code.

### 3.1 Representation failure (primary root cause)

**Symptom:** Layouts look random. Same sound family is scattered. Repeated motifs get different fingerings each cycle. The solver cannot distinguish between "kick next to snare" and "kick next to a melodic lead" because it has no idea either one is a kick.

**Mechanism:**

- `PerformanceEvent` carries only `{ noteNumber, startTime, duration?, velocity?, channel?, eventKey }`. No role, no family, no motif membership.
- `Voice` carries only `{ id, name, sourceType, originalMidiNote, color }`. No sound class, no role, no family.
- `BeamSolver` does not import `PerformanceStructure`. It does not know sections exist. It does not know motifs exist. It does not know any voice is a "backbone" voice.
- `AnnealingSolver` also does not import `PerformanceStructure`. Its mutation operators know nothing about which voices should cluster together.
- `costFunction.ts` has zero reference to role, family, motif, section, or co-occurrence.

**Why this is representation failure and not a weight tuning problem:** no configuration of the existing weights can make the solver place all hi-hats together, because there is no cost term that rewards "all hi-hats together." You cannot tune a term that doesn't exist.

### 3.2 Objective failure

**Symptom:** The solver produces layouts that satisfy the cost function but feel unnatural. Each individual transition looks okay; the whole layout doesn't make sense.

**Mechanism:**

- The beam score operates almost entirely on **local** signals: pose naturalness for the current grip, transition cost for the last move, alternation over a 0.25s window, hand balance over cumulative counts. There is no phrase-level, section-level, or song-level term beyond "sum the locals."
- The 1-step lookahead is the only forward-looking signal, and it is capped at 20% of step cost. It handles the simplest "don't paint yourself into a corner" case and nothing more.
- There is no term for **spatial ordering**. A layout where pitches are scrambled across the grid scores identically to a monotonically ordered one, if both produce the same local transition costs.
- There is no term for **grouping**. Scattering a voice family across non-adjacent pads is not penalized.
- There is no term for **consistency across motif repetitions**. The same 4-note phrase can get 4 different fingerings on 4 repetitions and the cost function is content.

**Why this is objective failure:** the cost function actively fails to express the structure the spec explicitly names (learnability, robustness, expressiveness, phrase-level coherence).

### 3.3 Search failure (mild)

**Symptom:** Annealing gets stuck in local minima; restarts help a little; fast mode plateaus early.

**Mechanism:**

- Single-trajectory SA with no tabu, no population, no memetic refinement. `tasks/deep-optimization-solver-plan.md` already flagged this.
- Mutation operator set is spatially local (swap two pads, shift a row) and cannot natively perform "regroup all hi-hats to column 7" — the kind of move the objective *would* want if it had grouping terms.
- Noise at fast beam width (12-16) during SA can cause spurious accept/reject decisions late in cooling.
- No memory of previously-visited layouts; SA can revisit the same neighborhoods.

**Why this is secondary:** search failure matters only if the objective is worth searching. Today's objective is not, so improving search would just find better optima of a broken function. That said, once the cost model is fixed, the search gaps become real and worth fixing.

### 3.4 Constraint failure

**Symptom:** The constraint tier system works, but the *choice* of what is a hard vs. soft constraint is wrong in places.

**Mechanism:**

- **Too strong:** Max hand speed at 12 u/s returning `Infinity` is a hard physical cutoff, but physically plausible tempos right at the boundary cause abrupt cliffs in the cost landscape. Annealing near that cliff behaves badly. A soft penalty that grows rapidly approaching the cutoff would be kinder to the search.
- **Too weak:** Fatigue is not a constraint or a cost at all, only a diagnostic. A human would reject a layout that pounds one finger; the solver is indifferent.
- **Too weak:** Irrational assignments (pinky misuse, thumb abuse) are not constraints or costs, only post-hoc flags.
- **Inconsistent:** Tier 3 "fallback" grips with +1000 penalty are *so* expensive they are effectively forbidden, but they still enter the beam and can inflate average costs. A pure reject-and-warn would be cleaner.

### 3.5 Evaluation failure

**Symptom:** There is no way to tell if a weight change made things better or worse, so everyone is tuning by vibes.

**Mechanism:**

- Golden tests (`test/golden/goldenScenarios.test.ts`) check bounded invariants: event count matches, avg drift ≤ 6.0, crossover count ≤ 16, total travel under a threshold. These are sanity checks, not quality checks. A layout can pass all 10 golden tests and still be terrible.
- There is no benchmark of "good reference layouts" to compare against.
- There is no human-rating mechanism.
- The composite ranking score uses weights whose derivation is unexplained. A candidate ranked first by the composite could be obviously worse to a human than a candidate ranked third.
- Two optimizer versions cannot be meaningfully A/B tested without running everything through human judgment by hand.

**Why this compounds everything else:** even if the cost model were improved, there is no infrastructure to verify the improvement. Evaluation must come before further optimization work.

### 3.6 Debugging failure

**Symptom:** When a bad layout comes out, the user (and the developer) cannot figure out why.

**Mechanism:**

- The `annealingTrace` array in `ExecutionPlanResult.metadata.solverTelemetry` contains iteration-by-iteration temperature, cost, acceptance probability, restart index, and per-metric sums. **None of this is shown in the UI.**
- The irrational detector exists and runs, but its output is not surfaced in the primary analysis panel — it lives behind a debug surface.
- Per-event cost breakdown is shown in `EventDetailPanel`, but there is no "why was this position chosen over the next best alternative?" view.
- There is no neighborhood explorer ("if I moved voice X to pad Y, what would happen?").
- There is no candidate cost diff that explains which cost terms drove one candidate to rank higher than another.
- Ablation and sensitivity analysis do not exist.

### 3.7 Concrete cases where the optimizer is technically correct but practically useless

1. **Drum groove with 4 voices.** A human places kick low-left, snare low-right, closed hat right-center, open hat slightly above. The optimizer, having no role model, places them wherever the 3-component cost minimizes — typically inside the natural Pose0 anchor pads, but with no semantic ordering. Users see "kick is up top?" and distrust everything.

2. **Repeated 1-bar motif in a 4-bar loop.** A human uses the same fingering each cycle. The optimizer's beam search decides per-event based on local pose cost and can use a different grip for the same 4 notes on each repetition, because alternation is computed over 0.25s windows and nothing enforces cross-cycle consistency.

3. **Fast 16th-note hi-hat line with occasional kick/snare.** A human keeps the hi-hat on a single stable right-hand grip, alternating index/middle, and uses the left hand for kick/snare. The optimizer can freely reassign fingers within the hat line based on local pose cost, producing a visually fine but physically erratic execution plan.

4. **Simple two-note alternation test (golden test 1).** A human puts both notes adjacent and alternates index/middle. The optimizer often does this correctly, but under slightly different weights can produce same-finger solutions because the alternation cost is weight 0.8 × (base 1.5), which is smaller than the per-finger-home differential for some pad pairs.

### 3.8 "Bad local minima that look legal"

The cost landscape has many such minima because the optimizer rewards hand comfort and nothing else. Examples:

- All voices clustered in Pose0's central neutral region, because the attractor spring is the dominant pose term. This is locally cheap but spatially degenerate — no zone separation, no family structure.
- Single-hand solutions on short patterns, because hand balance has weight 0.3 and a tiny deviation² costs almost nothing when total notes are small.
- Thumb-heavy solutions when the thumb delta constraint happens to allow it, because the dominance penalty of 5.0 is a one-time cost per assignment that can be outweighed by locally saving a transition.

### 3.9 Would a simpler heuristic outperform?

**Almost certainly yes**, on realistic patterns, for these reasons:

- A rule-based layout that (a) clusters by role, (b) orders by pitch, (c) pins backbone to strong pads already captures 80% of what a human would do.
- That layout might score slightly worse on the current cost function, but would look dramatically better to a user.
- The fact that a heuristic would win today is the signature of an objective mismatch: the optimizer is not wrong, the objective is wrong.

This is the single most important finding in this assessment. Build the heuristic baseline. Measure. Then decide what to do with the optimizer.

---

## 4. Human-Centered Criteria Missing From the Model

These are the human judgments the current system underrepresents or ignores. For each, I name the criterion, explain why it matters, describe how a human evaluates it, and propose a modeling approach.

### 4.1 Spatial organization (left→right / low→high)

**What a human does:** Places low-pitched or "rhythmic foundation" sounds on the left (or bottom), higher or more melodic sounds on the right (or top). Preserves rough monotonicity so the eye can read the layout.

**Why it matters:** It makes the layout learnable at a glance. A performer can find any sound by semantic position without memorizing pad coordinates.

**Modeling approach:** Soft cost. Compute a monotonicity penalty: sort voices by a chosen ordering key (MIDI note, role priority, or user-tagged rank), measure the Kendall tau distance (or a smoother equivalent) between that order and the voices' column positions. Penalize disorder. Weight moderate — it is a tiebreaker, not a rule.

### 4.2 Sound family grouping

**What a human does:** Clusters all hi-hat variants together, all toms together, all bass sounds together. Separates unrelated families so the eye can parse the layout.

**Why it matters:** Retrieval under performance pressure depends on spatial chunking. You find "hi-hat" by reaching for the hi-hat zone, not by remembering pad coordinates.

**Modeling approach:** Soft cost, and a prior on seed generation. Annotate voices with a family tag (automatic inference from MIDI note in a drum kit, or user-assigned). Compute within-family centroid spread and penalize it. Mirror: reward between-family separation. Weight high — this is probably the single most important missing term.

### 4.3 Role-based placement

**What a human does:** Puts backbone voices (steady kick, hi-hat ostinato) on the most comfortable, high-frequency-accessible pads. Puts accent voices on strong fingers. Puts fill voices wherever fits.

**Why it matters:** The 90% of the performance that is backbone should be effortless. Accents should have the dynamic range of the strongest fingers.

**Modeling approach:** A placement prior weighted by role. Use the existing `roleInference` output (currently orphaned) to weight each voice's "home comfort preference." Backbone voices get high attractor pull toward prime pads (central rows, index/middle fingers). Fills get the leftover pads. This is largely encoded as role-weighted variants of the existing `perFingerHomeCost`.

### 4.4 Motif consistency

**What a human does:** When a 4-note phrase repeats, uses the same fingering each cycle. Builds muscle memory around a chunk.

**Why it matters:** Learnability is directly driven by consistent motor chunks. Inconsistent fingerings force re-thinking every cycle.

**Modeling approach:** Post-solve constraint propagation, or an explicit cost term. The structure analyzer already detects motifs (`performanceAnalyzer.ts:67-109`). For each motif, compute the variance of finger assignments across its occurrences and penalize it. Alternative: run the solver once, identify the most common fingering per motif, then re-run with hard constraints pinning those patterns. Weight high for motifs that repeat many times.

### 4.5 Ergonomic comfort over repeated practice

**What a human does:** Worries about fatigue, stiffness, and strain after an hour of practice — not just one transition.

**Why it matters:** A song that is "playable" for 8 bars but fatiguing for 8 minutes is not really playable.

**Modeling approach:** Make the existing fatigue model active. Integrate `fatigueModel.ts` into the beam score. Penalize per-finger accumulated load across the whole piece, with decay during rests. This is a soft cost that should rank fairly high because it encodes the product priority "robustness." Also extend to the whole song, not just visible chunks.

### 4.6 Symmetry and visual coherence

**What a human does:** Prefers layouts with visible shape — rectangles, diagonals, mirrored patterns. Distrusts scattered placements.

**Why it matters:** Visual memorability. A compact rectangle or a mirrored shape is much easier to memorize than a random set of pads.

**Modeling approach:** Soft cost. Compute a "shape regularity" score: convex hull area / number of pads used; symmetry detection across the grid's vertical midline. Penalize low regularity. Moderate weight.

### 4.7 Natural alternation between hands/fingers

**What a human does:** On fast passages, alternates hands or fingers automatically. Only uses the same finger twice in a row when there's a musical reason.

**Why it matters:** Same-finger repetition at speed is physically painful and musically unstable.

**Modeling approach:** The current alternation cost exists but with a window of 0.25s and a modest weight (0.8 × base 1.5 = 1.2 max). This should be **strengthened** and **extended**. Wider time window, tempo-scaled threshold, stronger penalty. Also: detect and reward natural alternation *patterns* (RLRL on fast runs), not just penalize sameness.

### 4.8 Avoidance of "legal but weird" assignments

**What a human does:** Would never use the pinky for a central pad when the index is free. Would never put the thumb on row 7.

**Why it matters:** These are signature signs of a bad solution to any listener or viewer. They scream "this was optimized by a machine."

**Modeling approach:** Turn `irrationalDetector.ts` into active cost terms. For each rule (pinky misuse, thumb abuse, same-finger streak, cross-hand violation), add a soft penalty with severity-weighted magnitude. This is the single fastest way to eliminate the most visible failure modes.

### 4.9 Chunkability into learnable motor patterns

**What a human does:** Groups 2-4 notes into motor chunks that feel like a single gesture. A drum rudiment. A chord shape. A slide.

**Why it matters:** Human learning works through chunks, not individual events. A layout that fragments natural chunks is hard to learn even if each transition is cheap.

**Modeling approach:** Post-hoc detection + prior. Identify N-note chunks that repeat or co-occur in time, and either (a) score them as a unit or (b) constrain them to the same grip shape. This is adjacent to motif consistency but applies to non-identical chunks that share a shape.

### 4.10 Consistency with drummer / finger-drummer mental models

**What a human does:** Expects certain conventions — kick on left-bottom, snare on right-bottom, hi-hats on right. Finger drummers especially have strong conventions.

**Why it matters:** Users already have mental models. A layout that fights those models has a harder learning curve than one that aligns.

**Modeling approach:** Optional **template library**. Store a small library of canonical drum kit layouts (Push/MPC conventions). When the detected pattern matches a template, bias the seed toward it. This is a prior, not a hard constraint.

### 4.11 Pattern identity and phrase logic preservation

**What a human does:** Preserves the identity of a musical phrase — the "shape" of the pattern maps to a consistent shape on the grid.

**Why it matters:** Phrase identity is what makes a song recognizable to play. Breaking it up destroys the performer's ability to feel the music through the instrument.

**Modeling approach:** Section-aware cost. Pass sections into the solver; compute costs per section and penalize within-section inconsistency. Also use the co-occurrence graph to keep frequently co-occurring voices in the same physical "phrase zone."

### 4.12 Summary table

| Criterion | Priority | Modeling | Current state |
|---|---|---|---|
| Spatial ordering (low→high / L→R) | Important | Soft cost | Absent |
| Sound family grouping | Critical | Soft cost + seed prior | Absent |
| Role-based placement | Critical | Prior (role-weighted home cost) | Role inference exists but unused |
| Motif consistency | Critical | Constraint propagation or cost | Motif detection exists but unused |
| Ergonomic comfort over time | Important | Active fatigue cost | Fatigue model exists but unused |
| Symmetry / visual coherence | Nice to have | Soft cost (shape regularity) | Absent |
| Natural alternation | Important | Strengthen existing cost | Partially present, too weak |
| Avoid legal-but-weird assignments | Critical | Turn irrational detector into cost | Detector exists but post-hoc |
| Chunkability | Important | Chunk-level cost | Absent |
| Drummer conventions | Nice to have | Template library | Absent |
| Phrase identity preservation | Important | Section-aware cost | Sections exist but unused |

**The pattern is unmistakable.** Most of the infrastructure to encode these criteria already exists somewhere in the codebase — structure analysis, role inference, motif detection, fatigue model, irrational detector. It is all orphaned. The optimizer is running on a starvation diet of musical knowledge while rich signals sit on a shelf next to it.

---

## 5. Cost Model Critique

This section audits each active cost term in the beam score and then proposes a restructured cost model.

### 5.1 Audit of current cost terms

#### `poseNaturalness` (sum of attractor + perFingerHome + dominance)

**What it tries to do:** Express "is this a comfortable grip?"

**Alignment with quality:** Reasonable for single-event comfort. Does not capture whether the hand *should* be comfortable at this moment (vs. stretching intentionally for a high-value note).

**Where it is too weak:** Dominance costs are small (ring +1.0, pinky +3.0) compared to transition costs that can run into tens. A grip using a weak finger to save 5 units of transition cost wins, even if a human would reject it.

**Where it is too strong:** The attractor spring with stiffness 0.3 pulls everything toward Pose0. On sparse patterns, this collapses layouts into the center of the grid regardless of musical structure.

**Gameability:** Yes — the solver can exploit Pose0 pull to produce centered layouts that score well but ignore semantic placement.

**Conflicts:** Attractor vs. role-based placement (which wants backbone voices on specific strong pads, not necessarily near Pose0 centroid).

#### `transitionDifficulty` (Fitts-style)

**What it tries to do:** Express "how hard is this movement at this tempo?"

**Alignment with quality:** Good. This is the cleanest term in the cost function. Fitts's law is empirically justified, the speed cap is principled.

**Where it is too strong:** The 12 u/s hard cutoff is a cliff. Speeds approaching the cap get only the mild `+ 0.5 × speed` penalty; at the cap, cost jumps to infinity. The annealing landscape near the cliff is discontinuous, which hurts search.

**Where it is too weak:** Doesn't account for direction (diagonal vs. orthogonal can feel different). Doesn't distinguish which hand is moving. Doesn't account for the fact that moving *toward* the next event is different from moving *away* from it.

**Gameability:** Mild. The cost can be minimized by making the layout very compact, but this conflicts with family grouping (compactness does not imply sensible organization).

#### `constraintPenalty` (0 / 200 / 1000)

**What it tries to do:** Express "this grip violated strict biomechanical constraints."

**Alignment with quality:** Binary rejection rather than penalty would be cleaner. The penalty numbers (200, 1000) are arbitrary — they are chosen to be "large" rather than derived.

**Where it is brittle:** If a passage genuinely requires a relaxed grip, the +200 penalty can stay in the sum forever and skew downstream comparisons. Better: reject Tier 3 outright, use Tier 2 with an explicit flag rather than a cost, and let the ranking layer filter on the flag.

#### `alternationCost` (weight 0.8, base 1.5)

**What it tries to do:** Prevent same-finger rapid repetition on fast passages.

**Alignment with quality:** Right idea, undersized. Maximum per-event penalty is ~1.2 (1.5 × 0.8), which is trivial next to any transition cost. On fast passages where alternation matters most, the optimizer can still choose same-finger because the pose or transition saving is larger.

**Where it is too weak:** Time window is 0.25s hardcoded; should be tempo-adaptive. Does not detect streaks (3+ in a row at moderate tempo) that are human-unacceptable even if each individual transition is within 0.25s. Gaps just over 0.25s reset the penalty to zero.

**Hidden:** The weight is hardcoded in the beam solver, not in `biomechanicalModel.ts`, and not exported.

#### `handBalanceCost` (weight 0.3, coefficient 2.0, target 0.45)

**What it tries to do:** Prevent extreme single-hand dominance.

**Alignment with quality:** Present but too weak in practice. Quadratic penalty around 0.45 is negligible unless the imbalance is extreme. On a 100-note piece split 20/80, the penalty is 0.125 × 0.3 = 0.0375 — rounding error.

**Where it is conceptually wrong:** Enforces a *global* average target. But musical structure often demands specific imbalances in specific sections (a hi-hat passage may legitimately be 10% left / 90% right). A global target punishes correct musical distribution.

**Better model:** Penalize imbalance *per section*, with target derived from the structure of the section, not globally.

#### `lookaheadBonus` (≤ 20% of step cost, range 4.0)

**What it tries to do:** 1-step phrase planning — don't paint yourself into a corner.

**Alignment with quality:** Helpful but shallow. 1-step is not enough on dense passages where the next 3-4 events matter.

**Extension:** Multi-step lookahead (3-5 events) within a section, weighted by distance decay.

### 5.2 Cost terms that are missing entirely

| Term | Purpose |
|---|---|
| **Family grouping** | Cluster same-family voices in adjacent pads |
| **Spatial ordering** | Pitch/role monotonicity across rows or columns |
| **Motif consistency** | Same motif → same finger pattern |
| **Role-weighted home pull** | Backbone voices near prime pads |
| **Active fatigue** | Per-finger accumulated load with decay |
| **Irrational-assignment penalty** | Pinky misuse, thumb abuse, same-finger streaks, cross-hand violations |
| **Compactness shape regularity** | Convex hull / symmetry / clusteredness |
| **Section-aware hand balance** | Per-section balance target |

### 5.3 Proposed cost model structure

A cost model that reflects the product priorities should be **hierarchical**, not a flat sum.

**Tier 1 — Feasibility (hard):**
- Speed limit (replace cliff with steep soft cliff approaching 12 u/s)
- Per-pair span limits (Tier 1 grip tier)
- Topology (finger ordering)
- Simultaneity-on-same-finger
- Full coverage

**Tier 2 — Primary quality (soft, high weight):**
- `poseNaturalness` (keep, tuned)
- `transitionDifficulty` (keep, smoothed near cap)
- **`familyGroupingCost`** (new) — penalize within-family spread
- **`roleHomeCost`** (new) — role-weighted attractor pull
- **`motifConsistencyCost`** (new) — penalize per-motif fingering variance
- **`activeFatigueCost`** (new, from `fatigueModel.ts`) — per-finger accumulated load

**Tier 3 — Secondary quality (soft, lower weight):**
- **`spatialOrderingCost`** (new) — Kendall tau on pitch/role ordering
- **`shapeRegularityCost`** (new) — convex hull / symmetry
- **`irrationalAssignmentCost`** (new, from `irrationalDetector.ts`) — severity-weighted penalties
- `alternationCost` (strengthened, tempo-adaptive)
- Section-scoped hand balance

**Tier 4 — Lookahead (bonus, not penalty):**
- Multi-step phrase lookahead (3-5 events)
- Phrase boundary awareness

**Structural proposal:** evaluate Tier 1 first as a reject. Compute Tiers 2-3 as soft costs. Apply lookahead as a bonus. Rank candidates by a composite that privileges Tier 2 improvements over Tier 3 (lexicographic or strongly weighted).

### 5.4 Costs on what unit?

The current cost model scores **per-event**. Some of the proposed terms need different units:

| Cost | Natural unit |
|---|---|
| `poseNaturalness`, `transitionDifficulty`, `constraintPenalty` | Per event (current) |
| `alternationCost`, `handBalanceCost` (section-scoped) | Per transition / per section |
| `familyGroupingCost`, `spatialOrderingCost`, `shapeRegularityCost`, `roleHomeCost` | Per layout (computed once per SA iteration, not per beam step) |
| `motifConsistencyCost` | Per motif, evaluated at the end of the beam pass |
| `activeFatigueCost` | Per finger, accumulated over the sequence |
| `irrationalAssignmentCost` | Per assignment (like current), but aggregated diagnostics |

Layout-level costs can be computed once per SA iteration and added to the beam-level sum. This is cheap because SA iterations are the expensive unit anyway — adding a small constant per iteration is negligible.

### 5.5 Preference-based and reference-matching scoring

The assessment should not pretend scoring can be perfectly designed from first principles. Humans disagree with the optimizer in ways that are hard to enumerate. Two additional scoring approaches deserve serious consideration:

**Pairwise ranking against a labeled benchmark.** Given the proposed 20-case benchmark with human-reference solutions, score any candidate by how close it comes to the reference — Kendall tau on pad assignments, edit distance on fingerings, grouping similarity. This is a **calibration signal**, not a replacement objective.

**Human preference learning (later phase).** If collecting many labeled preference pairs (A vs. B, human picks) becomes feasible, fit a learned preference model to the existing quantitative features. The model's output becomes an additional cost term. This is premature until the benchmark and baseline exist.

**Reference matching during optimization.** For common pattern templates (drum kits, scale patterns), match incoming MIDI to a template and retrieve a known-good layout as a seed. Treat the optimizer as refinement over the retrieved solution, not generation from scratch.

### 5.6 Multi-stage evaluation

The current system treats evaluation as a single scalar and ranks candidates by composite score. A better approach:

**Stage 1 — Feasibility filter.** Reject any candidate with unplayable events or irrational-assignment count over a threshold.

**Stage 2 — Quality scoring.** Compute Tier 2 quality costs. Top-K by this score advance.

**Stage 3 — Structural audit.** For top-K, compute per-section and per-motif consistency diagnostics. Penalize inconsistency.

**Stage 4 — Human-review gate.** For the top 1-3 candidates, present them to the user side-by-side with explicit explanations.

This multi-stage structure also naturally supports the human-in-the-loop workflows discussed below.

---

## 6. Alternative Optimization Approaches

This section compares distinct optimization strategies. None is obviously best, and the right answer is likely a hybrid.

### A. Improved version of current optimizer

**What it is:** Keep the annealing-over-beam architecture. Fix the cost function. Wire structure analysis in. Strengthen search (more restarts, zone transfer in fast mode, multi-step lookahead).

**Pros:** Least disruptive. Preserves all the clean physical machinery. Reuses existing infrastructure.

**Cons:** Inherits the fundamental decomposition. May still hit quality ceilings if the cost model cannot express some human judgments (e.g., motif consistency is hard to express as a local cost).

**Engineering complexity:** Medium. New cost terms are localized. Wiring `PerformanceStructure` into the solver is a clean contract change.

**Expected impact:** Large on quality (addresses the primary failure mode), modest on runtime (slightly slower due to additional cost terms).

**When to use:** Immediately, as the baseline path forward.

### B. Staged optimization

**What it is:** Decompose the joint problem into stages:

1. **Stage 1:** Choose a layout from role-based rules and spatial priors (no execution plan at all).
2. **Stage 2:** Given the layout, optimize the execution plan via beam search (current beam solver works).
3. **Stage 3:** Evaluate the full candidate against quality criteria. If it fails, backtrack to Stage 1 with feedback.
4. **Stage 4:** Re-rank top candidates with richer criteria (motif consistency, fatigue, human-reviewable diagnostics).

**Pros:** Cleaner separation of concerns. Stage 1 can use fast heuristic methods (LP, greedy, rules) that generate high-quality starting points. Stage 2 reuses the existing beam solver. Stage 3 provides a feedback loop.

**Cons:** Loses some joint-optimization power (a good layout may be penalized for its execution plan, but the staged approach cannot directly co-vary). Stage 3's feedback is hand-tuned, not principled.

**Engineering complexity:** Medium-high. Requires reworking `multiCandidateGenerator` around a staged loop.

**Expected impact:** Large if the Stage 1 rules are good, as it turns optimization into "refinement" rather than "search."

**When to use:** As a strong baseline and a fallback path when full joint optimization stalls.

### C. Strong heuristic / rule-based baseline

**What it is:** A deliberately simple, hand-written layout + fingering generator. No search. Rules:

1. Infer roles and families.
2. Cluster by family into rectangular zones.
3. Place backbones on prime pads, accents on strong fingers.
4. Order by pitch within each cluster (low→high, left→right).
5. For fingering: assign each pad a "preferred finger" at layout time; execute with RLRL alternation for fast runs.
6. For motifs: pin the first occurrence's fingering and reuse.

**Pros:** Trivial to explain, deterministic, transparent, probably beats the current optimizer on realistic patterns. Serves as the **benchmark baseline** that any optimizer must beat to justify existing.

**Cons:** Rigid. Fails on patterns the rules don't cover. Cannot find novel solutions. Hard to extend.

**Engineering complexity:** Low. A few hundred lines of clean rule code plus role/family inference (partially exists already).

**Expected impact:** Medium quality on most cases, poor on edge cases, but **critical as a benchmark reference**.

**When to use:** Build **first**, before doing any more optimizer work. Use as the reference against which the current and future optimizers are measured.

### D. Human-in-the-loop optimization

**What it is:** Treat optimization as interactive refinement, not one-shot generation. Several patterns:

1. **Anchor + fill:** User places the 3-5 most important voices manually; optimizer fills the rest with the constraint that anchors are fixed.
2. **Propose and choose:** Optimizer generates top 5 layouts with distinct characters; user picks direction, optimizer refines within that direction.
3. **Preferred / forbidden transitions:** User marks specific transitions or placements as good or bad; optimizer incorporates as constraints.
4. **Iterative refinement:** User clicks "tweak this region" and optimizer re-solves locally.

**Pros:** Encodes human judgment directly. Great UX. Aligns with the product spec's priority on "user control and editability." Handles cases where the objective cannot capture the user's intent.

**Cons:** Requires UX investment. Doesn't reduce the underlying cost model problem — the optimizer's automatic suggestions still need to be good.

**Engineering complexity:** Medium on the engine side (constraint propagation, local re-solving), high on the UX side.

**Expected impact:** Very high for users willing to engage; modest for users who want one-click generation.

**When to use:** After (A) improves baseline quality. HITL is most valuable when the optimizer's default suggestions are already decent and the user just wants to adjust.

### E. Library / template retrieval

**What it is:** For common pattern types (drum kits, scale patterns, common ostinato shapes), store known-good layouts. At generation time, match the incoming performance to the closest template and use it as a seed (or the final answer, for exact matches).

**Pros:** Instant high-quality results for common cases. Easy to grow the library over time. Templates can be user-contributed.

**Cons:** Matching logic is nontrivial. Templates must be curated. Doesn't help on uncommon patterns.

**Engineering complexity:** Low for the library mechanism, medium for good matching logic.

**Expected impact:** Large on common cases (which are the majority of real usage), zero on unusual cases.

**When to use:** As a seeding strategy alongside the current compact-left/compact-right. A matched template becomes a fourth candidate.

### F. Learning-based / preference-based system

**What it is:** Train a preference model or evaluator from labeled human data. Two sub-variants:

1. **Learned evaluator + existing search:** Replace (or augment) the hand-written cost function with a model trained on human preferences. Search as before.
2. **Imitation learning:** Train a policy that outputs layouts directly from features, trained on reference-labeled data.

**Pros:** Can capture subtle preferences that resist explicit encoding. Improves automatically as more labeled data arrives.

**Cons:** Needs labeled data (probably hundreds of pairs minimum). Risks overfitting. Harder to debug. Harder to explain decisions to users.

**Engineering complexity:** High. Requires data collection infrastructure, training pipeline, model integration.

**Expected impact:** Potentially large, potentially marginal. Depends heavily on data quality.

**When to use:** **Later phase.** Premature until (1) the benchmark exists, (2) human labeling tools exist, and (3) the explicit cost model has been refined.

### Comparison table

| Approach | Complexity | Quality lift | Near-term | Good for |
|---|---|---|---|---|
| A. Improved current | Medium | Large | Yes | Primary path |
| B. Staged | Medium-high | Large | Medium | Fallback / decomposition |
| C. Rule-based baseline | Low | Medium | **Immediate** | Benchmark reference |
| D. Human-in-the-loop | Medium / high UX | Very large | Medium | Pro users |
| E. Template retrieval | Low-medium | Large on common cases | Yes | Seeding |
| F. Learning-based | High | Variable | Later | Long-term |

---

## 7. Recommendation: Best Path Forward

Opinionated. Not a menu.

### 7.1 The recommendation

**Salvage the current optimizer but rebuild the cost model and evaluation layer first.** Do not throw away `beamSolver`, `annealingSolver`, `feasibility`, or `biomechanicalModel`. They are good. The search structure is defensible. The physical layer is sound.

The path forward is: **benchmark first, heuristic baseline second, cost model rebuild third, optimizer tuning fourth.** Do not reorder.

### 7.2 Why in this order

1. **Benchmark first** because without it, every subsequent change is tuned by vibes. No change can be validated.
2. **Heuristic baseline second** because it sets the floor the optimizer must beat to justify existing. It also probably beats the current optimizer today, which is the evidence needed to convince stakeholders that restructuring is warranted. It is **the reference** for every subsequent optimization decision.
3. **Cost model rebuild third** because the cost model is the root cause, and it must be rebuilt *against a benchmark and a baseline* rather than in a vacuum.
4. **Optimizer tuning fourth** because search quality matters only when the objective is worth searching.

Building the optimizer first is how this project ended up here. Don't do it again.

### 7.3 First 1-2 weeks

**Week 1 — Infrastructure:**

- Build the 20-case benchmark (see Section 8). Each case includes MIDI fixture, human reference solution, pass/fail criteria, and qualitative review rubric.
- Build comparison harness: given an optimizer version, run all 20 cases and produce a report card (per-case metrics, aggregate pass rate, regression against previous run).
- Surface the annealing trace and irrational detector in the UI so that "why is this bad" becomes visible.
- Turn `fatigueModel` and `irrationalDetector` into active cost terms (simple first pass).

**Week 2 — Heuristic baseline:**

- Build the rule-based baseline (Approach C) and run it on the benchmark.
- Document where it wins and loses against the current optimizer.
- Use the gap as the guide for cost model priorities.

### 7.4 After that

**Phase 3 — Cost model rebuild:**

- Wire `PerformanceStructure` into the solver contract.
- Add family grouping, spatial ordering, motif consistency, role-weighted home cost as Tier 2 quality terms.
- Re-run benchmark; compare to baseline.
- Tune weights with benchmark feedback, not intuition.

**Phase 4 — Search improvements:**

- Multi-step lookahead.
- Better mutation operators (family-aware moves, motif-preserving swaps).
- Deep mode as default for complex pieces.

**Phase 5 — Human-in-the-loop and templates:**

- Template library for common patterns.
- Anchor + fill workflow for user-pinned voices.
- Propose-and-choose UX for candidate selection.

### 7.5 What to defer explicitly

- **Learning-based scoring.** Do not start this until the benchmark exists *and* human preference labeling is in place. Too much opportunity to overfit to noise.
- **Deep solver parameter tuning.** Do not tune annealing iterations, cooling rates, or beam widths against the current cost model. It is the wrong optimization target.
- **More candidate strategies.** Do not add a fourth or fifth candidate generation strategy on top of the current three. Fix the cost model before diversifying seeds.
- **New UI panels unrelated to debugging.** The product does not need more surfaces right now. It needs better explanations of what is already there.

### 7.6 Explicit architectural decisions

- **Layout and execution stay nested, not joint.** The current decomposition is correct. Do not try to co-vary layout and fingering in a single SA move.
- **Layout-level costs are computed per SA iteration, not per beam step.** Family grouping, ordering, shape regularity are O(voices), cheap enough.
- **Motif consistency is a post-beam pass.** Compute motif fingering variance once at the end of the beam search per candidate.
- **Section-scoped costs use the existing `sectionDetection` output.** Pass sections in; compute hand balance, role distribution, and motif consistency per section.
- **Rejection is better than penalty for true physical impossibility.** Speed and topology violations should reject. Irrational assignments and fatigue should penalize.
- **All cost weights live in one config.** Extract `ALTERNATION_BEAM_WEIGHT` and `HAND_BALANCE_BEAM_WEIGHT` out of the beam solver. Put every weight in a single `CostWeights` object that flows through the config.

### 7.7 The one-line summary

> **Stop tuning. Start measuring. Build the benchmark and the heuristic baseline before writing another optimizer change.**

---

## 8. Benchmark and Test Suite Proposal

The existing `test/golden/` suite catches crashes and gross invariants. It cannot catch quality regressions. A quality benchmark is a prerequisite for further optimization work.

### 8.1 Goals

- ~20 canonical cases spanning the realistic problem space.
- Each case has a **human reference solution** (layout + fingering) that the team considers "good."
- Each case has **quantitative pass criteria** and a **qualitative review rubric**.
- The benchmark produces a report card: per-case pass/fail, deltas vs. a previous run, aggregate quality metrics.
- The benchmark is designed to resist overfitting — changes that beat the benchmark should generalize.

### 8.2 Case schema

Each case is a JSON artifact plus a human reference layout:

```jsonc
{
  "id": "B2_hand_split_call_response",
  "name": "Call-and-response between two zones",
  "category": "hand-coordination",
  "difficulty": "moderate",
  "midi": {
    "tempo": 110,
    "bars": 2,
    "events": [
      { "t": 0.00, "note": 36 },
      { "t": 0.25, "note": 38 },
      { "t": 0.50, "note": 45 },
      { "t": 0.75, "note": 47 },
      // ...
    ]
  },
  "reference": {
    "layoutHash": "sha256:...",      // committed reference layout
    "layoutDescription": "kick-snare cluster in left zone, stab cluster in right zone",
    "expectedHandSplit": "left handles 36/38, right handles 45/47"
  },
  "passCriteria": {
    "handZoneCompliance": { "min": 0.90 },
    "unplayableCount": { "max": 0 },
    "irrationalCount": { "max": 0 },
    "motifConsistency": { "min": 0.80 }
  },
  "rubric": {
    "spatialOrganization": "1-5, human review",
    "learnability": "1-5, human review",
    "naturalFlow": "1-5, human review"
  }
}
```

### 8.3 The 20 cases

**Category A — Basic patterns (4)**

| ID | Description | What it tests |
|---|---|---|
| A1 | Two-note alternation at 90 BPM | Sanity; alternation; natural pose |
| A2 | Standard rock beat (kick/snare/hat) | Role placement; drum conventions |
| A3 | Four-on-the-floor + open/closed hat | Family grouping (hat variants) |
| A4 | 4-note ascending bass line | Spatial ordering monotonicity |

**Category B — Hand coordination (4)**

| ID | Description | What it tests |
|---|---|---|
| B1 | Call-and-response between zones | Hand split; zone assignment |
| B2 | Kick+hat simultaneous, snare between | Chord split; role-aware hand choice |
| B3 | Two-hand independent lines | Per-hand motor independence |
| B4 | Chord stabs with fills between | Grip reset; role prioritization |

**Category C — Repetition and motifs (4)**

| ID | Description | What it tests |
|---|---|---|
| C1 | 4-bar loop with repeating 1-bar motif | Motif consistency |
| C2 | 2-bar pattern with variation on repeat | Partial motif consistency |
| C3 | Ostinato + changing melody over it | Stable backbone + variable lead |
| C4 | 3-over-4 polyrhythm | Cross-rhythm feasibility |

**Category D — Density and speed (4)**

| ID | Description | What it tests |
|---|---|---|
| D1 | Fast 16th-note hi-hat | Alternation; tempo-adaptive costs |
| D2 | Dense fills (8+ events/beat) | Search quality at high density |
| D3 | Rapid 3-voice alternation | Grip stability under speed |
| D4 | Sparse → dense crescendo | Robustness across sections |

**Category E — Edge cases and stress tests (4)**

| ID | Description | What it tests |
|---|---|---|
| E1 | Single voice, 16 rapid repeats | Jackhammer / fatigue |
| E2 | Wide-interval melodic jumps | Large movements; reach |
| E3 | 6+ simultaneous voices | Chord feasibility; split-hand |
| E4 | Full 16-voice performance | Scalability; layout pressure |

**Bonus cases (outside the 20)** — reserved for regression, not tuning:

- F1 – canonical drum kit (Push-style GM mapping)
- F2 – user-reported "this looked wrong" case
- F3 – user-reported motif inconsistency case

### 8.4 Reference solutions

For each case, the team produces a hand-crafted reference layout + fingering considered "good." The reference is:

- **Committed to the repo** as a JSON artifact with a hash.
- **Annotated** with the rationale ("kick goes here because...").
- **Versioned** so that reference changes are visible in git history.
- **Not used as ground truth for automatic scoring** (because "good" is not unique) but as a reference point for similarity metrics and human comparison.

### 8.5 Quantitative metrics

Each case produces these metrics automatically:

| Metric | Definition |
|---|---|
| `unplayableCount` | # events with Tier 3 fallback or `Infinity` transition |
| `irrationalCount` | From `irrationalDetector`, total violations |
| `handZoneCompliance` | % of events whose assigned hand matches the expected zone for their voice |
| `layoutCompactness` | Average pairwise distance of used pads |
| `fingerEntropy` | Shannon entropy of finger usage distribution (higher = more varied) |
| `motifConsistency` | Per-detected-motif: % of occurrences with identical fingering |
| `familyGroupingScore` | Within-family centroid spread (inverted: high = tight) |
| `orderingMonotonicity` | Kendall tau of pitch vs. column |
| `averageTransitionCost` | Mean movement cost per event |
| `maxPassageDifficulty` | From `passageDifficulty.ts` |
| `fatiguePeak` | Max per-finger fatigue across the performance |

### 8.6 Qualitative review rubric

For manual human review on a sample of cases:

1. **Spatial organization** (1-5): Do related sounds cluster sensibly? Is the layout readable at a glance?
2. **Learnability** (1-5): Could a moderately skilled Push player memorize this in 10 minutes?
3. **Natural flow** (1-5): Do the finger assignments feel natural to watch?
4. **Overall** (1-5): Would you want to practice this, or does it look machine-generated?

### 8.7 Pass/fail sanity detectors

Automatic "this is obviously bad" detectors that can fail cases without manual review:

- Any single finger used 5+ times consecutively (unless tempo > 160 BPM and alternatives proven infeasible)
- Pinky assigned to central pads (rows 3-4, cols 2-5) when index is available
- Thumb assigned to rows 5-7
- Two or more voices of the same family separated by > 3 grid units
- Any layout where the used pads span > 6 rows or > 6 columns unnecessarily
- Motif fingering variance > 50% (same motif played 3 different ways in 3 occurrences)

### 8.8 Comparison methodology

**Optimizer A vs. Optimizer B:**
- Run both on all 20 cases.
- Compute all metrics.
- Report per-case winner by aggregate quality score.
- Per-metric head-to-head.
- Highlight regressions: any case where B does worse than A on any metric.

**Avoid overfitting:**
- The benchmark should not be used as the training signal for weight tuning. Hold out 5 cases as "test set" and never tune against them.
- Rotate hold-out cases periodically.
- Add new cases regularly, especially user-reported issues.
- Keep the reference solutions stable unless there is a principled reason to change.

### 8.9 Running the benchmark

```
pnpm bench              # run all 20 cases
pnpm bench --case A1    # run a single case
pnpm bench --compare    # compare current vs. previous saved run
pnpm bench --rubric     # generate the qualitative review form
```

Output: a markdown report card per run, committed to `benchmark-results/` for traceability.

---

## 9. Debugging and Introspection Tools

The optimizer cannot be improved until its decisions can be explained. This section lists debugging tools in priority order, with enough detail for implementation.

### 9.1 Build first (Priority 1)

**9.1.1 Annealing convergence viewer.**
The `annealingTrace` data already exists. Build a simple chart component that reads `metadata.solverTelemetry` and renders:
- Cost vs. iteration (line chart)
- Temperature curve overlay
- Accepted/rejected markers
- Restart boundaries (deep mode)
- Per-restart best cost
This single tool answers "did the optimizer converge or get stuck?" for free.

**9.1.2 Cost breakdown per candidate (detailed).**
For each candidate:
- All 5 active beam score components with their weights and values
- Running totals per component across the piece
- Per-event top-3 cost contributors
- Highlight which term dominates the total
- Side-by-side for 2+ candidates

**9.1.3 Irrational assignment report in main UI.**
The detector already runs. Surface it in `AnalysisSidePanel`, not in a debug panel. Every candidate card shows: "3 irrational assignments (2 pinky misuse, 1 same-finger streak)." Clicking drills into the offending events.

**9.1.4 "Why this placement?" explainer.**
For each voice in the final layout: show what the cost contribution of this placement is, and what the next-best alternative placement would have cost. Answer "is the optimizer confident, or was this a near-tie?"

### 9.2 Build next (Priority 2)

**9.2.1 Top-N solution inspector.**
During annealing, save the top 5-10 distinct layouts (not just the single best). Let the user browse them. A layout that was rejected by 0.3% may look subjectively better to a user — this is a direct test of whether the cost function matches human preference.

**9.2.2 Transition heatmap.**
Visual heatmap over the 8×8 grid showing transition frequency and cost. Overlay per-hand / per-finger views. Makes "why is this hand doing so much work?" visually obvious.

**9.2.3 Local neighborhood explorer.**
Given the current layout, show a grid of "what if I moved voice X to pad Y?" cells, color-coded by cost delta. Users can see whether the optimizer found a true local minimum or simply gave up.

**9.2.4 Motif consistency diagnostic.**
For each detected motif, show all its occurrences with their fingerings. Highlight any occurrence that differs from the majority. Immediately reveals motif-consistency failures.

### 9.3 Build later (Priority 3)

**9.3.1 Sensitivity analysis.**
Vary each cost weight ±20% and show how the optimal layout and metrics change. Identifies tipping-point weights and signals over/under-constrained terms.

**9.3.2 Ablation mode.**
Disable one cost term at a time, re-optimize, show the resulting metric deltas. Answers "which terms actually drive decisions?"

**9.3.3 Passage-level stress test.**
Re-optimize a single hard passage in isolation, ignoring the rest of the song. Compare local optimum to the full-song optimum. Reveals global vs. local tradeoffs.

**9.3.4 Reference solution comparison.**
Given a human reference layout, compute the cost difference, per-term deltas, and a visual diff of where the optimizer and human disagree. Drives benchmark-guided tuning.

### 9.4 Output formats

**Annealing trace CSV:**
```
iteration,temperature,currentCost,bestCost,accepted,deltaCost,restartIndex
0,500.0,125.3,125.3,true,0.0,0
1,498.5,122.1,122.1,true,-3.2,0
...
```

**Cost breakdown JSON:**
```jsonc
{
  "candidateId": "...",
  "total": 487.3,
  "components": {
    "poseNaturalness": { "value": 123.4, "weight": 1.0, "contribution": 123.4 },
    "transitionDifficulty": { "value": 201.1, "weight": 1.0, "contribution": 201.1 },
    "constraintPenalty": { "value": 0, "weight": 1.0, "contribution": 0 },
    "alternation": { "value": 15.5, "weight": 0.8, "contribution": 12.4 },
    "handBalance": { "value": 0.12, "weight": 0.3, "contribution": 0.04 }
  },
  "perEvent": [ /* ... */ ],
  "topContributors": [ /* events responsible for the largest costs */ ]
}
```

**Layout diff format:**
```jsonc
{
  "fromCandidate": "A",
  "toCandidate": "B",
  "moves": [
    { "voice": "Kick", "from": "2,3", "to": "0,1", "costDelta": -5.2 },
    { "voice": "Snare", "from": "3,4", "to": "0,6", "costDelta": +1.8 }
  ],
  "totalCostDelta": -3.4
}
```

**Irrational violation report:**
```jsonc
{
  "candidateId": "...",
  "totalViolations": 3,
  "byCategory": {
    "pinkyMisuse": 2,
    "thumbAbuse": 0,
    "sameFingerStreak": 1,
    "crossHandUnnecessary": 0
  },
  "events": [ /* specific violating events */ ]
}
```

### 9.5 Implementation cost

| Tool | Engine changes | UI changes | Data source |
|---|---|---|---|
| Annealing trace viewer | None | New chart component | Existing `annealingTrace` |
| Cost breakdown detailed | Small (export components) | New panel | Existing components |
| Irrational report | None | Surface in main panel | Existing detector |
| Why-this-placement | Small (store alternatives) | Explain tooltip | Requires mod to beam |
| Top-N inspector | Small (retain top N in SA) | New selector | Requires SA change |
| Transition heatmap | None | New visualization | Existing assignments |
| Neighborhood explorer | Medium (re-eval on demand) | New panel | New computation |
| Motif consistency diag | Small (aggregate per motif) | New panel | Existing motifs |
| Sensitivity analysis | Medium (config loop) | New report | New computation |
| Ablation mode | Small (config flag) | New report | New computation |

Start with the trivially-cheap Priority 1 items that surface data that already exists. Those changes alone would significantly improve debuggability without touching the optimizer at all.

---

## 10. Implementation Plan

Five phases. Each phase has an objective, a concrete task list, an expected outcome, and a success criterion that must be met before advancing.

### Phase 1 — Instrument and understand

**Objective:** Make the current optimizer legible. Stop flying blind.

**Tasks:**

1. Surface the annealing trace in the UI (chart component, reads `metadata.solverTelemetry`).
2. Surface the irrational-assignment detector in `AnalysisSidePanel`.
3. Export `ALTERNATION_BEAM_WEIGHT` and `HAND_BALANCE_BEAM_WEIGHT` from `biomechanicalModel.ts`. Add a `CostWeights` config object threaded through the solver config.
4. Add a cost-breakdown-per-candidate view (all 5 components, per-event top contributors).
5. Enable annealing by default in auto-analysis (or be explicit about why not).
6. Add a debug log of which costs dominate average beam scores for each candidate.

**Expected outcome:** Any team member can look at a bad result and say "the alternation cost is being dominated by the transition cost by 20:1, and the optimizer never sees family groupings."

**Success criterion:** When a bad layout is produced, you can explain *in one sentence* which cost term drove it, without guessing.

---

### Phase 2 — Benchmark and heuristic baseline

**Objective:** Establish ground truth and a strong baseline.

**Tasks:**

1. Write the 20-case benchmark specification (see Section 8 and `docs/optimization_benchmark_spec.md`).
2. Implement MIDI fixture generators for each case.
3. Build 20 human reference solutions (layout + fingering). Review them with the team.
4. Implement quantitative metrics (`unplayableCount`, `irrationalCount`, `handZoneCompliance`, `motifConsistency`, `familyGroupingScore`, `orderingMonotonicity`, etc.).
5. Build `pnpm bench` runner and report card generator.
6. Implement the rule-based heuristic baseline (Section 6, Approach C).
7. Run benchmark with: (a) current optimizer (fast), (b) current optimizer (deep), (c) heuristic baseline. Record baseline numbers.
8. Human-review a sample of results from all three runs. Record rubric scores.

**Expected outcome:** A report card showing how the current optimizer and the heuristic baseline compare on 20 cases, with both quantitative and qualitative scores.

**Success criterion:** At least one case exists where the heuristic baseline objectively beats both optimizer modes on quantitative metrics. (If this fails, the benchmark is not sensitive enough.)

---

### Phase 3 — Cost model rebuild

**Objective:** Close the gap identified by Phase 2. Make the optimizer beat the heuristic baseline.

**Tasks:**

1. Wire `PerformanceStructure` into the `BeamSolver` and `AnnealingSolver` interfaces. Both now accept a `structure` argument.
2. Add voice role and family metadata to `Voice` (from `roleInference` + a new family classifier).
3. Implement new cost terms:
   - `familyGroupingCost` (layout-level, O(voices²))
   - `roleHomeCost` (per-voice, weighted version of perFingerHomeCost)
   - `spatialOrderingCost` (layout-level Kendall tau)
   - `motifConsistencyCost` (post-beam aggregation over detected motifs)
   - `activeFatigueCost` (integrate `fatigueModel.ts` into beam score)
   - `irrationalAssignmentCost` (integrate `irrationalDetector.ts` into beam score)
4. Extract all cost weights into `CostWeights` config. Set initial weights by reasoning from magnitudes.
5. Make alternation tempo-adaptive and strengthen it.
6. Smooth the max-hand-speed cliff into a steep soft cost.
7. Run the benchmark. Tune weights against the benchmark results, not against individual cases.
8. Iterate until the optimizer beats the heuristic baseline on aggregate quality.

**Expected outcome:** The rebuilt optimizer beats the heuristic baseline on the benchmark by a measurable and explainable margin.

**Success criterion:** Aggregate benchmark quality score of the rebuilt optimizer > heuristic baseline > current optimizer. Regressions on any case must have a documented rationale.

---

### Phase 4 — Search improvements

**Objective:** Exploit the improved cost model with better search.

**Tasks:**

1. Add multi-step lookahead (3-5 events) to `BeamSolver` with distance decay.
2. Add family-aware and motif-preserving mutation operators to `MutationService`.
3. Enable zone transfer mutation in fast mode (not just deep).
4. Add SA restarts to fast mode (2-3 restarts at lower iteration counts each).
5. Track top-N distinct layouts during annealing for inspection.
6. Implement neighborhood explorer UI (Priority 2 debugging tool).
7. Re-run benchmark. Verify no regression.

**Expected outcome:** Search quality gain on top of cost model gains. Better handling of complex cases (category D and E in the benchmark).

**Success criterion:** Phase 4 optimizer beats Phase 3 optimizer by 5-10% on aggregate quality, with no regressions.

---

### Phase 5 — Human-in-the-loop and templates

**Objective:** Add user control and common-case acceleration.

**Tasks:**

1. Build template library: store 5-10 canonical drum kit / ostinato / scale layouts.
2. Build template matcher: detect when incoming MIDI matches a template.
3. Use matched template as a fourth seed strategy in `multiCandidateGenerator`.
4. Build anchor-and-fill UX: user pins 2-5 voices manually, optimizer fills the rest respecting pins.
5. Build propose-and-choose UX: top 5 distinct candidates with character tags ("compact-right", "balanced", "family-grouped"), user picks direction.
6. Build preferred-transition marking: user marks specific good/bad transitions, optimizer incorporates as constraints.

**Expected outcome:** Pro users can drive the optimizer directly; beginner users get template-matched layouts instantly.

**Success criterion:** Template matching produces instant high-quality results on the top 3-5 "common" benchmark cases. Anchor-and-fill respects user pins 100% of the time.

---

### Phase 6 (optional, long term) — Learning-based scoring

**Objective:** Refine the cost model using human preference data.

**Tasks (only once Phases 1-5 are stable):**

1. Build a pairwise labeling tool: "which of these two is better?"
2. Collect 500+ labeled pairs across the benchmark cases.
3. Train a preference model on features derived from the current cost breakdown.
4. Use the model as an additional scoring term or as a re-ranker for top candidates.
5. Validate that the learned model generalizes to unseen cases without overfitting.

**Expected outcome:** Preference-learned refinement of cost weights, or a learned re-ranker.

**Success criterion:** Learned model improves aggregate quality score against the Phase 5 baseline *on held-out benchmark cases*. If it does not, discard.

---

## 11. Code Changes / Artifacts to Create

This is the list of concrete artifacts that should exist after implementing the recommendations.

### 11.1 New documents

- [x] **`PUSHFLOW_OPTIMIZATION_ASSESSMENT.md`** (this file) — the assessment itself.
- [ ] **`docs/optimization_benchmark_spec.md`** — full benchmark specification (outline in Section 8; to be expanded).
- [ ] **`docs/optimization_debugging_plan.md`** — debugging tools plan (outline in Section 9; to be expanded).
- [ ] **`docs/human_layout_criteria.md`** — human-centered criteria reference (outline in Section 4; to be expanded).

### 11.2 New schema artifacts

- [ ] **`benchmark/cases/*.json`** — 20 benchmark case fixtures.
- [ ] **`benchmark/references/*.json`** — 20 human reference solutions.
- [ ] **`benchmark-results/*.md`** — report cards (committed per run for traceability).
- [ ] **Cost breakdown JSON schema** — as in Section 9.4.
- [ ] **Annealing trace CSV schema** — as in Section 9.4.
- [ ] **Layout diff JSON schema** — as in Section 9.4.

### 11.3 Code changes (high priority)

Module | Change
---|---
`src/types/performanceEvent.ts` | Add optional `role`, `family`, `motifId` fields
`src/types/voice.ts` | Add optional `role`, `family`, `priority` fields
`src/engine/prior/biomechanicalModel.ts` | Export `ALTERNATION_BEAM_WEIGHT`, `HAND_BALANCE_BEAM_WEIGHT`. Add new weight constants for upcoming cost terms.
`src/engine/solvers/beamSolver.ts` | Accept `PerformanceStructure` argument. Remove hardcoded weights.
`src/engine/optimization/annealingSolver.ts` | Accept `PerformanceStructure` argument. Add layout-level cost computation per iteration.
`src/engine/evaluation/costFunction.ts` | Add `familyGroupingCost`, `spatialOrderingCost`, `roleHomeCost`, `motifConsistencyCost`, `activeFatigueCost`, `irrationalAssignmentCost`.
`src/engine/evaluation/objective.ts` | Extend `PerformabilityObjective` with new terms. Add `CostWeights` type.
`src/engine/debug/irrationalDetector.ts` | No API change. New callers from solver.
`src/engine/diagnostics/fatigueModel.ts` | Add stateful accumulation for beam-time use.
`src/engine/optimization/mutationService.ts` | Add family-aware and motif-preserving mutation operators.
`src/engine/optimization/multiCandidateGenerator.ts` | Add template-matched seed strategy. Track top-N distinct layouts.
`src/ui/components/AnalysisSidePanel.tsx` | Surface irrational-assignment report.
`src/ui/components/AnnealingTraceChart.tsx` | **New** — convergence viewer.
`src/ui/components/CostBreakdownPanel.tsx` | **New** — detailed cost breakdown per candidate.

### 11.4 New tests

- [ ] `test/benchmark/benchmark.test.ts` — runs the 20-case benchmark and asserts pass criteria.
- [ ] `test/engine/evaluation/familyGrouping.test.ts` — unit tests for new cost terms.
- [ ] `test/engine/evaluation/motifConsistency.test.ts`
- [ ] `test/engine/evaluation/activeFatigue.test.ts`
- [ ] `test/engine/integration/structureAware.test.ts` — verifies solver respects passed-in structure.
- [ ] Regression tests on the 20 golden cases asserting zero irrational assignments after Phase 3.

### 11.5 TODO comments / issue stubs

Create GitHub issues (or in-code `TODO` comments) for the highest-priority engineering work:

- **[P0]** "Solver blind to `PerformanceStructure` — wire it into `BeamSolver` and `AnnealingSolver`." [Phase 3]
- **[P0]** "Fatigue model is computed but unused — integrate into beam score." [Phase 3]
- **[P0]** "Irrational-assignment detector is post-hoc only — integrate into beam score." [Phase 3]
- **[P0]** "Cost weights hardcoded in `beamSolver.ts` — extract to `CostWeights` config." [Phase 1]
- **[P0]** "Build 20-case benchmark and rule-based baseline before further optimizer work." [Phase 2]
- **[P1]** "Annealing trace data is captured but not displayed — build viewer." [Phase 1]
- **[P1]** "Voice family / role metadata absent from `Voice` type — add and populate." [Phase 3]
- **[P1]** "1-step lookahead insufficient — extend to multi-step." [Phase 4]
- **[P2]** "Template library for common drum kits and ostinato shapes." [Phase 5]
- **[P2]** "Anchor + fill workflow for user-pinned voices." [Phase 5]

---

## Appendix A — Explicit answers to the eight specific questions

### 1. Is the current problem formulation fundamentally sound?

**Partially.** The joint (layout, execution) framing is correct, and the nested decomposition (annealing over beam) is a defensible way to handle the coupling. The physical/biomechanical layer is sound. What is unsound is the representation and objective: the solver operates on a flat event list with no musical knowledge, and the cost function captures only hand comfort. The formulation needs restructuring of the cost model and the solver's input interface, not a ground-up rewrite.

### 2. If the cost model were significantly improved, could this approach likely work?

**Yes.** The existing search architecture (annealing + beam + multi-candidate) is capable of producing much better results *if* the objective captures human criteria. Adding family grouping, spatial ordering, motif consistency, role-based placement, active fatigue, and irrational-assignment penalties to the cost model would likely close most of the gap between current output and human-acceptable output. Search improvements (multi-step lookahead, better mutations, more restarts) are secondary — necessary to fully exploit an improved cost model, but not the root cause.

### 3. Is search likely the main bottleneck, or is evaluation the bigger issue?

**Evaluation is the bigger issue by a wide margin.** The current search finds near-optimal solutions to the current objective; the current objective is the problem. Better search would produce better-optimized garbage. Additionally, the *meta-evaluation* infrastructure (how the team knows whether a change helps) is absent — there is no benchmark, no reference solutions, no A/B machinery. This is the second-biggest bottleneck. Search is third.

### 4. Would a strong heuristic baseline probably outperform the current system today?

**Almost certainly yes**, on realistic patterns. A baseline that (a) clusters by role/family, (b) orders voices by pitch within clusters, (c) pins backbone voices to prime pads, and (d) uses RLRL alternation for fast runs would produce layouts that look dramatically more human-sensible than the current optimizer, even if its quantitative score on the current cost function is slightly lower. That is a direct indictment of the current cost function. Building this baseline is the highest-leverage short-term action, because it establishes the reference the optimizer must beat.

### 5. What kinds of human preferences seem hardest to encode directly?

In roughly descending difficulty:

- **Musical taste / stylistic convention.** "A jazz drummer would fingerdrum this differently than a hip-hop drummer" — style-dependent preferences are hard to encode without stylistic metadata.
- **Contextual exceptions.** Rules like "group by family, but this particular lead wants to be near the bass for musical reasons." Hard without explicit user input.
- **Motor-chunk ergonomics beyond 1-finger transitions.** Humans naturally feel 2-4 note chunks as single gestures; encoding this requires multi-step cost or chunk detection.
- **Expressive dynamics.** Velocity-dependent preferences ("put the loudest note on the strongest finger") are only weakly captured by current feasibility.
- **Long-term fatigue.** Fatigue over minutes, not seconds, is hard to model without stateful simulation.

These are reasons to add **human-in-the-loop** and **preference learning** in later phases — not to abandon explicit cost modeling, but to supplement it for cases the explicit model cannot reach.

### 6. Should layout and finger assignment be solved jointly, sequentially, or iteratively?

**Iteratively, via the current nested structure.** Keep annealing outer over layouts, beam inner over fingerings. This is how the current architecture already works and it is the right decomposition. A fully joint single-move optimizer would explode the search space; a purely sequential one would lose the coupling. The current approach captures coupling (the execution plan is re-solved for every layout mutation) while keeping each layer tractable.

However: *structure* must flow into both layers. The outer layout layer needs to know about families and motifs to mutate sensibly. The inner execution layer needs to know about roles to place backbones on strong fingers. Both layers currently lack this knowledge.

### 7. What minimum benchmark suite is needed before further optimizer work is trustworthy?

The 20-case suite described in Section 8. At minimum:

- 4 basic patterns (sanity checks)
- 4 hand-coordination patterns (zone assignment)
- 4 motif / repetition patterns (consistency)
- 4 density / speed patterns (search quality)
- 4 edge cases (stress)

Each with a committed human reference solution, quantitative metrics, and a qualitative review rubric. And a rule-based baseline generator that runs on the same benchmark so "good" and "current" have a shared reference.

**No further optimizer work should be shipped without running it.** This is the single most important infrastructure investment.

### 8. What is the fastest path to visibly better outputs?

In rough order of decreasing speed-to-visible-improvement:

1. **Integrate `irrationalDetector` and `fatigueModel` as active cost terms** (a few days, large visible impact — eliminates the most jarring failure modes).
2. **Wire `PerformanceStructure` into the solver and add family grouping cost** (1-2 weeks, largest quality lift — addresses the root-cause representation gap).
3. **Surface the annealing trace + irrational report in the UI** (a few days, enables faster subsequent iteration).
4. **Build the rule-based baseline** (1 week, provides reference and often ships as a fallback for simple cases).
5. **Build the 20-case benchmark** (1-2 weeks, enables trustworthy iteration).

The fastest *visible* improvement comes from (1) — integrating the irrational detector is a few hundred lines of code and immediately prevents the outputs users complain about most. The most *important* improvement comes from (2) — wiring in family grouping is the single change that most addresses the root cause. Do both in parallel. Do the benchmark (5) in parallel too, because everything downstream depends on it.

---

**End of assessment.**

This document is meant to ground a concrete decision: keep tuning the current optimizer, restructure it, or replace it. My recommendation is **restructure** — salvage the good physical machinery, rebuild the cost model around structure-aware human criteria, and make every further change measurable against a real benchmark. Start with the benchmark and the heuristic baseline. Stop tuning until you can measure.




