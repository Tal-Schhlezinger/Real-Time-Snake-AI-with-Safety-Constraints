# Real-Time Snake AI with Hamiltonian Safety Constraints

## Why this is interesting

This project explores real-time planning for Snake under conflicting objectives:

- reaching the apple quickly
- avoiding dead-ends
- guaranteeing survival

Most Snake AIs optimize locally and eventually trap themselves.  
This project introduces a second approach that enforces a global safety invariant using Hamiltonian cycles.

The result is a system that compares:
- fast but unsafe strategies
- slower but provably safe strategies

---

## Core Idea

The key idea is to use a **Hamiltonian cycle** as a safety backbone.

A Hamiltonian cycle is a path that:
- visits every reachable cell exactly once
- returns to the starting point

If the snake follows such a cycle, it can never trap itself.

This project builds on that idea by allowing **controlled mutations of the cycle** to safely shorten the path to the apple.

---

## AI Strategies

The system includes two fundamentally different AI approaches:

### 1. Greedy / Heuristic Solver

Attempts to reach the apple quickly using local planning.

- Focuses on short-term efficiency
- May enter dead-ends
- Does not provide safety guarantees

---

### 2. Hamiltonian Solver (Safe)

Follows a precomputed Hamiltonian cycle to guarantee survival.

- Guarantees non-losing behavior
- Can be highly inefficient in reaching the apple
- Requires no decision-making during gameplay

This solver prioritizes correctness over optimal speed.

---

### 3. Hamiltonian Mutation Solver (Safe & fast)

Maintains a Hamiltonian-cycle invariant to guarantee survival.

- Ensures the snake always remains on a valid non-losing route
- Dynamically mutates the cycle to allow safe shortcuts
- Rejects moves that break reachability of the tail

This solver optimizes speed without losing correctness.

---

## Safety Guarantee

The Hamiltonian Mutation Solver guarantees a non-losing strategy, under the assumption that a Hamiltonian cycle exists for the map.

At every step, the algorithm ensures that:
- the snake follows a valid Hamiltonian cycle, or
- transitions to a modified cycle that preserves reachability

Moves that violate this invariant are rejected before execution.

---

## Survival vs Progress

Maintaining a safe path from head to tail guarantees survival, but does not guarantee progress.

A naive strategy, like eating apple while maintaining a path from head to tail, can enter long cycles where the snake survives indefinitely while incapable of eating the apple.

For example:

@ = apple
H = head
T = tail

┌H@┌┐
│T─┘│
│┌─┐│
└┘ └┘

In such cases, the snake may remain in a valid cycle but fail to reach the apple efficiently.

The Hamiltonian Mutation Solver addresses this by:

- allowing controlled modifications to a cycle that still covers the entire board
- validating that these modifications preserve safety  
- preferring mutations that reduce distance to the apple  

This ensures that the system does not get stuck in purely survival-driven behavior.

---

## Features

- Human-playable Snake
- Multiple AI strategies
- Real-time decision making
- Support for walls and portals
- Map designer with validation
- Visualization of cycles and AI plans
- Saved maps and results
- Automated testing

---

## Map Support

The system supports non-trivial maps, including:

- Walls (blocked cells)
- Portals (teleport edges)

These are integrated directly into the graph used by:
- validation
- AI planning
- Hamiltonian cycle construction

---

## Map Validation

Every playable map must contain a Hamiltonian cycle.

Validation is performed by:
1. Constructing the movement graph
2. Rejecting invalid configurations early
3. Running an exact backtracking solver with pruning

Only valid maps are accepted.

---

## How It Works

1. A valid map is loaded (with a Hamiltonian cycle)
2. The snake starts on the cycle
3. One of the AI strategies is selected:
   - Greedy solver (fast but unsafe)
   - Hamiltonian solver (safe but slow)
   - Hamiltonian mutation solver (safe with improved efficiency)
4. The selected strategy determines all movement decisions

---

## Project Structure

Core logic is located in:

- `graph.ts` — movement graph construction
- `map-validator.ts` — validation logic
- `hamiltonian-cycle-solver.ts` — exact cycle search
- `game-engine.ts` — main game loop
- `ai-controller.ts` — AI strategies

UI and auxiliary systems:

- `ui/` — visualization and controls
- `storage/` — persistence
- `workers/` — background validation

---

## Run Locally

```bash
npm install
npm run dev
```
Then open:
```
http://localhost:4173
```

---

## Controls
- Arrow keys / WASD — movement
- P — pause
- R — restart

---

## Practical Limits

Hamiltonian-cycle search is computationally expensive (worst-case exponential).

To keep the system usable:
- validation runs in a worker
- timeouts are enforced
- map sizes are constrained in the UI

---

## Limitations
- The safety guarantee depends on the existence of a Hamiltonian cycle
- Dense maps with portals can be expensive to validate
- The greedy solver can still fail on complex configurations

---

## Summary

This project is not just a Snake game.

It is a constrained real-time planning system that explores the tradeoff between:

- safety (global guarantees)
- efficiency (local optimization)

and demonstrates how enforcing invariants can fundamentally change behavior.
