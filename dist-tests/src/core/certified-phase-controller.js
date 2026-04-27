"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CERTIFIED_LIBRARY_PHASE_THRESHOLD = void 0;
exports.certifiedFillRatio = certifiedFillRatio;
exports.selectCertifiedPhase = selectCertifiedPhase;
exports.CERTIFIED_LIBRARY_PHASE_THRESHOLD = 0.7;
function certifiedFillRatio(state) {
    const playableCellCount = state.map.graph.nodes.length;
    if (playableCellCount === 0) {
        return 1;
    }
    return state.snake.segments.length / playableCellCount;
}
function selectCertifiedPhase(state) {
    return certifiedFillRatio(state) < exports.CERTIFIED_LIBRARY_PHASE_THRESHOLD ? 'library' : 'late';
}
