export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export type SpecialAttribute = 'fire' | 'ice' | 'lightning';
export type BlockAttribute = 'normal' | SpecialAttribute;

export type RotationState = 0 | 1 | 2 | 3;

export type GameStatus = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';

export interface QueuePiece {
  type: TetrominoType;
  specialCellIndex: number | null;
  specialAttr: SpecialAttribute | null;
}

export interface ActivePiece {
  type: TetrominoType;
  x: number;
  y: number;
  rotation: RotationState;
  specialCellIndex: number | null;
  specialLocalPos: [number, number] | null;
  specialAttr: SpecialAttribute | null;
}

export interface BoardCell {
  type: TetrominoType;
  attr: BlockAttribute;
}

export type CellValue = BoardCell | null;
export type BoardGrid = CellValue[][];

export const BOARD_COLS = 10;
export const BOARD_VISIBLE_ROWS = 20;
export const BOARD_BUFFER_ROWS = 2;
export const BOARD_TOTAL_ROWS = BOARD_VISIBLE_ROWS + BOARD_BUFFER_ROWS;

export const LOCK_DELAY_MS = 500;
export const MAX_LOCK_RESETS = 15;
export const LINE_CLEAR_FLASH_MS = 160;
export const FREEZE_BASE_MS = 6000;
export const FREEZE_STACK_MS = 2500;
export const FREEZE_MAX_MS = 10000;

export const ATTRIBUTE_META: Record<
  SpecialAttribute,
  {
    name: string;
    shortName: string;
    description: string;
    accent: string;
    glow: string;
    rim: string;
  }
> = {
  fire: {
    name: '烈焰方塊',
    shortName: '爆破',
    description: '相連或消行引爆 3×3 範圍',
    accent: '#FB7185',
    glow: 'rgba(249, 115, 22, 0.85)',
    rim: '#FED7AA',
  },
  ice: {
    name: '寒冰方塊',
    shortName: '凍結',
    description: '相連或消行凍結重力 6 秒',
    accent: '#38BDF8',
    glow: 'rgba(56, 189, 248, 0.85)',
    rim: '#E0F2FE',
  },
  lightning: {
    name: '雷電方塊',
    shortName: '貫穿',
    description: '相連或消行消除整條縱行',
    accent: '#FACC15',
    glow: 'rgba(250, 204, 21, 0.88)',
    rim: '#FEF9C3',
  },
};

export const PIECE_PALETTE: Record<
  TetrominoType,
  {
    fill: string;
    highlight: string;
    shadow: string;
    border: string;
    ghost: string;
  }
> = {
  I: {
    fill: '#06B6D4',
    highlight: '#67E8F9',
    shadow: '#0E7490',
    border: '#155E75',
    ghost: 'rgba(6, 182, 212, 0.35)',
  },
  O: {
    fill: '#EAB308',
    highlight: '#FDE047',
    shadow: '#A16207',
    border: '#854D0E',
    ghost: 'rgba(234, 179, 8, 0.35)',
  },
  T: {
    fill: '#A855F7',
    highlight: '#D8B4FE',
    shadow: '#7E22CE',
    border: '#6B21A8',
    ghost: 'rgba(168, 85, 247, 0.35)',
  },
  S: {
    fill: '#22C55E',
    highlight: '#86EFAC',
    shadow: '#15803D',
    border: '#166534',
    ghost: 'rgba(34, 197, 94, 0.35)',
  },
  Z: {
    fill: '#EF4444',
    highlight: '#FCA5A5',
    shadow: '#B91C1C',
    border: '#991B1B',
    ghost: 'rgba(239, 68, 68, 0.35)',
  },
  J: {
    fill: '#3B82F6',
    highlight: '#93C5FD',
    shadow: '#1D4ED8',
    border: '#1E40AF',
    ghost: 'rgba(59, 130, 246, 0.35)',
  },
  L: {
    fill: '#F97316',
    highlight: '#FDBA74',
    shadow: '#C2410C',
    border: '#9A3412',
    ghost: 'rgba(249, 115, 22, 0.35)',
  },
};

// Standard SRS rotation matrices (4x4 for I/O, 3x3 for others)
export const TETROMINO_MATRICES: Record<TetrominoType, number[][][]> = {
  I: [
    [
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
      [0, 0, 1, 0],
    ],
    [
      [0, 0, 0, 0],
      [0, 0, 0, 0],
      [1, 1, 1, 1],
      [0, 0, 0, 0],
    ],
    [
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
      [0, 1, 0, 0],
    ],
  ],
  O: [
    [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ],
    [
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ],
  ],
  T: [
    [
      [0, 1, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  ],
  S: [
    [
      [0, 1, 1],
      [1, 1, 0],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 1],
      [0, 0, 1],
    ],
    [
      [0, 0, 0],
      [0, 1, 1],
      [1, 1, 0],
    ],
    [
      [1, 0, 0],
      [1, 1, 0],
      [0, 1, 0],
    ],
  ],
  Z: [
    [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 0, 1],
      [0, 1, 1],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 0],
      [0, 1, 1],
    ],
    [
      [0, 1, 0],
      [1, 1, 0],
      [1, 0, 0],
    ],
  ],
  J: [
    [
      [1, 0, 0],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 1],
      [0, 1, 0],
      [0, 1, 0],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [0, 0, 1],
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [1, 1, 0],
    ],
  ],
  L: [
    [
      [0, 0, 1],
      [1, 1, 1],
      [0, 0, 0],
    ],
    [
      [0, 1, 0],
      [0, 1, 0],
      [0, 1, 1],
    ],
    [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
    ],
    [
      [1, 1, 0],
      [0, 1, 0],
      [0, 1, 0],
    ],
  ],
};

// SRS wall kick offsets [dx, dy] where +dy is downward in screen coordinates
type KickKey = `${RotationState}>${RotationState}`;

export const JLSTZ_WALL_KICKS: Record<KickKey, [number, number][]> = {
  '0>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '1>0': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '1>2': [[0, 0], [1, 0], [1, 1], [0, -2], [1, -2]],
  '2>1': [[0, 0], [-1, 0], [-1, -1], [0, 2], [-1, 2]],
  '2>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '3>2': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '3>0': [[0, 0], [-1, 0], [-1, 1], [0, -2], [-1, -2]],
  '0>3': [[0, 0], [1, 0], [1, -1], [0, 2], [1, 2]],
  '0>0': [[0, 0]],
  '1>1': [[0, 0]],
  '2>2': [[0, 0]],
  '3>3': [[0, 0]],
  '0>2': [[0, 0]],
  '2>0': [[0, 0]],
  '1>3': [[0, 0]],
  '3>1': [[0, 0]],
};

export const I_WALL_KICKS: Record<KickKey, [number, number][]> = {
  '0>1': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '1>0': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '1>2': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '2>1': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '2>3': [[0, 0], [2, 0], [-1, 0], [2, -1], [-1, 2]],
  '3>2': [[0, 0], [-2, 0], [1, 0], [-2, 1], [1, -2]],
  '3>0': [[0, 0], [1, 0], [-2, 0], [1, 2], [-2, -1]],
  '0>3': [[0, 0], [-1, 0], [2, 0], [-1, -2], [2, 1]],
  '0>0': [[0, 0]],
  '1>1': [[0, 0]],
  '2>2': [[0, 0]],
  '3>3': [[0, 0]],
  '0>2': [[0, 0]],
  '2>0': [[0, 0]],
  '1>3': [[0, 0]],
  '3>1': [[0, 0]],
};
