import { NEUTRAL_INPUT, type FrameInput } from '../game/input/InputDevice';
import type {
  ClientToServerMessage,
  Difficulty,
  LevelId,
  NetGameSnapshot,
  NetFrameInput,
  PlayerSeat,
  RoomState,
  ServerToClientMessage,
} from '../../../shared/net/protocol';

type StateListener = () => void;
type StartListener = () => void;
type RoomClosedListener = () => void;

interface PendingRequest {
  resolve: () => void;
  reject: (error: Error) => void;
}

type RequestMessage =
  | Omit<Extract<ClientToServerMessage, { type: 'create_room' }>, 'requestId'>
  | Omit<Extract<ClientToServerMessage, { type: 'join_room' }>, 'requestId'>;

function defaultWsUrl(): string {
  // 永远走相对路径 /ws：Vite（或任何前置代理）会把它升级并转发到 8787 后端。
  // 这样 LAN / localhost / natapp 公网 三种部署形态用同一份代码，不用改 URL。
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export class NetClient {
  private socket: WebSocket | null = null;
  private clientId: string | null = null;
  private seat: PlayerSeat | null = null;
  private roomState: RoomState | null = null;
  private connected = false;
  private inputSeq = 0;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly stateListeners = new Set<StateListener>();
  private readonly startListeners = new Set<StartListener>();
  private readonly roomClosedListeners = new Set<RoomClosedListener>();
  private latestSnapshot: NetGameSnapshot | null = null;
  private latestTick: NetGameSnapshot | null = null;
  /**
   * 服务端权威模式下，game_started 携带的关卡数据 + 初始 snapshot。
   * GameScene 通过 consumePendingTerrain / consumePendingInitialSnapshot 一次性读取。
   */
  private pendingTerrain: import('../../../shared/level/LevelData').PieceData[] | null = null;
  private pendingInitialSnapshot: NetGameSnapshot | null = null;
  private readonly peerInputs: Record<PlayerSeat, NetFrameInput> = {
    p1: { jumpDown: false, jumpJustPressed: false, jumpJustReleased: false },
    p2: { jumpDown: false, jumpJustPressed: false, jumpJustReleased: false },
  };

  async connect(url = defaultWsUrl()): Promise<void> {
    if (this.socket && this.connected) return;

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;

      socket.addEventListener('open', () => {
        this.connected = true;
        this.emitState();
        resolve();
      });
      socket.addEventListener('message', (event) => this.handleMessage(event.data));
      socket.addEventListener('close', () => {
        this.connected = false;
        this.emitState();
      });
      socket.addEventListener('error', () => {
        reject(new Error(`无法连接服务器：${url}`));
      }, { once: true });
    });
  }

  async createRoom(level: LevelId, difficulty: Difficulty): Promise<void> {
    await this.connect();
    return this.request({
      type: 'create_room',
      level,
      difficulty,
    });
  }

  async joinRoom(roomId: string): Promise<void> {
    await this.connect();
    return this.request({
      type: 'join_room',
      roomId,
    });
  }

  setReady(ready: boolean): void {
    this.send({ type: 'set_ready', ready });
  }

  startGame(): void {
    this.send({ type: 'start_game' });
  }

  returnLobby(): void {
    this.send({ type: 'return_lobby' });
  }

  voteRestart(approve: boolean): void {
    this.send({ type: 'restart_vote', approve });
  }

  advanceLevel(): void {
    this.send({ type: 'advance_level' });
  }

  disbandRoom(): void {
    this.send({ type: 'disband_room' });
  }

  leaveRoom(): void {
    this.send({ type: 'leave_room' });
    this.seat = null;
    this.roomState = null;
    this.emitState();
  }

  sendInput(input: FrameInput): void {
    if (!this.connected || this.roomState?.phase !== 'playing') return;
    this.send({
      type: 'input',
      seq: this.inputSeq,
      input: toNetFrameInput(input),
    });
    this.inputSeq += 1;
  }

  sendSnapshot(snapshot: NetGameSnapshot): void {
    if (!this.connected || this.roomState?.phase !== 'playing') return;
    if (!this.isHost()) return;
    this.send({ type: 'snapshot', snapshot });
  }

  consumePeerInput(seat: PlayerSeat): FrameInput {
    const input = this.peerInputs[seat];
    const frame: FrameInput = {
      ...NEUTRAL_INPUT,
      jumpDown: input.jumpDown,
      jumpJustPressed: input.jumpJustPressed,
      jumpJustReleased: input.jumpJustReleased,
      idleMs: 0,
    };
    input.jumpJustPressed = false;
    input.jumpJustReleased = false;
    return frame;
  }

  getClientId(): string | null {
    return this.clientId;
  }

  getSeat(): PlayerSeat | null {
    return this.seat;
  }

  getRoomState(): RoomState | null {
    return this.roomState;
  }

  getLatestSnapshot(): NetGameSnapshot | null {
    return this.latestSnapshot;
  }

  getLatestTick(): NetGameSnapshot | null {
    return this.latestTick;
  }

  consumeLatestTick(): NetGameSnapshot | null {
    const tick = this.latestTick;
    this.latestTick = null;
    return tick;
  }

  /**
   * 消费 game_started 携带的关卡数据。GameScene 在 start 回调里读一次。
   * 返回后清空，下次 game_started 才会再次填值。
   */
  consumePendingTerrain(): import('../../../shared/level/LevelData').PieceData[] | null {
    const t = this.pendingTerrain;
    this.pendingTerrain = null;
    return t;
  }

  /** 消费 game_started 携带的初始 snapshot（与 latestTick 同一份）。 */
  consumePendingInitialSnapshot(): NetGameSnapshot | null {
    const s = this.pendingInitialSnapshot;
    this.pendingInitialSnapshot = null;
    return s;
  }

  isOnline(): boolean {
    return this.roomState !== null && this.seat !== null;
  }

  isPlaying(): boolean {
    return this.isOnline() && this.roomState?.phase === 'playing';
  }

  isHost(): boolean {
    if (!this.seat || !this.roomState) return false;
    return this.roomState.players.some((player) => player.seat === this.seat && player.isHost);
  }

  onState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onStart(listener: StartListener): () => void {
    this.startListeners.add(listener);
    return () => this.startListeners.delete(listener);
  }

  onRoomClosed(listener: RoomClosedListener): () => void {
    this.roomClosedListeners.add(listener);
    return () => this.roomClosedListeners.delete(listener);
  }

  private request(message: RequestMessage): Promise<void> {
    const requestId = `r_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const payload = { ...message, requestId } as ClientToServerMessage;
    return new Promise<void>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      this.send(payload);
      window.setTimeout(() => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        pending.reject(new Error('请求超时。'));
      }, 5000);
    });
  }

  private send(message: ClientToServerMessage): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let message: ServerToClientMessage;
    try {
      message = JSON.parse(raw) as ServerToClientMessage;
    } catch {
      return;
    }

    switch (message.type) {
      case 'welcome':
        this.clientId = message.clientId;
        this.emitState();
        return;
      case 'room_joined':
        this.seat = message.yourSeat;
        this.roomState = message.state;
        this.resolveRequest(message.requestId);
        this.emitState();
        return;
      case 'room_state':
        this.seat = message.yourSeat;
        this.roomState = message.state;
        this.emitState();
        return;
      case 'game_started':
        this.seat = message.yourSeat;
        this.roomState = message.state;
        this.latestSnapshot = null;
        // 服务端权威模式：缓存服务器发来的关卡数据 + 初始 snapshot，
        // GameScene 在 start 回调里读取并消费。
        this.pendingTerrain = message.terrain;
        this.pendingInitialSnapshot = message.initialSnapshot;
        // 直接把首帧 tick 喂进 latestTick，避免 applyServerTick 第一帧真空。
        this.latestTick = message.initialSnapshot;
        this.emitState();
        for (const listener of this.startListeners) listener();
        return;
      case 'peer_input':
        this.peerInputs[message.seat] = {
          jumpDown: message.input.jumpDown,
          jumpJustPressed: this.peerInputs[message.seat].jumpJustPressed || message.input.jumpJustPressed,
          jumpJustReleased: this.peerInputs[message.seat].jumpJustReleased || message.input.jumpJustReleased,
        };
        return;
      case 'snapshot':
        this.latestSnapshot = message.snapshot;
        return;
      case 'game_tick':
        this.latestTick = message.snapshot;
        return;
      case 'room_left':
        this.seat = null;
        this.roomState = null;
        this.latestSnapshot = null;
        this.emitState();
        return;
      case 'room_closed':
        this.seat = null;
        this.roomState = null;
        this.latestSnapshot = null;
        this.emitState();
        for (const listener of this.roomClosedListeners) listener();
        return;
      case 'error':
        this.rejectRequest(message.requestId, new Error(message.message));
        this.emitState();
        return;
    }
  }

  private resolveRequest(requestId: string | undefined): void {
    if (!requestId) return;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.resolve();
  }

  private rejectRequest(requestId: string | undefined, error: Error): void {
    if (!requestId) return;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    pending.reject(error);
  }

  private emitState(): void {
    for (const listener of this.stateListeners) listener();
  }
}

function toNetFrameInput(input: FrameInput): NetFrameInput {
  return {
    jumpDown: input.jumpDown,
    jumpJustPressed: input.jumpJustPressed,
    jumpJustReleased: input.jumpJustReleased,
  };
}

export const netClient = new NetClient();
