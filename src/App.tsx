import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ChevronsDown,
  Pause,
  Play,
  Repeat2,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { PiecePreview } from './components/PiecePreview';
import { TetrisBoard } from './components/TetrisBoard';
import { soundEngine } from './game/soundEffects';
import {
  calculateLineScore,
  createEmptyBoard,
  createSpawnPiece,
  detectTSpin,
  generateBag,
  getGhostY,
  getGravityMs,
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
  TetrominoType,
} from './game/tetrisTypes';

const HIGH_SCORE_KEY = 'tetris_tw_highscore_v1';
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
    clearingRows: state.clearingRows,
    calloutText: state.calloutTimer > 0 ? state.calloutText : '',
    calloutPoints: state.calloutTimer > 0 ? state.calloutPoints : 0,
  };
}

export default function App() {
  const engineRef = useRef<EngineState>(createInitialEngineState(1));
  const [ui, setUi] = useState<UiSnapshot>(() => toSnapshot(engineRef.current));
  const [muted, setMuted] = useState(false);
  const [hardDropThump, setHardDropThump] = useState(false);
  const [cellSize, setCellSize] = useState(30);

  // Held movement key tracking for responsive DAS / ARR
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

  // Responsive board cell size so the full layout fits comfortably in viewport
  useEffect(() => {
    const computeCellSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (vw < 640) {
        const byWidth = Math.floor((vw - 48) / BOARD_COLS);
        const byHeight = Math.floor((vh - 280) / BOARD_VISIBLE_ROWS);
        setCellSize(Math.max(18, Math.min(26, byWidth, byHeight)));
      } else if (vw < 1024) {
        const byHeight = Math.floor((vh - 260) / BOARD_VISIBLE_ROWS);
        setCellSize(Math.max(22, Math.min(28, byHeight)));
      } else {
        const byHeight = Math.floor((vh - 160) / BOARD_VISIBLE_ROWS);
        setCellSize(Math.max(24, Math.min(32, byHeight)));
      }
    };

    computeCellSize();
    window.addEventListener('resize', computeCellSize);
    return () => window.removeEventListener('resize', computeCellSize);
  }, []);

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
        soundEngine.gameOver();
        return;
      }

      state.activePiece = spawned;
      state.isGrounded = !isValidPosition(state.board, {
        ...spawned,
        y: spawned.y + 1,
      });
    },
    [updateHighScoreIfNeeded]
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
        soundEngine.gameOver();
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

        updateHighScoreIfNeeded(state);
        soundEngine.clearLines(clearedRows.length);
        if (leveledUp) {
          setTimeout(() => soundEngine.levelUp(), 160);
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
      syncUi();
    },
    [spawnNextPiece, syncUi]
  );

  const togglePause = useCallback(() => {
    const state = engineRef.current;
    if (state.status === 'PLAYING') {
      state.status = 'PAUSED';
      syncUi();
    } else if (state.status === 'PAUSED') {
      state.status = 'PLAYING';
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
        // Line-clear flash phase
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
          // DAS / ARR horizontal movement
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

          // Soft drop repeat when holding down
          if (kh.down) {
            kh.softDropElapsed += dt;
            while (kh.softDropElapsed >= SOFT_DROP_MS) {
              kh.softDropElapsed -= SOFT_DROP_MS;
              softDropStep(true);
            }
          }

          // Natural gravity
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

          // Lock delay countdown when grounded
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
    toggleMute,
    togglePause,
  ]);

  const boardPixelWidth = BOARD_COLS * cellSize;
  const boardPixelHeight = BOARD_VISIBLE_ROWS * cellSize;

  return (
    <div className="min-h-screen w-full bg-[#111318] text-slate-100 flex flex-col">
      {/* Top Bar Contract: clean single row */}
      <header className="w-full border-b border-white/8 bg-[#14171E]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-8">
          <span className="text-lg font-bold tracking-tight text-slate-50 whitespace-nowrap shrink-0">
            俄羅斯方塊
          </span>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? '開啟音效' : '靜音'}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              <span className="hidden sm:inline">{muted ? '已靜音' : '音效開啟'}</span>
            </button>

            {(ui.status === 'PLAYING' || ui.status === 'PAUSED') && (
              <button
                type="button"
                onClick={togglePause}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-400"
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
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-amber-200"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>重新開始</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Play Console */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-4 sm:py-6">
        <div className="w-full max-w-4xl flex flex-col lg:flex-row items-center lg:items-start justify-center gap-5 lg:gap-7">
          {/* Left Column: Hold + Controls (Desktop) */}
          <aside className="hidden lg:flex flex-col gap-5 w-48 shrink-0">
            <div className="bg-[#181B22] border border-white/8 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-400">暫存方塊</span>
                <span className="font-mono text-[11px] text-slate-500">C / Shift</span>
              </div>
              <div className="bg-[#0E1015] border border-white/6 rounded-lg py-2 flex items-center justify-center min-h-[76px]">
                <PiecePreview
                  type={ui.holdPiece}
                  width={120}
                  height={64}
                  dimmed={!ui.canHold}
                />
              </div>
            </div>

            <div className="bg-[#181B22] border border-white/8 rounded-xl p-4">
              <h2 className="text-xs font-medium text-slate-400 mb-3">鍵盤操作</h2>
              <dl className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-300">
                  <dt>左右移動</dt>
                  <dd className="font-mono text-slate-400">← →</dd>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <dt>順時針旋轉</dt>
                  <dd className="font-mono text-slate-400">↑ / X</dd>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <dt>逆時針旋轉</dt>
                  <dd className="font-mono text-slate-400">Z</dd>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <dt>加速下降</dt>
                  <dd className="font-mono text-slate-400">↓</dd>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <dt>瞬間落下</dt>
                  <dd className="font-mono text-slate-400">Space</dd>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <dt>暫存交換</dt>
                  <dd className="font-mono text-slate-400">C / Shift</dd>
                </div>
                <div className="flex items-center justify-between text-slate-300">
                  <dt>暫停遊戲</dt>
                  <dd className="font-mono text-slate-400">P / Esc</dd>
                </div>
              </dl>
            </div>
          </aside>

          {/* Mobile Compact Top HUD (Hold + Score + Next 1) */}
          <div className="flex lg:hidden items-center justify-between gap-3 w-full max-w-[360px] bg-[#181B22] border border-white/8 rounded-xl px-3.5 py-2.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">暫存</span>
              <div className="bg-[#0E1015] border border-white/6 rounded-md px-1 py-0.5">
                <PiecePreview
                  type={ui.holdPiece}
                  width={48}
                  height={34}
                  dimmed={!ui.canHold}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 text-center">
              <div>
                <div className="text-[10px] text-slate-400">分數</div>
                <div className="font-mono text-sm font-bold text-slate-50 tabular-nums">
                  {ui.score.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">等級</div>
                <div className="font-mono text-sm font-bold text-amber-400 tabular-nums">
                  {ui.level}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">行數</div>
                <div className="font-mono text-sm font-bold text-slate-200 tabular-nums">
                  {ui.lines}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-400">下一個</span>
              <div className="bg-[#0E1015] border border-white/6 rounded-md px-1 py-0.5">
                <PiecePreview
                  type={ui.nextPieces[0] ?? null}
                  width={48}
                  height={34}
                />
              </div>
            </div>
          </div>

          {/* Center Focal Anchor: Playfield */}
          <div className="relative flex flex-col items-center">
            <div
              className="relative bg-[#181B22] border border-white/10 rounded-xl p-2.5 shadow-[0_20px_50px_rgba(0,0,0,0.55)] transition-transform duration-100 ease-out"
              style={{
                transform: hardDropThump ? 'translateY(3px)' : 'translateY(0)',
              }}
            >
              <div
                className="relative rounded-md overflow-hidden border border-white/8"
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
                />

                {/* Non-blocking line clear / T-Spin callout */}
                {ui.status === 'PLAYING' && ui.calloutText && (
                  <div
                    className="pointer-events-none absolute top-4 left-1/2 -translate-x-1/2 bg-[#14171E]/92 border border-amber-400/40 rounded-lg px-3 py-1.5 text-center shadow-lg whitespace-nowrap"
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

                {/* TITLE MENU OVERLAY */}
                {ui.status === 'TITLE_MENU' && (
                  <div className="absolute inset-0 bg-[#0D1016]/90 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center">
                    <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-2">
                      俄羅斯方塊
                    </h1>
                    <p className="text-xs sm:text-sm text-slate-400 mb-6 max-w-[240px] leading-relaxed">
                      支援現代 SRS 旋轉踢牆、幽靈落點預覽與暫存交換機制。
                    </p>

                    <div className="w-full max-w-[220px] mb-6">
                      <div className="text-xs text-slate-400 mb-2">起始速度等級</div>
                      <div className="grid grid-cols-3 gap-1.5 p-1 bg-[#181B22] border border-white/8 rounded-lg">
                        {[1, 5, 10].map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setStartLevel(lvl)}
                            className={`py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400 ${
                              ui.startLevel === lvl
                                ? 'bg-amber-400 text-slate-950 font-semibold'
                                : 'text-slate-300 hover:text-white hover:bg-white/5'
                            }`}
                          >
                            等級 {lvl}
                          </button>
                        ))}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => startNewGame()}
                      className="w-full max-w-[220px] inline-flex items-center justify-center gap-2 px-5 py-3 text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-200"
                    >
                      <Play className="w-4 h-4 fill-current" />
                      <span>開始遊戲</span>
                    </button>

                    {ui.highScore > 0 && (
                      <div className="mt-4 text-xs text-slate-400">
                        最高紀錄 <span className="font-mono font-bold text-slate-200 tabular-nums">{ui.highScore.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* PAUSED OVERLAY */}
                {ui.status === 'PAUSED' && (
                  <div className="absolute inset-0 bg-[#0D1016]/88 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center">
                    <h2 className="text-2xl font-bold text-white mb-2">遊戲暫停</h2>
                    <p className="text-xs text-slate-400 mb-6">按下 P 鍵或點擊下方按鈕繼續</p>
                    <div className="flex flex-col gap-2.5 w-full max-w-[200px]">
                      <button
                        type="button"
                        onClick={togglePause}
                        className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-200"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>繼續遊戲</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => startNewGame()}
                        className="w-full inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-medium text-slate-200 bg-white/8 hover:bg-white/12 border border-white/10 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-400"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>重新開始</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* GAME OVER OVERLAY */}
                {ui.status === 'GAME_OVER' && (
                  <div className="absolute inset-0 bg-[#0D1016]/92 backdrop-blur-[2px] flex flex-col items-center justify-center p-6 text-center">
                    <h2 className="text-2xl font-bold text-white mb-1">遊戲結束</h2>
                    <p className="text-xs text-slate-400 mb-5">本局結算成績</p>

                    <div className="w-full max-w-[210px] bg-[#181B22] border border-white/10 rounded-lg p-3.5 mb-5 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">最終分數</span>
                        <span className="font-mono text-sm font-bold text-amber-400 tabular-nums">
                          {ui.score.toLocaleString()}
                        </span>
                      </div>
                      <div className="h-px bg-white/6" />
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">消除行數</span>
                        <span className="font-mono font-semibold text-slate-100 tabular-nums">
                          {ui.lines}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">達成等級</span>
                        <span className="font-mono font-semibold text-slate-100 tabular-nums">
                          {ui.level}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400">歷史最高</span>
                        <span className="font-mono font-semibold text-slate-100 tabular-nums">
                          {ui.highScore.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => startNewGame()}
                      className="w-full max-w-[210px] inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors whitespace-nowrap focus-visible:outline-2 focus-visible:outline-amber-200"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>再玩一次</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Stats & Next Queue (Desktop) */}
          <aside className="hidden lg:flex flex-col gap-5 w-48 shrink-0">
            <div className="bg-[#181B22] border border-white/8 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-slate-400">下一個方塊</span>
              </div>
              <div className="bg-[#0E1015] border border-white/6 rounded-lg py-2.5 flex flex-col gap-2 items-center">
                {[0, 1, 2].map((idx) => (
                  <div
                    key={idx}
                    className={`w-full flex items-center justify-center ${
                      idx > 0 ? 'pt-1 border-t border-white/5' : ''
                    }`}
                  >
                    <PiecePreview
                      type={ui.nextPieces[idx] ?? null}
                      width={116}
                      height={idx === 0 ? 60 : 50}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-[#181B22] border border-white/8 rounded-xl p-4 space-y-3">
              <div>
                <div className="text-xs text-slate-400 mb-0.5">分數</div>
                <div className="font-mono text-2xl font-bold text-slate-50 tabular-nums">
                  {ui.score.toLocaleString()}
                </div>
              </div>

              <div className="h-px bg-white/8" />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">等級</div>
                  <div className="font-mono text-lg font-bold text-amber-400 tabular-nums">
                    {ui.level}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-0.5">消除行數</div>
                  <div className="font-mono text-lg font-bold text-slate-100 tabular-nums">
                    {ui.lines}
                  </div>
                </div>
              </div>

              <div className="h-px bg-white/8" />

              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">最高分</span>
                <span className="font-mono font-semibold text-slate-200 tabular-nums">
                  {ui.highScore.toLocaleString()}
                </span>
              </div>
            </div>
          </aside>

          {/* Touch Controls for Mobile & Tablet */}
          <div className="flex lg:hidden flex-col gap-2.5 w-full max-w-[360px] select-none">
            <div className="grid grid-cols-4 gap-2">
              <button
                type="button"
                onClick={holdActivePiece}
                aria-label="暫存方塊"
                className="min-h-[46px] flex items-center justify-center gap-1.5 bg-[#181B22] active:bg-white/15 border border-white/10 rounded-xl text-xs font-medium text-slate-200"
              >
                <Repeat2 className="w-4 h-4" />
                <span>暫存</span>
              </button>
              <button
                type="button"
                onClick={() => rotateActive(-1)}
                aria-label="逆時針旋轉"
                className="min-h-[46px] flex items-center justify-center bg-[#181B22] active:bg-white/15 border border-white/10 rounded-xl text-slate-200"
              >
                <RotateCcw className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => rotateActive(1)}
                aria-label="順時針旋轉"
                className="min-h-[46px] flex items-center justify-center bg-[#181B22] active:bg-white/15 border border-white/10 rounded-xl text-slate-200"
              >
                <RotateCw className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={hardDrop}
                aria-label="瞬間落下"
                className="min-h-[46px] flex items-center justify-center gap-1 bg-amber-400/15 active:bg-amber-400/30 border border-amber-400/30 rounded-xl text-xs font-semibold text-amber-300"
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
                className="min-h-[50px] flex items-center justify-center bg-[#181B22] active:bg-white/15 border border-white/10 rounded-xl text-slate-100"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => softDropStep(true)}
                aria-label="向下加速"
                className="min-h-[50px] flex items-center justify-center bg-[#181B22] active:bg-white/15 border border-white/10 rounded-xl text-slate-100"
              >
                <ArrowDown className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => moveHorizontal(1, true)}
                aria-label="向右移動"
                className="min-h-[50px] flex items-center justify-center bg-[#181B22] active:bg-white/15 border border-white/10 rounded-xl text-slate-100"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
