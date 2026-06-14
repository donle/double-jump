/**
 * SoundManager — 6 个游戏事件的程序化合成音效。
 *
 * 设计动机：
 *   这个 demo 的范围是"轻量反馈"，不下载任何 .wav/.mp3 资产。所有音效都用
 *   WebAudio API 在浏览器里现合成（OscillatorNode + GainNode + BiquadFilter），
 *   实现成本 0 字节素材、0 网络请求。
 *
 * 6 个事件：
 *   playJump         玩家起跳后
 *   playLand         玩家从 in_air 落地
 *   playRopeTension  绳子进入 soft-spring 段（stretch 段进入时，不是每帧）
 *   playPit          玩家掉入坑
 *   playWin          玩家双双到达终点
 *   playGameOver     玩家双双死亡 / 落出世界
 *
 * 关键约束：
 *   1. **Lazy AudioContext**：Chrome autoplay policy 规定，AudioContext 必须在
 *      user gesture（点击 / 按键）之后才能 resume。构造 SoundManager 时不创建
 *      ctx，第一次调 playXxx 时才 `new AudioContext()`。这样在 main.ts 里 new
 *      出来时不需要 user gesture，autoplay policy 不会拦。
 *   2. **muted 时 no-op**：#5 UI 三页会有 🔊/🔇 按钮，setMuted(true) 后所有
 *      playXxx 直接 return，不创建 ctx，不消耗 CPU。
 *   3. **防刷屏**：playLand / playRopeTension 可能同帧触发多次（两人 + 多帧
 *      持续），加 200ms cooldown 限定最低间隔。
 *   4. **失败不抛错**：ensureCtx 在 ctx 创建失败 / 浏览器不支持时返回 null，
 *      各 playXxx 静默 no-op。生产环境缺音频不应该让游戏崩。
 *
 * 合成配方见 docs/superpowers/specs/2026-06-13-sound-system-design.md §3.3。
 */

/**
 * 简化的 window 类型，避免每处都写 `as unknown as { ... }`。
 * webkitAudioContext 是 Safari 旧版的兼容 fallback（Safari 14+ 已废弃）。
 */
interface WindowWithAudio {
  AudioContext?: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
  __sound?: SoundManager;
}

export class SoundManager {
  /**
   * AudioContext 在第一次 playXxx 时 lazy 创建。null = 还没创建 / 创建失败。
   * 设计：构造时**不**创建 ctx，这样 import SoundManager / new SoundManager()
   * 都不算"使用音频能力"，autoplay policy 不会拦。
   */
  private ctx: AudioContext | null = null;

  /**
   * 总音量控制节点。所有 playXxx 里的 gain node 都 connect 到这里，再 connect 到
   * destination。setMuted 时改它的 gain.value 到 0，等同于全局静音。
   */
  private masterGain: GainNode | null = null;

  /** 全局静音标志。#5 UI 三页的 🔊/🔇 按钮会调 setMuted 翻转它。 */
  private muted = false;

  /**
   * playLand 上次触发的 performance.now() 时刻（ms）。用于 200ms cooldown，
   * 避免两人同时落地 / 持续接触时每帧刷屏触发。
   */
  private lastPlayLandMs = 0;

  /**
   * playRopeTension 上次触发的 performance.now() 时刻（ms）。Rope 在 stretch 段
   * 每帧都跑 applyConstraint，不加 cooldown 会变成 60Hz 蜂鸣。
   */
  private lastPlayRopeTensionMs = 0;

  /**
   * 同一 playLand 调用之间最小间隔。玩家一帧 16ms，每帧都检测 contact，
   * 200ms 间隔对应"落地后 0.2s 内不会重复响"——刚好覆盖一次跳+落循环。
   */
  private static readonly LAND_COOLDOWN_MS = 200;

  /**
   * 同一 playRopeTension 调用之间最小间隔。绳子在 stretch 段持续 N 帧，
   * 200ms 把 60Hz 蜂鸣降成最多 5Hz 的"嗖嗖"短促音。
   */
  private static readonly ROPE_COOLDOWN_MS = 200;

  /**
   * 第一次 playXxx 时 lazy 创建 AudioContext。
   *
   * 行为契约：
   *   - 已有 ctx：直接返回（不重新创建）
   *   - 浏览器无 AudioContext / webkitAudioContext：返回 null（不抛错）
   *   - new AudioContext 抛错（隐私模式 / 资源被禁）：catch 后 this.ctx 留 null，返回 null
   *   - 成功创建：建 masterGain（gain = muted ? 0 : 1），connect 到 destination
   *
   * 失败时**不抛错**：返回 null 后调用方应该 no-op，否则游戏会因为音频问题崩。
   */
  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const w = window as unknown as WindowWithAudio;
      // 优先标准 AudioContext，回退到 Safari 旧版 webkitAudioContext（Safari < 14）
      const Ctor = w.AudioContext ?? w.webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.masterGain = this.ctx.createGain();
      // 初始音量反映当前 muted 状态：如果用户在 ctx 创建前就调了 setMuted，
      // 这里创建 gain 时立刻按 muted 决定基础值。
      this.masterGain.gain.value = this.muted ? 0 : 1;
      this.masterGain.connect(this.ctx.destination);
    } catch {
      // 创建失败（隐私模式、权限拒绝、用户禁用音频等）→ 留 null，调用方 no-op
      this.ctx = null;
    }
    return this.ctx;
  }

  /**
   * 确保 ctx 处于 running 状态。Chrome 在 tab 被切走 5 分钟后会自动 suspend ctx，
   * 此时调 playXxx 不会有声音。playXxx 进来时先 wake up 一次（fire-and-forget）。
   */
  private wakeUp(): void {
    const ctx = this.ctx;
    if (ctx && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }

  /**
   * 浏览器首次 user gesture 之后调一次（main.ts 在 pointerdown/keydown 一次性触发）。
   *
   * 行为：
   *   - 先调 ensureCtx() 把 ctx 准备好（如果还没有）—— 这样 user gesture 之后
   *     第一次 playXxx 不会再因 autoplay 被卡（resume 跟 ensureCtx 同帧跑）
   *   - ctx 处于 suspended 时调 resume()（Promise fire-and-forget）
   *   - ctx 不存在 / 已是 running 时 no-op
   *
   * 失败时不抛错：autoplay 政策不通过也不影响主流程。
   */
  resume(): void {
    const ctx = this.ensureCtx();
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {
        // autoplay 政策被拒绝 / ctx 已被 dispose / 其它预期外的失败。
        // 静默吞掉：游戏不应该因为音频失败崩。
      });
    }
  }

  /**
   * 静音开关。#5 UI 三页的 🔊/🔇 按钮直接调它。
   *
   * 行为：
   *   - 立刻更新 this.muted（即使 ctx 还没创建）
   *   - 如果 masterGain 已存在（之前调过 playXxx），同步把 gain 切到 0 / 1
   *   - ctx 还没创建时只更新 this.muted，等 ensureCtx 创建时会用这个值
   */
  setMuted(v: boolean): void {
    this.muted = v;
    if (this.masterGain) {
      this.masterGain.gain.value = v ? 0 : 1;
    }
  }

  /** 当前静音状态。UI 按钮在 toggle 时读这个值决定显示 🔊 还是 🔇。 */
  getMuted(): boolean {
    return this.muted;
  }

  // ===== 6 个 trigger 占位：Task 2 实现合成公式 =====
  // Task 1 阶段 playJump / playPit / playWin / playGameOver 是空 no-op；
  // playLand / playRopeTension 已经维护 cooldown 逻辑（读取时间戳 + 比对 + 写回），
  // 仅未合成音频。Task 2 在 return 之前插 audio 代码即可，cooldown 已就位。

  playJump(): void {
    this.wakeUp();
    const ctx = this.ensureCtx();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.12);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.01);
    gain.gain.linearRampToValueAtTime(0, t + 0.12);
    osc.connect(gain).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.12);
  }

  playLand(): void {
    const now = performance.now();
    if (now - this.lastPlayLandMs < SoundManager.LAND_COOLDOWN_MS) return;
    this.wakeUp();
    this.lastPlayLandMs = now;
    const ctx = this.ensureCtx();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    // 低频隆隆 = lowpass-filtered noise burst
    const bufSize = Math.floor(ctx.sampleRate * 0.08);
    const buffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 80;
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.08);
    src.connect(filter).connect(gain).connect(this.masterGain);
    src.start(t);
    src.stop(t + 0.08);
  }

  playRopeTension(): void {
    const now = performance.now();
    if (now - this.lastPlayRopeTensionMs < SoundManager.ROPE_COOLDOWN_MS) return;
    this.wakeUp();
    this.lastPlayRopeTensionMs = now;
    const ctx = this.ensureCtx();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(200, t + 0.06);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.06);
    osc.connect(gain).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.06);
  }

  playPit(): void {
    this.wakeUp();
    const ctx = this.ensureCtx();
    if (!ctx || !this.masterGain) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.35);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.35);
    osc.connect(gain).connect(this.masterGain);
    osc.start(t);
    osc.stop(t + 0.35);
  }

  playWin(): void {
    this.wakeUp();
    const ctx = this.ensureCtx();
    if (!ctx || !this.masterGain) return;
    const master = this.masterGain;
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    const dur = 0.12;
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * dur;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + dur);
    });
  }

  playGameOver(): void {
    this.wakeUp();
    const ctx = this.ensureCtx();
    if (!ctx || !this.masterGain) return;
    const master = this.masterGain;
    const notes = [329.63, 261.63]; // E4, C4
    const dur = 0.25;
    notes.forEach((freq, i) => {
      const t = ctx.currentTime + i * dur;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.linearRampToValueAtTime(0, t + dur);
      osc.connect(filter).connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + dur);
    });
  }
}

/**
 * 模块级缓存：第一次 getSound() 从 window.__sound 读到实例后缓存在这里，
 * 后续调用直接返回缓存，避开每次都读 window 的开销。
 *
 * 留 null = 还没读到 / 浏览器没注册 window.__sound。
 */
let cached: SoundManager | null = null;

/**
 * 全局单例 getter：Player / Rope / GameScene 通过它拿 SoundManager。
 *
 * 调用顺序：
 *   1. cached 不为空 → 直接返回缓存
 *   2. window 未定义（理论不会发生，import SoundManager 时机不一定是浏览器）→ null
 *   3. window.__sound 不存在（main.ts 还没注册 / 单元测试环境）→ null
 *   4. 读到后缓存到 cached，后续直接返回
 *
 * 返回 null 时调用方应该 `getSound()?.playXxx()`，可选链让"没注册"时静默 no-op。
 */
export function getSound(): SoundManager | null {
  if (cached) return cached;
  if (typeof window === 'undefined') return null;
  const w = window as unknown as WindowWithAudio;
  if (w.__sound) {
    cached = w.__sound;
    return cached;
  }
  return null;
}

/**
 * 调试 / 测试用：手动注入 SoundManager 实例，绕过 window.__sound。
 *
 * 用途：
 *   - 浏览器 console probe：在 main.ts 注册之前手动 setSoundForTesting(new SoundManager())
 *   - 单元测试 / 集成测试：注入 mock 实例
 *
 * 传 null 可以清空缓存。
 */
export function setSoundForTesting(s: SoundManager | null): void {
  cached = s;
}
