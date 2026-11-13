import Phaser from 'phaser';
import { sfx, unlockAudio } from './audio';
import {
  BALL_R, CHARGE_MAX, F, PLAYER_R, STEP,
  createState, step,
  type GameState, type Player, type PlayerInput, type SimEvent,
} from './sim';

const TEAM_COLORS = [0x2f7bff, 0xff4d4d];
const TEAM_DARK = [0x123c8c, 0x8c1a1a];
const JOY_R = 72;
const FONT = "'Trebuchet MS', 'Arial Rounded MT Bold', Arial, sans-serif";

type TouchRole = 'joy' | 'shoot' | 'slide';

interface Button {
  role: 'shoot' | 'slide';
  x: number;
  y: number;
  r: number;
  color: number;
  label: Phaser.GameObjects.Text;
}

export class MatchScene extends Phaser.Scene {
  private state: GameState = createState();
  private acc = 0;
  private world!: Phaser.GameObjects.Container;
  private g!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.GameObjects.Graphics;
  private confetti!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dust!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scoreText!: Phaser.GameObjects.Text;
  private goalText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private layoutW = 0;

  private keys = new Set<string>();
  private isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
  private touches = new Map<number, TouchRole>();
  private joy = { active: false, bx: 0, by: 0, dx: 0, dy: 0 };
  private buttons: Button[] = [];

  constructor() {
    super('match');
  }

  create(): void {
    this.world = this.add.container(0, 0);
    const pitch = this.add.graphics();
    drawPitch(pitch);
    this.world.add(pitch);

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
    this.world.add(this.dust);

    this.g = this.add.graphics();
    this.world.add(this.g);

    this.confetti = this.add.particles(0, 0, 'px', {
      speed: { min: 180, max: 640 }, angle: { min: 0, max: 360 }, gravityY: 520,
      lifespan: { min: 800, max: 1600 }, scale: { start: 1.3, end: 0.4 }, rotate: { min: 0, max: 360 },
      tint: [0xffd23f, 0xff4d6d, 0x3fa7ff, 0x7dff6b, 0xffffff, 0xff9f1c], emitting: false,
    });
    this.world.add(this.confetti);

    this.ui = this.add.graphics();
    this.scoreText = this.add.text(0, 30, '', {
      fontFamily: FONT, fontSize: '40px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#0b3d1a', strokeThickness: 7,
    }).setOrigin(0.5);
    this.goalText = this.add.text(0, 0, '', {
      fontFamily: FONT, fontSize: '150px', fontStyle: 'bold', color: '#ffe14d',
      stroke: '#0b3d1a', strokeThickness: 16,
    }).setOrigin(0.5).setVisible(false);
    this.hintText = this.add.text(0, 0, 'Flèches ou ZQSD : bouger   ·   Espace : tirer (maintenir = plus fort)   ·   Maj : glissade', {
      fontFamily: FONT, fontSize: '19px', color: '#eaffea', stroke: '#0b3d1a', strokeThickness: 4,
    }).setOrigin(0.5).setVisible(!this.isTouch);

    const mkLabel = (t: string, size: number) =>
      this.add.text(0, 0, t, { fontFamily: FONT, fontSize: `${size}px` }).setOrigin(0.5).setVisible(this.isTouch);
    this.buttons = [
      { role: 'shoot', x: 0, y: 0, r: 72, color: 0xffc93c, label: mkLabel('⚽', 62) },
      { role: 'slide', x: 0, y: 0, r: 54, color: 0x58d6ff, label: mkLabel('💨', 46) },
    ];

    this.setupInput();
    this.refreshScore();
    this.layout();
    // Handle for automated checks.
    (window as unknown as Record<string, unknown>).__bm = { scene: this, getState: () => this.state };
  }

  // ---------------------------------------------------------------- input

  private setupInput(): void {
    const handled = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    window.addEventListener('keydown', (e) => {
      unlockAudio();
      this.keys.add(e.code);
      if (handled.includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.releaseAllTouches(); });

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      unlockAudio();
      if (p.x < this.scale.width * 0.45) {
        if (this.joy.active) return;
        this.touches.set(p.id, 'joy');
        this.joy = { active: true, bx: Math.max(p.x, JOY_R + 12), by: Phaser.Math.Clamp(p.y, JOY_R + 12, this.scale.height - JOY_R - 12), dx: 0, dy: 0 };
        this.moveJoy(p);
      } else {
        // Whole right side is a button zone: pick the nearest button.
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

  private releaseAllTouches(): void {
    this.touches.clear();
    this.joy.active = false;
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
      shoot: k.has('Space') || k.has('KeyX') || this.touchHeld('shoot'),
      slide: k.has('ShiftLeft') || k.has('ShiftRight') || k.has('KeyC') || this.touchHeld('slide'),
    };
  }

  // --------------------------------------------------------------- layout

  private layout(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.layoutW = w;
    this.world.x = (w - F.w) / 2;
    this.scoreText.setPosition(w / 2, 30);
    this.goalText.setPosition(w / 2, h / 2 - 20);
    this.hintText.setPosition(w / 2, h - 26);
    const [shoot, slide] = this.buttons;
    shoot.x = w - 125; shoot.y = h - 150;
    slide.x = w - 290; slide.y = h - 95;
    for (const b of this.buttons) b.label.setPosition(b.x, b.y);
  }

  // ----------------------------------------------------------------- loop

  update(_time: number, deltaMs: number): void {
    if (this.scale.width !== this.layoutW) this.layout();

    this.acc += Math.min(deltaMs / 1000, 0.1);
    const input = this.readInput();
    const events: SimEvent[] = [];
    while (this.acc >= STEP) {
      this.state.events = [];
      step(this.state, [input], STEP);
      events.push(...this.state.events);
      this.acc -= STEP;
    }
    for (const e of events) this.onEvent(e);
    this.draw();
  }

  private onEvent(e: SimEvent): void {
    switch (e.type) {
      case 'kick':
        sfx.kick(e.power);
        if (e.power > 0.75) this.cameras.main.shake(90, 0.004);
        this.dust.explode(4 + Math.round(e.power * 6), e.x, e.y);
        break;
      case 'bounce':
        sfx.bounce();
        break;
      case 'save':
        sfx.save();
        this.dust.explode(8, e.x, e.y);
        break;
      case 'slide':
        sfx.slide();
        this.dust.explode(10, e.x, e.y);
        break;
      case 'goal': {
        const mine = e.team === 0;
        if (mine) sfx.goal(); else sfx.conceded();
        this.refreshScore();
        this.cameras.main.shake(260, 0.008);
        if (mine) this.confetti.explode(90, e.x, e.y);
        this.goalText.setText(mine ? 'BUT !' : 'Oups !').setColor(mine ? '#ffe14d' : '#ffffff').setVisible(true).setScale(0).setAngle(-8);
        this.tweens.add({ targets: this.goalText, scale: 1, angle: 0, duration: 420, ease: 'Back.easeOut' });
        this.time.delayedCall(1900, () => this.goalText.setVisible(false));
        break;
      }
    }
  }

  private refreshScore(): void {
    this.scoreText.setText(`🔵 ${this.state.score[0]}  –  ${this.state.score[1]} 🔴`);
  }

  // ----------------------------------------------------------------- draw

  private draw(): void {
    const g = this.g;
    const s = this.state;
    g.clear();

    for (const p of s.players) this.drawPlayer(g, p);

    const b = s.ball;
    g.fillStyle(0x000000, 0.25).fillEllipse(b.x + 3, b.y + 6, BALL_R * 2.1, BALL_R * 1.5);
    g.fillStyle(0xffffff).fillCircle(b.x, b.y, BALL_R);
    g.lineStyle(2, 0x222222).strokeCircle(b.x, b.y, BALL_R);
    g.fillStyle(0x222222);
    for (let i = 0; i < 3; i++) {
      const a = b.spin + (i * Math.PI * 2) / 3;
      g.fillCircle(b.x + Math.cos(a) * 5.5, b.y + Math.sin(a) * 5.5, 2.8);
    }

    const me = s.players[0];
    if (me.slideT > 0 && Math.random() < 0.6) this.dust.explode(1, me.x, me.y + 8);

    this.drawUi();
  }

  private drawPlayer(g: Phaser.GameObjects.Graphics, p: Player): void {
    const px = -p.fy;
    const py = p.fx;
    g.fillStyle(0x000000, 0.25).fillEllipse(p.x + 4, p.y + 9, PLAYER_R * 2.2, PLAYER_R * 1.6);

    if (p.charge >= 0) {
      const t = Math.min(1, p.charge / CHARGE_MAX);
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(
        new Phaser.Display.Color(255, 230, 60), new Phaser.Display.Color(255, 60, 40), 100, t * 100);
      g.lineStyle(7, Phaser.Display.Color.GetColor(col.r, col.g, col.b), 0.95);
      g.beginPath();
      g.arc(p.x, p.y, PLAYER_R + 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
      g.strokePath();
    }

    // Body, slightly stretched while sliding.
    g.fillStyle(TEAM_COLORS[p.team]);
    if (p.slideT > 0) {
      g.fillEllipse(p.x, p.y, PLAYER_R * (2 + Math.abs(p.fx) * 0.5), PLAYER_R * (2 + Math.abs(p.fy) * 0.5));
    } else {
      g.fillCircle(p.x, p.y, PLAYER_R);
    }
    g.lineStyle(3, TEAM_DARK[p.team]).strokeCircle(p.x, p.y, PLAYER_R);
    if (p.keeper) g.lineStyle(3, 0xffe14d).strokeCircle(p.x, p.y, PLAYER_R - 5);

    // Eyes looking where the player faces.
    for (const side of [-1, 1]) {
      const ex = p.x + p.fx * 8 + px * 8 * side;
      const ey = p.y + p.fy * 8 + py * 8 * side;
      g.fillStyle(0xffffff).fillCircle(ex, ey, 6.5);
      g.fillStyle(0x111111).fillCircle(ex + p.fx * 2.6, ey + p.fy * 2.6, 3.2);
    }
  }

  private drawUi(): void {
    const ui = this.ui;
    ui.clear();
    if (!this.isTouch && !this.joy.active) return;

    if (this.joy.active) {
      ui.fillStyle(0xffffff, 0.16).fillCircle(this.joy.bx, this.joy.by, JOY_R);
      ui.lineStyle(4, 0xffffff, 0.5).strokeCircle(this.joy.bx, this.joy.by, JOY_R);
      ui.fillStyle(0xffffff, 0.75).fillCircle(this.joy.bx + this.joy.dx, this.joy.by + this.joy.dy, 32);
    } else {
      // Resting hint showing where the thumb goes.
      const hx = 150;
      const hy = this.scale.height - 150;
      ui.lineStyle(4, 0xffffff, 0.3).strokeCircle(hx, hy, JOY_R);
      ui.fillStyle(0xffffff, 0.3).fillCircle(hx, hy, 32);
    }

    if (!this.isTouch) return;
    for (const b of this.buttons) {
      const held = this.touchHeld(b.role);
      const r = held ? b.r * 0.92 : b.r;
      ui.fillStyle(b.color, held ? 0.95 : 0.7).fillCircle(b.x, b.y, r);
      ui.lineStyle(5, 0xffffff, 0.85).strokeCircle(b.x, b.y, r);
    }
  }
}

function drawPitch(g: Phaser.GameObjects.Graphics): void {
  const { left, right, top, bottom, goalTop, goalBottom, goalDepth } = F;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

  // Surround, wide enough to cover extra-wide phone screens.
  g.fillStyle(0x1f7a35).fillRect(-500, -200, F.w + 1000, F.h + 400);

  const stripes = 10;
  const sw = (right - left) / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle(i % 2 === 0 ? 0x3fae52 : 0x37a04a).fillRect(left + i * sw, top, sw, bottom - top);
  }

  g.lineStyle(5, 0xffffff, 0.9);
  g.strokeRect(left, top, right - left, bottom - top);
  g.lineBetween(midX, top, midX, bottom);
  g.strokeCircle(midX, midY, 85);
  g.fillStyle(0xffffff, 0.9).fillCircle(midX, midY, 7);
  for (const side of [-1, 1]) {
    const gx = side < 0 ? left : right;
    g.strokeRect(side < 0 ? gx : gx - 160, midY - 180, 160, 360);
    g.strokeRect(side < 0 ? gx : gx - 60, midY - 105, 60, 210);

    // Goal: net, then frame.
    const nx = side < 0 ? gx - goalDepth : gx;
    g.fillStyle(0xffffff, 0.18).fillRect(nx, goalTop, goalDepth, goalBottom - goalTop);
    g.lineStyle(1.5, 0xffffff, 0.45);
    for (let x = nx; x <= nx + goalDepth + 0.1; x += goalDepth / 4) g.lineBetween(x, goalTop, x, goalBottom);
    for (let y = goalTop; y <= goalBottom + 0.1; y += 16) g.lineBetween(nx, y, nx + goalDepth, y);
    g.lineStyle(7, 0xffffff, 1);
    const back = side < 0 ? gx - goalDepth : gx + goalDepth;
    g.lineBetween(gx, goalTop, back, goalTop);
    g.lineBetween(back, goalTop, back, goalBottom);
    g.lineBetween(back, goalBottom, gx, goalBottom);
    g.fillStyle(0xffffff).fillCircle(gx, goalTop, 8).fillCircle(gx, goalBottom, 8);
    g.lineStyle(5, 0xffffff, 0.9);
  }
}
