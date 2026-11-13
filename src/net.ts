// Two phones talk to each other directly (WebRTC, through PeerJS's free broker).
// The host runs the match and is the referee; the guest sends its buttons and
// draws what the host sends back. No account, no server of ours, no data kept.

import Peer, { type DataConnection } from 'peerjs';
import type { Difficulty, GameState, MatchMode, PlayerInput, SimEvent, TeamLineup } from './sim';
import { NO_INPUT } from './sim';

/** No I, O, 0 or 1: they are read wrong out loud. */
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 4;
const PREFIX = 'bouskimatch-v1-';

export function randomCode(): string {
  let c = '';
  for (let i = 0; i < CODE_LEN; i++) c += CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)];
  return c;
}

export function normaliseCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LEN);
}

export interface StartMsg {
  t: 'start';
  difficulty: Difficulty;
  mode: MatchMode;
  seed: number;
  home: TeamLineup;
  away: TeamLineup;
}

type Msg =
  | { t: 'hello'; charId: string }
  | StartMsg
  | { t: 'snap'; d: number[]; ev: SimEvent[] }
  | { t: 'in'; d: number[] }
  | { t: 'bye' };

// ------------------------------------------------------------- snapshots

const PHASES: GameState['phase'][] = ['kickoff', 'play', 'goal', 'over'];
const r1 = (v: number) => Math.round(v * 10) / 10;

/** Everything that changes during a match, as a flat list of numbers. */
export function encodeSnapshot(s: GameState): number[] {
  const d: number[] = [
    PHASES.indexOf(s.phase), r1(s.phaseT), r1(s.clock),
    s.score[0], s.score[1],
    r1(s.teams[0].meter * 100), r1(s.teams[1].meter * 100),
    r1(s.ball.x), r1(s.ball.y), r1(s.ball.spin * 100), r1(s.ball.power * 100), s.ball.owner,
    s.controlled.length,
  ];
  for (const c of s.controlled) d.push(c);
  const alive = s.pickups.filter((p) => p.alive);
  d.push(alive.length);
  for (const p of alive) d.push(r1(p.x), r1(p.y));
  for (const p of s.players) {
    d.push(
      r1(p.x), r1(p.y), r1(p.fx * 100), r1(p.fy * 100),
      r1(p.charge * 100), r1(p.slideT * 100), r1(p.stunT * 100),
      r1(p.turboT * 100), r1(p.giantT * 100), p.superSlide ? 1 : 0,
    );
  }
  return d;
}

export interface Snapshot {
  phase: GameState['phase'];
  phaseT: number;
  clock: number;
  score: [number, number];
  meters: [number, number];
  ball: { x: number; y: number; spin: number; power: number; owner: number };
  controlled: number[];
  pickups: { x: number; y: number }[];
  players: {
    x: number; y: number; fx: number; fy: number;
    charge: number; slideT: number; stunT: number; turboT: number; giantT: number; superSlide: boolean;
  }[];
}

export function decodeSnapshot(d: number[]): Snapshot {
  let i = 0;
  const next = () => d[i++];
  const snap: Snapshot = {
    phase: PHASES[next()] ?? 'play',
    phaseT: next(),
    clock: next(),
    score: [next(), next()],
    meters: [next() / 100, next() / 100],
    ball: { x: next(), y: next(), spin: next() / 100, power: next() / 100, owner: next() },
    controlled: [],
    pickups: [],
    players: [],
  };
  const nc = next();
  for (let k = 0; k < nc; k++) snap.controlled.push(next());
  const np = next();
  for (let k = 0; k < np; k++) snap.pickups.push({ x: next(), y: next() });
  while (i < d.length) {
    snap.players.push({
      x: next(), y: next(), fx: next() / 100, fy: next() / 100,
      charge: next() / 100, slideT: next() / 100, stunT: next() / 100,
      turboT: next() / 100, giantT: next() / 100, superSlide: next() === 1,
    });
  }
  return snap;
}

export function encodeInput(inp: PlayerInput): number[] {
  return [
    Math.round(inp.mx * 100), Math.round(inp.my * 100),
    (inp.shoot ? 1 : 0) | (inp.slide ? 2 : 0) | (inp.special ? 4 : 0),
  ];
}

export function decodeInput(d: number[]): PlayerInput {
  if (!d || d.length < 3) return NO_INPUT;
  return { mx: d[0] / 100, my: d[1] / 100, shoot: !!(d[2] & 1), slide: !!(d[2] & 2), special: !!(d[2] & 4) };
}

/**
 * Draw the guest a little behind the newest snapshot and slide between the two
 * around that moment, so movement stays smooth instead of jumping 30 times a second.
 */
export const INTERP_DELAY = 90;

export class SnapshotBuffer {
  private buf: { t: number; s: Snapshot }[] = [];

  push(s: Snapshot): void {
    this.buf.push({ t: performance.now(), s });
    if (this.buf.length > 20) this.buf.shift();
  }

  get latest(): Snapshot | null {
    return this.buf.length ? this.buf[this.buf.length - 1].s : null;
  }

  /** The two snapshots around the drawing moment, plus how far between them we are. */
  sample(): { a: Snapshot; b: Snapshot; k: number } | null {
    if (!this.buf.length) return null;
    const target = performance.now() - INTERP_DELAY;
    if (this.buf.length === 1 || target >= this.buf[this.buf.length - 1].t) {
      const s = this.buf[this.buf.length - 1].s;
      return { a: s, b: s, k: 0 };
    }
    for (let i = this.buf.length - 2; i >= 0; i--) {
      if (this.buf[i].t <= target) {
        const a = this.buf[i];
        const b = this.buf[i + 1];
        const span = b.t - a.t || 1;
        return { a: a.s, b: b.s, k: Math.min(1, Math.max(0, (target - a.t) / span)) };
      }
    }
    const s = this.buf[0].s;
    return { a: s, b: s, k: 0 };
  }
}

// ----------------------------------------------------------- connections

export type NetStatus = 'idle' | 'opening' | 'waiting' | 'connecting' | 'connected' | 'closed' | 'error';

/** What went wrong, in terms the game can turn into a sentence for a child. */
export type NetError = 'no-such-game' | 'code-taken' | 'offline' | 'other';

export interface NetHandlers {
  onStatus?: (status: NetStatus, error?: NetError) => void;
  onStart?: (msg: StartMsg) => void;
  onHello?: (charId: string) => void;
  onSnapshot?: (snap: Snapshot, events: SimEvent[]) => void;
  onInput?: (inp: PlayerInput) => void;
  onPeerLeft?: () => void;
}

/** Shared plumbing for both ends of the link. */
class Link {
  protected peer: Peer | null = null;
  protected conn: DataConnection | null = null;
  protected closed = false;

  constructor(protected h: NetHandlers) {}

  /** Hand the link over to another screen (the lobby, then the match). */
  setHandlers(h: NetHandlers): void {
    this.h = h;
  }

  protected status(s: NetStatus, error?: NetError): void {
    if (!this.closed || s === 'closed') this.h.onStatus?.(s, error);
  }

  protected classify(e: unknown): NetError {
    const type = (e as { type?: string }).type ?? '';
    if (type === 'peer-unavailable') return 'no-such-game';
    if (type === 'unavailable-id') return 'code-taken';
    if (type === 'network' || type === 'disconnected' || type === 'server-error') return 'offline';
    return 'other';
  }

  protected bind(conn: DataConnection): void {
    this.conn = conn;
    conn.on('open', () => this.status('connected'));
    conn.on('data', (raw) => this.receive(raw as Msg));
    conn.on('close', () => { if (!this.closed) { this.h.onPeerLeft?.(); this.status('closed'); } });
    conn.on('error', () => { if (!this.closed) { this.h.onPeerLeft?.(); this.status('closed'); } });
  }

  private receive(m: Msg): void {
    if (!m || typeof m !== 'object') return;
    switch (m.t) {
      case 'hello': this.h.onHello?.(m.charId); break;
      case 'start': this.h.onStart?.(m); break;
      case 'snap': this.h.onSnapshot?.(decodeSnapshot(m.d), m.ev ?? []); break;
      case 'in': this.h.onInput?.(decodeInput(m.d)); break;
      case 'bye': this.h.onPeerLeft?.(); this.status('closed'); break;
    }
  }

  protected post(m: Msg): void {
    if (this.conn && this.conn.open) {
      try { this.conn.send(m); } catch { /* the link will report it */ }
    }
  }

  get ready(): boolean {
    return !!this.conn && this.conn.open;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.post({ t: 'bye' });
    try { this.conn?.close(); } catch { /* already gone */ }
    try { this.peer?.destroy(); } catch { /* already gone */ }
    this.conn = null;
    this.peer = null;
  }
}

export class HostLink extends Link {
  readonly code: string;

  constructor(handlers: NetHandlers, code = randomCode()) {
    super(handlers);
    this.code = code;
    this.status('opening');
    this.peer = new Peer(PREFIX + code, { debug: 0 });
    this.peer.on('open', () => this.status('waiting'));
    this.peer.on('connection', (conn) => {
      if (this.conn) { conn.close(); return; } // one guest at a time
      this.bind(conn);
    });
    this.peer.on('error', (e) => {
      // Someone already has this code: take another one and carry on.
      if (this.classify(e) === 'code-taken' && this.onCodeTaken) {
        this.onCodeTaken();
        return;
      }
      this.status('error', this.classify(e));
    });
  }

  /** Set by the lobby, to reopen with a fresh code. */
  onCodeTaken?: () => void;

  sendStart(msg: Omit<StartMsg, 't'>): void {
    this.post({ t: 'start', ...msg });
  }

  sendSnapshot(state: GameState, events: SimEvent[]): void {
    this.post({ t: 'snap', d: encodeSnapshot(state), ev: events });
  }
}

export class GuestLink extends Link {
  constructor(handlers: NetHandlers, readonly code: string, private charId = 'tigrou') {
    super(handlers);
    this.status('opening');
    this.peer = new Peer({ debug: 0 });
    this.peer.on('open', () => {
      this.status('connecting');
      const conn = this.peer!.connect(PREFIX + code, { reliable: true });
      this.bind(conn);
      conn.on('open', () => this.post({ t: 'hello', charId: this.charId }));
    });
    this.peer.on('error', (e) => this.status('error', this.classify(e)));
  }

  sendInput(inp: PlayerInput): void {
    this.post({ t: 'in', d: encodeInput(inp) });
  }
}
