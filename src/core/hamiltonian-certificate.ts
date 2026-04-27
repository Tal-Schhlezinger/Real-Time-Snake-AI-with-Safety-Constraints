import type { CertifiedHamiltonianDebugInfo, GameState, NodeId } from './types.js';

function buildCycleIndexMap(cycle: NodeId[]): Map<NodeId, number> | null {
  const cycleIndexByNode = new Map<NodeId, number>();
  for (let index = 0; index < cycle.length; index += 1) {
    const nodeId = cycle[index]!;
    if (cycleIndexByNode.has(nodeId)) {
      return null;
    }
    cycleIndexByNode.set(nodeId, index);
  }
  return cycleIndexByNode;
}

export function cycleIndexOf(cell: NodeId, cycle: NodeId[]): number | null {
  const cycleIndexByNode = buildCycleIndexMap(cycle);
  if (!cycleIndexByNode) {
    return null;
  }
  return cycleIndexByNode.get(cell) ?? null;
}

export function distanceForwardOnCycle(from: NodeId, to: NodeId, cycle: NodeId[]): number | null {
  const cycleIndexByNode = buildCycleIndexMap(cycle);
  if (!cycleIndexByNode) {
    return null;
  }

  const fromIndex = cycleIndexByNode.get(from);
  const toIndex = cycleIndexByNode.get(to);
  if (fromIndex === undefined || toIndex === undefined) {
    return null;
  }

  return (toIndex - fromIndex + cycle.length) % cycle.length;
}

export function getCertifiedHamiltonianDebugInfo(state: GameState): CertifiedHamiltonianDebugInfo {
  const cycle = state.lockedHamiltonianCycle ?? state.map.hamiltonianCycle;
  const head = state.snake.segments[0] ?? null;
  const tail = state.snake.segments[state.snake.segments.length - 1] ?? null;
  const headIndex = head ? cycleIndexOf(head, cycle) : null;
  const tailIndex = tail ? cycleIndexOf(tail, cycle) : null;
  const appleIndex = state.appleNodeId ? cycleIndexOf(state.appleNodeId, cycle) : null;
  const distanceHeadToApple =
    head && state.appleNodeId ? distanceForwardOnCycle(head, state.appleNodeId, cycle) : null;

  return {
    headIndex,
    tailIndex,
    appleIndex,
    distanceHeadToApple,
    snakeLength: state.snake.segments.length,
    playableCellCount: state.map.graph.nodes.length,
    stepsSinceLastApple: state.stepsSinceLastApple
  };
}

export function bodyContiguous(bodySegments: NodeId[], cycle: NodeId[]): boolean {
  if (bodySegments.length === 0 || cycle.length === 0 || bodySegments.length > cycle.length) {
    return false;
  }

  const cycleIndexByNode = buildCycleIndexMap(cycle);
  if (!cycleIndexByNode) {
    return false;
  }

  const occupiedIndices = new Set<number>();
  for (const nodeId of bodySegments) {
    const cycleIndex = cycleIndexByNode.get(nodeId);
    if (cycleIndex === undefined || occupiedIndices.has(cycleIndex)) {
      return false;
    }
    occupiedIndices.add(cycleIndex);
  }

  if (occupiedIndices.size === 1 || occupiedIndices.size === cycle.length) {
    return true;
  }

  for (const startIndex of occupiedIndices) {
    let matchesRun = true;
    for (let offset = 0; offset < bodySegments.length; offset += 1) {
      const candidateIndex = (startIndex + offset) % cycle.length;
      if (!occupiedIndices.has(candidateIndex)) {
        matchesRun = false;
        break;
      }
    }
    if (matchesRun) {
      return true;
    }
  }

  return false;
}

export const BodyContiguous = bodyContiguous;

export function explainLockedCertificateFailure(bodySegments: NodeId[], cycle: NodeId[]): string | null {
  if (bodySegments.length === 0 || cycle.length === 0 || bodySegments.length > cycle.length) {
    return 'body or cycle is empty, or body is longer than the cycle';
  }

  const cycleIndexByNode = buildCycleIndexMap(cycle);
  if (!cycleIndexByNode) {
    return 'cycle contains duplicate nodes';
  }

  const occupiedNodes = new Set<NodeId>();
  for (const nodeId of bodySegments) {
    if (!cycleIndexByNode.has(nodeId) || occupiedNodes.has(nodeId)) {
      return cycleIndexByNode.has(nodeId)
        ? `body contains duplicate node ${nodeId}`
        : `body node ${nodeId} does not appear in the cycle`;
    }
    occupiedNodes.add(nodeId);
  }

  if (!bodyContiguous(bodySegments, cycle)) {
    return 'body cells do not form one contiguous circular interval on the cycle';
  }

  const head = bodySegments[0];
  if (!head || !cycleIndexByNode.has(head)) {
    return 'head is missing from the cycle';
  }

  if (bodySegments.length === 1) {
    return null;
  }

  const tail = bodySegments[bodySegments.length - 1];
  const tailToHeadDistance = tail ? distanceForwardOnCycle(tail, head, cycle) : null;
  if (!tail || tailToHeadDistance !== bodySegments.length - 1) {
    return `tail-to-head forward distance ${tailToHeadDistance ?? 'null'} does not match body length ${bodySegments.length - 1}`;
  }

  for (let index = bodySegments.length - 1; index > 0; index -= 1) {
    const fromTailTowardHead = bodySegments[index]!;
    const expectedNext = bodySegments[index - 1]!;
    const forwardDistance = distanceForwardOnCycle(fromTailTowardHead, expectedNext, cycle);
    if (forwardDistance !== 1) {
      return `physical body order breaks the locked cycle at ${fromTailTowardHead} -> ${expectedNext}`;
    }
  }

  const headIndex = cycleIndexByNode.get(head);
  if (headIndex === undefined) {
    return 'head index is missing from the cycle';
  }

  const nextAfterHead = cycle[(headIndex + 1) % cycle.length];
  if (!nextAfterHead) {
    return 'cycle successor after head is missing';
  }

  if (occupiedNodes.has(nextAfterHead) && bodySegments.length !== cycle.length) {
    return `next_on_cycle(head) = ${nextAfterHead} is still occupied by the body`;
  }

  return null;
}

export function validLockedCertificate(bodySegments: NodeId[], cycle: NodeId[]): boolean {
  return explainLockedCertificateFailure(bodySegments, cycle) === null;
}

export const ValidLockedCertificate = validLockedCertificate;

export function appleForward(bodySegments: NodeId[], apple: NodeId | null, cycle: NodeId[]): boolean {
  if (!apple) {
    return false;
  }

  if (!validLockedCertificate(bodySegments, cycle)) {
    return false;
  }

  const cycleIndexByNode = buildCycleIndexMap(cycle);
  if (!cycleIndexByNode) {
    return false;
  }

  const head = bodySegments[0];
  if (!head) {
    return false;
  }

  const headIndex = cycleIndexByNode.get(head);
  const appleIndex = cycleIndexByNode.get(apple);
  if (headIndex === undefined || appleIndex === undefined) {
    return false;
  }

  const occupiedIndices = new Set<number>();
  for (const nodeId of bodySegments) {
    const cycleIndex = cycleIndexByNode.get(nodeId);
    if (cycleIndex === undefined) {
      return false;
    }
    occupiedIndices.add(cycleIndex);
  }

  if (occupiedIndices.has(appleIndex)) {
    return false;
  }

  for (let offset = 1; offset <= cycle.length; offset += 1) {
    const currentIndex = (headIndex + offset) % cycle.length;
    if (currentIndex === appleIndex) {
      return true;
    }
    if (occupiedIndices.has(currentIndex)) {
      return false;
    }
  }

  return false;
}

export const AppleForward = appleForward;
