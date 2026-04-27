import assert from 'node:assert/strict';
import { describe, it } from './testkit';
import { sortHighScores } from '../src/core/high-score-utils';
import type { HighScoreEntry } from '../src/core/types';

describe('high-score sorting', () => {
  it('sorts by apples descending, then time to final apple ascending', () => {
    const entries: HighScoreEntry[] = [
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

    const sorted = sortHighScores(entries);

    assert.deepEqual(sorted.map((entry) => entry.id), ['b', 'a', 'c']);
  });
});
