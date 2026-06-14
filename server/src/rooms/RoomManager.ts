import type { WebSocket } from 'ws';
import type {
  ClientToServerMessage,
  Difficulty,
  LevelId,
  LevelRun,
  NetGameSnapshot,
  NetFrameInput,
  PlayerSeat,
  RoomPlayer,
  RoomState,
  ServerToClientMessage,
} from '../../../shared/net/protocol';

interface Session {
  clientId: string;
  socket: WebSocket;
  roomId: string | null;
  seat: PlayerSeat | null;
}

interface SeatState {
  clientId: string;
  socket: WebSocket | null;
  connected: boolean;
  ready: boolean;
  joinedAt: number;
  disconnectAt: number | null;
}

interface Room {
  roomId: string;
  phase: RoomState['phase'];
  hostSeat: PlayerSeat;
  level: LevelId;
  difficulty: Difficulty;
  levelRun: LevelRun;
  seats: Record<PlayerSeat, SeatState | null>;
  restartVotes: Set<PlayerSeat>;
}

const SEATS: PlayerSeat[] = ['p1', 'p2'];
const RECONNECT_TTL_MS = 30_000;

export class RoomManager {
  private readonly sessions = new Map<WebSocket, Session>();
  private readonly rooms = new Map<string, Room>();

  attach(socket: WebSocket): void {
    const session: Session = {
      clientId: createClientId(),
      socket,
      roomId: null,
      seat: null,
    };
    this.sessions.set(socket, session);
    this.send(socket, {
      type: 'welcome',
      clientId: session.clientId,
      serverTime: Date.now(),
    });
  }

  detach(socket: WebSocket): void {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.sessions.delete(socket);
    this.markDisconnected(session);
  }

  handle(socket: WebSocket, message: ClientToServerMessage): void {
    const session = this.sessions.get(socket);
    if (!session) return;

    switch (message.type) {
      case 'create_room':
        this.createRoom(session, message.requestId, message.level, message.difficulty);
        return;
      case 'join_room':
        this.joinRoom(session, message.requestId, message.roomId);
        return;
      case 'set_ready':
        this.setReady(session, message.ready);
        return;
      case 'start_game':
        this.startGame(session);
        return;
      case 'input':
        this.forwardInput(session, message.seq, message.input);
        return;
      case 'snapshot':
        this.forwardSnapshot(session, message.snapshot);
        return;
      case 'return_lobby':
        this.returnLobby(session);
        return;
      case 'restart_vote':
        this.restartVote(session, message.approve);
        return;
      case 'advance_level':
        this.advanceLevel(session);
        return;
      case 'leave_room':
        this.leaveRoom(session);
        this.send(session.socket, { type: 'room_left' });
        return;
    }
  }

  private createRoom(
    session: Session,
    requestId: string | undefined,
    level: LevelId,
    difficulty: Difficulty,
  ): void {
    this.leaveRoom(session);

    const room: Room = {
      roomId: this.nextRoomId(),
      phase: 'lobby',
      hostSeat: 'p1',
      level,
      difficulty,
      levelRun: createLevelRun(),
      restartVotes: new Set(),
      seats: {
        p1: this.createSeat(session, true),
        p2: null,
      },
    };
    this.rooms.set(room.roomId, room);
    session.roomId = room.roomId;
    session.seat = 'p1';

    this.send(session.socket, {
      type: 'room_joined',
      requestId,
      yourSeat: 'p1',
      state: this.toRoomState(room),
    });
    this.broadcastRoomState(room);
  }

  private joinRoom(session: Session, requestId: string | undefined, roomIdRaw: string): void {
    this.leaveRoom(session);
    const roomId = roomIdRaw.trim().toUpperCase();
    const room = this.rooms.get(roomId);
    if (!room) {
      this.error(session.socket, requestId, 'ROOM_NOT_FOUND', '房间不存在。');
      return;
    }
    if (room.phase !== 'lobby') {
      this.error(session.socket, requestId, 'ROOM_IN_PROGRESS', '房间已经开始。');
      return;
    }

    const seat = this.firstOpenSeat(room);
    if (!seat) {
      this.error(session.socket, requestId, 'ROOM_FULL', '房间已满。');
      return;
    }

    room.seats[seat] = this.createSeat(session, false);
    session.roomId = room.roomId;
    session.seat = seat;
    this.send(session.socket, {
      type: 'room_joined',
      requestId,
      yourSeat: seat,
      state: this.toRoomState(room),
    });
    this.broadcastRoomState(room);
  }

  private setReady(session: Session, ready: boolean): void {
    const entry = this.getSeatEntry(session);
    if (!entry) return;
    entry.seat.ready = ready;
    this.broadcastRoomState(entry.room);
  }

  private startGame(session: Session): void {
    const entry = this.getSeatEntry(session);
    if (!entry || entry.room.hostSeat !== entry.seatId) return;
    const hasBothPlayers = entry.room.seats.p1 && entry.room.seats.p2;
    if (!hasBothPlayers) {
      this.error(session.socket, undefined, 'WAITING_FOR_PLAYER', '需要两名玩家才能开始。');
      return;
    }

    entry.room.phase = 'playing';
    entry.room.restartVotes.clear();
    for (const seat of SEATS) {
      const player = entry.room.seats[seat];
      if (player) player.ready = true;
    }

    for (const seat of SEATS) {
      const player = entry.room.seats[seat];
      if (!player?.socket) continue;
      this.send(player.socket, {
        type: 'game_started',
        yourSeat: seat,
        state: this.toRoomState(entry.room),
      });
    }
    this.broadcastRoomState(entry.room);
  }

  private returnLobby(session: Session): void {
    const entry = this.getSeatEntry(session);
    if (!entry) return;
    entry.room.phase = 'lobby';
    entry.room.restartVotes.clear();
    entry.room.levelRun = createLevelRun();
    for (const seat of SEATS) {
      const player = entry.room.seats[seat];
      if (player) player.ready = entry.room.hostSeat === seat;
    }
    this.broadcastRoomState(entry.room);
  }

  private restartVote(session: Session, approve: boolean): void {
    const entry = this.getSeatEntry(session);
    if (!entry || entry.room.phase !== 'playing') return;
    if (approve) {
      entry.room.restartVotes.add(entry.seatId);
    } else {
      entry.room.restartVotes.delete(entry.seatId);
    }
    if (SEATS.every((seat) => entry.room.seats[seat] && entry.room.restartVotes.has(seat))) {
      entry.room.restartVotes.clear();
      entry.room.levelRun = createLevelRun();
      for (const seat of SEATS) {
        const player = entry.room.seats[seat];
        if (player) player.ready = true;
      }
      for (const seat of SEATS) {
        const player = entry.room.seats[seat];
        if (!player?.socket) continue;
        this.send(player.socket, {
          type: 'game_started',
          yourSeat: seat,
          state: this.toRoomState(entry.room),
        });
      }
      this.broadcastRoomState(entry.room);
      return;
    }
    this.broadcastRoomState(entry.room);
  }

  private advanceLevel(session: Session): void {
    const entry = this.getSeatEntry(session);
    if (!entry || entry.room.hostSeat !== entry.seatId || entry.room.phase !== 'playing') return;
    const nextLevel = getNextLevel(entry.room.level);
    if (!nextLevel) return;
    const hasBothPlayers = entry.room.seats.p1 && entry.room.seats.p2;
    if (!hasBothPlayers) return;

    entry.room.level = nextLevel;
    entry.room.restartVotes.clear();
    for (const seat of SEATS) {
      const player = entry.room.seats[seat];
      if (player) player.ready = true;
    }

    for (const seat of SEATS) {
      const player = entry.room.seats[seat];
      if (!player?.socket) continue;
      this.send(player.socket, {
        type: 'game_started',
        yourSeat: seat,
        state: this.toRoomState(entry.room),
      });
    }
    this.broadcastRoomState(entry.room);
  }

  private forwardInput(
    session: Session,
    seq: number,
    input: NetFrameInput,
  ): void {
    const entry = this.getSeatEntry(session);
    if (!entry || entry.room.phase !== 'playing') return;

    for (const seat of SEATS) {
      if (seat === entry.seatId) continue;
      const peer = entry.room.seats[seat];
      if (!peer?.socket) continue;
      this.send(peer.socket, {
        type: 'peer_input',
        seat: entry.seatId,
        seq,
        input,
        serverTime: Date.now(),
      });
    }
  }

  private forwardSnapshot(session: Session, snapshot: NetGameSnapshot): void {
    const entry = this.getSeatEntry(session);
    if (!entry || entry.room.phase !== 'playing') return;
    if (entry.room.hostSeat !== entry.seatId) return;

    for (const seat of SEATS) {
      if (seat === entry.seatId) continue;
      const peer = entry.room.seats[seat];
      if (!peer?.socket) continue;
      this.send(peer.socket, {
        type: 'snapshot',
        snapshot,
        serverTime: Date.now(),
      });
    }
  }

  private leaveRoom(session: Session): void {
    const entry = this.getSeatEntry(session);
    if (!entry) {
      session.roomId = null;
      session.seat = null;
      return;
    }

    entry.room.seats[entry.seatId] = null;
    session.roomId = null;
    session.seat = null;

    if (!entry.room.seats.p1 && !entry.room.seats.p2) {
      this.rooms.delete(entry.room.roomId);
      return;
    }

    if (entry.room.hostSeat === entry.seatId) {
      entry.room.hostSeat = entry.room.seats.p1 ? 'p1' : 'p2';
    }
    this.broadcastRoomState(entry.room);
  }

  private markDisconnected(session: Session): void {
    const entry = this.getSeatEntry(session);
    if (!entry) return;
    entry.seat.socket = null;
    entry.seat.connected = false;
    entry.seat.disconnectAt = Date.now();
    this.broadcastRoomState(entry.room);

    setTimeout(() => {
      if (entry.seat.connected) return;
      if (entry.seat.disconnectAt && Date.now() - entry.seat.disconnectAt < RECONNECT_TTL_MS) return;
      entry.room.seats[entry.seatId] = null;
      if (!entry.room.seats.p1 && !entry.room.seats.p2) {
        this.rooms.delete(entry.room.roomId);
      } else {
        this.broadcastRoomState(entry.room);
      }
    }, RECONNECT_TTL_MS + 100);
  }

  private createSeat(session: Session, ready: boolean): SeatState {
    return {
      clientId: session.clientId,
      socket: session.socket,
      connected: true,
      ready,
      joinedAt: Date.now(),
      disconnectAt: null,
    };
  }

  private firstOpenSeat(room: Room): PlayerSeat | null {
    for (const seat of SEATS) {
      if (!room.seats[seat]) return seat;
    }
    return null;
  }

  private getSeatEntry(session: Session): { room: Room; seatId: PlayerSeat; seat: SeatState } | null {
    if (!session.roomId || !session.seat) return null;
    const room = this.rooms.get(session.roomId);
    if (!room) return null;
    const seat = room.seats[session.seat];
    if (!seat) return null;
    return { room, seatId: session.seat, seat };
  }

  private broadcastRoomState(room: Room): void {
    const state = this.toRoomState(room);
    for (const seat of SEATS) {
      const player = room.seats[seat];
      if (!player?.socket) continue;
      this.send(player.socket, {
        type: 'room_state',
        yourSeat: seat,
        state,
      });
    }
  }

  private toRoomState(room: Room): RoomState {
    const players: RoomPlayer[] = [];
    for (const seat of SEATS) {
      const player = room.seats[seat];
      if (!player) continue;
      players.push({
        seat,
        clientId: player.clientId,
        connected: player.connected,
        ready: player.ready,
        isHost: room.hostSeat === seat,
        joinedAt: player.joinedAt,
      });
    }
    return {
      roomId: room.roomId,
      phase: room.phase,
      players,
      hostSeat: room.hostSeat,
      level: room.level,
      difficulty: room.difficulty,
      levelRun: room.levelRun,
      restartVotes: [...room.restartVotes],
    };
  }

  private nextRoomId(): string {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const id = Math.floor(100000 + Math.random() * 900000).toString();
      if (!this.rooms.has(id)) return id;
    }
    throw new Error('Could not allocate room id.');
  }

  private send(socket: WebSocket, message: ServerToClientMessage): void {
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  private error(socket: WebSocket, requestId: string | undefined, code: string, message: string): void {
    this.send(socket, { type: 'error', requestId, code, message });
  }
}

function createClientId(): string {
  return `c_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

function createLevelRun(): LevelRun {
  const runSeed = normalizeSeed(Math.floor(Math.random() * 0xffffffff));
  const rng = mulberry32(runSeed);
  return {
    runSeed,
    levelSeeds: {
      lv1: normalizeSeed(rng() * 0xffffffff),
      lv2: normalizeSeed(rng() * 0xffffffff),
      lv3: normalizeSeed(rng() * 0xffffffff),
    },
  };
}

function getNextLevel(level: LevelId): LevelId | null {
  switch (level) {
    case 'lv1':
      return 'lv2';
    case 'lv2':
      return 'lv3';
    case 'lv3':
      return null;
  }
}

function normalizeSeed(seed: number): number {
  const normalized = Math.floor(seed) >>> 0;
  return normalized === 0 ? 1 : normalized;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
