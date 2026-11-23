import { useEffect, useRef } from 'react';
import {
  ActivePiece,
  BOARD_BUFFER_ROWS,
  BOARD_COLS,
  BOARD_VISIBLE_ROWS,
  BoardGrid,
  PIECE_PALETTE,
  TetrominoType,
} from '../game/tetrisTypes';
import { getPieceCells } from '../game/tetrisEngine';
import {
  drawDropTrailColumn,
  drawGhostBlock,
  drawTactileBlock,
} from './blockRenderer';

export interface HardDropFxEvent {
  id: number;
  type: TetrominoType;
  cells: [number, number][]; // [col, visibleStartRow]
  distance: number;
}

export interface LineClearFxEvent {
  id: number;
  rows: number[]; // board row indices
  colors: string[];
}

interface DropTrail {
  type: TetrominoType;
  col: number;
  startRow: number;
  endRow: number;
  age: number;
  duration: number;
}

interface ClearParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  age: number;
  duration: number;
}

interface TetrisBoardProps {
  board: BoardGrid;
  activePiece: ActivePiece | null;
  ghostY: number | null;
  clearingRows: number[];
  cellSize: number;
  paused: boolean;
  hardDropFx: HardDropFxEvent | null;
  lineClearFx: LineClearFxEvent | null;
}

export function TetrisBoard({
  board,
  activePiece,
  ghostY,
  clearingRows,
  cellSize,
  paused,
  hardDropFx,
  lineClearFx,
}: TetrisBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const width = BOARD_COLS * cellSize;
  const height = BOARD_VISIBLE_ROWS * cellSize;

  const stateRef = useRef({
    board,
    activePiece,
    ghostY,
    clearingRows,
    cellSize,
    paused,
    width,
    height,
  });

  stateRef.current = {
    board,
    activePiece,
    ghostY,
    clearingRows,
    cellSize,
    paused,
    width,
    height,
  };

  const trailsRef = useRef<DropTrail[]>([]);
  const particlesRef = useRef<ClearParticle[]>([]);
  const lastDropIdRef = useRef(0);
  const lastClearIdRef = useRef(0);

  // Trigger hard-drop column trails
  useEffect(() => {
    if (!hardDropFx || hardDropFx.id === lastDropIdRef.current) return;
    lastDropIdRef.current = hardDropFx.id;

    if (hardDropFx.distance <= 1) return;

    // Group lowest/highest row per column for clean streaks
    const colBounds = new Map<number, { minRow: number; maxRow: number }>();
    for (const [col, row] of hardDropFx.cells) {
      const visibleStart = Math.max(0, row - BOARD_BUFFER_ROWS);
      const visibleEnd = Math.max(0, row + hardDropFx.distance - BOARD_BUFFER_ROWS);
      const prev = colBounds.get(col);
      if (!prev) {
        colBounds.set(col, { minRow: visibleStart, maxRow: visibleEnd });
      } else {
        prev.minRow = Math.min(prev.minRow, visibleStart);
        prev.maxRow = Math.max(prev.maxRow, visibleEnd);
      }
    }

    colBounds.forEach(({ minRow, maxRow }, col) => {
      trailsRef.current.push({
        type: hardDropFx.type,
        col,
        startRow: minRow,
        endRow: maxRow,
        age: 0,
        duration: 210,
      });
    });
  }, [hardDropFx]);

  // Trigger line-clear shard particles
  useEffect(() => {
    if (!lineClearFx || lineClearFx.id === lastClearIdRef.current) return;
    lastClearIdRef.current = lineClearFx.id;

    const cs = stateRef.current.cellSize;
    for (const r of lineClearFx.rows) {
      const visibleRow = r - BOARD_BUFFER_ROWS;
      if (visibleRow < 0 || visibleRow >= BOARD_VISIBLE_ROWS) continue;
      for (let c = 0; c < BOARD_COLS; c++) {
        const color = lineClearFx.colors[c] || PIECE_PALETTE.I.highlight;
        for (let p = 0; p < 2; p++) {
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
          const speed = 50 + Math.random() * 140;
          particlesRef.current.push({
            x: c * cs + cs * (0.25 + Math.random() * 0.5),
            y: visibleRow * cs + cs * (0.25 + Math.random() * 0.5),
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 20,
            size: Math.max(2, Math.floor(cs * (0.14 + Math.random() * 0.12))),
            color,
            age: 0,
            duration: 320 + Math.random() * 160,
          });
        }
      }
    }
  }, [lineClearFx]);

  // Continuous 60fps canvas render loop for crisp animations & FX
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const renderFrame = (now: number) => {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;

      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        const s = stateRef.current;

        if (ctx) {
          const dpr = window.devicePixelRatio || 1;
          const targetW = Math.round(s.width * dpr);
          const targetH = Math.round(s.height * dpr);
          if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
          }
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

          ctx.clearRect(0, 0, s.width, s.height);

          // Translucent smoked-glass playfield so the seasonal scenery blends through
          const bgGrad = ctx.createLinearGradient(0, 0, 0, s.height);
          bgGrad.addColorStop(0, 'rgba(8, 11, 18, 0.44)');
          bgGrad.addColorStop(1, 'rgba(10, 14, 22, 0.54)');
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, s.width, s.height);

          // Fine coordinate grid lines
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.065)';
          ctx.lineWidth = 1;
          for (let c = 1; c < BOARD_COLS; c++) {
            const x = c * s.cellSize + 0.5;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, s.height);
            ctx.stroke();
          }
          for (let r = 1; r < BOARD_VISIBLE_ROWS; r++) {
            const y = r * s.cellSize + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(s.width, y);
            ctx.stroke();
          }

          // Subtle intersection dots every 2 cells for architectural drafting precision
          ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
          for (let r = 2; r < BOARD_VISIBLE_ROWS; r += 2) {
            for (let c = 2; c < BOARD_COLS; c += 2) {
              ctx.fillRect(c * s.cellSize - 0.5, r * s.cellSize - 0.5, 2, 2);
            }
          }

          if (!s.paused) {
            // Update & render hard-drop column trails
            if (trailsRef.current.length > 0) {
              const aliveTrails: DropTrail[] = [];
              for (const tr of trailsRef.current) {
                tr.age += dt;
                if (tr.age < tr.duration) {
                  drawDropTrailColumn(
                    ctx,
                    tr.col,
                    tr.startRow,
                    tr.endRow,
                    s.cellSize,
                    tr.type,
                    tr.age / tr.duration
                  );
                  aliveTrails.push(tr);
                }
              }
              trailsRef.current = aliveTrails;
            }

            const clearingSet = new Set(s.clearingRows);

            // Draw locked cells
            for (let r = BOARD_BUFFER_ROWS; r < s.board.length; r++) {
              const visibleRow = r - BOARD_BUFFER_ROWS;
              const isClearing = clearingSet.has(r);

              for (let c = 0; c < BOARD_COLS; c++) {
                const cell = s.board[r][c];
                if (cell) {
                  drawTactileBlock(
                    ctx,
                    c * s.cellSize,
                    visibleRow * s.cellSize,
                    s.cellSize,
                    cell,
                    isClearing ? 0.45 : 1
                  );
                }
              }

              if (isClearing) {
                const sweepGrad = ctx.createLinearGradient(
                  0,
                  visibleRow * s.cellSize,
                  s.width,
                  visibleRow * s.cellSize
                );
                sweepGrad.addColorStop(0, 'rgba(251, 191, 36, 0.35)');
                sweepGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.88)');
                sweepGrad.addColorStop(1, 'rgba(251, 191, 36, 0.35)');
                ctx.fillStyle = sweepGrad;
                ctx.fillRect(0, visibleRow * s.cellSize, s.width, s.cellSize);
              }
            }

            // Draw ghost piece
            if (s.activePiece && s.ghostY !== null && s.ghostY !== s.activePiece.y) {
              const ghostCells = getPieceCells({ ...s.activePiece, y: s.ghostY });
              for (const [cx, cy] of ghostCells) {
                const visibleRow = cy - BOARD_BUFFER_ROWS;
                if (visibleRow >= 0 && visibleRow < BOARD_VISIBLE_ROWS) {
                  drawGhostBlock(
                    ctx,
                    cx * s.cellSize,
                    visibleRow * s.cellSize,
                    s.cellSize,
                    s.activePiece.type
                  );
                }
              }
            }

            // Draw active falling piece
            if (s.activePiece) {
              const activeCells = getPieceCells(s.activePiece);
              for (const [cx, cy] of activeCells) {
                const visibleRow = cy - BOARD_BUFFER_ROWS;
                if (visibleRow >= 0 && visibleRow < BOARD_VISIBLE_ROWS) {
                  drawTactileBlock(
                    ctx,
                    cx * s.cellSize,
                    visibleRow * s.cellSize,
                    s.cellSize,
                    s.activePiece.type
                  );
                }
              }
            }

            // Update & render line-clear shard particles
            if (particlesRef.current.length > 0) {
              const aliveParticles: ClearParticle[] = [];
              for (const pt of particlesRef.current) {
                pt.age += dt;
                if (pt.age < pt.duration) {
                  const sec = dt / 1000;
                  pt.vy += 320 * sec;
                  pt.x += pt.vx * sec;
                  pt.y += pt.vy * sec;
                  const alpha = 1 - pt.age / pt.duration;
                  ctx.save();
                  ctx.globalAlpha = alpha;
                  ctx.fillStyle = pt.color;
                  ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
                  ctx.restore();
                  aliveParticles.push(pt);
                }
              }
              particlesRef.current = aliveParticles;
            }
          }
        }
      }

      rafId = requestAnimationFrame(renderFrame);
    };

    rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${height}px` }}
      className="block rounded-md"
      aria-label="俄羅斯方塊遊戲盤面"
    />
  );
}
