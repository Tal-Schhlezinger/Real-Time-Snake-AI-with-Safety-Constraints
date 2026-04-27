# Snake Hamiltonian

A polished Snake game built with TypeScript, HTML, and CSS. It includes:

- Human play
- AI play with two strategies
- Walls and portals
- A map designer
- Saved maps in JSON-backed local storage
- Per-map high scores
- Real graph-based map validation with exact Hamiltonian-cycle search

## Run Locally

1. Install dependencies:

```bash
npm install
```

2. Build and serve the game locally:

```bash
npm run dev
```

3. Open `http://localhost:4173`

Useful extra commands:

```bash
npm test
npm run build
npm run preview
```

`npm run build` writes the runnable site to `dist/`.

## Controls

Human mode:

- `Arrow keys` or `WASD`: move
- `P`: pause / resume
- `R`: restart the current run

The in-game HUD also has pause, restart, and menu buttons.

## Main Features

### Human Mode

Choose a saved map and play normally with keyboard controls.

### AI Mode

Choose between:

- `Safe Hamiltonian`: follows the saved Hamiltonian cycle for the current legal map
- `Greedy + safe fallback`: uses pathfinding toward apples, checks for obvious traps, and falls back to Hamiltonian movement when needed

Optional overlays can show the saved cycle and the AI plan.

### Walls

- Walls are visible in both play mode and design mode
- Hitting a wall loses the game
- Walls are excluded from the playable graph

### Portals

- Portals are placed in linked pairs
- Entering a portal teleports the snake through the paired portal and continues in the same direction
- If the destination after teleporting is invalid, the snake loses
- Apples do not spawn on portal tiles
- Portal movement is part of the graph used by AI and validation

## Map Designer

Use the designer to:

- Create a new map with custom width and height
- Place walls
- Place portal pairs
- Set the snake spawn point
- Load, rename, overwrite, and delete saved maps
- Toggle graph, portal-link, and Hamiltonian overlays

Tool behavior:

- `Wall`: place/remove walls
- `Erase`: remove walls, portals, or the spawn point
- `Spawn`: place the snake start on a normal playable tile
- `Portal`: click one empty tile, then a second empty tile to create a pair

The designer validates in a background worker and shows `Legal`, `Illegal`, `Validating...`, `Timed out`, or `Cancelled`.

## Hamiltonian Validation, Simply Explained

Every playable map must contain a Hamiltonian cycle before it can be saved.

A Hamiltonian cycle is a loop that:

- visits every playable node exactly once
- returns to the start
- uses only legal movement edges

This project does not fake that check. Validation does:

1. Build the authoritative movement graph from the grid, walls, and portals
2. Reject obvious bad maps quickly
3. Run an exact backtracking solver with pruning
4. Save the found cycle with the map only if the cycle is valid

Fast rejections include:

- missing snake spawn
- invalid portal exits
- disconnected playable graph
- dead-end cells
- bridge / cut-edge detection
- insufficient directed movement degree

If validation times out or is cancelled, the map remains illegal and cannot be saved.

## High Scores

Scores are saved per map in local storage.

Each score records:

- map id and map name
- Human or AI
- AI strategy, when relevant
- apples eaten
- total elapsed time
- average time per apple
- time when the final apple count was reached
- win / lose result
- run timestamp

Sorting rules:

1. More apples is better
2. For equal apple counts, lower `time to final apple count` ranks higher

You can filter the score view by `All`, `Human`, or `AI`.

## Win / Lose Rules

You lose if:

- the snake hits itself
- the snake hits a wall
- the snake moves out of bounds
- a portal move ends in an invalid destination
- no valid next move exists when one is required

You win only after:

1. filling the entire playable graph
2. then surviving one more legal move

That extra final move is implemented intentionally and covered by tests.

## Project Structure

Core gameplay and validation live in `src/core/`.

Important modules include:

- `types.ts`
- `graph.ts`
- `map-validator.ts`
- `hamiltonian-cycle-solver.ts`
- `game-engine.ts`
- `apple-spawner.ts`
- `snake.ts`
- `ai-controller.ts`
- `high-score-utils.ts`

Browser/UI code lives in:

- `src/ui/`
- `src/storage/`
- `src/workers/`

## Practical Limits

Hamiltonian-cycle search is exact, so worst-case validation is still exponential.

To keep the UI responsive:

- validation runs in a worker
- the designer uses a timeout
- the new-map UI keeps boards in a practical range

Simple rectangular maps validate quickly. Dense custom maps with many portals can take longer.
