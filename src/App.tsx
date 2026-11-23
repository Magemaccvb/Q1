import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  Flame,
  Flower2,
  Keyboard,
  Leaf,
  Maximize2,
  Minimize2,
  Music,
  Pause,
  Play,
  Repeat2,
  RotateCcw,
  RotateCw,
  Snowflake,
  Sun,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { PiecePreview } from './components/PiecePreview';
import { SEASONS, SeasonBackdrop } from './components/SeasonBackdrop';
import {
  CascadeFallFxEvent,
  HardDropFxEvent,
  LineClearFxEvent,
  SpecialFxEvent,
  TetrisBoard,
} from './components/TetrisBoard';
import { SeasonId, soundEngine } from './game/soundEffects';
import {
  calculateLineScore,
  collapseBoardColumns,
  createEmptyBoard,
  createSpawnPiece,
  detectTSpin,
  generateBag,
  getGhostY,
  getGravityMs,
  getPieceCells,
  isValidPosition,
  lockPieceToBoard,
  removeClearedRows,
  resolveSpecialEffects,
  SpecialResolution,
  toQueuePiece,
  tryRotatePiece,
} from './game/tetrisEngine';
import {
  ActivePiece,
  ATTRIBUTE_META,
  BOARD_COLS,
  BOARD_VISIBLE_ROWS,
  BoardGrid,
  FREEZE_MAX_MS,
  GameStatus,
  LINE_CLEAR_FLASH_MS,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  PIECE_PALETTE,
  QueuePiece,
  SpecialAttribute,
} from './game/tetrisTypes';

const HIGH_SCORE_KEY = 'tetris_tw_highscore_v1';
const CONTROLS_HINT_KEY = 'tetris_tw_show_controls_v1';
const DAS_MS = 130;
const ARR_MS = 35;
const SOFT_DROP_MS = 45;

interface EngineState {
  status: GameStatus;
  board: BoardGrid;
  activePiece: ActivePiece | null;
  holdPiece: QueuePiece | null;
  canHold: boolean;
  queue: QueuePiece[];
  attributeMode: boolean;
  score: number;
  highScore: number;
  startLevel: number;
  level: number;
  lines: number;
  combo: number;
  isBackToBack: boolean;
  clearingRows: number[];
  clearFlashTimer: number;
  pendingCascade: {
    settledBoard: BoardGrid;
    movedSpecialCells: Array<{ x: number; y: number; attr: SpecialAttribute }>;
    elapsedMs: number;
    durationMs: number;
    depth: number;
  } | null;
  needsCascadeAfterClear: boolean;
  gravityTimer: number;
  lockTimer: number;
  lockResets: number;
  isGrounded: boolean;
  lastActionWasRotate: boolean;
  lastKickIndex: number;
  calloutText: string;
  calloutPoints: number;
  calloutTimer: number;
  elapsedMs: number;
  tSpinCount: number;
  freezeRemainingMs: number;
  specialTriggerCount: number;
}

interface UiSnapshot {
  status: GameStatus;
  board: BoardGrid;
  activePiece: ActivePiece | null;
  ghostY: number | null;
  holdPiece: QueuePiece | null;
  canHold: boolean;
  nextPieces: QueuePiece[];
  attributeMode: boolean;
  score: number;
  highScore: number;
  startLevel: number;
  level: number;
  lines: number;
  combo: number;
  isBackToBack: boolean;
  clearingRows: number[];
  calloutText: string;
  calloutPoints: number;
  elapsedMs: number;
  tSpinCount: number;
  freezeRemainingMs: number;
  specialTriggerCount: number;
}

function loadHighScore(): number {
  try {
    const raw = localStorage.getItem(HIGH_SCORE_KEY);
    const parsed = raw ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function saveHighScore(score: number) {
  try {
    localStorage.setItem(HIGH_SCORE_KEY, String(score));
  } catch {
    // Ignore storage quota errors
  }
}

function ensureQueue(queue: QueuePiece[], attributeMode: boolean): QueuePiece[] {
  const next = [...queue];
  while (next.length < 7) {
    next.push(...generateBag(attributeMode));
  }
  return next;
}

function createInitialEngineState(
  startLevel = 1,
  attributeMode = true
): EngineState {
  const queue = ensureQueue([], attributeMode);
  return {
    status: 'TITLE_MENU',
    board: createEmptyBoard(),
    activePiece: null,
    holdPiece: null,
    canHold: true,
    queue,
    attributeMode,
    score: 0,
    highScore: loadHighScore(),
    startLevel,
    level: startLevel,
    lines: 0,
    combo: -1,
    isBackToBack: false,
    clearingRows: [],
    clearFlashTimer: 0,
    pendingCascade: null,
    needsCascadeAfterClear: false,
    gravityTimer: 0,
    lockTimer: 0,
    lockResets: 0,
    isGrounded: false,
    lastActionWasRotate: false,
    lastKickIndex: 0,
    calloutText: '',
    calloutPoints: 0,
    calloutTimer: 0,
    elapsedMs: 0,
    tSpinCount: 0,
    freezeRemainingMs: 0,
    specialTriggerCount: 0,
  };
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function toSnapshot(state: EngineState): UiSnapshot {
  const ghostY =
    state.activePiece && state.status === 'PLAYING'
      ? getGhostY(state.board, state.activePiece)
      : null;

  return {
    status: state.status,
    board: state.board,
    activePiece: state.activePiece,
    ghostY,
    holdPiece: state.holdPiece,
    canHold: state.canHold,
    nextPieces: state.queue.slice(0, 3),
    attributeMode: state.attributeMode,
    score: state.score,
    highScore: state.highScore,
    startLevel: state.startLevel,
    level: state.level,
    lines: state.lines,
    combo: state.combo,
    isBackToBack: state.isBackToBack,
    clearingRows: state.clearingRows,
    calloutText: state.calloutTimer > 0 ? state.calloutText : '',
    calloutPoints: state.calloutTimer > 0 ? state.calloutPoints : 0,
    elapsedMs: state.elapsedMs,
    tSpinCount: state.tSpinCount,
    freezeRemainingMs: state.freezeRemainingMs,
    specialTriggerCount: state.specialTriggerCount,
  };
}

function TetrominoMark({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" fill="none" className={className} aria-hidden="true">
      <rect x="2" y="10" width="7" height="7" rx="1.2" fill="#06B6D4" />
      <rect x="10.5" y="10" width="7" height="7" rx="1.2" fill="#A855F7" />
      <rect x="10.5" y="1.5" width="7" height="7" rx="1.2" fill="#A855F7" />
      <rect x="19" y="10" width="7" height="7" rx="1.2" fill="#F59E0B" />
      <rect x="10.5" y="18.5" width="7" height="7" rx="1.2" fill="#22C55E" />
      <rect x="19" y="18.5" width="7" height="7" rx="1.2" fill="#F59E0B" />
    </svg>
  );
}

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-100 bg-black/40 rounded shadow-sm">
      {children}
    </kbd>
  );
}

export default function App() {
  const engineRef = useRef<EngineState>(createInitialEngineState(1));
  const [ui, setUi] = useState<UiSnapshot>(() => toSnapshot(engineRef.current));
  const [muted, setMuted] = useState(false);
  const [bgmEnabled, setBgmEnabled] = useState(true);
  const [seasonIndex, setSeasonIndex] = useState(0);
  const [autoSeasonCycle, setAutoSeasonCycle] = useState(true);
  const [showControlsHint, setShowControlsHint] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(CONTROLS_HINT_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });
  const [hardDropThump, setHardDropThump] = useState(false);
  const [cellSize, setCellSize] = useState(34);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hardDropFx, setHardDropFx] = useState<HardDropFxEvent | null>(null);
  const [lineClearFx, setLineClearFx] = useState<LineClearFxEvent | null>(null);
  const [specialFx, setSpecialFx] = useState<SpecialFxEvent | null>(null);
  const [cascadeFallFx, setCascadeFallFx] = useState<CascadeFallFxEvent | null>(null);
  const [impactEffect, setImpactEffect] = useState<{
    id: number;
    kind: 'tetris' | 'gameover' | 'special';
  } | null>(null);
  const fxIdRef = useRef(1);
  const impactTimeoutRef = useRef<number | null>(null);

  const triggerImpact = useCallback((kind: 'tetris' | 'gameover' | 'special') => {
    fxIdRef.current += 1;
    setImpactEffect({ id: fxIdRef.current, kind });
    if (impactTimeoutRef.current !== null) {
      clearTimeout(impactTimeoutRef.current);
    }
    impactTimeoutRef.current = window.setTimeout(() => {
      setImpactEffect(null);
      impactTimeoutRef.current = null;
    }, kind === 'gameover' ? 560 : 520);
  }, []);

  const currentSeason = SEASONS[seasonIndex];
  const seasonTheme = currentSeason.theme;

  useEffect(() => {
    soundEngine.setSeason(currentSeason.id);
  }, [currentSeason.id]);

  useEffect(() => {
    return () => {
      soundEngine.setGameActive(false);
      if (impactTimeoutRef.current !== null) {
        clearTimeout(impactTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!autoSeasonCycle) return;
    const timer = window.setInterval(() => {
      setSeasonIndex((prev) => {
        const next = (prev + 1) % SEASONS.length;
        soundEngine.seasonChange(SEASONS[next].id);
        return next;
      });
    }, 24000);
    return () => clearInterval(timer);
  }, [autoSeasonCycle]);

  const cycleSeason = useCallback(() => {
    setSeasonIndex((prev) => {
      const next = (prev + 1) % SEASONS.length;
      soundEngine.seasonChange(SEASONS[next].id);
      return next;
    });
  }, []);

  const toggleBgm = useCallback(() => {
    setBgmEnabled((prev) => {
      const next = !prev;
      soundEngine.setBgmEnabled(next);
      return next;
    });
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement && !isFullscreen) {
        setIsFullscreen(true);
        if (document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen().catch(() => {});
        }
      } else {
        setIsFullscreen(false);
        if (document.fullscreenElement && document.exitFullscreen) {
          await document.exitFullscreen().catch(() => {});
        }
      }
    } catch {
      setIsFullscreen((prev) => !prev);
    }
  }, [isFullscreen]);

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      } else {
        setIsFullscreen(true);
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleControlsHint = useCallback(() => {
    setShowControlsHint((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(CONTROLS_HINT_KEY, String(next));
      } catch {
        // Ignore storage quota errors
      }
      return next;
    });
  }, []);

  const keyHoldRef = useRef<{
    left: boolean;
    right: boolean;
    down: boolean;
    dir: -1 | 0 | 1;
    dasElapsed: number;
    arrElapsed: number;
    softDropElapsed: number;
  }>({
    left: false,
    right: false,
    down: false,
    dir: 0,
    dasElapsed: 0,
    arrElapsed: 0,
    softDropElapsed: 0,
  });

  const syncUi = useCallback(() => {
    setUi(toSnapshot(engineRef.current));
  }, []);

  useEffect(() => {
    const computeCellSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const headerReserve = isFullscreen ? 124 : 186;
      if (vw < 640) {
        const byWidth = Math.floor((vw - 56) / BOARD_COLS);
        const byHeight = Math.floor((vh - (isFullscreen ? 285 : 335)) / BOARD_VISIBLE_ROWS);
        setCellSize(Math.max(16, Math.min(28, byWidth, byHeight)));
      } else if (vw < 1024) {
        const byHeight = Math.floor((vh - (isFullscreen ? 250 : 305)) / BOARD_VISIBLE_ROWS);
        const byWidth = Math.floor((vw - 340) / BOARD_COLS);
        setCellSize(Math.max(18, Math.min(36, byHeight, byWidth)));
      } else {
        const byHeight = Math.floor((vh - headerReserve) / BOARD_VISIBLE_ROWS);
        const byWidth = Math.floor((vw - 440) / BOARD_COLS);
        setCellSize(Math.max(22, Math.min(48, byHeight, byWidth)));
      }
    };

    computeCellSize();
    window.addEventListener('resize', computeCellSize);
    return () => window.removeEventListener('resize', computeCellSize);
  }, [isFullscreen]);

  const updateHighScoreIfNeeded = useCallback((state: EngineState) => {
    if (state.score > state.highScore) {
      state.highScore = state.score;
      saveHighScore(state.highScore);
    }
  }, []);

  const spawnNextPiece = useCallback(
    (state: EngineState) => {
      state.queue = ensureQueue(state.queue, state.attributeMode);
      const nextItem = state.queue.shift()!;
      state.queue = ensureQueue(state.queue, state.attributeMode);

      const spawned = createSpawnPiece(nextItem);
      state.gravityTimer = 0;
      state.lockTimer = 0;
      state.lockResets = 0;
      state.lastActionWasRotate = false;
      state.lastKickIndex = 0;
      state.canHold = true;

      if (!isValidPosition(state.board, spawned)) {
        state.activePiece = null;
        state.status = 'GAME_OVER';
        updateHighScoreIfNeeded(state);
        soundEngine.setGameActive(false);
        soundEngine.gameOver();
        triggerImpact('gameover');
        return;
      }

      state.activePiece = spawned;
      state.isGrounded = !isValidPosition(state.board, {
        ...spawned,
        y: spawned.y + 1,
      });
    },
    [triggerImpact, updateHighScoreIfNeeded]
  );

  const applySpecialResult = useCallback(
    (state: EngineState, specialRes: SpecialResolution) => {
      state.board = specialRes.nextBoard;
      state.score += specialRes.bonusPoints;
      state.specialTriggerCount += specialRes.triggeredCount;

      if (specialRes.freezeAddMs > 0) {
        state.freezeRemainingMs = Math.min(
          FREEZE_MAX_MS,
          state.freezeRemainingMs + specialRes.freezeAddMs
        );
        soundEngine.freeze();
      }
      if (specialRes.explosions.length > 0) {
        soundEngine.explode(specialRes.triggeredCount - 1);
      }
      if (specialRes.lightnings.length > 0) {
        const hasCross = specialRes.lightnings.some((l) => l.cross);
        soundEngine.lightning(hasCross);
      }
      if (specialRes.triggeredCount >= 2) {
        soundEngine.linkChain(specialRes.triggeredCount);
      }

      fxIdRef.current += 1;
      setSpecialFx({
        id: fxIdRef.current,
        explosions: specialRes.explosions,
        lightnings: specialRes.lightnings,
        freezes: specialRes.freezes,
        linkArcs: specialRes.linkArcs,
        destroyedParticles: specialRes.destroyedParticles,
      });

      if (
        specialRes.explosions.length > 0 ||
        specialRes.lightnings.length > 0 ||
        specialRes.triggeredCount >= 2
      ) {
        triggerImpact('special');
      }
      updateHighScoreIfNeeded(state);
    },
    [triggerImpact, updateHighScoreIfNeeded]
  );

  const startColumnCascadeOrSpawn = useCallback(
    (state: EngineState, depth = 0) => {
      const collapse = collapseBoardColumns(state.board);
      if (collapse.movedBlocks.length > 0) {
        state.board = collapse.staticBoard;
        const movedSpecialCells = collapse.movedBlocks
          .filter((b) => b.cell.attr !== 'normal')
          .map((b) => ({
            x: b.x,
            y: b.toY,
            attr: b.cell.attr as SpecialAttribute,
          }));
        state.pendingCascade = {
          settledBoard: collapse.settledBoard,
          movedSpecialCells,
          elapsedMs: 0,
          durationMs: collapse.durationMs,
          depth,
        };
        fxIdRef.current += 1;
        setCascadeFallFx({
          id: fxIdRef.current,
          blocks: collapse.movedBlocks,
          durationMs: collapse.durationMs,
        });
        return;
      }
      spawnNextPiece(state);
    },
    [spawnNextPiece]
  );

  const finishPendingCascade = useCallback(
    (state: EngineState) => {
      const pending = state.pendingCascade;
      if (!pending) return;

      state.pendingCascade = null;
      state.board = pending.settledBoard;
      setCascadeFallFx(null);
      soundEngine.cascadeLand();

      if (pending.depth < 10) {
        const cascadeClearedRows: number[] = [];
        for (let r = 0; r < pending.settledBoard.length; r++) {
          if (pending.settledBoard[r].every((cell) => cell !== null)) {
            cascadeClearedRows.push(r);
          }
        }

        const cascadeSpecialRes = state.attributeMode
          ? resolveSpecialEffects(
              pending.settledBoard,
              pending.movedSpecialCells,
              cascadeClearedRows,
              state.level
            )
          : null;

        const hasSpecial = !!(cascadeSpecialRes && cascadeSpecialRes.triggeredCount > 0);
        if (hasSpecial && cascadeSpecialRes) {
          applySpecialResult(state, cascadeSpecialRes);
        }

        if (cascadeClearedRows.length > 0) {
          const nextCombo = state.combo + 1;
          const scoring = calculateLineScore({
            linesCleared: cascadeClearedRows.length,
            level: state.level,
            tSpin: 'NONE',
            combo: nextCombo,
            isBackToBack: state.isBackToBack,
          });
          state.score += scoring.points;
          state.lines += cascadeClearedRows.length;
          state.combo = nextCombo;
          state.isBackToBack = scoring.qualifiesBackToBack;

          const targetLevel = Math.max(
            state.startLevel,
            state.startLevel + Math.floor(state.lines / 10)
          );
          const leveledUp = targetLevel > state.level;
          state.level = targetLevel;

          const baseLabel = `連鎖 · ${scoring.label}`;
          state.calloutText =
            hasSpecial && cascadeSpecialRes
              ? `${baseLabel} + ${cascadeSpecialRes.label}`
              : baseLabel;
          state.calloutPoints =
            scoring.points + (cascadeSpecialRes ? cascadeSpecialRes.bonusPoints : 0);
          state.calloutTimer = 1550;

          const sampleRow = pending.settledBoard[cascadeClearedRows[0]];
          const colors = sampleRow.map((cell) =>
            cell
              ? cell.attr !== 'normal'
                ? ATTRIBUTE_META[cell.attr].accent
                : PIECE_PALETTE[cell.type].highlight
              : '#FBBF24'
          );
          fxIdRef.current += 1;
          setLineClearFx({
            id: fxIdRef.current,
            rows: cascadeClearedRows,
            colors,
          });

          if (cascadeClearedRows.length >= 4) {
            triggerImpact('tetris');
          }
          updateHighScoreIfNeeded(state);
          soundEngine.clearLines(cascadeClearedRows.length, nextCombo, false);
          if (leveledUp) {
            setTimeout(() => soundEngine.levelUp(), 180);
          }

          state.clearingRows = cascadeClearedRows;
          state.clearFlashTimer = LINE_CLEAR_FLASH_MS;
          state.needsCascadeAfterClear = hasSpecial;
          return;
        }

        if (hasSpecial && cascadeSpecialRes) {
          state.calloutText = `連鎖反應 · ${cascadeSpecialRes.label}`;
          state.calloutPoints = cascadeSpecialRes.bonusPoints;
          state.calloutTimer = 1450;
          startColumnCascadeOrSpawn(state, pending.depth + 1);
          return;
        }
      }

      spawnNextPiece(state);
    },
    [
      applySpecialResult,
      spawnNextPiece,
      startColumnCascadeOrSpawn,
      triggerImpact,
      updateHighScoreIfNeeded,
    ]
  );

  const lockActivePiece = useCallback(
    (state: EngineState) => {
      if (!state.activePiece) return;

      const tSpin = detectTSpin(
        state.board,
        state.activePiece,
        state.lastActionWasRotate,
        state.lastKickIndex
      );

      const {
        nextBoard,
        clearedRows,
        lockedAboveVisible,
        newlyLockedSpecialCells,
      } = lockPieceToBoard(state.board, state.activePiece);

      state.board = nextBoard;
      state.activePiece = null;
      state.isGrounded = false;
      state.lockTimer = 0;
      state.lockResets = 0;

      if (lockedAboveVisible) {
        state.status = 'GAME_OVER';
        updateHighScoreIfNeeded(state);
        soundEngine.setGameActive(false);
        soundEngine.gameOver();
        triggerImpact('gameover');
        return;
      }

      if (tSpin !== 'NONE') {
        state.tSpinCount += 1;
      }

      const specialRes = state.attributeMode
        ? resolveSpecialEffects(
            nextBoard,
            newlyLockedSpecialCells,
            clearedRows,
            state.level
          )
        : null;

      const hasSpecial = !!(specialRes && specialRes.triggeredCount > 0);
      if (hasSpecial && specialRes) {
        applySpecialResult(state, specialRes);
      }

      if (clearedRows.length > 0) {
        const nextCombo = state.combo + 1;
        const scoring = calculateLineScore({
          linesCleared: clearedRows.length,
          level: state.level,
          tSpin,
          combo: nextCombo,
          isBackToBack: state.isBackToBack,
        });

        state.score += scoring.points;
        state.lines += clearedRows.length;
        state.combo = nextCombo;
        state.isBackToBack = scoring.qualifiesBackToBack;

        const targetLevel = Math.max(
          state.startLevel,
          state.startLevel + Math.floor(state.lines / 10)
        );
        const leveledUp = targetLevel > state.level;
        state.level = targetLevel;

        const baseLabel =
          nextCombo > 0 ? `${scoring.label} · 連擊 x${nextCombo}` : scoring.label;
        state.calloutText =
          hasSpecial && specialRes
            ? `${baseLabel} + ${specialRes.label}`
            : baseLabel;
        state.calloutPoints =
          scoring.points + (specialRes ? specialRes.bonusPoints : 0);
        state.calloutTimer = 1550;

        const sampleRow = nextBoard[clearedRows[0]];
        const colors = sampleRow.map((cell) =>
          cell
            ? cell.attr !== 'normal'
              ? ATTRIBUTE_META[cell.attr].accent
              : PIECE_PALETTE[cell.type].highlight
            : '#FBBF24'
        );
        fxIdRef.current += 1;
        setLineClearFx({
          id: fxIdRef.current,
          rows: clearedRows,
          colors,
        });

        if (clearedRows.length >= 4 || (tSpin === 'FULL' && clearedRows.length >= 2)) {
          triggerImpact('tetris');
        }

        updateHighScoreIfNeeded(state);
        soundEngine.clearLines(clearedRows.length, nextCombo, tSpin !== 'NONE');
        if (leveledUp) {
          setTimeout(() => soundEngine.levelUp(), 180);
        }

        state.clearingRows = clearedRows;
        state.clearFlashTimer = LINE_CLEAR_FLASH_MS;
        state.needsCascadeAfterClear = hasSpecial;
      } else {
        state.combo = -1;
        let tSpinPts = 0;
        let tSpinLabel = '';
        if (tSpin !== 'NONE') {
          const scoring = calculateLineScore({
            linesCleared: 0,
            level: state.level,
            tSpin,
            combo: 0,
            isBackToBack: state.isBackToBack,
          });
          tSpinPts = scoring.points;
          tSpinLabel = scoring.label;
          state.score += scoring.points;
          updateHighScoreIfNeeded(state);
        }

        if (hasSpecial && specialRes) {
          state.calloutText = tSpinLabel
            ? `${tSpinLabel} + ${specialRes.label}`
            : specialRes.label;
          state.calloutPoints = tSpinPts + specialRes.bonusPoints;
          state.calloutTimer = 1450;
          startColumnCascadeOrSpawn(state, 0);
          return;
        }

        if (tSpinLabel) {
          state.calloutText = tSpinLabel;
          state.calloutPoints = tSpinPts;
          state.calloutTimer = 1100;
        }
        soundEngine.lock();
        spawnNextPiece(state);
      }
    },
    [
      applySpecialResult,
      spawnNextPiece,
      startColumnCascadeOrSpawn,
      triggerImpact,
      updateHighScoreIfNeeded,
    ]
  );

  const startNewGame = useCallback(
    (selectedStartLevel?: number, selectedAttributeMode?: boolean) => {
      const prev = engineRef.current;
      const startLv = selectedStartLevel ?? prev.startLevel;
      const attrMode = selectedAttributeMode ?? prev.attributeMode;
      const fresh = createInitialEngineState(startLv, attrMode);
      fresh.status = 'PLAYING';
      fresh.highScore = Math.max(prev.highScore, loadHighScore());
      setCascadeFallFx(null);
      spawnNextPiece(fresh);
      engineRef.current = fresh;
      keyHoldRef.current = {
        left: false,
        right: false,
        down: false,
        dir: 0,
        dasElapsed: 0,
        arrElapsed: 0,
        softDropElapsed: 0,
      };
      soundEngine.gameStart();
      soundEngine.setGameActive(true);
      syncUi();
    },
    [spawnNextPiece, syncUi]
  );

  const togglePause = useCallback(() => {
    const state = engineRef.current;
    if (state.status === 'PLAYING') {
      state.status = 'PAUSED';
      soundEngine.pause();
      soundEngine.setGameActive(false);
      syncUi();
    } else if (state.status === 'PAUSED') {
      state.status = 'PLAYING';
      soundEngine.resume();
      soundEngine.setGameActive(true);
      syncUi();
    }
  }, [syncUi]);

  const setStartLevel = useCallback(
    (lvl: number) => {
      const state = engineRef.current;
      state.startLevel = lvl;
      if (state.status === 'TITLE_MENU') {
        state.level = lvl;
      }
      syncUi();
    },
    [syncUi]
  );

  const setAttributeMode = useCallback(
    (enabled: boolean) => {
      const state = engineRef.current;
      state.attributeMode = enabled;
      if (state.status === 'TITLE_MENU') {
        state.queue = ensureQueue([], enabled);
      }
      syncUi();
    },
    [syncUi]
  );

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const moveHorizontal = useCallback(
    (dx: -1 | 1, playSound = true): boolean => {
      const state = engineRef.current;
      if (state.status !== 'PLAYING' || !state.activePiece || state.clearingRows.length > 0) {
        return false;
      }
      const candidate: ActivePiece = {
        ...state.activePiece,
        x: state.activePiece.x + dx,
      };
      if (!isValidPosition(state.board, candidate)) {
        return false;
      }
      state.activePiece = candidate;
      state.lastActionWasRotate = false;
      const groundedNow = !isValidPosition(state.board, {
        ...candidate,
        y: candidate.y + 1,
      });
      if (state.isGrounded && state.lockResets < MAX_LOCK_RESETS) {
        state.lockTimer = 0;
        state.lockResets += 1;
      }
      state.isGrounded = groundedNow;
      if (playSound) soundEngine.move();
      syncUi();
      return true;
    },
    [syncUi]
  );

  const rotateActive = useCallback(
    (dir: 1 | -1) => {
      const state = engineRef.current;
      if (state.status !== 'PLAYING' || !state.activePiece || state.clearingRows.length > 0) {
        return;
      }
      const rotated = tryRotatePiece(state.board, state.activePiece, dir);
      if (!rotated) return;

      state.activePiece = rotated.piece;
      state.lastActionWasRotate = true;
      state.lastKickIndex = rotated.kickIndex;

      const groundedNow = !isValidPosition(state.board, {
        ...rotated.piece,
        y: rotated.piece.y + 1,
      });
      if (state.isGrounded && state.lockResets < MAX_LOCK_RESETS) {
        state.lockTimer = 0;
        state.lockResets += 1;
      }
      state.isGrounded = groundedNow;
      soundEngine.rotate();
      syncUi();
    },
    [syncUi]
  );

  const softDropStep = useCallback(
    (awardPoint = true) => {
      const state = engineRef.current;
      if (state.status !== 'PLAYING' || !state.activePiece || state.clearingRows.length > 0) {
        return;
      }
      const candidate: ActivePiece = {
        ...state.activePiece,
        y: state.activePiece.y + 1,
      };
      if (isValidPosition(state.board, candidate)) {
        state.activePiece = candidate;
        state.gravityTimer = 0;
        state.lastActionWasRotate = false;
        state.isGrounded = !isValidPosition(state.board, {
          ...candidate,
          y: candidate.y + 1,
        });
        if (awardPoint) {
          state.score += 1;
          updateHighScoreIfNeeded(state);
          soundEngine.softDrop();
        }
        syncUi();
      } else {
        state.isGrounded = true;
      }
    },
    [syncUi, updateHighScoreIfNeeded]
  );

  const hardDrop = useCallback(() => {
    const state = engineRef.current;
    if (state.status !== 'PLAYING' || !state.activePiece || state.clearingRows.length > 0) {
      return;
    }
    const ghostY = getGhostY(state.board, state.activePiece);
    const distance = Math.max(0, ghostY - state.activePiece.y);

    if (distance > 1) {
      fxIdRef.current += 1;
      setHardDropFx({
        id: fxIdRef.current,
        type: state.activePiece.type,
        cells: getPieceCells(state.activePiece),
        distance,
      });
    }

    state.activePiece = {
      ...state.activePiece,
      y: ghostY,
    };
    state.score += distance * 2;
    if (distance > 0) {
      state.lastActionWasRotate = false;
    }
    updateHighScoreIfNeeded(state);
    soundEngine.hardDrop();

    setHardDropThump(true);
    setTimeout(() => setHardDropThump(false), 110);

    lockActivePiece(state);
    syncUi();
  }, [lockActivePiece, syncUi, updateHighScoreIfNeeded]);

  const holdActivePiece = useCallback(() => {
    const state = engineRef.current;
    if (
      state.status !== 'PLAYING' ||
      !state.activePiece ||
      !state.canHold ||
      state.clearingRows.length > 0
    ) {
      return;
    }

    const currentQueueItem = toQueuePiece(state.activePiece);
    if (state.holdPiece === null) {
      state.holdPiece = currentQueueItem;
      spawnNextPiece(state);
    } else {
      const swappedItem = state.holdPiece;
      state.holdPiece = currentQueueItem;
      const spawned = createSpawnPiece(swappedItem);
      if (!isValidPosition(state.board, spawned)) {
        state.activePiece = null;
        state.status = 'GAME_OVER';
        updateHighScoreIfNeeded(state);
        soundEngine.setGameActive(false);
        soundEngine.gameOver();
        triggerImpact('gameover');
      } else {
        state.activePiece = spawned;
        state.gravityTimer = 0;
        state.lockTimer = 0;
        state.lockResets = 0;
        state.lastActionWasRotate = false;
        state.isGrounded = !isValidPosition(state.board, {
          ...spawned,
          y: spawned.y + 1,
        });
      }
    }
    state.canHold = false;
    soundEngine.hold();
    syncUi();
  }, [spawnNextPiece, syncUi, triggerImpact, updateHighScoreIfNeeded]);

  // Main 60fps requestAnimationFrame loop
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const tick = (now: number) => {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;

      const state = engineRef.current;
      let dirty = false;

      if (state.calloutTimer > 0) {
        state.calloutTimer = Math.max(0, state.calloutTimer - dt);
        if (state.calloutTimer === 0) {
          state.calloutText = '';
          state.calloutPoints = 0;
          dirty = true;
        }
      }

      if (state.status === 'PLAYING') {
        state.elapsedMs += dt;

        if (state.freezeRemainingMs > 0) {
          const prevTick = Math.ceil(state.freezeRemainingMs / 100);
          state.freezeRemainingMs = Math.max(0, state.freezeRemainingMs - dt);
          const nextTick = Math.ceil(state.freezeRemainingMs / 100);
          if (prevTick !== nextTick) {
            dirty = true;
          }
        }

        if (state.clearingRows.length > 0) {
          state.clearFlashTimer -= dt;
          if (state.clearFlashTimer <= 0) {
            state.board = removeClearedRows(state.board, state.clearingRows);
            state.clearingRows = [];
            state.clearFlashTimer = 0;
            if (state.needsCascadeAfterClear) {
              state.needsCascadeAfterClear = false;
              startColumnCascadeOrSpawn(state, 0);
            } else {
              spawnNextPiece(state);
            }
            dirty = true;
          }
        } else if (state.pendingCascade) {
          state.pendingCascade.elapsedMs += dt;
          if (state.pendingCascade.elapsedMs >= state.pendingCascade.durationMs) {
            finishPendingCascade(state);
            dirty = true;
          }
        } else if (state.activePiece) {
          const kh = keyHoldRef.current;
          if (kh.dir !== 0) {
            kh.dasElapsed += dt;
            if (kh.dasElapsed >= DAS_MS) {
              kh.arrElapsed += dt;
              while (kh.arrElapsed >= ARR_MS) {
                kh.arrElapsed -= ARR_MS;
                const moved = moveHorizontal(kh.dir, false);
                if (!moved) break;
              }
            }
          }

          if (kh.down) {
            kh.softDropElapsed += dt;
            while (kh.softDropElapsed >= SOFT_DROP_MS) {
              kh.softDropElapsed -= SOFT_DROP_MS;
              softDropStep(true);
            }
          }

          // Gravity is paused while Frost Freeze is active!
          if (state.freezeRemainingMs <= 0) {
            const gravityMs = getGravityMs(state.level);
            state.gravityTimer += dt;
            if (state.gravityTimer >= gravityMs) {
              state.gravityTimer -= gravityMs;
              const nextPos: ActivePiece = {
                ...state.activePiece,
                y: state.activePiece.y + 1,
              };
              if (isValidPosition(state.board, nextPos)) {
                state.activePiece = nextPos;
                state.lastActionWasRotate = false;
                state.isGrounded = !isValidPosition(state.board, {
                  ...nextPos,
                  y: nextPos.y + 1,
                });
                dirty = true;
              } else {
                state.isGrounded = true;
              }
            }

            if (state.isGrounded && state.activePiece) {
              const stillGrounded = !isValidPosition(state.board, {
                ...state.activePiece,
                y: state.activePiece.y + 1,
              });
              if (stillGrounded) {
                state.lockTimer += dt;
                if (state.lockTimer >= LOCK_DELAY_MS) {
                  lockActivePiece(state);
                  dirty = true;
                }
              } else {
                state.isGrounded = false;
                state.lockTimer = 0;
              }
            }
          }
        }
      }

      if (dirty) {
        syncUi();
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [
    finishPendingCascade,
    lockActivePiece,
    moveHorizontal,
    softDropStep,
    spawnNextPiece,
    startColumnCascadeOrSpawn,
    syncUi,
  ]);

  // Keyboard bindings
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const state = engineRef.current;

      if (
        code === 'ArrowLeft' ||
        code === 'ArrowRight' ||
        code === 'ArrowDown' ||
        code === 'ArrowUp' ||
        code === 'Space'
      ) {
        e.preventDefault();
      }

      if (code === 'KeyP' || code === 'Escape') {
        if (state.status === 'PLAYING' || state.status === 'PAUSED') {
          togglePause();
        }
        return;
      }

      if (code === 'KeyM') {
        toggleMute();
        return;
      }

      if (code === 'KeyF') {
        toggleFullscreen();
        return;
      }

      if (code === 'Enter') {
        if (state.status === 'TITLE_MENU' || state.status === 'GAME_OVER') {
          startNewGame();
          return;
        }
      }

      if (state.status !== 'PLAYING') return;
      if (e.repeat) return;

      const kh = keyHoldRef.current;

      if (code === 'ArrowLeft' || code === 'KeyA') {
        kh.left = true;
        kh.dir = -1;
        kh.dasElapsed = 0;
        kh.arrElapsed = 0;
        moveHorizontal(-1, true);
      } else if (code === 'ArrowRight' || code === 'KeyD') {
        kh.right = true;
        kh.dir = 1;
        kh.dasElapsed = 0;
        kh.arrElapsed = 0;
        moveHorizontal(1, true);
      } else if (code === 'ArrowDown' || code === 'KeyS') {
        kh.down = true;
        kh.softDropElapsed = 0;
        softDropStep(true);
      } else if (code === 'ArrowUp' || code === 'KeyW' || code === 'KeyX') {
        rotateActive(1);
      } else if (code === 'KeyZ') {
        rotateActive(-1);
      } else if (code === 'Space') {
        hardDrop();
      } else if (code === 'KeyC' || code === 'ShiftLeft' || code === 'ShiftRight') {
        holdActivePiece();
      } else if (code === 'KeyR') {
        startNewGame();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const kh = keyHoldRef.current;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
        kh.left = false;
        kh.dir = kh.right ? 1 : 0;
        kh.dasElapsed = 0;
        kh.arrElapsed = 0;
      } else if (e.code === 'ArrowRight' || e.code === 'KeyD') {
        kh.right = false;
        kh.dir = kh.left ? -1 : 0;
        kh.dasElapsed = 0;
        kh.arrElapsed = 0;
      } else if (e.code === 'ArrowDown' || e.code === 'KeyS') {
        kh.down = false;
        kh.softDropElapsed = 0;
      }
    };

    const onBlur = () => {
      keyHoldRef.current = {
        left: false,
        right: false,
        down: false,
        dir: 0,
        dasElapsed: 0,
        arrElapsed: 0,
        softDropElapsed: 0,
      };
      if (engineRef.current.status === 'PLAYING') {
        engineRef.current.status = 'PAUSED';
        soundEngine.setGameActive(false);
        syncUi();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    hardDrop,
    holdActivePiece,
    moveHorizontal,
    rotateActive,
    softDropStep,
    startNewGame,
    syncUi,
    toggleFullscreen,
    toggleMute,
    togglePause,
  ]);

  const boardPixelWidth = BOARD_COLS * cellSize;
  const boardPixelHeight = BOARD_VISIBLE_ROWS * cellSize;
  const levelProgress = ui.lines % 10;

  const renderSeasonIcon = (id: SeasonId) => {
    if (id === 'spring') return <Flower2 className="w-3.5 h-3.5 text-pink-300" />;
    if (id === 'summer') return <Sun className="w-3.5 h-3.5 text-amber-300" />;
    if (id === 'autumn') return <Leaf className="w-3.5 h-3.5 text-orange-400" />;
    return <Snowflake className="w-3.5 h-3.5 text-sky-300" />;
  };

  return (
    <div className="relative h-dvh w-screen overflow-hidden text-slate-100 flex flex-col bg-[#090B10]">
      <SeasonBackdrop season={currentSeason.id} />

      {/* Top Bar: Borderless gradient sky fade blended seamlessly into active season */}
      {!isFullscreen ? (
        <header className="relative z-10 w-full shrink-0 bg-gradient-to-b from-black/44 via-black/14 to-transparent">
          <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 shrink-0 drop-shadow-[0_2px_8px_rgba(0,0,0,0.65)]">
              <TetrominoMark className="w-5 h-5" />
              <span className="text-base sm:text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap">
                俄羅斯方塊
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={cycleSeason}
                title="切換季節背景"
                aria-label={`目前季節：${currentSeason.label}，點擊切換下一個季節`}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-100 hover:text-white bg-black/24 hover:bg-black/40 rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                {renderSeasonIcon(currentSeason.id)}
                <span>{currentSeason.label}</span>
              </button>

              <button
                type="button"
                onClick={() => setAutoSeasonCycle((v) => !v)}
                aria-label={autoSeasonCycle ? '暫停四季自動輪替' : '開啟四季自動輪替'}
                className={`hidden md:inline-flex items-center px-2.5 py-1.5 text-xs font-medium rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  autoSeasonCycle
                    ? `${seasonTheme.accentText} bg-white/14 hover:bg-white/22`
                    : 'text-slate-300 bg-black/22 hover:text-white hover:bg-black/38'
                }`}
              >
                {autoSeasonCycle ? '自動輪替' : '固定季節'}
              </button>

              <button
                type="button"
                onClick={toggleBgm}
                aria-label={bgmEnabled ? '關閉背景音樂' : '開啟背景音樂'}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  bgmEnabled
                    ? 'text-slate-100 hover:text-white bg-black/24 hover:bg-black/40'
                    : 'text-slate-400 bg-black/18 hover:text-slate-200'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{bgmEnabled ? '音樂開' : '音樂關'}</span>
              </button>

              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? '開啟音效' : '靜音'}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-black/24 hover:bg-black/40 rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span className="hidden sm:inline">{muted ? '已靜音' : '音效開'}</span>
              </button>

              {(ui.status === 'PLAYING' || ui.status === 'PAUSED') && (
                <button
                  type="button"
                  onClick={togglePause}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-100 hover:text-white bg-black/24 hover:bg-black/40 rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  {ui.status === 'PAUSED' ? (
                    <>
                      <Play className="w-3.5 h-3.5" />
                      <span>繼續</span>
                    </>
                  ) : (
                    <>
                      <Pause className="w-3.5 h-3.5" />
                      <span>暫停</span>
                    </>
                  )}
                </button>
              )}

              {ui.status !== 'TITLE_MENU' && (
                <button
                  type="button"
                  onClick={() => startNewGame()}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-200 ${seasonTheme.buttonBg} ${seasonTheme.buttonText}`}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>重新開始</span>
                </button>
              )}

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="進入全螢幕"
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-100 hover:text-white bg-black/24 hover:bg-black/40 rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span className="hidden md:inline">全螢幕</span>
              </button>
            </div>
          </div>
        </header>
      ) : (
        <div className="fixed top-3 right-3 z-30 flex items-center gap-2">
          <button
            type="button"
            onClick={cycleSeason}
            aria-label={`切換季節：${currentSeason.label}`}
            className="inline-flex items-center gap-1.5 px-2.5 h-9 text-xs font-medium text-slate-100 hover:text-white bg-black/30 hover:bg-black/50 rounded-lg backdrop-blur-md transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            {renderSeasonIcon(currentSeason.id)}
            <span>{currentSeason.label}</span>
          </button>

          <button
            type="button"
            onClick={toggleBgm}
            aria-label={bgmEnabled ? '關閉背景音樂' : '開啟背景音樂'}
            className={`inline-flex items-center justify-center w-9 h-9 rounded-lg backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
              bgmEnabled
                ? 'text-slate-100 bg-black/30 hover:bg-black/50'
                : 'text-slate-400 bg-black/20'
            }`}
          >
            <Music className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? '開啟音效' : '靜音'}
            className="inline-flex items-center justify-center w-9 h-9 text-slate-200 hover:text-white bg-black/30 hover:bg-black/50 rounded-lg backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {(ui.status === 'PLAYING' || ui.status === 'PAUSED') && (
            <button
              type="button"
              onClick={togglePause}
              aria-label={ui.status === 'PAUSED' ? '繼續' : '暫停'}
              className="inline-flex items-center justify-center w-9 h-9 text-slate-100 hover:text-white bg-black/30 hover:bg-black/50 rounded-lg backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              {ui.status === 'PAUSED' ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
            </button>
          )}

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="退出全螢幕"
            className="inline-flex items-center gap-1.5 px-3 h-9 text-xs font-medium text-slate-100 hover:text-white bg-black/30 hover:bg-black/50 rounded-lg backdrop-blur-md transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>退出全螢幕</span>
          </button>
        </div>
      )}

      {/* Main Play Stage: Frameless & Borderless, adaptively dissolved into each season */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-3 sm:px-6 py-2 sm:py-3">
        <div
          key={impactEffect ? `shake-${impactEffect.id}` : 'shake-idle'}
          className={
            impactEffect?.kind === 'gameover'
              ? 'animate-gameover-shake'
              : impactEffect?.kind === 'tetris' || impactEffect?.kind === 'special'
              ? 'animate-tetris-shake'
              : ''
          }
        >
          <div
            className="relative flex flex-col items-center transition-transform duration-100 ease-out"
            style={{
              transform: hardDropThump ? 'translateY(3px)' : 'translateY(0)',
            }}
          >
            {/* Soft borderless ambient seasonal aura behind play console */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-10 rounded-full blur-2xl transition-all duration-[2000ms]"
              style={{
                background: `radial-gradient(ellipse at center, ${seasonTheme.accentGlow} 0%, transparent 72%)`,
              }}
            />

            {/* Soft borderless radial impact pulse (no rectangular border) */}
            {impactEffect && (
              <div
                key={`frame-flash-${impactEffect.id}`}
                aria-hidden="true"
                className="pointer-events-none absolute -inset-8 rounded-full blur-2xl animate-border-flash"
                style={{
                  background:
                    impactEffect.kind === 'gameover'
                      ? 'radial-gradient(ellipse at center, rgba(248,113,113,0.42) 0%, transparent 72%)'
                      : impactEffect.kind === 'special'
                      ? 'radial-gradient(ellipse at center, rgba(251,146,60,0.45) 0%, transparent 72%)'
                      : 'radial-gradient(ellipse at center, rgba(251,191,36,0.45) 0%, transparent 72%)',
                }}
              />
            )}

            {/* Floating Borderless Scoreboard */}
            <div className="relative w-full max-w-[540px] px-2 sm:px-4 py-1.5 mb-2 sm:mb-2.5 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
              <div className="grid grid-cols-4 items-center gap-2 sm:gap-5">
                <div>
                  <div className="text-[10px] sm:text-[11px] text-slate-200/80">分數</div>
                  <div className="font-mono text-sm sm:text-xl font-bold text-white tabular-nums tracking-tight">
                    {ui.score.toLocaleString()}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-[10px] sm:text-[11px] text-slate-200/80">等級</div>
                  <div className={`font-mono text-sm sm:text-xl font-bold tabular-nums ${seasonTheme.accentText}`}>
                    {ui.level}
                  </div>
                </div>

                <div className="text-center">
                  <div className="text-[10px] sm:text-[11px] text-slate-200/80">消除行數</div>
                  <div className="font-mono text-sm sm:text-xl font-bold text-slate-100 tabular-nums">
                    {ui.lines}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] sm:text-[11px] text-slate-200/80">歷史最高</div>
                  <div className="font-mono text-sm sm:text-xl font-bold text-slate-100 tabular-nums">
                    {ui.highScore.toLocaleString()}
                  </div>
                </div>
              </div>

              {/* Integrated 10-segment level progress bar + Freeze / Combo telemetry */}
              <div className="mt-1.5 flex items-center gap-3">
                <div className="flex-1 grid grid-cols-10 gap-1">
                  {Array.from({ length: 10 }, (_, idx) => (
                    <div
                      key={idx}
                      className={`h-1 rounded-[2px] transition-colors ${
                        ui.freezeRemainingMs > 0
                          ? 'bg-sky-300'
                          : idx < levelProgress
                          ? seasonTheme.accentBg
                          : 'bg-white/18'
                      }`}
                    />
                  ))}
                </div>
                <span className="font-mono text-[10px] text-slate-200/90 tabular-nums whitespace-nowrap">
                  {ui.freezeRemainingMs > 0 && (
                    <span className="text-sky-300 font-semibold mr-2">
                      凍結 {(ui.freezeRemainingMs / 1000).toFixed(1)}s
                    </span>
                  )}
                  {ui.isBackToBack && (
                    <span className={`${seasonTheme.accentText} mr-1.5`}>B2B</span>
                  )}
                  {ui.combo > 0 && (
                    <span className={`${seasonTheme.accentText} mr-1.5`}>
                      連擊 x{ui.combo}
                    </span>
                  )}
                  {levelProgress}/10
                </span>
              </div>
            </div>

            {/* Mobile Floating Compact Hold + Next (no box border) */}
            <div className="flex sm:hidden items-center justify-between gap-4 w-full px-3 py-1 mb-2 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-slate-200">暫存</span>
                <PiecePreview
                  piece={ui.holdPiece}
                  width={48}
                  height={32}
                  dimmed={!ui.canHold}
                />
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-slate-200">下一個</span>
                <PiecePreview
                  piece={ui.nextPieces[0] ?? null}
                  width={48}
                  height={32}
                />
              </div>
            </div>

            {/* Frameless Playfield Row: Floating Left HUD | Feathered Playfield | Floating Right HUD */}
            <div className="relative flex items-start justify-center gap-4 sm:gap-7">
              {/* Left Floating Zone: Hold + Toggleable Keyboard Guide */}
              <div className="hidden sm:flex flex-col gap-5 w-36 md:w-44 shrink-0 pt-2 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
                <div className="px-1.5 py-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold ${seasonTheme.accentText}`}>
                      暫存方塊
                    </span>
                    <KeyCap>C</KeyCap>
                  </div>
                  <div className="py-2 flex items-center justify-center min-h-[64px]">
                    <PiecePreview
                      piece={ui.holdPiece}
                      width={108}
                      height={56}
                      dimmed={!ui.canHold}
                    />
                  </div>
                </div>

                {showControlsHint ? (
                  <div className="hidden lg:block px-1.5 py-1">
                    <div className="flex items-center justify-between mb-2.5">
                      <h2 className={`text-xs font-semibold ${seasonTheme.accentText}`}>
                        鍵盤操作
                      </h2>
                      <button
                        type="button"
                        onClick={toggleControlsHint}
                        aria-label="隱藏鍵盤操作提示"
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-slate-200 hover:text-white bg-black/28 hover:bg-black/45 rounded transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
                      >
                        <span>隱藏</span>
                        <ChevronUp className="w-3 h-3" />
                      </button>
                    </div>
                    <dl className="space-y-2 text-[11px]">
                      <div className="flex items-center justify-between text-slate-100">
                        <dt>左右移動</dt>
                        <dd className="flex items-center gap-1">
                          <KeyCap>←</KeyCap>
                          <KeyCap>→</KeyCap>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between text-slate-100">
                        <dt>順時針旋轉</dt>
                        <dd className="flex items-center gap-1">
                          <KeyCap>↑</KeyCap>
                          <KeyCap>X</KeyCap>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between text-slate-100">
                        <dt>逆時針旋轉</dt>
                        <dd>
                          <KeyCap>Z</KeyCap>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between text-slate-100">
                        <dt>加速下降</dt>
                        <dd>
                          <KeyCap>↓</KeyCap>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between text-slate-100">
                        <dt>瞬間落下</dt>
                        <dd>
                          <KeyCap>Space</KeyCap>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between text-slate-100">
                        <dt>暫存交換</dt>
                        <dd>
                          <KeyCap>Shift</KeyCap>
                        </dd>
                      </div>
                      <div className="flex items-center justify-between text-slate-100">
                        <dt>暫停遊戲</dt>
                        <dd>
                          <KeyCap>P</KeyCap>
                        </dd>
                      </div>
                    </dl>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={toggleControlsHint}
                    aria-label="顯示鍵盤操作提示"
                    className="hidden lg:flex w-full items-center justify-between px-2.5 py-2 text-xs font-medium text-slate-100 hover:text-white bg-black/28 hover:bg-black/45 rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Keyboard className="w-3.5 h-3.5 text-slate-200" />
                      <span>鍵盤操作</span>
                    </span>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-200" />
                  </button>
                )}
              </div>

              {/* Center Borderless Feathered Playfield (melts seamlessly into seasonal scenery) */}
              <div
                className={`relative transition-all duration-300 ${
                  ui.freezeRemainingMs > 0
                    ? 'drop-shadow-[0_0_24px_rgba(56,189,248,0.4)]'
                    : ''
                }`}
                style={{
                  width: `${boardPixelWidth}px`,
                  height: `${boardPixelHeight}px`,
                }}
              >
                <TetrisBoard
                  board={ui.board}
                  activePiece={ui.activePiece}
                  ghostY={ui.ghostY}
                  clearingRows={ui.clearingRows}
                  cellSize={cellSize}
                  paused={ui.status === 'PAUSED'}
                  season={currentSeason.id}
                  freezeRemainingMs={ui.freezeRemainingMs}
                  hardDropFx={hardDropFx}
                  lineClearFx={lineClearFx}
                  specialFx={specialFx}
                  cascadeFallFx={cascadeFallFx}
                />

                {/* Non-blocking line clear / T-Spin / Special Link callout */}
                {ui.status === 'PLAYING' && ui.calloutText && (
                  <div
                    className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 bg-black/55 backdrop-blur-md rounded-xl px-4 py-1.5 text-center shadow-lg whitespace-nowrap"
                    aria-live="polite"
                  >
                    <div className={`text-xs font-semibold ${seasonTheme.accentText}`}>
                      {ui.calloutText}
                    </div>
                    <div className="font-mono text-[11px] font-bold text-slate-100 tabular-nums">
                      +{ui.calloutPoints}
                    </div>
                  </div>
                )}

                {/* TITLE MENU OVERLAY (Edge-feathered mist blended with Season Backdrop) */}
                {ui.status === 'TITLE_MENU' && (
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,11,18,0.78)_0%,rgba(8,11,18,0.52)_64%,transparent_100%)] backdrop-blur-[3px] flex flex-col items-center justify-center p-4 sm:p-5 text-center overflow-y-auto">
                    <div className="mb-3 p-2.5">
                      <TetrominoMark className="w-9 h-9 drop-shadow-lg" />
                    </div>

                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white drop-shadow mb-1">
                      俄羅斯方塊
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-100/90 mb-4 max-w-[248px] leading-relaxed drop-shadow">
                      屬性方塊重合共鳴，觸發爆破、凍結與雷電連鎖消除。
                    </p>

                    <div className="w-full max-w-[236px] mb-3.5">
                      <div className="text-xs font-medium text-slate-200/90 mb-1.5">
                        玩法模式
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 p-1 bg-black/35 rounded-xl">
                        <button
                          type="button"
                          onClick={() => setAttributeMode(true)}
                          className={`py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                            ui.attributeMode
                              ? `${seasonTheme.buttonBg} ${seasonTheme.buttonText} font-semibold shadow-sm`
                              : 'text-slate-200 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          屬性連結
                        </button>
                        <button
                          type="button"
                          onClick={() => setAttributeMode(false)}
                          className={`py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                            !ui.attributeMode
                              ? `${seasonTheme.buttonBg} ${seasonTheme.buttonText} font-semibold shadow-sm`
                              : 'text-slate-200 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          經典標準
                        </button>
                      </div>
                    </div>

                    <div className="w-full max-w-[236px] mb-4">
                      <div className="text-xs font-medium text-slate-200/90 mb-1.5">
                        選擇起始等級
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 p-1 bg-black/35 rounded-xl">
                        {[
                          { lv: 1, label: '標準 · 1' },
                          { lv: 5, label: '進階 · 5' },
                          { lv: 10, label: '高手 · 10' },
                        ].map(({ lv, label }) => (
                          <button
                            key={lv}
                            type="button"
                            onClick={() => setStartLevel(lv)}
                            className={`py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                              ui.startLevel === lv
                                ? `${seasonTheme.buttonBg} ${seasonTheme.buttonText} font-semibold shadow-sm`
                                : 'text-slate-200 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => startNewGame()}
                      className={`w-full max-w-[236px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all active:translate-y-[1px] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-200 ${seasonTheme.buttonBg} ${seasonTheme.buttonText}`}
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>開始遊戲</span>
                    </button>

                    {ui.highScore > 0 && (
                      <div className="mt-3.5 text-xs text-slate-200/90">
                        最高紀錄{' '}
                        <span className="font-mono font-bold text-white tabular-nums">
                          {ui.highScore.toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* PAUSED OVERLAY (Edge-feathered mist) */}
                {ui.status === 'PAUSED' && (
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,11,18,0.78)_0%,rgba(8,11,18,0.52)_64%,transparent_100%)] backdrop-blur-[3px] flex flex-col items-center justify-center p-6 text-center">
                    <h2 className="text-2xl font-bold text-white mb-1.5">遊戲暫停</h2>
                    <p className="text-xs text-slate-200/90 mb-6">
                      按下 P 鍵或點擊下方按鈕恢復對局
                    </p>
                    <div className="flex flex-col gap-2.5 w-full max-w-[208px]">
                      <button
                        type="button"
                        onClick={togglePause}
                        className={`w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-200 ${seasonTheme.buttonBg} ${seasonTheme.buttonText}`}
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>繼續遊戲</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startNewGame()}
                        className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-100 bg-white/14 hover:bg-white/24 rounded-xl transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>重新開始</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* GAME OVER OVERLAY (Edge-feathered mist, no box borders) */}
                {ui.status === 'GAME_OVER' && (
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(8,11,18,0.84)_0%,rgba(8,11,18,0.62)_66%,transparent_100%)] backdrop-blur-[3px] flex flex-col items-center justify-center p-4 sm:p-5 text-center overflow-y-auto">
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-0.5">遊戲結束</h2>
                    <p className="text-xs text-slate-200/85 mb-4">本局結算成績與對戰統計</p>

                    <div className="w-full max-w-[236px] mb-5 space-y-2 text-xs drop-shadow">
                      <div className="flex items-center justify-between pb-1.5">
                        <span className="text-slate-200">最終分數</span>
                        <span className={`font-mono text-base font-bold tabular-nums ${seasonTheme.accentText}`}>
                          {ui.score.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">消除行數</span>
                        <span className="font-mono font-semibold text-slate-100 tabular-nums">
                          {ui.lines}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">達成等級</span>
                        <span className="font-mono font-semibold text-slate-100 tabular-nums">
                          {ui.level}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pb-1.5">
                        <span className="text-slate-300">歷史最高</span>
                        <span className="font-mono font-semibold text-slate-100 tabular-nums">
                          {ui.highScore.toLocaleString()}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-1.5">
                        <span className="text-slate-300">遊玩總時間</span>
                        <span className="font-mono font-semibold text-slate-100 tabular-nums">
                          {formatDuration(ui.elapsedMs)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">平均每分鐘 (APM)</span>
                        <span className="font-mono font-semibold text-sky-300 tabular-nums">
                          {ui.lines > 0
                            ? (ui.lines / (Math.max(ui.elapsedMs, 1000) / 60000)).toFixed(1)
                            : '0.0'}{' '}
                          行/分
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-300">T-Spin 成功次數</span>
                        <span className="font-mono font-semibold text-purple-300 tabular-nums">
                          {ui.tSpinCount} 次
                        </span>
                      </div>
                      {ui.attributeMode && (
                        <div className="flex items-center justify-between">
                          <span className="text-slate-300">屬性連結觸發</span>
                          <span className="font-mono font-semibold text-orange-300 tabular-nums">
                            {ui.specialTriggerCount} 次
                          </span>
                        </div>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => startNewGame()}
                      className={`w-full max-w-[236px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-all active:translate-y-[1px] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-200 ${seasonTheme.buttonBg} ${seasonTheme.buttonText}`}
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>再玩一次</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Right Floating Zone: Next Queue + Attribute Effects Legend */}
              <div className="hidden sm:flex flex-col gap-5 w-36 md:w-44 shrink-0 pt-2 drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
                <div className="px-1.5 py-1">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-semibold ${seasonTheme.accentText}`}>
                      下一個方塊
                    </span>
                  </div>
                  <div className="py-1.5 flex flex-col gap-2.5 items-center">
                    {[0, 1, 2].map((idx) => (
                      <div
                        key={idx}
                        className="w-full flex items-center justify-center"
                      >
                        <PiecePreview
                          piece={ui.nextPieces[idx] ?? null}
                          width={108}
                          height={idx === 0 ? 54 : 44}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                {ui.attributeMode && (
                  <div className="hidden lg:block px-1.5 py-1">
                    <h2 className={`text-xs font-semibold mb-2.5 ${seasonTheme.accentText}`}>
                      屬性連結效果
                    </h2>
                    <div className="space-y-2.5 text-[11px] leading-snug">
                      <div className="flex items-start gap-2">
                        <Flame className="w-3.5 h-3.5 text-orange-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-medium text-orange-200">烈焰 · 爆破</div>
                          <div className="text-slate-200/85">引爆 3×3 範圍方塊</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Snowflake className="w-3.5 h-3.5 text-sky-300 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-medium text-sky-200">寒冰 · 凍結</div>
                          <div className="text-slate-200/85">凍結下落重力 6 秒</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Zap className="w-3.5 h-3.5 text-yellow-300 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-medium text-yellow-200">雷電 · 貫穿</div>
                          <div className="text-slate-200/85">消除整條縱行方塊</div>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2.5 text-[10px] text-slate-200/80 leading-relaxed">
                      同屬性相連或消行即觸發；異屬性相鄰可建立連結鏈連鎖爆發，剩餘方塊將隨爆破降落。
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Borderless Touch Controls for Mobile & Tablet */}
            <div className="flex lg:hidden flex-col gap-2 w-full max-w-[360px] mt-2.5 select-none">
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={holdActivePiece}
                  aria-label="暫存方塊"
                  className="min-h-[44px] flex items-center justify-center gap-1.5 bg-black/32 active:bg-white/20 rounded-xl text-xs font-medium text-slate-100 backdrop-blur-md"
                >
                  <Repeat2 className="w-4 h-4" />
                  <span>暫存</span>
                </button>
                <button
                  type="button"
                  onClick={() => rotateActive(-1)}
                  aria-label="逆時針旋轉"
                  className="min-h-[44px] flex items-center justify-center bg-black/32 active:bg-white/20 rounded-xl text-slate-100 backdrop-blur-md"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => rotateActive(1)}
                  aria-label="順時針旋轉"
                  className="min-h-[44px] flex items-center justify-center bg-black/32 active:bg-white/20 rounded-xl text-slate-100 backdrop-blur-md"
                >
                  <RotateCw className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={hardDrop}
                  aria-label="瞬間落下"
                  className={`min-h-[44px] flex items-center justify-center gap-1 rounded-xl text-xs font-semibold backdrop-blur-md ${seasonTheme.buttonBg} ${seasonTheme.buttonText}`}
                >
                  <ChevronsDown className="w-4 h-4" />
                  <span>瞬降</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => moveHorizontal(-1, true)}
                  aria-label="向左移動"
                  className="min-h-[46px] flex items-center justify-center bg-black/32 active:bg-white/20 rounded-xl text-slate-100 backdrop-blur-md"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => softDropStep(true)}
                  aria-label="向下加速"
                  className="min-h-[46px] flex items-center justify-center bg-black/32 active:bg-white/20 rounded-xl text-slate-100 backdrop-blur-md"
                >
                  <ArrowDown className="w-5 h-5" />
                </button>
                <button
                  type="button"
                  onClick={() => moveHorizontal(1, true)}
                  aria-label="向右移動"
                  className="min-h-[46px] flex items-center justify-center bg-black/32 active:bg-white/20 rounded-xl text-slate-100 backdrop-blur-md"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
