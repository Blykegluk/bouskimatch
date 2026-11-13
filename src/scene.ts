import Phaser from 'phaser';
import { isMuted, setMuted, sfx, unlockAudio } from './audio';
import { CHARACTERS, characterById } from './characters';
import { SnapshotBuffer, type GuestLink, type HostLink, type StartMsg } from './net';
import {
  CHARGE_MAX, DIFFS, F, MATCH_TIME, NO_INPUT, PLAYER_R, STEP,
  abilityFor, createState, playerRadius, step,
  type AbilityKind, type Difficulty, type GameState, type Player, type PlayerInput, type SimEvent, type TeamLineup,
} from './sim';
import {
  drawBall, drawCharacter, drawPickup, drawStadium, newAnim, stepAnim, type Anim,
} from './render';
import { FONT, bigButton, setButtonLabel } from './ui';

const JOY_R = 72;

const ABILITY_ICON: Record<AbilityKind, string> = {
  cannon: '💣',
  tackle: '🥾',
  turbo: '⚡',
  keeper: '🧤',
};
const ABILITY_NAME: Record<AbilityKind, string> = {
  cannon: 'Boulet de canon !',
  tackle: 'Super tacle !',
  turbo: 'Turbo !',
  keeper: 'Gardien géant !',
};

type TouchRole = 'joy' | 'shoot' | 'slide' | 'special';

interface Btn {
  role: 'shoot' | 'slide' | 'special';
  x: number;
  y: number;
  r: number;
  color: number;
  icon: Phaser.GameObjects.Text;
}

export class MatchScene extends Phaser.Scene {
  private state!: GameState;
  private acc = 0;
  private charPick = 0;
  private difficulty: Difficulty = 'easy';
  /** 'solo' plays alone; 'host' runs the match for both; 'guest' draws what the host sends. */
  private role: 'solo' | 'host' | 'guest' = 'solo';
  private link: HostLink | GuestLink | null = null;
  private start: Omit<StartMsg, 't'> | null = null;
  /** Which seat this screen belongs to. */
  private seat = 0;
  private snaps = new SnapshotBuffer();
  private snapTick = 0;
  private sentPhase: GameState['phase'] | null = null;
  private remoteInput: PlayerInput = NO_INPUT;
  private netText!: Phaser.GameObjects.Text;
  private pauseLayer!: Phaser.GameObjects.Container;
  private pauseBtn = { x: 0, y: 0, r: 30 };
  private paused = false;
  private peerGone = false;

  private world!: Phaser.GameObjects.Container;
  private pitch!: Phaser.GameObjects.Graphics;
  private pitchW = 0;
  private g!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.GameObjects.Graphics;
  private charAnims: Anim[] = [];
  /** Short-lived drawn effects: shockwaves and impact bursts. */
  private fx: { x: number; y: number; age: number; life: number; kind: 'ring' | 'burst'; color: number; size: number }[] = [];
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private flames!: Phaser.GameObjects.Particles.ParticleEmitter;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private bigText!: Phaser.GameObjects.Text;
  private abilityText!: Phaser.GameObjects.Text;
  private endLayer!: Phaser.GameObjects.Container;
  private hint!: Phaser.GameObjects.Text;
  private layoutW = 0;

  private keys = new Set<string>();
  private isTouch = false;
  private touches = new Map<number, TouchRole>();
  private joy = { active: false, bx: 0, by: 0, dx: 0, dy: 0 };
  private buttons: Btn[] = [];

  constructor() {
    super('match');
  }

  init(data: {
    charPick?: number; difficulty?: Difficulty;
    role?: 'solo' | 'host' | 'guest'; link?: HostLink | GuestLink; start?: Omit<StartMsg, 't'>;
  }): void {
    this.charPick = data.charPick ?? 0;
    this.difficulty = data.difficulty ?? 'easy';
    this.role = data.role ?? 'solo';
    this.link = data.link ?? null;
    this.start = data.start ?? null;
    this.seat = this.role === 'guest' ? 1 : 0;
    this.snaps = new SnapshotBuffer();
    this.snapTick = 0;
    this.sentPhase = null;
    this.remoteInput = NO_INPUT;
    this.peerGone = false;
  }

  create(): void {
    if (this.start) {
      // Both ends build exactly the same match from what the host decided.
      const st = this.start;
      this.state = createState(st.difficulty, st.home, st.away, st.seed, st.mode);
      this.difficulty = st.difficulty;
    } else {
      // Lineups: the chosen character leads your team, the rest are shared out.
      const mine = CHARACTERS[this.charPick % CHARACTERS.length];
      const rest = CHARACTERS.filter((c) => c.id !== mine.id);
      const pick = (i: number) => rest[i % rest.length];
      const home: TeamLineup = { fwd: mine, def: pick(0), gk: pick(1) };
      const away: TeamLineup = { fwd: pick(2), def: pick(3), gk: pick(4) };
      this.state = createState(this.difficulty, home, away, Math.floor(Math.random() * 1e9));
    }
    this.bindLink();
    this.acc = 0;
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.keys.clear();
    this.touches.clear();
    this.joy.active = false;

    this.world = this.add.container(0, 0);
    this.pitch = this.add.graphics();
    this.world.add(this.pitch);
    this.fx = [];
    this.charAnims = this.state.players.map(() => {
      const a = newAnim();
      return a;
    });
    this.state.players.forEach((p, i) => { this.charAnims[i].lastX = p.x; this.charAnims[i].lastY = p.y; });

    const tex = this.make.graphics({ x: 0, y: 0 }, false);
    tex.fillStyle(0xffffff);
    tex.fillRect(0, 0, 10, 10);
    tex.generateTexture('px', 10, 10);
    tex.destroy();

    this.dust = this.add.particles(0, 0, 'px', {
      speed: { min: 20, max: 90 }, angle: { min: 0, max: 360 },
      lifespan: 420, scale: { start: 0.9, end: 0 }, alpha: { start: 0.55, end: 0 },
      tint: 0xe8ffd8, emitting: false,
    });
    this.flames = this.add.particles(0, 0, 'px', {
      speed: { min: 10, max: 70 }, angle: { min: 0, max: 360 },
      lifespan: 350, scale: { start: 1.6, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0xffe14d, 0xff9f1c, 0xff4d20], emitting: false,
    });
    this.world.add([this.dust, this.flames]);

    this.g = this.add.graphics();
    this.world.add(this.g);

    this.confetti = this.add.particles(0, 0, 'px', {
      speed: { min: 180, max: 640 }, angle: { min: 0, max: 360 }, gravityY: 520,
      lifespan: { min: 800, max: 1600 }, scale: { start: 1.3, end: 0.4 }, rotate: { min: 0, max: 360 },
      tint: [0xffd23f, 0xff4d6d, 0x3fa7ff, 0x7dff6b, 0xffffff, 0xff9f1c], emitting: false,
    });
    this.world.add(this.confetti);

    this.ui = this.add.graphics();
    this.scoreText = this.add.text(0, 28, '', {
      fontFamily: FONT, fontSize: '38px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#0b3d1a', strokeThickness: 7,
    }).setOrigin(0.5);
    this.clockText = this.add.text(0, 70, '', {
      fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#eaffea',
      stroke: '#0b3d1a', strokeThickness: 5,
    }).setOrigin(0.5);
    this.bigText = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '130px', fontStyle: 'bold', color: '#ffe14d',
      stroke: '#0b3d1a', strokeThickness: 16, align: 'center',
    }).setOrigin(0.5).setVisible(false);
    this.abilityText = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#0b3d1a', strokeThickness: 8,
    }).setOrigin(0.5).setVisible(false);

    const icon = (t: string, size: number) =>
      this.add.text(0, 0, t, { fontFamily: FONT, fontSize: `${size}px` }).setOrigin(0.5);
    this.buttons = [
      { role: 'shoot', x: 0, y: 0, r: 70, color: 0xffc93c, icon: icon('⚽', 56) },
      { role: 'slide', x: 0, y: 0, r: 50, color: 0x58d6ff, icon: icon('💨', 40) },
      { role: 'special', x: 0, y: 0, r: 56, color: 0xb05cff, icon: icon('⚡', 44) },
    ];

    this.hint = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '19px', color: '#eaffea', stroke: '#0b3d1a', strokeThickness: 4,
    }).setOrigin(0.5);
    this.netText = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '22px', fontStyle: 'bold', color: '#ffd23f',
      stroke: '#0b3d1a', strokeThickness: 5,
    }).setOrigin(0.5).setVisible(false);
    this.endLayer = this.add.container(0, 0).setVisible(false);
    this.paused = false;
    this.buildPauseMenu();
    this.buildHelp();
    this.events.once('shutdown', () => {
      if (this.leaving) this.link?.close();
    });

    this.setupInput();
    this.layout();
    this.refreshHud();
    let seen = true;
    try {
      seen = localStorage.getItem('bm-seen-help') === '1';
    } catch {
      seen = false;
    }
    if ((!seen || this.registry.get('showHelp')) && this.role === 'solo') {
      this.registry.set('showHelp', false);
      this.time.delayedCall(60, () => this.openHelp());
    }
    (window as unknown as Record<string, unknown>).__bm = { scene: this, getState: () => this.state };
  }

  private leaving = false;

  /** A way out of a match, and the sound switch, for a child alone with the game. */
  private buildPauseMenu(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.pauseLayer = this.add.container(0, 0).setVisible(false).setDepth(50);
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.55).fillRect(0, 0, w, h);
    panel.fillStyle(0x12612a, 0.97).fillRoundedRect(w / 2 - 260, h / 2 - 170, 520, 320, 26);
    panel.lineStyle(6, 0xffffff, 0.9).strokeRoundedRect(w / 2 - 260, h / 2 - 170, 520, 320, 26);
    const online = this.role !== 'solo';
    const title = this.add.text(w / 2, h / 2 - (online ? 130 : 118), 'Pause', {
      fontFamily: FONT, fontSize: '48px', fontStyle: 'bold', color: '#ffe14d',
      stroke: '#0b3d1a', strokeThickness: 8,
    }).setOrigin(0.5);
    const note = this.add.text(w / 2, h / 2 - 92, online ? 'Le match continue pour ton copain !' : '', {
      fontFamily: FONT, fontSize: '22px', color: '#ffffff', stroke: '#0b3d1a', strokeThickness: 4,
    }).setOrigin(0.5);
    const resume = bigButton(this, w / 2, h / 2 - 34, {
      w: 420, h: 78, label: '▶  Reprendre', color: 0x2f7bff, fontSize: 34,
      onClick: () => this.setPaused(false),
    });
    const sound = bigButton(this, w / 2 - 110, h / 2 + 68, {
      w: 200, h: 78, label: '', color: 0xe2a32a, fontSize: 30,
      onClick: () => {
        setMuted(!isMuted());
        this.refreshSoundLabel();
      },
    });
    this.soundBtn = sound;
    const quit = bigButton(this, w / 2 + 110, h / 2 + 68, {
      w: 200, h: 78, label: '☰  Menu', color: 0x4ec76a, fontSize: 30,
      onClick: () => this.quitToMenu(),
    });
    this.pauseLayer.add([panel, title, note, resume, sound, quit]);
    this.refreshSoundLabel();
  }

  private soundBtn?: Phaser.GameObjects.Container;
  private helpLayer!: Phaser.GameObjects.Container;

  /** Shown once, the first time a child plays: four pictures, almost no words. */
  private buildHelp(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.helpLayer = this.add.container(0, 0).setVisible(false).setDepth(60);
    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.6).fillRect(0, 0, w, h);
    panel.fillStyle(0x12612a, 0.97).fillRoundedRect(w / 2 - 440, h / 2 - 220, 880, 420, 28);
    panel.lineStyle(6, 0xffffff, 0.9).strokeRoundedRect(w / 2 - 440, h / 2 - 220, 880, 420, 28);
    const items: Phaser.GameObjects.GameObject[] = [panel];
    items.push(this.add.text(w / 2, h / 2 - 166, 'Comment jouer', {
      fontFamily: FONT, fontSize: '44px', fontStyle: 'bold', color: '#ffe14d',
      stroke: '#0b3d1a', strokeThickness: 8,
    }).setOrigin(0.5));

    const touch = this.isTouch;
    const rows: [string, string][] = [
      [touch ? '🕹️' : '⬅️➡️', 'Bouge ton joueur'],
      ['⚽', 'Appui court : passe   ·   Appui long : tir puissant'],
      ['💨', 'Tacle pour prendre le ballon'],
      ['⚡', 'Super pouvoir quand la barre est pleine'],
    ];
    rows.forEach(([icon, text], i) => {
      const y = h / 2 - 90 + i * 62;
      items.push(this.add.text(w / 2 - 330, y, icon, { fontFamily: FONT, fontSize: '42px' }).setOrigin(0.5));
      items.push(this.add.text(w / 2 - 280, y, text, {
        fontFamily: FONT, fontSize: '28px', color: '#ffffff', stroke: '#0b3d1a', strokeThickness: 4,
      }).setOrigin(0, 0.5));
    });
    items.push(bigButton(this, w / 2, h / 2 + 160, {
      w: 340, h: 76, label: "▶  C'est parti !", color: 0x2f7bff, fontSize: 34,
      onClick: () => this.closeHelp(),
    }));
    this.helpLayer.add(items);
  }

  private openHelp(): void {
    this.helpLayer.setVisible(true);
    this.setPaused(true);
  }

  private closeHelp(): void {
    this.helpLayer.setVisible(false);
    try {
      localStorage.setItem('bm-seen-help', '1');
    } catch {
      // Nothing to remember it with; it will show again next time.
    }
    this.setPaused(false);
  }

  private refreshSoundLabel(): void {
    if (this.soundBtn) setButtonLabel(this.soundBtn, isMuted() ? '🔇  Son' : '🔊  Son');
  }

  private setPaused(v: boolean): void {
    if (this.state.phase === 'over') return;
    this.paused = v;
    this.pauseLayer.setVisible(v);
    this.refreshSoundLabel();
    if (v) {
      this.keys.clear();
      this.touches.clear();
      this.joy.active = false;
    } else {
      this.acc = 0;
    }
  }

  /** Called when the phone is locked or the player switches app. */
  pauseFromOutside(): void {
    if (this.role === 'solo' && !this.paused) this.setPaused(true);
  }

  /** Listen to the other phone: its buttons if we are the host, its match if we are the guest. */
  private bindLink(): void {
    const link = this.link;
    if (!link) return;
    link.setHandlers({
      onInput: (inp) => { this.remoteInput = inp; },
      onSnapshot: (snap, events) => {
        this.snaps.push(snap);
        for (const e of events) this.onEvent(e);
      },
      onPeerLeft: () => this.onPeerLeft(),
      // The host starting another match restarts this one too.
      onStart: (msg) => this.scene.restart({ role: 'guest', link, start: msg }),
    });
  }

  private onPeerLeft(): void {
    if (this.peerGone) return;
    this.peerGone = true;
    this.netText.setText(this.role === 'host' ? 'Ton copain est parti — le jeu le remplace' : 'Partie terminée (déconnecté)').setVisible(true);
    this.time.delayedCall(3500, () => this.netText.setVisible(false));
    if (this.role === 'host') {
      // The computer takes over the player who left.
      this.state.seats = this.state.seats.slice(0, 1);
      this.state.controlled = this.state.controlled.slice(0, 1);
      this.role = 'solo';
    } else if (this.state.phase !== 'over') {
      this.time.delayedCall(1200, () => this.quitToMenu());
    }
  }

  private replayMatch(): void {
    if (this.role === 'host' && this.start && this.link) {
      const start = { ...this.start, seed: Math.floor(Math.random() * 1e9) };
      (this.link as HostLink).sendStart(start);
      this.scene.restart({ role: 'host', link: this.link, start });
      return;
    }
    this.scene.restart({ charPick: this.charPick, difficulty: this.difficulty });
  }

  private quitToMenu(): void {
    this.leaving = true;
    this.scene.start('menu');
  }

  /** The team this screen is playing for. */
  private get myTeam(): 0 | 1 {
    return this.state.seats[this.seat]?.team ?? 0;
  }

  /** The player this screen is driving. */
  private get myPlayer(): number {
    return this.state.controlled[this.seat] ?? this.state.controlled[0] ?? 0;
  }

  // ---------------------------------------------------------------- input

  private setupInput(): void {
    const handled = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    this.input.keyboard?.removeAllListeners();
    const onDown = (e: KeyboardEvent) => {
      unlockAudio();
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.helpLayer.visible) this.closeHelp();
        else this.setPaused(!this.paused);
        return;
      }
      this.keys.add(e.code);
      if (handled.includes(e.code)) e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    const onBlur = () => { this.keys.clear(); this.touches.clear(); this.joy.active = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    this.events.once('shutdown', () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      unlockAudio();
      if (p.wasTouch) this.isTouch = true;
      if (this.state.phase === 'over') return;
      if (this.helpLayer.visible) return;
      if (Math.hypot(p.x - this.pauseBtn.x, p.y - this.pauseBtn.y) < this.pauseBtn.r + 10) {
        sfx.click();
        this.setPaused(!this.paused);
        return;
      }
      if (this.paused) return;
      if (p.x < this.scale.width * 0.45) {
        if (this.joy.active) return;
        this.touches.set(p.id, 'joy');
        this.joy = {
          active: true,
          bx: Math.max(p.x, JOY_R + 12),
          by: Phaser.Math.Clamp(p.y, JOY_R + 12, this.scale.height - JOY_R - 12),
          dx: 0, dy: 0,
        };
        this.moveJoy(p);
      } else {
        let best = this.buttons[0];
        for (const b of this.buttons) {
          if (Math.hypot(p.x - b.x, p.y - b.y) - b.r < Math.hypot(p.x - best.x, p.y - best.y) - best.r) best = b;
        }
        this.touches.set(p.id, best.role);
      }
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.touches.get(p.id) === 'joy') this.moveJoy(p);
    });
    const up = (p: Phaser.Input.Pointer) => {
      if (this.touches.get(p.id) === 'joy') this.joy.active = false;
      this.touches.delete(p.id);
    };
    this.input.on('pointerup', up);
    this.input.on('pointerupoutside', up);
  }

  private moveJoy(p: Phaser.Input.Pointer): void {
    let dx = p.x - this.joy.bx;
    let dy = p.y - this.joy.by;
    const d = Math.hypot(dx, dy);
    if (d > JOY_R) { dx = (dx / d) * JOY_R; dy = (dy / d) * JOY_R; }
    this.joy.dx = dx;
    this.joy.dy = dy;
  }

  private touchHeld(role: TouchRole): boolean {
    for (const r of this.touches.values()) if (r === role) return true;
    return false;
  }

  private readInput(): PlayerInput {
    const k = this.keys;
    let mx = 0;
    let my = 0;
    // e.code is the physical key, so KeyW/KeyA are Z/Q on a French keyboard.
    if (k.has('ArrowLeft') || k.has('KeyA')) mx -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) mx += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) my -= 1;
    if (k.has('ArrowDown') || k.has('KeyS')) my += 1;
    if (this.joy.active) {
      const len = Math.hypot(this.joy.dx, this.joy.dy) / JOY_R;
      if (len > 0.15) {
        // Full speed from 65% of the stick travel: small thumbs do not reach the edge.
        const m = Math.min(1, len / 0.65) / len;
        mx = (this.joy.dx / JOY_R) * m;
        my = (this.joy.dy / JOY_R) * m;
      }
    }
    return {
      mx, my,
      shoot: k.has('Space') || this.touchHeld('shoot'),
      slide: k.has('ShiftLeft') || k.has('ShiftRight') || this.touchHeld('slide'),
      special: k.has('KeyE') || this.touchHeld('special'),
    };
  }

  // --------------------------------------------------------------- layout

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.layoutW = w;
    this.world.x = (w - F.w) / 2;
    if (this.pitchW !== w) {
      this.pitchW = w;
      this.pitch.clear();
      drawStadium(this.pitch, w);
    }
    this.scoreText.setPosition(w / 2, 28);
    this.clockText.setPosition(w / 2, 66);
    this.bigText.setPosition(w / 2, h / 2 - 20);
    this.netText.setPosition(w / 2, 148);
    this.pauseBtn.x = 54;
    this.pauseBtn.y = 48;
    // Turning the phone changes the size, so these panels are rebuilt to fit.
    if (this.pauseLayer) {
      const wasPaused = this.pauseLayer.visible;
      const wasHelp = this.helpLayer.visible;
      this.pauseLayer.destroy(true);
      this.helpLayer.destroy(true);
      this.buildPauseMenu();
      this.buildHelp();
      this.pauseLayer.setVisible(wasPaused);
      this.helpLayer.setVisible(wasHelp);
    }
    this.abilityText.setPosition(w / 2, h / 2 + 120);
    // Kept in the bottom-right corner, clear of the goal mouth.
    const [shoot, slide, special] = this.buttons;
    shoot.x = w - 110; shoot.y = h - 112;
    slide.x = w - 248; slide.y = h - 78;
    special.x = w - 142; special.y = h - 248;
    for (const b of this.buttons) b.icon.setPosition(b.x, b.y);
  }

  // ----------------------------------------------------------------- loop

  update(_time: number, deltaMs: number): void {
    if (this.scale.width !== this.layoutW) this.layout();

    const s = this.state;
    if (this.paused && this.role === 'solo') {
      this.draw();
      return;
    }
    const input = this.readInput();

    if (this.role === 'guest') {
      (this.link as GuestLink | null)?.sendInput(input);
      this.applyRemote();
      this.draw();
      return;
    }

    if (s.phase !== 'over') {
      this.acc += Math.min(deltaMs / 1000, 0.1);
      const events: SimEvent[] = [];
      const inputs = this.role === 'host' ? [input, this.remoteInput] : [input];
      while (this.acc >= STEP) {
        s.events = [];
        step(s, inputs, STEP);
        events.push(...s.events);
        this.acc -= STEP;
      }
      for (const e of events) this.onEvent(e);
      // Publish the match about 30 times a second, and always on a kick-off,
      // a goal or the final whistle so the other phone never misses one.
      if (this.role === 'host') {
        const changed = s.phase !== this.sentPhase;
        if (++this.snapTick % 2 === 0 || changed || events.length > 0) {
          (this.link as HostLink).sendSnapshot(s, events);
          this.sentPhase = s.phase;
        }
      }
    }
    this.draw();
  }

  /** Draw the host's match, sliding between the last two updates so it stays smooth. */
  private applyRemote(): void {
    const sample = this.snaps.sample();
    if (!sample) return;
    const { a, b, k } = sample;
    const s = this.state;
    const mix = (x: number, y: number) => x + (y - x) * k;
    // A big jump means a goal reset or a hiccup: snap instead of sliding across the pitch.
    const far = (x: number, y: number) => Math.abs(y - x) > 260;

    s.phase = b.phase;
    s.phaseT = b.phaseT;
    s.clock = b.clock;
    s.score = [b.score[0], b.score[1]];
    s.teams[0].meter = b.meters[0];
    s.teams[1].meter = b.meters[1];
    s.controlled = b.controlled.slice();
    s.ball.x = far(a.ball.x, b.ball.x) ? b.ball.x : mix(a.ball.x, b.ball.x);
    s.ball.y = far(a.ball.y, b.ball.y) ? b.ball.y : mix(a.ball.y, b.ball.y);
    s.ball.spin = b.ball.spin;
    s.ball.power = b.ball.power;
    s.ball.owner = b.ball.owner;
    s.pickups = b.pickups.map((p) => ({ x: p.x, y: p.y, born: 0, alive: true }));
    b.players.forEach((np, i) => {
      const p = s.players[i];
      const op = a.players[i] ?? np;
      if (!p) return;
      p.x = far(op.x, np.x) ? np.x : mix(op.x, np.x);
      p.y = far(op.y, np.y) ? np.y : mix(op.y, np.y);
      p.fx = np.fx; p.fy = np.fy;
      p.charge = np.charge; p.slideT = np.slideT; p.stunT = np.stunT;
      p.turboT = np.turboT; p.giantT = np.giantT; p.superSlide = np.superSlide;
    });
    if (s.phase === 'over' && !this.endLayer.visible) this.showEnd();
  }

  private onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'kick':
        sfx.kick(Math.min(1, e.power));
        if (e.power > 0.75) this.cameras.main.shake(90, 0.004);
        this.dust.explode(4 + Math.round(e.power * 6), e.x, e.y);
        break;
      case 'pass':
        sfx.pass();
        break;
      case 'bounce':
        sfx.bounce();
        break;
      case 'save':
        sfx.save();
        sfx.ooh();
        this.dust.explode(8, e.x, e.y);
        this.fx.push({ x: e.x, y: e.y, age: 0, life: 0.4, kind: 'ring', color: 0xffffff, size: 90 });
        break;
      case 'slide':
        sfx.slide();
        this.dust.explode(10, e.x, e.y);
        break;
      case 'stun':
        sfx.stun();
        this.dust.explode(14, e.x, e.y);
        this.cameras.main.shake(140, 0.005);
        this.fx.push({ x: e.x, y: e.y, age: 0, life: 0.35, kind: 'burst', color: 0xffe14d, size: 60 });
        break;
      case 'pickup':
        sfx.pickup();
        this.confetti.explode(18, e.x, e.y);
        break;
      case 'ready':
        if (e.team === this.myTeam) sfx.ready();
        break;
      case 'ability':
        this.onAbility(e.kind, e.team, e.x, e.y);
        break;
      case 'whistle':
        sfx.whistle();
        this.bigText.setVisible(false);
        break;
      case 'goal': {
        const mine = e.team === this.myTeam;
        if (mine) sfx.goal(); else sfx.conceded();
        this.refreshHud();
        this.cameras.main.shake(260, 0.008);
        if (mine) {
          this.confetti.explode(110, e.x, e.y);
          sfx.cheer();
        } else {
          sfx.groan();
        }
        // A little zoom punch, and the scorers jump for joy.
        const cam = this.cameras.main;
        cam.zoomTo(1.07, 160, 'Sine.easeOut');
        this.time.delayedCall(700, () => cam.zoomTo(1, 320, 'Sine.easeInOut'));
        this.state.players.forEach((p, i) => {
          if (p.team === e.team && !p.keeper) this.charAnims[i].celebrate = 2.4;
        });
        this.fx.push({ x: e.x, y: e.y, age: 0, life: 0.6, kind: 'ring', color: 0xffe14d, size: 240 });
        this.flash(mine ? 'BUT !' : 'Oups !', mine ? '#ffe14d' : '#ffffff');
        break;
      }
      case 'end':
        sfx.whistleLong();
        if (this.role !== 'guest') this.showEnd();
        break;
    }
  }

  private onAbility(kind: AbilityKind, team: 0 | 1, x: number, y: number): void {
    if (kind === 'cannon') sfx.cannon();
    else if (kind === 'turbo') sfx.turbo();
    else if (kind === 'keeper') sfx.giant();
    else sfx.slide();
    this.flames.explode(26, x, y);
    const colors: Record<AbilityKind, number> = {
      cannon: 0xff9f1c, tackle: 0x58d6ff, turbo: 0xffe14d, keeper: 0xb05cff,
    };
    this.fx.push({ x, y, age: 0, life: 0.5, kind: 'ring', color: colors[kind], size: 180 });
    if (team === this.myTeam) {
      this.cameras.main.shake(200, 0.006);
      this.abilityText.setText(ABILITY_NAME[kind]).setVisible(true).setAlpha(1).setScale(0.6);
      this.tweens.add({ targets: this.abilityText, scale: 1, duration: 260, ease: 'Back.easeOut' });
      this.tweens.add({ targets: this.abilityText, alpha: 0, delay: 700, duration: 400 });
    }
  }

  private flash(text: string, color: string): void {
    this.bigText.setText(text).setColor(color).setVisible(true).setScale(0).setAngle(-8);
    this.tweens.add({ targets: this.bigText, scale: 1, angle: 0, duration: 420, ease: 'Back.easeOut' });
    this.time.delayedCall(1800, () => {
      if (this.state.phase !== 'over') this.bigText.setVisible(false);
    });
  }

  private lastScore = '';

  private refreshHud(): void {
    const s = this.state;
    const mine = characterById(s.players[0].charId);
    const theirs = characterById(s.players[3].charId);
    const text = `${mine.face} ${s.score[0]}  –  ${s.score[1]} ${theirs.face}`;
    if (text !== this.lastScore) {
      this.lastScore = text;
      this.scoreText.setText(text);
    }
  }

  private showEnd(): void {
    const s = this.state;
    const w = this.scale.width;
    const h = this.scale.height;
    const mine = this.myTeam;
    const won = s.score[mine] > s.score[1 - mine];
    const draw = s.score[0] === s.score[1];
    if (won) sfx.win(); else if (!draw) sfx.lose();
    if (won) {
      this.confetti.explode(160, F.w / 2, 240);
      this.time.delayedCall(500, () => this.confetti.explode(140, F.w / 2 - 240, 220));
      this.time.delayedCall(950, () => this.confetti.explode(140, F.w / 2 + 240, 220));
    }
    this.bigText.setVisible(false);

    const panel = this.add.graphics();
    panel.fillStyle(0x000000, 0.55).fillRect(0, 0, w, h);
    panel.fillStyle(0x12612a, 0.96).fillRoundedRect(w / 2 - 300, h / 2 - 190, 600, 340, 26);
    panel.lineStyle(6, 0xffffff, 0.9).strokeRoundedRect(w / 2 - 300, h / 2 - 190, 600, 340, 26);
    const title = this.add.text(w / 2, h / 2 - 118, won ? 'TU AS GAGNÉ !' : draw ? 'ÉGALITÉ !' : 'PERDU…', {
      fontFamily: FONT, fontSize: '58px', fontStyle: 'bold',
      color: won ? '#ffe14d' : '#ffffff', stroke: '#0b3d1a', strokeThickness: 9,
    }).setOrigin(0.5);
    const score = this.add.text(w / 2, h / 2 - 42, `${s.score[0]} – ${s.score[1]}`, {
      fontFamily: FONT, fontSize: '66px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#0b3d1a', strokeThickness: 8,
    }).setOrigin(0.5);
    const parts: Phaser.GameObjects.GameObject[] = [panel, title, score];
    // Only the host can start another match; the guest just follows.
    if (this.role !== 'guest') {
      parts.push(bigButton(this, w / 2 - 150, h / 2 + 68, {
        w: 260, h: 84, label: '↻  Rejouer', color: 0x2f7bff, fontSize: 34,
        onClick: () => this.replayMatch(),
      }));
    }
    parts.push(bigButton(this, w / 2 + (this.role === 'guest' ? 0 : 150), h / 2 + 68, {
      w: 260, h: 84, label: '☰  Menu', color: 0x4ec76a, fontSize: 34,
      onClick: () => this.quitToMenu(),
    }));
    this.endLayer.add(parts);
    this.endLayer.setVisible(true);
  }

  // ----------------------------------------------------------------- draw

  private draw(): void {
    const g = this.g;
    const s = this.state;
    g.clear();

    const dt = Math.min(0.05, this.game.loop.delta / 1000);
    s.players.forEach((p, i) => stepAnim(this.charAnims[i], p, dt));

    // Shockwaves and bursts, drawn on the grass under everyone.
    this.fx = this.fx.filter((f) => (f.age += dt) < f.life);
    for (const f of this.fx) {
      const k = f.age / f.life;
      if (f.kind === 'ring') {
        g.lineStyle(Math.max(2, 10 * (1 - k)), f.color, 0.85 * (1 - k));
        g.strokeCircle(f.x, f.y, 10 + f.size * k);
      } else {
        g.lineStyle(Math.max(2, 6 * (1 - k)), f.color, 0.9 * (1 - k));
        for (let i = 0; i < 6; i++) {
          const ang = (i * Math.PI * 2) / 6 + k;
          const r0 = 10 + f.size * k * 0.5;
          const r1 = r0 + f.size * 0.35;
          g.lineBetween(f.x + Math.cos(ang) * r0, f.y + Math.sin(ang) * r0,
            f.x + Math.cos(ang) * r1, f.y + Math.sin(ang) * r1);
        }
      }
    }

    for (const pk of s.pickups) {
      if (!pk.alive) continue;
      drawPickup(g, pk.x, pk.y, this.time.now);
    }

    // Draw from the back of the pitch forward, so nobody is hidden oddly.
    [...s.players.keys()].sort((i, j) => s.players[i].y - s.players[j].y)
      .forEach((i) => this.drawPlayer(g, s.players[i], i));

    const b = s.ball;
    if (b.power > 0.3) this.flames.emitParticleAt(b.x, b.y, 2);
    drawBall(g, b.x, b.y, b.spin, b.power);

    this.drawHud();
  }

  private drawPlayer(g: Phaser.GameObjects.Graphics, p: Player, i: number): void {
    const seat = this.state.controlled.indexOf(i);
    const anim = this.charAnims[i];
    if (p.turboT > 0 && Math.random() < 0.8) this.flames.emitParticleAt(p.x - p.fx * 24, p.y - p.fy * 24, 1);
    if (p.slideT > 0 && Math.random() < 0.7) this.dust.emitParticleAt(p.x, p.y + 8, 1);
    drawCharacter(g, p, characterById(p.charId), {
      radius: playerRadius(p),
      controlled: seat === this.seat,
      otherHuman: seat >= 0 && seat !== this.seat,
      anim,
      timeMs: this.time.now,
      charging: p.charge >= 0 ? p.charge / CHARGE_MAX : -1,
    });
  }

  private drawHud(): void {
    const ui = this.ui;
    const s = this.state;
    const w = this.scale.width;
    const h = this.scale.height;
    ui.clear();

    this.refreshHud();
    // Pause button, top-left, clear of the joystick area.
    const pb = this.pauseBtn;
    pb.x = 54;
    pb.y = 48;
    ui.fillStyle(0x0b3d1a, 0.55).fillCircle(pb.x, pb.y, pb.r);
    ui.lineStyle(4, 0xffffff, 0.8).strokeCircle(pb.x, pb.y, pb.r);
    ui.fillStyle(0xffffff, 0.9);
    ui.fillRect(pb.x - 10, pb.y - 12, 7, 24);
    ui.fillRect(pb.x + 3, pb.y - 12, 7, 24);

    const secs = Math.ceil(s.clock);
    this.clockText.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    this.clockText.setColor(secs <= 15 ? '#ffd23f' : '#eaffea');

    // Super gauge.
    const meter = s.teams[this.myTeam].meter;
    const bw = 300;
    const bx = w / 2 - bw / 2;
    const by = 94;
    ui.fillStyle(0x000000, 0.35).fillRoundedRect(bx, by, bw, 20, 10);
    const col = meter >= 1 ? 0xffe14d : 0xb05cff;
    ui.fillStyle(col, 1).fillRoundedRect(bx + 2, by + 2, Math.max(6, (bw - 4) * meter), 16, 8);
    ui.lineStyle(3, 0xffffff, 0.8).strokeRoundedRect(bx, by, bw, 20, 10);
    if (meter >= 1) {
      const pulse = 0.5 + Math.sin(this.time.now / 110) * 0.5;
      ui.lineStyle(4, 0xffffff, 0.4 + pulse * 0.6).strokeRoundedRect(bx - 4, by - 4, bw + 8, 28, 14);
    }

    if (s.phase === 'kickoff') {
      this.bigText.setText('Prêt ?').setColor('#ffffff').setVisible(true).setScale(0.6).setAngle(0);
    }

    this.hint.setVisible(!this.isTouch);
    for (const b of this.buttons) b.icon.setVisible(this.isTouch);
    if (!this.isTouch && !this.joy.active) {
      this.drawKeyboardHint(w, h);
      return;
    }

    if (this.joy.active) {
      ui.fillStyle(0xffffff, 0.16).fillCircle(this.joy.bx, this.joy.by, JOY_R);
      ui.lineStyle(4, 0xffffff, 0.5).strokeCircle(this.joy.bx, this.joy.by, JOY_R);
      ui.fillStyle(0xffffff, 0.75).fillCircle(this.joy.bx + this.joy.dx, this.joy.by + this.joy.dy, 32);
    } else {
      ui.lineStyle(4, 0xffffff, 0.3).strokeCircle(150, h - 150, JOY_R);
      ui.fillStyle(0xffffff, 0.3).fillCircle(150, h - 150, 32);
    }

    if (!this.isTouch) return;
    const ready = s.teams[this.myTeam].meter >= 1;
    for (const b of this.buttons) {
      const held = this.touchHeld(b.role);
      const isSuper = b.role === 'special';
      const r = held ? b.r * 0.92 : b.r;
      const alpha = isSuper && !ready ? 0.3 : held ? 0.95 : 0.72;
      ui.fillStyle(b.color, alpha).fillCircle(b.x, b.y, r);
      ui.lineStyle(5, 0xffffff, isSuper && !ready ? 0.4 : 0.85).strokeCircle(b.x, b.y, r);
      if (isSuper) {
        b.icon.setText(ABILITY_ICON[abilityFor(s, this.myPlayer)]);
        b.icon.setAlpha(ready ? 1 : 0.4);
        if (ready) {
          const pulse = 0.5 + Math.sin(this.time.now / 110) * 0.5;
          ui.lineStyle(5, 0xffe14d, 0.3 + pulse * 0.7).strokeCircle(b.x, b.y, r + 9);
        }
      }
    }
  }

  private drawKeyboardHint(w: number, h: number): void {
    const ready = this.state.teams[this.myTeam].meter >= 1;
    const kind = abilityFor(this.state, this.myPlayer);
    this.hint
      .setText(`Flèches : bouger   ·   Espace : tirer (tap = passe)   ·   Maj : tacle   ·   E : ${ABILITY_ICON[kind]} ${ready ? 'prêt !' : '…'}`)
      .setPosition(w / 2, h - 22);
  }
}

export { MATCH_TIME, DIFFS, PLAYER_R };
