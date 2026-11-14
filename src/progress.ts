// Progression: golden balls earned every match, and levels.
// Rules (docs/PROGRESSION.md): nothing is ever lost, every match pays, and
// none of it makes a player stronger against a friend.
//
// The match rules (sim.ts) never read this file: the host stays the only
// judge of a match. This is only what the device remembers about its owner.

const KEY = 'bm-progress';

export const BALLS_PER_LEVEL = 60;
export const MAX_LEVEL = 30;

export interface Progress {
  v: 1;
  balls: number;
  matches: number;
  wins: number;
  goals: number;
  /** Local date of the last match played, for the once-a-day bonus. */
  lastDay: string;
}

function empty(): Progress {
  return { v: 1, balls: 0, matches: 0, wins: 0, goals: 0, lastDay: '' };
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function levelFor(balls: number): number {
  return Math.min(MAX_LEVEL, 1 + Math.floor(balls / BALLS_PER_LEVEL));
}

/** How far along the current level, 0..1 (full once the last level is reached). */
export function levelRatio(balls: number): number {
  if (levelFor(balls) >= MAX_LEVEL) return 1;
  return (balls % BALLS_PER_LEVEL) / BALLS_PER_LEVEL;
}

export function ballsToNext(balls: number): number {
  if (levelFor(balls) >= MAX_LEVEL) return 0;
  return BALLS_PER_LEVEL - (balls % BALLS_PER_LEVEL);
}

export function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const p = JSON.parse(raw) as Partial<Progress>;
    // Anything missing or odd falls back to a sane value: a child's collection
    // must survive a format change, never be wiped by it.
    return {
      v: 1,
      balls: Math.max(0, Math.floor(Number(p.balls) || 0)),
      matches: Math.max(0, Math.floor(Number(p.matches) || 0)),
      wins: Math.max(0, Math.floor(Number(p.wins) || 0)),
      goals: Math.max(0, Math.floor(Number(p.goals) || 0)),
      lastDay: typeof p.lastDay === 'string' ? p.lastDay : '',
    };
  } catch {
    return empty();
  }
}

export function save(p: Progress): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Private browsing or no room: the level still shows for this session.
  }
}

// ------------------------------------------------------------------ a match

export interface MatchTally {
  result: 'win' | 'draw' | 'lose';
  /** Goals scored by the player's own team. */
  goals: number;
  /** Of those, the ones blasted in with the cannon. */
  cannonGoals: number;
  /** Saves made by the player's own keeper. */
  saves: number;
}

export interface RewardLine {
  icon: string;
  label: string;
  balls: number;
}

export interface Reward {
  lines: RewardLine[];
  total: number;
  before: number;
  after: number;
  levelBefore: number;
  levelAfter: number;
  levelUp: boolean;
}

export const PAY = {
  played: 3,
  win: 5,
  draw: 3,
  goal: 2,
  cannonGoal: 1,
  save: 1,
  firstOfDay: 5,
};

/** Works out what a match is worth. Never negative, never zero. */
export function rewardFor(t: MatchTally, p: Progress): Reward {
  const lines: RewardLine[] = [{ icon: '⚽', label: 'Partie jouée', balls: PAY.played }];
  if (t.result === 'win') lines.push({ icon: '🏆', label: 'Victoire !', balls: PAY.win });
  else if (t.result === 'draw') lines.push({ icon: '🤝', label: 'Égalité', balls: PAY.draw });
  if (t.goals > 0) {
    lines.push({ icon: '🥅', label: t.goals > 1 ? `${t.goals} buts` : '1 but', balls: t.goals * PAY.goal });
  }
  if (t.cannonGoals > 0) {
    lines.push({
      icon: '💣',
      label: t.cannonGoals > 1 ? `${t.cannonGoals} buts au canon` : 'But au canon',
      balls: t.cannonGoals * PAY.cannonGoal,
    });
  }
  if (t.saves > 0) {
    lines.push({
      icon: '🧤',
      label: t.saves > 1 ? `${t.saves} arrêts du gardien` : 'Arrêt du gardien',
      balls: t.saves * PAY.save,
    });
  }
  if (p.lastDay !== today()) {
    lines.push({ icon: '🌞', label: 'Première partie du jour', balls: PAY.firstOfDay });
  }
  const total = lines.reduce((n, l) => n + l.balls, 0);
  const before = p.balls;
  const after = before + total;
  return {
    lines, total, before, after,
    levelBefore: levelFor(before),
    levelAfter: levelFor(after),
    levelUp: levelFor(after) > levelFor(before),
  };
}

/** Works out the reward, writes it down, and hands it back for the screen. */
export function finishMatch(t: MatchTally): Reward {
  const p = load();
  const r = rewardFor(t, p);
  p.balls = r.after;
  p.matches += 1;
  if (t.result === 'win') p.wins += 1;
  p.goals += t.goals;
  p.lastDay = today();
  save(p);
  return r;
}

/** Used by the tests, and by a future "start over" button. */
export function reset(): void {
  save(empty());
}
