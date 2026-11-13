import Phaser from 'phaser';
import { MenuScene } from './menu';
import { MatchScene } from './scene';

const HEIGHT = 720;
// The pitch is 1280 wide; wider screens just see more grass and get roomier controls.
const gameWidth = () => {
  // A hidden tab can report a 0x0 window; fall back to the base width.
  const ratio = window.innerWidth / window.innerHeight;
  if (!Number.isFinite(ratio) || ratio <= 0) return 1280;
  return Math.round(Phaser.Math.Clamp(HEIGHT * ratio, 1280, 1720));
};

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#1f7a35',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: gameWidth(),
    height: HEIGHT,
  },
  input: { activePointers: 4 },
  scene: [MenuScene, MatchScene],
});

// Handle used by the automated browser checks.
(window as unknown as Record<string, unknown>).__game = game;

const resize = () => game.scale.setGameSize(gameWidth(), HEIGHT);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));

// Fullscreen (and landscape lock where the browser allows it) for phones.
const goFullscreen = () => {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen()
      .then(() => (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape'))
      .catch(() => undefined);
  }
};
const fsButton = document.getElementById('fs');
if (fsButton && document.fullscreenEnabled && window.matchMedia('(pointer: coarse)').matches) {
  fsButton.style.display = 'block';
  fsButton.addEventListener('click', goFullscreen);
}
document.getElementById('rotate')?.addEventListener('click', goFullscreen);

document.addEventListener('contextmenu', (e) => e.preventDefault());

// Locking the phone or switching app pauses a solo match, so the clock does not
// run down while nobody is playing.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  const match = game.scene.getScene('match') as Phaser.Scene & { pauseFromOutside?: () => void };
  if (match?.scene.isActive()) match.pauseFromOutside?.();
});
