/**
 * Mutation Service for Simulated Annealing Solver.
 *
 * Provides functions to mutate Layout configurations by moving or swapping
 * Voice assignments on the 8x8 grid. All mutations return new immutable objects
 * to preserve history and prevent state corruption.
 *
 * Ported from Version1/src/engine/solvers/mutationService.ts with canonical terminology:
 * - GridMapping → Layout, .cells → .padToVoice, cellKey → padKey, parseCellKey → parsePadKey
 */

import { type Layout } from '../../types/layout';
import { type PadCoord, padKey, parsePadKey } from '../../types/padGrid';

export type Rng = () => number;

/**
 * Returns a list of all 8x8 pad coordinates that do not currently have a Voice assigned.
 */
export function getEmptyPads(layout: Layout): PadCoord[] {
  const emptyPads: PadCoord[] = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const key = padKey(row, col);
      if (!(key in layout.padToVoice)) {
        emptyPads.push({ row, col });
      }
    }
  }

  return emptyPads;
}

/**
 * Gets a list of all occupied pad coordinates (pads that have a Voice assigned).
 */
function getOccupiedPads(layout: Layout): PadCoord[] {
  const occupiedPads: PadCoord[] = [];

  for (const key of Object.keys(layout.padToVoice)) {
    const coord = parsePadKey(key);
    if (coord) {
      occupiedPads.push(coord);
    }
  }

  return occupiedPads;
}

/**
 * Applies a random mutation to a Layout by either swapping two Voices
 * or moving a Voice to an empty pad.
 *
 * @param layout - The Layout to mutate
 * @param rng - Optional RNG (default Math.random). Use seeded RNG for determinism.
 */
export function applyRandomMutation(layout: Layout, rng: Rng = Math.random): Layout {
  const occupiedPads = getOccupiedPads(layout);
  const emptyPads = getEmptyPads(layout);

  if (occupiedPads.length === 0) {
    return layout;
  }

  const useSwap = rng() < 0.5;

  if (useSwap && occupiedPads.length >= 2) {
    const [pad1, pad2] = getRandomPair(occupiedPads, rng);
    return applySwapMutation(layout, pad1, pad2);
  } else if (emptyPads.length > 0) {
    const sourcePad = getRandomElement(occupiedPads, rng);
    const targetPad = getRandomElement(emptyPads, rng);
    return applyMoveMutation(layout, sourcePad, targetPad);
  } else {
    if (occupiedPads.length >= 2) {
      const [pad1, pad2] = getRandomPair(occupiedPads, rng);
      return applySwapMutation(layout, pad1, pad2);
    }
    return layout;
  }
}

/**
 * Applies a swap mutation: swaps the Voices assigned to two pads.
 */
function applySwapMutation(
  layout: Layout,
  pad1: PadCoord,
  pad2: PadCoord
): Layout {
  const key1 = padKey(pad1.row, pad1.col);
  const key2 = padKey(pad2.row, pad2.col);

  const voice1 = layout.padToVoice[key1];
  const voice2 = layout.padToVoice[key2];

  if (!voice1 || !voice2) {
    return layout;
  }

  const newPadToVoice = { ...layout.padToVoice };
  newPadToVoice[key1] = voice2;
  newPadToVoice[key2] = voice1;

  const newFingerConstraints = { ...layout.fingerConstraints };
  const constraint1 = layout.fingerConstraints[key1];
  const constraint2 = layout.fingerConstraints[key2];

  if (constraint1 !== undefined) {
    newFingerConstraints[key2] = constraint1;
  } else {
    delete newFingerConstraints[key2];
  }

  if (constraint2 !== undefined) {
    newFingerConstraints[key1] = constraint2;
  } else {
    delete newFingerConstraints[key1];
  }

  return {
    ...layout,
    padToVoice: newPadToVoice,
    fingerConstraints: newFingerConstraints,
    scoreCache: null,
  };
}

/**
 * Applies a move mutation: moves a Voice from one pad to an empty pad.
 */
function applyMoveMutation(
  layout: Layout,
  sourcePad: PadCoord,
  targetPad: PadCoord
): Layout {
  const sourceKey = padKey(sourcePad.row, sourcePad.col);
  const targetKey = padKey(targetPad.row, targetPad.col);

  const voice = layout.padToVoice[sourceKey];

  if (!voice) {
    return layout;
  }

  if (layout.padToVoice[targetKey]) {
    return layout;
  }

  const newPadToVoice = { ...layout.padToVoice };
  newPadToVoice[targetKey] = voice;
  delete newPadToVoice[sourceKey];

  const newFingerConstraints = { ...layout.fingerConstraints };
  const constraint = layout.fingerConstraints[sourceKey];

  if (constraint !== undefined) {
    newFingerConstraints[targetKey] = constraint;
    delete newFingerConstraints[sourceKey];
  } else {
    delete newFingerConstraints[targetKey];
  }

  return {
    ...layout,
    padToVoice: newPadToVoice,
    fingerConstraints: newFingerConstraints,
    scoreCache: null,
  };
}

function getRandomElement<T>(array: T[], rng: Rng = Math.random): T {
  return array[Math.floor(rng() * array.length)];
}

function getRandomPair<T>(array: T[], rng: Rng = Math.random): [T, T] {
  if (array.length < 2) {
    throw new Error('Array must have at least 2 elements to get a pair');
  }
  const index1 = Math.floor(rng() * array.length);
  let index2 = Math.floor(rng() * array.length);
  while (index2 === index1) {
    index2 = Math.floor(rng() * array.length);
  }
  return [array[index1], array[index2]];
}
