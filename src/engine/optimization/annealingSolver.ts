/**
 * AnnealingSolver - Simulated Annealing optimization algorithm.
 *
 * Optimizes the Layout by iteratively mutating pad assignments
 * and accepting better or probabilistically worse solutions based on temperature.
 * Uses Beam Search as the cost evaluation function.
 *
 * Ported from Version1/src/engine/solvers/AnnealingSolver.ts with canonical terminology:
 * - GridMapping → Layout, .cells → .padToVoice
 * - EngineResult → ExecutionPlanResult
 * - debugEvents → fingerAssignments
 */

import { type Performance } from '../../types/performance';
import { type EngineConfiguration } from '../../types/engineConfig';
import { type Layout } from '../../types/layout';
import { type FingerType } from '../../types/fingerModel';
import {
  type ExecutionPlanResult,
  type AnnealingIterationSnapshot,
} from '../../types/executionPlan';
import { type SolverConfig, type NeutralPadPositions } from '../../types/engineConfig';
import { type SolverStrategy, type SolverType } from '../solvers/types';
import { createBeamSolver } from '../solvers/beamSolver';
import { applyRandomMutation } from './mutationService';
import { computeMappingCoverage } from '../mapping/mappingCoverage';
import { createSeededRng } from '../../utils/seededRng';

// ============================================================================
// Simulated Annealing Configuration
// ============================================================================

/** Initial temperature — higher values allow more exploration early on. */
const INITIAL_TEMP = 500;

/**
 * Cooling rate applied each iteration (close to 1.0 = slow cooling).
 * With 3000 iterations: final temp = 500 × 0.997^3000 ≈ 0.56
 * This keeps meaningful exploration longer than the previous 0.99 × 1000 schedule.
 */
const COOLING_RATE = 0.997;

/**
 * Number of iterations to run the annealing loop.
 * Increased from 1000 → 3000 to explore more of the layout space.
 * With 10-20 occupied pads on a 64-cell grid, single-pad mutations
 * need sufficient iterations to discover non-local improvements.
 */
const ITERATIONS = 3000;

/**
 * Beam width for fast cost evaluation during annealing.
 * Increased from 5 → 12 to reduce noise in the cost function used
 * to guide annealing acceptance decisions. Width 5 was too narrow —
 * layouts that appear poor at width 5 may be good at width 50,
 * creating unreliable gradients for the annealing search.
 */
const FAST_BEAM_WIDTH = 12;

/** Beam width for final high-quality evaluation. */
const FINAL_BEAM_WIDTH = 50;

// ============================================================================
// AnnealingSolver Implementation
// ============================================================================

/**
 * AnnealingSolver - Simulated Annealing algorithm implementation.
 *
 * Implements the SolverStrategy interface for pluggable solver support.
 * Optimizes Layout by mutating pad assignments and accepting solutions
 * based on the Metropolis criterion.
 */
export class AnnealingSolver implements SolverStrategy {
  public readonly name = 'Simulated Annealing';
  public readonly type: SolverType = 'annealing';
  public readonly isSynchronous = false;

  private instrumentConfig: SolverConfig['instrumentConfig'];
  private initialLayout: Layout | null;
  private neutralPadPositionsOverride: NeutralPadPositions | null = null;
  private bestLayout: Layout | null = null;
  private seed: number;

  constructor(config: SolverConfig) {
    this.instrumentConfig = config.instrumentConfig;
    this.initialLayout = config.layout ?? null;
    this.neutralPadPositionsOverride = config.neutralPadPositionsOverride ?? null;
    this.seed = config.seed ?? Math.floor(Math.random() * 0x7fffffff);
  }

  /**
   * Gets the best Layout found during the last solve() call.
   * Returns null if solve() hasn't been called yet.
   */
  public getBestLayout(): Layout | null {
    return this.bestLayout;
  }

  /**
   * Evaluates the cost of a Layout by running Beam Search.
   * Invalid candidates (unmapped notes) return Infinity and are always rejected.
   */
  private async evaluateLayoutCost(
    layout: Layout,
    performance: Performance,
    config: EngineConfiguration,
    beamWidth: number
  ): Promise<{ result: ExecutionPlanResult; cost: number; invalidReason?: string }> {
    // Enforce full coverage: unmapped candidates are invalid
    const coverage = computeMappingCoverage(performance, layout);
    if (coverage.unmappedNotes.length > 0) {
      const sentinelResult: ExecutionPlanResult = {
        score: 0,
        unplayableCount: performance.events.length,
        hardCount: 0,
        fingerAssignments: [],
        fingerUsageStats: {},
        fatigueMap: {},
        averageDrift: 0,
        averageMetrics: {
          movement: 0, stretch: 0, drift: 0, bounce: 0,
          fatigue: 0, crossover: 0, total: Number.POSITIVE_INFINITY,
        },
        metadata: {
          layoutCoverage: {
            totalNotes: coverage.totalNotes,
            unmappedNotesCount: coverage.unmappedNotes.length,
            fallbackNotesCount: 0,
          },
          invalidReason: 'invalid_unmapped_notes',
        },
      };
      return {
        result: sentinelResult,
        cost: Number.POSITIVE_INFINITY,
        invalidReason: 'invalid_unmapped_notes',
      };
    }

    // Create a BeamSolver with strict mode (no fallback during optimization)
    const solverConfig: SolverConfig = {
      instrumentConfig: this.instrumentConfig,
      layout,
      neutralPadPositionsOverride: this.neutralPadPositionsOverride,
      mappingResolverMode: 'strict',
    };

    const beamSolver = createBeamSolver(solverConfig);

    const evaluationConfig: EngineConfiguration = {
      ...config,
      beamWidth,
    };

    const result = await beamSolver.solve(performance, evaluationConfig);

    return {
      result,
      cost: result.averageMetrics.total,
    };
  }

  /**
   * Solves the performance optimization problem using Simulated Annealing.
   *
   * The algorithm:
   * 1. Starts with the current Layout
   * 2. Iteratively mutates the layout
   * 3. Evaluates cost using fast Beam Search
   * 4. Accepts better solutions or probabilistically accepts worse ones
   * 5. Cools temperature each iteration
   * 6. Runs final high-quality Beam Search on best layout
   */
  public async solve(
    performance: Performance,
    config: EngineConfiguration,
    manualAssignments?: Record<string, { hand: 'left' | 'right'; finger: FingerType }>
  ): Promise<ExecutionPlanResult> {
    if (!this.initialLayout) {
      throw new Error('AnnealingSolver requires an initial Layout. Cannot optimize an empty layout.');
    }

    // Deep copy initial layout
    let currentLayout: Layout = {
      ...this.initialLayout,
      padToVoice: { ...this.initialLayout.padToVoice },
      fingerConstraints: { ...this.initialLayout.fingerConstraints },
    };

    // Calculate initial cost
    const initialEvaluation = await this.evaluateLayoutCost(
      currentLayout, performance, config, FAST_BEAM_WIDTH
    );
    let currentCost = initialEvaluation.cost;

    // Fail early if initial layout is invalid
    if (
      !Number.isFinite(currentCost) ||
      currentCost === Number.POSITIVE_INFINITY ||
      initialEvaluation.invalidReason
    ) {
      throw new Error(
        'Initial layout does not cover all sounds. Seed the layout from Pose0 or assign all required notes before optimizing.'
      );
    }

    // Track the best layout found
    let bestLayout: Layout = {
      ...currentLayout,
      padToVoice: { ...currentLayout.padToVoice },
      fingerConstraints: { ...currentLayout.fingerConstraints },
    };
    let bestCost = currentCost;

    const rng = createSeededRng(this.seed);
    let currentTemp = INITIAL_TEMP;
    const annealingTrace: AnnealingIterationSnapshot[] = [];

    // The Annealing Loop
    for (let step = 0; step < ITERATIONS; step++) {
      const candidateLayout = applyRandomMutation(currentLayout, rng);

      const candidateEvaluation = await this.evaluateLayoutCost(
        candidateLayout, performance, config, FAST_BEAM_WIDTH
      );
      const candidateCost = candidateEvaluation.cost;

      const candidateInvalid =
        !Number.isFinite(candidateCost) || candidateCost === Number.POSITIVE_INFINITY;

      let accepted = false;
      let acceptanceProbability: number | undefined = undefined;

      if (candidateInvalid) {
        accepted = false;
      } else {
        const delta = candidateCost - currentCost;
        if (delta < 0) {
          accepted = true;
        } else if (delta > 0 && Number.isFinite(currentCost) && currentCost > 0) {
          acceptanceProbability = Math.exp(-delta / currentTemp);
          accepted = rng() < acceptanceProbability;
        } else {
          accepted = true;
        }
      }

      if (accepted) {
        currentLayout = candidateLayout;
        currentCost = candidateCost;

        if (candidateCost < bestCost) {
          bestLayout = {
            ...candidateLayout,
            padToVoice: { ...candidateLayout.padToVoice },
            fingerConstraints: { ...candidateLayout.fingerConstraints },
          };
          bestCost = candidateCost;
        }
      }

      // Compute per-metric sums from finger assignments
      const playableEvents = candidateEvaluation.result.fingerAssignments.filter(
        e => e.assignedHand !== 'Unplayable' && e.costBreakdown
      );

      let movementSum = 0, stretchSum = 0, driftSum = 0;
      let bounceSum = 0, fatigueSum = 0, crossoverSum = 0;

      for (const event of playableEvents) {
        if (event.costBreakdown) {
          movementSum += event.costBreakdown.movement;
          stretchSum += event.costBreakdown.stretch;
          driftSum += event.costBreakdown.drift;
          bounceSum += event.costBreakdown.bounce;
          fatigueSum += event.costBreakdown.fatigue;
          crossoverSum += event.costBreakdown.crossover;
        }
      }

      const deltaCost = candidateInvalid ? 0 : candidateCost - currentCost;

      annealingTrace.push({
        iteration: step,
        temperature: currentTemp,
        currentCost,
        bestCost,
        accepted,
        deltaCost,
        acceptanceProbability,
        movementSum,
        stretchSum,
        driftSum,
        bounceSum,
        fatigueSum,
        crossoverSum,
      });

      // Cooling
      currentTemp *= COOLING_RATE;

      // Yield to prevent UI freezing
      if (step % 50 === 0 && step > 0) {
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }

    // Store the best layout
    this.bestLayout = {
      ...bestLayout,
      padToVoice: { ...bestLayout.padToVoice },
      fingerConstraints: { ...bestLayout.fingerConstraints },
    };

    // Final high-quality evaluation on best layout
    const finalSolverConfig: SolverConfig = {
      instrumentConfig: this.instrumentConfig,
      layout: bestLayout,
      neutralPadPositionsOverride: this.neutralPadPositionsOverride,
    };

    const finalBeamSolver = createBeamSolver(finalSolverConfig);
    const finalConfig: EngineConfiguration = {
      ...config,
      beamWidth: FINAL_BEAM_WIDTH,
    };

    const finalResult = await finalBeamSolver.solve(
      performance, finalConfig, manualAssignments
    );

    return {
      ...finalResult,
      annealingTrace,
      metadata: {
        ...finalResult.metadata,
        seed: this.seed,
        objectiveTotal: finalResult.averageMetrics.total,
        objectiveComponentsSummary: finalResult.metadata?.objectiveComponentsSummary,
      },
    };
  }
}

/** Factory function to create an AnnealingSolver instance. */
export function createAnnealingSolver(config: SolverConfig): AnnealingSolver {
  return new AnnealingSolver(config);
}
