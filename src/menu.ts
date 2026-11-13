import Phaser from 'phaser';
import { sfx, unlockAudio } from './audio';
import { CHARACTERS } from './characters';
import { openLobby } from './lobby';
import type { Difficulty } from './sim';
import { FONT, bigButton } from './ui';

const DIFF_LABELS: { key: Difficulty; label: string; color: number }[] = [
  { key: 'easy', label: '😊 Facile', color: 0x4ec76a },
  { key: 'normal', label: '⚽ Normal', color: 0xf2a33c },
  { key: 'champion', label: '🔥 Champion', color: 0xe8524a },
];

export class MenuScene extends Phaser.Scene {
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

    // --- characters
    this.add.text(w / 2, 196, 'Choisis ton perso', {
      fontFamily: FONT, fontSize: '28px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#0b3d1a', strokeThickness: 5,
    }).setOrigin(0.5);

    const n = CHARACTERS.length;
    const gap = 128;
    const x0 = w / 2 - ((n - 1) * gap) / 2;
    CHARACTERS.forEach((c, i) => {
      const x = x0 + i * gap;
      const y = 282;
      const mark = this.add.graphics();
      this.charMarks.push(mark);
      const body = this.add.graphics();
      body.fillStyle(0x000000, 0.25).fillCircle(x + 3, y + 6, 44);
      body.fillStyle(c.body).fillCircle(x, y, 44);
      body.lineStyle(4, c.trim).strokeCircle(x, y, 44);
      this.add.text(x, y - 2, c.face, { fontFamily: FONT, fontSize: '46px' }).setOrigin(0.5);
      this.add.text(x, y + 62, c.name, {
        fontFamily: FONT, fontSize: '20px', color: '#ffffff', stroke: '#0b3d1a', strokeThickness: 4,
      }).setOrigin(0.5);
      const zone = this.add.zone(x, y + 10, 118, 130).setInteractive({ useHandCursor: true });
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

  private drawMarks(): void {
    const w = this.scale.width;
    const n = CHARACTERS.length;
    const gap = 128;
    const x0 = w / 2 - ((n - 1) * gap) / 2;
    this.charMarks.forEach((g, i) => {
      g.clear();
      if (i !== this.charPick) return;
      g.lineStyle(7, 0xffe14d, 1).strokeCircle(x0 + i * gap, 282, 54);
    });
    this.diffMarks.forEach((g, i) => {
      g.clear();
      if (DIFF_LABELS[i].key !== this.diffPick) return;
      g.lineStyle(7, 0xffe14d, 1).strokeRoundedRect(w / 2 + (i - 1) * 260 - 124, 456 - 46, 248, 90, 22);
    });
  }
}
