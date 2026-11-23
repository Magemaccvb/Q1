import { useEffect, useRef } from 'react';
import {
  ActivePiece,
  BOARD_BUFFER_ROWS,
  BOARD_COLS,
  BOARD_VISIBLE_ROWS,
  BoardGrid,
} from '../game/tetrisTypes';
import { getPieceCells } from '../game/tetrisEngine';
import { drawGhostBlock, drawTactileBlock } from './blockRenderer';

interface TetrisBoardProps {
  board: BoardGrid;
  activePiece: ActivePiece | null;
  ghostY: number | null;
  clearingRows: number[];
  cellSize: number;
  paused: boolean;
}

export function TetrisBoard({
  board,
  activePiece,
  ghostY,
  clearingRows,
  cellSize,
  paused,
}: TetrisBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const width = BOARD_COLS * cellSize;
  const height = BOARD_VISIBLE_ROWS * cellSize;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Playfield recessed well background
    ctx.fillStyle = '#0B0D11';
    ctx.fillRect(0, 0, width, height);

    // Subtle coordinate grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    for (let c = 1; c < BOARD_COLS; c++) {
      const x = c * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let r = 1; r < BOARD_VISIBLE_ROWS; r++) {
      const y = r * cellSize + 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    if (paused) {
      return;
    }

    const clearingSet = new Set(clearingRows);

    // Draw locked cells
    for (let r = BOARD_BUFFER_ROWS; r < board.length; r++) {
      const visibleRow = r - BOARD_BUFFER_ROWS;
      const isClearing = clearingSet.has(r);

      for (let c = 0; c < BOARD_COLS; c++) {
        const cell = board[r][c];
        if (cell) {
          drawTactileBlock(
            ctx,
            c * cellSize,
            visibleRow * cellSize,
            cellSize,
            cell,
            isClearing ? 0.35 : 1
          );
        }
      }

      if (isClearing) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
        ctx.fillRect(0, visibleRow * cellSize, width, cellSize);
      }
    }

    // Draw ghost piece
    if (activePiece && ghostY !== null && ghostY !== activePiece.y) {
      const ghostCells = getPieceCells({ ...activePiece, y: ghostY });
      for (const [cx, cy] of ghostCells) {
        const visibleRow = cy - BOARD_BUFFER_ROWS;
        if (visibleRow >= 0 && visibleRow < BOARD_VISIBLE_ROWS) {
          drawGhostBlock(
            ctx,
            cx * cellSize,
            visibleRow * cellSize,
            cellSize,
            activePiece.type
          );
        }
      }
    }

    // Draw active piece
    if (activePiece) {
      const activeCells = getPieceCells(activePiece);
      for (const [cx, cy] of activeCells) {
        const visibleRow = cy - BOARD_BUFFER_ROWS;
        if (visibleRow >= 0 && visibleRow < BOARD_VISIBLE_ROWS) {
          drawTactileBlock(
            ctx,
            cx * cellSize,
            visibleRow * cellSize,
            cellSize,
            activePiece.type
          );
        }
      }
    }
  }, [board, activePiece, ghostY, clearingRows, cellSize, width, height, paused]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${height}px` }}
      className="block rounded-md"
      aria-label="俄羅斯方塊遊戲盤面"
    />
  );
}
