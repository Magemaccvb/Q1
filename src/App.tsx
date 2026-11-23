import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
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
} from 'lucide-react';
import { PiecePreview } from './components/PiecePreview';
import { SEASONS, SeasonBackdrop } from './components/SeasonBackdrop';
import {
  HardDropFxEvent,
  LineClearFxEvent,
  TetrisBoard,
} from './components/TetrisBoard';
import { SeasonId, soundEngine } from './game/soundEffects';
import {
  calculateLineScore,
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
  tryRotatePiece,
} from './game/tetrisEngine';
import {
  ActivePiece,
  BOARD_COLS,
  BOARD_VISIBLE_ROWS,
  BoardGrid,
  GameStatus,
  LINE_CLEAR_FLASH_MS,
  LOCK_DELAY_MS,
  MAX_LOCK_RESETS,
  PIECE_PALETTE,
  TetrominoType,
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
  holdPiece: TetrominoType | null;
  canHold: boolean;
  queue: TetrominoType[];
  score: number;
  highScore: number;
  startLevel: number;
  level: number;
  lines: number;
  combo: number;
  isBackToBack: boolean;
  clearingRows: number[];
  clearFlashTimer: number;
  gravityTimer: number;
  lockTimer: number;
  lockResets: number;
  isGrounded: boolean;
  lastActionWasRotate: boolean;
  lastKickIndex: number;
  calloutText: string;
  calloutPoints: number;
  calloutTimer: number;
}

interface UiSnapshot {
  status: GameStatus;
  board: BoardGrid;
  activePiece: ActivePiece | null;
  ghostY: number | null;
  holdPiece: TetrominoType | null;
  canHold: boolean;
  nextPieces: TetrominoType[];
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

function ensureQueue(queue: TetrominoType[]): TetrominoType[] {
  const next = [...queue];
  while (next.length < 7) {
    next.push(...generateBag());
  }
  return next;
}

function createInitialEngineState(startLevel = 1): EngineState {
  const queue = ensureQueue([]);
  return {
    status: 'TITLE_MENU',
    board: createEmptyBoard(),
    activePiece: null,
    holdPiece: null,
    canHold: true,
    queue,
    score: 0,
    highScore: loadHighScore(),
    startLevel,
    level: startLevel,
    lines: 0,
    combo: -1,
    isBackToBack: false,
    clearingRows: [],
    clearFlashTimer: 0,
    gravityTimer: 0,
    lockTimer: 0,
    lockResets: 0,
    isGrounded: false,
    lastActionWasRotate: false,
    lastKickIndex: 0,
    calloutText: '',
    calloutPoints: 0,
    calloutTimer: 0,
  };
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
    <kbd className="inline-flex items-center justify-center min-w-[24px] px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-200 bg-[#222631] border border-white/12 border-b-2 border-b-black/60 rounded shadow-sm">
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
  const [impactEffect, setImpactEffect] = useState<{
    id: number;
    kind: 'tetris' | 'gameover';
  } | null>(null);
  const fxIdRef = useRef(1);
  const impactTimeoutRef = useRef<number | null>(null);

  const triggerImpact = useCallback((kind: 'tetris' | 'gameover') => {
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
      state.queue = ensureQueue(state.queue);
      const nextType = state.queue.shift()!;
      state.queue = ensureQueue(state.queue);

      const spawned = createSpawnPiece(nextType);
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

  const lockActivePiece = useCallback(
    (state: EngineState) => {
      if (!state.activePiece) return;

      const tSpin = detectTSpin(
        state.board,
        state.activePiece,
        state.lastActionWasRotate,
        state.lastKickIndex
      );

      const { nextBoard, clearedRows, lockedAboveVisible } = lockPieceToBoard(
        state.board,
        state.activePiece
      );

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

        state.calloutText =
          nextCombo > 0 ? `${scoring.label} · 連擊 x${nextCombo}` : scoring.label;
        state.calloutPoints = scoring.points;
        state.calloutTimer = 1400;

        // Emit particle burst colors from the first cleared row
        const sampleRow = nextBoard[clearedRows[0]];
        const colors = sampleRow.map((cell) =>
          cell ? PIECE_PALETTE[cell].highlight : '#FBBF24'
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
      } else {
        state.combo = -1;
        if (tSpin !== 'NONE') {
          const scoring = calculateLineScore({
            linesCleared: 0,
            level: state.level,
            tSpin,
            combo: 0,
            isBackToBack: state.isBackToBack,
          });
          state.score += scoring.points;
          state.calloutText = scoring.label;
          state.calloutPoints = scoring.points;
          state.calloutTimer = 1100;
          updateHighScoreIfNeeded(state);
        }
        soundEngine.lock();
        spawnNextPiece(state);
      }
    },
    [spawnNextPiece, updateHighScoreIfNeeded]
  );

  const startNewGame = useCallback(
    (selectedStartLevel?: number) => {
      const prev = engineRef.current;
      const startLv = selectedStartLevel ?? prev.startLevel;
      const fresh = createInitialEngineState(startLv);
      fresh.status = 'PLAYING';
      fresh.highScore = Math.max(prev.highScore, loadHighScore());
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

    const currentType = state.activePiece.type;
    if (state.holdPiece === null) {
      state.holdPiece = currentType;
      spawnNextPiece(state);
    } else {
      const swappedType = state.holdPiece;
      state.holdPiece = currentType;
      const spawned = createSpawnPiece(swappedType);
      if (!isValidPosition(state.board, spawned)) {
        state.activePiece = null;
        state.status = 'GAME_OVER';
        updateHighScoreIfNeeded(state);
        soundEngine.gameOver();
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
  }, [spawnNextPiece, syncUi, updateHighScoreIfNeeded]);

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
        if (state.clearingRows.length > 0) {
          state.clearFlashTimer -= dt;
          if (state.clearFlashTimer <= 0) {
            state.board = removeClearedRows(state.board, state.clearingRows);
            state.clearingRows = [];
            state.clearFlashTimer = 0;
            spawnNextPiece(state);
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

      if (dirty) {
        syncUi();
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [lockActivePiece, moveHorizontal, softDropStep, spawnNextPiece, syncUi]);

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

      {/* Top Bar Contract: translucent glass blended into seasonal sky */}
      {!isFullscreen ? (
        <header className="relative z-10 w-full shrink-0 border-b border-white/10 bg-[#0B0E15]/32 backdrop-blur-md">
          <div className="w-full max-w-6xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5 shrink-0">
              <TetrominoMark className="w-5 h-5" />
              <span className="text-base sm:text-lg font-bold tracking-tight text-slate-50 drop-shadow-sm whitespace-nowrap">
                俄羅斯方塊
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={cycleSeason}
                title="切換季節背景"
                aria-label={`目前季節：${currentSeason.label}，點擊切換下一個季節`}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-100 hover:text-white bg-white/10 hover:bg-white/18 border border-white/15 rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                {renderSeasonIcon(currentSeason.id)}
                <span>{currentSeason.label}</span>
              </button>

              <button
                type="button"
                onClick={() => setAutoSeasonCycle((v) => !v)}
                aria-label={autoSeasonCycle ? '暫停四季自動輪替' : '開啟四季自動輪替'}
                className={`hidden md:inline-flex items-center px-2.5 py-1.5 text-xs font-medium border rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  autoSeasonCycle
                    ? 'text-amber-200 bg-amber-400/18 border-amber-300/35 hover:bg-amber-400/25'
                    : 'text-slate-300 bg-white/8 border-white/12 hover:text-white'
                }`}
              >
                {autoSeasonCycle ? '自動輪替' : '固定季節'}
              </button>

              <button
                type="button"
                onClick={toggleBgm}
                aria-label={bgmEnabled ? '關閉背景音樂' : '開啟背景音樂'}
                className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium border rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400 ${
                  bgmEnabled
                    ? 'text-slate-100 hover:text-white bg-white/10 hover:bg-white/18 border-white/15'
                    : 'text-slate-400 bg-white/5 border-white/10 hover:text-slate-200'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{bgmEnabled ? '音樂開' : '音樂關'}</span>
              </button>

              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? '開啟音效' : '靜音'}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-white/10 hover:bg-white/18 border border-white/15 rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                <span className="hidden sm:inline">{muted ? '已靜音' : '音效開'}</span>
              </button>

              {(ui.status === 'PLAYING' || ui.status === 'PAUSED') && (
                <button
                  type="button"
                  onClick={togglePause}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-100 hover:text-white bg-white/10 hover:bg-white/18 border border-white/15 rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
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
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 border-b-2 border-amber-600 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-200"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>重新開始</span>
                </button>
              )}

              <button
                type="button"
                onClick={toggleFullscreen}
                aria-label="進入全螢幕"
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-100 hover:text-white bg-white/10 hover:bg-white/18 border border-white/15 rounded-lg backdrop-blur-sm transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
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
            className="inline-flex items-center gap-1.5 px-2.5 h-9 text-xs font-medium text-slate-100 hover:text-white bg-[#0B0E15]/45 hover:bg-[#0B0E15]/65 border border-white/15 rounded-lg backdrop-blur-md transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            {renderSeasonIcon(currentSeason.id)}
            <span>{currentSeason.label}</span>
          </button>

          <button
            type="button"
            onClick={toggleBgm}
            aria-label={bgmEnabled ? '關閉背景音樂' : '開啟背景音樂'}
            className={`inline-flex items-center justify-center w-9 h-9 border border-white/15 rounded-lg backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-amber-400 ${
              bgmEnabled
                ? 'text-slate-100 bg-[#0B0E15]/45 hover:bg-[#0B0E15]/65'
                : 'text-slate-400 bg-[#0B0E15]/30'
            }`}
          >
            <Music className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? '開啟音效' : '靜音'}
            className="inline-flex items-center justify-center w-9 h-9 text-slate-200 hover:text-white bg-[#0B0E15]/45 hover:bg-[#0B0E15]/65 border border-white/15 rounded-lg backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {(ui.status === 'PLAYING' || ui.status === 'PAUSED') && (
            <button
              type="button"
              onClick={togglePause}
              aria-label={ui.status === 'PAUSED' ? '繼續' : '暫停'}
              className="inline-flex items-center justify-center w-9 h-9 text-slate-100 hover:text-white bg-[#0B0E15]/45 hover:bg-[#0B0E15]/65 border border-white/15 rounded-lg backdrop-blur-md transition-colors focus-visible:outline-2 focus-visible:outline-amber-400"
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
            className="inline-flex items-center gap-1.5 px-3 h-9 text-xs font-medium text-slate-100 hover:text-white bg-[#0B0E15]/45 hover:bg-[#0B0E15]/65 border border-white/15 rounded-lg backdrop-blur-md transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
          >
            <Minimize2 className="w-3.5 h-3.5" />
            <span>退出全螢幕</span>
          </button>
        </div>
      )}

      {/* Main Play Console: Unified Translucent Glass Frame fused with Background */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-3 sm:px-6 py-2 sm:py-3">
        <div
          key={impactEffect ? `shake-${impactEffect.id}` : 'shake-idle'}
          className={
            impactEffect?.kind === 'gameover'
              ? 'animate-gameover-shake'
              : impactEffect?.kind === 'tetris'
              ? 'animate-tetris-shake'
              : ''
          }
        >
          <div
            className="relative flex flex-col items-center bg-[#0B0E16]/36 backdrop-blur-md border border-white/16 border-t-white/25 rounded-2xl p-2.5 sm:p-4 shadow-[0_24px_64px_rgba(0,0,0,0.45)] transition-transform duration-100 ease-out"
            style={{
              transform: hardDropThump ? 'translateY(3px)' : 'translateY(0)',
            }}
          >
            {impactEffect && (
              <div
                key={`frame-flash-${impactEffect.id}`}
                aria-hidden="true"
                className={`pointer-events-none absolute inset-0 rounded-2xl animate-border-flash ${
                  impactEffect.kind === 'gameover'
                    ? 'border-2 border-red-400 shadow-[0_0_32px_rgba(248,113,113,0.65),inset_0_0_24px_rgba(248,113,113,0.35)]'
                    : 'border-2 border-amber-300 shadow-[0_0_36px_rgba(251,191,36,0.75),inset_0_0_24px_rgba(251,191,36,0.35)]'
                }`}
              />
            )}
          {/* Integrated Scoreboard INSIDE the Game Frame */}
          <div className="w-full bg-black/22 border border-white/10 rounded-xl px-3.5 sm:px-4 py-2 mb-2.5 sm:mb-3">
            <div className="grid grid-cols-4 items-center gap-2 sm:gap-5">
              <div>
                <div className="text-[10px] sm:text-[11px] text-slate-300/80">分數</div>
                <div className="font-mono text-sm sm:text-xl font-bold text-white tabular-nums tracking-tight">
                  {ui.score.toLocaleString()}
                </div>
              </div>

              <div className="text-center">
                <div className="text-[10px] sm:text-[11px] text-slate-300/80">等級</div>
                <div className="font-mono text-sm sm:text-xl font-bold text-amber-300 tabular-nums">
                  {ui.level}
                </div>
              </div>

              <div className="text-center">
                <div className="text-[10px] sm:text-[11px] text-slate-300/80">消除行數</div>
                <div className="font-mono text-sm sm:text-xl font-bold text-slate-100 tabular-nums">
                  {ui.lines}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] sm:text-[11px] text-slate-300/80">歷史最高</div>
                <div className="font-mono text-sm sm:text-xl font-bold text-slate-200 tabular-nums">
                  {ui.highScore.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Integrated 10-segment level progress bar + active combo/B2B note */}
            <div className="mt-1.5 flex items-center gap-3">
              <div className="flex-1 grid grid-cols-10 gap-1">
                {Array.from({ length: 10 }, (_, idx) => (
                  <div
                    key={idx}
                    className={`h-1 rounded-[2px] transition-colors ${
                      idx < levelProgress ? 'bg-amber-400' : 'bg-white/12'
                    }`}
                  />
                ))}
              </div>
              <span className="font-mono text-[10px] text-slate-300/80 tabular-nums whitespace-nowrap">
                {ui.isBackToBack && <span className="text-amber-300 mr-1.5">B2B</span>}
                {ui.combo > 0 && <span className="text-amber-300 mr-1.5">連擊 x{ui.combo}</span>}
                {levelProgress}/10
              </span>
            </div>
          </div>

          {/* Mobile Compact Hold + Next inside the Game Frame */}
          <div className="flex sm:hidden items-center justify-between gap-4 w-full bg-black/20 border border-white/10 rounded-xl px-3 py-1.5 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-300">暫存</span>
              <PiecePreview
                type={ui.holdPiece}
                width={48}
                height={32}
                dimmed={!ui.canHold}
              />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-300">下一個</span>
              <PiecePreview
                type={ui.nextPieces[0] ?? null}
                width={48}
                height={32}
              />
            </div>
          </div>

          {/* Unified Playfield Row: Hold | 10x20 Smoked-Glass Board | Next */}
          <div className="flex items-start justify-center gap-3 sm:gap-4">
            {/* Left Integrated Compartment: Hold + Toggleable Keyboard Guide */}
            <div className="hidden sm:flex flex-col gap-3 w-36 md:w-44 shrink-0">
              <div className="bg-black/22 border border-white/10 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-200">暫存方塊</span>
                  <KeyCap>C</KeyCap>
                </div>
                <div className="bg-black/25 border border-white/8 rounded-lg py-2 flex items-center justify-center min-h-[68px]">
                  <PiecePreview
                    type={ui.holdPiece}
                    width={108}
                    height={56}
                    dimmed={!ui.canHold}
                  />
                </div>
              </div>

              {showControlsHint ? (
                <div className="hidden lg:block bg-black/22 border border-white/10 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2.5">
                    <h2 className="text-xs font-semibold text-slate-200">鍵盤操作</h2>
                    <button
                      type="button"
                      onClick={toggleControlsHint}
                      aria-label="隱藏鍵盤操作提示"
                      className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[11px] font-medium text-slate-300 hover:text-white bg-white/8 hover:bg-white/14 rounded transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
                    >
                      <span>隱藏</span>
                      <ChevronUp className="w-3 h-3" />
                    </button>
                  </div>
                  <dl className="space-y-2 text-[11px]">
                    <div className="flex items-center justify-between text-slate-200">
                      <dt>左右移動</dt>
                      <dd className="flex items-center gap-1">
                        <KeyCap>←</KeyCap>
                        <KeyCap>→</KeyCap>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-slate-200">
                      <dt>順時針旋轉</dt>
                      <dd className="flex items-center gap-1">
                        <KeyCap>↑</KeyCap>
                        <KeyCap>X</KeyCap>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-slate-200">
                      <dt>逆時針旋轉</dt>
                      <dd>
                        <KeyCap>Z</KeyCap>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-slate-200">
                      <dt>加速下降</dt>
                      <dd>
                        <KeyCap>↓</KeyCap>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-slate-200">
                      <dt>瞬間落下</dt>
                      <dd>
                        <KeyCap>Space</KeyCap>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-slate-200">
                      <dt>暫存交換</dt>
                      <dd>
                        <KeyCap>Shift</KeyCap>
                      </dd>
                    </div>
                    <div className="flex items-center justify-between text-slate-200">
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
                  className="hidden lg:flex w-full items-center justify-between px-3 py-2.5 text-xs font-medium text-slate-200 hover:text-white bg-black/22 hover:bg-black/32 border border-white/10 rounded-xl transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Keyboard className="w-3.5 h-3.5 text-slate-300" />
                    <span>鍵盤操作</span>
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-300" />
                </button>
              )}
            </div>

            {/* Center Translucent Smoked-Glass Playfield */}
            <div
              className="relative rounded-xl overflow-hidden border border-white/18 shadow-[inset_0_2px_18px_rgba(0,0,0,0.55)]"
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
                hardDropFx={hardDropFx}
                lineClearFx={lineClearFx}
              />

              {impactEffect && (
                <div
                  key={`board-flash-${impactEffect.id}`}
                  aria-hidden="true"
                  className={`pointer-events-none absolute inset-0 rounded-xl animate-border-flash ${
                    impactEffect.kind === 'gameover'
                      ? 'border-2 border-red-400 shadow-[inset_0_0_28px_rgba(248,113,113,0.5)]'
                      : 'border-2 border-amber-300 shadow-[inset_0_0_28px_rgba(251,191,36,0.55)]'
                  }`}
                />
              )}

              {/* Non-blocking line clear / T-Spin callout */}
              {ui.status === 'PLAYING' && ui.calloutText && (
                <div
                  className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 bg-[#0B0E16]/70 backdrop-blur-md border border-amber-300/45 rounded-lg px-3.5 py-1.5 text-center shadow-lg whitespace-nowrap"
                  aria-live="polite"
                >
                  <div className="text-xs font-semibold text-amber-300">
                    {ui.calloutText}
                  </div>
                  <div className="font-mono text-[11px] font-bold text-slate-100 tabular-nums">
                    +{ui.calloutPoints}
                  </div>
                </div>
              )}

              {/* TITLE MENU OVERLAY (Translucent Glass fused with Season Backdrop) */}
              {ui.status === 'TITLE_MENU' && (
                <div className="absolute inset-0 bg-[#090C14]/56 backdrop-blur-md flex flex-col items-center justify-center p-5 text-center">
                  <div className="mb-3.5 p-3 bg-white/10 border border-white/15 rounded-2xl shadow-lg">
                    <TetrominoMark className="w-9 h-9" />
                  </div>

                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white drop-shadow mb-1.5">
                    俄羅斯方塊
                  </h1>
                  <p className="text-xs sm:text-sm text-slate-200/85 mb-5 max-w-[235px] leading-relaxed">
                    四季景緻相伴，體驗流暢 SRS 旋轉與立體方塊打擊感。
                  </p>

                  <div className="w-full max-w-[228px] mb-5">
                    <div className="text-xs font-medium text-slate-200/90 mb-2">
                      選擇起始等級
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-black/30 border border-white/12 rounded-xl">
                      {[
                        { lv: 1, label: '標準 · 1' },
                        { lv: 5, label: '進階 · 5' },
                        { lv: 10, label: '高手 · 10' },
                      ].map(({ lv, label }) => (
                        <button
                          key={lv}
                          type="button"
                          onClick={() => setStartLevel(lv)}
                          className={`py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                            ui.startLevel === lv
                              ? 'bg-amber-400 text-slate-950 font-semibold shadow-sm'
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
                    className="w-full max-w-[228px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 border-b-2 border-amber-600 rounded-xl transition-all active:translate-y-[1px] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-200"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>開始遊戲</span>
                  </button>

                  {ui.highScore > 0 && (
                    <div className="mt-4 text-xs text-slate-200/85">
                      最高紀錄{' '}
                      <span className="font-mono font-bold text-white tabular-nums">
                        {ui.highScore.toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* PAUSED OVERLAY (Translucent Glass) */}
              {ui.status === 'PAUSED' && (
                <div className="absolute inset-0 bg-[#090C14]/54 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                  <h2 className="text-2xl font-bold text-white mb-1.5">遊戲暫停</h2>
                  <p className="text-xs text-slate-200/85 mb-6">
                    按下 P 鍵或點擊下方按鈕恢復對局
                  </p>
                  <div className="flex flex-col gap-2.5 w-full max-w-[208px]">
                    <button
                      type="button"
                      onClick={togglePause}
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 border-b-2 border-amber-600 rounded-xl transition-all whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-200"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>繼續遊戲</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => startNewGame()}
                      className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-100 bg-white/12 hover:bg-white/20 border border-white/15 rounded-xl transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>重新開始</span>
                    </button>
                  </div>
                </div>
              )}

              {/* GAME OVER OVERLAY (Translucent Glass) */}
              {ui.status === 'GAME_OVER' && (
                <div className="absolute inset-0 bg-[#090C14]/62 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
                  <h2 className="text-2xl font-bold text-white mb-1">遊戲結束</h2>
                  <p className="text-xs text-slate-200/85 mb-5">本局結算成績</p>

                  <div className="w-full max-w-[220px] bg-black/30 border border-white/15 rounded-xl p-4 mb-5 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">最終分數</span>
                      <span className="font-mono text-base font-bold text-amber-300 tabular-nums">
                        {ui.score.toLocaleString()}
                      </span>
                    </div>
                    <div className="h-px bg-white/10" />
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
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">歷史最高</span>
                      <span className="font-mono font-semibold text-slate-100 tabular-nums">
                        {ui.highScore.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => startNewGame()}
                    className="w-full max-w-[220px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 border-b-2 border-amber-600 rounded-xl transition-all active:translate-y-[1px] whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-200"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>再玩一次</span>
                  </button>
                </div>
              )}
            </div>

            {/* Right Integrated Compartment: Next Queue */}
            <div className="hidden sm:flex flex-col gap-3 w-36 md:w-44 shrink-0">
              <div className="bg-black/22 border border-white/10 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-200">下一個方塊</span>
                </div>
                <div className="bg-black/25 border border-white/8 rounded-lg py-2 flex flex-col gap-1.5 items-center">
                  {[0, 1, 2].map((idx) => (
                    <div
                      key={idx}
                      className={`w-full flex items-center justify-center ${
                        idx > 0 ? 'pt-1.5 border-t border-white/8' : ''
                      }`}
                    >
                      <PiecePreview
                        type={ui.nextPieces[idx] ?? null}
                        width={108}
                        height={idx === 0 ? 54 : 44}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Touch Controls integrated for Mobile & Tablet */}
          <div className="flex lg:hidden flex-col gap-2 w-full max-w-[360px] mt-2.5 select-none">
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={holdActivePiece}
                aria-label="暫存方塊"
                className="min-h-[44px] flex items-center justify-center gap-1.5 bg-white/10 active:bg-white/20 border border-white/15 rounded-xl text-xs font-medium text-slate-100 backdrop-blur-sm"
              >
                <Repeat2 className="w-4 h-4" />
                <span>暫存</span>
              </button>
              <button
                type="button"
                onClick={() => rotateActive(-1)}
                aria-label="逆時針旋轉"
                className="min-h-[44px] flex items-center justify-center bg-white/10 active:bg-white/20 border border-white/15 rounded-xl text-slate-100 backdrop-blur-sm"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => rotateActive(1)}
                aria-label="順時針旋轉"
                className="min-h-[44px] flex items-center justify-center bg-white/10 active:bg-white/20 border border-white/15 rounded-xl text-slate-100 backdrop-blur-sm"
              >
                <RotateCw className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={hardDrop}
                aria-label="瞬間落下"
                className="min-h-[44px] flex items-center justify-center gap-1 bg-amber-400/25 active:bg-amber-400/40 border border-amber-300/40 rounded-xl text-xs font-semibold text-amber-200 backdrop-blur-sm"
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
                className="min-h-[46px] flex items-center justify-center bg-white/10 active:bg-white/20 border border-white/15 rounded-xl text-slate-100 backdrop-blur-sm"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => softDropStep(true)}
                aria-label="向下加速"
                className="min-h-[46px] flex items-center justify-center bg-white/10 active:bg-white/20 border border-white/15 rounded-xl text-slate-100 backdrop-blur-sm"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => moveHorizontal(1, true)}
                aria-label="向右移動"
                className="min-h-[46px] flex items-center justify-center bg-white/10 active:bg-white/20 border border-white/15 rounded-xl text-slate-100 backdrop-blur-sm"
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
