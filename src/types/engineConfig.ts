/**
 * Engine configuration types.
 *
 * Controls solver behavior, biomechanical cost parameters,
 * and objective weighting.
 */

import { type RestingPose } from './performance';
import { type InstrumentConfig } from './performance';
import { type Layout } from './layout';

/**
 * EngineConfiguration: Parameters for the beam search solver.
 */
export interface EngineConfiguration {
  /** Beam width: number of top candidates to keep at each step. */
  beamWidth: number;
  /** Stiffness (alpha): attractor force pulling hands to resting pose. 0.0-1.0. */
  stiffness: number;
  /** Home positions for left and right hands. */
  restingPose: RestingPose;
}

/**
 * Engine constants for biomechanical calculations.
 *
 * Note: finger-preference/dominance is modelled separately in costFunction.ts
 * via FINGER_DOMINANCE_COST — not here.
 */
export interface EngineConstants {
  maxSpan: number;
  minSpan: number;
  idealReach: number;
  maxReach: number;
  activationCost: number;
  crossoverPenaltyWeight: number;
  fatigueRecoveryRate?: number;
}

/** Default engine constants based on biomechanical research. */
export const DEFAULT_ENGINE_CONSTANTS: EngineConstants = {
  maxSpan: 4,
  minSpan: 0,
  idealReach: 2,
  maxReach: 4,
  activationCost: 5.0,
  crossoverPenaltyWeight: 20.0,
  fatigueRecoveryRate: 0.5,
};

/**
 * Neutral pad positions: mapping from finger IDs to pad coordinates.
 * Used by the beam solver for attractor calculations.
 */
export type NeutralPadPositions = Record<string, { row: number; col: number }>;

/**
 * Neutral hand centers: computed centroid for each hand.
 */
export interface NeutralHandCenters {
  left: { x: number; y: number } | null;
  right: { x: number; y: number } | null;
}

/**
 * SolverConfig: Configuration passed to solver factory functions.
 */
export interface SolverConfig {
  instrumentConfig: InstrumentConfig;
  layout?: Layout | null;
  engineConstants?: EngineConstants;
  neutralPadPositionsOverride?: NeutralPadPositions | null;
  mappingResolverMode?: 'strict' | 'allow-fallback';
  seed?: number;
}
