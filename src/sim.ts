// Pure game simulation: no rendering, no browser APIs.
// The same step() runs on the host device in online play, so everything that
// decides the outcome of a match lives here and only here.

export const F = {
  w: 1280,
  h: 720,
  left: 80,
  right: 1200,
  top: 124,
  bottom: 672,
  goalTop: 318,
  goalBottom: 478,
  goalDepth: 46,
};

export const BALL_R = 11;
export const PLAYER_R = 22;
export const CHARGE_MAX = 0.6;
export const STEP = 1 / 60;
export const MATCH_TIME = 120;

const MAX_SPEED = 275;
const ACCEL = 2300;
const CHARGE_SLOWDOWN = 0.7;
const SLIDE_SPEED = 600;
const SLIDE_TIME = 0.3;
const SLIDE_CD = 0.9;
const KICK_MIN = 600;
const KICK_MAX = 1020;
const KICK_CD = 0.3;
const PASS_TAP = 0.17;
const BALL_DRAG = 0.9;
const BALL_MAX = 1700;
const NET_DRAG = 9;
const WALL_BOUNCE = 0.72;
const NET_BOUNCE = 0.12;
const POST_R = 7;
const KEEPER_SPEED = 205;
const GOAL_PAUSE = 2.6;
const KICKOFF_PAUSE = 1.1;
// How far outside the goal mouth a shot may point and still be bent on target.
const AIM_ASSIST_MARGIN = 150;

// Abilities.
const METER_RATE = 0.028;
const COMEBACK_BONUS = 0.45;
const TURBO_TIME = 3;
const TURBO_MULT = 1.8;
const GIANT_TIME = 4;
const GIANT_MULT = 2.4;
const SUPER_SLIDE_SPEED = 1000;
const SUPER_SLIDE_TIME = 0.5;
const CANNON_SPEED = 1500;
const STUN_TIME = 0.7;
const SUPER_STUN_TIME = 1.5;
const PICKUP_EVERY = 16;
const PICKUP_R = 20;

export type AbilityKind = 'cannon' | 'tackle' | 'turbo' | 'keeper';
export type Difficulty = 'easy' | 'normal' | 'champion';
/** solo: one child vs the computer. coop: two children, same team. versus: one against the other. */
export type MatchMode = 'solo' | 'coop' | 'versus';

/** One human player: which team they are on and which player they start on. */
export interface Seat {
  team: 0 | 1;
  idx: number;
}

export function seatsFor(mode: MatchMode): Seat[] {
  if (mode === 'coop') return [{ team: 0, idx: 0 }, { team: 0, idx: 1 }];
  if (mode === 'versus') return [{ team: 0, idx: 0 }, { team: 1, idx: 3 }];
  return [{ team: 0, idx: 0 }];
}

interface DiffCfg {
  speed: number;
  react: number;
  press: number;
  shootRange: number;
  error: number;
  meter: number;
}

export const DIFFS: Record<Difficulty, DiffCfg> = {
  easy: { speed: 0.74, react: 0.42, press: 170, shootRange: 330, error: 0.34, meter: 0.5 },
  normal: { speed: 0.89, react: 0.24, press: 235, shootRange: 400, error: 0.17, meter: 0.85 },
  champion: { speed: 1.0, react: 0.11, press: 310, shootRange: 470, error: 0.06, meter: 1.15 },
};

export interface PlayerInput {
  mx: number;
  my: number;
  shoot: boolean;
  slide: boolean;
  special: boolean;
}

export const NO_INPUT: PlayerInput = { mx: 0, my: 0, shoot: false, slide: false, special: false };

export interface Player {
  team: 0 | 1;
  keeper: boolean;
  role: 'fwd' | 'def' | 'gk';
  charId: string;
  speedMul: number;
  powerMul: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  /** Seconds the shot has been charged, -1 when not charging. */
  charge: number;
  slideT: number;
  slideCd: number;
  kickCd: number;
  stunT: number;
  turboT: number;
  giantT: number;
  superSlide: boolean;
  prevShoot: boolean;
  prevSlide: boolean;
  prevSpecial: boolean;
  /** AI only: time left before it re-decides. */
  think: number;
  aimErrX: number;
  aimErrY: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: number;
  spin: number;
  /** > 0 while the ball is a flaming cannonball. */
  power: number;
  /** Team of the last player to touch the ball, -1 at kickoff. */
  lastTouch: -1 | 0 | 1;
}

export interface Pickup {
  x: number;
  y: number;
  born: number;
  alive: boolean;
}

export interface TeamState {
  meter: number;
}

export type SimEvent =
  | { type: 'kick'; power: number; x: number; y: number }
  | { type: 'pass'; x: number; y: number }
  | { type: 'bounce'; x: number; y: number }
  | { type: 'save'; x: number; y: number }
  | { type: 'slide'; x: number; y: number }
  | { type: 'stun'; x: number; y: number }
  | { type: 'pickup'; x: number; y: number; team: 0 | 1 }
  | { type: 'ability'; kind: AbilityKind; team: 0 | 1; x: number; y: number }
  | { type: 'ready'; team: 0 | 1 }
  | { type: 'goal'; team: 0 | 1; x: number; y: number }
  | { type: 'whistle' }
  | { type: 'end' };

export type Phase = 'kickoff' | 'play' | 'goal' | 'over';

export interface GameState {
  players: Player[];
  ball: Ball;
  score: [number, number];
  teams: [TeamState, TeamState];
  pickups: Pickup[];
  phase: Phase;
  phaseT: number;
  clock: number;
  time: number;
  difficulty: Difficulty;
  mode: MatchMode;
  seats: Seat[];
  /** Player index each seat is driving, one per seat. */
  controlled: number[];
  /** Which team restarts after the current goal. */
  nextKickoff: 0 | 1;
  events: SimEvent[];
  rng: () => number;
}

// Indices: 0,1 team 0 field - 2 team 0 keeper - 3,4 team 1 field - 5 team 1 keeper.

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface CharStats {
  id: string;
  speed: number;
  power: number;
}

export interface TeamLineup {
  fwd: CharStats;
  def: CharStats;
  gk: CharStats;
}

function makePlayer(team: 0 | 1, role: 'fwd' | 'def' | 'gk', char: CharStats): Player {
  return {
    team, keeper: role === 'gk', role, charId: char.id, speedMul: char.speed, powerMul: char.power,
    x: 0, y: 0, vx: 0, vy: 0, fx: team === 0 ? 1 : -1, fy: 0,
    charge: -1, slideT: 0, slideCd: 0, kickCd: 0, stunT: 0, turboT: 0, giantT: 0, superSlide: false,
    prevShoot: false, prevSlide: false, prevSpecial: false,
    think: 0, aimErrX: 0, aimErrY: 0,
  };
}

export function createState(
  difficulty: Difficulty, home: TeamLineup, away: TeamLineup, seed = 12345, mode: MatchMode = 'solo',
): GameState {
  const seats = seatsFor(mode);
  const s: GameState = {
    players: [
      makePlayer(0, 'fwd', home.fwd), makePlayer(0, 'def', home.def), makePlayer(0, 'gk', home.gk),
      makePlayer(1, 'fwd', away.fwd), makePlayer(1, 'def', away.def), makePlayer(1, 'gk', away.gk),
    ],
    ball: { x: F.w / 2, y: F.h / 2, vx: 0, vy: 0, owner: -1, spin: 0, power: 0, lastTouch: -1 },
    score: [0, 0],
    teams: [{ meter: 0 }, { meter: 0 }],
    pickups: [],
    phase: 'kickoff',
    phaseT: KICKOFF_PAUSE,
    clock: MATCH_TIME,
    time: 0,
    difficulty,
    mode,
    seats,
    controlled: seats.map((seat) => seat.idx),
    nextKickoff: 1,
    events: [],
    rng: makeRng(seed),
  };
  kickoff(s, 1);
  return s;
}

function keeperHomeX(team: 0 | 1): number {
  return team === 1 ? F.right - 26 : F.left + 26;
}

/** +1 when the team shoots at the right-hand goal. */
function attackDir(team: 0 | 1): 1 | -1 {
  return team === 0 ? 1 : -1;
}

function kickoff(s: GameState, withBall: 0 | 1): void {
  const midY = (F.top + F.bottom) / 2;
  for (const p of s.players) {
    p.vx = 0; p.vy = 0; p.charge = -1; p.slideT = 0; p.slideCd = 0; p.kickCd = 0;
    p.stunT = 0; p.turboT = 0; p.giantT = 0; p.superSlide = false; p.think = 0;
    p.fx = attackDir(p.team); p.fy = 0;
    const dir = attackDir(p.team);
    if (p.keeper) {
      p.x = keeperHomeX(p.team);
      p.y = midY;
    } else if (p.role === 'fwd') {
      p.x = F.w / 2 - dir * (p.team === withBall ? 70 : 150);
      p.y = midY + (p.team === 0 ? -70 : 70);
    } else {
      p.x = F.w / 2 - dir * 300;
      p.y = midY + (p.team === 0 ? 90 : -90);
    }
  }
  const starter = s.players.findIndex((p) => p.team === withBall && p.role === 'fwd');
  s.ball = { x: F.w / 2, y: midY, vx: 0, vy: 0, owner: starter, spin: 0, power: 0, lastTouch: withBall };
  s.phase = 'kickoff';
  s.phaseT = KICKOFF_PAUSE;
  s.controlled = s.seats.map((seat) => seat.idx);
}

/** True when a human, rather than the computer, is driving this player. */
export function isControlled(s: GameState, p: Player): boolean {
  return s.controlled.some((i) => s.players[i] === p);
}

function teamSpeed(s: GameState, p: Player): number {
  let v = MAX_SPEED * p.speedMul;
  if (!isControlled(s, p)) {
    if (p.team === 1) v *= DIFFS[s.difficulty].speed;
    v *= 0.93;
  }
  if (p.turboT > 0) v *= TURBO_MULT;
  return v;
}

export function playerRadius(p: Player): number {
  return p.giantT > 0 ? PLAYER_R * GIANT_MULT : PLAYER_R;
}

/** Which ability the super button will trigger for this player, right now. */
export function abilityFor(s: GameState, idx: number): AbilityKind {
  const p = s.players[idx];
  const b = s.ball;
  if (b.owner === idx) return 'cannon';
  const holder = b.owner >= 0 ? s.players[b.owner] : null;
  if (holder !== null && holder.team !== p.team) {
    const d = Math.hypot(holder.x - p.x, holder.y - p.y);
    if (d < 260) return 'tackle';
    const ownGoalX = p.team === 0 ? F.left : F.right;
    if (Math.abs(holder.x - ownGoalX) < 420) return 'keeper';
  }
  return 'turbo';
}

function aimAssist(p: Player, strength = 1): [number, number] {
  const goalX = p.team === 0 ? F.right : F.left;
  const towards = p.team === 0 ? p.fx : -p.fx;
  if (towards < 0.2) return [p.fx, p.fy];
  const hitY = p.y + (p.fy / p.fx) * (goalX - p.x);
  if (hitY < F.goalTop - AIM_ASSIST_MARGIN || hitY > F.goalBottom + AIM_ASSIST_MARGIN) {
    return [p.fx, p.fy];
  }
  const targetY = clamp(hitY, F.goalTop + 22, F.goalBottom - 22);
  const dx = goalX - p.x;
  const dy = (targetY - p.y) * strength + (hitY - p.y) * (1 - strength);
  const d = Math.hypot(dx, dy) || 1;
  return [dx / d, dy / d];
}

/** A child gets the full aim help; the computer only a little. */
function assistFor(s: GameState, p: Player): number {
  if (isControlled(s, p)) return 1;
  return { easy: 0.3, normal: 0.55, champion: 0.8 }[s.difficulty];
}

function kick(s: GameState, idx: number, dirX: number, dirY: number, speed: number, power = 0): void {
  const p = s.players[idx];
  const b = s.ball;
  const r = playerRadius(p);
  b.owner = -1;
  b.lastTouch = p.team;
  b.x = p.x + dirX * (r + BALL_R + 2);
  b.y = p.y + dirY * (r + BALL_R + 2);
  b.vx = dirX * speed + p.vx * 0.25;
  b.vy = dirY * speed + p.vy * 0.25;
  b.power = power;
  p.kickCd = KICK_CD;
  p.charge = -1;
  s.events.push({ type: 'kick', power: clamp(speed / KICK_MAX, 0, 1.5), x: b.x, y: b.y });
}

/** Best teammate to pass to, or -1. */
function passTarget(s: GameState, idx: number): number {
  const p = s.players[idx];
  const dir = attackDir(p.team);
  let best = -1;
  let bestScore = -Infinity;
  s.players.forEach((m, i) => {
    if (i === idx || m.team !== p.team || m.keeper || m.stunT > 0) return;
    const dx = m.x - p.x;
    const dy = m.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 70 || d > 650) return;
    // Prefer teammates ahead of the ball and roughly where the player is facing.
    const facing = (dx / d) * p.fx + (dy / d) * p.fy;
    const score = (dx * dir) / 100 + facing * 2.2 - d / 400;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

function addMeter(s: GameState, team: 0 | 1, amount: number): void {
  const t = s.teams[team];
  if (t.meter >= 1) return;
  t.meter = Math.min(1, t.meter + amount);
  if (t.meter >= 1) s.events.push({ type: 'ready', team });
}

function doPass(s: GameState, idx: number): boolean {
  const t = passTarget(s, idx);
  if (t < 0) return false;
  const m = s.players[t];
  const p = s.players[idx];
  // Lead the pass a little so it arrives in front of a moving teammate.
  const tx = m.x + m.vx * 0.22;
  const ty = m.y + m.vy * 0.22;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy) || 1;
  kick(s, idx, dx / d, dy / d, clamp(d * 2.1, 480, 980));
  s.events.push({ type: 'pass', x: p.x, y: p.y });
  addMeter(s, p.team, 0.05);
  return true;
}

function startSlide(s: GameState, idx: number, superTackle: boolean): void {
  const p = s.players[idx];
  p.slideT = superTackle ? SUPER_SLIDE_TIME : SLIDE_TIME;
  p.slideCd = superTackle ? 0.5 : SLIDE_CD;
  p.superSlide = superTackle;
  p.vx = p.fx * (superTackle ? SUPER_SLIDE_SPEED : SLIDE_SPEED);
  p.vy = p.fy * (superTackle ? SUPER_SLIDE_SPEED : SLIDE_SPEED);
  p.charge = -1;
  if (s.ball.owner === idx) kick(s, idx, p.fx, p.fy, 520);
  s.events.push({ type: 'slide', x: p.x, y: p.y });
}

function useAbility(s: GameState, idx: number): void {
  const p = s.players[idx];
  const kind = abilityFor(s, idx);
  s.teams[p.team].meter = 0;
  s.events.push({ type: 'ability', kind, team: p.team, x: p.x, y: p.y });
  switch (kind) {
    case 'cannon': {
      const [dx, dy] = aimAssist(p, assistFor(s, p));
      kick(s, idx, dx, dy, CANNON_SPEED * p.powerMul, 1);
      break;
    }
    case 'tackle':
      startSlide(s, idx, true);
      break;
    case 'turbo':
      p.turboT = TURBO_TIME;
      break;
    case 'keeper': {
      const gk = s.players.find((q) => q.team === p.team && q.keeper);
      if (gk) gk.giantT = GIANT_TIME;
      break;
    }
  }
}

function updateField(s: GameState, idx: number, inp: PlayerInput, dt: number): void {
  const p = s.players[idx];
  const frozen = s.phase !== 'play';

  p.slideCd = Math.max(0, p.slideCd - dt);
  p.kickCd = Math.max(0, p.kickCd - dt);
  p.turboT = Math.max(0, p.turboT - dt);
  p.giantT = Math.max(0, p.giantT - dt);

  if (p.stunT > 0) {
    p.stunT -= dt;
    const k = Math.exp(-3 * dt);
    p.vx *= k; p.vy *= k;
    p.x = clamp(p.x + p.vx * dt, F.left - 8, F.right + 8);
    p.y = clamp(p.y + p.vy * dt, F.top - 8, F.bottom + 8);
    p.prevShoot = inp.shoot; p.prevSlide = inp.slide; p.prevSpecial = inp.special;
    return;
  }

  let mx = frozen ? 0 : inp.mx;
  let my = frozen ? 0 : inp.my;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }

  if (p.slideT > 0) {
    p.slideT -= dt;
    const k = Math.exp(-1.6 * dt);
    p.vx *= k; p.vy *= k;
    if (p.slideT <= 0) p.superSlide = false;
  } else {
    if (len > 0.2) { p.fx = mx / len; p.fy = my / len; }
    const top = teamSpeed(s, p) * (p.charge >= 0 ? CHARGE_SLOWDOWN : 1);
    const tx = mx * top;
    const ty = my * top;
    const dvx = tx - p.vx;
    const dvy = ty - p.vy;
    const dv = Math.hypot(dvx, dvy);
    const maxDv = ACCEL * dt;
    if (dv <= maxDv) { p.vx = tx; p.vy = ty; } else { p.vx += (dvx / dv) * maxDv; p.vy += (dvy / dv) * maxDv; }

    if (!frozen && inp.slide && !p.prevSlide && p.slideCd <= 0) startSlide(s, idx, false);
  }

  if (!frozen && inp.special && !p.prevSpecial && s.teams[p.team].meter >= 1 && p.slideT <= 0) {
    useAbility(s, idx);
  }

  // Shoot: tap to pass, hold to shoot harder.
  if (s.ball.owner === idx && p.slideT <= 0 && !frozen) {
    if (inp.shoot && !p.prevShoot && p.charge < 0) p.charge = 0;
    if (p.charge >= 0) {
      p.charge += dt;
      if (!inp.shoot || p.charge >= CHARGE_MAX + 0.25) {
        if (!(p.charge < PASS_TAP && doPass(s, idx))) {
          const t = clamp(p.charge / CHARGE_MAX, 0, 1);
          const [dx, dy] = aimAssist(p, assistFor(s, p));
          kick(s, idx, dx, dy, (KICK_MIN + (KICK_MAX - KICK_MIN) * t) * p.powerMul);
        }
      }
    }
  } else if (s.ball.owner !== idx) {
    p.charge = -1;
  }

  p.prevShoot = inp.shoot;
  p.prevSlide = inp.slide;
  p.prevSpecial = inp.special;

  p.x = clamp(p.x + p.vx * dt, F.left - 8, F.right + 8);
  p.y = clamp(p.y + p.vy * dt, F.top - 8, F.bottom + 8);
}

function updateKeeper(s: GameState, idx: number, dt: number): void {
  const p = s.players[idx];
  const b = s.ball;
  p.giantT = Math.max(0, p.giantT - dt);
  if (p.stunT > 0) { p.stunT -= dt; return; }

  const home = keeperHomeX(p.team);
  const sign = p.team === 1 ? 1 : -1;
  let ty = b.y;
  const approach = b.vx * sign;
  if (approach > 60) {
    const t = ((home - b.x) * sign) / approach;
    if (t > 0 && t < 1.2) ty = b.y + b.vy * t;
  }
  ty = clamp(ty, F.goalTop + 14, F.goalBottom - 14);
  const dist = Math.hypot(b.x - home, b.y - p.y);
  const tx = home - sign * 44 * clamp((420 - dist) / 420, 0, 1);
  const diffMul = p.team === 1 ? DIFFS[s.difficulty].speed : 1;
  const speed = s.phase === 'play' ? KEEPER_SPEED * diffMul : 0;

  p.vx = clamp((tx - p.x) * 8, -speed, speed);
  p.vy = clamp((ty - p.y) * 8, -speed, speed);
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const fx = b.x - p.x;
  const fy = b.y - p.y;
  const fl = Math.hypot(fx, fy) || 1;
  p.fx = fx / fl; p.fy = fy / fl;
}

function stun(s: GameState, p: Player, vx: number, vy: number, long = false): void {
  p.stunT = long ? SUPER_STUN_TIME : STUN_TIME;
  p.vx = vx;
  p.vy = vy;
  p.slideT = 0;
  p.superSlide = false;
  p.charge = -1;
  s.events.push({ type: 'stun', x: p.x, y: p.y });
}

function collidePlayers(s: GameState): void {
  for (let i = 0; i < s.players.length; i++) {
    for (let j = i + 1; j < s.players.length; j++) {
      const a = s.players[i];
      const b = s.players[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = playerRadius(a) + playerRadius(b);
      if (d >= min || d === 0) continue;
      const nx = dx / d;
      const ny = dy / d;

      // A slide tackle from an opponent knocks the other player over.
      const tackle = (attIdx: number, vicIdx: number): boolean => {
        const att = s.players[attIdx];
        const vic = s.players[vicIdx];
        if (att.slideT <= 0 || att.team === vic.team || vic.stunT > 0 || vic.keeper) return false;
        if (!att.superSlide) {
          if (vic.slideT > 0) return false;
          const onBall = s.ball.owner === vicIdx || Math.hypot(s.ball.x - vic.x, s.ball.y - vic.y) < 55;
          if (!onBall) return false;
        }
        const sp = att.superSlide ? 760 : 380;
        const away = vicIdx === j ? 1 : -1;
        stun(s, vic, nx * sp * away, ny * sp * away, att.superSlide);
        if (s.ball.owner === vicIdx) {
          s.ball.owner = -1;
          s.ball.vx = nx * 300 * away;
          s.ball.vy = ny * 300 * away;
          att.kickCd = 0;
        }
        if (!att.superSlide) addMeter(s, att.team, 0.09);
        return true;
      };
      if (!tackle(i, j)) tackle(j, i);

      // Simple separation so nobody overlaps.
      const push = (min - d) / 2;
      const aStuck = a.stunT > 0 ? 0.25 : 1;
      const bStuck = b.stunT > 0 ? 0.25 : 1;
      a.x -= nx * push * aStuck; a.y -= ny * push * aStuck;
      b.x += nx * push * bStuck; b.y += ny * push * bStuck;
    }
  }
}

function collidePlayerBall(s: GameState, idx: number): void {
  const p = s.players[idx];
  const b = s.ball;
  if (b.owner === idx) return;
  const r = playerRadius(p);
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  const d = Math.hypot(dx, dy);
  const reach = r + BALL_R;

  // A flaming cannonball bowls over anyone in its way.
  if (b.power > 0.3 && d < reach + 4 && p.team !== b.lastTouch) {
    if (p.keeper && p.giantT > 0) {
      b.power = 0; // A giant keeper stops even the cannonball.
    } else {
      const sp = Math.hypot(b.vx, b.vy) || 1;
      stun(s, p, (b.vx / sp) * 520, (b.vy / sp) * 520, true);
      b.power *= 0.75;
      b.vx *= 0.92; b.vy *= 0.92;
      return;
    }
  }

  if (p.stunT > 0) return;

  if (p.keeper) {
    if (d >= reach + 2 || s.phase !== 'play') return;
    const away = p.team === 1 ? -1 : 1;
    let nx = (d > 0 ? dx / d : away) + away * 1.1;
    let ny = d > 0 ? dy / d : 0;
    const nl = Math.hypot(nx, ny) || 1;
    nx /= nl; ny /= nl;
    if (b.owner >= 0) s.players[b.owner].kickCd = 0.45;
    b.owner = -1;
    b.power = 0;
    b.lastTouch = p.team;
    b.x = p.x + nx * (reach + 3);
    b.y = p.y + ny * (reach + 3);
    b.vx = nx * 560;
    b.vy = ny * 560;
    s.events.push({ type: 'save', x: b.x, y: b.y });
    addMeter(s, p.team, 0.12);
    return;
  }

  if (b.owner >= 0) return;

  // Generous trap: a player touching a free ball takes control of it.
  if (s.phase === 'play' && p.kickCd <= 0 && p.slideT <= 0 && b.power <= 0.3 && d < reach + 7) {
    const stolen = b.lastTouch >= 0 && b.lastTouch !== p.team;
    b.owner = idx;
    b.power = 0;
    b.lastTouch = p.team;
    if (stolen) addMeter(s, p.team, 0.07);
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
    b.lastTouch = p.team;
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
    b.power = 0;
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

  if (b.x < F.left + BALL_R) {
    if (!inMouth && b.x >= F.left - BALL_R) {
      b.x = F.left + BALL_R; bounce(b.x, b.y, -b.vx); b.vx = Math.abs(b.vx) * WALL_BOUNCE;
    } else if (b.x < F.left) {
      if (b.y < F.goalTop + BALL_R) { b.y = F.goalTop + BALL_R; b.vy = Math.abs(b.vy) * NET_BOUNCE; }
      if (b.y > F.goalBottom - BALL_R) { b.y = F.goalBottom - BALL_R; b.vy = -Math.abs(b.vy) * NET_BOUNCE; }
      const back = F.left - F.goalDepth + BALL_R;
      if (b.x < back) { b.x = back; b.vx = Math.abs(b.vx) * NET_BOUNCE; }
      if (b.x < F.left - BALL_R) return 1;
    }
  }

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

// ------------------------------------------------------------------ the AI

function homeSpot(s: GameState, p: Player): [number, number] {
  const b = s.ball;
  const dir = attackDir(p.team);
  const midY = (F.top + F.bottom) / 2;
  if (p.role === 'fwd') {
    return [
      clamp(b.x + dir * 150, F.left + 150, F.right - 150),
      clamp(b.y + (b.y > midY ? -110 : 110), F.top + 60, F.bottom - 60),
    ];
  }
  return [
    clamp(b.x - dir * 190, F.left + 110, F.right - 110),
    clamp((b.y + midY) / 2, F.top + 70, F.bottom - 70),
  ];
}

function nearestTo(s: GameState, team: 0 | 1, x: number, y: number, taken?: Set<number>): number {
  let best = -1;
  let bd = Infinity;
  s.players.forEach((p, i) => {
    if (p.team !== team || p.keeper || taken?.has(i)) return;
    const d = Math.hypot(p.x - x, p.y - y) + (p.stunT > 0 ? 400 : 0);
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

function aiInput(s: GameState, idx: number, dt: number): PlayerInput {
  /** True about `perSecond` times a second. */
  const chance = (perSecond: number) => s.rng() < perSecond * dt;
  const p = s.players[idx];
  const b = s.ball;
  const cfg = DIFFS[s.difficulty];
  const dir = attackDir(p.team);
  const goalX = p.team === 0 ? F.right : F.left;
  const inp: PlayerInput = { mx: 0, my: 0, shoot: false, slide: false, special: false };

  p.think -= dt;
  if (p.think <= 0) {
    p.think = cfg.react * (0.6 + s.rng() * 0.8);
    p.aimErrX = (s.rng() - 0.5) * cfg.error * 300;
    p.aimErrY = (s.rng() - 0.5) * cfg.error * 300;
  }

  const chaser = nearestTo(s, p.team, b.x, b.y);
  const holder = b.owner >= 0 ? s.players[b.owner] : null;
  const weHaveIt = holder !== null && holder.team === p.team;

  let tx: number;
  let ty: number;

  if (b.owner === idx) {
    const goalDist = Math.abs(goalX - p.x);
    let pressure = Infinity;
    s.players.forEach((q) => {
      if (q.team === p.team || q.keeper) return;
      pressure = Math.min(pressure, Math.hypot(q.x - p.x, q.y - p.y));
    });

    tx = goalX;
    ty = clamp(b.y, F.goalTop + 30, F.goalBottom - 30) + p.aimErrY * 0.4;

    if (goalDist < cfg.shootRange && Math.abs(p.y - (F.top + F.bottom) / 2) < 280) {
      inp.shoot = true;
      if (s.teams[p.team].meter >= 1 && goalDist < cfg.shootRange * 0.85 && chance(1.2)) inp.special = true;
    } else if (pressure < 130 && chance(1.5)) {
      // Quick tap: a pass.
      if (passTarget(s, idx) >= 0) { inp.shoot = p.charge < 0; }
    }
  } else if (weHaveIt) {
    [tx, ty] = homeSpot(s, p);
    tx += p.aimErrX * 0.2;
    ty += p.aimErrY * 0.2;
  } else if (idx === chaser) {
    tx = b.x + b.vx * 0.12 + p.aimErrX * 0.35;
    ty = b.y + b.vy * 0.12 + p.aimErrY * 0.35;
    if (holder && holder.team !== p.team) {
      const d = Math.hypot(holder.x - p.x, holder.y - p.y);
      if (d < 72 && p.slideCd <= 0 && chance(0.45)) inp.slide = true;
      if (d < cfg.press && s.teams[p.team].meter >= 1 && chance(0.6)) inp.special = true;
    }
  } else {
    [tx, ty] = homeSpot(s, p);
    tx -= dir * 60;
  }

  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d > 6) {
    const m = Math.min(1, d / 90);
    inp.mx = (dx / d) * m;
    inp.my = (dy / d) * m;
  }
  // Release a charged shot once it is strong enough.
  if (inp.shoot && p.charge > CHARGE_MAX * (0.55 + s.rng() * 0.45)) inp.shoot = false;
  return inp;
}

/** Hand each human the team-mate who should be theirs right now. */
function pickControlled(s: GameState): void {
  const b = s.ball;
  const taken = new Set<number>();
  s.seats.forEach((seat, i) => {
    const cur = s.controlled[i];
    // Whoever has the ball keeps it.
    if (b.owner >= 0 && !taken.has(b.owner)) {
      const holder = s.players[b.owner];
      if (holder.team === seat.team && !holder.keeper) {
        s.controlled[i] = b.owner;
        taken.add(b.owner);
        return;
      }
    }
    const near = nearestTo(s, seat.team, b.x, b.y, taken);
    if (near < 0) { taken.add(cur); return; }
    if (taken.has(cur)) {
      s.controlled[i] = near;
    } else if (near !== cur) {
      // Hysteresis: only switch when the other player is clearly closer.
      const curP = s.players[cur];
      const dCur = Math.hypot(curP.x - b.x, curP.y - b.y) + (curP.stunT > 0 ? 500 : 0);
      const dNew = Math.hypot(s.players[near].x - b.x, s.players[near].y - b.y);
      if (dNew < dCur - 60) s.controlled[i] = near;
    }
    taken.add(s.controlled[i]);
  });
}

function updatePickups(s: GameState): void {
  if (s.phase !== 'play') return;
  const none = !s.pickups.some((p) => p.alive);
  const last = s.pickups.length ? s.pickups[s.pickups.length - 1].born : -PICKUP_EVERY;
  if (none && s.time > 5 && s.time - last > PICKUP_EVERY) {
    s.pickups.push({
      x: F.left + 180 + s.rng() * (F.right - F.left - 360),
      y: F.top + 70 + s.rng() * (F.bottom - F.top - 140),
      born: s.time,
      alive: true,
    });
  }
  for (const pk of s.pickups) {
    if (!pk.alive) continue;
    for (const p of s.players) {
      if (p.keeper || p.stunT > 0) continue;
      if (Math.hypot(p.x - pk.x, p.y - pk.y) < playerRadius(p) + PICKUP_R) {
        pk.alive = false;
        s.teams[p.team].meter = 1;
        s.events.push({ type: 'pickup', x: pk.x, y: pk.y, team: p.team });
        s.events.push({ type: 'ready', team: p.team });
        break;
      }
    }
  }
  if (s.pickups.length > 8) s.pickups.splice(0, s.pickups.length - 8);
}

/** Advance the match by dt seconds. inputs[i] drives the player of seat i. */
export function step(s: GameState, inputs: PlayerInput[], dt: number): void {
  const b = s.ball;
  if (s.phase === 'over') return;
  s.time += dt;

  if (s.phase === 'goal' || s.phase === 'kickoff') {
    s.phaseT -= dt;
    if (s.phaseT <= 0) {
      if (s.phase === 'goal') {
        kickoff(s, s.nextKickoff);
      } else {
        s.phase = 'play';
        s.events.push({ type: 'whistle' });
      }
    }
  }

  if (s.phase === 'play') {
    s.clock -= dt;
    // The gauge fills as you play; the team behind fills a little faster.
    for (const t of [0, 1] as const) {
      const behind = s.score[t] < s.score[1 - t];
      const rate = METER_RATE * (t === 1 ? DIFFS[s.difficulty].meter : 1) * (behind ? 1 + COMEBACK_BONUS : 1);
      addMeter(s, t, rate * dt);
    }
    if (s.clock <= 0) {
      s.clock = 0;
      s.phase = 'over';
      s.events.push({ type: 'end' });
      return;
    }
  }

  pickControlled(s);

  s.players.forEach((p, i) => {
    if (p.keeper) { updateKeeper(s, i, dt); return; }
    const seat = s.controlled.indexOf(i);
    updateField(s, i, seat >= 0 ? (inputs[seat] ?? NO_INPUT) : aiInput(s, i, dt), dt);
  });

  if (b.owner >= 0) {
    const p = s.players[b.owner];
    if (p.stunT > 0) {
      b.owner = -1;
    } else {
      const r = playerRadius(p);
      const tx = p.x + p.fx * (r + BALL_R - 1);
      const ty = p.y + p.fy * (r + BALL_R - 1);
      const k = Math.min(1, 20 * dt);
      b.x += (tx - b.x) * k;
      b.y += (ty - b.y) * k;
      b.vx = p.vx; b.vy = p.vy;
      if (s.phase === 'play' && Math.hypot(p.vx, p.vy) > 60) addMeter(s, p.team, 0.02 * dt);
    }
  }
  if (b.owner < 0) {
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > BALL_MAX) { b.vx *= BALL_MAX / sp; b.vy *= BALL_MAX / sp; }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const inNet = b.x < F.left || b.x > F.right;
    const drag = Math.exp(-(inNet ? NET_DRAG : BALL_DRAG) * dt);
    b.vx *= drag; b.vy *= drag;
    if (Math.hypot(b.vx, b.vy) < 6) { b.vx = 0; b.vy = 0; }
    if (b.power > 0) {
      b.power -= dt * 0.5;
      if (Math.hypot(b.vx, b.vy) < 700 || b.power < 0) b.power = 0;
    }
  }
  b.spin += (Math.hypot(b.vx, b.vy) / BALL_R) * dt * (b.vx >= 0 ? 1 : -1);

  collidePlayers(s);
  for (let i = 0; i < s.players.length; i++) collidePlayerBall(s, i);
  updatePickups(s);

  const scorer = ballWalls(s);
  if (scorer !== -1 && s.phase === 'play') {
    s.score[scorer] += 1;
    s.phase = 'goal';
    s.phaseT = GOAL_PAUSE;
    s.nextKickoff = (1 - scorer) as 0 | 1;
    b.owner = -1;
    b.power = 0;
    s.events.push({ type: 'goal', team: scorer, x: b.x, y: b.y });
  }
}
