import Phaser from 'phaser';
import { sfx, unlockAudio } from './audio';
import { CHARACTERS, characterById } from './characters';
import {
  BALL_R, CHARGE_MAX, DIFFS, F, MATCH_TIME, PLAYER_R, STEP,
  abilityFor, createState, playerRadius, step,
  type AbilityKind, type Difficulty, type GameState, type Player, type PlayerInput, type SimEvent, type TeamLineup,
} from './sim';
import { FONT, bigButton } from './ui';

const TEAM_TINT = [0x2f7bff, 0xff4d4d];
const TEAM_DARK = [0x16307a, 0x8a1f1f];
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

  private world!: Phaser.GameObjects.Container;
  private g!: Phaser.GameObjects.Graphics;
  private ui!: Phaser.GameObjects.Graphics;
  private faces: Phaser.GameObjects.Text[] = [];
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

  init(data: { charPick?: number; difficulty?: Difficulty }): void {
    this.charPick = data.charPick ?? 0;
    this.difficulty = data.difficulty ?? 'easy';
  }

  create(): void {
    // Lineups: the chosen character leads your team, the rest are shared out.
    const mine = CHARACTERS[this.charPick % CHARACTERS.length];
    const rest = CHARACTERS.filter((c) => c.id !== mine.id);
    const pick = (i: number) => rest[i % rest.length];
    const home: TeamLineup = { fwd: mine, def: pick(0), gk: pick(1) };
    const away: TeamLineup = { fwd: pick(2), def: pick(3), gk: pick(4) };
    this.state = createState(this.difficulty, home, away, Math.floor(Math.random() * 1e9));
    this.acc = 0;
    this.isTouch = window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
    this.keys.clear();
    this.touches.clear();
    this.joy.active = false;

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
    this.flames = this.add.particles(0, 0, 'px', {
      speed: { min: 10, max: 70 }, angle: { min: 0, max: 360 },
      lifespan: 350, scale: { start: 1.6, end: 0 }, alpha: { start: 0.9, end: 0 },
      tint: [0xffe14d, 0xff9f1c, 0xff4d20], emitting: false,
    });
    this.world.add([this.dust, this.flames]);

    this.g = this.add.graphics();
    this.world.add(this.g);

    this.faces = this.state.players.map(() =>
      this.add.text(0, 0, '', { fontFamily: FONT, fontSize: '30px' }).setOrigin(0.5));
    this.world.add(this.faces);

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
    this.endLayer = this.add.container(0, 0).setVisible(false);

    this.setupInput();
    this.layout();
    this.refreshHud();
    (window as unknown as Record<string, unknown>).__bm = { scene: this, getState: () => this.state };
  }

  // ---------------------------------------------------------------- input

  private setupInput(): void {
    const handled = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'];
    this.input.keyboard?.removeAllListeners();
    const onDown = (e: KeyboardEvent) => {
      unlockAudio();
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
    this.scoreText.setPosition(w / 2, 28);
    this.clockText.setPosition(w / 2, 66);
    this.bigText.setPosition(w / 2, h / 2 - 20);
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
    if (s.phase !== 'over') {
      this.acc += Math.min(deltaMs / 1000, 0.1);
      const input = this.readInput();
      const events: SimEvent[] = [];
      while (this.acc >= STEP) {
        s.events = [];
        step(s, input, STEP);
        events.push(...s.events);
        this.acc -= STEP;
      }
      for (const e of events) this.onEvent(e);
    }
    this.draw();
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
        this.dust.explode(8, e.x, e.y);
        break;
      case 'slide':
        sfx.slide();
        this.dust.explode(10, e.x, e.y);
        break;
      case 'stun':
        sfx.stun();
        this.dust.explode(14, e.x, e.y);
        this.cameras.main.shake(140, 0.005);
        break;
      case 'pickup':
        sfx.pickup();
        this.confetti.explode(18, e.x, e.y);
        break;
      case 'ready':
        if (e.team === 0) sfx.ready();
        break;
      case 'ability':
        this.onAbility(e.kind, e.team, e.x, e.y);
        break;
      case 'whistle':
        sfx.whistle();
        this.bigText.setVisible(false);
        break;
      case 'goal': {
        const mine = e.team === 0;
        if (mine) sfx.goal(); else sfx.conceded();
        this.refreshHud();
        this.cameras.main.shake(260, 0.008);
        if (mine) this.confetti.explode(110, e.x, e.y);
        this.flash(mine ? 'BUT !' : 'Oups !', mine ? '#ffe14d' : '#ffffff');
        break;
      }
      case 'end':
        this.showEnd();
        break;
    }
  }

  private onAbility(kind: AbilityKind, team: 0 | 1, x: number, y: number): void {
    if (kind === 'cannon') sfx.cannon();
    else if (kind === 'turbo') sfx.turbo();
    else if (kind === 'keeper') sfx.giant();
    else sfx.slide();
    this.flames.explode(26, x, y);
    if (team === 0) {
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

  private refreshHud(): void {
    const s = this.state;
    const mine = characterById(s.players[0].charId);
    const theirs = characterById(s.players[3].charId);
    this.scoreText.setText(`${mine.face} ${s.score[0]}  –  ${s.score[1]} ${theirs.face}`);
  }

  private showEnd(): void {
    const s = this.state;
    const w = this.scale.width;
    const h = this.scale.height;
    const won = s.score[0] > s.score[1];
    const draw = s.score[0] === s.score[1];
    if (won) sfx.win(); else if (!draw) sfx.lose();
    if (won) {
      this.confetti.explode(160, F.w / 2, 180);
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
    const replay = bigButton(this, w / 2 - 150, h / 2 + 68, {
      w: 260, h: 84, label: '↻  Rejouer', color: 0x2f7bff, fontSize: 34,
      onClick: () => this.scene.restart({ charPick: this.charPick, difficulty: this.difficulty }),
    });
    const menu = bigButton(this, w / 2 + 150, h / 2 + 68, {
      w: 260, h: 84, label: '☰  Menu', color: 0x4ec76a, fontSize: 34,
      onClick: () => this.scene.start('menu'),
    });
    this.endLayer.add([panel, title, score, replay, menu]);
    this.endLayer.setVisible(true);
  }

  // ----------------------------------------------------------------- draw

  private draw(): void {
    const g = this.g;
    const s = this.state;
    g.clear();

    for (const pk of s.pickups) {
      if (!pk.alive) continue;
      const pulse = 1 + Math.sin(this.time.now / 140) * 0.12;
      g.fillStyle(0x000000, 0.2).fillEllipse(pk.x + 3, pk.y + 8, 40, 20);
      g.fillStyle(0xffe14d, 0.95).fillCircle(pk.x, pk.y, 20 * pulse);
      g.lineStyle(4, 0xffffff, 0.9).strokeCircle(pk.x, pk.y, 20 * pulse);
      g.fillStyle(0xffffff, 0.9).fillCircle(pk.x - 5, pk.y - 5, 4);
    }

    s.players.forEach((p, i) => this.drawPlayer(g, p, i));

    const b = s.ball;
    if (b.power > 0.3) {
      this.flames.emitParticleAt(b.x, b.y, 2);
      g.fillStyle(0xff9f1c, 0.5).fillCircle(b.x, b.y, BALL_R + 10);
    }
    g.fillStyle(0x000000, 0.25).fillEllipse(b.x + 3, b.y + 6, BALL_R * 2.1, BALL_R * 1.5);
    g.fillStyle(0xffffff).fillCircle(b.x, b.y, BALL_R);
    g.lineStyle(2, 0x222222).strokeCircle(b.x, b.y, BALL_R);
    g.fillStyle(0x222222);
    for (let i = 0; i < 3; i++) {
      const a = b.spin + (i * Math.PI * 2) / 3;
      g.fillCircle(b.x + Math.cos(a) * 5.5, b.y + Math.sin(a) * 5.5, 2.8);
    }

    this.drawHud();
  }

  private drawPlayer(g: Phaser.GameObjects.Graphics, p: Player, i: number): void {
    const char = characterById(p.charId);
    const r = playerRadius(p);
    const px = -p.fy;
    const py = p.fx;
    const controlled = i === this.state.controlled;

    g.fillStyle(0x000000, 0.25).fillEllipse(p.x + 4, p.y + 9, r * 2.2, r * 1.6);

    if (p.turboT > 0 && Math.random() < 0.8) this.flames.emitParticleAt(p.x - p.fx * r, p.y - p.fy * r, 1);
    if (p.slideT > 0 && Math.random() < 0.6) this.dust.emitParticleAt(p.x, p.y + 8, 1);

    if (controlled && this.state.phase !== 'over') {
      g.lineStyle(5, 0xffe14d, 0.95).strokeCircle(p.x, p.y, r + 15);
      g.fillStyle(0xffe14d, 0.95);
      g.fillTriangle(p.x - 13, p.y - r - 30, p.x + 13, p.y - r - 30, p.x, p.y - r - 13);
    }

    if (p.charge >= 0) {
      const t = Math.min(1, p.charge / CHARGE_MAX);
      const col = Phaser.Display.Color.Interpolate.ColorWithColor(
        new Phaser.Display.Color(255, 230, 60), new Phaser.Display.Color(255, 60, 40), 100, t * 100);
      g.lineStyle(7, Phaser.Display.Color.GetColor(col.r, col.g, col.b), 0.95);
      g.beginPath();
      g.arc(p.x, p.y, r + 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
      g.strokePath();
    }

    // A thick team-coloured jersey ring so a child can tell the sides apart at a glance.
    g.fillStyle(TEAM_TINT[p.team]);
    if (p.slideT > 0) {
      g.fillEllipse(p.x, p.y, (r + 7) * (2 + Math.abs(p.fx) * 0.5), (r + 7) * (2 + Math.abs(p.fy) * 0.5));
    } else {
      g.fillCircle(p.x, p.y, r + 7);
    }
    g.lineStyle(3, TEAM_DARK[p.team], 1).strokeCircle(p.x, p.y, r + 7);
    g.fillStyle(char.body).fillCircle(p.x, p.y, r);
    g.lineStyle(3, char.trim).strokeCircle(p.x, p.y, r);
    if (p.keeper) {
      g.lineStyle(4, 0xffe14d, 0.95).strokeCircle(p.x, p.y, r + 11);
    }

    const face = this.faces[i];
    face.setPosition(p.x + p.fx * 3, p.y + p.fy * 3 - 1);
    face.setFontSize(Math.round(r * 1.35));
    face.setText(p.stunT > 0 ? '😵' : char.face);
    face.setAngle(p.stunT > 0 ? (this.time.now / 3) % 360 : 0);
    face.setVisible(true);

    if (p.stunT > 0) {
      g.fillStyle(0xffe14d, 0.95);
      for (let k = 0; k < 3; k++) {
        const a = this.time.now / 180 + (k * Math.PI * 2) / 3;
        g.fillCircle(p.x + Math.cos(a) * (r + 14), p.y - r - 8 + Math.sin(a) * 6, 4.5);
      }
    } else {
      // Eyes looking where the player faces, behind the emoji for depth.
      void px; void py;
    }
  }

  private drawHud(): void {
    const ui = this.ui;
    const s = this.state;
    const w = this.scale.width;
    const h = this.scale.height;
    ui.clear();

    const secs = Math.ceil(s.clock);
    this.clockText.setText(`${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`);
    this.clockText.setColor(secs <= 15 ? '#ffd23f' : '#eaffea');

    // Super gauge.
    const meter = s.teams[0].meter;
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
    const ready = s.teams[0].meter >= 1;
    for (const b of this.buttons) {
      const held = this.touchHeld(b.role);
      const isSuper = b.role === 'special';
      const r = held ? b.r * 0.92 : b.r;
      const alpha = isSuper && !ready ? 0.3 : held ? 0.95 : 0.72;
      ui.fillStyle(b.color, alpha).fillCircle(b.x, b.y, r);
      ui.lineStyle(5, 0xffffff, isSuper && !ready ? 0.4 : 0.85).strokeCircle(b.x, b.y, r);
      if (isSuper) {
        b.icon.setText(ABILITY_ICON[abilityFor(s, s.controlled)]);
        b.icon.setAlpha(ready ? 1 : 0.4);
        if (ready) {
          const pulse = 0.5 + Math.sin(this.time.now / 110) * 0.5;
          ui.lineStyle(5, 0xffe14d, 0.3 + pulse * 0.7).strokeCircle(b.x, b.y, r + 9);
        }
      }
    }
  }

  private drawKeyboardHint(w: number, h: number): void {
    const ready = this.state.teams[0].meter >= 1;
    const kind = abilityFor(this.state, this.state.controlled);
    this.hint
      .setText(`Flèches : bouger   ·   Espace : tirer (tap = passe)   ·   Maj : tacle   ·   E : ${ABILITY_ICON[kind]} ${ready ? 'prêt !' : '…'}`)
      .setPosition(w / 2, h - 22);
  }
}

function drawPitch(g: Phaser.GameObjects.Graphics): void {
  const { left, right, top, bottom, goalTop, goalBottom, goalDepth } = F;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;

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
    g.strokeRect(side < 0 ? gx : gx - 160, midY - 175, 160, 350);
    g.strokeRect(side < 0 ? gx : gx - 60, midY - 102, 60, 204);

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

export { MATCH_TIME, DIFFS, PLAYER_R };
