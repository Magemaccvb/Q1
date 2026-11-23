import {
  ActivePiece,
  ATTRIBUTE_META,
  BlockAttribute,
  BOARD_BUFFER_ROWS,
  BOARD_COLS,
  BOARD_TOTAL_ROWS,
  BoardGrid,
  FREEZE_BASE_MS,
  FREEZE_MAX_MS,
  FREEZE_STACK_MS,
  I_WALL_KICKS,
  JLSTZ_WALL_KICKS,
  PIECE_PALETTE,
  QueuePiece,
  RotationState,
  SpecialAttribute,
  TETROMINO_MATRICES,
  TetrominoType,
} from './tetrisTypes';

const ALL_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const SPECIAL_ATTRS: SpecialAttribute[] = ['fire', 'ice', 'lightning'];

export function createEmptyBoard(): BoardGrid {
  return Array.from({ length: BOARD_TOTAL_ROWS }, () =>
    Array(BOARD_COLS).fill(null)
  );
}

export function generateBag(attributeMode = true): QueuePiece[] {
  const bag = [...ALL_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }

  if (!attributeMode) {
    return bag.map((type) => ({
      type,
      specialCellIndex: null,
      specialAttr: null,
    }));
  }

  // Assign 4 special-attribute pieces per 7-bag, guaranteeing fire, ice, and lightning all appear
  const indices = [0, 1, 2, 3, 4, 5, 6];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const assignedAttrs = new Map<number, SpecialAttribute>();
  const extraAttr = SPECIAL_ATTRS[Math.floor(Math.random() * SPECIAL_ATTRS.length)];
  const bagSpecials: SpecialAttribute[] = ['fire', 'ice', 'lightning', extraAttr];
  for (let i = 0; i < bagSpecials.length; i++) {
    assignedAttrs.set(indices[i], bagSpecials[i]);
  }

  return bag.map((type, idx) => {
    const attr = assignedAttrs.get(idx) ?? null;
    return {
      type,
      specialCellIndex: attr ? Math.floor(Math.random() * 4) : null,
      specialAttr: attr,
    };
  });
}

function findLocalPosForIndex(
  type: TetrominoType,
  cellIndex: number | null
): [number, number] | null {
  if (cellIndex === null) return null;
  const matrix = TETROMINO_MATRICES[type][0];
  let count = 0;
  for (let r = 0; r < matrix.length; r++) {
    for (let c = 0; c < matrix[r].length; c++) {
      if (matrix[r][c]) {
        if (count === cellIndex) {
          return [c, r];
        }
        count++;
      }
    }
  }
  return null;
}

export function createSpawnPiece(queuePiece: QueuePiece): ActivePiece {
  const x = 3;
  const y = queuePiece.type === 'I' ? BOARD_BUFFER_ROWS - 2 : BOARD_BUFFER_ROWS - 1;
  return {
    type: queuePiece.type,
    x,
    y,
    rotation: 0,
    specialCellIndex: queuePiece.specialCellIndex,
    specialLocalPos: findLocalPosForIndex(queuePiece.type, queuePiece.specialCellIndex),
    specialAttr: queuePiece.specialAttr,
  };
}

export function toQueuePiece(piece: ActivePiece): QueuePiece {
  return {
    type: piece.type,
    specialCellIndex: piece.specialCellIndex,
    specialAttr: piece.specialAttr,
  };
}

export function getPieceCells(piece: ActivePiece): [number, number][] {
  const matrix = TETROMINO_MATRICES[piece.type][piece.rotation];
  const cells: [number, number][] = [];
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix[row].length; col++) {
      if (matrix[row][col]) {
        cells.push([piece.x + col, piece.y + row]);
      }
    }
  }
  return cells;
}

export function getPieceDetailedCells(
  piece: ActivePiece
): Array<{ x: number; y: number; attr: BlockAttribute }> {
  const matrix = TETROMINO_MATRICES[piece.type][piece.rotation];
  const cells: Array<{ x: number; y: number; attr: BlockAttribute }> = [];
  for (let row = 0; row < matrix.length; row++) {
    for (let col = 0; col < matrix[row].length; col++) {
      if (matrix[row][col]) {
        const isSpecial =
          piece.specialAttr !== null &&
          piece.specialLocalPos !== null &&
          piece.specialLocalPos[0] === col &&
          piece.specialLocalPos[1] === row;
        cells.push({
          x: piece.x + col,
          y: piece.y + row,
          attr: isSpecial && piece.specialAttr ? piece.specialAttr : 'normal',
        });
      }
    }
  }
  return cells;
}

export function isValidPosition(board: BoardGrid, piece: ActivePiece): boolean {
  const cells = getPieceCells(piece);
  for (const [cx, cy] of cells) {
    if (cx < 0 || cx >= BOARD_COLS || cy >= BOARD_TOTAL_ROWS) {
      return false;
    }
    if (cy >= 0 && board[cy][cx] !== null) {
      return false;
    }
  }
  return true;
}

function rotateLocalPos(
  pos: [number, number] | null,
  matrixSize: number,
  direction: 1 | -1
): [number, number] | null {
  if (!pos) return null;
  const [col, row] = pos;
  if (direction === 1) {
    return [matrixSize - 1 - row, col];
  }
  return [row, matrixSize - 1 - col];
}

export function tryRotatePiece(
  board: BoardGrid,
  piece: ActivePiece,
  direction: 1 | -1
): { piece: ActivePiece; kickIndex: number } | null {
  if (piece.type === 'O') {
    return { piece: { ...piece }, kickIndex: 0 };
  }

  const nextRotation = (((piece.rotation + direction) % 4 + 4) % 4) as RotationState;
  const kickKey = `${piece.rotation}>${nextRotation}` as const;
  const kicks = piece.type === 'I' ? I_WALL_KICKS[kickKey] : JLSTZ_WALL_KICKS[kickKey];
  const matrixSize = TETROMINO_MATRICES[piece.type][0].length;
  const nextSpecialLocalPos = rotateLocalPos(piece.specialLocalPos, matrixSize, direction);

  for (let i = 0; i < kicks.length; i++) {
    const [dx, dy] = kicks[i];
    const candidate: ActivePiece = {
      ...piece,
      x: piece.x + dx,
      y: piece.y + dy,
      rotation: nextRotation,
      specialLocalPos: nextSpecialLocalPos,
    };
    if (isValidPosition(board, candidate)) {
      return { piece: candidate, kickIndex: i };
    }
  }

  return null;
}

export function getGhostY(board: BoardGrid, piece: ActivePiece): number {
  let ghostY = piece.y;
  while (isValidPosition(board, { ...piece, y: ghostY + 1 })) {
    ghostY++;
  }
  return ghostY;
}

export function detectTSpin(
  board: BoardGrid,
  piece: ActivePiece,
  lastActionWasRotate: boolean,
  lastKickIndex: number
): 'NONE' | 'MINI' | 'FULL' {
  if (piece.type !== 'T' || !lastActionWasRotate) {
    return 'NONE';
  }

  const cx = piece.x + 1;
  const cy = piece.y + 1;
  const corners: [number, number][] = [
    [cx - 1, cy - 1],
    [cx + 1, cy - 1],
    [cx - 1, cy + 1],
    [cx + 1, cy + 1],
  ];

  const isOccupied = (x: number, y: number) => {
    if (x < 0 || x >= BOARD_COLS || y >= BOARD_TOTAL_ROWS) return true;
    if (y < 0) return false;
    return board[y][x] !== null;
  };

  const occupiedCount = corners.filter(([x, y]) => isOccupied(x, y)).length;
  if (occupiedCount < 3) return 'NONE';

  const frontCornersByRot: Record<RotationState, [number, number][]> = {
    0: [corners[0], corners[1]],
    1: [corners[1], corners[3]],
    2: [corners[2], corners[3]],
    3: [corners[0], corners[2]],
  };

  const frontOccupied = frontCornersByRot[piece.rotation].filter(([x, y]) =>
    isOccupied(x, y)
  ).length;

  if (frontOccupied === 2 || lastKickIndex === 4) {
    return 'FULL';
  }
  return 'MINI';
}

export function lockPieceToBoard(
  board: BoardGrid,
  piece: ActivePiece
): {
  nextBoard: BoardGrid;
  clearedRows: number[];
  lockedAboveVisible: boolean;
  newlyLockedSpecialCells: Array<{ x: number; y: number; attr: SpecialAttribute }>;
} {
  const nextBoard = board.map((row) => [...row]);
  const cells = getPieceDetailedCells(piece);
  let allAboveVisible = true;
  const newlyLockedSpecialCells: Array<{ x: number; y: number; attr: SpecialAttribute }> = [];

  for (const { x: cx, y: cy, attr } of cells) {
    if (cy >= 0 && cy < BOARD_TOTAL_ROWS && cx >= 0 && cx < BOARD_COLS) {
      nextBoard[cy][cx] = { type: piece.type, attr };
      if (attr !== 'normal') {
        newlyLockedSpecialCells.push({ x: cx, y: cy, attr });
      }
    }
    if (cy >= BOARD_BUFFER_ROWS) {
      allAboveVisible = false;
    }
  }

  const clearedRows: number[] = [];
  for (let r = 0; r < BOARD_TOTAL_ROWS; r++) {
    if (nextBoard[r].every((cell) => cell !== null)) {
      clearedRows.push(r);
    }
  }

  return {
    nextBoard,
    clearedRows,
    lockedAboveVisible: allAboveVisible,
    newlyLockedSpecialCells,
  };
}

export interface SpecialExplosionFx {
  x: number;
  y: number;
  radius: number;
  depth: number;
}

export interface SpecialLightningFx {
  x: number;
  y: number;
  cross: boolean;
  depth: number;
}

export interface SpecialFreezeFx {
  x: number;
  y: number;
  depth: number;
}

export interface SpecialLinkArcFx {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  attr: SpecialAttribute;
  depth: number;
}

export interface SpecialResolution {
  nextBoard: BoardGrid;
  triggeredCount: number;
  triggeredAttrs: SpecialAttribute[];
  destroyedCount: number;
  destroyedParticles: Array<{ x: number; y: number; color: string }>;
  freezeAddMs: number;
  bonusPoints: number;
  label: string;
  explosions: SpecialExplosionFx[];
  lightnings: SpecialLightningFx[];
  freezes: SpecialFreezeFx[];
  linkArcs: SpecialLinkArcFx[];
}

const ORTHO_DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function resolveSpecialEffects(
  board: BoardGrid,
  newlyLockedSpecialCells: Array<{ x: number; y: number; attr: SpecialAttribute }>,
  clearedRows: number[],
  level: number
): SpecialResolution {
  const queue: Array<{
    x: number;
    y: number;
    attr: SpecialAttribute;
    depth: number;
  }> = [];
  const queuedKeys = new Set<string>();

  const enqueue = (
    x: number,
    y: number,
    attr: SpecialAttribute,
    depth: number
  ) => {
    const key = `${x},${y}`;
    if (queuedKeys.has(key)) return;
    queuedKeys.add(key);
    queue.push({ x, y, attr, depth });
  };

  // Seed 1: Any special block inside a cleared horizontal line triggers
  for (const r of clearedRows) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const cell = board[r][c];
      if (cell && cell.attr !== 'normal') {
        enqueue(c, r, cell.attr, 0);
      }
    }
  }

  // Seed 2: Newly locked special block touching an existing same-attribute block triggers resonance link
  const linkArcs: SpecialLinkArcFx[] = [];
  for (const placed of newlyLockedSpecialCells) {
    for (const [dx, dy] of ORTHO_DIRS) {
      const nx = placed.x + dx;
      const ny = placed.y + dy;
      if (nx < 0 || nx >= BOARD_COLS || ny < 0 || ny >= BOARD_TOTAL_ROWS) continue;
      const neighbor = board[ny][nx];
      if (neighbor && neighbor.attr === placed.attr) {
        enqueue(placed.x, placed.y, placed.attr, 0);
        enqueue(nx, ny, neighbor.attr, 0);
        linkArcs.push({
          fromX: placed.x,
          fromY: placed.y,
          toX: nx,
          toY: ny,
          attr: placed.attr,
          depth: 0,
        });
      }
    }
  }

  if (queue.length === 0) {
    return {
      nextBoard: board,
      triggeredCount: 0,
      triggeredAttrs: [],
      destroyedCount: 0,
      destroyedParticles: [],
      freezeAddMs: 0,
      bonusPoints: 0,
      label: '',
      explosions: [],
      lightnings: [],
      freezes: [],
      linkArcs: [],
    };
  }

  const visited = new Set<string>();
  const destroyedKeys = new Set<string>();
  const triggeredAttrsSet = new Set<SpecialAttribute>();
  const explosions: SpecialExplosionFx[] = [];
  const lightnings: SpecialLightningFx[] = [];
  const freezes: SpecialFreezeFx[] = [];
  let triggeredCount = 0;
  let freezeAddMs = 0;

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = `${current.x},${current.y}`;
    if (visited.has(key)) continue;
    visited.add(key);

    triggeredCount += 1;
    triggeredAttrsSet.add(current.attr);
    destroyedKeys.add(key);

    // Special Link Chain: any orthogonally adjacent special block (same or different attribute) chains!
    for (const [dx, dy] of ORTHO_DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      if (nx < 0 || nx >= BOARD_COLS || ny < 0 || ny >= BOARD_TOTAL_ROWS) continue;
      const neighbor = board[ny][nx];
      if (neighbor && neighbor.attr !== 'normal' && !queuedKeys.has(`${nx},${ny}`)) {
        linkArcs.push({
          fromX: current.x,
          fromY: current.y,
          toX: nx,
          toY: ny,
          attr: neighbor.attr,
          depth: current.depth + 1,
        });
        enqueue(nx, ny, neighbor.attr, current.depth + 1);
      }
    }

    if (current.attr === 'fire') {
      const radius = 1; // 3x3 blast per fire node
      explosions.push({
        x: current.x,
        y: current.y,
        radius,
        depth: current.depth,
      });
      for (let by = current.y - radius; by <= current.y + radius; by++) {
        for (let bx = current.x - radius; bx <= current.x + radius; bx++) {
          if (bx < 0 || bx >= BOARD_COLS || by < 0 || by >= BOARD_TOTAL_ROWS) continue;
          const target = board[by][bx];
          if (target) {
            destroyedKeys.add(`${bx},${by}`);
            if (target.attr !== 'normal' && !queuedKeys.has(`${bx},${by}`)) {
              linkArcs.push({
                fromX: current.x,
                fromY: current.y,
                toX: bx,
                toY: by,
                attr: target.attr,
                depth: current.depth + 1,
              });
              enqueue(bx, by, target.attr, current.depth + 1);
            }
          }
        }
      }
    } else if (current.attr === 'ice') {
      freezes.push({
        x: current.x,
        y: current.y,
        depth: current.depth,
      });
      freezeAddMs = Math.min(
        FREEZE_MAX_MS,
        freezeAddMs === 0 ? FREEZE_BASE_MS : freezeAddMs + FREEZE_STACK_MS
      );
    } else if (current.attr === 'lightning') {
      const isCross = current.depth >= 1;
      lightnings.push({
        x: current.x,
        y: current.y,
        cross: isCross,
        depth: current.depth,
      });

      // Clear entire column x
      for (let ry = BOARD_BUFFER_ROWS; ry < BOARD_TOTAL_ROWS; ry++) {
        const target = board[ry][current.x];
        if (target) {
          destroyedKeys.add(`${current.x},${ry}`);
          if (target.attr !== 'normal' && !queuedKeys.has(`${current.x},${ry}`)) {
            linkArcs.push({
              fromX: current.x,
              fromY: current.y,
              toX: current.x,
              toY: ry,
              attr: target.attr,
              depth: current.depth + 1,
            });
            enqueue(current.x, ry, target.attr, current.depth + 1);
          }
        }
      }

      // If triggered via chain link, also clear row y!
      if (isCross) {
        for (let rx = 0; rx < BOARD_COLS; rx++) {
          const target = board[current.y][rx];
          if (target) {
            destroyedKeys.add(`${rx},${current.y}`);
            if (target.attr !== 'normal' && !queuedKeys.has(`${rx},${current.y}`)) {
              linkArcs.push({
                fromX: current.x,
                fromY: current.y,
                toX: rx,
                toY: current.y,
                attr: target.attr,
                depth: current.depth + 1,
              });
              enqueue(rx, current.y, target.attr, current.depth + 1);
            }
          }
        }
      }
    }
  }

  const clearedRowSet = new Set(clearedRows);
  const nextBoard = board.map((row) => [...row]);
  const destroyedParticles: Array<{ x: number; y: number; color: string }> = [];
  let destroyedCount = 0;

  destroyedKeys.forEach((key) => {
    const [xs, ys] = key.split(',');
    const x = Number(xs);
    const y = Number(ys);
    const cell = nextBoard[y]?.[x];
    if (!cell) return;

    destroyedCount += 1;
    const fxColor =
      cell.attr !== 'normal'
        ? ATTRIBUTE_META[cell.attr].accent
        : PIECE_PALETTE[cell.type].highlight;
    destroyedParticles.push({ x, y, color: fxColor });

    // Preserve cells on full clearedRows during the 160ms sweep flash; removeClearedRows will drop them
    if (!clearedRowSet.has(y)) {
      nextBoard[y][x] = null;
    }
  });

  const triggeredAttrs = Array.from(triggeredAttrsSet);
  const chainMultiplier = triggeredCount > 1 ? Math.min(4, 1 + (triggeredCount - 1) * 0.5) : 1;
  const bonusPoints = Math.round(
    (destroyedCount * 50 + triggeredCount * 150) * level * chainMultiplier
  );

  let label = '';
  if (triggeredCount === 1) {
    const only = triggeredAttrs[0];
    if (only === 'fire') label = '烈焰爆破！';
    else if (only === 'ice') label = '寒冰凍結！';
    else label = '雷電貫穿！';
  } else {
    const names = triggeredAttrs.map((a) => ATTRIBUTE_META[a].shortName).join(' × ');
    label = `特殊連結 x${triggeredCount} · ${names}`;
  }

  return {
    nextBoard,
    triggeredCount,
    triggeredAttrs,
    destroyedCount,
    destroyedParticles,
    freezeAddMs,
    bonusPoints,
    label,
    explosions,
    lightnings,
    freezes,
    linkArcs,
  };
}

export interface FallingBlock {
  x: number;
  fromY: number;
  toY: number;
  cell: NonNullable<BoardGrid[number][number]>;
}

export interface ColumnCollapseResult {
  staticBoard: BoardGrid;
  settledBoard: BoardGrid;
  movedBlocks: FallingBlock[];
  durationMs: number;
}

export function collapseBoardColumns(board: BoardGrid): ColumnCollapseResult {
  const staticBoard = createEmptyBoard();
  const settledBoard = createEmptyBoard();
  const movedBlocks: FallingBlock[] = [];
  let maxDrop = 0;

  for (let x = 0; x < BOARD_COLS; x++) {
    let writeRow = BOARD_TOTAL_ROWS - 1;
    for (let r = BOARD_TOTAL_ROWS - 1; r >= 0; r--) {
      const cell = board[r][x];
      if (!cell) continue;

      settledBoard[writeRow][x] = cell;
      if (writeRow !== r) {
        const drop = writeRow - r;
        if (drop > maxDrop) maxDrop = drop;
        movedBlocks.push({
          x,
          fromY: r,
          toY: writeRow,
          cell,
        });
      } else {
        staticBoard[r][x] = cell;
      }
      writeRow--;
    }
  }

  const durationMs =
    movedBlocks.length > 0 ? Math.min(260, 110 + maxDrop * 26) : 0;

  return {
    staticBoard,
    settledBoard,
    movedBlocks,
    durationMs,
  };
}

export function removeClearedRows(board: BoardGrid, clearedRows: number[]): BoardGrid {
  if (clearedRows.length === 0) return board;
  const clearedSet = new Set(clearedRows);
  const remaining = board.filter((_, idx) => !clearedSet.has(idx));
  const newEmptyRows = Array.from({ length: clearedRows.length }, () =>
    Array(BOARD_COLS).fill(null)
  );
  return [...newEmptyRows, ...remaining];
}

export function getGravityMs(level: number): number {
  const clamped = Math.max(1, Math.min(20, level));
  const seconds = Math.pow(0.8 - (clamped - 1) * 0.007, clamped - 1);
  return Math.max(45, Math.round(seconds * 1000));
}

export function calculateLineScore(params: {
  linesCleared: number;
  level: number;
  tSpin: 'NONE' | 'MINI' | 'FULL';
  combo: number;
  isBackToBack: boolean;
}): {
  points: number;
  label: string;
  qualifiesBackToBack: boolean;
} {
  const { linesCleared, level, tSpin, combo, isBackToBack } = params;
  let base = 0;
  let label = '';
  let qualifiesB2B = false;

  if (tSpin === 'FULL') {
    qualifiesB2B = linesCleared > 0;
    if (linesCleared === 0) {
      base = 400;
      label = 'T-SPIN';
    } else if (linesCleared === 1) {
      base = 800;
      label = 'T-SPIN 單行';
    } else if (linesCleared === 2) {
      base = 1200;
      label = 'T-SPIN 雙行';
    } else if (linesCleared === 3) {
      base = 1600;
      label = 'T-SPIN 三行';
    }
  } else if (tSpin === 'MINI') {
    qualifiesB2B = linesCleared > 0;
    if (linesCleared === 0) {
      base = 100;
      label = 'T-SPIN MINI';
    } else if (linesCleared === 1) {
      base = 200;
      label = 'T-SPIN MINI';
    } else if (linesCleared === 2) {
      base = 400;
      label = 'T-SPIN MINI 雙行';
    }
  } else {
    if (linesCleared === 1) {
      base = 100;
      label = '單行消除';
    } else if (linesCleared === 2) {
      base = 300;
      label = '雙行消除';
    } else if (linesCleared === 3) {
      base = 500;
      label = '三行消除';
    } else if (linesCleared === 4) {
      base = 800;
      label = 'TETRIS 四行';
      qualifiesB2B = true;
    }
  }

  let total = base * level;
  if (qualifiesB2B && isBackToBack && linesCleared > 0) {
    total = Math.round(total * 1.5);
    label = `${label} · 連續獎勵`;
  }

  if (combo > 0 && linesCleared > 0) {
    total += 50 * combo * level;
  }

  return {
    points: total,
    label,
    qualifiesBackToBack: qualifiesB2B,
  };
}
