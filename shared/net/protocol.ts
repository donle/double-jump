export type PlayerSeat = 'p1' | 'p2';
export type RoomPhase = 'lobby' | 'playing' | 'ended';
export type LevelId = 'lv1' | 'lv2' | 'lv3';
export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';

export type LevelSeeds = Record<LevelId, number>;

export interface LevelRun {
  runSeed: number;
  levelSeeds: LevelSeeds;
}

export interface NetFrameInput {
  jumpDown: boolean;
  jumpJustPressed: boolean;
  jumpJustReleased: boolean;
}

export interface NetPlayerSnapshot {
  seat: PlayerSeat;
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: 'on_ground' | 'in_air' | 'dead';
  jumping: boolean;
  canJump: boolean;
  inPit: boolean;
}

export interface NetGameSnapshot {
  seq: number;
  sentAt: number;
  p1: NetPlayerSnapshot;
  p2: NetPlayerSnapshot;
  trailerId: PlayerSeat | null;
  gameState: 'playing' | 'game_over' | 'win';
  result?: {
    elapsedMs: number;
    maxX: number;
    endX: number;
  };
}

export interface RoomPlayer {
  seat: PlayerSeat;
  clientId: string;
  connected: boolean;
  ready: boolean;
  isHost: boolean;
  joinedAt: number;
}

export interface RoomState {
  roomId: string;
  phase: RoomPhase;
  players: RoomPlayer[];
  hostSeat: PlayerSeat | null;
  level: LevelId;
  difficulty: Difficulty;
  levelRun: LevelRun;
  restartVotes: PlayerSeat[];
}

export type ClientToServerMessage =
  | {
      type: 'create_room';
      requestId?: string;
      level: LevelId;
      difficulty: Difficulty;
    }
  | {
      type: 'join_room';
      requestId?: string;
      roomId: string;
    }
  | {
      type: 'set_ready';
      ready: boolean;
    }
  | {
      type: 'start_game';
    }
  | {
      type: 'input';
      seq: number;
      input: NetFrameInput;
    }
  | {
      type: 'snapshot';
      snapshot: NetGameSnapshot;
    }
  | {
      type: 'return_lobby';
    }
  | {
      type: 'restart_vote';
      approve: boolean;
    }
  | {
      type: 'advance_level';
    }
  | {
      type: 'disband_room';
    }
  | {
      type: 'leave_room';
    };

export type ServerToClientMessage =
  | {
      type: 'welcome';
      clientId: string;
      serverTime: number;
    }
  | {
      type: 'room_joined';
      requestId?: string;
      yourSeat: PlayerSeat;
      state: RoomState;
    }
  | {
      type: 'room_state';
      yourSeat: PlayerSeat | null;
      state: RoomState;
    }
  | {
      type: 'game_started';
      yourSeat: PlayerSeat;
      state: RoomState;
      terrain: import('../level/LevelData').PieceData[];
      initialSnapshot: NetGameSnapshot;
    }
  | {
      type: 'peer_input';
      seat: PlayerSeat;
      seq: number;
      input: NetFrameInput;
      serverTime: number;
    }
  | {
      type: 'snapshot';
      snapshot: NetGameSnapshot;
      serverTime: number;
    }
  | {
      type: 'game_tick';
      snapshot: NetGameSnapshot;
      serverTime: number;
    }
  | {
      type: 'room_left';
    }
  | {
      type: 'room_closed';
      reason: 'disbanded';
      message: string;
    }
  | {
      type: 'error';
      requestId?: string;
      code: string;
      message: string;
    };
