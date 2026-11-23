import {
  ATTRIBUTE_META,
  BlockAttribute,
  PIECE_PALETTE,
  SpecialAttribute,
  TetrominoType,
} from '../game/tetrisTypes';

function drawAttributeEmblem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  bs: number,
  attr: SpecialAttribute,
  pulsePhase: number
) {
  const pulse = 0.72 + 0.28 * Math.sin(pulsePhase);
  const meta = ATTRIBUTE_META[attr];
  const radius = Math.max(4, bs * 0.28);

  ctx.save();

  // Subtle dark contrast backing so the icon pops against bright blocks (O, I, S)
  ctx.fillStyle = 'rgba(8, 12, 20, 0.56)';
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.05, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = meta.rim;
  ctx.globalAlpha = 0.78 * pulse;
  ctx.lineWidth = Math.max(1, bs * 0.055);
  ctx.stroke();

  ctx.globalAlpha = 0.96;

  if (attr === 'fire') {
    const r = radius * 0.88;
    ctx.fillStyle = '#FFEDD5';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 1.12);
    ctx.bezierCurveTo(
      cx + r * 0.65,
      cy - r * 0.4,
      cx + r * 0.9,
      cy + r * 0.2,
      cx + r * 0.45,
      cy + r * 0.78
    );
    ctx.quadraticCurveTo(cx, cy + r * 1.12, cx - r * 0.48, cy + r * 0.76);
    ctx.bezierCurveTo(
      cx - r * 0.9,
      cy + r * 0.2,
      cx - r * 0.6,
      cy - r * 0.3,
      cx - r * 0.15,
      cy - r * 0.65
    );
    ctx.quadraticCurveTo(cx - r * 0.05, cy - r * 0.35, cx, cy - r * 1.12);
    ctx.closePath();
    ctx.fill();

    // Inner ember core
    ctx.fillStyle = '#FB923C';
    ctx.beginPath();
    ctx.arc(cx, cy + r * 0.25, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
  } else if (attr === 'ice') {
    const r = radius * 0.85;
    ctx.strokeStyle = '#F0F9FF';
    ctx.lineWidth = Math.max(1.2, bs * 0.065);
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const angle = (i * Math.PI) / 3;
      const dx = Math.cos(angle) * r;
      const dy = Math.sin(angle) * r;
      ctx.beginPath();
      ctx.moveTo(cx - dx, cy - dy);
      ctx.lineTo(cx + dx, cy + dy);
      ctx.stroke();
    }
    ctx.fillStyle = '#7DD3FC';
    ctx.beginPath();
    ctx.arc(cx, cy, Math.max(1.5, r * 0.25), 0, Math.PI * 2);
    ctx.fill();
  } else if (attr === 'lightning') {
    const r = radius * 0.92;
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.moveTo(cx + r * 0.16, cy - r * 1.02);
    ctx.lineTo(cx - r * 0.56, cy + r * 0.08);
    ctx.lineTo(cx - r * 0.05, cy + r * 0.08);
    ctx.lineTo(cx - r * 0.24, cy + r * 1.02);
    ctx.lineTo(cx + r * 0.56, cy - r * 0.12);
    ctx.lineTo(cx + r * 0.04, cy - r * 0.12);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

export function drawTactileBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  type: TetrominoType,
  alpha = 1,
  attr: BlockAttribute = 'normal',
  pulsePhase = 0
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

  if (attr !== 'normal') {
    const meta = ATTRIBUTE_META[attr];
    const glowAlpha = 0.5 + 0.35 * Math.sin(pulsePhase);
    ctx.save();
    ctx.strokeStyle = meta.rim;
    ctx.globalAlpha = alpha * glowAlpha;
    ctx.lineWidth = Math.max(1.5, Math.floor(bs * 0.08));
    ctx.strokeRect(bx + 1.5, by + 1.5, bs - 3, bs - 3);
    ctx.restore();

    drawAttributeEmblem(
      ctx,
      bx + bs / 2,
      by + bs / 2,
      bs,
      attr,
      pulsePhase
    );
  }

  ctx.restore();
}

export function drawAttributeLinkConduit(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  attrA: SpecialAttribute,
  attrB: SpecialAttribute,
  pulsePhase: number,
  cellSize: number
) {
  const colorA = ATTRIBUTE_META[attrA].accent;
  const colorB = ATTRIBUTE_META[attrB].accent;
  const pulse = 0.55 + 0.35 * Math.sin(pulsePhase * 1.4);

  ctx.save();
  const grad = ctx.createLinearGradient(x1, y1, x2, y2);
  grad.addColorStop(0, colorA);
  grad.addColorStop(1, colorB);

  ctx.globalAlpha = pulse * 0.72;
  ctx.strokeStyle = grad;
  ctx.lineWidth = Math.max(2, cellSize * 0.14);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.globalAlpha = pulse * 0.95;
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(1, cellSize * 0.05);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();

  ctx.restore();
}

export function drawGhostBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  type: TetrominoType,
  attr: BlockAttribute = 'normal'
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

  ctx.strokeStyle = attr !== 'normal' ? ATTRIBUTE_META[attr].rim : palette.ghost;
  ctx.lineWidth = attr !== 'normal' ? 1.8 : 1.5;
  ctx.strokeRect(bx + 1, by + 1, bs - 2, bs - 2);

  // Corner reticle ticks for crisp visual alignment
  ctx.fillStyle = attr !== 'normal' ? ATTRIBUTE_META[attr].accent : palette.highlight;
  ctx.globalAlpha = attr !== 'normal' ? 0.65 : 0.45;
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
