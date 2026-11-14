import Phaser from 'phaser';
import { sfx, unlockAudio } from './audio';
import { CHARACTERS } from './characters';
import { openLobby } from './lobby';
import { levelFor, levelRatio, load as loadProgress } from './progress';
import { drawCharacter, newAnim, previewPlayer, stepAnim } from './render';
import type { Difficulty } from './sim';
import { FONT, bigButton } from './ui';

const DIFF_LABELS: { key: Difficulty; label: string; color: number }[] = [
  { key: 'easy', label: '😊 Facile', color: 0x4ec76a },
  { key: 'normal', label: '⚽ Normal', color: 0xf2a33c },
  { key: 'champion', label: '🔥 Champion', color: 0xe8524a },
];

export class MenuScene extends Phaser.Scene {
  private portraits!: Phaser.GameObjects.Graphics;
  private portraitAnims: ReturnType<typeof newAnim>[] = [];
  private charPick = 0;
  private diffPick: Difficulty = 'easy';
  private charMarks: Phaser.GameObjects.Graphics[] = [];
  private diffMarks: Phaser.GameObjects.Graphics[] = [];

  constructor() {
    super('menu');
  }

  create(): void {
    const w = this.scale.width;
    const h = this.scale.height;
    this.charMarks = [];
    this.diffMarks = [];
    this.charPick = (this.registry.get('charPick') as number) ?? 0;
    this.diffPick = (this.registry.get('diffPick') as Difficulty) ?? 'easy';

    const bg = this.add.graphics();
    bg.fillStyle(0x1f7a35).fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      bg.fillStyle(i % 2 === 0 ? 0x2a8a40 : 0x24803a, 1).fillRect((i * w) / 14, 0, w / 14, h);
    }
    bg.fillStyle(0xffffff, 0.08).fillCircle(w / 2, h / 2, 230);

    this.add.text(w / 2, 72, 'BOUSKIMATCH', {
      fontFamily: FONT, fontSize: '76px', fontStyle: 'bold', color: '#ffe14d',
      stroke: '#0b3d1a', strokeThickness: 12,
    }).setOrigin(0.5);
    this.add.text(w / 2, 132, 'Le foot rigolo', {
      fontFamily: FONT, fontSize: '26px', color: '#eaffea', stroke: '#0b3d1a', strokeThickness: 4,
    }).setOrigin(0.5);

    this.drawProgress();

    // --- characters
    this.add.text(w / 2, 196, 'Choisis ton perso', {
      fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#0b3d1a', strokeThickness: 5,
    }).setOrigin(0.5);

    const n = CHARACTERS.length;
    const gap = 128;
    const x0 = w / 2 - ((n - 1) * gap) / 2;
    // The real characters, drawn the same way as on the pitch.
    this.portraits = this.add.graphics();
    this.portraitAnims = CHARACTERS.map(() => newAnim());
    CHARACTERS.forEach((c, i) => {
      const x = x0 + i * gap;
      const y = 282;
      const mark = this.add.graphics();
      this.charMarks.push(mark);
      this.add.text(x, y + 70, c.name, {
        fontFamily: FONT, fontSize: '20px', color: '#ffffff', stroke: '#0b3d1a', strokeThickness: 4,
      }).setOrigin(0.5);
      const zone = this.add.zone(x, y, 118, 120).setInteractive({ useHandCursor: true });
      zone.on('pointerup', () => {
        unlockAudio();
        sfx.click();
        this.charPick = i;
        this.drawMarks();
      });
    });

    // --- difficulty
    this.add.text(w / 2, 390, 'Difficulté', {
      fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#0b3d1a', strokeThickness: 5,
    }).setOrigin(0.5);

    DIFF_LABELS.forEach((d, i) => {
      const x = w / 2 + (i - 1) * 260;
      const y = 456;
      const mark = this.add.graphics();
      this.diffMarks.push(mark);
      bigButton(this, x, y, {
        w: 230, h: 72, label: d.label, color: d.color, fontSize: 30,
        onClick: () => { this.diffPick = d.key; this.drawMarks(); },
      });
    });

    bigButton(this, w / 2 - 190, 586, {
      w: 320, h: 92, label: '▶  JOUER SEUL', color: 0x2f7bff, fontSize: 34,
      onClick: () => {
        this.remember();
        this.scene.start('match', { charPick: this.charPick, difficulty: this.diffPick });
      },
    });
    bigButton(this, w - 70, 56, {
      w: 76, h: 76, label: '?', color: 0x54705c, fontSize: 40,
      onClick: () => {
        this.remember();
        this.registry.set('showHelp', true);
        this.scene.start('match', { charPick: this.charPick, difficulty: this.diffPick });
      },
    });
    bigButton(this, w / 2 + 190, 586, {
      w: 320, h: 92, label: '👬  JOUER À DEUX', color: 0xe2a32a, fontSize: 34,
      onClick: () => this.openOnline(),
    });

    this.add.text(w / 2, h - 26, 'À deux : chacun son téléphone, avec un code de partie  ·  Ordinateur : flèches, Espace, Maj, E', {
      fontFamily: FONT, fontSize: '18px', color: '#cfe9cf', stroke: '#0b3d1a', strokeThickness: 3,
    }).setOrigin(0.5);

    this.drawMarks();

    // A shared link (…?p=CODE) opens the join screen straight away.
    if (new URLSearchParams(location.search).get('p')) this.openOnline();
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
  }

  private openOnline(): void {
    this.remember();
    this.scene.pause();
    openLobby({
      charId: CHARACTERS[this.charPick].id,
      difficulty: this.diffPick,
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
    const gap = 128;
    const x0 = w / 2 - ((CHARACTERS.length - 1) * gap) / 2;
    this.portraits.clear();
    CHARACTERS.forEach((c, i) => {
      const chosen = i === this.charPick;
      const p = previewPlayer(c.id, x0 + i * gap, 282 - (chosen ? 4 : 0));
      const anim = this.portraitAnims[i];
      anim.lastX = p.x;
      anim.lastY = p.y;
      // The chosen one bounces on the spot; the others just blink.
      if (chosen) anim.celebrate = 1;
      stepAnim(anim, p, dt);
      drawCharacter(this.portraits, p, c, {
        radius: chosen ? 38 : 33,
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
    const n = CHARACTERS.length;
    const gap = 128;
    const x0 = w / 2 - ((n - 1) * gap) / 2;
    this.charMarks.forEach((g, i) => {
      g.clear();
      if (i !== this.charPick) return;
      g.lineStyle(7, 0xffe14d, 1).strokeCircle(x0 + i * gap, 282, 62);
    });
    this.diffMarks.forEach((g, i) => {
      g.clear();
      if (DIFF_LABELS[i].key !== this.diffPick) return;
      g.lineStyle(7, 0xffe14d, 1).strokeRoundedRect(w / 2 + (i - 1) * 260 - 124, 456 - 46, 248, 90, 22);
    });
  }
}
