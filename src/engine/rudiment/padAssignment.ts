/**
 * Pad Assignment for Rudiments.
 *
 * Assigns each rudiment lane to a sensible pad on the 8x8 Push 3 grid,
 * using Pose0 anchor positions for ergonomic placement.
 */

import { type LoopLane } from '../../types/loopEditor';
import { type RudimentType, type LanePadAssignment } from '../../types/rudiment';
import { type PadCoord } from '../../types/padGrid';
import { getPreferredHand } from '../surface/handZone';

// ============================================================================
// Pose0 Pad Positions (from naturalHandPose.ts BUILT_IN_POSE0_CELLS)
// ============================================================================

/** Deterministic pad positions for common drum roles, anchored to Pose0 fingers. */
const ROLE_PAD_MAP: Record<string, PadCoord> = {
  Kick:         { row: 0, col: 3 },  // L_THUMB
  Snare:        { row: 3, col: 3 },  // L_INDEX
  'Closed Hat': { row: 4, col: 7 },  // R_PINKY
  'Open Hat':   { row: 4, col: 6 },  // R_RING
  'Tom 1':      { row: 3, col: 4 },  // R_INDEX
  'Tom 2':      { row: 4, col: 5 },  // R_MIDDLE
  Rim:          { row: 4, col: 2 },  // L_MIDDLE
  Crash:        { row: 4, col: 1 },  // L_RING
};

/**
 * For 2-lane rudiments (e.g., single/double stroke roll, six stroke roll),
 * use L_INDEX and R_INDEX positions for natural left-right alternation.
 */
const TWO_LANE_PADS: [PadCoord, PadCoord] = [
  { row: 3, col: 3 },  // L_INDEX — left surface
  { row: 3, col: 4 },  // R_INDEX — right surface
];

/**
 * For 3-lane rudiments (e.g., paradiddle, flam accent),
 * use L_INDEX, R_INDEX, and an additional pad.
 */
const THREE_LANE_PADS: [PadCoord, PadCoord, PadCoord] = [
  { row: 3, col: 3 },  // L_INDEX — primary left
  { row: 3, col: 4 },  // R_INDEX — primary right
  { row: 4, col: 5 },  // R_MIDDLE — secondary right
];

// ============================================================================
// Public API
// ============================================================================

/**
 * Assign each lane to a pad on the 8x8 grid.
 *
 * Uses rudiment-type-specific logic for 2 and 3-lane patterns,
 * falls back to role-based lookup for larger patterns (basic_groove).
 */
export function assignLanesToPads(
  lanes: LoopLane[],
  rudimentType: RudimentType,
): LanePadAssignment[] {
  const usedPads = new Set<string>();

  if (rudimentType === 'basic_groove') {
    // Full kit: use role-based mapping
    return lanes.map(lane => {
      const pad = ROLE_PAD_MAP[lane.name] ?? findOpenPad(usedPads);
      usedPads.add(`${pad.row},${pad.col}`);
      return {
        laneId: lane.id,
        laneName: lane.name,
        pad,
        preferredHand: getPreferredHand(pad),
      };
    });
  }

  // Template-based assignment for 2 and 3 lane rudiments
  const padSet = lanes.length === 2 ? TWO_LANE_PADS : THREE_LANE_PADS;

  return lanes.map((lane, i) => {
    const pad = i < padSet.length
      ? padSet[i]
      : findOpenPad(usedPads);
    usedPads.add(`${pad.row},${pad.col}`);
    return {
      laneId: lane.id,
      laneName: lane.name,
      pad,
      preferredHand: getPreferredHand(pad),
    };
  });
}

// ============================================================================
// Helpers
// ============================================================================

/** Find an open pad position that hasn't been assigned yet. */
function findOpenPad(usedPads: Set<string>): PadCoord {
  // Walk through center rows first, then outward
  const preferredRows = [3, 4, 2, 5, 1, 6, 0, 7];
  const preferredCols = [3, 4, 2, 5, 1, 6, 0, 7];
  for (const row of preferredRows) {
    for (const col of preferredCols) {
      const key = `${row},${col}`;
      if (!usedPads.has(key)) {
        return { row, col };
      }
    }
  }
  return { row: 0, col: 0 }; // Should never reach here with ≤8 lanes
}
