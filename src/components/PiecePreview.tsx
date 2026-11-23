import { useEffect, useRef } from 'react';
import { TETROMINO_MATRICES, TetrominoType } from '../game/tetrisTypes';
import { drawTactileBlock } from './blockRenderer';

interface PiecePreviewProps {
  type: TetrominoType | null;
  width?: number;
  height?: number;
  dimmed?: boolean;
}

export function PiecePreview({
  type,
  width = 104,
  height = 68,
  dimmed = false,
}: PiecePreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.clearRect(0, 0, width, height);

    if (!type) return;

    const matrix = TETROMINO_MATRICES[type][0];
    let minR = Infinity;
    let maxR = -Infinity;
    let minC = Infinity;
    let maxC = -Infinity;

    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c]) {
          minR = Math.min(minR, r);
          maxR = Math.max(maxR, r);
          minC = Math.min(minC, c);
          maxC = Math.max(maxC, c);
        }
      }
    }

    const pieceCols = maxC - minC + 1;
    const pieceRows = maxR - minR + 1;
    const blockSize = Math.min(
      Math.floor((width - 20) / Math.max(pieceCols, 2)),
      Math.floor((height - 16) / Math.max(pieceRows, 2)),
      20
    );

    const totalW = pieceCols * blockSize;
    const totalH = pieceRows * blockSize;
    const offsetX = Math.floor((width - totalW) / 2);
    const offsetY = Math.floor((height - totalH) / 2);

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        if (matrix[r][c]) {
          drawTactileBlock(
            ctx,
            offsetX + (c - minC) * blockSize,
            offsetY + (r - minR) * blockSize,
            blockSize,
            type,
            dimmed ? 0.35 : 1
          );
        }
      }
    }
  }, [type, width, height, dimmed]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: `${width}px`, height: `${height}px` }}
      className="block mx-auto"
      aria-hidden="true"
    />
  );
}
