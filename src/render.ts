import Phaser from 'phaser';
import type { Character } from './characters';
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

/**
 * One character, built from circles and triangles only: no image to download,
 * and it stays crisp at any size (a giant keeper is the same drawing, bigger).
 */
export function drawCharacter(g: G, p: Player, c: Character, o: DrawOpts): void {
  const r = o.radius;
  const a = o.anim;
  const fx = p.fx;
  const fy = p.fy;
  const px = -fy;
  const py = fx;
  const hop = a.celebrate > 0 ? Math.abs(Math.sin(o.timeMs / 90)) * r * 0.45 : 0;
  const cx = p.x;
  const cy = p.y - hop;
  // Place a point relative to the character: forward along the facing, side across it.
  const at = (fwd: number, side: number): [number, number] => [
    cx + fx * fwd + px * side,
    cy + fy * fwd + py * side,
  ];

  const running = a.speed > 40;
  const stunned = p.stunT > 0;

  // Shadow stays on the ground even when the character jumps.
  g.fillStyle(0x000000, 0.25).fillEllipse(p.x + 3, p.y + r * 0.55, r * 2.3, r * 1.15);

  // Feet, swinging when running.
  const swing = running ? Math.sin(a.phase) * r * 0.42 : 0;
  for (const side of [-1, 1]) {
    const [fxp, fyp] = at(swing * side - r * 0.1, side * r * 0.6);
    g.fillStyle(c.trim, 1).fillEllipse(fxp, fyp, r * 0.52, r * 0.42);
  }

  // Jersey: the team colour, read from across the pitch.
  const jersey = o.jersey !== false;
  const squash = stunned ? 1.1 : 1 + Math.min(0.12, a.speed / 4000);
  g.fillStyle(jersey ? TEAM_TINT[p.team] : c.trim, 1);
  if (p.slideT > 0) {
    g.fillEllipse(cx, cy, r * 2.64 * (1 + Math.abs(fx) * 0.35), r * 2.64 * (1 + Math.abs(fy) * 0.35));
  } else {
    g.fillEllipse(cx, cy, r * 2.64 * squash, r * 2.64 / squash);
  }
  g.lineStyle(3, jersey ? TEAM_DARK[p.team] : c.trim, 1).strokeCircle(cx, cy, r * 1.32);
  if (jersey) {
    // A couple of shirt stripes at the back.
    g.lineStyle(Math.max(2, r * 0.13), TEAM_DARK[p.team], 0.55);
    for (const k of [-0.45, 0.1]) {
      const [sx, sy] = at(-r * 1.0 + k * r * 0.2, -r * 1.25);
      const [ex, ey] = at(-r * 1.0 + k * r * 0.2, r * 1.25);
      g.lineBetween(sx, sy, ex, ey);
    }
  }

  if (p.keeper) {
    g.lineStyle(Math.max(3, r * 0.12), 0xffe14d, 0.95).strokeCircle(cx, cy, r * 1.32);
  }

  drawEars(g, c, r, at, a, o.timeMs, true);
  // Head.
  g.fillStyle(c.body, 1).fillCircle(cx, cy, r);
  g.lineStyle(Math.max(2, r * 0.1), c.trim, 1).strokeCircle(cx, cy, r);
  drawPattern(g, c, r, at);
  drawEars(g, c, r, at, a, o.timeMs, false);
  drawFace(g, c, r, at, p, a, o);

  // Who is who.
  if (o.controlled) {
    g.lineStyle(Math.max(4, r * 0.2), 0xffe14d, 0.95).strokeCircle(cx, cy, r * 1.75);
    g.fillStyle(0xffe14d, 0.95);
    const ty = cy - r * 2.1;
    g.fillTriangle(cx - r * 0.55, ty - r * 0.6, cx + r * 0.55, ty - r * 0.6, cx, ty + r * 0.1);
  } else if (o.otherHuman) {
    g.lineStyle(Math.max(4, r * 0.2), 0x58d6ff, 0.9).strokeCircle(cx, cy, r * 1.75);
    g.fillStyle(0x58d6ff, 0.9).fillCircle(cx, cy - r * 2.1, r * 0.3);
  }

  if (o.charging >= 0) {
    const t = Math.min(1, o.charging);
    const col = Phaser.Display.Color.Interpolate.ColorWithColor(
      new Phaser.Display.Color(255, 230, 60), new Phaser.Display.Color(255, 60, 40), 100, t * 100);
    g.lineStyle(Math.max(5, r * 0.3), Phaser.Display.Color.GetColor(col.r, col.g, col.b), 0.95);
    g.beginPath();
    g.arc(cx, cy, r * 2.1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
    g.strokePath();
  }

  if (stunned) {
    g.fillStyle(0xffe14d, 0.95);
    for (let k = 0; k < 3; k++) {
      const ang = o.timeMs / 180 + (k * Math.PI * 2) / 3;
      g.fillCircle(cx + Math.cos(ang) * r * 1.5, cy - r * 1.5 + Math.sin(ang) * r * 0.3, r * 0.18);
    }
  }
}

type At = (fwd: number, side: number) => [number, number];

function drawEars(g: G, c: Character, r: number, at: At, a: Anim, timeMs: number, behind: boolean): void {
  switch (c.ears) {
    case 'cat': {
      if (behind) return;
      for (const side of [-1, 1]) {
        const [bx, by] = at(r * 0.15, side * r * 0.82);
        const [tx, ty] = at(r * 0.5, side * r * 1.25);
        const [ox, oy] = at(-r * 0.35, side * r * 0.72);
        g.fillStyle(c.body, 1).fillTriangle(bx, by, tx, ty, ox, oy);
        g.fillStyle(c.accent, 0.8).fillTriangle(
          (bx + tx) / 2, (by + ty) / 2, tx, ty, (ox + tx) / 2, (oy + ty) / 2);
      }
      return;
    }
    case 'antenna': {
      if (behind) return;
      const [bx, by] = at(r * 0.1, 0);
      const [tx, ty] = at(r * 0.1, -r * 1.55);
      g.lineStyle(Math.max(2, r * 0.11), c.trim, 1).lineBetween(bx, by, tx, ty);
      const blink = 0.55 + 0.45 * Math.sin(timeMs / 220);
      g.fillStyle(c.accent, blink).fillCircle(tx, ty, r * 0.22);
      return;
    }
    case 'horns': {
      if (behind) return;
      for (const side of [-1, 1]) {
        const [bx, by] = at(r * 0.3, side * r * 0.66);
        const [tx, ty] = at(r * 0.95, side * r * 1.0);
        const [ox, oy] = at(r * 0.1, side * r * 0.95);
        g.fillStyle(c.accent, 1).fillTriangle(bx, by, tx, ty, ox, oy);
      }
      return;
    }
    case 'frog': {
      // Bulging eye mounts, drawn before the head so they peek over the top.
      if (!behind) return;
      for (const side of [-1, 1]) {
        const [ex, ey] = at(r * 0.52, side * r * 0.62);
        g.fillStyle(c.body, 1).fillCircle(ex, ey, r * 0.46);
        g.lineStyle(Math.max(2, r * 0.09), c.trim, 1).strokeCircle(ex, ey, r * 0.46);
      }
      return;
    }
    case 'tentacles': {
      if (!behind) return;
      for (let k = -2; k <= 2; k++) {
        if (k === 0) continue;
        const wob = Math.sin(a.phase * 0.8 + k) * r * 0.3;
        const [sx, sy] = at(-r * 0.5, k * r * 0.45);
        const [mx, my] = at(-r * 1.1, k * r * 0.62 + wob * 0.5);
        const [ex, ey] = at(-r * 1.6, k * r * 0.7 + wob);
        g.lineStyle(Math.max(3, r * 0.22), c.body, 1);
        g.beginPath();
        g.moveTo(sx, sy);
        g.lineTo(mx, my);
        g.lineTo(ex, ey);
        g.strokePath();
        g.fillStyle(c.accent, 0.9).fillCircle(ex, ey, r * 0.12);
      }
      return;
    }
    case 'fin': {
      if (!behind) return;
      for (let k = 0; k < 3; k++) {
        const base = -r * 0.5 - k * r * 0.42;
        const size = r * (0.42 - k * 0.07);
        const [bx, by] = at(base, -size);
        const [tx, ty] = at(base + size * 0.9, 0);
        const [ox, oy] = at(base, size);
        g.fillStyle(c.accent, 1).fillTriangle(bx, by, tx, ty, ox, oy);
      }
    }
  }
}

function drawPattern(g: G, c: Character, r: number, at: At): void {
  switch (c.pattern) {
    case 'stripes':
      g.lineStyle(Math.max(2, r * 0.11), c.trim, 0.8);
      for (const side of [-1, 1]) {
        for (const k of [0.1, -0.25]) {
          const [sx, sy] = at(r * (0.2 + k), side * r * 0.5);
          const [ex, ey] = at(r * (0.05 + k), side * r * 0.92);
          g.lineBetween(sx, sy, ex, ey);
        }
      }
      return;
    case 'bolts': {
      g.fillStyle(c.trim, 0.85);
      for (const side of [-1, 1]) {
        const [bx, by] = at(-r * 0.45, side * r * 0.62);
        g.fillCircle(bx, by, r * 0.13);
      }
      const [lx, ly] = at(-r * 0.75, 0);
      g.fillCircle(lx, ly, r * 0.12);
      return;
    }
    case 'spots':
      g.fillStyle(c.accent, 0.55);
      for (const [f, s] of [[-0.35, -0.5], [-0.55, 0.3], [-0.1, 0.65]] as const) {
        const [sx, sy] = at(r * f, r * s);
        g.fillCircle(sx, sy, r * 0.17);
      }
  }
}

function drawFace(g: G, c: Character, r: number, at: At, p: Player, a: Anim, o: DrawOpts): void {
  const stunned = p.stunT > 0;
  const blinking = a.blink <= 0 && !stunned;
  const happy = a.celebrate > 0;
  const eyeFwd = c.ears === 'frog' ? r * 0.52 : r * 0.34;
  const eyeSide = c.ears === 'frog' ? r * 0.62 : r * 0.4;
  const eyeR = c.eyes === 'big' ? r * 0.3 : r * 0.26;

  const eye = (side: number): void => {
    const [ex, ey] = at(eyeFwd, side * eyeSide);
    if (stunned) {
      g.lineStyle(Math.max(2, r * 0.12), 0x222222, 1);
      const s = eyeR * 0.8;
      g.lineBetween(ex - s, ey - s, ex + s, ey + s);
      g.lineBetween(ex + s, ey - s, ex - s, ey + s);
      return;
    }
    g.fillStyle(0xffffff, 1).fillCircle(ex, ey, eyeR);
    if (blinking) {
      g.lineStyle(Math.max(2, r * 0.1), 0x222222, 1).lineBetween(ex - eyeR, ey, ex + eyeR, ey);
      return;
    }
    if (happy) {
      // Smiling eyes: an upward arc instead of a pupil.
      g.lineStyle(Math.max(2, r * 0.11), 0x222222, 1);
      g.beginPath();
      g.arc(ex, ey + eyeR * 0.25, eyeR * 0.8, Math.PI * 1.15, Math.PI * 1.85);
      g.strokePath();
      return;
    }
    const [px2, py2] = at(eyeFwd + eyeR * 0.45, side * eyeSide);
    g.fillStyle(0x111111, 1).fillCircle(px2, py2, eyeR * 0.52);
    g.fillStyle(0xffffff, 0.9).fillCircle(px2 - eyeR * 0.15, py2 - eyeR * 0.2, eyeR * 0.17);
  };

  if (c.eyes === 'visor') {
    const [vx, vy] = at(r * 0.34, 0);
    g.fillStyle(0x222b38, 1).fillEllipse(vx, vy, r * 1.3, r * 0.6);
    if (!stunned) {
      const glow = blinking ? 0.25 : 0.95;
      const [gx, gy] = at(r * 0.38, 0);
      g.fillStyle(c.accent, glow).fillEllipse(gx, gy, r * (happy ? 0.5 : 0.95), r * 0.2);
    } else {
      g.lineStyle(Math.max(2, r * 0.1), c.accent, 0.9);
      const [sx, sy] = at(r * 0.38, -r * 0.4);
      const [ex, ey] = at(r * 0.38, r * 0.4);
      g.lineBetween(sx, sy, ex, ey);
    }
  } else if (c.eyes === 'three') {
    eye(-1);
    eye(1);
    const [mx, my] = at(r * 0.62, 0);
    if (!stunned) {
      g.fillStyle(0xffffff, 1).fillCircle(mx, my, eyeR * 0.75);
      if (!blinking) g.fillStyle(0x111111, 1).fillCircle(mx, my, eyeR * 0.38);
    }
  } else {
    eye(-1);
    eye(1);
  }

  // Mouth.
  const [mx, my] = at(r * (c.eyes === 'visor' ? 0.82 : 0.72), 0);
  if (stunned) {
    g.fillStyle(0x7a2f2f, 1).fillEllipse(mx, my, r * 0.34, r * 0.3);
    return;
  }
  if (happy) {
    g.fillStyle(0x7a2f2f, 1).fillEllipse(mx, my, r * 0.62, r * 0.5);
    g.fillStyle(0xffffff, 1).fillEllipse(mx, my - r * 0.14, r * 0.5, r * 0.16);
    return;
  }
  if (o.charging >= 0 || a.speed > 300) {
    g.fillStyle(0x7a2f2f, 1).fillEllipse(mx, my, r * 0.34, r * 0.34);
    return;
  }
  g.lineStyle(Math.max(2, r * 0.11), c.trim, 0.9);
  g.beginPath();
  g.arc(mx, my - r * 0.12, r * 0.28, Math.PI * 0.15, Math.PI * 0.85);
  g.strokePath();
}

/** A stand-in player, for drawing a character outside a match (menus). */
export function previewPlayer(charId: string, x: number, y: number, team: 0 | 1 = 0): Player {
  return {
    team, keeper: false, role: 'fwd', charId, speedMul: 1, powerMul: 1,
    // Facing up, so ears, horns and antennae show above the head.
    x, y, vx: 0, vy: 0, fx: 0, fy: -1,
    charge: -1, slideT: 0, slideCd: 0, kickCd: 0, stunT: 0, turboT: 0, giantT: 0, superSlide: false,
    prevShoot: false, prevSlide: false, prevSpecial: false,
    think: 0, aimErrX: 0, aimErrY: 0,
  };
}

// ------------------------------------------------------------------- ball

export function drawBall(g: G, x: number, y: number, spin: number, power: number): void {
  if (power > 0.3) {
    g.fillStyle(0xff9f1c, 0.35).fillCircle(x, y, BALL_R + 14);
    g.fillStyle(0xffe14d, 0.5).fillCircle(x, y, BALL_R + 7);
  }
  g.fillStyle(0x000000, 0.25).fillEllipse(x + 3, y + 6, BALL_R * 2.1, BALL_R * 1.5);
  g.fillStyle(0xffffff).fillCircle(x, y, BALL_R);
  g.lineStyle(2, 0x222222).strokeCircle(x, y, BALL_R);
  g.fillStyle(0x222222);
  for (let i = 0; i < 3; i++) {
    const ang = spin + (i * Math.PI * 2) / 3;
    g.fillCircle(x + Math.cos(ang) * 5.5, y + Math.sin(ang) * 5.5, 2.8);
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

export function drawStadium(g: G, viewW: number): void {
  const { left, right, top, bottom, goalTop, goalBottom, goalDepth } = F;
  const midX = (left + right) / 2;
  const midY = (top + bottom) / 2;
  const rand = seeded(20261113);
  // The view can be wider than the pitch; fill well past both ends.
  const x0 = -(viewW - F.w) / 2 - 200;
  const x1 = F.w + (viewW - F.w) / 2 + 200;

  g.fillStyle(0x15351f).fillRect(x0, -300, x1 - x0, F.h + 600);

  // Crowd behind each goal, where there is room on a wide screen.
  for (const side of [-1, 1]) {
    const edge = side < 0 ? left - goalDepth - 26 : right + goalDepth + 26;
    const depth = side < 0 ? edge - x0 : x1 - edge;
    if (depth < 70) continue;
    const sx = side < 0 ? x0 : edge;
    g.fillStyle(0x24402c).fillRect(sx, top - 40, depth, bottom - top + 80);
    const cols = Math.floor(depth / 17);
    const rows = Math.floor((bottom - top + 80) / 17);
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        if (rand() < 0.18) continue;
        const cx = sx + 9 + i * 17 + (j % 2) * 4;
        const cy = top - 32 + j * 17;
        g.fillStyle(CROWD[Math.floor(rand() * CROWD.length)], 0.75).fillCircle(cx, cy, 5);
      }
    }
    // Barrier in front of the stand.
    g.fillStyle(0x0e2817).fillRect(side < 0 ? edge - 10 : edge, top - 40, 10, bottom - top + 80);
  }

  // Advertising boards along both touchlines.
  for (let i = 0; i * 118 < right - left; i++) {
    const bx = left + i * 118;
    const bw = Math.min(110, right - bx);
    if (bw < 20) break;
    g.fillStyle(BOARDS[i % BOARDS.length], 0.9).fillRect(bx, top - 26, bw, 18);
    g.fillStyle(BOARDS[(i + 2) % BOARDS.length], 0.9).fillRect(bx, bottom + 6, bw, 14);
  }
  g.fillStyle(0x0e2817).fillRect(left - 6, top - 30, right - left + 12, 5);
  g.fillStyle(0x0e2817).fillRect(left - 6, bottom + 21, right - left + 12, 4);

  // Grass, mowed in stripes, lighter towards the middle.
  const stripes = 10;
  const sw = (right - left) / stripes;
  for (let i = 0; i < stripes; i++) {
    g.fillStyle(i % 2 === 0 ? 0x3fae52 : 0x37a04a).fillRect(left + i * sw, top, sw, bottom - top);
  }
  g.fillStyle(0x48b85c, 0.22).fillEllipse(midX, midY, (right - left) * 0.8, (bottom - top) * 0.85);

  // Markings.
  g.lineStyle(5, 0xffffff, 0.92);
  g.strokeRect(left, top, right - left, bottom - top);
  g.lineBetween(midX, top, midX, bottom);
  g.strokeCircle(midX, midY, 85);
  g.fillStyle(0xffffff, 0.92).fillCircle(midX, midY, 7);

  for (const side of [-1, 1]) {
    const gx = side < 0 ? left : right;
    g.lineStyle(5, 0xffffff, 0.92);
    g.strokeRect(side < 0 ? gx : gx - 160, midY - 175, 160, 350);
    g.strokeRect(side < 0 ? gx : gx - 60, midY - 102, 60, 204);
    // Penalty spot and the arc at the edge of the box.
    g.fillStyle(0xffffff, 0.92).fillCircle(gx + side * 112, midY, 5);
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
      g.lineStyle(4, 0xffffff, 0.85);
      g.beginPath();
      g.arc(gx, vy, 16, a0, a0 + Math.PI / 2);
      g.strokePath();
      const tipY = vy + up * 26;
      g.lineStyle(3, 0xf2f2f2, 1).lineBetween(gx, vy, gx, tipY);
      g.fillStyle(0xffd23f, 1).fillTriangle(gx, tipY, gx + side * 16, tipY - up * 5, gx, tipY - up * 12);
    }
  }
}
