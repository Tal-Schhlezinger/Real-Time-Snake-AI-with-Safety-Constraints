import type { GraphSnapshot, NodeId } from './types.js';

export interface RandomSource {
  next(): number;
}

export function collectSpawnableNodeIds(graph: GraphSnapshot, occupied: Iterable<NodeId>): NodeId[] {
  const blocked = new Set(occupied);
  return graph.nodes.map((node) => node.id).filter((nodeId) => !blocked.has(nodeId));
}

export function spawnAppleNode(
  graph: GraphSnapshot,
  occupied: Iterable<NodeId>,
  random: RandomSource = { next: () => Math.random() }
): NodeId | null {
  const candidates = collectSpawnableNodeIds(graph, occupied);
  if (candidates.length === 0) {
    return null;
  }
  const index = Math.min(candidates.length - 1, Math.floor(random.next() * candidates.length));
  return candidates[index] ?? null;
}
