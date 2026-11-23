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
  const pad = Math.max(1, Math.floor(size * 0.045));
  const bx = x + pad;
  const by = y + pad;
  const bs = size - pad * 2;
  const bevel = Math.max(2, Math.floor(bs * 0.14));

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

  // Inner matte face
  ctx.fillStyle = palette.fill;
  ctx.fillRect(bx + bevel, by + bevel, bs - bevel * 2, bs - bevel * 2);

  // Subtle top specular glint
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fillRect(bx + bevel + 1, by + bevel + 1, Math.max(1, bs - bevel * 2 - 2), Math.max(1, Math.floor(bs * 0.1)));

  // Crisp outer edge
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
  const pad = Math.max(1, Math.floor(size * 0.06));
  const bx = x + pad;
  const by = y + pad;
  const bs = size - pad * 2;

  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.fillRect(bx, by, bs, bs);

  ctx.strokeStyle = palette.ghost;
  ctx.lineWidth = 1.75;
  ctx.strokeRect(bx + 1, by + 1, bs - 2, bs - 2);
  ctx.restore();
}
