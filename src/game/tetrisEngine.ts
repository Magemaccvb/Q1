import {
  ActivePiece,
  BOARD_BUFFER_ROWS,
  BOARD_COLS,
  BOARD_TOTAL_ROWS,
  BoardGrid,
  I_WALL_KICKS,
  JLSTZ_WALL_KICKS,
  RotationState,
  TETROMINO_MATRICES,
  TetrominoType,
} from './tetrisTypes';

const ALL_TYPES: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

export function createEmptyBoard(): BoardGrid {
  return Array.from({ length: BOARD_TOTAL_ROWS }, () =>
    Array<TetrominoType | null>(BOARD_COLS).fill(null)
  );
}

export function generateBag(): TetrominoType[] {
  const bag = [...ALL_TYPES];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

export function createSpawnPiece(type: TetrominoType): ActivePiece {
  const x = type === 'O' ? 3 : type === 'I' ? 3 : 3;
  const y = type === 'I' ? BOARD_BUFFER_ROWS - 2 : BOARD_BUFFER_ROWS - 1;
  return {
    type,
    x,
    y,
    rotation: 0,
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

  for (let i = 0; i < kicks.length; i++) {
    const [dx, dy] = kicks[i];
    const candidate: ActivePiece = {
      ...piece,
      x: piece.x + dx,
      y: piece.y + dy,
      rotation: nextRotation,
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

  // 4 corners around the center of the 3x3 T-piece (x+1, y+1)
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

  // Front two corners depend on rotation state
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

export function lockPieceToBoard(board: BoardGrid, piece: ActivePiece): {
  nextBoard: BoardGrid;
  clearedRows: number[];
  lockedAboveVisible: boolean;
} {
  const nextBoard = board.map((row) => [...row]);
  const cells = getPieceCells(piece);
  let allAboveVisible = true;

  for (const [cx, cy] of cells) {
    if (cy >= 0 && cy < BOARD_TOTAL_ROWS && cx >= 0 && cx < BOARD_COLS) {
      nextBoard[cy][cx] = piece.type;
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
  };
}

export function removeClearedRows(board: BoardGrid, clearedRows: number[]): BoardGrid {
  if (clearedRows.length === 0) return board;
  const clearedSet = new Set(clearedRows);
  const remaining = board.filter((_, idx) => !clearedSet.has(idx));
  const newEmptyRows = Array.from({ length: clearedRows.length }, () =>
    Array<TetrominoType | null>(BOARD_COLS).fill(null)
  );
  return [...newEmptyRows, ...remaining];
}

export function getGravityMs(level: number): number {
  // Classic guideline-inspired curve in ms per cell drop
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
