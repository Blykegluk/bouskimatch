import Phaser from 'phaser';
import type { Build, Character } from './characters';
import { pitchById, type Pitch } from './pitches';
import { BALL_R, F, type Player } from './sim';

type G = Phaser.GameObjects.Graphics;

const TEAM_TINT = [0x2f7bff, 0xff4d4d];
const TEAM_DARK = [0x16307a, 0x8a1f1f];

/** Per-player drawing state: the run cycle, blinking and celebrations. */
export interface Anim {
  phase: number;
  blink: number;
  celebrate: number;
  lastX: number;
  lastY: number;
  speed: number;
}

export function newAnim(): Anim {
  return { phase: Math.random() * 10, blink: 1 + Math.random() * 4, celebrate: 0, lastX: 0, lastY: 0, speed: 0 };
}

/** Advance a player's animation from how far they actually moved. */
export function stepAnim(a: Anim, p: Player, dt: number): void {
  const dx = p.x - a.lastX;
  const dy = p.y - a.lastY;
  a.lastX = p.x;
  a.lastY = p.y;
  const moved = Math.hypot(dx, dy);
  // Smooth it so a networked player does not flicker between updates.
  a.speed += (Math.min(moved / Math.max(dt, 0.001), 700) - a.speed) * Math.min(1, dt * 10);
  a.phase += a.speed * dt * 0.055;
  a.blink -= dt;
  if (a.blink < -0.12) a.blink = 2.5 + Math.random() * 4;
  a.celebrate = Math.max(0, a.celebrate - dt);
}

interface DrawOpts {
  radius: number;
  controlled: boolean;
  otherHuman: boolean;
  anim: Anim;
  timeMs: number;
  charging: number;
  /** Menus show the character without a team shirt. */
  jersey?: boolean;
}

const BOOT = 0x2b2b33;

/** Body shapes, so each character has its own silhouette. */
const BUILD: Record<Build, { bw: number; bh: number; hr: number }> = {
  slim: { bw: 1.36, bh: 1.32, hr: 0.95 },
  normal: { bw: 1.62, bh: 1.4, hr: 0.9 },
  big: { bw: 1.92, bh: 1.48, hr: 0.84 },
};

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * One character: feet, legs, a shirt, arms, hands and a head, all built from
 * shapes in code — no image to download, and it stays crisp at any size.
 * The view is from above and slightly behind, so the body stands up on the
 * pitch and the head turns the way the player is facing.
 */
export function drawCharacter(g: G, p: Player, c: Character, o: DrawOpts): void {
  const r = o.radius;
  const a = o.anim;
  const running = a.speed > 40;
  const stunned = p.stunT > 0;
  const sliding = p.slideT > 0;
  const hop = a.celebrate > 0 ? Math.abs(Math.sin(o.timeMs / 90)) * r * 0.5 : 0;

  // Sliding throws the body forward and flattens it towards the grass.
  const lean = sliding ? r * 0.8 : 0;
  const low = sliding ? r * 0.55 : 0;
  const x = p.x + p.fx * lean;
  const ground = p.y + p.fy * lean * 0.45 - hop;

  const jersey = o.jersey !== false;
  const shirt = jersey ? TEAM_TINT[p.team] : c.trim;
  const shirtDark = jersey ? TEAM_DARK[p.team] : c.trim;

  const build = BUILD[c.build] ?? BUILD.normal;
  // Running leans the body into the run a little.
  const run = Math.min(1, a.speed / 320);
  const leanX = p.fx * run * r * 0.1;
  const leanY = p.fy * run * r * 0.05;
  // A bounce in the stride, and a slow breath when standing still.
  const bob = running
    ? -Math.abs(Math.sin(a.phase)) * r * 0.1
    : Math.sin(o.timeMs / 900 + a.phase) * r * 0.025;
  // Just after a shot the leg is still out in front.
  const kickT = Math.min(1, Math.max(0, p.kickCd / 0.3));
  const bodyY = ground - r * 0.72 + low + leanY + bob;
  const headR = r * build.hr;
  const headY = bodyY - r * 0.95 + low * 0.7 + leanY;
  const bw = r * build.bw;
  const bh = r * build.bh;
  const tilt = stunned ? Math.sin(o.timeMs / 110) * r * 0.12 : 0;

  // The shadow stays on the grass, under the feet, even during a jump.
  g.fillStyle(0x000000, 0.25).fillEllipse(p.x + r * 0.1, p.y + r * 0.42, r * 2.05, r * 0.9);

  drawBackParts(g, c, x, headY, headR, bodyY, a);

  // --- legs: they swing when running, and trail behind during a slide.
  const swing = running ? Math.sin(a.phase) : 0;
  for (const side of [-1, 1]) {
    const lift = Math.max(0, swing * side) * r * 0.34;
    // The right leg is the one that strikes the ball.
    const strike = side > 0 ? kickT : 0;
    const lx = x + side * r * 0.4 - p.fx * lean * 0.7 + p.fx * strike * r * 0.75;
    const ly = ground + r * 0.1 - lift - p.fy * lean * 0.5 + p.fy * strike * r * 0.55 - strike * r * 0.18;
    g.fillStyle(c.trim, 1).fillEllipse(lx, ly, r * 0.44, r * 0.66);
    g.fillStyle(BOOT, 1).fillEllipse(lx + side * r * 0.04, ly + r * 0.32, r * 0.52, r * 0.32);
  }

  // --- arms, swinging the other way to the legs.
  const cheering = a.celebrate > 0;
  const armSwing = running ? Math.sin(a.phase + Math.PI) : Math.sin(o.timeMs / 520) * 0.2;
  const keeperHands = p.keeper;
  for (const side of [-1, 1]) {
    // Arms go up in the air to celebrate.
    const ax = x + side * (bw / 2 + r * (cheering ? 0.42 : 0.16)) + tilt * side;
    const ay = cheering
      ? bodyY - r * 0.78 + Math.sin(o.timeMs / 90) * r * 0.12
      : bodyY + r * 0.1 + armSwing * side * r * 0.24;
    const sleeveY = cheering ? ay + r * 0.14 : ay - r * 0.16;
    const handY = cheering ? ay - r * 0.38 : ay + r * 0.26;
    g.fillStyle(shirt, 1).fillEllipse(ax, sleeveY, r * 0.4, r * 0.56);
    g.fillStyle(keeperHands ? 0xffe14d : c.body, 1).fillCircle(ax + side * r * 0.05, handY, r * 0.24);
    g.lineStyle(Math.max(1.5, r * 0.07), keeperHands ? 0xc9a400 : c.trim, 1)
      .strokeCircle(ax + side * r * 0.05, handY, r * 0.24);
  }

  // --- shirt.
  const sx0 = x - bw / 2 + tilt + leanX;
  g.fillStyle(shirt, 1).fillRoundedRect(sx0, bodyY - bh / 2, bw, bh, r * 0.42);
  // A little light from above and shade below, so it is not a flat slab.
  g.fillStyle(0xffffff, 0.14).fillRoundedRect(sx0 + r * 0.1, bodyY - bh / 2 + r * 0.08, bw - r * 0.2, bh * 0.34, r * 0.3);
  g.lineStyle(Math.max(2, r * 0.09), shirtDark, 1)
    .strokeRoundedRect(sx0, bodyY - bh / 2, bw, bh, r * 0.42);
  if (jersey) {
    // Two stripes and a collar, so the two teams read at a glance.
    g.fillStyle(shirtDark, 0.55);
    for (const k of [-0.3, 0.16]) {
      g.fillRect(x + k * bw + tilt + leanX, bodyY - bh / 2 + r * 0.14, bw * 0.14, bh - r * 0.28);
    }
    g.fillStyle(0xffffff, 0.85).fillEllipse(x + tilt + leanX, bodyY - bh / 2 + r * 0.08, bw * 0.46, r * 0.26);
  }
  if (p.keeper) {
    g.lineStyle(Math.max(2, r * 0.1), 0xffe14d, 0.95)
      .strokeRoundedRect(sx0, bodyY - bh / 2, bw, bh, r * 0.42);
  }

  // --- head: boxy for the robot, round for everyone else.
  const hx = x + tilt * 1.4 + leanX;
  g.fillStyle(c.body, 1);
  g.lineStyle(Math.max(2, r * 0.085), c.trim, 1);
  if (c.square) {
    g.fillRoundedRect(hx - headR, headY - headR * 0.94, headR * 2, headR * 1.88, headR * 0.34);
    g.strokeRoundedRect(hx - headR, headY - headR * 0.94, headR * 2, headR * 1.88, headR * 0.34);
  } else {
    g.fillCircle(hx, headY, headR);
    g.strokeCircle(hx, headY, headR);
  }
  g.fillStyle(0xffffff, 0.16).fillEllipse(hx - headR * 0.3, headY - headR * 0.42, headR * 0.9, headR * 0.6);

  drawPattern(g, c, hx, headY, headR);
  drawFrontParts(g, c, hx, headY, headR, o.timeMs);

  // Facing away from us: the back of the head, no face.
  if (p.fy < -0.55 && !stunned) {
    g.fillStyle(c.trim, 0.35).fillCircle(hx, headY + headR * 0.1, headR * 0.6);
  } else {
    drawFace(g, c, hx, headY, headR, p, a, o);
  }

  // --- who is who: a ring on the grass, and an arrow for your own player.
  if (o.controlled || o.otherHuman) {
    const col = o.controlled ? 0xffe14d : 0x58d6ff;
    g.lineStyle(Math.max(4, r * 0.18), col, 0.95)
      .strokeEllipse(p.x, p.y + r * 0.42, r * 2.3, r * 1.05);
    const ty = headY - headR - r * 0.5;
    if (o.controlled) {
      g.fillStyle(col, 0.95)
        .fillTriangle(p.x - r * 0.5, ty - r * 0.55, p.x + r * 0.5, ty - r * 0.55, p.x, ty + r * 0.05);
    } else {
      g.fillStyle(col, 0.9).fillCircle(p.x, ty - r * 0.25, r * 0.28);
    }
  }

  // --- the shot charging up, as a ring round the feet.
  if (o.charging >= 0) {
    const t = Math.min(1, o.charging);
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(
      new Phaser.Display.Color(255, 230, 60), new Phaser.Display.Color(255, 60, 40), 100, t * 100);
    g.lineStyle(Math.max(5, r * 0.26), Phaser.Display.Color.GetColor(col.r, col.g, col.b), 0.95);
    g.beginPath();
    g.arc(p.x, p.y + r * 0.42, r * 1.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
    g.strokePath();
  }

  if (stunned) {
    g.fillStyle(0xffe14d, 0.95);
    for (let k = 0; k < 3; k++) {
      const ang = o.timeMs / 180 + (k * Math.PI * 2) / 3;
      g.fillCircle(hx + Math.cos(ang) * headR * 1.3, headY - headR * 1.2 + Math.sin(ang) * headR * 0.3, r * 0.17);
    }
  }
}

/** Ears and limbs that belong behind the head and body. */
function drawBackParts(g: G, c: Character, x: number, headY: number, hr: number, bodyY: number, a: Anim): void {
  if (c.ears === 'tentacles') {
    for (const side of [-1, 1]) {
      for (let k = 1; k <= 2; k++) {
        const wob = Math.sin(a.phase * 0.8 + k * side) * hr * 0.25;
        const sx = x + side * hr * 0.5;
        const ex = x + side * (hr * 0.9 + k * hr * 0.42);
        g.lineStyle(Math.max(3, hr * 0.26), c.body, 1);
        g.beginPath();
        g.moveTo(sx, bodyY - hr * 0.1);
        g.lineTo((sx + ex) / 2, bodyY + hr * 0.35 + wob);
        g.lineTo(ex, bodyY + hr * 0.75 + wob * 0.5);
        g.strokePath();
      }
    }
    return;
  }
  if (c.ears === 'fin') {
    for (let k = 0; k < 3; k++) {
      const size = hr * (0.5 - k * 0.1);
      const fy = headY - hr * 0.2 + k * hr * 0.55;
      g.fillStyle(c.accent, 1).fillTriangle(x - size, fy + size, x + size, fy + size, x, fy - size * 0.9);
    }
  }
}

/** Ears, horns and antennae that sit on top of the head. */
function drawFrontParts(g: G, c: Character, x: number, y: number, hr: number, timeMs: number): void {
  switch (c.ears) {
    case 'cat':
      for (const side of [-1, 1]) {
        const bx = x + side * hr * 0.2;
        const tx = x + side * hr * 1.0;
        g.fillStyle(c.body, 1).fillTriangle(bx, y - hr * 0.78, tx, y - hr * 1.5, x + side * hr * 0.92, y - hr * 0.5);
        g.fillStyle(c.accent, 0.85).fillTriangle(
          bx + side * hr * 0.22, y - hr * 0.86, tx - side * hr * 0.1, y - hr * 1.28, x + side * hr * 0.76, y - hr * 0.62);
      }
      return;
    case 'antenna': {
      g.lineStyle(Math.max(2, hr * 0.12), c.trim, 1).lineBetween(x, y - hr * 0.8, x, y - hr * 1.7);
      const blink = 0.5 + 0.5 * Math.sin(timeMs / 220);
      g.fillStyle(c.accent, blink).fillCircle(x, y - hr * 1.78, hr * 0.24);
      return;
    }
    case 'horns':
      for (const side of [-1, 1]) {
        g.fillStyle(c.accent, 1).fillTriangle(
          x + side * hr * 0.42, y - hr * 0.82,
          x + side * hr * 1.0, y - hr * 1.42,
          x + side * hr * 0.86, y - hr * 0.62);
      }
      return;
    case 'frog':
      for (const side of [-1, 1]) {
        const ex = x + side * hr * 0.52;
        const ey = y - hr * 0.78;
        g.fillStyle(c.body, 1).fillCircle(ex, ey, hr * 0.42);
        g.lineStyle(Math.max(2, hr * 0.09), c.trim, 1).strokeCircle(ex, ey, hr * 0.42);
      }
  }
}

function drawPattern(g: G, c: Character, x: number, y: number, hr: number): void {
  switch (c.pattern) {
    case 'stripes':
      g.lineStyle(Math.max(2, hr * 0.12), c.trim, 0.75);
      for (const side of [-1, 1]) {
        for (const k of [0, 1]) {
          const sx = x + side * hr * (0.3 + k * 0.3);
          g.lineBetween(sx, y - hr * 0.72, sx + side * hr * 0.2, y - hr * 0.3);
        }
      }
      return;
    case 'bolts':
      g.fillStyle(c.trim, 0.85);
      for (const side of [-1, 1]) g.fillCircle(x + side * hr * 0.78, y + hr * 0.1, hr * 0.13);
      return;
    case 'spots':
      g.fillStyle(c.accent, 0.5);
      for (const [dx, dy, s] of [[-0.6, 0.35, 0.18], [0.58, 0.4, 0.15], [0.05, 0.72, 0.13]] as const) {
        g.fillCircle(x + dx * hr, y + dy * hr, hr * s);
      }
  }
}

function drawFace(g: G, c: Character, x: number, y: number, hr: number, p: Player, a: Anim, o: DrawOpts): void {
  const stunned = p.stunT > 0;
  const blinking = a.blink <= 0 && !stunned;
  const happy = a.celebrate > 0;
  // The head turns a little towards where the player is heading.
  const lx = clamp(p.fx, -1, 1) * hr * 0.26;
  const ly = clamp(p.fy, -1, 1) * hr * 0.18;
  const eyeY = y - hr * 0.06 + ly;
  const eyeGap = c.ears === 'frog' ? hr * 0.52 : hr * 0.36;
  const eyeR = c.eyes === 'big' ? hr * 0.3 : hr * 0.25;

  if (c.eyes === 'visor') {
    g.fillStyle(0x222b38, 1).fillRoundedRect(x - hr * 0.72 + lx, eyeY - hr * 0.26, hr * 1.44, hr * 0.52, hr * 0.22);
    if (stunned) {
      g.lineStyle(Math.max(2, hr * 0.1), c.accent, 0.9).lineBetween(x + lx, eyeY - hr * 0.2, x + lx, eyeY + hr * 0.2);
    } else {
      const glow = blinking ? 0.25 : 0.95;
      g.fillStyle(c.accent, glow).fillRoundedRect(
        x - hr * (happy ? 0.22 : 0.52) + lx, eyeY - hr * 0.09, hr * (happy ? 0.44 : 1.04), hr * 0.18, hr * 0.09);
    }
  } else {
    const eye = (side: number): void => {
      const ex = x + side * eyeGap + lx;
      const ey = c.ears === 'frog' ? y - hr * 0.78 + ly * 0.5 : eyeY;
      if (stunned) {
        g.lineStyle(Math.max(2, hr * 0.12), 0x222222, 1);
        const s = eyeR * 0.75;
        g.lineBetween(ex - s, ey - s, ex + s, ey + s);
        g.lineBetween(ex + s, ey - s, ex - s, ey + s);
        return;
      }
      g.fillStyle(0xffffff, 1).fillCircle(ex, ey, eyeR);
      if (blinking) {
        g.lineStyle(Math.max(2, hr * 0.1), 0x222222, 1).lineBetween(ex - eyeR, ey, ex + eyeR, ey);
        return;
      }
      if (happy) {
        g.lineStyle(Math.max(2, hr * 0.11), 0x222222, 1);
        g.beginPath();
        g.arc(ex, ey + eyeR * 0.3, eyeR * 0.85, Math.PI * 1.15, Math.PI * 1.85);
        g.strokePath();
        return;
      }
      const px = ex + clamp(p.fx, -1, 1) * eyeR * 0.3;
      const py = ey + clamp(p.fy, -1, 1) * eyeR * 0.3;
      g.fillStyle(0x111111, 1).fillCircle(px, py, eyeR * 0.5);
      g.fillStyle(0xffffff, 0.9).fillCircle(px - eyeR * 0.16, py - eyeR * 0.2, eyeR * 0.17);
    };
    eye(-1);
    eye(1);
    if (c.eyes === 'three' && !stunned) {
      const mx = x + lx;
      const my = y - hr * 0.5 + ly;
      g.fillStyle(0xffffff, 1).fillCircle(mx, my, eyeR * 0.72);
      if (!blinking) g.fillStyle(0x111111, 1).fillCircle(mx, my, eyeR * 0.36);
    }
    // Eyebrows: they carry the mood better than the mouth does.
    if (!stunned) {
      const frog = c.ears === 'frog';
      const browY = (frog ? y - hr * 1.26 : y - hr * 0.44) + ly * 0.6;
      const cross = o.charging >= 0;
      g.lineStyle(Math.max(2, hr * 0.13), c.trim, 0.95);
      for (const side of [-1, 1]) {
        const bx = x + side * eyeGap + lx;
        const inner = cross ? hr * 0.14 : happy ? -hr * 0.12 : -hr * 0.04;
        const outer = cross ? -hr * 0.08 : hr * 0.04;
        g.lineBetween(bx - side * eyeR * 0.85, browY + outer, bx + side * eyeR * 0.85, browY + inner);
      }
    }
  }

  // Mouth.
  const mx = x + lx * 0.8;
  const my = y + hr * 0.46 + ly * 0.6;
  if (stunned) {
    g.fillStyle(0x7a2f2f, 1).fillEllipse(mx, my, hr * 0.34, hr * 0.3);
    return;
  }
  if (happy) {
    g.fillStyle(0x7a2f2f, 1).fillEllipse(mx, my, hr * 0.6, hr * 0.48);
    g.fillStyle(0xffffff, 1).fillEllipse(mx, my - hr * 0.14, hr * 0.48, hr * 0.16);
    return;
  }
  if (o.charging >= 0 || a.speed > 300) {
    g.fillStyle(0x7a2f2f, 1).fillEllipse(mx, my, hr * 0.32, hr * 0.32);
    return;
  }
  g.lineStyle(Math.max(2, hr * 0.11), c.trim, 0.9);
  g.beginPath();
  g.arc(mx, my - hr * 0.14, hr * 0.3, Math.PI * 0.15, Math.PI * 0.85);
  g.strokePath();
}

/** A stand-in player, for drawing a character outside a match (menus). */
export function previewPlayer(charId: string, x: number, y: number, team: 0 | 1 = 0): Player {
  return {
    team, keeper: false, role: 'fwd', charId, speedMul: 1, powerMul: 1,
    // Looking at us, so the face shows in the menu.
    x, y, vx: 0, vy: 0, fx: 0, fy: 0.25,
    charge: -1, slideT: 0, slideCd: 0, kickCd: 0, stunT: 0, turboT: 0, giantT: 0, superSlide: false,
    prevShoot: false, prevSlide: false, prevSpecial: false,
    think: 0, aimErrX: 0, aimErrY: 0,
  };
}

// ------------------------------------------------------------------- ball

/** The last few places the ball was, so a fast shot leaves a streak. */
export function drawBallTrail(g: G, pts: { x: number; y: number }[], power: number): void {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const k = (i + 1) / n;
    g.fillStyle(power > 0.3 ? 0xff9f1c : 0xffffff, 0.3 * k);
    g.fillCircle(pts[i].x, pts[i].y, BALL_R * (0.3 + 0.62 * k));
  }
}

export function drawBall(g: G, x: number, y: number, spin: number, power: number, vx = 0, vy = 0): void {
  const sp = Math.hypot(vx, vy);
  const fast = Math.min(1, sp / 950);
  if (power > 0.3) {
    g.fillStyle(0xff9f1c, 0.35).fillCircle(x, y, BALL_R + 14);
    g.fillStyle(0xffe14d, 0.5).fillCircle(x, y, BALL_R + 7);
  }
  // The shadow drops away as the ball flies, which reads as speed.
  g.fillStyle(0x000000, 0.25 - fast * 0.08)
    .fillEllipse(x + 3 + fast * 5, y + 6 + fast * 6, BALL_R * 2.1, BALL_R * 1.5);
  if (fast < 0.06) {
    // Standing still: a plain circle, which is the cheapest thing to draw.
    g.fillStyle(0xffffff).fillCircle(x, y, BALL_R);
    g.lineStyle(2, 0x222222).strokeCircle(x, y, BALL_R);
  } else {
    // Travelling: stretched along the way it is going.
    g.save();
    g.translateCanvas(x, y);
    g.rotateCanvas(Math.atan2(vy, vx));
    const ew = BALL_R * 2 * (1 + fast * 0.55);
    const eh = BALL_R * 2 * (1 - fast * 0.22);
    g.fillStyle(0xffffff).fillEllipse(0, 0, ew, eh);
    g.lineStyle(2, 0x222222).strokeEllipse(0, 0, ew, eh);
    g.restore();
  }
  g.fillStyle(0x222222);
  for (let i = 0; i < 3; i++) {
    const ang = spin + (i * Math.PI * 2) / 3;
    g.fillCircle(x + Math.cos(ang) * 5.5, y + Math.sin(ang) * 5.5 * (1 - fast * 0.3), 2.8 * (1 - fast * 0.25));
  }
}

/** The net pushed out of shape by a goal: `k` runs from 1 down to 0. */
export function drawNetBulge(g: G, side: -1 | 1, k: number): void {
  if (k <= 0) return;
  const { goalTop, goalBottom, goalDepth, left, right } = F;
  const gx = side < 0 ? left : right;
  const wobble = 0.65 + 0.35 * Math.sin(k * 26);
  const push = 20 * k * wobble;
  g.fillStyle(0xffffff, 0.16 * k);
  g.fillEllipse(gx + side * (goalDepth * 0.6 + push * 0.5), (goalTop + goalBottom) / 2,
    goalDepth * 1.1 + push, (goalBottom - goalTop) * 0.8);
  g.lineStyle(2, 0xffffff, 0.75);
  for (let y = goalTop + 6; y < goalBottom; y += 13) {
    const bump = Math.sin((Math.PI * (y - goalTop)) / (goalBottom - goalTop));
    g.lineBetween(gx, y, gx + side * (goalDepth + push * bump), y);
  }
}

/** Streaks left on the grass by a slide, which fade away. */
export function drawSlideMark(g: G, x: number, y: number, fx: number, fy: number, k: number): void {
  const len = 54;
  const px = -fy;
  const py = fx;
  g.lineStyle(7, 0x2d5d33, 0.4 * k);
  for (const side of [-1, 1]) {
    const ox = px * side * 9;
    const oy = py * side * 9;
    g.lineBetween(x + ox - fx * len, y + oy - fy * len + 6, x + ox, y + oy + 6);
  }
}

export function drawPickup(g: G, x: number, y: number, timeMs: number): void {
  const pulse = 1 + Math.sin(timeMs / 140) * 0.12;
  const spin = timeMs / 400;
  g.fillStyle(0x000000, 0.2).fillEllipse(x + 3, y + 10, 42, 20);
  g.fillStyle(0xffe14d, 0.3).fillCircle(x, y, 28 * pulse);
  // A five-pointed star, turning slowly.
  const pts: Phaser.Geom.Point[] = [];
  for (let i = 0; i < 10; i++) {
    const ang = spin + (i * Math.PI) / 5 - Math.PI / 2;
    const rad = (i % 2 === 0 ? 19 : 8.5) * pulse;
    pts.push(new Phaser.Geom.Point(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad));
  }
  g.fillStyle(0xffe14d, 1).fillPoints(pts, true);
  g.lineStyle(3, 0xffffff, 0.9).strokeCircle(x, y, 20 * pulse);
}

// ------------------------------------------------------------------ pitch

/** Same crowd every time, so it never flickers. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const CROWD = [0xff6b6b, 0xffd23f, 0x4ec76a, 0x58d6ff, 0xb05cff, 0xffffff, 0xff9f1c, 0xf26ab0];
const BOARDS = [0x2f7bff, 0xffd23f, 0xe8524a, 0xffffff, 0x4ec76a];
const RAINBOW = [0xff5d5d, 0xffa23f, 0xffe14d, 0x6fe06f, 0x58d6ff, 0x8f7bff, 0xf07be0];

/** Whatever stands behind each goal: a crowd, castle walls, clouds, the sea. */
function drawStand(g: G, t: Pitch, sx: number, depth: number, side: number, rand: () => number): void {
  const { top, bottom } = F;
  const h = bottom - top + 80;
  const y0 = top - 40;
  switch (t.decor) {
    case 'crowd': {
      const cols = Math.floor(depth / 17);
      const rows = Math.floor(h / 17);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < rows; j++) {
          if (rand() < 0.18) continue;
          g.fillStyle(CROWD[Math.floor(rand() * CROWD.length)], 0.75)
            .fillCircle(sx + 9 + i * 17 + (j % 2) * 4, y0 + 8 + j * 17, 5);
        }
      }
      return;
    }
    case 'castle': {
      // Stone blocks, a row of battlements along the top, banners and torches.
      const bw = 56;
      const bh = 30;
      for (let j = 0; j * bh < h; j++) {
        for (let i = -1; i * bw < depth + bw; i++) {
          const bx = sx + i * bw + (j % 2) * (bw / 2);
          g.fillStyle(j % 2 === 0 ? 0x565668 : 0x4e4e5f, 1)
            .fillRect(bx + 2, y0 + j * bh + 2, bw - 4, bh - 4);
        }
      }
      const inner = side < 0 ? sx + depth : sx;
      for (let j = 0; j * 46 < h; j++) {
        if (j % 2) continue;
        g.fillStyle(0x6b6b80, 1).fillRect(side < 0 ? inner - 26 : inner, y0 + j * 46, 26, 46);
      }
      for (const by of [top + 60, bottom - 120]) {
        const bx = side < 0 ? sx + depth - 92 : sx + 56;
        g.fillStyle(by === top + 60 ? 0xc0392b : 0x2f5fbf, 1).fillRect(bx, by, 40, 86);
        g.fillStyle(0xffe14d, 1).fillTriangle(bx, by + 86, bx + 40, by + 86, bx + 20, by + 108);
        g.fillStyle(0xffffff, 0.9).fillCircle(bx + 20, by + 34, 11);
      }
      for (const ty of [top + 10, bottom + 10]) {
        const tx = side < 0 ? sx + depth - 40 : sx + 40;
        g.fillStyle(0x3a2a1a, 1).fillRect(tx - 5, ty, 10, 34);
        g.fillStyle(0xff9f1c, 0.45).fillCircle(tx, ty - 6, 22);
        g.fillStyle(0xffe14d, 1).fillCircle(tx, ty - 6, 11);
      }
      return;
    }
    case 'rainbow': {
      // Clouds and a few stars, as if the pitch floated in the sky.
      for (let i = 0; i < 5; i++) {
        const cx = sx + 40 + rand() * Math.max(20, depth - 80);
        const cy = y0 + 40 + rand() * (h - 80);
        const s = 20 + rand() * 16;
        g.fillStyle(0xffffff, 0.95);
        g.fillCircle(cx, cy, s);
        g.fillCircle(cx - s * 0.9, cy + s * 0.2, s * 0.7);
        g.fillCircle(cx + s * 0.95, cy + s * 0.15, s * 0.75);
        g.fillCircle(cx + s * 0.1, cy - s * 0.6, s * 0.6);
      }
      for (let i = 0; i < 14; i++) {
        const cx = sx + 10 + rand() * Math.max(20, depth - 20);
        const cy = y0 + 10 + rand() * (h - 20);
        g.fillStyle(0xffe14d, 0.9);
        g.fillTriangle(cx, cy - 7, cx - 6, cy + 5, cx + 6, cy + 5);
        g.fillTriangle(cx, cy + 7, cx - 6, cy - 5, cx + 6, cy - 5);
      }
      return;
    }
    case 'beach': {
      // The sea, with little waves, and parasols along the sand.
      for (let j = 0; j * 26 < h; j++) {
        const wy = y0 + 13 + j * 26;
        g.lineStyle(3, 0xffffff, 0.35);
        for (let i = 0; i * 54 < depth; i++) {
          const wx = sx + i * 54 + (j % 2) * 27;
          g.beginPath();
          g.arc(wx + 14, wy, 14, Math.PI, 0);
          g.strokePath();
        }
      }
      for (const py of [top + 70, bottom - 90]) {
        const px = side < 0 ? sx + depth - 56 : sx + 56;
        g.fillStyle(0x000000, 0.18).fillEllipse(px + 6, py + 40, 56, 18);
        g.fillStyle(0xf2f2f2, 1).fillRect(px - 3, py, 6, 44);
        for (let k = 0; k < 6; k++) {
          const a0 = Math.PI + (k * Math.PI) / 6;
          const a1 = Math.PI + ((k + 1) * Math.PI) / 6;
          g.fillStyle(k % 2 === 0 ? 0xff5d5d : 0xffffff, 1);
          g.fillTriangle(px, py, px + Math.cos(a0) * 46, py + Math.sin(a0) * 26,
            px + Math.cos(a1) * 46, py + Math.sin(a1) * 26);
        }
      }
    }
  }
}

/** The strips just outside the touchlines. */
function drawTouchlines(g: G, t: Pitch, rand: () => number): void {
  const { left, right, top, bottom } = F;
  switch (t.decor) {
    case 'crowd':
      for (let i = 0; i * 118 < right - left; i++) {
        const bx = left + i * 118;
        const bw = Math.min(110, right - bx);
        if (bw < 20) break;
        g.fillStyle(BOARDS[i % BOARDS.length], 0.9).fillRect(bx, top - 26, bw, 18);
        g.fillStyle(BOARDS[(i + 2) % BOARDS.length], 0.9).fillRect(bx, bottom + 6, bw, 14);
      }
      break;
    case 'castle':
      for (let i = 0; i * 62 < right - left; i++) {
        const bx = left + i * 62;
        const bw = Math.min(58, right - bx);
        if (bw < 12) break;
        g.fillStyle(i % 2 === 0 ? 0x565668 : 0x474757, 1).fillRect(bx, top - 28, bw, 20);
        g.fillStyle(i % 2 === 0 ? 0x474757 : 0x565668, 1).fillRect(bx, bottom + 6, bw, 16);
      }
      break;
    case 'rainbow':
      for (let i = 0; i * 48 < right - left; i++) {
        const bx = left + i * 48;
        const bw = Math.min(46, right - bx);
        if (bw < 10) break;
        g.fillStyle(RAINBOW[i % RAINBOW.length], 0.95).fillRect(bx, top - 28, bw, 20);
        g.fillStyle(RAINBOW[(i + 3) % RAINBOW.length], 0.95).fillRect(bx, bottom + 6, bw, 16);
      }
      break;
    case 'beach':
      g.fillStyle(0xe8c87e, 1).fillRect(left - 10, top - 30, right - left + 20, 22);
      g.fillStyle(0xe8c87e, 1).fillRect(left - 10, bottom + 6, right - left + 20, 18);
      for (let i = 0; i < 40; i++) {
        const sx2 = left + rand() * (right - left);
        const sy = rand() < 0.5 ? top - 20 : bottom + 15;
        g.fillStyle(rand() < 0.5 ? 0xffffff : 0xff9f9f, 0.9).fillCircle(sx2, sy, 3.5);
      }
      break;
  }
}

export function drawStadium(g: G, viewW: number, themeId?: string): void {
  const t = pitchById(themeId);
  const { left, right, top, bottom, goalTop, goalBottom, goalDepth } = F;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const rand = seeded(20261113);
  // The view can be wider than the pitch; fill well past both ends.
  const x0 = -(viewW - F.w) / 2 - 200;
  const x1 = F.w + (viewW - F.w) / 2 + 200;

  g.fillStyle(t.surround).fillRect(x0, -300, x1 - x0, F.h + 600);

  // Behind each goal, where there is room on a wide screen.
  for (const side of [-1, 1]) {
    const edge = side < 0 ? left - goalDepth - 26 : right + goalDepth + 26;
    const depth = side < 0 ? edge - x0 : x1 - edge;
    if (depth < 70) continue;
    const sx = side < 0 ? x0 : edge;
    g.fillStyle(t.stand).fillRect(sx, top - 40, depth, bottom - top + 80);
    drawStand(g, t, sx, depth, side, rand);
    g.fillStyle(0x000000, 0.3).fillRect(side < 0 ? edge - 10 : edge, top - 40, 10, bottom - top + 80);
  }

  drawTouchlines(g, t, rand);
  g.fillStyle(0x000000, 0.3).fillRect(left - 6, top - 32, right - left + 12, 5);
  g.fillStyle(0x000000, 0.3).fillRect(left - 6, bottom + 22, right - left + 12, 4);

  // Grass, mowed in stripes, lighter towards the middle.
  const stripes = 10;
  const sw = (right - left) / stripes;
  for (let i = 0; i < stripes; i++) {
    const col = t.stripes ? t.stripes[i % t.stripes.length] : (i % 2 === 0 ? t.grassA : t.grassB);
    g.fillStyle(col).fillRect(left + i * sw, top, sw, bottom - top);
  }
  g.fillStyle(0xffffff, 0.1).fillEllipse(midX, midY, (right - left) * 0.8, (bottom - top) * 0.85);

  // Grass texture: short blades, always in the same places.
  for (let i = 0; i < 520; i++) {
    const bx = left + rand() * (right - left);
    const by = top + rand() * (bottom - top);
    g.fillStyle(rand() < 0.5 ? 0xffffff : 0x000000, 0.05).fillRect(bx, by, 3 + rand() * 6, 2);
  }
  // Pools of light, and edges a touch darker, so the pitch has some depth.
  for (const cx of [left + (right - left) * 0.24, right - (right - left) * 0.24]) {
    g.fillStyle(0xffffff, 0.05).fillEllipse(cx, midY, (right - left) * 0.5, (bottom - top) * 0.95);
  }
  for (let i = 0; i < 7; i++) {
    g.lineStyle(14, 0x000000, 0.035);
    g.strokeRect(left + i * 7, top + i * 7, right - left - i * 14, bottom - top - i * 14);
  }

  // Markings.
  g.lineStyle(5, t.line, t.lineAlpha);
  g.strokeRect(left, top, right - left, bottom - top);
  g.lineBetween(midX, top, midX, bottom);
  g.strokeCircle(midX, midY, 85);
  g.fillStyle(t.line, t.lineAlpha).fillCircle(midX, midY, 7);

  for (const side of [-1, 1]) {
    const gx = side < 0 ? left : right;
    g.lineStyle(5, t.line, t.lineAlpha);
    g.strokeRect(side < 0 ? gx : gx - 160, midY - 175, 160, 350);
    g.strokeRect(side < 0 ? gx : gx - 60, midY - 102, 60, 204);
    // Penalty spot and the arc at the edge of the box.
    g.fillStyle(t.line, t.lineAlpha).fillCircle(gx + side * 112, midY, 5);
    g.beginPath();
    g.arc(gx + side * 112, midY, 62, side < 0 ? -Math.PI / 3 : Math.PI * 2 / 3, side < 0 ? Math.PI / 3 : Math.PI * 4 / 3);
    g.strokePath();

    // Goal: net mesh, then a thick frame.
    const nx = side < 0 ? gx - goalDepth : gx;
    g.fillStyle(0xffffff, 0.2).fillRect(nx, goalTop, goalDepth, goalBottom - goalTop);
    g.lineStyle(1.5, 0xffffff, 0.5);
    for (let x = nx; x <= nx + goalDepth + 0.1; x += goalDepth / 5) g.lineBetween(x, goalTop, x, goalBottom);
    for (let y = goalTop; y <= goalBottom + 0.1; y += 13) g.lineBetween(nx, y, nx + goalDepth, y);
    g.lineStyle(7, 0xffffff, 1);
    const back = side < 0 ? gx - goalDepth : gx + goalDepth;
    g.lineBetween(gx, goalTop, back, goalTop);
    g.lineBetween(back, goalTop, back, goalBottom);
    g.lineBetween(back, goalBottom, gx, goalBottom);
    g.fillStyle(0xffffff).fillCircle(gx, goalTop, 8).fillCircle(gx, goalBottom, 8);

    // Corner flags, with a quarter arc of grass marking.
    for (const vy of [top, bottom]) {
      const up = vy === top ? -1 : 1;          // which way the pole leans off the pitch
      const a0 = vy === top
        ? (side < 0 ? 0 : Math.PI / 2)
        : (side < 0 ? -Math.PI / 2 : Math.PI);
      g.lineStyle(4, t.line, 0.85);
      g.beginPath();
      g.arc(gx, vy, 16, a0, a0 + Math.PI / 2);
      g.strokePath();
      const tipY = vy + up * 26;
      g.lineStyle(3, 0xf2f2f2, 1).lineBetween(gx, vy, gx, tipY);
      g.fillStyle(0xffd23f, 1).fillTriangle(gx, tipY, gx + side * 16, tipY - up * 5, gx, tipY - up * 12);
    }
  }
}
