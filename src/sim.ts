// Pure game simulation: no rendering, no browser APIs.
// The same step() will run on the host device in online play, so everything
// that decides the outcome of a match lives here and only here.

export const F = {
  w: 1280,
  h: 720,
  left: 80,
  right: 1200,
  top: 60,
  bottom: 660,
  goalTop: 280,
  goalBottom: 440,
  goalDepth: 46,
};

export const BALL_R = 11;
export const PLAYER_R = 22;
export const CHARGE_MAX = 0.6;
export const STEP = 1 / 60;

const MAX_SPEED = 275;
const ACCEL = 2300;
const CHARGE_SLOWDOWN = 0.7;
const SLIDE_SPEED = 600;
const SLIDE_TIME = 0.3;
const SLIDE_CD = 0.9;
const KICK_MIN = 600;
const KICK_MAX = 1020;
const KICK_CD = 0.3;
const BALL_DRAG = 0.9;
const BALL_MAX = 1150;
const NET_DRAG = 9;
const WALL_BOUNCE = 0.72;
const NET_BOUNCE = 0.12;
const POST_R = 7;
const KEEPER_SPEED = 205;
const GOAL_PAUSE = 2.4;
// How far outside the goal mouth a shot may point and still be bent on target.
const AIM_ASSIST_MARGIN = 150;

export interface PlayerInput {
  mx: number;
  my: number;
  shoot: boolean;
  slide: boolean;
}

export const NO_INPUT: PlayerInput = { mx: 0, my: 0, shoot: false, slide: false };

export interface Player {
  team: 0 | 1;
  keeper: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Facing direction, unit vector.
  fx: number;
  fy: number;
  // Seconds the shot has been charged, -1 when not charging.
  charge: number;
  slideT: number;
  slideCd: number;
  kickCd: number;
  prevShoot: boolean;
  prevSlide: boolean;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Index of the player dribbling the ball, -1 when free.
  owner: number;
  spin: number;
}

export type SimEvent =
  | { type: 'kick'; power: number; x: number; y: number }
  | { type: 'bounce'; x: number; y: number }
  | { type: 'save'; x: number; y: number }
  | { type: 'slide'; x: number; y: number }
  | { type: 'goal'; team: 0 | 1; x: number; y: number };

export interface GameState {
  players: Player[];
  ball: Ball;
  score: [number, number];
  phase: 'play' | 'goal';
  phaseT: number;
  events: SimEvent[];
}

function makePlayer(team: 0 | 1, keeper: boolean): Player {
  return {
    team, keeper, x: 0, y: 0, vx: 0, vy: 0, fx: team === 0 ? 1 : -1, fy: 0,
    charge: -1, slideT: 0, slideCd: 0, kickCd: 0, prevShoot: false, prevSlide: false,
  };
}

export function createState(): GameState {
  const state: GameState = {
    // Player 0 is the human. Player 1 is the opposing goalkeeper.
    players: [makePlayer(0, false), makePlayer(1, true)],
    ball: { x: 0, y: 0, vx: 0, vy: 0, owner: -1, spin: 0 },
    score: [0, 0],
    phase: 'play',
    phaseT: 0,
    events: [],
  };
  kickoff(state);
  return state;
}

function keeperHomeX(team: 0 | 1): number {
  return team === 1 ? F.right - 26 : F.left + 26;
}

function kickoff(s: GameState): void {
  const midY = (F.top + F.bottom) / 2;
  for (const p of s.players) {
    p.vx = 0; p.vy = 0; p.charge = -1; p.slideT = 0; p.slideCd = 0; p.kickCd = 0;
    p.fx = p.team === 0 ? 1 : -1; p.fy = 0;
    p.y = midY;
    p.x = p.keeper ? keeperHomeX(p.team) : (p.team === 0 ? F.w / 2 - 170 : F.w / 2 + 170);
  }
  s.ball = { x: F.w / 2, y: midY, vx: 0, vy: 0, owner: -1, spin: 0 };
  s.phase = 'play';
  s.phaseT = 0;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Bend a shot towards the opposing goal when it is roughly aimed at it. */
function aimAssist(p: Player): [number, number] {
  const goalX = p.team === 0 ? F.right : F.left;
  const towards = p.team === 0 ? p.fx : -p.fx;
  if (towards < 0.2) return [p.fx, p.fy];
  const hitY = p.y + (p.fy / p.fx) * (goalX - p.x);
  if (hitY < F.goalTop - AIM_ASSIST_MARGIN || hitY > F.goalBottom + AIM_ASSIST_MARGIN) {
    return [p.fx, p.fy];
  }
  const targetY = clamp(hitY, F.goalTop + 22, F.goalBottom - 22);
  const dx = goalX - p.x;
  const dy = targetY - p.y;
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}

function kick(s: GameState, p: Player, dirX: number, dirY: number, speed: number): void {
  const b = s.ball;
  b.owner = -1;
  b.x = p.x + dirX * (PLAYER_R + BALL_R + 2);
  b.y = p.y + dirY * (PLAYER_R + BALL_R + 2);
  b.vx = dirX * speed + p.vx * 0.25;
  b.vy = dirY * speed + p.vy * 0.25;
  p.kickCd = KICK_CD;
  p.charge = -1;
  s.events.push({ type: 'kick', power: speed / KICK_MAX, x: b.x, y: b.y });
}

function updateHuman(s: GameState, idx: number, inp: PlayerInput, dt: number): void {
  const p = s.players[idx];
  const b = s.ball;
  let mx = inp.mx;
  let my = inp.my;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const owns = b.owner === idx;

  p.slideCd = Math.max(0, p.slideCd - dt);
  p.kickCd = Math.max(0, p.kickCd - dt);

  if (p.slideT > 0) {
    p.slideT -= dt;
    // Slide keeps its direction and loses a little speed.
    const k = Math.exp(-1.6 * dt);
    p.vx *= k; p.vy *= k;
  } else {
    if (len > 0.2) { p.fx = mx / len; p.fy = my / len; }
    const top = MAX_SPEED * (p.charge >= 0 ? CHARGE_SLOWDOWN : 1);
    const tx = mx * top;
    const ty = my * top;
    const dvx = tx - p.vx;
    const dvy = ty - p.vy;
    const dv = Math.hypot(dvx, dvy);
    const maxDv = ACCEL * dt;
    if (dv <= maxDv) { p.vx = tx; p.vy = ty; } else { p.vx += (dvx / dv) * maxDv; p.vy += (dvy / dv) * maxDv; }

    // Slide tackle on button press.
    if (inp.slide && !p.prevSlide && p.slideCd <= 0) {
      p.slideT = SLIDE_TIME;
      p.slideCd = SLIDE_CD;
      p.vx = p.fx * SLIDE_SPEED;
      p.vy = p.fy * SLIDE_SPEED;
      p.charge = -1;
      if (owns) kick(s, p, p.fx, p.fy, 520);
      s.events.push({ type: 'slide', x: p.x, y: p.y });
    }
  }

  // Shooting: press to start charging, release (or full charge) to shoot.
  if (s.ball.owner === idx && p.slideT <= 0) {
    if (inp.shoot && !p.prevShoot && p.charge < 0) p.charge = 0;
    if (p.charge >= 0) {
      p.charge += dt;
      if (!inp.shoot || p.charge >= CHARGE_MAX + 0.25) {
        const t = clamp(p.charge / CHARGE_MAX, 0, 1);
        const [dx, dy] = aimAssist(p);
        kick(s, p, dx, dy, KICK_MIN + (KICK_MAX - KICK_MIN) * t);
      }
    }
  } else {
    p.charge = -1;
  }

  p.prevShoot = inp.shoot;
  p.prevSlide = inp.slide;

  p.x = clamp(p.x + p.vx * dt, F.left - 8, F.right + 8);
  p.y = clamp(p.y + p.vy * dt, F.top - 8, F.bottom + 8);
}

function updateKeeper(s: GameState, p: Player, dt: number): void {
  const b = s.ball;
  const home = keeperHomeX(p.team);
  const sign = p.team === 1 ? 1 : -1; // direction the ball travels to reach this goal
  let ty = b.y;
  const approach = b.vx * sign;
  if (approach > 60) {
    const t = ((home - b.x) * sign) / approach;
    if (t > 0 && t < 1.2) ty = b.y + b.vy * t;
  }
  ty = clamp(ty, F.goalTop + 14, F.goalBottom - 14);
  // Step off the line a little when the ball is close.
  const dist = Math.hypot(b.x - home, b.y - p.y);
  const tx = home - sign * 44 * clamp((420 - dist) / 420, 0, 1);

  p.vx = clamp((tx - p.x) * 8, -KEEPER_SPEED, KEEPER_SPEED);
  p.vy = clamp((ty - p.y) * 8, -KEEPER_SPEED, KEEPER_SPEED);
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const fx = b.x - p.x;
  const fy = b.y - p.y;
  const fl = Math.hypot(fx, fy) || 1;
  p.fx = fx / fl; p.fy = fy / fl;
}

function collidePlayerBall(s: GameState, idx: number): void {
  const p = s.players[idx];
  const b = s.ball;
  if (b.owner === idx) return;
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  const d = Math.hypot(dx, dy);
  const reach = PLAYER_R + BALL_R;

  if (p.keeper) {
    if (d >= reach + 2 || s.phase !== 'play') return;
    // The keeper punches the ball back up the pitch.
    const away = p.team === 1 ? -1 : 1;
    let nx = (d > 0 ? dx / d : away) + away * 1.1;
    let ny = d > 0 ? dy / d : 0;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    if (b.owner >= 0) s.players[b.owner].kickCd = 0.45;
    b.owner = -1;
    b.x = p.x + nx * (reach + 3);
    b.y = p.y + ny * (reach + 3);
    b.vx = nx * 520;
    b.vy = ny * 520;
    s.events.push({ type: 'save', x: b.x, y: b.y });
    return;
  }

  if (b.owner >= 0) return;

  // Generous trap: a player touching a free ball takes control of it.
  if (s.phase === 'play' && p.kickCd <= 0 && p.slideT <= 0 && d < reach + 7) {
    b.owner = idx;
    return;
  }

  if (d >= reach || d === 0) return;
  const nx = dx / d;
  const ny = dy / d;
  b.x = p.x + nx * reach;
  b.y = p.y + ny * reach;
  const vn = (b.vx - p.vx) * nx + (b.vy - p.vy) * ny;
  if (vn < 0) {
    b.vx -= 1.5 * vn * nx;
    b.vy -= 1.5 * vn * ny;
    s.events.push({ type: 'kick', power: clamp(-vn / KICK_MAX, 0.2, 1), x: b.x, y: b.y });
  }
}

function collidePost(s: GameState, px: number, py: number): void {
  const b = s.ball;
  const dx = b.x - px;
  const dy = b.y - py;
  const d = Math.hypot(dx, dy);
  const reach = BALL_R + POST_R;
  if (d >= reach || d === 0) return;
  const nx = dx / d;
  const ny = dy / d;
  b.x = px + nx * reach;
  b.y = py + ny * reach;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + WALL_BOUNCE) * vn * nx;
    b.vy -= (1 + WALL_BOUNCE) * vn * ny;
    if (vn < -80) s.events.push({ type: 'bounce', x: b.x, y: b.y });
  }
}

/** Keep the ball inside the pitch and the nets; returns the scoring team or -1. */
function ballWalls(s: GameState): -1 | 0 | 1 {
  const b = s.ball;
  const bounce = (x: number, y: number, speed: number) => {
    if (speed > 80) s.events.push({ type: 'bounce', x, y });
  };

  collidePost(s, F.left, F.goalTop);
  collidePost(s, F.left, F.goalBottom);
  collidePost(s, F.right, F.goalTop);
  collidePost(s, F.right, F.goalBottom);

  if (b.y < F.top + BALL_R) { b.y = F.top + BALL_R; bounce(b.x, b.y, -b.vy); b.vy = Math.abs(b.vy) * WALL_BOUNCE; }
  if (b.y > F.bottom - BALL_R) { b.y = F.bottom - BALL_R; bounce(b.x, b.y, b.vy); b.vy = -Math.abs(b.vy) * WALL_BOUNCE; }

  const inMouth = b.y > F.goalTop && b.y < F.goalBottom;

  // Left end.
  if (b.x < F.left + BALL_R) {
    if (!inMouth && b.x >= F.left - BALL_R) {
      b.x = F.left + BALL_R; bounce(b.x, b.y, -b.vx); b.vx = Math.abs(b.vx) * WALL_BOUNCE;
    } else if (b.x < F.left) {
      // Inside the net.
      if (b.y < F.goalTop + BALL_R) { b.y = F.goalTop + BALL_R; b.vy = Math.abs(b.vy) * NET_BOUNCE; }
      if (b.y > F.goalBottom - BALL_R) { b.y = F.goalBottom - BALL_R; b.vy = -Math.abs(b.vy) * NET_BOUNCE; }
      const back = F.left - F.goalDepth + BALL_R;
      if (b.x < back) { b.x = back; b.vx = Math.abs(b.vx) * NET_BOUNCE; }
      if (b.x < F.left - BALL_R) return 1;
    }
  }

  // Right end.
  if (b.x > F.right - BALL_R) {
    if (!inMouth && b.x <= F.right + BALL_R) {
      b.x = F.right - BALL_R; bounce(b.x, b.y, b.vx); b.vx = -Math.abs(b.vx) * WALL_BOUNCE;
    } else if (b.x > F.right) {
      if (b.y < F.goalTop + BALL_R) { b.y = F.goalTop + BALL_R; b.vy = Math.abs(b.vy) * NET_BOUNCE; }
      if (b.y > F.goalBottom - BALL_R) { b.y = F.goalBottom - BALL_R; b.vy = -Math.abs(b.vy) * NET_BOUNCE; }
      const back = F.right + F.goalDepth - BALL_R;
      if (b.x > back) { b.x = back; b.vx = -Math.abs(b.vx) * NET_BOUNCE; }
      if (b.x > F.right + BALL_R) return 0;
    }
  }
  return -1;
}

/** Advance the match by dt seconds. inputs[i] drives players[i]; keepers ignore theirs. */
export function step(s: GameState, inputs: PlayerInput[], dt: number): void {
  const b = s.ball;

  if (s.phase === 'goal') {
    s.phaseT -= dt;
    if (s.phaseT <= 0) { kickoff(s); return; }
  }

  s.players.forEach((p, i) => {
    if (p.keeper) updateKeeper(s, p, dt);
    else updateHuman(s, i, inputs[i] ?? NO_INPUT, dt);
  });

  if (b.owner >= 0) {
    const p = s.players[b.owner];
    const tx = p.x + p.fx * (PLAYER_R + BALL_R - 1);
    const ty = p.y + p.fy * (PLAYER_R + BALL_R - 1);
    const k = Math.min(1, 20 * dt);
    b.x += (tx - b.x) * k;
    b.y += (ty - b.y) * k;
    b.vx = p.vx; b.vy = p.vy;
  } else {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > BALL_MAX) { b.vx *= BALL_MAX / sp; b.vy *= BALL_MAX / sp; }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // The net swallows the ball so a goal stays in the goal.
    const inNet = b.x < F.left || b.x > F.right;
    const drag = Math.exp(-(inNet ? NET_DRAG : BALL_DRAG) * dt);
    b.vx *= drag; b.vy *= drag;
    if (Math.hypot(b.vx, b.vy) < 6) { b.vx = 0; b.vy = 0; }
  }
  b.spin += (Math.hypot(b.vx, b.vy) / BALL_R) * dt * (b.vx >= 0 ? 1 : -1);

  for (let i = 0; i < s.players.length; i++) collidePlayerBall(s, i);

  const scorer = ballWalls(s);
  if (scorer !== -1 && s.phase === 'play') {
    s.score[scorer] += 1;
    s.phase = 'goal';
    s.phaseT = GOAL_PAUSE;
    if (b.owner >= 0) { b.owner = -1; }
    s.events.push({ type: 'goal', team: scorer, x: b.x, y: b.y });
  }
}
