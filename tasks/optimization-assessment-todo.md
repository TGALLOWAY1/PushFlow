# PushFlow Optimization Assessment — Task Plan

## Objective
Critically assess the current PushFlow optimization system, determine why outputs feel unnatural, and propose a concrete path to substantially better results. This is an audit and redesign task, not a tuning task.

---

## Phase 0: Preparation
- [ ] Read `docs/canonical_product_spec.md`
- [ ] Read `docs/terminology.md`
- [ ] Read `docs/canonical_test_suite.md`
- [ ] Read `docs/repo_map.md`
- [ ] Read `tasks/lessons.md` for relevant prior learnings
- [ ] Review existing audit docs in `tasks/` for context on prior work

---

## Phase 1: Deep Codebase Research

### 1A: Understand the Optimization Pipeline
- [ ] Identify the main optimizer entry point and trace the full pipeline
- [ ] Map out decision variables (layout assignment, finger assignment)
- [ ] Determine if layout and finger assignment are solved jointly or separately
- [ ] Identify the search strategy (simulated annealing, genetic, ILP, greedy, etc.)
- [ ] Document the iteration/convergence logic
- [ ] Identify all termination criteria and solution selection logic

### 1B: Audit the Cost Model
- [ ] Enumerate every cost/penalty term in the objective function
- [ ] For each term: document what behavior it encourages, its weight, its formula
- [ ] Identify hard constraints vs soft penalties
- [ ] Check for conflicting objectives or gameable terms
- [ ] Assess whether costs operate on transitions, sequences, motifs, or full layouts
- [ ] Determine if there is any hierarchical or lexicographic cost structure

### 1C: Audit the Representation
- [ ] How is the layout represented internally?
- [ ] How is the finger assignment represented?
- [ ] How are performance events modeled (timing, simultaneity, phrases)?
- [ ] Are motifs, repeated patterns, or phrase structure recognized?
- [ ] How is the hand model defined (reach, natural pose, zones)?
- [ ] Are there hidden assumptions or simplifications in the representation?

### 1D: Trace Failure Modes
- [ ] Generate or find example outputs that feel "wrong but legal"
- [ ] Identify specific cases where a naive rule-based approach would win
- [ ] Check if the optimizer can even distinguish mediocre from excellent solutions
- [ ] Look for evidence of bad local minima trapping
- [ ] Check debugging/introspection capabilities (or lack thereof)
- [ ] Identify any divergence between implementation and intended design

---

## Phase 2: Analysis and Diagnosis

### 2A: Classify the Core Problem
- [ ] Determine: is this primarily a cost-model problem, search problem, representation problem, or all three?
- [ ] Assess whether the problem formulation is fundamentally sound
- [ ] Assess whether improved cost model alone could fix outputs
- [ ] Assess whether search is the main bottleneck vs evaluation quality

### 2B: Identify Missing Human-Centered Criteria
- [ ] Intuitive spatial organization (left-to-right, low-to-high)
- [ ] Sound family grouping
- [ ] Repeatability and memorability
- [ ] Ergonomic comfort over repeated practice (not just single transitions)
- [ ] Symmetry and visual coherence
- [ ] Natural hand/finger alternation
- [ ] Avoidance of "legal but weird" assignments
- [ ] Chunkability into learnable motor patterns
- [ ] Consistency with drummer/finger drummer conventions
- [ ] Pattern identity and phrase logic preservation
- [ ] For each: propose modeling approach (hard rule, soft cost, prior, post-filter, metric)

### 2C: Evaluate Alternative Approaches
- [ ] Assess: improved version of current optimizer (tune costs, fix search)
- [ ] Assess: staged optimization (layout first, then fingering, then re-rank)
- [ ] Assess: strong heuristic/rule-based baseline
- [ ] Assess: human-in-the-loop optimization
- [ ] Assess: library/template retrieval approach
- [ ] Assess: learning-based or preference-based system
- [ ] For each: pros/cons, complexity, expected impact, timeline

---

## Phase 3: Write the Assessment Document

### 3A: `PUSHFLOW_OPTIMIZATION_ASSESSMENT.md` (root level)
- [ ] Section 1: Executive Summary (blunt assessment, top 3 changes)
- [ ] Section 2: Current System Overview (pipeline, variables, constraints, costs, search)
- [ ] Section 3: Failure Analysis (representation, objective, search, constraint, evaluation, debugging failures)
- [ ] Section 4: Human-Centered Criteria Missing From the Model
- [ ] Section 5: Cost Model Critique (per-term audit + proposed better structure)
- [ ] Section 6: Alternative Optimization Approaches (A through F with comparison)
- [ ] Section 7: Recommendation: Best Path Forward (opinionated, phased)
- [ ] Section 8: Benchmark and Test Suite Proposal (~20 cases, metrics, rubric)
- [ ] Section 9: Debugging and Introspection Tools (prioritized list)
- [ ] Section 10: Implementation Plan (phased with objectives, tasks, success criteria)
- [ ] Section 11: Code Changes / Artifacts to Create
- [ ] Explicitly answer all 8 specific questions from the prompt

### 3B: Supporting Documents
- [ ] Create `docs/optimization_benchmark_spec.md` (benchmark case schema, categories, evaluation criteria)
- [ ] Create `docs/optimization_debugging_plan.md` (introspection tools, priority order, formats)
- [ ] Create `docs/human_layout_criteria.md` (human-centered criteria catalog with modeling proposals)

---

## Phase 4: Review and Finalize
- [ ] Re-read assessment against the prompt requirements — check all sections present
- [ ] Verify all 8 explicit questions are answered
- [ ] Ensure recommendations are grounded in actual code, not generic advice
- [ ] Ensure tone is honest and critical, not diplomatic
- [ ] Check that deliverable artifacts are listed and created
- [ ] Commit all files to `claude/pushflow-assessment-doc-GPylP` branch
- [ ] Push to remote

---

## Key Questions to Answer (must appear explicitly in assessment)
1. Is the current problem formulation fundamentally sound?
2. If the cost model were significantly improved, could this approach likely work?
3. Is search likely the main bottleneck, or is evaluation the bigger issue?
4. Would a strong heuristic baseline probably outperform the current system today?
5. What kinds of human preferences seem hardest to encode directly?
6. Should layout and finger assignment be solved jointly, sequentially, or iteratively?
7. What minimum benchmark suite is needed before further optimizer work is trustworthy?
8. What is the fastest path to visibly better outputs?

---

## Deliverables Checklist
- [ ] `PUSHFLOW_OPTIMIZATION_ASSESSMENT.md` (root)
- [ ] `docs/optimization_benchmark_spec.md`
- [ ] `docs/optimization_debugging_plan.md`
- [ ] `docs/human_layout_criteria.md`
- [ ] All committed and pushed to `claude/pushflow-assessment-doc-GPylP`
