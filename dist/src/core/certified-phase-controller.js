export const CERTIFIED_LIBRARY_PHASE_THRESHOLD = 0.7;
export function certifiedFillRatio(state) {
    const playableCellCount = state.map.graph.nodes.length;
    if (playableCellCount === 0) {
        return 1;
    }
    return state.snake.segments.length / playableCellCount;
}
export function selectCertifiedPhase(state) {
    return certifiedFillRatio(state) < CERTIFIED_LIBRARY_PHASE_THRESHOLD ? 'library' : 'late';
}
