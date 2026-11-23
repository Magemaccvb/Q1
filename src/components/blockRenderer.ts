import { PIECE_PALETTE, TetrominoType } from '../game/tetrisTypes';

export function drawTactileBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  type: TetrominoType,
  alpha = 1
) {
  const palette = PIECE_PALETTE[type];
  const pad = Math.max(1, Math.floor(size * 0.04));
  const bx = x + pad;
  const by = y + pad;
  const bs = size - pad * 2;
  const bevel = Math.max(2, Math.floor(bs * 0.16));

  ctx.save();
  ctx.globalAlpha = alpha;

  // Base body
  ctx.fillStyle = palette.fill;
  ctx.fillRect(bx, by, bs, bs);

  // Top and left highlight bevel
  ctx.fillStyle = palette.highlight;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + bs, by);
  ctx.lineTo(bx + bs - bevel, by + bevel);
  ctx.lineTo(bx + bevel, by + bevel);
  ctx.lineTo(bx + bevel, by + bs - bevel);
  ctx.lineTo(bx, by + bs);
  ctx.closePath();
  ctx.fill();

  // Bottom and right shadow bevel
  ctx.fillStyle = palette.shadow;
  ctx.beginPath();
  ctx.moveTo(bx + bs, by + bs);
  ctx.lineTo(bx, by + bs);
  ctx.lineTo(bx + bevel, by + bs - bevel);
  ctx.lineTo(bx + bs - bevel, by + bs - bevel);
  ctx.lineTo(bx + bs - bevel, by + bevel);
  ctx.lineTo(bx + bs, by);
  ctx.closePath();
  ctx.fill();

  // Inner matte-satin face with subtle top-to-bottom depth
  const innerX = bx + bevel;
  const innerY = by + bevel;
  const innerS = Math.max(1, bs - bevel * 2);
  const grad = ctx.createLinearGradient(innerX, innerY, innerX, innerY + innerS);
  grad.addColorStop(0, palette.highlight);
  grad.addColorStop(0.22, palette.fill);
  grad.addColorStop(1, palette.shadow);
  ctx.fillStyle = grad;
  ctx.fillRect(innerX, innerY, innerS, innerS);

  // Subtle top-left specular glint
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(
    innerX + 1,
    innerY + 1,
    Math.max(1, innerS - 2),
    Math.max(1, Math.floor(bs * 0.08))
  );

  // Crisp outer seam
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, bs - 1, bs - 1);

  ctx.restore();
}

export function drawGhostBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  type: TetrominoType
) {
  const palette = PIECE_PALETTE[type];
  const pad = Math.max(1, Math.floor(size * 0.07));
  const bx = x + pad;
  const by = y + pad;
  const bs = size - pad * 2;
  const corner = Math.max(3, Math.floor(bs * 0.24));

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.fillRect(bx, by, bs, bs);

  ctx.strokeStyle = palette.ghost;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx + 1, by + 1, bs - 2, bs - 2);

  // Corner reticle ticks for crisp visual alignment
  ctx.fillStyle = palette.highlight;
  ctx.globalAlpha = 0.45;
  ctx.fillRect(bx, by, corner, 1.5);
  ctx.fillRect(bx, by, 1.5, corner);
  ctx.fillRect(bx + bs - corner, by + bs - 1.5, corner, 1.5);
  ctx.fillRect(bx + bs - 1.5, by + bs - corner, 1.5, corner);
  ctx.restore();
}

export function drawDropTrailColumn(
  ctx: CanvasRenderingContext2D,
  col: number,
  startRow: number,
  endRow: number,
  cellSize: number,
  type: TetrominoType,
  progress: number
) {
  if (endRow <= startRow) return;
  const palette = PIECE_PALETTE[type];
  const x = col * cellSize + 2;
  const y = startRow * cellSize;
  const w = cellSize - 4;
  const h = (endRow - startRow) * cellSize;

  ctx.save();
  const alpha = Math.max(0, (1 - progress) * 0.24);
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
  grad.addColorStop(0.45, palette.fill);
  grad.addColorStop(1, palette.highlight);

  ctx.globalAlpha = alpha;
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.restore();
}
