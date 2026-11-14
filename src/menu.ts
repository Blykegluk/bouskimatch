import Phaser from 'phaser';
import { sfx, unlockAudio } from './audio';
import { CHARACTERS } from './characters';
import { openLobby } from './lobby';
import { PITCHES } from './pitches';
import { levelFor, levelRatio, load as loadProgress } from './progress';
import { drawCharacter, drawStadium, newAnim, previewPlayer, stepAnim } from './render';
import type { Difficulty } from './sim';
import { FONT, bigButton } from './ui';

const DIFF_LABELS: { key: Difficulty; label: string; color: number }[] = [
  { key: 'easy', label: '😊 Facile', color: 0x4ec76a },
  { key: 'normal', label: '⚽ Normal', color: 0xf2a33c },
  { key: 'champion', label: '🔥 Champion', color: 0xe8524a },
];

const CHAR_Y = 252;
const CHAR_GAP = 128;
const DIFF_Y = 366;
const PITCH_Y = 464;
const PITCH_GAP = 262;

export class MenuScene extends Phaser.Scene {
  private bgPitch!: Phaser.GameObjects.Graphics;
  private bgVeil!: Phaser.GameObjects.Graphics;
  private portraits!: Phaser.GameObjects.Graphics;
  private portraitAnims: ReturnType<typeof newAnim>[] = [];
  private charPick = 0;
  private diffPick: Difficulty = 'easy';
  private pitchPick = 'stade';
  private charMarks: Phaser.GameObjects.Graphics[] = [];
  private diffMarks: Phaser.GameObjects.Graphics[] = [];
  private pitchMarks: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super('menu');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.charMarks = [];
    this.diffMarks = [];
    this.pitchMarks = [];
    this.charPick = (this.registry.get('charPick') as number) ?? 0;
    this.diffPick = (this.registry.get('diffPick') as Difficulty) ?? 'easy';
    this.pitchPick = (this.registry.get('themePick') as string) ?? 'stade';

    // The chosen pitch, drawn behind the menu: picking one shows what it
    // looks like before the match starts.
    this.bgPitch = this.add.graphics();
    this.bgVeil = this.add.graphics();
    this.drawBackdrop();

    this.add.text(w / 2, 62, 'BOUSKIMATCH', {
      fontFamily: FONT, fontSize: '70px', fontStyle: 'bold', color: '#ffe14d',
      stroke: '#0b3d1a', strokeThickness: 12,
    }).setOrigin(0.5);
    this.add.text(w / 2, 114, 'Le foot rigolo', {
      fontFamily: FONT, fontSize: '24px', color: '#eaffea', stroke: '#0b3d1a', strokeThickness: 4,
    }).setOrigin(0.5);

    this.drawProgress();

    // --- characters
    this.add.text(w / 2, 140, 'Choisis ton perso', {
      fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#0b3d1a', strokeThickness: 5,
    }).setOrigin(0.5);

    const n = CHARACTERS.length;
    const x0 = w / 2 - ((n - 1) * CHAR_GAP) / 2;
    // The real characters, drawn the same way as on the pitch.
    this.portraits = this.add.graphics();
    this.portraitAnims = CHARACTERS.map(() => newAnim());
    CHARACTERS.forEach((c, i) => {
      const x = x0 + i * CHAR_GAP;
      const mark = this.add.graphics();
      this.charMarks.push(mark);
      this.add.text(x, CHAR_Y + 32, c.name, {
        fontFamily: FONT, fontSize: '20px', color: '#ffffff', stroke: '#0b3d1a', strokeThickness: 4,
      }).setOrigin(0.5);
      const zone = this.add.zone(x, CHAR_Y - 30, 118, 130).setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => {
        unlockAudio();
        sfx.click();
        this.charPick = i;
        this.drawMarks();
      });
    });

    // --- difficulty
    this.add.text(w / 2, DIFF_Y - 48, 'Difficulté', {
      fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#0b3d1a', strokeThickness: 5,
    }).setOrigin(0.5);

    DIFF_LABELS.forEach((d, i) => {
      const x = w / 2 + (i - 1) * 260;
      this.diffMarks.push(this.add.graphics());
      bigButton(this, x, DIFF_Y, {
        w: 230, h: 66, label: d.label, color: d.color, fontSize: 28,
        onClick: () => { this.diffPick = d.key; this.drawMarks(); },
      });
    });

    // --- pitch
    this.add.text(w / 2, PITCH_Y - 46, 'Terrain', {
      fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#0b3d1a', strokeThickness: 5,
    }).setOrigin(0.5);

    PITCHES.forEach((p, i) => {
      const x = w / 2 + (i - (PITCHES.length - 1) / 2) * PITCH_GAP;
      this.pitchMarks.push(this.add.graphics());
      bigButton(this, x, PITCH_Y, {
        w: 248, h: 62, label: `${p.icon} ${p.name}`, color: 0x3b7f8c, fontSize: 26,
        onClick: () => { this.pitchPick = p.id; this.drawMarks(); this.drawBackdrop(); },
      });
    });

    bigButton(this, w / 2 - 190, 578, {
      w: 320, h: 88, label: '▶  JOUER SEUL', color: 0x2f7bff, fontSize: 34,
      onClick: () => {
        this.remember();
        this.scene.start('match', { charPick: this.charPick, difficulty: this.diffPick, theme: this.pitchPick });
      },
    });
    bigButton(this, w - 70, 56, {
      w: 76, h: 76, label: '?', color: 0x54705c, fontSize: 40,
      onClick: () => {
        this.remember();
        this.registry.set('showHelp', true);
        this.scene.start('match', { charPick: this.charPick, difficulty: this.diffPick, theme: this.pitchPick });
      },
    });
    bigButton(this, w / 2 + 190, 578, {
      w: 320, h: 88, label: '👬  JOUER À DEUX', color: 0xe2a32a, fontSize: 34,
      onClick: () => this.openOnline(),
    });

    this.add.text(w / 2, h - 22, 'À deux : chacun son téléphone, avec un code de partie  ·  Ordinateur : flèches, Espace, Maj, E', {
      fontFamily: FONT, fontSize: '18px', color: '#cfe9cf', stroke: '#0b3d1a', strokeThickness: 3,
    }).setOrigin(0.5);

    this.drawMarks();
    this.cameras.main.fadeIn(220, 0, 0, 0);

    // A shared link (…?p=CODE) opens the join screen straight away.
    if (new URLSearchParams(location.search).get('p')) this.openOnline();
  }

  /** The chosen pitch as wallpaper, dimmed so the buttons stay readable. */
  private drawBackdrop(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.bgPitch.clear();
    drawStadium(this.bgPitch, w, this.pitchPick);
    this.bgPitch.setPosition((w - 1280) / 2, 0);
    this.bgVeil.clear();
    this.bgVeil.fillStyle(0x062b12, 0.52).fillRect(-w, -h, w * 3, h * 3);
  }

  /** The level badge and the bar: what the player has earned so far. */
  private drawProgress(): void {
    const p = loadProgress();
    const lvl = levelFor(p.balls);
    const x = 74;
    const y = 64;
    const bx = 118;
    const bw = 252;
    const bh = 20;
    const g = this.add.graphics();
    g.fillStyle(0x0b3d1a, 0.5).fillRoundedRect(28, 24, 364, 80, 20);
    g.fillStyle(0x08300f, 0.9).fillRoundedRect(bx, y - 10 - bh / 2, bw, bh, bh / 2);
    g.fillStyle(0xffe14d, 1).fillRoundedRect(bx, y - 10 - bh / 2, Math.max(bh, bw * levelRatio(p.balls)), bh, bh / 2);
    g.lineStyle(3, 0xffffff, 0.85).strokeRoundedRect(bx, y - 10 - bh / 2, bw, bh, bh / 2);
    g.fillStyle(0xffe14d, 1).fillCircle(x, y, 32);
    g.lineStyle(5, 0xffffff, 0.9).strokeCircle(x, y, 32);
    this.add.text(x, y, `${lvl}`, {
      fontFamily: FONT, fontSize: '32px', fontStyle: 'bold', color: '#12612a',
    }).setOrigin(0.5);
    this.add.text(bx, y + 22, `Niveau ${lvl}   ·   ⚽ ${p.balls}`, {
      fontFamily: FONT, fontSize: '19px', fontStyle: 'bold', color: '#eaffea',
      stroke: '#0b3d1a', strokeThickness: 4,
    }).setOrigin(0, 0.5);
  }

  private remember(): void {
    this.registry.set('charPick', this.charPick);
    this.registry.set('diffPick', this.diffPick);
    this.registry.set('themePick', this.pitchPick);
  }

  private openOnline(): void {
    this.remember();
    this.scene.pause();
    openLobby({
      charId: CHARACTERS[this.charPick].id,
      difficulty: this.diffPick,
      theme: this.pitchPick,
      onCancel: () => {
        history.replaceState(null, '', location.pathname);
        this.scene.resume();
      },
      onPlay: ({ role, link, start }) => {
        history.replaceState(null, '', location.pathname);
        this.scene.resume();
        this.scene.start('match', { role, link, start, charPick: this.charPick, difficulty: start.difficulty });
      },
    });
  }

  update(_t: number, deltaMs: number): void {
    const dt = Math.min(0.05, deltaMs / 1000);
    const w = this.scale.width;
    const x0 = w / 2 - ((CHARACTERS.length - 1) * CHAR_GAP) / 2;
    this.portraits.clear();
    CHARACTERS.forEach((c, i) => {
      const chosen = i === this.charPick;
      const p = previewPlayer(c.id, x0 + i * CHAR_GAP, CHAR_Y);
      const anim = this.portraitAnims[i];
      anim.lastX = p.x;
      anim.lastY = p.y;
      // The chosen one bounces on the spot; the others just blink.
      if (chosen) anim.celebrate = 1;
      stepAnim(anim, p, dt);
      drawCharacter(this.portraits, p, c, {
        radius: chosen ? 33 : 29,
        controlled: false,
        otherHuman: false,
        anim,
        timeMs: this.time.now,
        charging: -1,
        jersey: false,
      });
    });
  }

  private drawMarks(): void {
    const w = this.scale.width;
    const x0 = w / 2 - ((CHARACTERS.length - 1) * CHAR_GAP) / 2;
    this.charMarks.forEach((g, i) => {
      g.clear();
      if (i !== this.charPick) return;
      g.fillStyle(0xffffff, 0.12).fillRoundedRect(x0 + i * CHAR_GAP - 56, CHAR_Y - 96, 112, 148, 20);
      g.lineStyle(6, 0xffe14d, 1).strokeRoundedRect(x0 + i * CHAR_GAP - 56, CHAR_Y - 96, 112, 148, 20);
    });
    this.diffMarks.forEach((g, i) => {
      g.clear();
      if (DIFF_LABELS[i].key !== this.diffPick) return;
      g.lineStyle(7, 0xffe14d, 1).strokeRoundedRect(w / 2 + (i - 1) * 260 - 124, DIFF_Y - 43, 248, 84, 22);
    });
    this.pitchMarks.forEach((g, i) => {
      g.clear();
      if (PITCHES[i].id !== this.pitchPick) return;
      const x = w / 2 + (i - (PITCHES.length - 1) / 2) * PITCH_GAP;
      g.lineStyle(7, 0xffe14d, 1).strokeRoundedRect(x - 133, PITCH_Y - 41, 266, 80, 22);
    });
  }
}
