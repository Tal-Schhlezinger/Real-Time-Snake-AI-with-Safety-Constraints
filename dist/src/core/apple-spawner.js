export function collectSpawnableNodeIds(graph, occupied) {
    const blocked = new Set(occupied);
    return graph.nodes.map((node) => node.id).filter((nodeId) => !blocked.has(nodeId));
}
export function spawnAppleNode(graph, occupied, random = { next: () => Math.random() }) {
    const candidates = collectSpawnableNodeIds(graph, occupied);
    if (candidates.length === 0) {
        return null;
    }
    const index = Math.min(candidates.length - 1, Math.floor(random.next() * candidates.length));
    return candidates[index] ?? null;
}
