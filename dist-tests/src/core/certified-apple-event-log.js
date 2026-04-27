"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderBoard = renderBoard;
exports.renderCycleOverlay = renderCycleOverlay;
exports.collectCertifiedAppleEventLog = collectCertifiedAppleEventLog;
exports.formatCertifiedAppleEventLog = formatCertifiedAppleEventLog;
const coords_js_1 = require("./coords.js");
const ai_controller_js_1 = require("./ai-controller.js");
const certified_cycle_controller_js_1 = require("./certified-cycle-controller.js");
const cycle_library_js_1 = require("./cycle-library.js");
const game_engine_js_1 = require("./game-engine.js");
const game_state_js_1 = require("./game-state.js");
const hamiltonian_certificate_js_1 = require("./hamiltonian-certificate.js");
const cycle_scoring_js_1 = require("./cycle-scoring.js");
const map_validator_js_1 = require("./map-validator.js");
function formatCoord(nodeId) {
    if (!nodeId) {
        return null;
    }
    const coord = (0, coords_js_1.coordFromNodeId)(nodeId);
    return `(${coord.x},${coord.y})`;
}
function cycleGlyph(index) {
    const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    return alphabet[index % alphabet.length] ?? '?';
}
function renderBoard(state) {
    const occupied = new Set(state.snake.segments);
    const head = state.snake.segments[0] ?? null;
    const tail = state.snake.segments[state.snake.segments.length - 1] ?? null;
    const walls = new Set(state.map.walls.map((wall) => `${wall.x},${wall.y}`));
    const lines = [];
    for (let y = 0; y < state.map.height; y += 1) {
        let line = '';
        for (let x = 0; x < state.map.width; x += 1) {
            const nodeId = `n-${x}-${y}`;
            const wallKey = `${x},${y}`;
            if (walls.has(wallKey)) {
                line += '#';
            }
            else if (head === nodeId) {
                line += 'H';
            }
            else if (tail === nodeId) {
                line += 'T';
            }
            else if (occupied.has(nodeId)) {
                line += 'B';
            }
            else if (state.appleNodeId === nodeId) {
                line += 'A';
            }
            else {
                line += '.';
            }
        }
        lines.push(line);
    }
    return lines.join('\n');
}
function renderCycleOverlay(state, cycle = (0, certified_cycle_controller_js_1.getCertifiedLockedCycle)(state)) {
    const indexByNode = new Map();
    for (let index = 0; index < cycle.length; index += 1) {
        indexByNode.set(cycle[index], index);
    }
    const lines = [];
    for (let y = 0; y < state.map.height; y += 1) {
        let line = '';
        for (let x = 0; x < state.map.width; x += 1) {
            const nodeId = `n-${x}-${y}`;
            const index = indexByNode.get(nodeId);
            line += index === undefined ? '#' : cycleGlyph(index);
        }
        lines.push(line);
    }
    return lines.join('\n');
}
function collectCertifiedAppleEventLog(map, options = {}) {
    const appleLimit = options.appleLimit ?? 8;
    const library = (0, cycle_library_js_1.generateDiverseHamiltonianCycles)(map);
    let state = (0, game_state_js_1.createInitialGameState)(map, 'ai', 'certified-hamiltonian', { next: () => 0 });
    let steps = 0;
    const events = [];
    const maxSteps = map.graph.nodes.length * Math.max(appleLimit, 1) * 4;
    while (!state.isOver && state.applesEaten < appleLimit && steps < maxSteps) {
        const decision = (0, ai_controller_js_1.decideAiMove)(state, 'certified-hamiltonian');
        if (!decision) {
            break;
        }
        const advancedState = (0, game_engine_js_1.advanceGame)(state, decision.direction, 0, { next: () => 0 });
        steps += 1;
        if (advancedState.applesEaten > state.applesEaten) {
            const oldCycle = (0, certified_cycle_controller_js_1.getCertifiedLockedCycle)(state);
            const stateOnOldCycle = {
                ...advancedState,
                lockedHamiltonianCycle: [...oldCycle],
                lockedHamiltonianCycleId: state.lockedHamiltonianCycleId
            };
            const oldCycleGraphValid = (0, map_validator_js_1.validateHamiltonianCycle)(map.graph, oldCycle);
            const oldCycleLockedCertificateFailure = (0, hamiltonian_certificate_js_1.explainLockedCertificateFailure)(stateOnOldCycle.snake.segments, oldCycle);
            const oldCycleLockedCertificateValid = oldCycleLockedCertificateFailure === null;
            const oldCycleAppleForwardValid = stateOnOldCycle.appleNodeId === null
                ? null
                : (0, hamiltonian_certificate_js_1.appleForward)(stateOnOldCycle.snake.segments, stateOnOldCycle.appleNodeId, oldCycle);
            const candidateEvaluation = stateOnOldCycle.appleNodeId === null || library.status !== 'ready'
                ? null
                : (0, certified_cycle_controller_js_1.debugCertifiedSwitchSelection)(stateOnOldCycle, library);
            const transitioned = (0, certified_cycle_controller_js_1.applyCertifiedPostAppleTransition)({
                previousState: state,
                nextState: advancedState,
                cycleLibrary: library
            });
            const currentFeatures = (0, cycle_scoring_js_1.computeCycleFeatures)(stateOnOldCycle, oldCycle, oldCycle);
            const currentScore = (0, cycle_scoring_js_1.scoreCycleFeatures)(currentFeatures, cycle_scoring_js_1.defaultCycleScoreWeights);
            events.push({
                beforeApple: {
                    stepNumber: steps,
                    applesEatenBefore: state.applesEaten,
                    currentLockedCycleId: state.lockedHamiltonianCycleId,
                    headPosition: formatCoord(state.snake.segments[0] ?? null),
                    tailPosition: formatCoord(state.snake.segments[state.snake.segments.length - 1] ?? null),
                    applePosition: formatCoord(state.appleNodeId),
                    snakeLength: state.snake.segments.length,
                    pathLenOnCurrentCycle: (0, certified_cycle_controller_js_1.currentCyclePathLen)(state),
                    boardRendering: renderBoard(state)
                },
                afterApple: {
                    applesEatenAfter: advancedState.applesEaten,
                    newApplePosition: formatCoord(advancedState.appleNodeId),
                    snakeLength: advancedState.snake.segments.length,
                    currentLockedCycleIdBeforeSelection: state.lockedHamiltonianCycleId,
                    oldCycleGraphValid,
                    oldCycleLockedCertificateValid,
                    oldCycleLockedCertificateFailure,
                    oldCycleAppleForwardValid,
                    boardRendering: renderBoard(stateOnOldCycle)
                },
                candidateEvaluation: candidateEvaluation
                    ? {
                        ...candidateEvaluation,
                        currentCycleScore: currentScore
                    }
                    : null,
                finalSelection: {
                    selectedCycleId: candidateEvaluation?.selectedCycleId ?? null,
                    finalReason: candidateEvaluation?.finalDecisionReason ?? 'old cycle kept',
                    newLockedCycleId: transitioned.lockedHamiltonianCycleId,
                    boardRendering: renderBoard(transitioned),
                    cycleOverlay: renderCycleOverlay(transitioned)
                }
            });
            state = transitioned;
            continue;
        }
        state = (0, certified_cycle_controller_js_1.applyCertifiedPostAppleTransition)({
            previousState: state,
            nextState: advancedState,
            cycleLibrary: library
        });
    }
    return {
        mapId: map.id,
        mapName: map.name,
        size: `${map.width}x${map.height}`,
        libraryStatus: library.status,
        events,
        finalStateSummary: {
            applesEaten: state.applesEaten,
            steps,
            outcome: state.outcome,
            lockedCycleId: state.lockedHamiltonianCycleId
        }
    };
}
function formatCertifiedAppleEventLog(report) {
    const lines = [];
    lines.push(`=== ${report.mapName} (${report.size}) ===`);
    lines.push(`libraryStatus=${report.libraryStatus}`);
    for (const event of report.events) {
        lines.push('');
        lines.push(`-- Apple Event ${event.afterApple.applesEatenAfter} --`);
        lines.push(`before: step=${event.beforeApple.stepNumber} applesBefore=${event.beforeApple.applesEatenBefore} locked=${event.beforeApple.currentLockedCycleId ?? 'base'} head=${event.beforeApple.headPosition ?? '-'} tail=${event.beforeApple.tailPosition ?? '-'} apple=${event.beforeApple.applePosition ?? '-'} length=${event.beforeApple.snakeLength} pathLen=${event.beforeApple.pathLenOnCurrentCycle ?? 'null'}`);
        lines.push(event.beforeApple.boardRendering);
        lines.push(`after: applesAfter=${event.afterApple.applesEatenAfter} newApple=${event.afterApple.newApplePosition ?? '-'} length=${event.afterApple.snakeLength} lockedBeforeSelection=${event.afterApple.currentLockedCycleIdBeforeSelection ?? 'base'} graphValid=${event.afterApple.oldCycleGraphValid} lockedCert=${event.afterApple.oldCycleLockedCertificateValid} appleForward=${event.afterApple.oldCycleAppleForwardValid ?? 'null'}`);
        if (event.afterApple.oldCycleLockedCertificateFailure) {
            lines.push(`oldCycleLockedCertificateFailure=${event.afterApple.oldCycleLockedCertificateFailure}`);
        }
        lines.push(event.afterApple.boardRendering);
        if (event.candidateEvaluation) {
            lines.push(`selection: currentLocked=${event.candidateEvaluation.currentLockedCycleId ?? 'base'} currentPathLen=${event.candidateEvaluation.currentCyclePathLen ?? 'null'} currentScore=${event.candidateEvaluation.currentCycleScore ?? 'null'} finalReason=${event.candidateEvaluation.finalDecisionReason}`);
            for (const candidate of event.candidateEvaluation.candidates) {
                lines.push(`candidate ${candidate.candidateId} [${candidate.source}/${candidate.archetypeName}] pathLen=${candidate.pathLen ?? 'null'} score=${candidate.score ?? 'null'} graphValid=${candidate.graphValid} lockedCert=${candidate.lockedCertificateValid} appleForward=${candidate.appleForwardValid ?? 'null'} pathLenDelta=${candidate.pathLenDelta ?? 'null'} scoreDelta=${candidate.scoreDelta ?? 'null'} decision=${candidate.finalDecision}`);
                if (candidate.lockedCertificateFailure) {
                    lines.push(`  lockedCertificateFailure=${candidate.lockedCertificateFailure}`);
                }
            }
        }
        lines.push(`final: selected=${event.finalSelection.selectedCycleId ?? 'old cycle kept'} reason=${event.finalSelection.finalReason} newLocked=${event.finalSelection.newLockedCycleId ?? 'base'}`);
        lines.push(event.finalSelection.boardRendering);
        lines.push(event.finalSelection.cycleOverlay);
    }
    lines.push('');
    lines.push(`summary: apples=${report.finalStateSummary.applesEaten} steps=${report.finalStateSummary.steps} outcome=${report.finalStateSummary.outcome ?? 'in-progress'} locked=${report.finalStateSummary.lockedCycleId ?? 'base'}`);
    return lines.join('\n');
}
