import Phaser from 'phaser';
import { sfx, unlockAudio } from './audio';

export const FONT = "'Trebuchet MS', 'Arial Rounded MT Bold', Arial, sans-serif";

export interface ButtonOpts {
  w: number;
  h: number;
  label: string;
  color: number;
  fontSize?: number;
  onClick: () => void;
}

/** A big, rounded, kid-sized button that reacts clearly to a tap. */
export function bigButton(scene: Phaser.Scene, x: number, y: number, o: ButtonOpts): Phaser.GameObjects.Container {
  const c = scene.add.container(x, y);
  const g = scene.add.graphics();
  const draw = (pressed: boolean) => {
    g.clear();
    const dy = pressed ? 4 : 0;
    g.fillStyle(0x000000, 0.25).fillRoundedRect(-o.w / 2, -o.h / 2 + 7, o.w, o.h, 18);
    g.fillStyle(o.color, 1).fillRoundedRect(-o.w / 2, -o.h / 2 + dy, o.w, o.h, 18);
    g.lineStyle(5, 0xffffff, 0.9).strokeRoundedRect(-o.w / 2, -o.h / 2 + dy, o.w, o.h, 18);
  };
  draw(false);
  const t = scene.add.text(0, 0, o.label, {
    fontFamily: FONT, fontSize: `${o.fontSize ?? 34}px`, fontStyle: 'bold',
    color: '#ffffff', stroke: '#00000055', strokeThickness: 4, align: 'center',
  }).setOrigin(0.5);
  c.add([g, t]);
  c.setSize(o.w, o.h);
  c.setInteractive(new Phaser.Geom.Rectangle(-o.w / 2, -o.h / 2, o.w, o.h), Phaser.Geom.Rectangle.Contains);
  c.on('pointerdown', () => { draw(true); t.y = 4; });
  const release = () => { draw(false); t.y = 0; };
  c.on('pointerout', release);
  c.on('pointerup', () => {
    release();
    unlockAudio();
    sfx.click();
    o.onClick();
  });
  return c;
}

export function setButtonLabel(c: Phaser.GameObjects.Container, label: string): void {
  const t = c.list.find((o) => o instanceof Phaser.GameObjects.Text) as Phaser.GameObjects.Text | undefined;
  t?.setText(label);
}
