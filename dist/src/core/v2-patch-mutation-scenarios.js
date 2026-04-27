import { distanceForwardOnCycle } from './hamiltonian-certificate.js';
import { classifyV2FourExitSpliceCandidatesForSnake, classifyGeneratedV2FourExitSpliceCandidatesForSnake, generateV2FourExitSpliceCandidates } from './multi-terminal-patch-diagnostics.js';
import { createPatchMutationScenarioStates } from './patch-mutation-scenarios.js';
const DEFAULT_SEED_VALUES = [0, 0.23, 0.47, 0.71];
const DEFAULT_MID_GAME_FILL_RATIOS = [0.1, 0.25, 0.4];
const DEFAULT_TOP_CANDIDATE_COUNT = 5;
export function analyzeV2PatchMutationScenarios(map, options = {}) {
    const seedValues = options.seedValues ?? DEFAULT_SEED_VALUES;
    const midGameFillRatios = options.midGameFillRatios ?? DEFAULT_MID_GAME_FILL_RATIOS;
    const topCandidateCount = options.topCandidateCount ?? DEFAULT_TOP_CANDIDATE_COUNT;
    const scenarios = createPatchMutationScenarioStates(map, {
        ...options,
        seedValues,
        midGameFillRatios,
        topCandidateCount
    });
    const spliceDiagnostics = generateV2FourExitSpliceCandidates(map.graph, map.hamiltonianCycle, options);
    return {
        mapId: map.id,
        mapName: map.name,
        boardSize: `${map.width}x${map.height}`,
        options: {
            seedValues,
            midGameFillRatios,
            topCandidateCount
        },
        scenarios: scenarios.map((scenario) => analyzeV2PatchMutationScenarioWithGeneratedCandidates(scenario, spliceDiagnostics, {
            ...options,
            topCandidateCount
        }))
    };
}
export function analyzeV2PatchMutationScenario(scenario, options = {}) {
    const topCandidateCount = options.topCandidateCount ?? DEFAULT_TOP_CANDIDATE_COUNT;
    const state = scenario.state;
    const lockedCycle = getLockedCycle(state);
    const diagnostics = classifyV2FourExitSpliceCandidatesForSnake(state, state.map.graph, lockedCycle, options);
    return summarizeScenario(scenario, diagnostics, topCandidateCount);
}
export function analyzeV2PatchMutationScenarioWithGeneratedCandidates(scenario, spliceDiagnostics, options = {}) {
    const topCandidateCount = options.topCandidateCount ?? DEFAULT_TOP_CANDIDATE_COUNT;
    const state = scenario.state;
    const lockedCycle = getLockedCycle(state);
    const diagnostics = classifyGeneratedV2FourExitSpliceCandidatesForSnake(state, spliceDiagnostics.candidates, lockedCycle, options);
    return summarizeScenario(scenario, diagnostics, topCandidateCount);
}
function summarizeScenario(scenario, diagnostics, topCandidateCount) {
    const state = scenario.state;
    const lockedCycle = getLockedCycle(state);
    const bestRanked = diagnostics.rankedCandidates[0] ?? null;
    return {
        scenarioId: scenario.scenarioId,
        kind: scenario.kind,
        description: scenario.description,
        seedValue: scenario.seedValue,
        targetFillRatio: scenario.targetFillRatio,
        boardSize: `${state.map.width}x${state.map.height}`,
        snakeLength: state.snake.segments.length,
        fillRatio: state.snake.segments.length / state.map.graph.nodes.length,
        head: state.snake.segments[0] ?? null,
        tail: state.snake.segments[state.snake.segments.length - 1] ?? null,
        apple: state.appleNodeId,
        applesEaten: state.applesEaten,
        simulationSteps: scenario.simulationSteps,
        currentLockedCyclePathLen: currentLockedCyclePathLen(state, lockedCycle),
        v2GraphValidCandidates: diagnostics.aggregate.graphValidCandidates,
        v2SnakeUsableCandidates: diagnostics.aggregate.snakeUsableCandidates,
        immediateLockedCandidates: diagnostics.aggregate.immediateLockedCandidates,
        transitionReachableCandidates: diagnostics.aggregate.transitionReachableCandidates,
        improvingCandidates: diagnostics.aggregate.improvingCandidates,
        bestImprovement: diagnostics.aggregate.bestImprovement,
        bestCandidateMode: bestRanked?.features.usabilityMode ?? null,
        bestMutationRectangle: bestRanked?.candidate.rect ?? null,
        changedCycleEdges: bestRanked?.features.changedCycleEdges ?? null,
        topCandidates: summarizeTopCandidates(diagnostics, topCandidateCount)
    };
}
function summarizeTopCandidates(diagnostics, topCandidateCount) {
    return diagnostics.rankedCandidates.slice(0, topCandidateCount).map(summarizeRankedCandidate);
}
function summarizeRankedCandidate(rankedCandidate) {
    return {
        candidateId: rankedCandidate.features.candidateId,
        patchId: rankedCandidate.features.patchId,
        usabilityMode: rankedCandidate.features.usabilityMode,
        currentLockedCyclePathLen: rankedCandidate.features.currentLockedCyclePathLen,
        candidatePathLenToApple: rankedCandidate.features.candidatePathLenToApple,
        transitionPathLength: rankedCandidate.features.transitionPathLength,
        pathLenImprovement: rankedCandidate.features.pathLenImprovement,
        finalV2MutationScore: rankedCandidate.features.finalV2MutationScore,
        changedCycleEdges: rankedCandidate.features.changedCycleEdges,
        rectangleArea: rankedCandidate.features.rectangleArea,
        rect: rankedCandidate.candidate.rect,
        reason: rankedCandidate.classification.reason
    };
}
function currentLockedCyclePathLen(state, cycle) {
    const head = state.snake.segments[0] ?? null;
    if (!head || !state.appleNodeId) {
        return null;
    }
    return distanceForwardOnCycle(head, state.appleNodeId, cycle);
}
function getLockedCycle(state) {
    return state.lockedHamiltonianCycle ?? state.map.hamiltonianCycle;
}
