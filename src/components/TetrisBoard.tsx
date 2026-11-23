import { useEffect, useRef } from 'react';
import { SeasonId } from '../game/soundEffects';
import {
  ActivePiece,
  ATTRIBUTE_META,
  BOARD_BUFFER_ROWS,
  BOARD_COLS,
  BOARD_VISIBLE_ROWS,
  BoardGrid,
  PIECE_PALETTE,
  TetrominoType,
} from '../game/tetrisTypes';
import {
  FallingBlock,
  getPieceDetailedCells,
  SpecialExplosionFx,
  SpecialFreezeFx,
  SpecialLightningFx,
  SpecialLinkArcFx,
} from '../game/tetrisEngine';
import {
  drawAttributeLinkConduit,
  drawDropTrailColumn,
  drawGhostBlock,
  drawTactileBlock,
} from './blockRenderer';
import { SEASON_THEMES } from './SeasonBackdrop';

export interface HardDropFxEvent {
  id: number;
  type: TetrominoType;
  cells: [number, number][];
  distance: number;
}

export interface LineClearFxEvent {
  id: number;
  rows: number[];
  colors: string[];
}

export interface SpecialFxEvent {
  id: number;
  explosions: SpecialExplosionFx[];
  lightnings: SpecialLightningFx[];
  freezes: SpecialFreezeFx[];
  linkArcs: SpecialLinkArcFx[];
  destroyedParticles: Array<{ x: number; y: number; color: string }>;
}

export interface CascadeFallFxEvent {
  id: number;
  blocks: FallingBlock[];
  durationMs: number;
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

interface ActiveExplosionWave {
  cx: number;
  cy: number;
  maxRadiusPx: number;
  age: number;
  duration: number;
}

interface ActiveLightningBeam {
  col: number;
  row: number;
  cross: boolean;
  age: number;
  duration: number;
}

interface ActiveFreezeWave {
  cx: number;
  cy: number;
  age: number;
  duration: number;
}

interface ActiveLinkBolt {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
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
  season: SeasonId;
  freezeRemainingMs: number;
  hardDropFx: HardDropFxEvent | null;
  lineClearFx: LineClearFxEvent | null;
  specialFx: SpecialFxEvent | null;
  cascadeFallFx: CascadeFallFxEvent | null;
}

export function TetrisBoard({
  board,
  activePiece,
  ghostY,
  clearingRows,
  cellSize,
  paused,
  season,
  freezeRemainingMs,
  hardDropFx,
  lineClearFx,
  specialFx,
  cascadeFallFx,
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
    season,
    freezeRemainingMs,
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
    season,
    freezeRemainingMs,
    width,
    height,
  };

  const trailsRef = useRef<DropTrail[]>([]);
  const particlesRef = useRef<ClearParticle[]>([]);
  const explosionWavesRef = useRef<ActiveExplosionWave[]>([]);
  const lightningBeamsRef = useRef<ActiveLightningBeam[]>([]);
  const freezeWavesRef = useRef<ActiveFreezeWave[]>([]);
  const linkBoltsRef = useRef<ActiveLinkBolt[]>([]);
  const cascadeRef = useRef<{
    id: number;
    blocks: FallingBlock[];
    age: number;
    durationMs: number;
  } | null>(null);

  const lastDropIdRef = useRef(0);
  const lastClearIdRef = useRef(0);
  const lastSpecialIdRef = useRef(0);

  useEffect(() => {
    if (!cascadeFallFx) {
      cascadeRef.current = null;
      return;
    }
    if (cascadeRef.current?.id === cascadeFallFx.id) return;
    cascadeRef.current = {
      id: cascadeFallFx.id,
      blocks: cascadeFallFx.blocks,
      age: 0,
      durationMs: cascadeFallFx.durationMs,
    };
  }, [cascadeFallFx]);

  // Trigger hard-drop column trails
  useEffect(() => {
    if (!hardDropFx || hardDropFx.id === lastDropIdRef.current) return;
    lastDropIdRef.current = hardDropFx.id;

    if (hardDropFx.distance <= 1) return;

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

  // Trigger special attribute explosion / freeze / lightning / link FX
  useEffect(() => {
    if (!specialFx || specialFx.id === lastSpecialIdRef.current) return;
    lastSpecialIdRef.current = specialFx.id;

    const cs = stateRef.current.cellSize;

    for (const exp of specialFx.explosions) {
      const visY = exp.y - BOARD_BUFFER_ROWS;
      const cx = (exp.x + 0.5) * cs;
      const cy = (visY + 0.5) * cs;
      explosionWavesRef.current.push({
        cx,
        cy,
        maxRadiusPx: cs * (exp.radius + 1.35),
        age: -exp.depth * 55,
        duration: 420,
      });

      // Fiery radial sparks
      for (let i = 0; i < 16; i++) {
        const angle = (Math.PI * 2 * i) / 16 + (Math.random() - 0.5) * 0.35;
        const speed = 90 + Math.random() * 160;
        particlesRef.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 25,
          size: Math.max(2.5, Math.floor(cs * (0.15 + Math.random() * 0.14))),
          color: i % 2 === 0 ? '#FB923C' : '#FDE047',
          age: -exp.depth * 40,
          duration: 380 + Math.random() * 180,
        });
      }
    }

    for (const bolt of specialFx.lightnings) {
      const visY = bolt.y - BOARD_BUFFER_ROWS;
      lightningBeamsRef.current.push({
        col: bolt.x,
        row: visY,
        cross: bolt.cross,
        age: -bolt.depth * 55,
        duration: 360,
      });
    }

    for (const frz of specialFx.freezes) {
      const visY = frz.y - BOARD_BUFFER_ROWS;
      const cx = (frz.x + 0.5) * cs;
      const cy = (visY + 0.5) * cs;
      freezeWavesRef.current.push({
        cx,
        cy,
        age: -frz.depth * 45,
        duration: 480,
      });

      for (let i = 0; i < 12; i++) {
        const angle = (Math.PI * 2 * i) / 12 + Math.random() * 0.25;
        const speed = 65 + Math.random() * 100;
        particlesRef.current.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 15,
          size: Math.max(2, Math.floor(cs * 0.15)),
          color: i % 2 === 0 ? '#7DD3FC' : '#F0F9FF',
          age: 0,
          duration: 420 + Math.random() * 180,
        });
      }
    }

    for (const arc of specialFx.linkArcs) {
      linkBoltsRef.current.push({
        fromX: (arc.fromX + 0.5) * cs,
        fromY: (arc.fromY - BOARD_BUFFER_ROWS + 0.5) * cs,
        toX: (arc.toX + 0.5) * cs,
        toY: (arc.toY - BOARD_BUFFER_ROWS + 0.5) * cs,
        color: ATTRIBUTE_META[arc.attr].accent,
        age: -arc.depth * 45,
        duration: 340,
      });
    }

    for (const pt of specialFx.destroyedParticles) {
      const visY = pt.y - BOARD_BUFFER_ROWS;
      if (visY < 0 || visY >= BOARD_VISIBLE_ROWS) continue;
      for (let k = 0; k < 2; k++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 45 + Math.random() * 120;
        particlesRef.current.push({
          x: (pt.x + 0.5) * cs,
          y: (visY + 0.5) * cs,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30,
          size: Math.max(2, Math.floor(cs * 0.15)),
          color: pt.color,
          age: 0,
          duration: 340 + Math.random() * 160,
        });
      }
    }
  }, [specialFx]);

  // Continuous 60fps canvas render loop for crisp animations & FX
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();

    const renderFrame = (now: number) => {
      const dt = Math.min(50, now - lastTime);
      lastTime = now;
      const pulsePhase = now * 0.005;

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

          // Adaptive seasonal feathered atmospheric veil (no hard rectangular frame)
          const seasonTheme = SEASON_THEMES[s.season];
          const bgGrad = ctx.createLinearGradient(0, 0, 0, s.height);
          bgGrad.addColorStop(0, seasonTheme.boardTintTop);
          bgGrad.addColorStop(0.5, seasonTheme.boardTintMid);
          bgGrad.addColorStop(1, seasonTheme.boardTintBottom);
          ctx.fillStyle = bgGrad;
          ctx.fillRect(0, 0, s.width, s.height);

          // Subtle frosty tint across playfield when time is frozen
          if (s.freezeRemainingMs > 0) {
            const frostAlpha = Math.min(0.24, 0.09 + (s.freezeRemainingMs / 6000) * 0.12);
            const frostGrad = ctx.createLinearGradient(0, 0, 0, s.height);
            frostGrad.addColorStop(0, `rgba(125, 211, 252, ${frostAlpha})`);
            frostGrad.addColorStop(0.5, `rgba(56, 189, 248, ${frostAlpha * 0.35})`);
            frostGrad.addColorStop(1, `rgba(186, 230, 253, ${frostAlpha})`);
            ctx.fillStyle = frostGrad;
            ctx.fillRect(0, 0, s.width, s.height);
          }

          // Feather all 4 edges so the board mist melts smoothly into the surrounding seasonal scenery
          ctx.save();
          ctx.globalCompositeOperation = 'destination-in';

          const hFeather = ctx.createLinearGradient(0, 0, s.width, 0);
          hFeather.addColorStop(0, 'rgba(0, 0, 0, 0.08)');
          hFeather.addColorStop(0.08, 'rgba(0, 0, 0, 0.88)');
          hFeather.addColorStop(0.18, 'rgba(0, 0, 0, 1)');
          hFeather.addColorStop(0.82, 'rgba(0, 0, 0, 1)');
          hFeather.addColorStop(0.92, 'rgba(0, 0, 0, 0.88)');
          hFeather.addColorStop(1, 'rgba(0, 0, 0, 0.08)');
          ctx.fillStyle = hFeather;
          ctx.fillRect(0, 0, s.width, s.height);

          const vFeather = ctx.createLinearGradient(0, 0, 0, s.height);
          vFeather.addColorStop(0, 'rgba(0, 0, 0, 0.05)');
          vFeather.addColorStop(0.07, 'rgba(0, 0, 0, 0.92)');
          vFeather.addColorStop(0.92, 'rgba(0, 0, 0, 0.95)');
          vFeather.addColorStop(1, 'rgba(0, 0, 0, 0.25)');
          ctx.fillStyle = vFeather;
          ctx.fillRect(0, 0, s.width, s.height);
          ctx.restore();

          // Whisper-soft alignment micro-dots (no boxy grid lines)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.075)';
          for (let r = 2; r < BOARD_VISIBLE_ROWS; r += 2) {
            for (let c = 2; c < BOARD_COLS; c += 2) {
              ctx.fillRect(c * s.cellSize - 0.5, r * s.cellSize - 0.5, 1.5, 1.5);
            }
          }

          // Subtle drop-column aura under the active piece for effortless alignment without grid lines
          if (!s.paused && s.activePiece) {
            const activeCells = getPieceDetailedCells(s.activePiece);
            const colMinVisY = new Map<number, number>();
            for (const cell of activeCells) {
              const visY = Math.max(0, cell.y - BOARD_BUFFER_ROWS);
              const prev = colMinVisY.get(cell.x);
              if (prev === undefined || visY < prev) {
                colMinVisY.set(cell.x, visY);
              }
            }
            const endVisY =
              s.ghostY !== null
                ? Math.min(BOARD_VISIBLE_ROWS, s.ghostY - BOARD_BUFFER_ROWS + 3)
                : BOARD_VISIBLE_ROWS;
            const pieceColor = PIECE_PALETTE[s.activePiece.type].highlight;
            colMinVisY.forEach((startVisY, col) => {
              if (endVisY <= startVisY) return;
              const colX = col * s.cellSize;
              const topY = startVisY * s.cellSize;
              const colH = (endVisY - startVisY) * s.cellSize;
              const colGrad = ctx.createLinearGradient(colX, topY, colX, topY + colH);
              colGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
              colGrad.addColorStop(0.5, pieceColor);
              colGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
              ctx.save();
              ctx.globalAlpha = 0.06;
              ctx.fillStyle = colGrad;
              ctx.fillRect(colX + 1, topY, s.cellSize - 2, colH);
              ctx.restore();
            });
          }

          if (!s.paused) {
            // Hard-drop column trails
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
                    cell.type,
                    isClearing ? 0.45 : 1,
                    cell.attr,
                    pulsePhase
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

            // Render blocks dropping down with gravity after explosion/special clear
            if (cascadeRef.current) {
              const cf = cascadeRef.current;
              cf.age += dt;
              const rawT = Math.min(1, cf.age / Math.max(1, cf.durationMs));
              const eased = rawT * rawT;

              for (const fb of cf.blocks) {
                const curRow = fb.fromY + (fb.toY - fb.fromY) * eased;
                const visY = curRow - BOARD_BUFFER_ROWS;
                if (visY < -1 || visY >= BOARD_VISIBLE_ROWS) continue;

                // Subtle motion streak behind falling blocks
                if (rawT > 0.05 && rawT < 0.95 && fb.toY - fb.fromY >= 1) {
                  const trailPx = Math.min(
                    s.cellSize * 0.8,
                    (curRow - fb.fromY) * s.cellSize * 0.45
                  );
                  if (trailPx > 2) {
                    const bx = fb.x * s.cellSize + 3;
                    const by = visY * s.cellSize;
                    const tGrad = ctx.createLinearGradient(bx, by - trailPx, bx, by);
                    tGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
                    tGrad.addColorStop(1, PIECE_PALETTE[fb.cell.type].highlight);
                    ctx.save();
                    ctx.globalAlpha = 0.22 * (1 - rawT * 0.6);
                    ctx.fillStyle = tGrad;
                    ctx.fillRect(bx, by - trailPx, s.cellSize - 6, trailPx);
                    ctx.restore();
                  }
                }

                drawTactileBlock(
                  ctx,
                  fb.x * s.cellSize,
                  visY * s.cellSize,
                  s.cellSize,
                  fb.cell.type,
                  1,
                  fb.cell.attr,
                  pulsePhase
                );
              }
            }

            // Draw live energy link conduits between orthogonally adjacent special blocks
            for (let r = BOARD_BUFFER_ROWS; r < s.board.length; r++) {
              const visR = r - BOARD_BUFFER_ROWS;
              for (let c = 0; c < BOARD_COLS; c++) {
                const cell = s.board[r][c];
                if (!cell || cell.attr === 'normal') continue;

                if (c + 1 < BOARD_COLS) {
                  const right = s.board[r][c + 1];
                  if (right && right.attr !== 'normal') {
                    drawAttributeLinkConduit(
                      ctx,
                      (c + 0.5) * s.cellSize,
                      (visR + 0.5) * s.cellSize,
                      (c + 1.5) * s.cellSize,
                      (visR + 0.5) * s.cellSize,
                      cell.attr,
                      right.attr,
                      pulsePhase,
                      s.cellSize
                    );
                  }
                }
                if (r + 1 < s.board.length) {
                  const down = s.board[r + 1][c];
                  if (down && down.attr !== 'normal') {
                    drawAttributeLinkConduit(
                      ctx,
                      (c + 0.5) * s.cellSize,
                      (visR + 0.5) * s.cellSize,
                      (c + 0.5) * s.cellSize,
                      (visR + 1.5) * s.cellSize,
                      cell.attr,
                      down.attr,
                      pulsePhase,
                      s.cellSize
                    );
                  }
                }
              }
            }

            // Draw ghost piece
            if (s.activePiece && s.ghostY !== null && s.ghostY !== s.activePiece.y) {
              const ghostCells = getPieceDetailedCells({
                ...s.activePiece,
                y: s.ghostY,
              });
              for (const cell of ghostCells) {
                const visibleRow = cell.y - BOARD_BUFFER_ROWS;
                if (visibleRow >= 0 && visibleRow < BOARD_VISIBLE_ROWS) {
                  drawGhostBlock(
                    ctx,
                    cell.x * s.cellSize,
                    visibleRow * s.cellSize,
                    s.cellSize,
                    s.activePiece.type,
                    cell.attr
                  );
                }
              }
            }

            // Draw active falling piece
            if (s.activePiece) {
              const activeCells = getPieceDetailedCells(s.activePiece);
              for (const cell of activeCells) {
                const visibleRow = cell.y - BOARD_BUFFER_ROWS;
                if (visibleRow >= 0 && visibleRow < BOARD_VISIBLE_ROWS) {
                  drawTactileBlock(
                    ctx,
                    cell.x * s.cellSize,
                    visibleRow * s.cellSize,
                    s.cellSize,
                    s.activePiece.type,
                    1,
                    cell.attr,
                    pulsePhase
                  );
                }
              }
            }

            // Render active link bolt flashes
            if (linkBoltsRef.current.length > 0) {
              const aliveBolts: ActiveLinkBolt[] = [];
              for (const lb of linkBoltsRef.current) {
                lb.age += dt;
                if (lb.age < 0) {
                  aliveBolts.push(lb);
                  continue;
                }
                if (lb.age < lb.duration) {
                  const alpha = 1 - lb.age / lb.duration;
                  ctx.save();
                  ctx.globalAlpha = alpha;
                  ctx.strokeStyle = lb.color;
                  ctx.lineWidth = Math.max(4, s.cellSize * 0.25);
                  ctx.lineCap = 'round';
                  ctx.beginPath();
                  ctx.moveTo(lb.fromX, lb.fromY);
                  ctx.lineTo(lb.toX, lb.toY);
                  ctx.stroke();

                  ctx.strokeStyle = '#FFFFFF';
                  ctx.lineWidth = Math.max(2, s.cellSize * 0.1);
                  ctx.beginPath();
                  ctx.moveTo(lb.fromX, lb.fromY);
                  ctx.lineTo(lb.toX, lb.toY);
                  ctx.stroke();
                  ctx.restore();
                  aliveBolts.push(lb);
                }
              }
              linkBoltsRef.current = aliveBolts;
            }

            // Render Fire explosion shockwaves
            if (explosionWavesRef.current.length > 0) {
              const aliveExp: ActiveExplosionWave[] = [];
              for (const exp of explosionWavesRef.current) {
                exp.age += dt;
                if (exp.age < 0) {
                  aliveExp.push(exp);
                  continue;
                }
                if (exp.age < exp.duration) {
                  const t = exp.age / exp.duration;
                  const eased = 1 - Math.pow(1 - t, 3);
                  const r = exp.maxRadiusPx * eased;
                  const alpha = 1 - t;

                  ctx.save();
                  const radial = ctx.createRadialGradient(
                    exp.cx,
                    exp.cy,
                    0,
                    exp.cx,
                    exp.cy,
                    Math.max(4, r)
                  );
                  radial.addColorStop(0, `rgba(254, 240, 138, ${alpha * 0.72})`);
                  radial.addColorStop(0.55, `rgba(249, 115, 22, ${alpha * 0.45})`);
                  radial.addColorStop(1, 'rgba(239, 68, 68, 0)');
                  ctx.fillStyle = radial;
                  ctx.beginPath();
                  ctx.arc(exp.cx, exp.cy, Math.max(4, r), 0, Math.PI * 2);
                  ctx.fill();

                  ctx.strokeStyle = `rgba(253, 186, 116, ${alpha * 0.9})`;
                  ctx.lineWidth = Math.max(2, (1 - t) * 5);
                  ctx.beginPath();
                  ctx.arc(exp.cx, exp.cy, Math.max(2, r * 0.92), 0, Math.PI * 2);
                  ctx.stroke();
                  ctx.restore();

                  aliveExp.push(exp);
                }
              }
              explosionWavesRef.current = aliveExp;
            }

            // Render Lightning vertical/cross laser beams
            if (lightningBeamsRef.current.length > 0) {
              const aliveBeams: ActiveLightningBeam[] = [];
              for (const beam of lightningBeamsRef.current) {
                beam.age += dt;
                if (beam.age < 0) {
                  aliveBeams.push(beam);
                  continue;
                }
                if (beam.age < beam.duration) {
                  const t = beam.age / beam.duration;
                  const alpha = 1 - t;
                  const bx = beam.col * s.cellSize;
                  const cx = bx + s.cellSize / 2;

                  ctx.save();
                  // Vertical glow column
                  const colGrad = ctx.createLinearGradient(bx, 0, bx + s.cellSize, 0);
                  colGrad.addColorStop(0, 'rgba(250, 204, 21, 0)');
                  colGrad.addColorStop(0.5, `rgba(250, 204, 21, ${alpha * 0.55})`);
                  colGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
                  ctx.fillStyle = colGrad;
                  ctx.fillRect(bx, 0, s.cellSize, s.height);

                  // Electric white core
                  ctx.strokeStyle = `rgba(254, 249, 195, ${alpha * 0.95})`;
                  ctx.lineWidth = Math.max(2, (1 - t) * (s.cellSize * 0.24));
                  ctx.beginPath();
                  ctx.moveTo(cx, 0);
                  const segs = 10;
                  for (let i = 1; i < segs; i++) {
                    const jitter = Math.sin(i * 4.7 + t * 22) * (s.cellSize * 0.22);
                    ctx.lineTo(cx + jitter, (s.height * i) / segs);
                  }
                  ctx.lineTo(cx, s.height);
                  ctx.stroke();

                  // Horizontal cross beam when chained
                  if (beam.cross && beam.row >= 0 && beam.row < BOARD_VISIBLE_ROWS) {
                    const by = beam.row * s.cellSize;
                    const cy = by + s.cellSize / 2;
                    const rowGrad = ctx.createLinearGradient(0, by, 0, by + s.cellSize);
                    rowGrad.addColorStop(0, 'rgba(250, 204, 21, 0)');
                    rowGrad.addColorStop(0.5, `rgba(250, 204, 21, ${alpha * 0.55})`);
                    rowGrad.addColorStop(1, 'rgba(250, 204, 21, 0)');
                    ctx.fillStyle = rowGrad;
                    ctx.fillRect(0, by, s.width, s.cellSize);

                    ctx.beginPath();
                    ctx.moveTo(0, cy);
                    for (let i = 1; i < segs; i++) {
                      const jitter = Math.cos(i * 5.3 + t * 20) * (s.cellSize * 0.22);
                      ctx.lineTo((s.width * i) / segs, cy + jitter);
                    }
                    ctx.lineTo(s.width, cy);
                    ctx.stroke();
                  }

                  ctx.restore();
                  aliveBeams.push(beam);
                }
              }
              lightningBeamsRef.current = aliveBeams;
            }

            // Render Freeze nova waves
            if (freezeWavesRef.current.length > 0) {
              const aliveFreeze: ActiveFreezeWave[] = [];
              for (const fw of freezeWavesRef.current) {
                fw.age += dt;
                if (fw.age < 0) {
                  aliveFreeze.push(fw);
                  continue;
                }
                if (fw.age < fw.duration) {
                  const t = fw.age / fw.duration;
                  const eased = 1 - Math.pow(1 - t, 2);
                  const r = s.width * 0.9 * eased;
                  const alpha = (1 - t) * 0.85;

                  ctx.save();
                  ctx.strokeStyle = `rgba(186, 230, 253, ${alpha})`;
                  ctx.lineWidth = Math.max(2, (1 - t) * 4);
                  ctx.beginPath();
                  ctx.arc(fw.cx, fw.cy, Math.max(4, r), 0, Math.PI * 2);
                  ctx.stroke();
                  ctx.restore();
                  aliveFreeze.push(fw);
                }
              }
              freezeWavesRef.current = aliveFreeze;
            }

            // Render shard particles
            if (particlesRef.current.length > 0) {
              const aliveParticles: ClearParticle[] = [];
              for (const pt of particlesRef.current) {
                pt.age += dt;
                if (pt.age < 0) {
                  aliveParticles.push(pt);
                  continue;
                }
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
