import { decideAiMove } from '../core/ai-controller.js';
import { cloneDraft, cloneSavedMap, createEmptyDraft } from '../core/board-map.js';
import { applyCertifiedPostAppleTransition, describeCertifiedLibraryStatus } from '../core/certified-cycle-controller.js';
import { generateDiverseHamiltonianCycles } from '../core/cycle-library.js';
import { buildGraphFromDraft } from '../core/graph.js';
import { createHighScoreEntryFromGame } from '../core/high-score-utils.js';
import { advanceGame } from '../core/game-engine.js';
import { createInitialGameState } from '../core/game-state.js';
import { formatDeathReason, formatDuration, formatScoreLabel, summarizeValidation } from './formatters.js';
import { CanvasRenderer } from './renderer.js';
import { ValidationWorkerClient } from './validation-worker-client.js';
import { MapStore } from '../storage/map-store.js';
import { HighScoreStore } from '../storage/high-score-store.js';
import { DEFAULT_SETTINGS, SettingsStore } from '../storage/settings-store.js';
function draftFromSavedMap(map) {
    return {
        id: map.id,
        name: map.name,
        width: map.width,
        height: map.height,
        walls: map.walls.map((wall) => ({ ...wall })),
        portals: map.portals.map((portal) => ({
            id: portal.id,
            a: { ...portal.a },
            b: { ...portal.b }
        })),
        snakeSpawn: { ...map.snakeSpawn },
        createdAt: map.createdAt,
        updatedAt: map.updatedAt
    };
}
function makeValidationState(result, status, expansions = 0) {
    return {
        status,
        result,
        expansions
    };
}
function createIllegalDesignerResult(draft, messageText) {
    const graph = buildGraphFromDraft(draft).graph;
    return {
        isValid: false,
        graph,
        cycle: [],
        reasons: [
            {
                code: 'unpaired-portals',
                message: messageText
            }
        ],
        stats: {
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
            expansions: 0,
            durationMs: 0
        }
    };
}
function coordEquals(left, right) {
    return !!left && !!right && left.x === right.x && left.y === right.y;
}
export class SnakeApp {
    root;
    mapStore = new MapStore();
    scoreStore = new HighScoreStore();
    settingsStore = new SettingsStore();
    validationClient = new ValidationWorkerClient();
    certifiedCycleLibraries = new Map();
    screen = 'menu';
    playMode = 'human';
    aiStrategy = 'greedy';
    maps = [];
    selectedMapId = '';
    settings = DEFAULT_SETTINGS;
    gameState = null;
    gameLoopHandle = null;
    requestedDirection = null;
    savedPlacement = null;
    designerValidationDebounce = null;
    validationNonce = 0;
    designer = {
        draft: createEmptyDraft(8, 8, 'New Map'),
        selectedTool: 'wall',
        pendingPortalAnchor: null,
        validation: makeValidationState(null, 'idle'),
        showGraphOverlay: false,
        showPortalLinks: true,
        showCycleOverlay: true,
        hoverCell: null,
        newWidth: 8,
        newHeight: 8
    };
    constructor(root) {
        this.root = root;
    }
    mount() {
        this.settings = this.settingsStore.load();
        this.mapStore.bootstrapDefaults();
        this.refreshMaps();
        if (!this.selectedMapId && this.maps[0]) {
            this.selectedMapId = this.maps[0].id;
        }
        this.root.addEventListener('click', this.handleClick);
        this.root.addEventListener('input', this.handleInput);
        this.root.addEventListener('change', this.handleInput);
        window.addEventListener('keydown', this.handleKeydown);
        this.scheduleDesignerValidation();
        this.render();
    }
    refreshMaps() {
        this.certifiedCycleLibraries.clear();
        this.maps = this.mapStore.listMaps();
        if (this.maps.length === 0) {
            this.mapStore.bootstrapDefaults();
            this.maps = this.mapStore.listMaps();
        }
        if (!this.maps.find((map) => map.id === this.selectedMapId)) {
            this.selectedMapId = this.maps[0]?.id ?? '';
        }
    }
    get selectedMap() {
        return this.maps.find((map) => map.id === this.selectedMapId) ?? null;
    }
    setScreen(screen) {
        this.screen = screen;
        this.render();
    }
    ensureCertifiedCycleLibrary(map) {
        const cached = this.certifiedCycleLibraries.get(map.id);
        if (cached) {
            return cached;
        }
        const library = generateDiverseHamiltonianCycles(map);
        this.certifiedCycleLibraries.set(map.id, library);
        return library;
    }
    handleClick = (event) => {
        const target = event.target;
        const actionElement = target?.closest('[data-action]');
        if (!actionElement) {
            return;
        }
        const action = actionElement.dataset.action;
        if (!action) {
            return;
        }
        switch (action) {
            case 'open-play-human':
                this.playMode = 'human';
                this.setScreen('play-setup');
                return;
            case 'open-play-ai':
                this.playMode = 'ai';
                this.setScreen('play-setup');
                return;
            case 'open-designer':
                this.setScreen('designer');
                return;
            case 'open-library':
                this.setScreen('library');
                return;
            case 'open-scores':
                this.setScreen('scores');
                return;
            case 'open-settings':
                this.setScreen('settings');
                return;
            case 'back-menu':
                this.stopGameLoop();
                this.setScreen('menu');
                return;
            case 'start-game':
                this.startSelectedMapGame();
                return;
            case 'pause-game':
                this.togglePause();
                return;
            case 'restart-game':
                this.startSelectedMapGame();
                return;
            case 'end-to-menu':
                this.stopGameLoop();
                this.gameState = null;
                this.savedPlacement = null;
                this.setScreen('menu');
                return;
            case 'new-map':
                this.createNewDraft();
                return;
            case 'save-map':
                this.saveDesignerMap();
                return;
            case 'delete-current-map':
                if (this.selectedMapId) {
                    this.mapStore.deleteMap(this.selectedMapId);
                    this.refreshMaps();
                    this.render();
                }
                return;
            case 'delete-designer-map':
                this.mapStore.deleteMap(this.designer.draft.id);
                this.refreshMaps();
                this.designer = {
                    ...this.designer,
                    draft: createEmptyDraft(this.designer.newWidth, this.designer.newHeight, 'New Map'),
                    pendingPortalAnchor: null,
                    validation: makeValidationState(null, 'idle'),
                    hoverCell: null
                };
                this.scheduleDesignerValidation();
                this.render();
                return;
            case 'load-map-into-designer':
                if (this.selectedMap) {
                    this.loadMapIntoDesigner(this.selectedMap);
                }
                return;
            case 'play-selected-human':
                this.playMode = 'human';
                this.setScreen('play-setup');
                return;
            case 'play-selected-ai':
                this.playMode = 'ai';
                this.setScreen('play-setup');
                return;
            case 'cancel-validation':
                this.cancelValidation();
                return;
            default:
                return;
        }
    };
    handleInput = (event) => {
        const target = event.target;
        if (!target) {
            return;
        }
        const checked = target instanceof HTMLInputElement ? target.checked : false;
        const field = target.dataset.field;
        if (!field) {
            return;
        }
        switch (field) {
            case 'selected-map':
                this.selectedMapId = target.value;
                this.render();
                return;
            case 'ai-strategy':
                this.aiStrategy = target.value;
                this.render();
                return;
            case 'score-filter':
                this.settings = {
                    ...this.settings,
                    scoreFilter: target.value
                };
                this.settingsStore.save(this.settings);
                this.render();
                return;
            case 'setting-tick-ms':
                this.settings = {
                    ...this.settings,
                    tickMs: Number(target.value)
                };
                this.settingsStore.save(this.settings);
                if (this.screen === 'game' && this.gameState && !this.gameState.isPaused && !this.gameState.isOver) {
                    this.restartGameLoop();
                }
                this.render();
                return;
            case 'setting-cell-size':
                this.settings = {
                    ...this.settings,
                    cellSize: Number(target.value)
                };
                this.settingsStore.save(this.settings);
                this.render();
                return;
            case 'setting-show-cycle':
                this.settings = {
                    ...this.settings,
                    showHamiltonianOverlay: checked
                };
                this.settingsStore.save(this.settings);
                this.render();
                return;
            case 'setting-show-ai-path':
                this.settings = {
                    ...this.settings,
                    showAiPathOverlay: checked
                };
                this.settingsStore.save(this.settings);
                this.render();
                return;
            case 'designer-name':
                this.designer.draft.name = target.value;
                this.render();
                return;
            case 'designer-width':
                this.designer.newWidth = Number(target.value);
                return;
            case 'designer-height':
                this.designer.newHeight = Number(target.value);
                return;
            case 'designer-tool':
                this.designer.selectedTool = target.value;
                this.render();
                return;
            case 'designer-overlay-graph':
                this.designer.showGraphOverlay = checked;
                this.render();
                return;
            case 'designer-overlay-portals':
                this.designer.showPortalLinks = checked;
                this.render();
                return;
            case 'designer-overlay-cycle':
                this.designer.showCycleOverlay = checked;
                this.render();
                return;
            case 'score-map':
                this.selectedMapId = target.value;
                this.render();
                return;
            default:
                return;
        }
    };
    handleKeydown = (event) => {
        if (this.screen !== 'game' || !this.gameState || this.gameState.mode !== 'human') {
            return;
        }
        const key = event.key.toLowerCase();
        if (key === 'arrowup' || key === 'w') {
            event.preventDefault();
            this.requestedDirection = 'up';
        }
        else if (key === 'arrowright' || key === 'd') {
            event.preventDefault();
            this.requestedDirection = 'right';
        }
        else if (key === 'arrowdown' || key === 's') {
            event.preventDefault();
            this.requestedDirection = 'down';
        }
        else if (key === 'arrowleft' || key === 'a') {
            event.preventDefault();
            this.requestedDirection = 'left';
        }
        else if (key === 'p') {
            this.togglePause();
        }
        else if (key === 'r') {
            this.startSelectedMapGame();
        }
    };
    startSelectedMapGame() {
        const map = this.selectedMap;
        if (!map) {
            return;
        }
        this.selectedMapId = map.id;
        this.savedPlacement = null;
        this.requestedDirection = null;
        this.gameState = createInitialGameState(cloneSavedMap(map), this.playMode, this.playMode === 'ai' ? this.aiStrategy : null);
        this.screen = 'game';
        this.restartGameLoop();
        this.render();
    }
    stopGameLoop() {
        if (this.gameLoopHandle !== null) {
            window.clearInterval(this.gameLoopHandle);
            this.gameLoopHandle = null;
        }
    }
    restartGameLoop() {
        this.stopGameLoop();
        if (!this.gameState || this.gameState.isOver || this.gameState.isPaused) {
            return;
        }
        this.gameLoopHandle = window.setInterval(() => this.tickGame(), this.settings.tickMs);
    }
    tickGame() {
        if (!this.gameState) {
            return;
        }
        let nextDirection = this.requestedDirection;
        let plannedPath = [];
        if (this.gameState.mode === 'ai') {
            let decision;
            try {
                decision = decideAiMove(this.gameState, this.aiStrategy);
            }
            catch (error) {
                this.stopGameLoop();
                throw error;
            }
            nextDirection = decision?.direction ?? this.gameState.snake.direction;
            plannedPath = decision?.plannedPath ?? [];
        }
        const previousState = this.gameState;
        const advancedState = advanceGame(previousState, nextDirection, this.settings.tickMs);
        const nextState = applyCertifiedPostAppleTransition({
            previousState,
            nextState: advancedState,
            cycleLibrary: previousState.aiStrategy === 'certified-hamiltonian' ? this.ensureCertifiedCycleLibrary(previousState.map) : null
        });
        nextState.aiPlannedPath = this.settings.showAiPathOverlay ? plannedPath : [];
        this.gameState = nextState;
        if (nextState.isOver) {
            this.stopGameLoop();
            this.savedPlacement = this.scoreStore.save(createHighScoreEntryFromGame(nextState));
        }
        this.render();
    }
    togglePause() {
        if (!this.gameState || this.gameState.isOver) {
            return;
        }
        this.gameState = {
            ...this.gameState,
            isPaused: !this.gameState.isPaused
        };
        if (this.gameState.isPaused) {
            this.stopGameLoop();
        }
        else {
            this.restartGameLoop();
        }
        this.render();
    }
    createNewDraft() {
        const width = Math.max(4, Math.min(16, this.designer.newWidth));
        const height = Math.max(4, Math.min(16, this.designer.newHeight));
        this.designer = {
            ...this.designer,
            draft: createEmptyDraft(width, height, 'New Map'),
            pendingPortalAnchor: null,
            hoverCell: null,
            validation: makeValidationState(null, 'idle')
        };
        this.scheduleDesignerValidation();
        this.render();
    }
    loadMapIntoDesigner(map) {
        this.designer = {
            ...this.designer,
            draft: draftFromSavedMap(map),
            pendingPortalAnchor: null,
            hoverCell: null,
            validation: makeValidationState({
                isValid: true,
                graph: map.graph,
                cycle: map.hamiltonianCycle,
                reasons: [],
                stats: {
                    nodeCount: map.graph.nodes.length,
                    edgeCount: map.graph.edges.length,
                    expansions: 0,
                    durationMs: 0
                }
            }, 'valid')
        };
        this.screen = 'designer';
        this.render();
    }
    saveDesignerMap() {
        const result = this.designer.validation.result;
        if (!result?.isValid || !this.designer.draft.snakeSpawn) {
            return;
        }
        const now = new Date().toISOString();
        const savedMap = {
            ...cloneDraft(this.designer.draft),
            snakeSpawn: { ...this.designer.draft.snakeSpawn },
            graph: result.graph,
            hamiltonianCycle: result.cycle,
            updatedAt: now
        };
        this.mapStore.saveMap(savedMap);
        this.refreshMaps();
        this.selectedMapId = savedMap.id;
        this.render();
    }
    cancelValidation() {
        this.validationClient.cancel();
        const result = this.designer.validation.result ?? createIllegalDesignerResult(this.designer.draft, 'Validation was cancelled before the map could be proven legal.');
        this.designer.validation = makeValidationState(result, 'cancelled', this.designer.validation.expansions);
        this.render();
    }
    scheduleDesignerValidation() {
        if (this.designerValidationDebounce !== null) {
            window.clearTimeout(this.designerValidationDebounce);
        }
        this.validationClient.cancel();
        const nonce = ++this.validationNonce;
        this.designer.validation = makeValidationState(this.designer.validation.result, 'validating', 0);
        this.render();
        this.designerValidationDebounce = window.setTimeout(async () => {
            if (this.designer.pendingPortalAnchor) {
                this.designer.validation = makeValidationState(createIllegalDesignerResult(this.designer.draft, 'Portals must be linked in pairs before the map can be legal.'), 'invalid');
                this.render();
                return;
            }
            try {
                const result = await this.validationClient.validate(cloneDraft(this.designer.draft), 5_000, (expansions) => {
                    if (nonce !== this.validationNonce) {
                        return;
                    }
                    this.designer.validation = {
                        ...this.designer.validation,
                        expansions
                    };
                    this.render();
                });
                if (nonce !== this.validationNonce) {
                    return;
                }
                const status = result.isValid
                    ? 'valid'
                    : result.reasons[0]?.code === 'timed-out'
                        ? 'timed-out'
                        : result.reasons[0]?.code === 'cancelled'
                            ? 'cancelled'
                            : 'invalid';
                this.designer.validation = makeValidationState(result, status, result.stats.expansions);
                this.render();
            }
            catch {
                if (nonce !== this.validationNonce) {
                    return;
                }
                this.designer.validation = makeValidationState(createIllegalDesignerResult(this.designer.draft, 'Validation failed unexpectedly.'), 'invalid');
                this.render();
            }
        }, 220);
    }
    handleDesignerCanvasClick(cell) {
        const draft = this.designer.draft;
        const wallIndex = draft.walls.findIndex((wall) => wall.x === cell.x && wall.y === cell.y);
        const portal = draft.portals.find((candidate) => coordEquals(candidate.a, cell) || coordEquals(candidate.b, cell));
        const isSpawn = coordEquals(draft.snakeSpawn, cell);
        if (this.designer.selectedTool === 'erase') {
            if (wallIndex >= 0) {
                draft.walls.splice(wallIndex, 1);
            }
            if (portal) {
                draft.portals = draft.portals.filter((candidate) => candidate.id !== portal.id);
            }
            if (isSpawn) {
                draft.snakeSpawn = null;
            }
            if (coordEquals(this.designer.pendingPortalAnchor, cell)) {
                this.designer.pendingPortalAnchor = null;
            }
        }
        else if (this.designer.selectedTool === 'wall') {
            if (portal || isSpawn) {
                return;
            }
            if (wallIndex >= 0) {
                draft.walls.splice(wallIndex, 1);
            }
            else {
                draft.walls.push({ ...cell });
            }
        }
        else if (this.designer.selectedTool === 'spawn') {
            if (portal || wallIndex >= 0) {
                return;
            }
            draft.snakeSpawn = { ...cell };
        }
        else if (this.designer.selectedTool === 'portal') {
            if (portal || wallIndex >= 0 || isSpawn) {
                return;
            }
            if (!this.designer.pendingPortalAnchor) {
                this.designer.pendingPortalAnchor = { ...cell };
            }
            else if (coordEquals(this.designer.pendingPortalAnchor, cell)) {
                this.designer.pendingPortalAnchor = null;
            }
            else {
                draft.portals.push({
                    id: `portal-${crypto.randomUUID().slice(0, 4)}`,
                    a: { ...this.designer.pendingPortalAnchor },
                    b: { ...cell }
                });
                this.designer.pendingPortalAnchor = null;
            }
        }
        draft.updatedAt = new Date().toISOString();
        this.scheduleDesignerValidation();
        this.render();
    }
    render() {
        this.root.innerHTML = `
      <div class="app-shell">
        <header class="topbar">
          <div>
            <p class="eyebrow">Snake Hamiltonian</p>
            <h1>Snake With Graph Validation, Portals, AI, and a Map Designer</h1>
          </div>
          <button class="ghost-button" data-action="back-menu">Main Menu</button>
        </header>
        ${this.renderScreen()}
      </div>
    `;
        this.afterRender();
    }
    renderScreen() {
        switch (this.screen) {
            case 'menu':
                return this.renderMenu();
            case 'play-setup':
                return this.renderPlaySetup();
            case 'game':
                return this.renderGame();
            case 'designer':
                return this.renderDesigner();
            case 'library':
                return this.renderLibrary();
            case 'scores':
                return this.renderScores();
            case 'settings':
                return this.renderSettings();
        }
    }
    renderMenu() {
        return `
      <main class="menu-grid">
        <section class="hero-card">
          <p>Pick a mode, choose a saved map, or build your own legal board. Every playable map has to pass real Hamiltonian-cycle validation before it can be saved.</p>
          <div class="menu-actions">
            <button class="primary-button" data-action="open-play-human">Play Human</button>
            <button class="secondary-button" data-action="open-play-ai">Watch AI Play</button>
            <button class="secondary-button" data-action="open-designer">Map Designer</button>
            <button class="secondary-button" data-action="open-library">Load Map</button>
            <button class="secondary-button" data-action="open-scores">High Scores</button>
            <button class="secondary-button" data-action="open-settings">Settings</button>
          </div>
        </section>
        <section class="panel">
          <h2>Current Map</h2>
          <p>${this.selectedMap?.name ?? 'No map available'}</p>
          <canvas id="preview-canvas"></canvas>
        </section>
      </main>
    `;
    }
    renderPlaySetup() {
        const selectedMap = this.selectedMap;
        const scores = selectedMap ? this.scoreStore.listForMap(selectedMap.id, this.settings.scoreFilter).slice(0, 6) : [];
        const certifiedLibraryStatus = (() => {
            if (!(this.playMode === 'ai' && this.aiStrategy === 'certified-hamiltonian' && selectedMap)) {
                return null;
            }
            const library = this.ensureCertifiedCycleLibrary(selectedMap);
            return describeCertifiedLibraryStatus(createInitialGameState(cloneSavedMap(selectedMap), 'ai', 'certified-hamiltonian'), library);
        })();
        return `
      <main class="screen-grid">
        <section class="panel">
          <h2>${this.playMode === 'human' ? 'Play Human' : 'Watch AI Play'}</h2>
          <label class="field">
            <span>Map</span>
            <select data-field="selected-map">
              ${this.mapOptionsHtml()}
            </select>
          </label>
          ${this.playMode === 'ai'
            ? `
                <label class="field">
                  <span>AI Strategy</span>
                  <select data-field="ai-strategy">
                    <option value="greedy" ${this.aiStrategy === 'greedy' ? 'selected' : ''}>Greedy + safe fallback</option>
                    <option value="hamiltonian" ${this.aiStrategy === 'hamiltonian' ? 'selected' : ''}>Safe Hamiltonian</option>
                    <option value="certified-hamiltonian" ${this.aiStrategy === 'certified-hamiltonian' ? 'selected' : ''}>Certified Hamiltonian</option>
                  </select>
                </label>
                ${certifiedLibraryStatus ? `<p class="hint">${certifiedLibraryStatus}</p>` : ''}
              `
            : `
                <p class="hint">Controls: Arrow keys or WASD. Press P to pause and R to restart.</p>
              `}
          <button class="primary-button" data-action="start-game" ${selectedMap ? '' : 'disabled'}>${this.playMode === 'human' ? 'Start Run' : 'Start AI Run'}</button>
        </section>
        <section class="panel">
          <h2>Map Preview</h2>
          <p>${selectedMap ? `${selectedMap.graph.nodes.length} playable nodes • ${selectedMap.portals.length} portal pair(s)` : 'Choose a map to begin.'}</p>
          <canvas id="preview-canvas"></canvas>
        </section>
        <section class="panel">
          <h2>Top Scores</h2>
          ${this.renderScoreEntries(scores)}
        </section>
      </main>
    `;
    }
    renderGame() {
        const state = this.gameState;
        if (!state) {
            return '<main class="panel"><p>No active game.</p></main>';
        }
        const certifiedLibraryStatus = state.aiStrategy === 'certified-hamiltonian'
            ? describeCertifiedLibraryStatus(state, this.ensureCertifiedCycleLibrary(state.map))
            : null;
        return `
      <main class="game-layout">
        <section class="panel board-panel">
          <div class="hud">
            <div>
              <span class="hud-label">Map</span>
              <strong>${state.map.name}</strong>
            </div>
            <div>
              <span class="hud-label">Mode</span>
              <strong>${state.mode === 'human' ? 'Human' : `AI / ${this.aiStrategy}`}</strong>
            </div>
            <div>
              <span class="hud-label">Apples</span>
              <strong>${state.applesEaten}</strong>
            </div>
            <div>
              <span class="hud-label">Time</span>
              <strong>${formatDuration(state.elapsedMs)}</strong>
            </div>
          </div>
          <canvas id="game-canvas"></canvas>
        </section>
        <section class="panel side-panel">
          <h2>${state.isOver ? (state.outcome === 'win' ? 'Victory' : 'Run Over') : state.isPaused ? 'Paused' : 'Run In Progress'}</h2>
          <p>${state.isOver ? (state.outcome === 'win' ? 'The snake filled the board and survived the extra final move.' : formatDeathReason(state.deathReason)) : state.pendingWinCheck ? 'Board is full. Survive one more legal move to win.' : 'Keep the snake moving through the legal graph.'}</p>
          <div class="button-row">
            <button class="secondary-button" data-action="pause-game" ${state.isOver ? 'disabled' : ''}>${state.isPaused ? 'Resume' : 'Pause'}</button>
            <button class="secondary-button" data-action="restart-game">Restart</button>
            <button class="ghost-button" data-action="end-to-menu">Menu</button>
          </div>
          ${certifiedLibraryStatus ? `<p class="hint">${certifiedLibraryStatus}</p>` : ''}
          ${state.isOver
            ? `<p class="score-chip">High-score placement: ${this.savedPlacement ?? 'N/A'}</p>`
            : ''}
        </section>
      </main>
    `;
    }
    renderDesigner() {
        const validation = this.designer.validation;
        const validationStatusLabel = validation.status === 'validating'
            ? `Validating... ${validation.expansions > 0 ? `${validation.expansions} search expansions` : ''}`
            : validation.status === 'valid'
                ? 'Legal'
                : validation.status === 'timed-out'
                    ? 'Timed out'
                    : validation.status === 'cancelled'
                        ? 'Cancelled'
                        : 'Illegal';
        return `
      <main class="designer-layout">
        <section class="panel board-panel">
          <div class="designer-toolbar">
            <label class="field compact">
              <span>Name</span>
              <input data-field="designer-name" value="${this.escapeHtml(this.designer.draft.name)}" />
            </label>
            <div class="tool-strip">
              ${this.toolButton('wall', 'Wall')}
              ${this.toolButton('erase', 'Erase')}
              ${this.toolButton('spawn', 'Spawn')}
              ${this.toolButton('portal', this.designer.pendingPortalAnchor ? 'Portal (pick pair)' : 'Portal')}
            </div>
          </div>
          <canvas id="designer-canvas"></canvas>
        </section>
        <section class="panel side-panel">
          <h2>Map Designer</h2>
          <p class="status-pill ${validation.status}">${validationStatusLabel}</p>
          <p>${summarizeValidation(validation.result, !!this.designer.pendingPortalAnchor)}</p>
          ${this.renderValidationReasons()}
          <div class="divider"></div>
          <div class="field-grid">
            <label class="field compact">
              <span>New width</span>
              <input type="number" min="4" max="16" data-field="designer-width" value="${this.designer.newWidth}" />
            </label>
            <label class="field compact">
              <span>New height</span>
              <input type="number" min="4" max="16" data-field="designer-height" value="${this.designer.newHeight}" />
            </label>
          </div>
          <button class="secondary-button" data-action="new-map">Create New Blank Map</button>
          <button class="primary-button" data-action="save-map" ${(validation.result?.isValid && !this.designer.pendingPortalAnchor) ? '' : 'disabled'}>Save Legal Map</button>
          <button class="ghost-button" data-action="cancel-validation" ${validation.status === 'validating' ? '' : 'disabled'}>Cancel Validation</button>
          <button class="ghost-button" data-action="delete-designer-map">Delete This Map</button>
          <div class="divider"></div>
          <h3>Overlays</h3>
          <label class="checkbox">
            <input type="checkbox" data-field="designer-overlay-graph" ${this.designer.showGraphOverlay ? 'checked' : ''} />
            <span>Graph nodes and edges</span>
          </label>
          <label class="checkbox">
            <input type="checkbox" data-field="designer-overlay-portals" ${this.designer.showPortalLinks ? 'checked' : ''} />
            <span>Portal links</span>
          </label>
          <label class="checkbox">
            <input type="checkbox" data-field="designer-overlay-cycle" ${this.designer.showCycleOverlay ? 'checked' : ''} />
            <span>Hamiltonian cycle</span>
          </label>
        </section>
      </main>
    `;
    }
    renderLibrary() {
        const map = this.selectedMap;
        return `
      <main class="screen-grid">
        <section class="panel">
          <h2>Saved Maps</h2>
          <label class="field">
            <span>Map</span>
            <select data-field="selected-map">
              ${this.mapOptionsHtml()}
            </select>
          </label>
          <div class="button-row">
            <button class="primary-button" data-action="play-selected-human">Play Human</button>
            <button class="secondary-button" data-action="play-selected-ai">Watch AI</button>
            <button class="secondary-button" data-action="load-map-into-designer">Edit in Designer</button>
          </div>
          <button class="ghost-button" data-action="delete-current-map" ${map ? '' : 'disabled'}>Delete Selected Map</button>
        </section>
        <section class="panel">
          <h2>${map?.name ?? 'No map selected'}</h2>
          <p>${map ? `${map.width}x${map.height} • ${map.graph.nodes.length} playable nodes • ${map.portals.length} portal pair(s)` : ''}</p>
          <canvas id="preview-canvas"></canvas>
        </section>
        <section class="panel">
          <h2>Map High Scores</h2>
          ${map ? this.renderScoreEntries(this.scoreStore.listForMap(map.id, this.settings.scoreFilter).slice(0, 8)) : '<p>No map selected.</p>'}
        </section>
      </main>
    `;
    }
    renderScores() {
        const map = this.selectedMap;
        return `
      <main class="screen-grid">
        <section class="panel">
          <h2>High Scores</h2>
          <label class="field">
            <span>Map</span>
            <select data-field="score-map">
              ${this.mapOptionsHtml()}
            </select>
          </label>
          <label class="field">
            <span>Filter</span>
            <select data-field="score-filter">
              <option value="all" ${this.settings.scoreFilter === 'all' ? 'selected' : ''}>All</option>
              <option value="human" ${this.settings.scoreFilter === 'human' ? 'selected' : ''}>Human</option>
              <option value="ai" ${this.settings.scoreFilter === 'ai' ? 'selected' : ''}>AI</option>
            </select>
          </label>
        </section>
        <section class="panel wide-panel">
          <h2>${map?.name ?? 'Scores'}</h2>
          ${map ? this.renderDetailedScores(this.scoreStore.listForMap(map.id, this.settings.scoreFilter)) : '<p>No map selected.</p>'}
        </section>
      </main>
    `;
    }
    renderSettings() {
        return `
      <main class="screen-grid">
        <section class="panel">
          <h2>Settings</h2>
          <label class="field">
            <span>Game speed (${this.settings.tickMs} ms per tick)</span>
            <input type="range" min="70" max="260" step="10" value="${this.settings.tickMs}" data-field="setting-tick-ms" />
          </label>
          <label class="field">
            <span>Grid scale (${this.settings.cellSize}px)</span>
            <input type="range" min="22" max="42" step="2" value="${this.settings.cellSize}" data-field="setting-cell-size" />
          </label>
          <label class="checkbox">
            <input type="checkbox" data-field="setting-show-cycle" ${this.settings.showHamiltonianOverlay ? 'checked' : ''} />
            <span>Show Hamiltonian cycle overlay during play</span>
          </label>
          <label class="checkbox">
            <input type="checkbox" data-field="setting-show-ai-path" ${this.settings.showAiPathOverlay ? 'checked' : ''} />
            <span>Show AI planned path overlay</span>
          </label>
        </section>
        <section class="panel">
          <h2>Practical Limits</h2>
          <p>Exact Hamiltonian validation is exponential in the worst case, so the designer caps map sizes and validates in a background worker with a timeout.</p>
          <p>Open rectangular maps validate quickly. Dense custom layouts with many portals can take longer and may need simplification.</p>
        </section>
      </main>
    `;
    }
    mapOptionsHtml() {
        return this.maps
            .map((map) => `<option value="${map.id}" ${map.id === this.selectedMapId ? 'selected' : ''}>${this.escapeHtml(map.name)}</option>`)
            .join('');
    }
    renderScoreEntries(entries) {
        if (entries.length === 0) {
            return '<p>No scores recorded yet.</p>';
        }
        return `<ul class="score-list">${entries
            .map((entry) => `<li><strong>${formatScoreLabel(entry)}</strong><span>${entry.result.toUpperCase()}</span></li>`)
            .join('')}</ul>`;
    }
    renderDetailedScores(entries) {
        if (entries.length === 0) {
            return '<p>No scores recorded yet.</p>';
        }
        return `
      <table class="score-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Mode</th>
            <th>Apples</th>
            <th>Final Apple Time</th>
            <th>Total Time</th>
            <th>Avg / Apple</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map((entry, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${entry.playerType}${entry.aiStrategy ? ` / ${entry.aiStrategy}` : ''}</td>
                  <td>${entry.applesEaten}</td>
                  <td>${formatDuration(entry.finalAppleReachedMs)}</td>
                  <td>${formatDuration(entry.totalElapsedMs)}</td>
                  <td>${entry.averageMsPerApple ? formatDuration(entry.averageMsPerApple) : 'n/a'}</td>
                  <td>${entry.result}</td>
                </tr>
              `)
            .join('')}
        </tbody>
      </table>
    `;
    }
    renderValidationReasons() {
        const reasons = this.designer.pendingPortalAnchor
            ? ['Portals must be linked in pairs before the map can become legal.']
            : this.designer.validation.result?.reasons.map((reason) => reason.message) ?? [];
        if (reasons.length === 0) {
            return '';
        }
        return `<ul class="reason-list">${reasons.map((reason) => `<li>${reason}</li>`).join('')}</ul>`;
    }
    toolButton(tool, label) {
        return `
      <label class="tool-pill ${this.designer.selectedTool === tool ? 'active' : ''}">
        <input type="radio" name="designer-tool" value="${tool}" data-field="designer-tool" ${this.designer.selectedTool === tool ? 'checked' : ''} />
        <span>${label}</span>
      </label>
    `;
    }
    afterRender() {
        if (this.screen === 'menu' || this.screen === 'play-setup' || this.screen === 'library') {
            const previewCanvas = this.root.querySelector('#preview-canvas');
            if (previewCanvas && this.selectedMap) {
                new CanvasRenderer(previewCanvas).drawDesigner({
                    mapWidth: this.selectedMap.width,
                    mapHeight: this.selectedMap.height,
                    walls: this.selectedMap.walls,
                    portals: this.selectedMap.portals,
                    snakeSpawn: this.selectedMap.snakeSpawn,
                    graph: this.selectedMap.graph,
                    cycle: this.selectedMap.hamiltonianCycle
                }, {
                    cellSize: Math.max(18, this.settings.cellSize - 6),
                    showCycle: this.settings.showHamiltonianOverlay,
                    showAiPath: false,
                    showGraph: false,
                    showPortalLinks: true,
                    hoverCell: null
                });
            }
        }
        if (this.screen === 'game' && this.gameState) {
            const canvas = this.root.querySelector('#game-canvas');
            if (canvas) {
                new CanvasRenderer(canvas).drawGame(this.gameState, {
                    cellSize: this.settings.cellSize,
                    showCycle: this.settings.showHamiltonianOverlay,
                    showAiPath: this.settings.showAiPathOverlay,
                    showGraph: false,
                    showPortalLinks: true,
                    hoverCell: null
                });
            }
        }
        if (this.screen === 'designer') {
            const canvas = this.root.querySelector('#designer-canvas');
            if (canvas) {
                const renderer = new CanvasRenderer(canvas);
                renderer.drawDesigner({
                    mapWidth: this.designer.draft.width,
                    mapHeight: this.designer.draft.height,
                    walls: this.designer.draft.walls,
                    portals: this.designer.draft.portals,
                    snakeSpawn: this.designer.draft.snakeSpawn,
                    graph: this.designer.validation.result?.graph ?? buildGraphFromDraft(this.designer.draft).graph,
                    cycle: this.designer.validation.result?.cycle ?? []
                }, {
                    cellSize: this.settings.cellSize,
                    showCycle: this.designer.showCycleOverlay,
                    showAiPath: false,
                    showGraph: this.designer.showGraphOverlay,
                    showPortalLinks: this.designer.showPortalLinks,
                    hoverCell: this.designer.hoverCell
                });
                canvas.onclick = (event) => {
                    const cell = this.cellFromCanvasEvent(event, canvas, this.designer.draft.width, this.designer.draft.height);
                    if (cell) {
                        this.handleDesignerCanvasClick(cell);
                    }
                };
                canvas.onmousemove = (event) => {
                    this.designer.hoverCell = this.cellFromCanvasEvent(event, canvas, this.designer.draft.width, this.designer.draft.height);
                    renderer.drawDesigner({
                        mapWidth: this.designer.draft.width,
                        mapHeight: this.designer.draft.height,
                        walls: this.designer.draft.walls,
                        portals: this.designer.draft.portals,
                        snakeSpawn: this.designer.draft.snakeSpawn,
                        graph: this.designer.validation.result?.graph ?? buildGraphFromDraft(this.designer.draft).graph,
                        cycle: this.designer.validation.result?.cycle ?? []
                    }, {
                        cellSize: this.settings.cellSize,
                        showCycle: this.designer.showCycleOverlay,
                        showAiPath: false,
                        showGraph: this.designer.showGraphOverlay,
                        showPortalLinks: this.designer.showPortalLinks,
                        hoverCell: this.designer.hoverCell
                    });
                };
                canvas.onmouseleave = () => {
                    this.designer.hoverCell = null;
                    this.render();
                };
            }
        }
    }
    cellFromCanvasEvent(event, canvas, mapWidth, mapHeight) {
        const rect = canvas.getBoundingClientRect();
        const cellX = Math.floor((event.clientX - rect.left) / this.settings.cellSize);
        const cellY = Math.floor((event.clientY - rect.top) / this.settings.cellSize);
        if (cellX < 0 || cellY < 0 || cellX >= mapWidth || cellY >= mapHeight) {
            return null;
        }
        return { x: cellX, y: cellY };
    }
    escapeHtml(value) {
        return value.replace(/[&<>"']/g, (character) => {
            switch (character) {
                case '&':
                    return '&amp;';
                case '<':
                    return '&lt;';
                case '>':
                    return '&gt;';
                case '"':
                    return '&quot;';
                case '\'':
                    return '&#39;';
                default:
                    return character;
            }
        });
    }
}
