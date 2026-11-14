// Balance harness: plays whole matches with no browser and prints how often
// goals happen. Run with `node tools/balance.ts` (Node strips the types).
//
// Two measures:
//  - "tout ordi": every player driven by the game's own AI, which says how
//    open the game is in general.
//  - "enfant": one player driven by a clumsy bot that chases the ball and
//    shoots at the goal, which stands in for a child.

import {
  CHARGE_MAX, F, MATCH_TIME, NO_INPUT, STEP, createState, step,
  type Difficulty, type GameState, type PlayerInput, type TeamLineup,
} from '../src/sim.ts';

const CH = { id: 'tigrou', speed: 1, power: 1 };
const LINEUP: TeamLineup = { fwd: CH, def: CH, gk: CH };

function freshAll(difficulty: Difficulty, seed: number): GameState {
  const s = createState(difficulty, LINEUP, LINEUP, seed);
  // Nobody is human: every player uses the game's own AI.
  s.seats = [];
  s.controlled = [];
  return s;
}

/** A clumsy stand-in for a child: run at the ball, then hold the shot. */
function childInput(s: GameState, idx: number, held: { t: number }): PlayerInput {
  const p = s.players[idx];
  const b = s.ball;
  const goalX = F.right;
  const inp: PlayerInput = { ...NO_INPUT };
  if (b.owner === idx) {
    // Carry it forward, and shoot once close enough.
    const close = goalX - p.x < 420;
    inp.mx = close ? 0.3 : 1;
    inp.my = ((F.goalTop + F.goalBottom) / 2 - p.y) / 300;
    if (close) {
      held.t += STEP;
      inp.shoot = held.t < CHARGE_MAX * 0.9;
    } else {
      held.t = 0;
    }
  } else {
    held.t = 0;
    const dx = b.x - p.x;
    const dy = b.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    inp.mx = dx / d;
    inp.my = dy / d;
  }
  return inp;
}

function playAll(difficulty: Difficulty, seed: number): [number, number] {
  const s = freshAll(difficulty, seed);
  for (let i = 0; i < MATCH_TIME * 60 + 600 && s.phase !== 'over'; i++) {
    s.events = [];
    step(s, [], STEP);
  }
  return [s.score[0], s.score[1]];
}

function playChild(difficulty: Difficulty, seed: number): [number, number] {
  const s = createState(difficulty, LINEUP, LINEUP, seed);
  const held = { t: 0 };
  for (let i = 0; i < MATCH_TIME * 60 + 600 && s.phase !== 'over'; i++) {
    s.events = [];
    step(s, [childInput(s, s.controlled[0] ?? 0, held)], STEP);
  }
  return [s.score[0], s.score[1]];
}

const N = Number(process.argv[2] ?? 30);
for (const d of ['easy', 'normal', 'champion'] as Difficulty[]) {
  let a = 0;
  let b = 0;
  let ca = 0;
  let cb = 0;
  let childWins = 0;
  for (let i = 0; i < N; i++) {
    const [x, y] = playAll(d, 1000 + i * 77);
    a += x; b += y;
    const [p, q] = playChild(d, 5000 + i * 131);
    ca += p; cb += q;
    if (p > q) childWins += 1;
  }
  const f = (v: number) => (v / N).toFixed(2);
  console.log(
    `${d.padEnd(9)} tout ordi ${f(a)} - ${f(b)}   |   enfant ${f(ca)} - ${f(cb)}` +
    `   victoires enfant ${Math.round((childWins / N) * 100)}%`,
  );
}
