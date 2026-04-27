"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const strict_1 = __importDefault(require("node:assert/strict"));
const testkit_1 = require("./testkit");
const high_score_utils_1 = require("../src/core/high-score-utils");
(0, testkit_1.describe)('high-score sorting', () => {
    (0, testkit_1.it)('sorts by apples descending, then time to final apple ascending', () => {
        const entries = [
            {
                id: 'c',
                mapId: 'map',
                mapName: 'Map',
                playerType: 'human',
                aiStrategy: null,
                applesEaten: 8,
                totalElapsedMs: 20_000,
                averageMsPerApple: 2_500,
                finalAppleReachedMs: 18_000,
                result: 'lose',
                recordedAtIso: '2026-01-01T00:00:00.000Z'
            },
            {
                id: 'a',
                mapId: 'map',
                mapName: 'Map',
                playerType: 'ai',
                aiStrategy: 'greedy',
                applesEaten: 10,
                totalElapsedMs: 25_000,
                averageMsPerApple: 2_000,
                finalAppleReachedMs: 20_000,
                result: 'lose',
                recordedAtIso: '2026-01-01T00:00:00.000Z'
            },
            {
                id: 'b',
                mapId: 'map',
                mapName: 'Map',
                playerType: 'human',
                aiStrategy: null,
                applesEaten: 10,
                totalElapsedMs: 24_000,
                averageMsPerApple: 1_900,
                finalAppleReachedMs: 19_000,
                result: 'win',
                recordedAtIso: '2026-01-01T00:00:00.000Z'
            }
        ];
        const sorted = (0, high_score_utils_1.sortHighScores)(entries);
        strict_1.default.deepEqual(sorted.map((entry) => entry.id), ['b', 'a', 'c']);
    });
});
