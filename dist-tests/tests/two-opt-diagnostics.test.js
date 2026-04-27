"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const ai_controller_1 = require("../src/core/ai-controller");
const default_maps_1 = require("../src/data/default-maps");
const hamiltonian_certificate_1 = require("../src/core/hamiltonian-certificate");
const game_engine_1 = require("../src/core/game-engine");
const map_validator_1 = require("../src/core/map-validator");
const rectangular_cycle_1 = require("../src/core/rectangular-cycle");
const two_opt_diagnostics_1 = require("../src/core/two-opt-diagnostics");
const helpers_1 = require("./helpers");
const ALTERNATE_RECT_4X4_CYCLE = [
    'n-0-0',
    'n-1-0',
    'n-2-0',
    'n-3-0',
    'n-3-1',
    'n-3-2',
    'n-3-3',
    'n-2-3',
    'n-2-2',
    'n-2-1',
    'n-1-1',
    'n-1-2',
    'n-1-3',
    'n-0-3',
    'n-0-2',
    'n-0-1'
];
class InjectedTwoOptAnalyzer extends two_opt_diagnostics_1.TwoOptDiagnosticAnalyzer {
    injectedAttempts;
    constructor(injectedAttempts, options = {}) {
        super(options);
        this.injectedAttempts = injectedAttempts;
    }
    generateCandidateAttempts() {
        return this.injectedAttempts.map((attempt) => ({
            candidate: attempt.candidate ? [...attempt.candidate] : null,
            replacementEdgesMissing: attempt.replacementEdgesMissing,
            edgePairIndices: { ...attempt.edgePairIndices },
            reconnectMode: attempt.reconnectMode,
            intendedReplacementEdges: attempt.intendedReplacementEdges.map((edge) => ({ ...edge })),
            allIntendedReplacementEdgesExist: attempt.allIntendedReplacementEdgesExist,
            layout: attempt.layout
                ? {
                    replacementSeamIndices: [...attempt.layout.replacementSeamIndices],
                    internalReversalEdgeIndices: [...attempt.layout.internalReversalEdgeIndices],
                    wraparoundEdgeIndex: attempt.layout.wraparoundEdgeIndex
                }
                : null
        }));
    }
}
function makeInjectedAttempt(candidate, overrides = {}) {
    const cycleLength = candidate?.length ?? 16;
    return {
        candidate,
        replacementEdgesMissing: overrides.replacementEdgesMissing ?? false,
        edgePairIndices: overrides.edgePairIndices ?? { firstIndex: 0, secondIndex: 5 },
        reconnectMode: overrides.reconnectMode ?? 'ac-bd',
        intendedReplacementEdges: overrides.intendedReplacementEdges ?? [
            { from: 'n-0-0', to: 'n-1-0' },
            { from: 'n-2-0', to: 'n-3-0' }
        ],
        allIntendedReplacementEdgesExist: overrides.allIntendedReplacementEdgesExist ?? true,
        layout: overrides.layout ?? {
            replacementSeamIndices: [0, 5],
            internalReversalEdgeIndices: [1, 2, 3, 4],
            wraparoundEdgeIndex: cycleLength - 1
        }
    };
}
function cycleHasDirectedEdge(cycle, from, to) {
    return cycle.some((nodeId, index) => nodeId === from && cycle[(index + 1) % cycle.length] === to);
}
(0, testkit_1.describe)('Two-opt diagnostics', () => {
    (0, testkit_1.it)('constructs an ac-bd candidate with the intended replacement seams', () => {
        const construction = (0, two_opt_diagnostics_1.constructTwoOptCandidate)(['a', 'b', 'c', 'd', 'e', 'f'], { firstIndex: 0, secondIndex: 3 }, 'ac-bd');
        strict_1.default.ok(construction);
        strict_1.default.equal(construction.candidate.length, 6);
        strict_1.default.equal(new Set(construction.candidate).size, 6);
        strict_1.default.deepEqual(new Set(construction.candidate), new Set(['a', 'b', 'c', 'd', 'e', 'f']));
        strict_1.default.equal(cycleHasDirectedEdge(construction.candidate, 'a', 'd'), true);
        strict_1.default.equal(cycleHasDirectedEdge(construction.candidate, 'b', 'e'), true);
        strict_1.default.equal(cycleHasDirectedEdge(construction.candidate, 'a', 'b'), false);
        strict_1.default.equal(cycleHasDirectedEdge(construction.candidate, 'd', 'e'), false);
    });
    (0, testkit_1.it)('does not assemble an ad-bc subtour split as a raw candidate', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const construction = (0, two_opt_diagnostics_1.constructTwoOptCandidate)(map.hamiltonianCycle, { firstIndex: 1, secondIndex: 5 }, 'ad-bc');
        strict_1.default.equal(construction, null);
    });
    (0, testkit_1.it)('diagnostics run without changing the locked cycle', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const originalLockedCycle = [...state.lockedHamiltonianCycle];
        const analyzer = new two_opt_diagnostics_1.TwoOptDiagnosticAnalyzer({ exhaustive: true, maxPairsChecked: 64, searchNeighborhood: null });
        analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.deepEqual(state.lockedHamiltonianCycle, originalLockedCycle);
    });
    (0, testkit_1.it)('missing replacement edges are counted', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const analyzer = new two_opt_diagnostics_1.TwoOptDiagnosticAnalyzer({ exhaustive: true, maxPairsChecked: 64, searchNeighborhood: null });
        const result = analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.ok(result.diagnostics.replacementEdgesMissing > 0);
    });
    (0, testkit_1.it)('duplicate candidates are counted', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const analyzer = new InjectedTwoOptAnalyzer([
            makeInjectedAttempt(ALTERNATE_RECT_4X4_CYCLE),
            makeInjectedAttempt(ALTERNATE_RECT_4X4_CYCLE)
        ]);
        const result = analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.equal(result.diagnostics.duplicateCandidatesSkipped, 1);
        strict_1.default.equal(result.diagnostics.validCandidates, 1);
    });
    (0, testkit_1.it)('graph-invalid candidates are counted', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const analyzer = new InjectedTwoOptAnalyzer([makeInjectedAttempt([...map.hamiltonianCycle.slice(0, -1)])]);
        const result = analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.equal(result.diagnostics.graphInvalidCandidates, 1);
    });
    (0, testkit_1.it)('valid candidates are counted on a controlled setup', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const analyzer = new InjectedTwoOptAnalyzer([makeInjectedAttempt(ALTERNATE_RECT_4X4_CYCLE)]);
        const result = analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.equal((0, map_validator_1.validateHamiltonianCycle)(map.graph, ALTERNATE_RECT_4X4_CYCLE), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.bodyContiguous)(state.snake.segments, ALTERNATE_RECT_4X4_CYCLE), true);
        strict_1.default.equal((0, hamiltonian_certificate_1.appleForward)(state.snake.segments, state.appleNodeId, ALTERNATE_RECT_4X4_CYCLE), true);
        strict_1.default.equal(result.diagnostics.validCandidates, 1);
        strict_1.default.equal(result.diagnostics.improvingCandidates, 1);
        strict_1.default.deepEqual(result.bestCandidate, ALTERNATE_RECT_4X4_CYCLE);
    });
    (0, testkit_1.it)('budget exhaustion is reported', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 6, height: 6 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[17]
        });
        const analyzer = new two_opt_diagnostics_1.TwoOptDiagnosticAnalyzer({ maxPairsChecked: 0, searchNeighborhood: null });
        const result = analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.equal(result.diagnostics.budgetExhausted, true);
    });
    (0, testkit_1.it)('candidate with duplicate nodes is categorized as duplicate failure', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const duplicateCandidate = [...map.hamiltonianCycle];
        duplicateCandidate[duplicateCandidate.length - 1] = duplicateCandidate[0];
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const analyzer = new InjectedTwoOptAnalyzer([makeInjectedAttempt(duplicateCandidate)]);
        const result = analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.equal(result.invalidCandidateDetails[0]?.failureCategory, 'duplicates');
        strict_1.default.equal(result.invalidCandidateDetails[0]?.duplicateNodeCount, 1);
    });
    (0, testkit_1.it)('candidate with missing nodes is categorized as missing failure', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const missingNodeCandidate = [...map.hamiltonianCycle];
        missingNodeCandidate[missingNodeCandidate.length - 1] = 'ghost-node';
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const analyzer = new InjectedTwoOptAnalyzer([makeInjectedAttempt(missingNodeCandidate)]);
        const result = analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.equal(result.invalidCandidateDetails[0]?.failureCategory, 'missing-nodes');
        strict_1.default.equal(result.invalidCandidateDetails[0]?.missingNodeCount, 1);
    });
    (0, testkit_1.it)('candidate with bad replacement seam is categorized correctly', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const candidate = [
            map.hamiltonianCycle[0],
            map.hamiltonianCycle[5],
            map.hamiltonianCycle[4],
            map.hamiltonianCycle[3],
            map.hamiltonianCycle[2],
            map.hamiltonianCycle[1],
            ...map.hamiltonianCycle.slice(6)
        ];
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const analyzer = new InjectedTwoOptAnalyzer([
            makeInjectedAttempt(candidate, {
                intendedReplacementEdges: [
                    { from: map.hamiltonianCycle[0], to: map.hamiltonianCycle[5] },
                    { from: map.hamiltonianCycle[1], to: map.hamiltonianCycle[6] }
                ],
                layout: {
                    replacementSeamIndices: [0, 5],
                    internalReversalEdgeIndices: [1, 2, 3, 4],
                    wraparoundEdgeIndex: candidate.length - 1
                }
            })
        ]);
        const result = analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.equal(result.invalidCandidateDetails[0]?.failureCategory, 'bad-replacement-seam');
        strict_1.default.equal(result.invalidCandidateDetails[0]?.firstInvalidEdgeLocation, 'replacement-seam');
    });
    (0, testkit_1.it)('candidate with bad internal reversal is categorized correctly', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const candidate = [
            map.hamiltonianCycle[0],
            map.hamiltonianCycle[1],
            map.hamiltonianCycle[10],
            map.hamiltonianCycle[2],
            map.hamiltonianCycle[3],
            map.hamiltonianCycle[4],
            map.hamiltonianCycle[5],
            map.hamiltonianCycle[6],
            map.hamiltonianCycle[7],
            map.hamiltonianCycle[8],
            map.hamiltonianCycle[9],
            map.hamiltonianCycle[11],
            map.hamiltonianCycle[12],
            map.hamiltonianCycle[13],
            map.hamiltonianCycle[14],
            map.hamiltonianCycle[15]
        ];
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const analyzer = new InjectedTwoOptAnalyzer([makeInjectedAttempt(candidate)]);
        const result = analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.equal(result.invalidCandidateDetails[0]?.failureCategory, 'bad-internal-reversal');
        strict_1.default.equal(result.invalidCandidateDetails[0]?.firstInvalidEdgeLocation, 'internal-reversal');
    });
    (0, testkit_1.it)('candidate with bad wraparound seam is categorized correctly', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const wraparoundBadCandidate = [
            'n-0-0',
            'n-1-0',
            'n-2-0',
            'n-3-0',
            'n-3-1',
            'n-2-1',
            'n-1-1',
            'n-0-1',
            'n-0-2',
            'n-1-2',
            'n-2-2',
            'n-3-2',
            'n-3-3',
            'n-2-3',
            'n-1-3',
            'n-0-3'
        ];
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const analyzer = new InjectedTwoOptAnalyzer([
            makeInjectedAttempt(wraparoundBadCandidate, {
                layout: {
                    replacementSeamIndices: [0, 5],
                    internalReversalEdgeIndices: [1, 2, 3, 4],
                    wraparoundEdgeIndex: wraparoundBadCandidate.length - 1
                }
            })
        ]);
        const result = analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.equal(result.invalidCandidateDetails[0]?.failureCategory, 'bad-wraparound');
        strict_1.default.equal(result.invalidCandidateDetails[0]?.firstInvalidEdgeLocation, 'wraparound');
    });
    (0, testkit_1.it)('certified-hamiltonian behavior remains unchanged', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const analyzer = new two_opt_diagnostics_1.TwoOptDiagnosticAnalyzer({ exhaustive: true, maxPairsChecked: 64, searchNeighborhood: null });
        analyzer.analyze(state, map.hamiltonianCycle);
        const decision = (0, ai_controller_1.decideAiMove)(state, 'certified-hamiltonian');
        const nextState = (0, game_engine_1.advanceGame)(state, decision.direction, 0, { next: () => 0 });
        strict_1.default.equal(nextState.snake.segments[0], map.hamiltonianCycle[1]);
    });
    (0, testkit_1.it)('4x4 exhaustive diagnostics are deterministic', () => {
        const map = (0, rectangular_cycle_1.createRectangularSavedMap)({ id: 'rect', name: 'Rect', width: 4, height: 4 });
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[9]
        });
        const analyzer = new two_opt_diagnostics_1.TwoOptDiagnosticAnalyzer({ exhaustive: true, maxPairsChecked: 256, searchNeighborhood: null });
        const result = analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.equal(result.diagnostics.edgePairsConsidered, 104);
        strict_1.default.equal(result.diagnostics.replacementPairsConsidered, 208);
        strict_1.default.equal(result.diagnostics.rawCandidatesGenerated, 0);
        strict_1.default.equal(result.diagnostics.graphInvalidCandidates, 0);
        strict_1.default.equal(result.diagnostics.invalidDueToBadReplacementSeam, 0);
        strict_1.default.equal(result.invalidCandidateDetails.length, 0);
    });
    (0, testkit_1.it)('supports default maps in diagnostics-only mode', () => {
        const map = (0, default_maps_1.createDefaultMaps)()[0];
        const midpoint = Math.floor(map.hamiltonianCycle.length / 2);
        const state = (0, helpers_1.makeGameState)({
            map,
            mode: 'ai',
            aiStrategy: 'certified-hamiltonian',
            lockedHamiltonianCycle: [...map.hamiltonianCycle],
            snake: {
                segments: [map.hamiltonianCycle[0]],
                direction: 'right',
                pendingGrowth: 0
            },
            appleNodeId: map.hamiltonianCycle[midpoint]
        });
        const analyzer = new two_opt_diagnostics_1.TwoOptDiagnosticAnalyzer({ maxPairsChecked: 8, searchNeighborhood: 3 });
        const result = analyzer.analyze(state, map.hamiltonianCycle);
        strict_1.default.equal(result.diagnostics.edgePairsConsidered, 8);
    });
});
